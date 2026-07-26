/**
 * Rebuild seeded noise only for an explicit seed change; otherwise clear caches.
 *
 * @param {object} generator
 * @param {number} currentSeed
 * @param {number|undefined} nextSeed
 * @returns {number} The seed now owned by the chunk manager.
 */
export function refreshBiomeGenerator(generator, currentSeed, nextSeed) {
  if (nextSeed !== undefined) {
    generator.setSeed(nextSeed)
    return nextSeed
  }

  generator.clearAllCache()
  return currentSeed
}

/**
 * Release the cached biome map owned by one unloaded chunk.
 *
 * @param {object} generator
 * @param {{ chunkX: number, chunkZ: number }} chunk
 * @param {number} chunkWidth
 */
export function clearChunkBiomeCache(generator, chunk, chunkWidth) {
  generator.clearCache(
    chunk.chunkX * chunkWidth,
    chunk.chunkZ * chunkWidth,
    chunkWidth,
  )
}
