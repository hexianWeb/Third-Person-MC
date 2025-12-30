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
