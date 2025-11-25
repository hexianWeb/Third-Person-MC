import * as THREE from 'three'
import Experience from '../experience.js'
import Environment from './environment.js'
import Floor from './floor.js'
import Player from './player.js'

export default class World {
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources

    this.scene.add(new THREE.AxesHelper(5))
    this.floor = new Floor(400, 1)

    // Environment
    this.resources.on('ready', () => {
      // Setup
      this.player = new Player()
      this.environment = new Environment()
    })
  }

  update() {
    if (this.player)
      this.player.update()
    if (this.floor)
      this.floor.update()
  }
}
