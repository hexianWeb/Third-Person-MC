import { fbm2D } from '../../utils/utils/noise-utils.js'
import { getBiomeConfig } from './biome-config.js'
import { calculateBiomeTerrainHeight } from './biome-terrain-profile.js'
import { BLOCK_IDS } from './blocks-config.js'

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

/**
 * Build height and biome maps while preserving the generator's [x][z] contract.
 *
 * @param {object} options
 * @param {number} options.width
 * @param {number} options.height
 * @param {number} options.originX
 * @param {number} options.originZ
 * @param {object} options.terrain
 * @param {object} options.simplex
 * @param {object[][]} [options.generatedBiomeMap]
 * @param {((x: number, z: number) => string)|null} [options.fallbackBiomeAt]
 * @returns {{heightMap: number[][], biomeMap: string[][], biomeDataMap: object[][]}} Generated maps.
 */
export function buildTerrainBiomeField({
  width,
  height,
  originX,
  originZ,
  terrain,
  simplex,
  generatedBiomeMap = null,
  fallbackBiomeAt = null,
}) {
  const heightMap = []
  const biomeMap = []
  const biomeDataMap = []

  for (let z = 0; z < width; z++) {
    const heightRow = []
    const biomeRow = []
    const biomeDataRow = []

    for (let x = 0; x < width; x++) {
      let biomeData = generatedBiomeMap?.[x]?.[z]
      if (!biomeData) {
        const biome = fallbackBiomeAt?.(x, z)
        if (!biome)
          throw new RangeError(`Missing biome data at ${x},${z}`)
        biomeData = {
          biome,
          temp: 0.5,
          humidity: 0.5,
          weights: { [biome]: 1 },
        }
      }
      else if (!biomeData.weights) {
        biomeData = {
          ...biomeData,
          weights: { [biomeData.biome]: 1 },
        }
      }

      const terrainNoise = fbm2D(simplex, originX + x, originZ + z, {
        octaves: terrain.fbm.octaves,
        gain: terrain.fbm.gain,
        lacunarity: terrain.fbm.lacunarity,
        scale: terrain.scale,
      })
      const columnHeight = calculateBiomeTerrainHeight({
        baseOffset: terrain.offset,
        baseMagnitude: terrain.magnitude,
        terrainNoise,
        weights: biomeData.weights,
        maxHeight: height - 1,
      })

      heightRow.push(columnHeight)
      biomeRow.push(biomeData.biome)
      biomeDataRow.push(biomeData)
    }

    heightMap.push(heightRow)
    biomeMap.push(biomeRow)
    biomeDataMap.push(biomeDataRow)
  }

  return { heightMap, biomeMap, biomeDataMap }
}

/**
 * Resolve categorical blocks from the dominant biome only.
 *
 * @param {object} options
 * @param {string} options.dominantBiome
 * @param {boolean} options.underwater
 * @param {boolean} options.shore
 * @returns {{surface: number, subsurface: number, deep: number}} Layer block IDs.
 */
export function getCategoricalBiomeBlocks({
  dominantBiome,
  underwater,
  shore,
}) {
  const biome = getBiomeConfig(dominantBiome)
  if (!biome)
    throw new RangeError(`Unknown biome "${dominantBiome}"`)

  if (underwater || shore) {
    const underwaterBlocks = biome.blocks.underwater
    return {
      surface: underwaterBlocks?.surface ?? BLOCK_IDS.SAND,
      subsurface: underwaterBlocks?.subsurface ?? underwaterBlocks?.surface ?? BLOCK_IDS.SAND,
      deep: biome.blocks.deep || BLOCK_IDS.STONE,
    }
  }

  return {
    surface: biome.blocks.surface || BLOCK_IDS.GRASS,
    subsurface: biome.blocks.subsurface || BLOCK_IDS.STONE,
    deep: biome.blocks.deep || BLOCK_IDS.STONE,
  }
}

/**
 * Pick one surface block from weighted variants using a low-frequency noise
 * value, so variants form coherent patches instead of per-block scatter.
 *
 * @param {Array<{ blockId: number, weight: number }>} variants
 * @param {number} noiseValue Simplex noise in [-1, 1]
 * @returns {number} Selected block ID
 */
export function selectSurfaceVariant(variants, noiseValue) {
  if (!Array.isArray(variants) || variants.length === 0)
    throw new RangeError('surfaceVariants must be a non-empty array')

  const totalWeight = variants.reduce((sum, variant) => sum + variant.weight, 0)
  if (totalWeight <= 0)
    throw new RangeError('surfaceVariants weights must sum to a positive value')

  const target = ((clamp(noiseValue, -1, 1) + 1) / 2) * totalWeight
  let cumulative = 0
  for (const variant of variants) {
    cumulative += variant.weight
    if (target < cumulative)
      return variant.blockId
  }
  return variants[variants.length - 1].blockId
}

/**
 * Pick a strata band block for one Y level. Bands cycle with wrap-around and
 * are vertically perturbed by noise so layers look natural.
 *
 * @param {{ bands: number[], bandHeight?: number, noiseAmplitude?: number }} strata
 * @param {number} y Block Y coordinate
 * @param {number} noiseValue Simplex noise in [-1, 1]
 * @returns {number} Band block ID
 */
export function selectStrataBlock(strata, y, noiseValue) {
  const bands = strata?.bands
  if (!Array.isArray(bands) || bands.length === 0)
    throw new RangeError('strata.bands must be a non-empty array')

  const bandHeight = Math.max(1, strata.bandHeight ?? 4)
  const shifted = y + clamp(noiseValue, -1, 1) * (strata.noiseAmplitude ?? 6)
  const band = Math.floor(shifted / bandHeight)
  return bands[((band % bands.length) + bands.length) % bands.length]
}
