import RAPIER from '@dimforge/rapier3d-compat'

import Experience from '../experience.js'
import emitter from '../utils/event-bus.js'
import RapierDebugRenderer from './physics-debug.js'

export default class PhysicsWorld {
  constructor(gravity = 9.81) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.debug = this.experience.debug
    this.ready = false

    this.init(gravity)
  }

  async init(gravity) {
    try {
      await RAPIER.init()
      this.world = new RAPIER.World({ x: 0.0, y: -gravity, z: 0.0 })
      this.ready = true
      console.log('Rapier Physics World Initialized')

      // Debug Renderer
      if (this.debug.active) {
        this.debugRenderer = new RapierDebugRenderer(this.scene, this.world)
        this.debugFolder = this.debug.ui.addFolder({ title: 'Physics Debug', expanded: false })
        this.debugFolder.addBinding(this.debugRenderer, 'enabled', { label: 'Show Physics' })
      }

      emitter.emit('physics:ready')
    }
    catch (error) {
      console.error('Failed to initialize Rapier:', error)
    }
  }

  update() {
    if (this.ready) {
      this.world.step()
      if (this.debugRenderer) {
        this.debugRenderer.update()
      }
    }
  }
}
