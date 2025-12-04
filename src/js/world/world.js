import * as THREE from 'three'
import Experience from '../experience.js'
import Environment from './environment.js'
import Floor from './floor.js'
import Player from './player.js'
import Terrain from './terrain.js'

export default class World {
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources

    this.scene.add(new THREE.AxesHelper(5))
    this.floor = new Floor(128, 1)
    // 隐藏原本的 Grid 地板，只保留物理
    if (this.floor.grid)
      this.floor.grid.visible = false

    // Environment
    this.resources.on('ready', () => {
      // Setup
      this.terrain = new Terrain(256)
      this.player = new Player()
      this.environment = new Environment()
    })
  }

  update() {
    if (this.player)
      this.player.update()
    if (this.floor)
      this.floor.update()
    if (this.terrain)
      this.terrain.update()
  }
}
