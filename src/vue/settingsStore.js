/**
 * Settings Store - Game settings management
 * Handles graphics, controls, camera, visual effects, and environment settings
 * with localStorage persistence
 */
import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import {
  BOBBING_PRESETS,
  CHUNK_DEFAULTS,
  ENV_DEFAULTS,
  FOV_PRESETS,
  SPEEDLINES_PRESETS,
} from '../js/config/settings-presets.js'
import emitter from '../js/utils/event-bus.js'

// ========================================
// Constants
// ========================================
const STORAGE_KEY = 'mc-game-settings'

const DEFAULT_SETTINGS = {
  // Graphics
  shadowQuality: 'high', // 'low' | 'medium' | 'high'

  // Controls
  mouseSensitivity: 0.03, // 0.01 - 0.1

  // Audio (placeholder for future)
  masterVolume: 1.0,
  musicVolume: 0.7,
  sfxVolume: 1.0,

  // Camera presets
  cameraPreset: 'default',

  // Visual presets
  visualPreset: 'default',

  // Environment
  envSkyMode: 'Image',
  envSunIntensity: 1.75,
  envAmbientIntensity: 0.75,
  envFogDensity: 0.01,

  // Chunks
  chunkViewDistance: 1,
  chunkUnloadPadding: 1,
}

