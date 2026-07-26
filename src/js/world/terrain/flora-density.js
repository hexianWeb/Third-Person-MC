import { FLORA_DENSITY_SCALE } from '../../config/chunk-config.js'

/**
 * Scale one biome's flora density into a valid spawn probability.
 *
 * @param {number} biomeDensity
 * @param {number} densityScale
 * @returns {number} A probability clamped between zero and one.
 */
export function getFloraSpawnDensity(
  biomeDensity,
  densityScale = FLORA_DENSITY_SCALE,
) {
  if (!Number.isFinite(biomeDensity) || !Number.isFinite(densityScale))
    throw new TypeError('Flora density inputs must be finite')

  return Math.min(1, Math.max(0, biomeDensity * densityScale))
}
