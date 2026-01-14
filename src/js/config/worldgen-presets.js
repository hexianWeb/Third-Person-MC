/**
 * WorldGen Presets Configuration
 * Defines preset values for terrain and tree generation
 * Based on: docs/plans/2026-01-14-menu-ui-v2-design.md (Section 9.4)
 * 
 * These presets map user-friendly options to internal terrain/tree parameters.
 * Players only see preset names, not the underlying fBm/scale/offset values.
 */

// ========================================
// WorldGen Preset Definitions
// ========================================
export const WORLDGEN_PRESETS = {
  default: {
    name: 'Default',
    terrain: {
      scale: 168,
      magnitude: 6,
      offset: 8,
      fbm: { octaves: 5, gain: 0.50, lacunarity: 2.0 },
    },
    trees: {
      minHeight: 3,
      maxHeight: 6,
      minRadius: 2,
      maxRadius: 4,
      frequency: 0.05,
    },
  },
  flat: {
    name: 'Flat',
    terrain: {
      scale: 260,
      magnitude: 2,
      offset: 8,
      fbm: { octaves: 3, gain: 0.45, lacunarity: 2.0 },
    },
    trees: {
      minHeight: 3,
      maxHeight: 5,
      minRadius: 2,
      maxRadius: 3,
      frequency: 0.04,
    },
  },
  mountains: {
    name: 'Mountains',
    terrain: {
      scale: 110,
      magnitude: 18,
      offset: 10,
      fbm: { octaves: 6, gain: 0.55, lacunarity: 2.2 },
    },
    trees: {
      minHeight: 4,
      maxHeight: 8,
      minRadius: 3,
      maxRadius: 6,
      frequency: 0.06,
    },
  },
  forest: {
    name: 'Forest',
    terrain: {
      scale: 168,
      magnitude: 6,
      offset: 8,
      fbm: { octaves: 5, gain: 0.50, lacunarity: 2.0 },
    },
    trees: {
      minHeight: 5,
      maxHeight: 10,
      minRadius: 3,
      maxRadius: 7,
      frequency: 0.12,
    },
  },
}

// Preset IDs for iteration
export const WORLDGEN_PRESET_IDS = ['default', 'flat', 'mountains', 'forest']

// ========================================
// Default WorldGen Draft (used for UI state)
// ========================================
export const DEFAULT_WORLDGEN_DRAFT = {
  presetId: 'default',
  // User-adjustable overrides (exposed to UI)
  magnitude: 6, // Terrain Height
  treeMinHeight: 3,
  treeMaxHeight: 6,
}

/**
 * Merge preset with user overrides to get final terrain/trees params
 * @param {string} presetId - Preset ID
 * @param {object} overrides - User overrides (magnitude, treeMinHeight, treeMaxHeight)
 * @returns {{ terrain: object, trees: object }}
 */
export function buildWorldGenParams(presetId, overrides = {}) {
  const preset = WORLDGEN_PRESETS[presetId] || WORLDGEN_PRESETS.default
  
  // Deep clone preset
  const terrain = JSON.parse(JSON.stringify(preset.terrain))
  const trees = JSON.parse(JSON.stringify(preset.trees))
  
  // Apply user overrides
  if (overrides.magnitude !== undefined) {
    terrain.magnitude = overrides.magnitude
  }
  if (overrides.treeMinHeight !== undefined) {
    trees.minHeight = overrides.treeMinHeight
  }
  if (overrides.treeMaxHeight !== undefined) {
    trees.maxHeight = overrides.treeMaxHeight
  }
  
  return { terrain, trees }
}
