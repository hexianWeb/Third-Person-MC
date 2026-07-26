import gsap from 'gsap'
import * as THREE from 'three'
import Experience from '../experience.js'
import emitter from '../utils/event/event-bus.js'
import { CAMERA_RIG_CONFIG } from './camera-rig-config.js'

/**
 * 帧率无关的指数阻尼函数
 * 使用指数衰减模型确保在不同帧率下有一致的响应速度
 * @param {number} current - 当前值
 * @param {number} target - 目标值
 * @param {number} lambda - 阻尼系数 (越大响应越快，建议 10-20)
 * @param {number} dt - 时间步长 (秒)
 * @returns {number} 阻尼后的值
 */
function damp(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt))
}

/**
 * 帧率无关的 Vector3 指数阻尼
 * @param {THREE.Vector3} current - 当前向量 (会被修改)
 * @param {THREE.Vector3} target - 目标向量
 * @param {number} lambda - 阻尼系数
 * @param {number} dt - 时间步长 (秒)
 */
function dampVec3(current, target, lambda, dt) {
  current.x = damp(current.x, target.x, lambda, dt)
  current.y = damp(current.y, target.y, lambda, dt)
  current.z = damp(current.z, target.z, lambda, dt)
}

export default class CameraRig {
  constructor() {
    this.experience = new Experience()
    this.time = this.experience.time

    // Virtual Anchors
    this.group = new THREE.Group()
    this.group.name = 'CameraRig'
    this.experience.scene.add(this.group)

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

    // Mouse Target Y Offset State (目标阻尼模型)
    this.mouseYOffset = 0
    this.mouseYOffsetTarget = 0

    // Target
    this.target = null

    // 初始化时记录偏移量的绝对值，用于切换时的基准
    this._cachedMagnitude = Math.abs(this.config.follow.offset.x)
    // 肩膀模式：'right' | 'left' | 'center'
    this._shoulderMode = 'center'
    // 用于控制左右切换的因子 (-1 到 1)，平滑过渡
    this._sideFactor = 0
    // 居中拔高因子 (0 = 正常, 1 = 拔高)
    this._heightBoost = this.config.centerElevated ? this.config.centerElevated.heightBoost : 0
    // 后视镜因子 (0 = 正常, 1 = 完全镜像)
    this._rearViewFactor = 0

    // 洞内状态管理
    this.isInCave = false // 当前是否在洞内（头顶有方块）
    this._normalOffset = new THREE.Vector3(2, 1.5, 3.0) // 常规状态偏移
    this._caveOffset = new THREE.Vector3(0.0, 1.5, 1.0) // 洞内状态偏移
    this._targetOffset = new THREE.Vector3() // 目标偏移（用于平滑过渡）
    this._targetOffset.copy(this._normalOffset) // 初始化为常规偏移

    // 目标点偏移 (Look-at Target)
    this._normalTargetOffset = new THREE.Vector3(0, 1.5, -5.5) // 常规目标偏移
    this._caveTargetOffset = new THREE.Vector3(0, 1.5, -1.5) // 洞内目标偏移

    // 预分配世界坐标向量 (避免 update 中 new 对象)
    this._cameraWorldPos = new THREE.Vector3()
    this._targetWorldPos = new THREE.Vector3()

    // Debug Helpers
    this.helpersVisible = false
    this.helpers = {}

    // Event Listeners
    this._setupEventListeners()
  }

