import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js'
import { BIOME_PARAMS } from '../../config/chunk-config.js'
import { RNG } from '../../tools/rng.js'
import { BIOMES } from './biome-config.js'
import { validateBiomeDefinitions } from './biome-terrain-profile.js'

const UINT32_RANGE = 0x100000000
const PARAM_NAMES = Object.keys(BIOME_PARAMS)
const BIOME_IDS = Object.values(BIOMES)
  .map(biome => biome.id)
  .sort((first, second) => first.localeCompare(second))
const BIOME_INDEX_BY_ID = Object.fromEntries(
  BIOME_IDS.map((biomeId, index) => [biomeId, index]),
)

function assertFinite(name, value) {
  if (!Number.isFinite(value))
    throw new TypeError(`${name} must be finite; received ${value}`)
}

function assertPositive(name, value) {
  assertFinite(name, value)
  if (value <= 0)
    throw new RangeError(`${name} must be greater than zero; received ${value}`)
}

function hashCoordinate(seed, cellX, cellZ, salt) {
  let hash = Math.imul(Math.trunc(seed), 0x9E3779B1)
  hash ^= Math.imul(cellX, 0x85EBCA77)
  hash ^= Math.imul(cellZ, 0xC2B2AE3D)
  hash ^= salt
  hash = Math.imul(hash ^ (hash >>> 16), 0x7FEB352D)
  hash = Math.imul(hash ^ (hash >>> 15), 0x846CA68B)
  return ((hash ^ (hash >>> 16)) >>> 0) / UINT32_RANGE
}

export default class BiomeGenerator {
  constructor(seed, options = {}) {
    validateBiomeDefinitions(BIOMES)
    this.biomeCache = new Map()
    this.siteCache = new Map()
    this._candidateSites = Array.from({ length: 9 })
    this._candidateDistances = new Float64Array(9)
    this._biomeWeights = new Float64Array(BIOME_IDS.length)
    this._applyParams({ ...BIOME_PARAMS, ...options })
    this.setSeed(seed)
  }

  setSeed(seed) {
    assertFinite('seed', seed)
    this.seed = Math.trunc(seed)
    this.temperatureNoise = new SimplexNoise(new RNG(this.seed + 1000))
    this.humidityNoise = new SimplexNoise(new RNG(this.seed + 2000))
    this.warpNoise = new SimplexNoise(new RNG(this.seed + 3000))
    this.clearAllCache()
  }

  updateParams(params = {}) {
    const unknown = Object.keys(params).filter(name => !PARAM_NAMES.includes(name))
    if (unknown.length > 0)
      throw new RangeError(`Unknown biome parameters: ${unknown.join(', ')}`)
    this._applyParams({ ...this._snapshotParams(), ...params })
    this.clearAllCache()
  }

  _snapshotParams() {
    return Object.fromEntries(PARAM_NAMES.map(name => [name, this[name]]))
  }

  _applyParams(params) {
    assertPositive('regionSize', params.regionSize)
    assertFinite('regionJitter', params.regionJitter)
    assertPositive('transitionWidth', params.transitionWidth)
    assertPositive('warpScale', params.warpScale)
    assertFinite('warpStrength', params.warpStrength)
    if (params.warpStrength < 0)
      throw new RangeError('warpStrength cannot be negative')
    assertPositive('temperatureScale', params.temperatureScale)
    assertPositive('humidityScale', params.humidityScale)
    assertPositive('siteCacheLimit', params.siteCacheLimit)

    this.regionSize = params.regionSize
    this.regionJitter = Math.min(0.25, Math.max(0, params.regionJitter))
    const minimumSiteSeparation = this.regionSize * (1 - 2 * this.regionJitter)
    this.transitionWidth = Math.min(params.transitionWidth, minimumSiteSeparation / 2)
    this.warpScale = params.warpScale
    this.warpStrength = params.warpStrength
    this.temperatureScale = params.temperatureScale
    this.humidityScale = params.humidityScale
    this.siteCacheLimit = Math.max(1, Math.floor(params.siteCacheLimit))
  }

  getBiomeAt(worldX, worldZ) {
    this._validateCoordinate('worldX', worldX)
    this._validateCoordinate('worldZ', worldZ)
    return this._sampleBiomeAt(worldX, worldZ)
  }

