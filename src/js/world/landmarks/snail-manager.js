import * as THREE from 'three'

import { DRY_TOILET_SNAILS_CONFIG as CFG } from '../../config/dry-toilet-snails-config.js'
import Experience from '../../experience.js'
import { RNG } from '../../tools/rng.js'
import emitter from '../../utils/event/event-bus.js'
import { generateSnailSpawnPoints, resolveSnailCount, shouldConsumeMiningClick } from './dry-toilet-math.js'
import VoxelSnail, { createSharedSnailAssets } from './voxel-snail.js'

export { shouldConsumeMiningClick }

/**
 * 蜗牛管理器：生成、更新、准星左键命中仲裁
 */
export default class SnailManager {
  constructor({ landmark }) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.camera = this.experience.camera.instance
    this.landmark = landmark
    this.snails = []
    this.shared = null
    this.spawned = false
    this.raycaster = new THREE.Raycaster()
    this._center = new THREE.Vector2(0, 0)
    this._onMouseDown = this._onMouseDown.bind(this)
    emitter.on('input:mouse_down', this._onMouseDown)
  }

  _spawn() {
    if (this.spawned || !this.landmark?.isReady())
      return

    const center = this.landmark.getActivityCenter()
    if (!center)
      return

    const seed = this.experience.terrainDataManager?.seed ?? 0
    const rng = new RNG(seed + CFG.rngSalt)
    const count = resolveSnailCount(rng, CFG)
    const points = generateSnailSpawnPoints(rng, {
      count,
      footprint: CFG.footprint,
      marginMax: CFG.activityMarginMax,
      lengthMin: CFG.snailLengthMin,
      lengthMax: CFG.snailLengthMax,
    })

    this.shared = createSharedSnailAssets()
    this.snails = points.map(point => new VoxelSnail({
      shared: this.shared,
      length: point.length,
      x: point.x,
      z: point.z,
      yaw: point.yaw,
      terrainProvider: this.experience.terrainDataManager,
      activityCenter: center,
      footprint: CFG.footprint,
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

    // 标记已处理，供挖矿控制器提前返回
    event.handled = true
    target.startRetract()
  }

  reset() {
    for (const snail of this.snails)
      snail.destroy()
    this.snails = []
    this.shared?.dispose()
    this.shared = null
    this.spawned = false
  }

  destroy() {
    emitter.off('input:mouse_down', this._onMouseDown)
    this.reset()
  }
}
