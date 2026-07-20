import * as THREE from 'three'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'

import { DRY_TOILET_SNAILS_CONFIG as CFG } from '../../config/dry-toilet-snails-config.js'
import Experience from '../../experience.js'
import {
  createSnailFsm,
  isInSnailZone,
  resolveSnailClickHitRadius,
  SNAIL_STATES,
  snailFsmCanPickup,
  snailFsmOnClick,
  snailFsmUpdate,
} from './dry-toilet-math.js'

const FADE_SEC = 0.12
const CLIP_NAMES = ['crawl', 'retract', 'emerge']

/**
 * 创建缩壳姿态的手持蜗牛视觉（共享几何，勿 dispose）
 * @param {object} resources Experience.resources
 * @returns {THREE.Object3D | null}
 */
export function createHeldSnailVisual(resources) {
  const gltf = resources?.items?.[CFG.snailResourceName]
  if (!gltf?.scene)
    return null

  const model = SkeletonUtils.clone(gltf.scene)
  model.name = 'HeldSnail'
  // 手持用固定缩放，不跟世界体长走
  model.scale.setScalar(CFG.heldSnailModelScale)
  model.position.set(0, 0.08, 0)
  model.rotation.z = Math.PI * 0.15

  const clip = (gltf.animations || []).find(a => String(a.name).toLowerCase() === 'retract')
  if (clip) {
    const mixer = new THREE.AnimationMixer(model)
    const action = mixer.clipAction(clip)
    action.setLoop(THREE.LoopOnce)
    action.clampWhenFinished = true
    action.play()
    action.time = clip.duration
    mixer.update(0)
  }

  model.traverse((obj) => {
    if (!obj.isMesh)
      return
    obj.castShadow = true
    obj.receiveShadow = false
  })

  return model
}

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

    this.model.traverse((obj) => {
      if (!obj.isMesh)
        return
      obj.castShadow = true
      obj.receiveShadow = true
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

    // 用放大不可见球做点击，避免 SkinnedMesh 过细 / 动画后几何不准
    this._clickHitbox = this._createClickHitbox()
    this._clickMeshes = [this._clickHitbox]

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

  /**
   * 不可见点击球：挂在 group 上，随蜗牛移动，不跟骨骼变形
   * @returns {THREE.Mesh}
   */
  _createClickHitbox() {
    const radius = resolveSnailClickHitRadius(this.length, {
      min: CFG.clickHitRadiusMin,
      factor: CFG.clickHitRadiusFactor,
    })
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 8, 6),
      new THREE.MeshBasicMaterial({ visible: false }),
    )
    mesh.name = 'SnailClickHitbox'
    // 球心略抬高，贴近壳/身体中心
    mesh.position.y = radius * 0.55
    mesh.visible = false
    mesh.userData.snailRef = this
    this.group.add(mesh)
    return mesh
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
    return snailFsmOnClick(this.fsm)
  }

  isCrawling() {
    return this.fsm.state === SNAIL_STATES.CRAWLING
  }

  isRetracted() {
    return snailFsmCanPickup(this.fsm)
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
    if (this._clickHitbox) {
      this._clickHitbox.geometry?.dispose()
      this._clickHitbox.material?.dispose()
      this._clickHitbox = null
    }
    this.group.clear()
  }
}