  // #region
  _setupEventListeners() {
    emitter.on('input:telescope', (isActive) => {
      this.isTelescopeActive = isActive
    })

    emitter.on('input:rear_view', (isActive) => {
      this.setRearView(isActive)
    })

    emitter.on('input:cycle_camera_shoulder', () => {
      this.cycleShoulderMode()
    })

    emitter.on('input:mouse_move', ({ movementY }) => {
      const config = this.config.follow.mouseTargetY
      if (!config.enabled) {
        return
      }

      // 望远镜模式下的鼠标灵敏度缩放
      const sensitivityMultiplier = (this.isTelescopeActive && this.config.trackingShot.telescope?.enabled)
        ? this.config.trackingShot.telescope.sensitivityMultiplier
        : 1.0

      // 目标阻尼模型：直接调整目标值
      const sign = config.invertY ? -1 : 1
      this.mouseYOffsetTarget += movementY * config.sensitivity * sensitivityMultiplier * sign

      // 限制目标值范围
      this.mouseYOffsetTarget = THREE.MathUtils.clamp(
        this.mouseYOffsetTarget,
        -config.maxOffset,
        config.maxOffset * 1.5,
      )
    })

    emitter.on('pointer:unlocked', () => {
      if (this.config.follow.mouseTargetY.unlockReset) {
        // 解锁时是否立即清空或等待回弹？这里选择保持当前值让其自然回弹
        // 如果需要立即重置，可以设置 this.mouseYVelocity = 0; this.mouseYOffset = 0;
      }
    })

    emitter.on('input:wheel', ({ deltaY }) => {
      // 滚轮控制相机高度 (常规偏移 Y)
      // 灵敏度因子，deltaY 通常是 100 左右
      const sensitivity = 0.012

      // 计算新的 Y 值
      let newY = this.config.follow.offset.y + deltaY * sensitivity

      // 限制范围 1.5 - 5
      newY = THREE.MathUtils.clamp(newY, 1.5, 5.0)

      // 更新配置中的偏移 (统一数据源)
      this.config.follow.offset.y = newY
    })

    // Listen for mouse sensitivity changes from Settings UI
    emitter.on('settings:mouse-sensitivity-changed', (value) => {
      this.config.follow.mouseTargetY.sensitivity = value
    })

    // Listen for camera preset changes from Settings UI
    emitter.on('settings:camera-rig-changed', ({ fov, bobbing }) => {
      if (fov) {
        Object.assign(this.config.trackingShot.fov, {
          enabled: fov.enabled,
          baseFov: fov.baseFov,
          maxFov: fov.maxFov,
          speedThreshold: fov.speedThreshold,
        })
      }
      if (bobbing) {
        Object.assign(this.config.trackingShot.bobbing, {
          enabled: bobbing.enabled,
          verticalFrequency: bobbing.verticalFrequency,
          verticalAmplitude: bobbing.verticalAmplitude,
          horizontalFrequency: bobbing.horizontalFrequency,
          horizontalAmplitude: bobbing.horizontalAmplitude,
          rollFrequency: bobbing.rollFrequency,
          rollAmplitude: bobbing.rollAmplitude,
          speedMultiplier: bobbing.speedMultiplier,
        })
        if (bobbing.idleBreathing) {
          Object.assign(this.config.trackingShot.bobbing.idleBreathing, bobbing.idleBreathing)
        }
      }
    })
  }
  // #endregion

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

  /**
   * 循环切换探头：中间 → 左 → 右 → 中间
   */
  cycleShoulderMode() {
    const order = ['center', 'left', 'right']
    const nextIndex = (order.indexOf(this._shoulderMode) + 1) % order.length
    this.setShoulderMode(order[nextIndex])
  }

  setShoulderMode(mode) {
    if (this._shoulderMode === mode)
      return
    this._shoulderMode = mode

    const targetSide = mode === 'right'
      ? 1
      : mode === 'left'
        ? -1.25
        : 0
    const targetHeight = mode === 'center'
      ? (this.config.centerElevated ? this.config.centerElevated.heightBoost : 0)
      : 0

    // 使用 GSAP 平滑过渡 sideFactor 和 heightBoost
    gsap.to(this, {
      _sideFactor: targetSide,
      _heightBoost: targetHeight,
      duration: 0.6,
      ease: 'power2.inOut',
      overwrite: true,
    })
  }

  /**
   * 循环探头视角：中间 → 左 → 右 → 中间
   */
  cycleShoulderMode() {
    const order = ['center', 'left', 'right']
    const currentIndex = order.indexOf(this._shoulderMode)
    const nextMode = order[(currentIndex + 1) % order.length]
    this.setShoulderMode(nextMode)
  }

  /**
   * 循环切换肩膀视角：中间 → 左 → 右 → 中间
   */
  cycleShoulderMode() {
    const order = ['center', 'left', 'right']
    const nextIndex = (order.indexOf(this._shoulderMode) + 1) % order.length
    this.setShoulderMode(order[nextIndex])
  }

  setRearView(active) {
    const duration = this.config.rearView.transitionDuration
    gsap.to(this, {
      _rearViewFactor: active ? 1 : 0,
      duration,
      ease: active ? 'power2.out' : 'power2.in',
      overwrite: 'auto',
    })
  }

