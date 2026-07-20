import { useHudStore } from '@pinia/hudStore.js'
import * as THREE from 'three'

import { DRY_TOILET_SNAILS_CONFIG as CFG } from '../../config/dry-toilet-snails-config.js'
import Experience from '../../experience.js'
import emitter from '../../utils/event/event-bus.js'
import { BLOCK_IDS } from '../terrain/blocks-config.js'
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

  /**
   * @param {import('./snail.js').default} snail
   * @returns {boolean} 是否成功拾取
   */
  _pickupSnail(snail) {
    const hud = useHudStore()
    // 热键栏满则不移除世界蜗牛
    if (!hud.addItemToHotbar(BLOCK_IDS.SNAIL, 1)) {
      console.warn('[SnailManager] hotbar full, cannot pickup snail')
      return false
    }

    for (let i = 0; i < 9; i++) {
      if (hud.hotbarItems[i]?.blockId === BLOCK_IDS.SNAIL) {
        hud.selectSlot(i)
        break
      }
    }

    const index = this.snails.indexOf(snail)
    if (index >= 0)
      this.snails.splice(index, 1)

    const worldPos = {
      x: snail.getPosition().x,
      y: snail.getPosition().y,
      z: snail.getPosition().z,
    }
    const { length } = snail
    snail.destroy()

    emitter.emit('game:snail-pickup-complete', { worldPos, length })
    return true
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

    // 蜷缩态：拾取；爬行态：缩壳；其余不消费点击
    if (target.isRetracted()) {
      if (this._pickupSnail(target))
        event.handled = true
      return
    }

    if (target.startRetract()) {
      event.handled = true
    }
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
