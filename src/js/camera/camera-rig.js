import gsap from 'gsap'
import * as THREE from 'three'
import Experience from '../experience.js'
import emitter from '../utils/event-bus.js'
import { CAMERA_RIG_CONFIG } from './camera-rig-config.js'

export default class CameraRig {
  constructor() {
    this.experience = new Experience()
    this.time = this.experience.time

    // Virtual Anchors
    this.group = new THREE.Group()
    this.group.name = 'CameraRig'
    this.experience.scene.add(this.group) // Add to scene to visualize or just logical?
    // Wait, original logic attached anchors to Player Group.
    // Now Rig Group is independent in Scene? Or logical?
    // If it's not in scene, world position calc needs updateMatrixWorld.
    // Better add to scene but maybe not visible.
    // Actually, I can just not add it to scene if I manually update matrices,
    // but adding to scene is safer for world transforms.

    this.cameraAnchor = new THREE.Object3D()
    this.cameraAnchor.name = 'CameraAnchor'
    this.group.add(this.cameraAnchor)

    this.targetAnchor = new THREE.Object3D()
    this.targetAnchor.name = 'TargetAnchor'
    this.group.add(this.targetAnchor)

    // Config (Deep copy to allow debug modification without affecting const)
    this.config = JSON.parse(JSON.stringify(CAMERA_RIG_CONFIG))

    // Internal State
    this._smoothedPosition = new THREE.Vector3()
    this._smoothedLookAtTarget = new THREE.Vector3()
    this._bobbingOffset = new THREE.Vector3()
    this._bobbingRoll = 0
    this._currentFov = this.config.trackingShot.fov.baseFov

    // Mouse Target Y Offset State
    this.mouseYOffset = 0
    this.mouseYVelocity = 0

    // Target
    this.target = null

    // 初始化时记录偏移量的绝对值，用于切换时的基准
    this._cachedMagnitude = Math.abs(this.config.follow.offset.x)
    this._currentSide = Math.sign(this.config.follow.offset.x) || 1

    // Debug Helpers
    this.helpersVisible = false
    this.helpers = {}

    // Event Listeners
    this._setupEventListeners()
  }

  _setupEventListeners() {
    emitter.on('input:mouse_move', ({ movementY }) => {
      const config = this.config.follow.mouseTargetY
      if (!config.enabled)
        return

      // 累加速度，实现“软”手感
      const sign = config.invertY ? -1 : 1
      this.mouseYVelocity += movementY * config.sensitivity * sign
    })

    emitter.on('pointer:unlocked', () => {
      if (this.config.follow.mouseTargetY.unlockReset) {
        // 解锁时是否立即清空或等待回弹？这里选择保持当前值让其自然回弹
        // 如果需要立即重置，可以设置 this.mouseYVelocity = 0; this.mouseYOffset = 0;
      }
    })
  }

  attachPlayer(player) {
    this.target = player
    if (player) {
      // Init position
      const pos = player.getPosition()
      this._smoothedPosition.copy(pos)
      this.group.position.copy(pos)
      this.group.rotation.y = player.getFacingAngle()
      this.group.updateMatrixWorld(true)

      // Init lookAt target
      const targetPos = new THREE.Vector3()
      this.targetAnchor.getWorldPosition(targetPos)
      this._smoothedLookAtTarget.copy(targetPos)
    }
  }

  toggleSide() {
    // 每次切换时更新当前的偏移幅度和方向状态
    // 如果当前正在动画中，则不更新幅度，避免幅度衰减
    if (!gsap.isTweening(this.config.follow.offset)) {
      this._cachedMagnitude = Math.abs(this.config.follow.offset.x)
      // 如果幅度太小（比如接近0），使用默认值或者 config 里的值
      if (this._cachedMagnitude < 0.1) {
        this._cachedMagnitude = Math.abs(CAMERA_RIG_CONFIG.follow.offset.x)
      }
      this._currentSide = Math.sign(this.config.follow.offset.x) || 1
    }

    // 切换方向
    this._currentSide *= -1
    const targetX = this._cachedMagnitude * this._currentSide

    // 使用 GSAP 平滑过渡 X 轴偏移
    gsap.to(this.config.follow.offset, {
      x: targetX,
      duration: 0.6,
      ease: 'power2.inOut',
      overwrite: true, // 确保覆盖之前的动画
    })
  }

