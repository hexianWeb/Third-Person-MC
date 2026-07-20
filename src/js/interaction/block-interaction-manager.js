import Experience from '../experience.js'
import emitter from '../utils/event/event-bus.js'
import { BLOCK_IDS, blocks } from '../world/terrain/blocks-config.js'

/**
 * BlockInteractionManager
 * - Manages mining / placing via mouse
 * - Uses event-based Hotbar integration for block placement
 * - 工作台右键打开 3x3；非可见方块物品不可放置
 */
export default class BlockInteractionManager {
  constructor(options = {}) {
    this.experience = new Experience()

    // Dependencies
    this.chunkManager = options.chunkManager
    this.raycaster = options.blockRaycaster
    this.miningController = options.blockMiningController

    // State
    this._lastPlaceTime = 0

    // Hotbar state (synced via events from hudStore)
    this._selectedBlockId = null
    this._onHotbarUpdate = this._onHotbarUpdate.bind(this)
    emitter.on('hud:selected-block-update', this._onHotbarUpdate)

    // Bindings
    this._onMouseDown = this._onMouseDown.bind(this)

    // Listeners
    emitter.on('input:mouse_down', this._onMouseDown)

    // Request current selected block from hudStore
    emitter.emit('hud:request-selected-block')
  }

  /**
   * Receive selected block info from hudStore
   */
  _onHotbarUpdate({ blockId }) {
    this._selectedBlockId = blockId
  }

  _onMouseDown(event) {
    // Right click (2) only for placing / opening crafting table
    if (event.button !== 2)
      return

    // Cooldown check (200ms)
    const now = performance.now()
    if (now - this._lastPlaceTime < 200)
      return

    // Ensure we have a valid target
    if (!this.raycaster || !this.raycaster.current)
      return

    // 右键工作台：打开 3x3 界面（仍更新冷却，防连点）
    if (this.raycaster.current.blockId === BLOCK_IDS.CRAFTING_TABLE) {
      this._lastPlaceTime = now
      emitter.emit('ui:open_crafting_table')
      return
    }

    this._placeBlock(this.raycaster.current)
  }

  _placeBlock(target) {
    const { worldBlock, face } = target

    if (!face || !face.normal)
      return

    // Get selected block from Hotbar (synced via event)
    if (!this._selectedBlockId) {
      // No block selected in Hotbar, cannot place
      return
    }

    // 非可见方块（木棍/木镐等）不可放置
    const blockToPlace = this._selectedBlockId
    const isPlaceable = Object.values(blocks).some(b => b.id === blockToPlace && b.visible)
    if (!isPlaceable)
      return

    // Calculate target position based on normal
    const nx = Math.round(face.normal.x)
    const ny = Math.round(face.normal.y)
    const nz = Math.round(face.normal.z)

    const targetX = worldBlock.x + nx
    const targetY = worldBlock.y + ny
    const targetZ = worldBlock.z + nz

    // Check availability (optional: collision check with player?)
    // For now, just place it
    if (this.chunkManager) {
      this._lastPlaceTime = performance.now()
      this.chunkManager.addBlockWorld(targetX, targetY, targetZ, blockToPlace)

      // Consume one item from Hotbar
      emitter.emit('hud:consume-selected-item')

      // Emit placement sound/event
      emitter.emit('game:block-place', { x: targetX, y: targetY, z: targetZ })

      // Emit achievement event
      emitter.emit('player:block_place', { x: targetX, y: targetY, z: targetZ })
    }
  }

  destroy() {
    emitter.off('input:mouse_down', this._onMouseDown)
    emitter.off('hud:selected-block-update', this._onHotbarUpdate)
  }
}
