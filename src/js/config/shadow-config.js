/**
 * Shadow quality configuration
 * Defines three quality levels for shadow casting
 *
 * - LOW: No shadows at all
 * - MEDIUM: Only player and trees cast shadows
 * - HIGH: All terrain blocks cast shadows
 */

export const SHADOW_QUALITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
}

export const SHADOW_CONFIG = {
  quality: SHADOW_QUALITY.HIGH, // Default to high quality
}

/**
 * Tree block IDs that should cast shadows in MEDIUM quality
 * Includes all tree trunk and leaves variants
 */
export const TREE_BLOCK_IDS = new Set([
  6, // TREE_TRUNK
  7, // TREE_LEAVES
  9, // BIRCH_TRUNK
  10, // BIRCH_LEAVES
  11, // CHERRY_TRUNK
  12, // CHERRY_LEAVES
  13, // CACTUS
])

/**
 * 判断指定阴影质量下地形方块是否投射阴影。
 * @param {string} quality - 阴影质量等级
 * @param {number} blockId - 方块 ID
 * @returns {boolean} 是否投射阴影
 */
export function shouldTerrainCastShadow(quality, blockId) {
  if (quality === SHADOW_QUALITY.LOW)
    return false
  if (quality === SHADOW_QUALITY.MEDIUM)
    return TREE_BLOCK_IDS.has(blockId)
  return true
}
