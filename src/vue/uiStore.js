/**
 * UI Store - Menu System State Machine
 * Manages screen states, menu views, and world state
 */
import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import {
  buildWorldGenParams,
  DEFAULT_WORLDGEN_DRAFT,
  WORLDGEN_PRESETS,
} from '../js/config/worldgen-presets.js'
import emitter from '../js/utils/event-bus.js'
import { useSettingsStore } from './settingsStore.js'

// ========================================
// Constants
// ========================================
const SEED_MAX = 2_000_000_000
const SEED_REGEX = /^\d+$/

// ========================================
// UI Store Definition
// ========================================
export const useUiStore = defineStore('ui', () => {
  const settingsStore = useSettingsStore()

  // ----------------------------------------
  // State
  // ----------------------------------------

  /** Current screen: 'loading' | 'mainMenu' | 'playing' | 'pauseMenu' | 'settings' */
  const screen = ref('loading')

  /** Main menu sub-view: 'root' | 'worldSetup' | 'howToPlay' */
  const mainMenuView = ref('root')

  /** Whether a new world creation is pending (for overwrite confirmation) */
  const pendingNewWorld = ref(false)

  /** World state */
  const world = ref({
    hasWorld: false,
    seed: null,
  })

  /** Seed input draft (user typing) */
  const seedDraft = ref('')

  /** Seed validation error message */
  const seedError = ref(null)

  /** Where to return after settings: 'mainMenu' | 'pauseMenu' | null */
  const returnTo = ref(null)

  /** Whether the game is paused */
  const isPaused = ref(false)

  /** WorldGen draft (Advanced panel state) */
  const worldGenDraft = reactive({
    presetId: DEFAULT_WORLDGEN_DRAFT.presetId,
    magnitude: DEFAULT_WORLDGEN_DRAFT.magnitude,
    treeMinHeight: DEFAULT_WORLDGEN_DRAFT.treeMinHeight,
    treeMaxHeight: DEFAULT_WORLDGEN_DRAFT.treeMaxHeight,
    viewDistance: 2,
  })

  /** Whether Advanced panel is expanded */
  const advancedExpanded = ref(false)

  // ----------------------------------------
  // Computed
  // ----------------------------------------

  /** Check if current screen shows a menu overlay */
  const isMenuVisible = computed(() => {
    return ['loading', 'mainMenu', 'pauseMenu', 'settings'].includes(screen.value)
  })

  // ----------------------------------------
  // Seed Helpers
  // ----------------------------------------

  /**
   * Normalize seed draft (trim whitespace)
   */
  function normalizeSeedDraft() {
    seedDraft.value = seedDraft.value.trim()
  }

  /**
   * Check if seed draft is valid (empty or numeric only)
   * @returns {boolean}
   */
  function isSeedValidNumeric() {
    const trimmed = seedDraft.value.trim()
    // Empty is valid (will generate random)
    if (trimmed === '')
      return true
    // Must be numeric only
    return SEED_REGEX.test(trimmed)
  }

  /**
   * Get or create seed number
   * - If seedDraft is empty, generate random
   * - If seedDraft is valid, parse to number
   * @returns {number}
   */
  function getOrCreateSeedNumber() {
    const trimmed = seedDraft.value.trim()
    if (trimmed === '') {
      return Math.floor(Math.random() * SEED_MAX)
    }
    return Number.parseInt(trimmed, 10)
  }

  /**
   * Generate a random seed and set to draft
   */
  function randomizeSeed() {
    const randomSeed = Math.floor(Math.random() * SEED_MAX)
    seedDraft.value = String(randomSeed)
    seedError.value = null
  }

  /**
   * Set seed draft with validation
   * @param {string} value
   */
  function setSeedDraft(value) {
    seedDraft.value = value
    // Validate on change
    if (value.trim() !== '' && !SEED_REGEX.test(value.trim())) {
      seedError.value = 'Seed must be numeric only'
    }
    else {
      seedError.value = null
    }
  }

  // ----------------------------------------
  // Actions: Screen Navigation
  // ----------------------------------------

  /**
   * Navigate to Main Menu
   * @param {object} options
   * @param {boolean} [options.preservePause] - Keep isPaused state
   */
  function toMainMenu({ preservePause = false } = {}) {
    screen.value = 'mainMenu'
    mainMenuView.value = 'root'
    if (!preservePause) {
      isPaused.value = true
    }
    emitter.emit('ui:pause-changed', true)
  }

  /**
   * Navigate to Playing state
   */
  function toPlaying() {
    screen.value = 'playing'
    isPaused.value = false
    emitter.emit('ui:pause-changed', false)
    emitter.emit('game:request_pointer_lock')
  }

  /**
   * Navigate to Pause Menu
   */
  function toPauseMenu() {
    screen.value = 'pauseMenu'
    isPaused.value = true
    emitter.emit('ui:pause-changed', true)
  }

  /**
   * Navigate to Settings
   * @param {'mainMenu' | 'pauseMenu'} from - Where to return after settings
   */
  function toSettings(from) {
    returnTo.value = from
    screen.value = 'settings'
  }

  /**
   * Return from Settings to previous screen
   */
  function exitSettings() {
    if (returnTo.value === 'pauseMenu') {
      screen.value = 'pauseMenu'
    }
    else {
      screen.value = 'mainMenu'
    }
    returnTo.value = null
  }

  // ----------------------------------------
  // Actions: Main Menu Views
  // ----------------------------------------

  /**
   * Enter World Setup view
   * @param {object} options
   * @param {'create' | 'newWorld'} options.mode
   */
  function enterWorldSetup({ mode }) {
    mainMenuView.value = 'worldSetup'
    pendingNewWorld.value = mode === 'newWorld'
    // Reset seed draft when entering
    seedDraft.value = ''
    seedError.value = null
    // Reset worldGen draft
    resetWorldGenDraft()
    advancedExpanded.value = false
  }

  /**
   * Back to Main Menu root view
   */
  function backToMainRoot() {
    mainMenuView.value = 'root'
    pendingNewWorld.value = false
    seedDraft.value = ''
    seedError.value = null
    advancedExpanded.value = false
  }

  /**
   * Enter How to Play view
   */
  function toHowToPlay() {
    mainMenuView.value = 'howToPlay'
  }

  /**
   * Exit How to Play back to Main Menu root
   */
  function exitHowToPlay() {
    backToMainRoot()
  }

  // ----------------------------------------
  // Actions: WorldGen Draft
  // ----------------------------------------

  /**
   * Apply WorldGen preset to draft
   * @param {string} presetId
   */
  function applyWorldGenPreset(presetId) {
    const preset = WORLDGEN_PRESETS[presetId]
    if (!preset)
      return

    worldGenDraft.presetId = presetId
    worldGenDraft.magnitude = preset.terrain.magnitude
    worldGenDraft.treeMinHeight = preset.trees.minHeight
    worldGenDraft.treeMaxHeight = preset.trees.maxHeight
    // Keep current viewDistance or reset to 2? Let's keep it manual or default 2
  }

  /**
   * Reset WorldGen draft to defaults
   */
  function resetWorldGenDraft() {
    worldGenDraft.presetId = DEFAULT_WORLDGEN_DRAFT.presetId
    worldGenDraft.magnitude = DEFAULT_WORLDGEN_DRAFT.magnitude
    worldGenDraft.treeMinHeight = DEFAULT_WORLDGEN_DRAFT.treeMinHeight
    worldGenDraft.treeMaxHeight = DEFAULT_WORLDGEN_DRAFT.treeMaxHeight
    worldGenDraft.viewDistance = 2
  }

  /**
   * Toggle Advanced panel
   */
  function toggleAdvanced() {
    advancedExpanded.value = !advancedExpanded.value
  }

  // ----------------------------------------
  // Actions: World Management
  // ----------------------------------------

  /**
   * Create world (first time or after confirmation)
   * @param {number} seed
   */
  function createWorld(seed) {
    world.value = {
      hasWorld: true,
      seed: String(seed),
    }

    // Build terrain/trees params from draft
    const { terrain, trees } = buildWorldGenParams(worldGenDraft.presetId, {
      magnitude: worldGenDraft.magnitude,
      treeMinHeight: worldGenDraft.treeMinHeight,
      treeMaxHeight: worldGenDraft.treeMaxHeight,
    })

    // Apply view distance
    settingsStore.setChunkViewDistance(worldGenDraft.viewDistance)

    toPlaying()
    emitter.emit('game:create_world', { seed, terrain, trees })
  }

  /**
   * Reset world (overwrite existing)
   * @param {number} seed
   */
  function resetWorld(seed) {
    world.value = {
      hasWorld: true,
      seed: String(seed),
    }
    pendingNewWorld.value = false

    // Build terrain/trees params from draft
    const { terrain, trees } = buildWorldGenParams(worldGenDraft.presetId, {
      magnitude: worldGenDraft.magnitude,
      treeMinHeight: worldGenDraft.treeMinHeight,
      treeMaxHeight: worldGenDraft.treeMaxHeight,
    })

    // Apply view distance
    settingsStore.setChunkViewDistance(worldGenDraft.viewDistance)

    toPlaying()
    emitter.emit('game:reset_world', { seed, terrain, trees })
  }

  /**
   * Continue playing existing world
   */
  function continueWorld() {
    toPlaying()
  }

  // ----------------------------------------
  // Actions: Handle ESC key
  // ----------------------------------------

  /**
   * Handle ESC key press based on current screen
   */
  function handleEscape() {
    switch (screen.value) {
      case 'settings':
        exitSettings()
        break
      case 'pauseMenu':
        toPlaying()
        break
      case 'playing':
        toPauseMenu()
        break
      case 'mainMenu':
        // 在 mainMenu 的子视图中（worldSetup/howToPlay）统一返回 root
        if (mainMenuView.value !== 'root')
          backToMainRoot()
        break
      // 'loading', 'mainMenu' - ignore ESC
    }
  }

  // ----------------------------------------
  // Return Public API
  // ----------------------------------------
  return {
    // State
    screen,
    mainMenuView,
    pendingNewWorld,
    world,
    seedDraft,
    seedError,
    returnTo,
    isPaused,
    worldGenDraft,
    advancedExpanded,

    // Computed
    isMenuVisible,

    // Seed helpers
    normalizeSeedDraft,
    isSeedValidNumeric,
    getOrCreateSeedNumber,
    randomizeSeed,
    setSeedDraft,

    // Navigation
    toMainMenu,
    toPlaying,
    toPauseMenu,
    toSettings,
    exitSettings,

    // Main Menu
    enterWorldSetup,
    backToMainRoot,
    toHowToPlay,
    exitHowToPlay,

    // WorldGen
    applyWorldGenPreset,
    resetWorldGenDraft,
    toggleAdvanced,

    // World
    createWorld,
    resetWorld,
    continueWorld,

    // ESC
    handleEscape,
  }
})