  /**
   * 检测玩家上方是否有方块（洞内检测）- 简化版本
   * 优化：仅检测头顶正上方3格，3次查询 vs 18次查询，减少83%
   * @param {THREE.Vector3} playerPos 玩家脚底位置
   * @returns {boolean} 如果检测到至少 2 个方块返回 true
   */
  _checkBlockAbovePlayer(playerPos) {
    const terrainManager = this.experience.terrainDataManager
    if (!terrainManager || !terrainManager.getBlockWorld) {
      return false
    }

    const x = Math.floor(playerPos.x)
    const z = Math.floor(playerPos.z)
    const y = Math.floor(playerPos.y)

    // 只检测头顶正上方2、3、4格（3次查询 vs 18次）
    let blockedCount = 0
    for (let dy = 2; dy <= 4; dy++) {
      const block = terrainManager.getBlockWorld(x, y + dy, z)
      if (block?.id !== 0) {
        blockedCount++
      }
    }

    // 2个或以上方块遮挡即触发洞内模式（更灵敏）
    return blockedCount >= 2
  }

  /**
   * 更新相机偏移（根据洞内状态平滑切换）
   * 优化后：直接驱动 anchor，使用帧率无关阻尼
   */
  _updateCameraOffset(dt) {
    // 1. 从 config 同步基础偏移 (支持 debug 面板实时调整)
    this._normalOffset.x = this.config.follow.offset.x
    this._normalOffset.y = this.config.follow.offset.y
    this._normalOffset.z = this.config.follow.offset.z
    this._normalTargetOffset.z = this.config.follow.targetOffset.z

    // 2. 根据当前状态选择目标偏移
    const targetCamOffset = this.isInCave ? this._caveOffset : this._normalOffset
    const targetLookOffset = this.isInCave ? this._caveTargetOffset : this._normalTargetOffset

    // 3. 使用帧率无关阻尼平滑相机偏移 (lambda = 8，约 150ms 响应)
    dampVec3(this._targetOffset, targetCamOffset, 8, dt)

    // 4. 直接驱动 cameraAnchor
    // 后视镜：X 和 Z 方向翻转 (rv 从 0→1 时，(1-2*rv) 从 1→-1)
    const rv = this._rearViewFactor
    const mirrorFactor = 1 - 2 * rv
    this.cameraAnchor.position.set(
      this._targetOffset.x * this._sideFactor * mirrorFactor,
      this._targetOffset.y + this._heightBoost,
      this._targetOffset.z * mirrorFactor,
    )

    // 5. 目标点偏移 - Z 也受后视镜影响
    this.targetAnchor.position.set(
      targetLookOffset.x,
      targetLookOffset.y + this.mouseYOffset,
      targetLookOffset.z * mirrorFactor,
    )

    // 6. 更新玩家透明度 (如果在洞内则变为半透明)
    if (this.target && typeof this.target.setOpacity === 'function') {
      const targetOpacity = this.isInCave ? 0.1 : 1.0
      if (this._currentOpacity === undefined) {
        this._currentOpacity = 1.0
      }
      // 使用阻尼平滑透明度
      this._currentOpacity = damp(this._currentOpacity, targetOpacity, 10, dt)
      this.target.setOpacity(this._currentOpacity)
    }
  }

  update() {
    if (!this.target) {
      return null
    }

    // 获取时间步长 (秒)
    const dt = this.time.delta / 1000

    // 1. Get Player State
    const playerPos = this.target.getPosition()
    const facingAngle = this.target.getFacingAngle()
    const velocity = this.target.getVelocity()
    const isMoving = this.target.isMoving()

    // 2. Calculate Speed (Horizontal)
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z)

    // 3. Update Mouse Y Offset (目标阻尼模型)
    this._updateMouseYOffset(dt)

    // 4. 检测洞内状态并更新相机偏移 (直接驱动 anchor，无中间状态)
    this.isInCave = this._checkBlockAbovePlayer(playerPos)
    this._updateCameraOffset(dt)

    // 5. Smooth Follow (Position) - 帧率无关指数阻尼
    // 使用 lambda = 12 对应约 100ms 的响应时间
    dampVec3(this._smoothedPosition, playerPos, 12, dt)
    this.group.position.copy(this._smoothedPosition)
    this.group.rotation.y = facingAngle

    // Update matrices to ensure getWorldPosition is correct
    this.group.updateMatrixWorld(true)

    // 6. Tracking Shot
    this._updateDynamicFov(speed, dt)
    this._updateBobbing(speed, isMoving)

    // 7. Get World Positions (复用预分配向量，避免 GC)
    this.cameraAnchor.getWorldPosition(this._cameraWorldPos)
    this.targetAnchor.getWorldPosition(this._targetWorldPos)

