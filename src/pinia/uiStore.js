import { useSettingsStore } from '@pinia/settingsStore.js'
import emitter from '@three/utils/event/event-bus.js'
import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import { CHUNK_DEFAULTS } from '../js/config/chunk-config.js'
import {
  buildWorldGenParams,
  DEFAULT_WORLDGEN_DRAFT,
  WORLDGEN_PRESETS,
} from '../js/config/worldgen-presets.js'
import { useAchievementStore } from './achievementStore.js'
import { useInventoryStore } from './inventoryStore.js'

/**
 * UI Store - Menu System State Machine
 * Manages screen states, menu views, and world state
 */

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

  /** Current screen: 'loading' | 'mainMenu' | 'playing' | 'pauseMenu' | 'settings' | 'inventory' | 'craftingTable' */
  const screen = ref('loading')

  /** Main menu sub-view: 'root' | 'worldSetup' | 'howToPlay' | 'skinSelector' | 'achievements' */
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
    viewDistance: CHUNK_DEFAULTS.viewDistance,
  })

  /** Whether Advanced panel is expanded */
  const advancedExpanded = ref(false)

  // ----------------------------------------
  // Computed
  // ----------------------------------------

  /** Check if current screen shows a menu overlay */
  const isMenuVisible = computed(() => {
    return ['loading', 'mainMenu', 'pauseMenu', 'settings', 'inventory', 'craftingTable'].includes(screen.value)
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
   * @returns {boolean} True if empty or numeric only
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
   * @returns {number} Seed value (random or parsed)
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
    // 从背包/工作台返回时，尝试收回光标物品
    if (screen.value === 'inventory' || screen.value === 'craftingTable')
      useInventoryStore().returnCursorToInventory()

    screen.value = 'playing'
    mainMenuView.value = 'root'
    isPaused.value = false
    emitter.emit('ui:pause-changed', false)
    emitter.emit('game:request_pointer_lock')
  }

  /**
   * Navigate to Pause Menu
   */
  function toPauseMenu() {
    screen.value = 'pauseMenu'
    mainMenuView.value = 'root'
    isPaused.value = true
    emitter.emit('ui:pause-changed', true)
  }

  /**
   * 打开玩家背包（暂停 + 释放指针）
   */
  function toInventory() {
    screen.value = 'inventory'
    isPaused.value = true
    emitter.emit('ui:pause-changed', true)
  }

  /**
   * 打开工作台 3x3 界面
   */
  function toCraftingTable() {
    screen.value = 'craftingTable'
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
    screen.value = returnTo.value === 'pauseMenu' ? 'pauseMenu' : 'mainMenu'
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

  /**
   * Enter Skin Selector view
   */
  function toSkinSelector() {
    mainMenuView.value = 'skinSelector'
  }

  /**
   * Exit sub-view (skin selector, achievements, etc.) back to previous screen
   */
  function exitSubView() {
    if (screen.value === 'pauseMenu')
      mainMenuView.value = 'root'
    else
      backToMainRoot()
  }

  /**
   * Exit Skin Selector back to previous view
   */
  function exitSkinSelector() {
    exitSubView()
  }

  /**
   * Enter Achievements view
   */
  function toAchievements() {
    mainMenuView.value = 'achievements'
  }

  /**
   * Exit Achievements back to previous view
   */
  function exitAchievements() {
    exitSubView()
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
  }

  /**
   * Reset WorldGen draft to defaults
   */
  function resetWorldGenDraft() {
    worldGenDraft.presetId = DEFAULT_WORLDGEN_DRAFT.presetId
    worldGenDraft.magnitude = DEFAULT_WORLDGEN_DRAFT.magnitude
    worldGenDraft.treeMinHeight = DEFAULT_WORLDGEN_DRAFT.treeMinHeight
    worldGenDraft.treeMaxHeight = DEFAULT_WORLDGEN_DRAFT.treeMaxHeight
    worldGenDraft.viewDistance = CHUNK_DEFAULTS.viewDistance
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
   * Shared logic for create/reset world
   * @param {number} seed
   * @param {'game:create_world' | 'game:reset_world'} eventName
   */
  function _applyWorldAndStart(seed, eventName) {
    const achievementStore = useAchievementStore()
    achievementStore.reset()

    world.value = { hasWorld: true, seed: String(seed) }
    if (eventName === 'game:reset_world')
      pendingNewWorld.value = false

    const { terrain, trees } = buildWorldGenParams(worldGenDraft.presetId, {
      magnitude: worldGenDraft.magnitude,
      treeMinHeight: worldGenDraft.treeMinHeight,
      treeMaxHeight: worldGenDraft.treeMaxHeight,
    })
    settingsStore.setChunkViewDistance(worldGenDraft.viewDistance)

    toPlaying()
    emitter.emit(eventName, { seed, terrain, trees })
  }

  /**
   * Create world (first time or after confirmation)
   * @param {number} seed
   */
  function createWorld(seed) {
    _applyWorldAndStart(seed, 'game:create_world')
  }

  /**
   * Reset world (overwrite existing)
   * @param {number} seed
   */
  function resetWorld(seed) {
    _applyWorldAndStart(seed, 'game:reset_world')
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
      case 'inventory':
      case 'craftingTable':
        toPlaying()
        break
      case 'playing':
        toPauseMenu()
        break
      case 'mainMenu':
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
    toInventory,
    toCraftingTable,
    toSettings,
    exitSettings,

    // Main Menu
    enterWorldSetup,
    backToMainRoot,
    toHowToPlay,
    exitHowToPlay,
    toSkinSelector,
    exitSkinSelector,
    toAchievements,
    exitAchievements,

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
