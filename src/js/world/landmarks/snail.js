import * as THREE from 'three'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'

import { DRY_TOILET_SNAILS_CONFIG as CFG } from '../../config/dry-toilet-snails-config.js'
import Experience from '../../experience.js'
import {
  createSnailFsm,
  isInSnailZone,
  SNAIL_STATES,
  snailFsmOnClick,
  snailFsmUpdate,
} from './dry-toilet-math.js'

const FADE_SEC = 0.12
const CLIP_NAMES = ['crawl', 'retract', 'emerge']

/**
 * 最短路径角度插值
 * @param {number} from
 * @param {number} to
 * @param {number} t
 */
function lerpAngle(from, to, t) {
  let diff = to - from
  while (diff > Math.PI)
    diff -= Math.PI * 2
  while (diff < -Math.PI)
    diff += Math.PI * 2
  return from + diff * t
}

/**
 * 蜗牛实例：克隆 snail.glb，用 AnimationMixer 播放 crawl / retract / emerge
 */
export default class Snail {
  /**
   * @param {object} options
   * @param {THREE.Object3D} options.template
   * @param {THREE.AnimationClip[]} options.animations
   * @param {number} options.length
   * @param {number} options.x
   * @param {number} options.z
   * @param {number} options.yaw
   * @param {object} options.terrainProvider
   */
  constructor({
    template,
    animations,
    length,
    x,
    z,
    yaw,
    terrainProvider,
  }) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.terrainProvider = terrainProvider
    this.length = length
    this.fsm = createSnailFsm(CFG)
    this._prevFsmState = this.fsm.state

    this.group = new THREE.Group()
    this.group.name = 'Snail'
    this.group.position.set(x, 0, z)
    this.group.rotation.y = yaw
    // 目标朝向；视觉 yaw 向其 lerp
    this._targetYaw = yaw
    this._forward = new THREE.Vector3()

    this.model = SkeletonUtils.clone(template)
    this.model.name = 'SnailModel'
    const scale = length / CFG.snailRefLocalLength
    this.model.scale.setScalar(scale)
    this.model.position.y = 0.5 * scale
    this.group.add(this.model)

