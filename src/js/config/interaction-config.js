/**
 * INTERACTION_CONFIG
 * - Centralized parameters for block interactions: mining, placing, and raycasting.
 */
export const INTERACTION_CONFIG = {
  mining: {
    duration: 1500, // Mining duration in milliseconds
  },
  raycast: {
    maxDistance: 10, // Maximum distance for block interaction (raycasting)
  },
  modes: {
    REMOVE: 'remove',
    ADD: 'add',
  }
}
