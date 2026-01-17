/**
 * Settings Presets Configuration
 * Defines preset values for Camera, Visual (SpeedLines), and Environment settings
 * Based on: docs/plans/2026-01-14-menu-ui-v2-design.md
 */

// ========================================
// Camera FOV Presets
// ========================================
export const FOV_PRESETS = {
  off: {
    enabled: false,
    baseFov: 55,
    maxFov: 85,
    speedThreshold: 3.0,
    smoothSpeed: 0.05,
  },
  default: {
    enabled: true,
    baseFov: 55,
    maxFov: 85,
    speedThreshold: 3.0,
    smoothSpeed: 0.05,
  },
  cinematic: {
    enabled: true,
    baseFov: 50,
    maxFov: 95,
    speedThreshold: 2.5,
    smoothSpeed: 0.035,
  },
  arcade: {
    enabled: true,
    baseFov: 60,
    maxFov: 100,
    speedThreshold: 2.0,
    smoothSpeed: 0.07,
  },
}

// ========================================
// Camera Bobbing Presets
// ========================================
export const BOBBING_PRESETS = {
  off: {
    enabled: false,
    verticalFrequency: 4.0,
    verticalAmplitude: 0.025,
    horizontalFrequency: 4.0,
    horizontalAmplitude: 0.015,
    rollFrequency: 4.0,
    rollAmplitude: 0.005,
    speedMultiplier: 1.0,
    idleBreathing: { enabled: false, frequency: 0.7, amplitude: 0.015 },
  },
  default: {
    enabled: true,
    verticalFrequency: 4.0,
    verticalAmplitude: 0.025,
    horizontalFrequency: 4.0,
    horizontalAmplitude: 0.015,
    rollFrequency: 4.0,
    rollAmplitude: 0.005,
    speedMultiplier: 1.0,
    idleBreathing: { enabled: true, frequency: 0.7, amplitude: 0.015 },
  },
  cinematic: {
    enabled: true,
    verticalFrequency: 3.0,
    verticalAmplitude: 0.015,
    horizontalFrequency: 3.0,
    horizontalAmplitude: 0.008,
    rollFrequency: 3.0,
    rollAmplitude: 0.002,
    speedMultiplier: 0.8,
    idleBreathing: { enabled: true, frequency: 0.6, amplitude: 0.012 },
  },
  arcade: {
    enabled: true,
    verticalFrequency: 6.0,
    verticalAmplitude: 0.040,
    horizontalFrequency: 6.0,
    horizontalAmplitude: 0.025,
    rollFrequency: 6.0,
    rollAmplitude: 0.010,
    speedMultiplier: 1.6,
    idleBreathing: { enabled: true, frequency: 0.9, amplitude: 0.018 },
  },
}

// ========================================
// SpeedLines Presets
// ========================================
export const SPEEDLINES_PRESETS = {
  off: {
    enabled: false,
    color: { r: 255, g: 255, b: 255 },
    density: 66,
    speed: 6.0,
    thickness: 0.24,
    minRadius: 0.40,
    maxRadius: 1.30,
    randomness: 0.50,
  },
  default: {
    enabled: true,
    color: { r: 255, g: 255, b: 255 },
    density: 66,
    speed: 6.0,
    thickness: 0.24,
    minRadius: 0.40,
    maxRadius: 1.30,
    randomness: 0.50,
  },
  cinematic: {
    enabled: true,
    color: { r: 235, g: 245, b: 255 },
    density: 48,
    speed: 4.0,
    thickness: 0.18,
    minRadius: 0.45,
    maxRadius: 1.15,
    randomness: 0.35,
  },
  arcade: {
    enabled: true,
    color: { r: 255, g: 255, b: 255 },
    density: 90,
    speed: 8.0,
    thickness: 0.30,
    minRadius: 0.35,
    maxRadius: 1.50,
    randomness: 0.70,
  },
}

// ========================================
// Environment Presets (defaults)
// ========================================
export const ENV_DEFAULTS = {
  skyMode: 'Image', // 'Image' | 'HDR'
  sunIntensity: 1.75,
  ambientIntensity: 0.75,
  fogDensity: 0.01,
}

// ========================================
// Chunk Presets (defaults)
// ========================================
export const CHUNK_DEFAULTS = {
  viewDistance: 1,
  unloadPadding: 1,
}

// ========================================
// Preset names for UI display
// ========================================
export const PRESET_NAMES = ['off', 'default', 'cinematic', 'arcade']
export const PRESET_LABELS = {
  off: 'Off',
  default: 'Default',
  cinematic: 'Cinematic',
  arcade: 'Arcade',
}
