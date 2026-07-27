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

const SHAPE_DEFAULTS = {
  plateau: { levels: 4 },
  ridged: { gain: 1.5 },
}

function smoothstep(t) {
  return t * t * (3 - 2 * t)
}

/**
 * Quantize a value into smooth-stepped terraces.
 * @param {number} value
 * @param {number} step Terrace height in blocks
 */
function terrace(value, step) {
  const scaled = value / step
  const base = Math.floor(scaled)
  return (base + smoothstep(scaled - base)) * step
}

/**
 * Blend terrain-shape parameters from biome weights.
 * Biomes without terrainParams.shape contribute nothing.
 *
 * @param {Record<string, number>} weights
 * @param {object} [biomeDefinitions]
 * @returns {{ plateauAmount: number, plateauLevels: number, ridgedAmount: number, ridgedGain: number }}
 */
export function blendBiomeTerrainShape(weights, biomeDefinitions = BIOMES) {
  let plateauAmount = 0
  let plateauLevels = 0
  let ridgedAmount = 0
  let ridgedGain = 0

  for (const [biomeId, weight] of Object.entries(weights)) {
    const biome = getBiomeFromDefinitions(biomeId, biomeDefinitions)
    if (!biome)
      throw new RangeError(`Unknown biome "${biomeId}"`)

    const shape = biome.terrainParams?.shape
    if (!shape || weight <= 0)
      continue

    const amount = (shape.amount ?? 1) * weight
    if (shape.type === 'plateau') {
      plateauAmount += amount
      plateauLevels += (shape.levels ?? SHAPE_DEFAULTS.plateau.levels) * amount
    }
    else if (shape.type === 'ridged') {
      ridgedAmount += amount
      ridgedGain += (shape.gain ?? SHAPE_DEFAULTS.ridged.gain) * amount
    }
  }

  return {
    plateauAmount: clamp(plateauAmount, 0, 1),
    plateauLevels: plateauAmount > 0
      ? plateauLevels / plateauAmount
      : SHAPE_DEFAULTS.plateau.levels,
    ridgedAmount: clamp(ridgedAmount, 0, 1),
    ridgedGain: ridgedAmount > 0
      ? ridgedGain / ridgedAmount
      : SHAPE_DEFAULTS.ridged.gain,
  }
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
 * @param {object} [options.biomeDefinitions]
 * @returns {number} Floored terrain height clamped to the chunk.
 */
export function calculateBiomeTerrainHeight({
  baseOffset,
  baseMagnitude,
  terrainNoise,
  weights,
  maxHeight,
  biomeDefinitions = BIOMES,
}) {
  const values = [baseOffset, baseMagnitude, terrainNoise, maxHeight]
  if (!values.every(Number.isFinite))
    throw new TypeError('Terrain height inputs must be finite')

  const profile = blendBiomeTerrainProfile(weights, biomeDefinitions)
  const shape = blendBiomeTerrainShape(weights, biomeDefinitions)

  const range = baseMagnitude * profile.roughness
  let value = range * terrainNoise

  // 脊状噪声：1 - |noise| 形成尖锐峰线，按权重混合并放大振幅
  if (shape.ridgedAmount > 0) {
    const ridgedNoise = (1 - Math.abs(terrainNoise)) * 2 - 1
    const ridgedValue = ridgedNoise * range * shape.ridgedGain
    value = value * (1 - shape.ridgedAmount) + ridgedValue * shape.ridgedAmount
  }

  // 平顶山：阶梯量化，台阶之间用 smoothstep 保留可行走的坡面
  if (shape.plateauAmount > 0) {
    const step = Math.max(1, (2 * range) / shape.plateauLevels)
    const terraced = terrace(value, step)
    value = value * (1 - shape.plateauAmount) + terraced * shape.plateauAmount
  }

  const height = Math.floor(
    baseOffset
    + profile.heightOffset
    + value,
  )

  return clamp(height, 0, maxHeight)
}