    this._clickMeshes = []
    this.model.traverse((obj) => {
      if (!obj.isMesh)
        return
      obj.castShadow = true
      obj.receiveShadow = true
      obj.userData.snailRef = this
      this._clickMeshes.push(obj)
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const material of materials) {
        if (!material?.map)
          continue
        material.map.magFilter = THREE.NearestFilter
        material.map.minFilter = THREE.NearestFilter
        material.map.generateMipmaps = false
        material.map.needsUpdate = true
      }
    })

    this._initAnimation(animations)
    this._turnTimerSec = (x + z) * 0.17 % CFG.turnNoiseInterval
    this._snapToGround()
    this.scene.add(this.group)
  }

  /**
   * @param {THREE.AnimationClip[]} animations
   */
  _initAnimation(animations) {
    this.mixer = new THREE.AnimationMixer(this.model)
    this.actions = {}

    for (const clip of animations || []) {
      const key = String(clip.name || '').toLowerCase()
      if (!CLIP_NAMES.includes(key))
        continue

      const action = this.mixer.clipAction(clip)
      if (key === 'crawl') {
        action.setLoop(THREE.LoopRepeat)
      }
      else {
        action.setLoop(THREE.LoopOnce)
        action.clampWhenFinished = true
      }
      this.actions[key] = action
    }

    for (const name of CLIP_NAMES) {
      if (!this.actions[name])
        console.warn(`[Snail] missing clip: ${name}`)
    }

    if (this.actions.retract) {
      const duration = this.actions.retract.getClip().duration
      if (duration > 0)
        this.actions.retract.timeScale = duration / (CFG.retractMs / 1000)
    }
    if (this.actions.emerge) {
      const duration = this.actions.emerge.getClip().duration
      if (duration > 0)
        this.actions.emerge.timeScale = duration / (CFG.emergeMs / 1000)
    }

    this.currentAction = this.actions.crawl || null
    this.currentAction?.reset().fadeIn(FADE_SEC).play()
  }

  _syncAnimationToFsm() {
    if (this.fsm.state === this._prevFsmState)
      return
    this._prevFsmState = this.fsm.state

    let next = null
    if (this.fsm.state === SNAIL_STATES.CRAWLING)
      next = this.actions.crawl
    else if (this.fsm.state === SNAIL_STATES.RETRACTING)
      next = this.actions.retract
    else if (this.fsm.state === SNAIL_STATES.EMERGING)
      next = this.actions.emerge

    if (!next || next === this.currentAction)
      return

    next.reset().fadeIn(FADE_SEC).play()
    this.currentAction?.fadeOut(FADE_SEC)
    this.currentAction = next
  }

  _surfaceY(x, z) {
    return this.terrainProvider?.getTopSolidYWorld?.(x, z)
  }

  _snapToGround() {
    const surfaceY = this._surfaceY(this.group.position.x, this.group.position.z)
    if (surfaceY == null)
      return

    const scale = this.length / CFG.snailRefLocalLength
    this.group.position.y = surfaceY + 0.5
    this.model.position.y = 0.5 * scale
  }

  /** 模型本地 +X 为头朝向，取世界前进方向 */
  _getHeadForward() {
    this._forward.set(1, 0, 0).applyQuaternion(this.group.quaternion)
    this._forward.y = 0
    if (this._forward.lengthSq() < 1e-8)
      this._forward.set(1, 0, 0)
    else
      this._forward.normalize()
    return this._forward
  }

  getClickMeshes() {
    return this._clickMeshes
  }

  getPosition() {
    return this.group.position
  }

  startRetract() {
    snailFsmOnClick(this.fsm)
  }

  isCrawling() {
    return this.fsm.state === SNAIL_STATES.CRAWLING
  }

  /**
   * @param {number} dtSec
   */
  update(dtSec) {
    const delta = Number.isFinite(dtSec) ? Math.max(0, dtSec) : 0
    snailFsmUpdate(this.fsm, delta * 1000)
    this._syncAnimationToFsm()
    this.mixer?.update(delta)

    if (!this.isCrawling()) {
      this._snapToGround()
      return
    }

    // 定时改目标角；视觉朝向 lerp 跟上
    this._turnTimerSec += delta
    if (this._turnTimerSec >= CFG.turnNoiseInterval) {
      this._turnTimerSec = 0
      this._targetYaw += CFG.turnNoiseRadians
    }

    const turnT = 1 - Math.exp(-CFG.turnLerpSpeed * delta)
    this.group.rotation.y = lerpAngle(this.group.rotation.y, this._targetYaw, turnT)

    const distance = CFG.crawlSpeed * delta
    if (distance <= 0) {
      this._snapToGround()
      return
    }

    // 始终沿头部（本地 +X）前进
    const forward = this._getHeadForward()
    const nextX = this.group.position.x + forward.x * distance
    const nextZ = this.group.position.z + forward.z * distance
    const nextSurfaceY = this._surfaceY(nextX, nextZ)

    if (!isInSnailZone(nextX, nextZ) || nextSurfaceY == null) {
      // 碰到边界：按当前朝向折返（180°），再 lerp 跟上
      this._targetYaw = this.group.rotation.y + Math.PI
      this._turnTimerSec = 0
      this._snapToGround()
      return
    }

    this.group.position.x = nextX
    this.group.position.z = nextZ
    this.group.position.y = nextSurfaceY + 0.5
  }

  destroy() {
    if (this.mixer) {
      this.mixer.stopAllAction()
      this.mixer.uncacheRoot(this.model)
      this.mixer = null
    }
    this.scene.remove(this.group)
    this._clickMeshes.forEach((mesh) => {
      delete mesh.userData.snailRef
    })
    this._clickMeshes.length = 0
    this.group.clear()
  }
}
