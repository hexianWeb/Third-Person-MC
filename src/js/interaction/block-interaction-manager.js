import { INTERACTION_CONFIG } from '../config/interaction-config.js'
import Experience from '../experience.js'
import emitter from '../utils/event-bus.js'
import { blocks } from '../world/terrain/blocks-config.js'

/**
 * BlockInteractionManager
 * - Manages the current interaction mode (Add vs Remove)
 * - Toggles between Mining (Remove) and Placing (Add)
 * - Listens to 'Q' key for mode switching
 */
export default class BlockInteractionManager {
  constructor(options = {}) {
    this.experience = new Experience()

    // Dependencies
    this.chunkManager = options.chunkManager
    this.raycaster = options.blockRaycaster
    this.miningController = options.blockMiningController

    // State
    this.mode = INTERACTION_CONFIG.modes.REMOVE // 'remove' | 'add'

    // Bindings
    this._onToggleMode = this._onToggleMode.bind(this)
    this._onMouseDown = this._onMouseDown.bind(this)

    // Listeners
    emitter.on('input:toggle_block_edit_mode', this._onToggleMode)
    emitter.on('input:mouse_down', this._onMouseDown)

    // Initialize state (Default to Remove/Mining mode)
    this._updateMode()
  }

  _onToggleMode() {
    this.mode = this.mode === INTERACTION_CONFIG.modes.REMOVE ? INTERACTION_CONFIG.modes.ADD : INTERACTION_CONFIG.modes.REMOVE
    this._updateMode()
  }

  _updateMode() {
    // 1. Notify UI / Visual Helpers
    emitter.emit('game:block_edit_mode_changed', { mode: this.mode })

    // 2. Configure Mining Controller
    if (this.miningController) {
      if (this.mode === INTERACTION_CONFIG.modes.REMOVE) {
        this.miningController.params.enabled = true
      }
      else {
        this.miningController.params.enabled = false
        // Ensure any active mining is cancelled
        this.miningController._resetMining()
        emitter.emit('game:mining-cancel')
      }
    }
  }

  _onMouseDown(event) {
    // Left click (0) only
    if (event.button !== 0)
      return

    // Ignore if not in ADD mode
    if (this.mode !== INTERACTION_CONFIG.modes.ADD)
      return

    // Ensure we have a valid target
    if (!this.raycaster || !this.raycaster.current)
      return

    this._placeBlock(this.raycaster.current)
  }

  _placeBlock(target) {
    const { worldBlock, face } = target

    if (!face || !face.normal)
      return

    // Calculate target position based on normal
    const nx = Math.round(face.normal.x)
    const ny = Math.round(face.normal.y)
    const nz = Math.round(face.normal.z)

    const targetX = worldBlock.x + nx
    const targetY = worldBlock.y + ny
    const targetZ = worldBlock.z + nz

    // For now, hardcode to Stone block (or we could have a selected block slot)
    const blockToPlace = blocks.stone.id

    // Check availability (optional: collision check with player?)
    // For now, just place it
    if (this.chunkManager) {
      this.chunkManager.addBlockWorld(targetX, targetY, targetZ, blockToPlace)

      // Optional: Emit placement sound/event
      emitter.emit('game:block-place', { x: targetX, y: targetY, z: targetZ })
    }
  }

  destroy() {
    emitter.off('input:toggle_block_edit_mode', this._onToggleMode)
    emitter.off('input:mouse_down', this._onMouseDown)
  }
}