  _sampleBiomeAt(worldX, worldZ, siteGrid = null) {
    const warpedX = worldX + this.warpNoise.noise(
      worldX / this.warpScale,
      worldZ / this.warpScale,
    ) * this.warpStrength
    const warpedZ = worldZ + this.warpNoise.noise(
      (worldX + 10000) / this.warpScale,
      (worldZ - 10000) / this.warpScale,
    ) * this.warpStrength
    const centerCellX = Math.floor(warpedX / this.regionSize)
    const centerCellZ = Math.floor(warpedZ / this.regionSize)
    let nearestSite = null
    let nearestDistanceSquared = Number.POSITIVE_INFINITY
    let secondDistanceSquared = Number.POSITIVE_INFINITY
    let candidateIndex = 0

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cellX = centerCellX + dx
        const cellZ = centerCellZ + dz
        const siteIndex = siteGrid
          ? (cellZ - siteGrid.minCellZ) * siteGrid.columns
          + cellX - siteGrid.minCellX
          : -1
        const site = siteGrid
          ? siteGrid.sites[siteIndex]
          : this._getSite(cellX, cellZ)
        const distanceX = warpedX - site.x
        const distanceZ = warpedZ - site.z
        const distanceSquared = distanceX * distanceX + distanceZ * distanceZ
        this._candidateSites[candidateIndex] = site
        this._candidateDistances[candidateIndex] = distanceSquared
        candidateIndex++

        if (
          distanceSquared < nearestDistanceSquared
          || (
            distanceSquared === nearestDistanceSquared
            && (
              site.cellX < nearestSite.cellX
              || (site.cellX === nearestSite.cellX && site.cellZ < nearestSite.cellZ)
            )
          )
        ) {
          secondDistanceSquared = nearestDistanceSquared
          nearestSite = site
          nearestDistanceSquared = distanceSquared
        }
        else if (distanceSquared < secondDistanceSquared) {
          secondDistanceSquared = distanceSquared
        }
      }
    }

    const nearestDistance = Math.sqrt(nearestDistanceSquared)
    if (Math.sqrt(secondDistanceSquared) - nearestDistance >= this.transitionWidth) {
      return {
        biome: nearestSite.biome,
        temp: nearestSite.temp,
        humidity: nearestSite.humidity,
        weights: { [nearestSite.biome]: 1 },
      }
    }

    const maximumDistance = nearestDistance + this.transitionWidth
    const maximumDistanceSquared = maximumDistance * maximumDistance
    this._biomeWeights.fill(0)
    let totalWeight = 0
    let temperature = 0
    let humidity = 0

    for (let index = 0; index < candidateIndex; index++) {
      const distanceSquared = this._candidateDistances[index]
      if (distanceSquared > maximumDistanceSquared)
        continue

      const site = this._candidateSites[index]
      const distanceDelta = Math.sqrt(distanceSquared) - nearestDistance
      const proximity = Math.max(0, 1 - distanceDelta / this.transitionWidth)
      const rawWeight = proximity * proximity
      if (rawWeight === 0)
        continue

      this._biomeWeights[BIOME_INDEX_BY_ID[site.biome]] += rawWeight
      totalWeight += rawWeight
      temperature += site.temp * rawWeight
      humidity += site.humidity * rawWeight
    }

    const weights = {}
    for (let index = 0; index < BIOME_IDS.length; index++) {
      const rawWeight = this._biomeWeights[index]
      if (rawWeight > 0)
        weights[BIOME_IDS[index]] = rawWeight / totalWeight
    }

    return {
      biome: nearestSite.biome,
      temp: temperature / totalWeight,
      humidity: humidity / totalWeight,
      weights,
    }
  }

  _createSiteGrid(originX, originZ, chunkWidth) {
    const minCellX = Math.floor(
      (originX - this.warpStrength) / this.regionSize,
    ) - 1
    const maxCellX = Math.floor(
      (originX + chunkWidth - 1 + this.warpStrength) / this.regionSize,
    ) + 1
    const minCellZ = Math.floor(
      (originZ - this.warpStrength) / this.regionSize,
    ) - 1
    const maxCellZ = Math.floor(
      (originZ + chunkWidth - 1 + this.warpStrength) / this.regionSize,
    ) + 1
    const columns = maxCellX - minCellX + 1
    const sites = Array.from({
      length: columns * (maxCellZ - minCellZ + 1),
    })

    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
        sites[
          (cellZ - minCellZ) * columns + cellX - minCellX
        ] = this._getSite(cellX, cellZ)
      }
    }

    return {
      minCellX,
      minCellZ,
      columns,
      sites,
    }
  }

  _getSite(cellX, cellZ) {
    const key = `${cellX},${cellZ}`
    const cached = this.siteCache.get(key)
    if (cached) {
      this.siteCache.delete(key)
      this.siteCache.set(key, cached)
      return cached
    }

    const jitterX = (hashCoordinate(this.seed, cellX, cellZ, 0xA341316C) * 2 - 1)
      * this.regionJitter
    const jitterZ = (hashCoordinate(this.seed, cellX, cellZ, 0xC8013EA4) * 2 - 1)
      * this.regionJitter
    const x = (cellX + 0.5 + jitterX) * this.regionSize
    const z = (cellZ + 0.5 + jitterZ) * this.regionSize
    const temp = this.temperatureNoise.noise(
      x / this.temperatureScale,
      z / this.temperatureScale,
    ) * 0.5 + 0.5
    const humidity = this.humidityNoise.noise(
      x / this.humidityScale,
      z / this.humidityScale,
    ) * 0.5 + 0.5
    const biome = this._classifyClimate(temp, humidity)
    const site = { cellX, cellZ, x, z, temp, humidity, biome }

    this.siteCache.set(key, site)
    while (this.siteCache.size > this.siteCacheLimit) {
      const oldestKey = this.siteCache.keys().next().value
      this.siteCache.delete(oldestKey)
    }
    return site
  }

  _classifyClimate(temp, humidity) {
    const candidates = Object.values(BIOMES)
      .map((biome) => {
        const tempDistance = temp - biome.climate.temperature
        const humidityDistance = humidity - biome.climate.humidity
        return {
          biomeId: biome.id,
          distance: Math.hypot(tempDistance, humidityDistance),
        }
      })
    candidates.sort((first, second) =>
      first.distance - second.distance
      || first.biomeId.localeCompare(second.biomeId),
    )
    return candidates[0].biomeId
  }

  _validateCoordinate(name, value) {
    assertFinite(name, value)
  }

  generateBiomeMap(originX, originZ, chunkWidth) {
    this._validateCoordinate('originX', originX)
    this._validateCoordinate('originZ', originZ)
    assertPositive('chunkWidth', chunkWidth)
    if (!Number.isInteger(chunkWidth))
      throw new RangeError(`chunkWidth must be an integer; received ${chunkWidth}`)

    const cacheKey = `${originX},${originZ},${chunkWidth}`
    const cached = this.biomeCache.get(cacheKey)
    if (cached)
      return cached

    const siteGrid = this._createSiteGrid(originX, originZ, chunkWidth)
    const biomeMap = Array.from(
      { length: chunkWidth },
      () => Array.from({ length: chunkWidth }),
    )
    for (let x = 0; x < chunkWidth; x++) {
      for (let z = 0; z < chunkWidth; z++) {
        biomeMap[x][z] = this._sampleBiomeAt(
          originX + x,
          originZ + z,
          siteGrid,
        )
      }
    }
    this.biomeCache.set(cacheKey, biomeMap)
    return biomeMap
  }

  getSitesInBounds(minX, minZ, maxX, maxZ) {
    const bounds = [
      ['minX', minX],
      ['minZ', minZ],
      ['maxX', maxX],
      ['maxZ', maxZ],
    ]
    bounds.forEach(([name, value]) => this._validateCoordinate(name, value))
    if (maxX < minX || maxZ < minZ)
      throw new RangeError('Site bounds must have max >= min')

    const minCellX = Math.floor(minX / this.regionSize) - 1
    const maxCellX = Math.floor(maxX / this.regionSize) + 1
    const minCellZ = Math.floor(minZ / this.regionSize) - 1
    const maxCellZ = Math.floor(maxZ / this.regionSize) + 1
    const sites = []
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
        const site = this._getSite(cellX, cellZ)
        if (
          site.x >= minX
          && site.x <= maxX
          && site.z >= minZ
          && site.z <= maxZ
        ) {
          sites.push({ ...site })
        }
      }
    }
    return sites
  }

  clearCache(originX, originZ, chunkWidth) {
    this.biomeCache.delete(`${originX},${originZ},${chunkWidth}`)
  }

  clearAllCache() {
    this.biomeCache.clear()
    this.siteCache.clear()
  }

  getCacheDiagnostics() {
    return {
      biomeMaps: this.biomeCache.size,
      sites: this.siteCache.size,
      siteLimit: this.siteCacheLimit,
    }
  }
}
