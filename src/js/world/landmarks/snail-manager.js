import * as THREE from 'three'

import { DRY_TOILET_SNAILS_CONFIG as CFG } from '../../config/dry-toilet-snails-config.js'
import Experience from '../../experience.js'
import emitter from '../../utils/event/event-bus.js'
import { getSnailSpawnPoints, shouldConsumeMiningClick } from './dry-toilet-math.js'
import Snail from './snail.js'

export { shouldConsumeMiningClick }

/**
 * 蜗牛管理器：加载 snail.glb、生成实例、更新、准星左键命中仲裁
 */
export default class SnailManager {
  constructor({ landmark }) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.camera = this.experience.camera.instance
    this.landmark = landmark
    this.snails = []
    this.template = null
    this.animations = null
    this.spawned = false
    this.raycaster = new THREE.Raycaster()
    this._center = new THREE.Vector2(0, 0)
    this._onMouseDown = this._onMouseDown.bind(this)
    emitter.on('input:mouse_down', this._onMouseDown)
  }

  _spawn() {
    if (this.spawned || !this.landmark?.isReady())
      return

    if (!this.landmark.getActivityCenter())
      return

    const gltf = this.experience.resources.items[CFG.snailResourceName]
    if (!gltf?.scene) {
      throw new Error(`[SnailManager] 缺少资源 ${CFG.snailResourceName}（models/snail.glb）`)
    }

    this.template = gltf.scene
    this.animations = gltf.animations || []
    this.snails = getSnailSpawnPoints({
      lengthMin: CFG.snailLengthMin,
      lengthMax: CFG.snailLengthMax,
    }).map(point => new Snail({
      template: this.template,
      animations: this.animations,
      length: point.length,
      x: point.x,
      z: point.z,
      yaw: point.yaw,
      terrainProvider: this.experience.terrainDataManager,
    }))
    this.spawned = true
  }

  /**
   * @param {number} dtSec 秒
   */
  update(dtSec) {
    if (!this.spawned)
      this._spawn()

    for (const snail of this.snails)
      snail.update(dtSec)
  }

  _onMouseDown(event) {
    if (event.button !== 0 || !this.spawned)
      return

    this.raycaster.setFromCamera(this._center, this.camera)
    this.raycaster.far = CFG.clickDistance + 1

    const meshes = this.snails.flatMap(snail => snail.getClickMeshes())
    if (!meshes.length)
      return

    const hits = this.raycaster.intersectObjects(meshes, false)
    if (!hits.length)
      return

    const target = hits[0].object?.userData?.snailRef
    if (!target)
      return

    const player = this.experience.world?.player
    if (!player?.movement?.position)
      return

    const distance = player.movement.position.distanceTo(target.getPosition())
    if (!shouldConsumeMiningClick({
      hitSnail: true,
      distance,
      maxDistance: CFG.clickDistance,
    })) {
      return
    }

    event.handled = true
    target.startRetract()
  }

  reset() {
    for (const snail of this.snails)
      snail.destroy()
    this.snails = []
    this.template = null
    this.animations = null
    this.spawned = false
  }

  destroy() {
    emitter.off('input:mouse_down', this._onMouseDown)
    this.reset()
  }
}
