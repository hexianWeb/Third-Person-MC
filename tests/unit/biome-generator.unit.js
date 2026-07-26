import assert from 'node:assert/strict'
import test from 'node:test'

import { BIOME_PARAMS } from '../../src/js/config/chunk-config.js'
import BiomeGenerator from '../../src/js/world/terrain/biome-generator.js'
import {
  blendBiomeTerrainProfile,
} from '../../src/js/world/terrain/biome-terrain-profile.js'

function assertNormalizedWeights(weights) {
  assert.ok(weights)
  const values = Object.values(weights)
  assert.ok(values.length >= 1)
  values.forEach((weight) => {
    assert.ok(Number.isFinite(weight))
    assert.ok(weight >= 0)
  })
  const total = values.reduce((sum, weight) => sum + weight, 0)
  assert.ok(Math.abs(total - 1) < 1e-9, `weight sum was ${total}`)
}

test('same seed and coordinates are deterministic across instances and cache clears', () => {
  const first = new BiomeGenerator(1337)
  const second = new BiomeGenerator(1337)
  const coordinates = [
    [0, 0],
    [63, 63],
    [64, 64],
    [-1, -1],
    [-129, 257],
    [12345, -67890],
  ]

  const expected = coordinates.map(([x, z]) => first.getBiomeAt(x, z))
  first.clearAllCache()

  assert.deepEqual(coordinates.map(([x, z]) => first.getBiomeAt(x, z)), expected)
  assert.deepEqual(coordinates.map(([x, z]) => second.getBiomeAt(x, z)), expected)
})

test('different seeds change the macro field', () => {
  const first = new BiomeGenerator(1337)
  const second = new BiomeGenerator(7331)
  const firstSample = []
  const secondSample = []

  for (let z = -256; z <= 256; z += 32) {
    for (let x = -256; x <= 256; x += 32) {
      firstSample.push(first.getBiomeAt(x, z).biome)
      secondSample.push(second.getBiomeAt(x, z).biome)
    }
  }

  assert.notDeepEqual(secondSample, firstSample)
})

test('generator data always has finite climate and normalized weights', () => {
  const generator = new BiomeGenerator(1337)
  for (let z = -128; z <= 128; z += 7) {
    for (let x = -128; x <= 128; x += 7) {
      const data = generator.getBiomeAt(x, z)
      assert.ok(Number.isFinite(data.temp))
      assert.ok(Number.isFinite(data.humidity))
      assert.ok(data.temp >= 0 && data.temp <= 1)
      assert.ok(data.humidity >= 0 && data.humidity <= 1)
      assertNormalizedWeights(data.weights)
      assert.ok(data.weights[data.biome] > 0)
    }
  }
})

test('triple junctions retain every nearby biome in the continuous blend', () => {
  const generator = new BiomeGenerator(1337)
  const first = generator.getBiomeAt(-113, 242)
  const second = generator.getBiomeAt(-112, 242)

  assert.ok(
    Object.keys(first.weights).length >= 3,
    `expected 3+ contributors, received ${JSON.stringify(first.weights)}`,
  )
  assert.ok(
    Object.keys(second.weights).length >= 3,
    `expected 3+ contributors, received ${JSON.stringify(second.weights)}`,
  )

  const firstProfile = blendBiomeTerrainProfile(first.weights)
  const secondProfile = blendBiomeTerrainProfile(second.weights)
  assert.ok(
    Math.abs(firstProfile.heightOffset - secondProfile.heightOffset) <= 0.25,
    `height offset jumped from ${firstProfile.heightOffset} to ${secondProfile.heightOffset}`,
  )
})

test('chunk maps match point queries at positive and negative origins', () => {
  const generator = new BiomeGenerator(1337)
  for (const [originX, originZ] of [[0, 0], [-64, -64], [128, -192]]) {
    const map = generator.generateBiomeMap(originX, originZ, 64)
    for (const [x, z] of [[0, 0], [63, 63], [12, 51], [51, 12]]) {
      assert.deepEqual(map[x][z], generator.getBiomeAt(originX + x, originZ + z))
    }
  }
})

test('adjacent chunk seam columns equal direct world-coordinate queries', () => {
  const generator = new BiomeGenerator(1337)
  const left = generator.generateBiomeMap(-64, 0, 64)
  const right = generator.generateBiomeMap(0, 0, 64)

  for (let z = 0; z < 64; z++) {
    assert.deepEqual(left[63][z], generator.getBiomeAt(-1, z))
    assert.deepEqual(right[0][z], generator.getBiomeAt(0, z))
  }
})

test('map cache key includes chunk width and clearCache targets one map', () => {
  const generator = new BiomeGenerator(1337)
  const small = generator.generateBiomeMap(0, 0, 16)
  const large = generator.generateBiomeMap(0, 0, 64)

  assert.equal(small.length, 16)
  assert.equal(large.length, 64)
  assert.equal(generator.getCacheDiagnostics().biomeMaps, 2)

  generator.clearCache(0, 0, 16)
  assert.equal(generator.getCacheDiagnostics().biomeMaps, 1)
})

