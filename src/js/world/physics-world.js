import RAPIER from '@dimforge/rapier3d-compat'

import Experience from '../experience.js'
import emitter from '../utils/event-bus.js'

export default class PhysicsWorld {
  constructor(gravity = 9.81) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.ready = false

    this.init(gravity)
  }

  async init(gravity) {
    try {
      await RAPIER.init()
      this.world = new RAPIER.World({ x: 0.0, y: -gravity, z: 0.0 })
      this.ready = true
      console.log('Rapier Physics World Initialized')
      emitter.emit('physics:ready')
    }
    catch (error) {
      console.error('Failed to initialize Rapier:', error)
    }
  }

  update() {
    if (this.ready) {
      this.world.step()
    }
  }
}