// ========================================
// Settings Store Definition
// ========================================
export const useSettingsStore = defineStore('settings', () => {
  // ----------------------------------------
  // State - Load from localStorage or use defaults
  // ----------------------------------------
  const shadowQuality = ref(DEFAULT_SETTINGS.shadowQuality)
  const mouseSensitivity = ref(DEFAULT_SETTINGS.mouseSensitivity)
  const masterVolume = ref(DEFAULT_SETTINGS.masterVolume)
  const musicVolume = ref(DEFAULT_SETTINGS.musicVolume)
  const sfxVolume = ref(DEFAULT_SETTINGS.sfxVolume)

  // Camera settings
  const cameraPreset = ref(DEFAULT_SETTINGS.cameraPreset)
  const cameraFov = reactive({ ...FOV_PRESETS.default })
  const cameraBobbing = reactive({ ...BOBBING_PRESETS.default })

  // Visual settings (SpeedLines)
  const visualPreset = ref(DEFAULT_SETTINGS.visualPreset)
  const speedLines = reactive({ ...SPEEDLINES_PRESETS.default })

  // Environment settings
  const envSkyMode = ref(DEFAULT_SETTINGS.envSkyMode)
  const envSunIntensity = ref(DEFAULT_SETTINGS.envSunIntensity)
  const envAmbientIntensity = ref(DEFAULT_SETTINGS.envAmbientIntensity)
  const envFogDensity = ref(DEFAULT_SETTINGS.envFogDensity)

  // Chunk settings
  const chunkViewDistance = ref(DEFAULT_SETTINGS.chunkViewDistance)
  const chunkUnloadPadding = ref(DEFAULT_SETTINGS.chunkUnloadPadding)

  // ----------------------------------------
  // Initialize from localStorage
  // ----------------------------------------
  function loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.shadowQuality)
          shadowQuality.value = parsed.shadowQuality
        if (parsed.mouseSensitivity)
          mouseSensitivity.value = parsed.mouseSensitivity
        if (parsed.masterVolume !== undefined)
          masterVolume.value = parsed.masterVolume
        if (parsed.musicVolume !== undefined)
          musicVolume.value = parsed.musicVolume
        if (parsed.sfxVolume !== undefined)
          sfxVolume.value = parsed.sfxVolume

        // Camera preset
        if (parsed.cameraPreset) {
          cameraPreset.value = parsed.cameraPreset
          applyCameraPreset(parsed.cameraPreset, false)
        }

        // Visual preset
        if (parsed.visualPreset) {
          visualPreset.value = parsed.visualPreset
          applyVisualPreset(parsed.visualPreset, false)
        }

        // Environment
        if (parsed.envSkyMode)
          envSkyMode.value = parsed.envSkyMode
        if (parsed.envSunIntensity !== undefined)
          envSunIntensity.value = parsed.envSunIntensity
        if (parsed.envAmbientIntensity !== undefined)
          envAmbientIntensity.value = parsed.envAmbientIntensity
        if (parsed.envFogDensity !== undefined)
          envFogDensity.value = parsed.envFogDensity
        if (parsed.chunkViewDistance !== undefined)
          chunkViewDistance.value = parsed.chunkViewDistance
        if (parsed.chunkUnloadPadding !== undefined)
          chunkUnloadPadding.value = parsed.chunkUnloadPadding
      }
    }
    catch {
      console.warn('[Settings] Failed to load settings from localStorage')
    }
  }

  // ----------------------------------------
  // Save to localStorage
  // ----------------------------------------
  function saveSettings() {
    try {
      const settings = {
        shadowQuality: shadowQuality.value,
        mouseSensitivity: mouseSensitivity.value,
        masterVolume: masterVolume.value,
        musicVolume: musicVolume.value,
        sfxVolume: sfxVolume.value,
        cameraPreset: cameraPreset.value,
        visualPreset: visualPreset.value,
        envSkyMode: envSkyMode.value,
        envSunIntensity: envSunIntensity.value,
        envAmbientIntensity: envAmbientIntensity.value,
        envFogDensity: envFogDensity.value,
        chunkViewDistance: chunkViewDistance.value,
        chunkUnloadPadding: chunkUnloadPadding.value,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    }
    catch {
      console.warn('[Settings] Failed to save settings to localStorage')
    }
  }

  // ----------------------------------------
  // Actions - Basic settings
  // ----------------------------------------
  function setShadowQuality(quality) {
    shadowQuality.value = quality
    emitter.emit('shadow:quality-changed', quality)
    saveSettings()
  }

  function setMouseSensitivity(value) {
    mouseSensitivity.value = value
    emitter.emit('settings:mouse-sensitivity-changed', value)
    saveSettings()
  }

  function setMasterVolume(value) {
    masterVolume.value = value
    saveSettings()
  }

  function setMusicVolume(value) {
    musicVolume.value = value
    saveSettings()
  }

  function setSfxVolume(value) {
    sfxVolume.value = value
    saveSettings()
  }

  // ----------------------------------------
  // Actions - Camera presets
  // ----------------------------------------
  function applyCameraPreset(presetName, emit = true) {
    cameraPreset.value = presetName

    // Apply FOV preset
    const fovPreset = FOV_PRESETS[presetName] || FOV_PRESETS.default
    Object.assign(cameraFov, fovPreset)

    // Apply Bobbing preset
    const bobbingPreset = BOBBING_PRESETS[presetName] || BOBBING_PRESETS.default
    Object.assign(cameraBobbing, bobbingPreset)

    if (emit) {
      emitter.emit('settings:camera-rig-changed', {
        fov: { ...cameraFov },
        bobbing: { ...cameraBobbing },
      })
      saveSettings()
    }
  }

  // ----------------------------------------
  // Actions - Visual presets
  // ----------------------------------------
  function applyVisualPreset(presetName, emit = true) {
    visualPreset.value = presetName

    const preset = SPEEDLINES_PRESETS[presetName] || SPEEDLINES_PRESETS.default
    Object.assign(speedLines, preset)

    if (emit) {
      emitter.emit('settings:postprocess-changed', {
        speedLines: { ...speedLines },
      })
      saveSettings()
    }
  }

  // ----------------------------------------
  // Actions - Environment settings
  // ----------------------------------------
  function setEnvSkyMode(mode) {
    envSkyMode.value = mode
    emitter.emit('settings:environment-changed', { skyMode: mode })
    saveSettings()
  }

  function setEnvSunIntensity(value) {
    envSunIntensity.value = value
    emitter.emit('settings:environment-changed', { sunIntensity: value })
    saveSettings()
  }

  function setEnvAmbientIntensity(value) {
    envAmbientIntensity.value = value
    emitter.emit('settings:environment-changed', { ambientIntensity: value })
    saveSettings()
  }

  function setEnvFogDensity(value) {
    envFogDensity.value = value
    emitter.emit('settings:environment-changed', { fogDensity: value })
    saveSettings()
  }

  // ----------------------------------------
  // Actions - Chunk settings
  // ----------------------------------------
  function setChunkViewDistance(value) {
    chunkViewDistance.value = Math.round(value)
    emitter.emit('settings:chunks-changed', { viewDistance: chunkViewDistance.value })
    saveSettings()
  }

  function setChunkUnloadPadding(value) {
    chunkUnloadPadding.value = Math.round(value)
    emitter.emit('settings:chunks-changed', { unloadPadding: chunkUnloadPadding.value })
    saveSettings()
  }

  // ----------------------------------------
  // Actions - Apply all environment at once
  // ----------------------------------------
  function applyAllEnvironment() {
    emitter.emit('settings:environment-changed', {
      skyMode: envSkyMode.value,
      sunIntensity: envSunIntensity.value,
      ambientIntensity: envAmbientIntensity.value,
      fogDensity: envFogDensity.value,
    })
  }

  // ----------------------------------------
  // Reset to defaults
  // ----------------------------------------
  function resetToDefaults() {
    shadowQuality.value = DEFAULT_SETTINGS.shadowQuality
    mouseSensitivity.value = DEFAULT_SETTINGS.mouseSensitivity
    masterVolume.value = DEFAULT_SETTINGS.masterVolume
    musicVolume.value = DEFAULT_SETTINGS.musicVolume
    sfxVolume.value = DEFAULT_SETTINGS.sfxVolume

    // Reset camera
    applyCameraPreset('default', false)

    // Reset visual
    applyVisualPreset('default', false)

    // Reset environment
    envSkyMode.value = ENV_DEFAULTS.skyMode
    envSunIntensity.value = ENV_DEFAULTS.sunIntensity
    envAmbientIntensity.value = ENV_DEFAULTS.ambientIntensity
    envFogDensity.value = ENV_DEFAULTS.fogDensity

    // Reset chunks
    chunkViewDistance.value = CHUNK_DEFAULTS.viewDistance
    chunkUnloadPadding.value = CHUNK_DEFAULTS.unloadPadding

    // Emit events for all settings
    emitter.emit('shadow:quality-changed', shadowQuality.value)
    emitter.emit('settings:mouse-sensitivity-changed', mouseSensitivity.value)
    emitter.emit('settings:camera-rig-changed', {
      fov: { ...cameraFov },
      bobbing: { ...cameraBobbing },
    })
    emitter.emit('settings:postprocess-changed', {
      speedLines: { ...speedLines },
    })
    applyAllEnvironment()
    emitter.emit('settings:chunks-changed', {
      viewDistance: chunkViewDistance.value,
      unloadPadding: chunkUnloadPadding.value,
    })

    saveSettings()
  }

  // Load on store creation
  loadSettings()

  // Emit initial values to Three.js after a short delay (ensure listeners are ready)
  setTimeout(() => {
    emitter.emit('shadow:quality-changed', shadowQuality.value)
    emitter.emit('settings:mouse-sensitivity-changed', mouseSensitivity.value)
    emitter.emit('settings:camera-rig-changed', {
      fov: { ...cameraFov },
      bobbing: { ...cameraBobbing },
    })
    emitter.emit('settings:postprocess-changed', {
      speedLines: { ...speedLines },
    })
    applyAllEnvironment()
    emitter.emit('settings:chunks-changed', {
      viewDistance: chunkViewDistance.value,
      unloadPadding: chunkUnloadPadding.value,
    })
  }, 100)

  // ----------------------------------------
  // Return Public API
  // ----------------------------------------
  return {
    // State - Basic
    shadowQuality,
    mouseSensitivity,
    masterVolume,
    musicVolume,
    sfxVolume,

    // State - Camera
    cameraPreset,
    cameraFov,
    cameraBobbing,

    // State - Visual
    visualPreset,
    speedLines,

    // State - Environment
    envSkyMode,
    envSunIntensity,
    envAmbientIntensity,
    envFogDensity,

    // State - Chunks
    chunkViewDistance,
    chunkUnloadPadding,

    // Actions - Basic
    setShadowQuality,
    setMouseSensitivity,
    setMasterVolume,
    setMusicVolume,
    setSfxVolume,

    // Actions - Camera
    applyCameraPreset,

    // Actions - Visual
    applyVisualPreset,

    // Actions - Environment
    setEnvSkyMode,
    setEnvSunIntensity,
    setEnvAmbientIntensity,
    setEnvFogDensity,
    applyAllEnvironment,

    // Actions - Chunks
    setChunkViewDistance,
    setChunkUnloadPadding,

    // Utils
    resetToDefaults,
    loadSettings,
    saveSettings,
  }
})