  update() {
    if (!this.target)
      return null

    // 1. Get Player State
    const playerPos = this.target.getPosition()
    const facingAngle = this.target.getFacingAngle()
    const velocity = this.target.getVelocity()
    const isMoving = this.target.isMoving()

    // 2. Calculate Speed (Horizontal)
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z)

    // 3. Update Mouse Y Offset Spring (Based on Player Speed)
    this._updateMouseYOffset(speed)

    // 4. Sync Anchors from Config
    this.cameraAnchor.position.copy(this.config.follow.offset)
    this.targetAnchor.position.copy(this.config.follow.targetOffset)

    // Apply temporary Y offset
    this.targetAnchor.position.y += this.mouseYOffset

    // 5. Smooth Follow (Position)
    this._smoothedPosition.lerp(playerPos, this.config.follow.smoothSpeed)
    this.group.position.copy(this._smoothedPosition)
    this.group.rotation.y = facingAngle

    // Update matrices to ensuregetWorldPosition is correct
    this.group.updateMatrixWorld(true)

    // 6. Tracking Shot
    this._updateDynamicFov(speed)
    this._updateBobbing(speed, isMoving)

    // 7. Get World Positions
    const cameraPos = new THREE.Vector3()
    const targetPos = new THREE.Vector3()
    this.cameraAnchor.getWorldPosition(cameraPos)
    this.targetAnchor.getWorldPosition(targetPos)

    // 8. Smooth LookAt
    this._smoothedLookAtTarget.lerp(targetPos, this.config.follow.lookAtSmoothSpeed)