    // 8. LookAt Target - 直接 copy，无二次平滑 (FPS/MC 风格即时响应)
    this._smoothedLookAtTarget.copy(this._targetWorldPos)

    return {
      cameraPos: this._cameraWorldPos,
      targetPos: this._smoothedLookAtTarget,
      fov: this._currentFov,
      bobbingOffset: this._bobbingOffset.clone(),
      bobbingRoll: this._bobbingRoll,
    }
  }

  /**
   * 鼠标 Y 偏移更新 (目标阻尼模型)
   * 优化后：从弹簧模型(velocity+damping)简化为目标阻尼模型
   */
  _updateMouseYOffset(dt) {
    // 目标阻尼模型：平滑跟踪目标值
    // lambda = 18 对应约 60ms 响应，手感更直觉
    this.mouseYOffset = damp(this.mouseYOffset, this.mouseYOffsetTarget, 18, dt)

    // 归零保护：当两者都接近零时直接清零
    const epsilon = 0.0001
    if (Math.abs(this.mouseYOffset) < epsilon && Math.abs(this.mouseYOffsetTarget) < epsilon) {
      this.mouseYOffset = 0
      this.mouseYOffsetTarget = 0
    }
  }

  /**
   * 动态 FOV 更新
   * 使用帧率无关阻尼
   */
  _updateDynamicFov(speed, dt) {
    let targetFov = this.config.trackingShot.fov.baseFov
    let dampingLambda = 6 // 默认动态 FOV 的阻尼系数

    // 优先处理望远镜 FOV
    if (this.isTelescopeActive && this.config.trackingShot.telescope.enabled) {
      targetFov = this.config.trackingShot.telescope.fov
      dampingLambda = this.config.trackingShot.telescope.smoothSpeed
    }
    else if (this.config.trackingShot.fov.enabled) {
      // 动态 FOV（跑动时扩大视野）
      const { baseFov, maxFov, speedThreshold } = this.config.trackingShot.fov
      const speedRatio = Math.min(speed / speedThreshold, 1.0)
      targetFov = baseFov + (maxFov - baseFov) * speedRatio
    }

    // 帧率无关阻尼平滑
    this._currentFov = damp(this._currentFov, targetFov, dampingLambda, dt)
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

  // #region
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

    if (!this.helpersVisible) {
      return
    }

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

  /**
   * 添加偏移量绑定到 debug 面板
   * @param {object} folder - Tweakpane folder 实例
   * @param {THREE.Vector3} offset - 偏移向量
   * @param {THREE.Vector3} targetOffset - 目标偏移向量（可选）
   * @param {object} xRange - X 轴范围配置
   * @param {object} yRange - Y 轴范围配置
   * @param {object} zRange - Z 轴范围配置
   * @param {object} targetZRange - 目标 Z 轴范围配置（可选）
   */
  _addOffsetBindings(folder, offset, targetOffset, xRange, yRange, zRange, targetZRange) {
    folder.addBinding(offset, 'x', {
      label: 'X',
      ...xRange,
    })
    folder.addBinding(offset, 'y', {
      label: 'Y',
      ...yRange,
    })
    folder.addBinding(offset, 'z', {
      label: 'Z',
      ...zRange,
    })
    if (targetOffset && targetZRange) {
      folder.addBinding(targetOffset, 'z', {
        label: '目标 Z',
        ...targetZRange,
      })
    }
  }

  setDebug(debugFolder) {
    if (!debugFolder) {
      return
    }

    // ===== 可视化助手 =====
    const visualFolder = debugFolder.addFolder({
      title: '可视化助手',
      expanded: false,
    })

    visualFolder.addBinding({ showHelpers: this.helpersVisible }, 'showHelpers', {
      label: '显示锚点助手',
    }).on('change', (ev) => {
      this.helpersVisible = ev.value
      this._createHelpers()
    })

    // ===== 基础跟随设置 =====
    const followFolder = debugFolder.addFolder({
      title: '基础跟随',
      expanded: false,
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

    // ===== 鼠标 Y 偏移控制 =====
    const mouseTargetFolder = debugFolder.addFolder({
      title: '鼠标 Y 偏移',
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

    mouseTargetFolder.addBinding(this.config.follow.mouseTargetY, 'unlockReset', {
      label: '解锁重置',
    })

    // ===== 望远镜 =====
    const telescopeFolder = debugFolder.addFolder({
      title: '望远镜 (Caps Lock)',
      expanded: false,
    })

    telescopeFolder.addBinding(this.config.trackingShot.telescope, 'enabled', {
      label: '启用',
    })

    telescopeFolder.addBinding(this.config.trackingShot.telescope, 'fov', {
      label: '放大 FOV',
      min: 5,
      max: 60,
      step: 1,
    })

    telescopeFolder.addBinding(this.config.trackingShot.telescope, 'smoothSpeed', {
      label: '缩放平滑',
      min: 1,
      max: 20,
      step: 0.5,
    })

    telescopeFolder.addBinding(this.config.trackingShot.telescope, 'sensitivityMultiplier', {
      label: '鼠标灵敏倍率',
      min: 0.05,
      max: 1.0,
      step: 0.05,
    })

    // ===== 动态 FOV =====
    const fovFolder = debugFolder.addFolder({
      title: '动态 FOV',
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

    // 显示当前 FOV（只读）
    fovFolder.addBinding(this, '_currentFov', {
      label: '当前 FOV',
      readonly: true,
    })

    // ===== 镜头震动 (Bobbing) =====
    const bobbingFolder = debugFolder.addFolder({
      title: '镜头震动',
      expanded: false,
    })

    bobbingFolder.addBinding(this.config.trackingShot.bobbing, 'enabled', {
      label: '启用',
    })

    // 运动震动参数
    const movementFolder = bobbingFolder.addFolder({
      title: '运动震动',
      expanded: false,
    })

    movementFolder.addBinding(this.config.trackingShot.bobbing, 'verticalFrequency', {
      label: '垂直频率',
      min: 1,
      max: 20,
      step: 0.5,
    })

    movementFolder.addBinding(this.config.trackingShot.bobbing, 'verticalAmplitude', {
      label: '垂直幅度',
      min: 0,
      max: 0.2,
      step: 0.005,
    })

    movementFolder.addBinding(this.config.trackingShot.bobbing, 'horizontalFrequency', {
      label: '水平频率',
      min: 1,
      max: 20,
      step: 0.5,
    })

    movementFolder.addBinding(this.config.trackingShot.bobbing, 'horizontalAmplitude', {
      label: '水平幅度',
      min: 0,
      max: 0.1,
      step: 0.005,
    })

    movementFolder.addBinding(this.config.trackingShot.bobbing, 'rollFrequency', {
      label: 'Roll 频率',
      min: 1,
      max: 20,
      step: 0.5,
    })

    movementFolder.addBinding(this.config.trackingShot.bobbing, 'rollAmplitude', {
      label: 'Roll 幅度',
      min: 0,
      max: 0.05,
      step: 0.001,
    })

    movementFolder.addBinding(this.config.trackingShot.bobbing, 'speedMultiplier', {
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

    // ===== 洞内状态检测 =====
    const caveFolder = debugFolder.addFolder({
      title: '洞内状态',
      expanded: false,
    })

    caveFolder.addBinding(this, 'isInCave', {
      label: '当前是否在洞内',
      readonly: true,
    })

    // 常规状态偏移
    const normalOffsetFolder = caveFolder.addFolder({
      title: '常规状态偏移',
      expanded: false,
    })
    this._addOffsetBindings(
      normalOffsetFolder,
      this._normalOffset,
      this._normalTargetOffset,
      { min: 0, max: 10, step: 0.1 },
      { min: 1.5, max: 5, step: 0.1 },
      { min: 0, max: 10, step: 0.1 },
      { min: -15, max: 0, step: 0.1 },
    )

    // 洞内状态偏移
    const caveOffsetFolder = caveFolder.addFolder({
      title: '洞内状态偏移',
      expanded: false,
    })
    this._addOffsetBindings(
      caveOffsetFolder,
      this._caveOffset,
      this._caveTargetOffset,
      { min: 0, max: 5, step: 0.1 },
      { min: 0, max: 5, step: 0.1 },
      { min: 0, max: 5, step: 0.1 },
      { min: -5, max: 0, step: 0.1 },
    )
  }
  // #endregion

  destroy() {
    // Dispose helpers
    if (this.helpers.camera) {
      this.helpers.camera.geometry?.dispose()
      this.helpers.camera.material?.dispose()
    }
    if (this.helpers.target) {
      this.helpers.target.geometry?.dispose()
      this.helpers.target.material?.dispose()
    }
    if (this.helpers.groupAxes) {
      this.helpers.groupAxes.dispose?.()
    }

    // Remove group from scene
    if (this.group) {
      this.experience.scene.remove(this.group)
    }

    // Clear references
    this.target = null
  }
}
