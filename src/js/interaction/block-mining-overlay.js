import * as THREE from 'three'
import Experience from '../experience.js'
import emitter from '../utils/event-bus.js'

/**
 * BlockMiningOverlay
 * - Creates and manages a crack overlay mesh on the block being mined
 * - Listens to mining events and updates the overlay texture
 */
export default class BlockMiningOverlay {
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources

    // Load crack textures
    this._crackTextures = []
    for (let i = 0; i <= 9; i++) {
      const textureName = `destroy_stage_${i}`
      const texture = this.resources.items[textureName]
      if (texture) {
        texture.minFilter = THREE.NearestFilter
        texture.magFilter = THREE.NearestFilter
        this._crackTextures.push(texture)
      }
    }

    // Create overlay geometry (slightly larger than 1x1x1 cube)
    this._geometry = new THREE.BoxGeometry(1.002, 1.002, 1.002)

    // Create overlay material (transparent, shows crack texture)
    this._material = new THREE.MeshBasicMaterial({
      map: this._crackTextures[0] || null,
      transparent: true,
      opacity: 0.9,
      alphaTest: 0.1,
      depthWrite: false,
      side: THREE.FrontSide,
      color: 0x111111, // Black tint for cracks
    })

    // Create overlay mesh (hidden by default)
    this._mesh = new THREE.Mesh(this._geometry, this._material)
    this._mesh.visible = false
    this._mesh.renderOrder = 999 // Render on top
    this.scene.add(this._mesh)

    // Event listeners
    this._handleMiningProgress = this._handleMiningProgress.bind(this)
    this._handleMiningCancel = this._handleMiningCancel.bind(this)

    emitter.on('game:mining-start', this._handleMiningProgress)
    emitter.on('game:mining-progress', this._handleMiningProgress)
    emitter.on('game:mining-cancel', this._handleMiningCancel)
    emitter.on('game:mining-complete', this._handleMiningCancel)
  }

  /**
   * Handle mining progress: update overlay position and texture
   */
  _handleMiningProgress(payload) {
    const { progress, target } = payload
    if (!target || !target.worldBlock) {
      this._mesh.visible = false
      return
    }

    // Position overlay at target block
    this._mesh.position.set(
      target.worldBlock.x,
      target.worldBlock.y,
      target.worldBlock.z,
    )

    // Select crack texture based on progress (0-9 stages)
    const stage = Math.min(Math.floor(progress * 10), 9)
    if (this._crackTextures[stage]) {
      this._material.map = this._crackTextures[stage]
      this._material.needsUpdate = true
    }

    this._mesh.visible = true
  }

  /**
   * Handle mining cancel/complete: hide overlay
   */
  _handleMiningCancel() {
    this._mesh.visible = false
  }

  /**
   * Dispose resources
   */
  dispose() {
    emitter.off('game:mining-start', this._handleMiningProgress)
    emitter.off('game:mining-progress', this._handleMiningProgress)
    emitter.off('game:mining-cancel', this._handleMiningCancel)
    emitter.off('game:mining-complete', this._handleMiningCancel)

    this.scene.remove(this._mesh)
    this._geometry.dispose()
    this._material.dispose()
  }
}
