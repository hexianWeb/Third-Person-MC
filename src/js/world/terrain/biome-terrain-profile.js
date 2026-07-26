import { BIOMES, getBiomeConfig } from './biome-config.js'

export const MIN_BIOME_ROUGHNESS = 0.75
export const MAX_BIOME_ROUGHNESS = 1.35

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

/**
 * Validate the climate anchors and terrain profiles used by biome generation.
 *
 * @param {object} biomeDefinitions
 */
export function validateBiomeDefinitions(biomeDefinitions) {
  const biomes = Object.values(biomeDefinitions)
  if (biomes.length === 0)
    throw new RangeError('At least one biome definition is required')

  for (const biome of biomes) {
    const temperature = biome.climate?.temperature
    const humidity = biome.climate?.humidity
    const heightOffset = biome.terrainParams?.heightOffset
    const roughness = biome.terrainParams?.roughness

    if (![temperature, humidity, heightOffset, roughness].every(Number.isFinite))
      throw new TypeError(`Biome "${biome.id}" contains a non-finite profile value`)
    if (temperature < 0 || temperature > 1 || humidity < 0 || humidity > 1)
      throw new RangeError(`Biome "${biome.id}" climate anchors must be between 0 and 1`)
  }
}

function getBiomeFromDefinitions(biomeId, biomeDefinitions) {
  if (biomeDefinitions === BIOMES)
    return getBiomeConfig(biomeId)
  return Object.values(biomeDefinitions).find(biome => biome.id === biomeId) ?? null
}

/**
 * Blend continuous terrain properties from normalized biome weights.
 *
 * @param {Record<string, number>} weights
 * @param {object} biomeDefinitions
 */
export function blendBiomeTerrainProfile(weights, biomeDefinitions = BIOMES) {
  validateBiomeDefinitions(biomeDefinitions)

  const entries = Object.entries(weights).sort(([first], [second]) => first.localeCompare(second))
  if (entries.length === 0)
    throw new RangeError('At least one biome weight is required')

  let weightSum = 0
  let heightOffset = 0
  let roughness = 0

  for (const [biomeId, weight] of entries) {
    if (!Number.isFinite(weight))
      throw new TypeError(`Biome weight "${biomeId}" must be finite`)
    if (weight < 0)
      throw new RangeError(`Biome weight "${biomeId}" cannot be negative`)

    const biome = getBiomeFromDefinitions(biomeId, biomeDefinitions)
    if (!biome)
      throw new RangeError(`Unknown biome "${biomeId}"`)

    weightSum += weight
    heightOffset += biome.terrainParams.heightOffset * weight
    roughness += clamp(
      biome.terrainParams.roughness,
      MIN_BIOME_ROUGHNESS,
      MAX_BIOME_ROUGHNESS,
    ) * weight
  }

  if (Math.abs(weightSum - 1) > 1e-9)
    throw new RangeError(`Biome weights must sum to 1, received ${weightSum}`)

  return { heightOffset, roughness }
}

/**
 * Apply one blended biome profile to the global terrain noise.
 *
 * @param {object} options
 * @param {number} options.baseOffset
 * @param {number} options.baseMagnitude
 * @param {number} options.terrainNoise
 * @param {Record<string, number>} options.weights
 * @param {number} options.maxHeight
 * @returns {number} Floored terrain height clamped to the chunk.
 */
export function calculateBiomeTerrainHeight({
  baseOffset,
  baseMagnitude,
  terrainNoise,
  weights,
  maxHeight,
}) {
  const values = [baseOffset, baseMagnitude, terrainNoise, maxHeight]
  if (!values.every(Number.isFinite))
    throw new TypeError('Terrain height inputs must be finite')

  const profile = blendBiomeTerrainProfile(weights)
  const height = Math.floor(
    baseOffset
    + profile.heightOffset
    + baseMagnitude * terrainNoise * profile.roughness,
  )

  return clamp(height, 0, maxHeight)
}