    return {
      cameraPos,
      targetPos: this._smoothedLookAtTarget,
      fov: this._currentFov,
      bobbingOffset: this._bobbingOffset.clone(),
      bobbingRoll: this._bobbingRoll,
    }
  }

  _updateMouseYOffset(speed) {
    const config = this.config.follow.mouseTargetY
    const dt = this.time.delta / 1000 // 转换为秒

    // 1. 速度阻尼衰减
    this.mouseYVelocity *= Math.exp(-config.damping * dt)

    // 2. 位置根据速度更新 (注意这里乘以 dt 是因为 mouseYVelocity 是单位时间位移)
    this.mouseYOffset += this.mouseYVelocity * dt

    // 3. 回中力 (Spring Return)
    // 只有在玩家移动时才回中，回中速度与玩家速度成正比
    if (speed > 0.01) {
      const dynamicReturnSpeed = config.returnSpeed * speed * 0.5
      this.mouseYOffset += (-this.mouseYOffset) * dynamicReturnSpeed * dt
    }

    // 4. 限制范围
    this.mouseYOffset = THREE.MathUtils.clamp(
      this.mouseYOffset,
      -config.maxOffset,
      config.maxOffset,
    )

    // 归零保护
    if (Math.abs(this.mouseYOffset) < 0.0001 && Math.abs(this.mouseYVelocity) < 0.0001) {
      this.mouseYOffset = 0
      this.mouseYVelocity = 0
    }
  }

  _updateDynamicFov(speed) {
    if (!this.config.trackingShot.fov.enabled)
      return

    const { baseFov, maxFov, speedThreshold, smoothSpeed } = this.config.trackingShot.fov

    // 根据速度计算目标 FOV
    const speedRatio = Math.min(speed / speedThreshold, 1.0)
    const targetFov = baseFov + (maxFov - baseFov) * speedRatio

    // 平滑过渡到目标 FOV
    this._currentFov += (targetFov - this._currentFov) * smoothSpeed
  }

  _updateBobbing(speed, isMoving) {
    if (!this.config.trackingShot.bobbing.enabled) {
      this._bobbingOffset.set(0, 0, 0)
      this._bobbingRoll = 0
      return
    }

    const elapsed = this.time.elapsed / 1000 // 转换为秒
    const bobbing = this.config.trackingShot.bobbing

    if (isMoving && speed > 0.1) {
      // 运动时的震动
      const speedFactor = Math.min(speed / 3.5, 1.0) * bobbing.speedMultiplier

      // 垂直震动 (模拟步伐)
      const verticalOffset = Math.sin(elapsed * bobbing.verticalFrequency * Math.PI * 2)
        * bobbing.verticalAmplitude * speedFactor

      // 水平震动 (轻微左右摆动)
      const horizontalOffset = Math.sin(elapsed * bobbing.horizontalFrequency * Math.PI * 2)
        * bobbing.horizontalAmplitude * speedFactor

      // Roll 倾斜 (模拟左右脚步的重心转移)
      this._bobbingRoll = Math.sin(elapsed * bobbing.rollFrequency * Math.PI * 2)
        * bobbing.rollAmplitude * speedFactor

      this._bobbingOffset.set(horizontalOffset, verticalOffset, 0)
    }
    else if (bobbing.idleBreathing.enabled) {
      // 静止时的呼吸感
      const breathingOffset = Math.sin(elapsed * bobbing.idleBreathing.frequency * Math.PI * 2)
        * bobbing.idleBreathing.amplitude

      this._bobbingOffset.set(0, breathingOffset, 0)
      this._bobbingRoll = 0
    }
    else {
      this._bobbingOffset.set(0, 0, 0)
      this._bobbingRoll = 0
    }
  }

  _createHelpers() {
    // 清理旧的
    if (this.helpers.camera) {
      this.cameraAnchor.remove(this.helpers.camera)
      this.helpers.camera.geometry.dispose()
      this.helpers.camera.material.dispose()
      this.helpers.camera = null
    }
    if (this.helpers.target) {
      this.targetAnchor.remove(this.helpers.target)
      this.helpers.target.geometry.dispose()
      this.helpers.target.material.dispose()
      this.helpers.target = null
    }

    // Axes Helper for Group
    if (this.helpers.groupAxes) {
      this.group.remove(this.helpers.groupAxes)
      this.helpers.groupAxes.dispose()
      this.helpers.groupAxes = null
    }

    if (!this.helpersVisible)
      return

    // Camera Anchor Helper (Cyan Box)
    const cameraGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2)
    const cameraMat = new THREE.MeshBasicMaterial({ color: 0x00FFFF, wireframe: true })
    this.helpers.camera = new THREE.Mesh(cameraGeo, cameraMat)
    this.cameraAnchor.add(this.helpers.camera)

    // Target Anchor Helper (Magenta Sphere)
    const targetGeo = new THREE.SphereGeometry(0.15, 4, 2)
    const targetMat = new THREE.MeshBasicMaterial({ color: 0xFF00FF, wireframe: true })
    this.helpers.target = new THREE.Mesh(targetGeo, targetMat)
    this.targetAnchor.add(this.helpers.target)

    // Axes Helper for Group
    this.helpers.groupAxes = new THREE.AxesHelper(1)
    this.group.add(this.helpers.groupAxes)
  }

  setDebug(debugFolder) {
    if (!debugFolder)
      return

    // ===== 基础跟随设置 =====
    const followFolder = debugFolder.addFolder({
      title: '跟随设置',
      expanded: true,
    })

    const debugParams = {
      showHelpers: this.helpersVisible,
    }

    followFolder.addBinding(debugParams, 'showHelpers', {
      label: '显示锚点助手',
    }).on('change', (ev) => {
      this.helpersVisible = ev.value
      this._createHelpers()
    })

    followFolder.addBinding(this.config.follow, 'offset', {
      label: '相机偏移',
      x: { min: -20, max: 20, step: 0.5 },
      y: { min: 0, max: 30, step: 0.5 },
      z: { min: -20, max: 20, step: 0.5 },
    })

    followFolder.addBinding(this.config.follow, 'targetOffset', {
      label: '目标偏移',
      x: { min: -20, max: 20, step: 0.5 },
      y: { min: -5, max: 10, step: 0.5 },
      z: { min: -30, max: 10, step: 0.5 },
    })

    followFolder.addBinding(this.config.follow, 'smoothSpeed', {
      label: '位置平滑',
      min: 0.01,
      max: 0.5,
      step: 0.01,
    })

    followFolder.addBinding(this.config.follow, 'lookAtSmoothSpeed', {
      label: '视角平滑',
      min: 0.01,
      max: 0.5,
      step: 0.01,
    })

    // ===== 目标点鼠标 Y 偏移 (B手感) =====
    const mouseTargetFolder = debugFolder.addFolder({
      title: '目标点-鼠标Y偏移',
      expanded: false,
    })

    mouseTargetFolder.addBinding(this.config.follow.mouseTargetY, 'enabled', {
      label: '启用',
    })

    mouseTargetFolder.addBinding(this.config.follow.mouseTargetY, 'invertY', {
      label: '反转 Y',
    })

    mouseTargetFolder.addBinding(this.config.follow.mouseTargetY, 'sensitivity', {
      label: '灵敏度',
      min: 0.001,
      max: 0.05,
      step: 0.001,
    })

    mouseTargetFolder.addBinding(this.config.follow.mouseTargetY, 'maxOffset', {
      label: '最大偏移 (米)',
      min: 0.5,
      max: 10,
      step: 0.5,
    })

    mouseTargetFolder.addBinding(this.config.follow.mouseTargetY, 'returnSpeed', {
      label: '回中速度',
      min: 1,
      max: 20,
      step: 0.5,
    })

    mouseTargetFolder.addBinding(this.config.follow.mouseTargetY, 'damping', {
      label: '阻尼',
      min: 1,
      max: 20,
      step: 0.5,
    })

    mouseTargetFolder.addBinding(this.config.follow.mouseTargetY, 'unlockReset', {
      label: '解锁重置',
    })

    // ===== Tracking Shot - 动态 FOV =====
    const fovFolder = debugFolder.addFolder({
      title: '动态 FOV (速度感)',
      expanded: false,
    })

    fovFolder.addBinding(this.config.trackingShot.fov, 'enabled', {
      label: '启用',
    })

    fovFolder.addBinding(this.config.trackingShot.fov, 'baseFov', {
      label: '基础 FOV',
      min: 30,
      max: 90,
      step: 1,
    })

    fovFolder.addBinding(this.config.trackingShot.fov, 'maxFov', {
      label: '最大 FOV',
      min: 45,
      max: 120,
      step: 1,
    })

    fovFolder.addBinding(this.config.trackingShot.fov, 'speedThreshold', {
      label: '速度阈值',
      min: 1,
      max: 10,
      step: 0.5,
    })

    fovFolder.addBinding(this.config.trackingShot.fov, 'smoothSpeed', {
      label: 'FOV 平滑',
      min: 0.01,
      max: 0.2,
      step: 0.01,
    })

    // ===== Camera Bobbing =====
    const bobbingFolder = debugFolder.addFolder({
      title: '镜头震动 (Bobbing)',
      expanded: false,
    })

    bobbingFolder.addBinding(this.config.trackingShot.bobbing, 'enabled', {
      label: '启用',
    })

    bobbingFolder.addBinding(this.config.trackingShot.bobbing, 'verticalFrequency', {
      label: '垂直频率',
      min: 1,
      max: 20,
      step: 0.5,
    })

    bobbingFolder.addBinding(this.config.trackingShot.bobbing, 'verticalAmplitude', {
      label: '垂直幅度',
      min: 0,
      max: 0.2,
      step: 0.005,
    })

    bobbingFolder.addBinding(this.config.trackingShot.bobbing, 'horizontalFrequency', {
      label: '水平频率',
      min: 1,
      max: 20,
      step: 0.5,
    })

    bobbingFolder.addBinding(this.config.trackingShot.bobbing, 'horizontalAmplitude', {
      label: '水平幅度',
      min: 0,
      max: 0.1,
      step: 0.005,
    })

    bobbingFolder.addBinding(this.config.trackingShot.bobbing, 'rollFrequency', {
      label: 'Roll 频率',
      min: 1,
      max: 20,
      step: 0.5,
    })

    bobbingFolder.addBinding(this.config.trackingShot.bobbing, 'rollAmplitude', {
      label: 'Roll 幅度',
      min: 0,
      max: 0.05,
      step: 0.001,
    })

    bobbingFolder.addBinding(this.config.trackingShot.bobbing, 'speedMultiplier', {
      label: '速度因子',
      min: 0,
      max: 3,
      step: 0.1,
    })

    // 静止呼吸感
    const breathingFolder = bobbingFolder.addFolder({
      title: '静止呼吸',
      expanded: false,
    })

    breathingFolder.addBinding(this.config.trackingShot.bobbing.idleBreathing, 'enabled', {
      label: '启用',
    })

    breathingFolder.addBinding(this.config.trackingShot.bobbing.idleBreathing, 'frequency', {
      label: '频率',
      min: 0.1,
      max: 2,
      step: 0.1,
    })

    breathingFolder.addBinding(this.config.trackingShot.bobbing.idleBreathing, 'amplitude', {
      label: '幅度',
      min: 0,
      max: 0.02,
      step: 0.001,
    })
  }
}