test('site cache remains bounded and clearAllCache clears both cache types', () => {
  const generator = new BiomeGenerator(1337, { siteCacheLimit: 32 })
  for (let z = -4096; z <= 4096; z += 128) {
    for (let x = -4096; x <= 4096; x += 128)
      generator.getBiomeAt(x, z)
  }

  assert.equal(generator.getCacheDiagnostics().siteLimit, 32)
  assert.ok(generator.getCacheDiagnostics().sites <= 32)

  generator.generateBiomeMap(0, 0, 16)
  generator.clearAllCache()
  assert.deepEqual(generator.getCacheDiagnostics(), {
    biomeMaps: 0,
    sites: 0,
    siteLimit: 32,
  })
})

test('setSeed rebuilds noise state instead of mutating a passive field', () => {
  const generator = new BiomeGenerator(1337)
  const before = generator.generateBiomeMap(0, 0, 32)
  generator.setSeed(7331)
  const after = generator.generateBiomeMap(0, 0, 32)

  assert.notDeepEqual(after, before)
  generator.setSeed(1337)
  assert.deepEqual(generator.generateBiomeMap(0, 0, 32), before)
})

test('updateParams validates values, clamps approved bounds, and invalidates caches', () => {
  const generator = new BiomeGenerator(1337)
  generator.generateBiomeMap(0, 0, 16)

  generator.updateParams({
    regionJitter: 0.5,
    transitionWidth: 200,
    siteCacheLimit: 40.9,
  })

  assert.equal(generator.regionJitter, 0.25)
  assert.equal(generator.transitionWidth, 32)
  assert.equal(generator.siteCacheLimit, 40)
  assert.equal(generator.getCacheDiagnostics().biomeMaps, 0)

  assert.throws(() => generator.updateParams({ regionSize: 0 }), RangeError)
  assert.throws(() => generator.updateParams({ warpScale: Number.NaN }), TypeError)
  assert.throws(() => generator.getBiomeAt(Number.NaN, 0), TypeError)
  assert.throws(() => generator.generateBiomeMap(0, 0, 0), RangeError)
})

test('debug site queries return unique deterministic sites in bounds', () => {
  const generator = new BiomeGenerator(1337, BIOME_PARAMS)
  const sites = generator.getSitesInBounds(-256, -256, 256, 256)
  const keys = sites.map(site => `${site.cellX},${site.cellZ}`)

  assert.equal(new Set(keys).size, keys.length)
  assert.deepEqual(sites, new BiomeGenerator(1337).getSitesInBounds(-256, -256, 256, 256))
  sites.forEach((site) => {
    assert.ok(Number.isFinite(site.x))
    assert.ok(Number.isFinite(site.z))
    assert.ok(Number.isFinite(site.temp))
    assert.ok(Number.isFinite(site.humidity))
    assert.ok(site.biome)
  })
})

function findInteriorBiomeComponents(generator, originX, originZ, size) {
  const biomeIds = Array.from({ length: size * size })
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++)
      biomeIds[z * size + x] = generator.getBiomeAt(originX + x, originZ + z).biome
  }

  const seen = new Uint8Array(biomeIds.length)
  const components = []
  for (let start = 0; start < biomeIds.length; start++) {
    if (seen[start])
      continue

    const biome = biomeIds[start]
    const queue = [start]
    seen[start] = 1
    let head = 0
    let area = 0
    let touchesBorder = false

    while (head < queue.length) {
      const index = queue[head++]
      const x = index % size
      const z = Math.floor(index / size)
      area++
      touchesBorder ||= x === 0 || z === 0 || x === size - 1 || z === size - 1

      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < size ? index + 1 : -1,
        z > 0 ? index - size : -1,
        z + 1 < size ? index + size : -1,
      ]
      for (const next of neighbors) {
        if (next >= 0 && !seen[next] && biomeIds[next] === biome) {
          seen[next] = 1
          queue.push(next)
        }
      }
    }

    if (!touchesBorder)
      components.push({ biome, area })
  }
  return components
}

test('macro field has no interior biome component smaller than 32 columns', () => {
  for (const seed of [42, 1337, 987654]) {
    const generator = new BiomeGenerator(seed)
    const components = findInteriorBiomeComponents(generator, -256, -256, 512)
    const tiny = components.filter(component => component.area < 32)
    assert.deepEqual(tiny, [], `seed ${seed} tiny components: ${JSON.stringify(tiny)}`)
  }
})

test('jittered sites preserve the approved minimum separation', () => {
  const generator = new BiomeGenerator(1337)
  const sites = generator.getSitesInBounds(-1024, -1024, 1024, 1024)
  let minimumDistance = Number.POSITIVE_INFINITY

  for (let firstIndex = 0; firstIndex < sites.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < sites.length; secondIndex++) {
      const first = sites[firstIndex]
      const second = sites[secondIndex]
      if (
        Math.abs(first.cellX - second.cellX) > 1
        || Math.abs(first.cellZ - second.cellZ) > 1
      ) {
        continue
      }
      minimumDistance = Math.min(
        minimumDistance,
        Math.hypot(first.x - second.x, first.z - second.z),
      )
    }
  }

  assert.ok(minimumDistance >= 64, `minimum site distance was ${minimumDistance}`)
})
