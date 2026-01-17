import { INTERACTION_CONFIG } from '../config/interaction-config.js'
import Experience from '../experience.js'
import emitter from '../utils/event-bus.js'

/**
 * BlockMiningController
 * - Manages block mining logic: progress tracking, state management, shader communication
 * - Listens to mouse events and raycast results
 * - Broadcasts mining progress to UI layer via mitt
 */
export default class BlockMiningController {
  constructor(options = {}) {
    this.experience = new Experience()
    this.time = this.experience.time
    this.debug = this.experience.debug

    // Mining parameters
    this.params = {
      enabled: options.enabled ?? true,
      miningDuration: options.miningDuration ?? INTERACTION_CONFIG.mining.duration, // Default from config
    }

    // Mining state
    this.isMining = false // Is currently mining
    this.miningStartTime = 0 // Mining start time
    this.miningProgress = 0 // Current mining progress [0, 1]
    this.currentTarget = null // Current mining target { chunkX, chunkZ, worldBlock, instanceId, mesh }

    // Bind event handlers
    this._onMouseDown = this._onMouseDown.bind(this)
    this._onMouseUp = this._onMouseUp.bind(this)

    // Listen to mouse events
    emitter.on('input:mouse_down', this._onMouseDown)
    emitter.on('input:mouse_up', this._onMouseUp)

    if (this.debug.active) {
      this.debugInit()
    }
  }

  /**
   * Mouse down event: start mining
   */
  _onMouseDown(event) {
    if (!this.params.enabled || event.button !== 0)
      return

    const raycaster = this.experience.world?.blockRaycaster
    if (!raycaster || !raycaster.current)
      return

    // Start mining
    this.isMining = true
    this.miningStartTime = this.time.elapsed
    this.miningProgress = 0
    this.currentTarget = this._captureTarget(raycaster.current)

    // Broadcast mining start event
    emitter.emit('game:mining-start', {
      progress: 0,
      target: this.currentTarget,
    })
  }

  /**
   * Mouse up event: stop mining
   */
  _onMouseUp(event) {
    if (event.button !== 0)
      return

    if (this.isMining) {
      this._resetMining()
      emitter.emit('game:mining-cancel')
    }
  }

  /**
   * Capture current mining target info
   */
  _captureTarget(raycastInfo) {
    return {
      chunkX: raycastInfo.chunkX,
      chunkZ: raycastInfo.chunkZ,
      worldBlock: { ...raycastInfo.worldBlock },
      instanceId: raycastInfo.instanceId,
      blockId: raycastInfo.blockId,
    }
  }

  /**
   * Check if target has changed
   */
  _isTargetChanged(newInfo) {
    if (!this.currentTarget || !newInfo)
      return true

    return (
      this.currentTarget.chunkX !== newInfo.chunkX
      || this.currentTarget.chunkZ !== newInfo.chunkZ
      || this.currentTarget.worldBlock.x !== newInfo.worldBlock.x
      || this.currentTarget.worldBlock.y !== newInfo.worldBlock.y
      || this.currentTarget.worldBlock.z !== newInfo.worldBlock.z
    )
  }

  /**
   * Reset mining state
   */
  _resetMining() {
    this.isMining = false
    this.miningProgress = 0
    this.currentTarget = null
  }

  /**
   * Complete mining: destroy block
   */
  _completeMining() {
    if (!this.currentTarget)
      return

    const { worldBlock } = this.currentTarget
    const chunkManager = this.experience.terrainDataManager

    if (chunkManager) {
      chunkManager.removeBlockWorld(worldBlock.x, worldBlock.y, worldBlock.z)
    }

    emitter.emit('game:mining-complete', {
      target: this.currentTarget,
    })

    this._resetMining()
  }

  /**
   * Per-frame update
   */
  update() {
    if (!this.params.enabled || !this.isMining) {
      return
    }

    const raycaster = this.experience.world?.blockRaycaster
    if (!raycaster || !raycaster.current) {
      // Target lost, cancel mining
      this._resetMining()
      emitter.emit('game:mining-cancel')
      return
    }

    // Check if target has changed
    if (this._isTargetChanged(raycaster.current)) {
      // Target switched, reset mining
      this._resetMining()
      emitter.emit('game:mining-cancel')
      return
    }

    // Update mining progress
    const elapsed = this.time.elapsed - this.miningStartTime
    this.miningProgress = Math.min(elapsed / this.params.miningDuration, 1)

    // Broadcast progress update
    emitter.emit('game:mining-progress', {
      progress: this.miningProgress,
      target: this.currentTarget,
    })

    // Mining complete
    if (this.miningProgress >= 1) {
      this._completeMining()
    }
  }

  /**
   * Debug panel
   */
  debugInit() {
    this.debugFolder = this.debug.ui.addFolder({
      title: 'Block Mining Controller',
      expanded: false,
    })

    this.debugFolder.addBinding(this.params, 'enabled', { label: 'Enabled' })

    this.debugFolder.addBinding(this.params, 'miningDuration', {
      label: 'Duration (ms)',
      min: 100,
      max: 5000,
      step: 100,
    })

    const monitor = this.debugFolder.addFolder({ title: 'Status Monitor', expanded: true })

    monitor.addBinding(this, 'isMining', { label: 'Is Mining', readonly: true })
    monitor.addBinding(this, 'miningProgress', {
      label: 'Progress',
      readonly: true,
      min: 0,
      max: 1,
    })
  }

  /**
   * Destroy
   */
  destroy() {
    emitter.off('input:mouse_down', this._onMouseDown)
    emitter.off('input:mouse_up', this._onMouseUp)
    this._resetMining()
  }
}
