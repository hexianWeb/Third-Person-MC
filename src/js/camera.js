import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js'

import Experience from './experience.js'
import emitter from './utils/event-bus.js'

export default class Camera {
  constructor(orthographic = false) {
    this.experience = new Experience()
    this.sizes = this.experience.sizes
    this.scene = this.experience.scene
    this.canvas = this.experience.canvas
    this.debug = this.experience.debug
    this.debugActive = this.experience.debug.active
    this.time = this.experience.time

    // 视角模式枚举
    this.cameraModes = {
      THIRD_PERSON: 'third-person',
      BIRD_PERSPECTIVE: 'bird-perspective',
      ORTHO_TOP: 'ortho-top',
    }
    this.currentMode = null
    this.previousMode = null
    this.orthographic = orthographic

    this.position = new THREE.Vector3(0, 0, 0)
    this.target = new THREE.Vector3(0, 0, 0)

    // 第三人称相机配置
    this.followConfig = {
      // 相机相对于玩家的偏移（玩家在右下角）
      offset: new THREE.Vector3(2, 1.5, 4.0), // x: 右侧, y: 上方, z: 后方
      // 目标点相对于玩家的偏移（看向前方中央）
      targetOffset: new THREE.Vector3(0, 2, -20), // 看向玩家前方10米，高度1.5米
      // 平滑跟随速度 (位置惯性)
      smoothSpeed: 0.1,
      // 视角平滑速度 (LookAt Smoothing)
      lookAtSmoothSpeed: 0.15,
    }

    // ===== Tracking Shot 配置 =====
    this.trackingConfig = {
      // 动态 FOV 配置
      fov: {
        enabled: true,
        baseFov: 42, // 基础 FOV
        maxFov: 72, // 最大 FOV（高速时）
        speedThreshold: 3.0, // 达到最大 FOV 的速度阈值
        smoothSpeed: 0.05, // FOV 变化平滑度
      },
      // Camera Bobbing (手持/步伐震动) 配置
      bobbing: {
        enabled: true,
        // 垂直震动 (Y轴)
        verticalFrequency: 6.0, // 频率 (Hz)
        verticalAmplitude: 0.02, // 幅度 (米)
        // 水平震动 (X轴)
        horizontalFrequency: 4.0, // 频率 (Hz)
        horizontalAmplitude: 0.01, // 幅度 (米)
        // Roll 倾斜震动 (模拟左右脚步)
        rollFrequency: 4.0, // 频率 (Hz)
        rollAmplitude: 0.005, // 幅度 (弧度)
        // 速度因子
        speedMultiplier: 1.0, // 速度越快震动越明显
        // 静止时的微小呼吸感
        idleBreathing: {
          enabled: true,
          frequency: 0.7, // 呼吸频率
          amplitude: 0.015, // 呼吸幅度
        },
      },
    }

    // 内部状态
    this._smoothedLookAtTarget = new THREE.Vector3()
    this._currentFov = this.trackingConfig.fov.baseFov
    this._bobbingOffset = new THREE.Vector3()
    this._bobbingRoll = 0
    this._basePosition = new THREE.Vector3() // 计算后的基础位置（不含震动）
    this._playerSpeed = 0 // 缓存玩家速度
    this._terrainInfo = this._getTerrainInfo()
    this._topViewConfig = {
      margin: 1.15, // 鸟瞰/正交时的视野留白
      birdDistanceRatio: 1.6, // 鸟瞰距离 = 半径 * ratio
      birdHeightRatio: 1.2, // 鸟瞰高度 = 半径 * ratio
      orthoHeightRatio: 2.2, // 正交高度 = 半径 * ratio
    }
    this._modeLabel = { current: '鸟瞰透视' }

    // 初始化相机与控制器
    this.setInstances()
    this.setControls()
    this.switchMode(orthographic ? this.cameraModes.ORTHO_TOP : this.cameraModes.BIRD_PERSPECTIVE)
    this.setDebug()

    emitter.on('input:toggle_camera_side', () => {
      this.toggleSide()
    })
    emitter.on('terrain:updated', () => {
      this._terrainInfo = this._getTerrainInfo()
      if (this.currentMode !== this.cameraModes.THIRD_PERSON) {
        this._applyTopViewPlacement()
      }
    })
  }

  toggleSide() {
    // 仅在第三人称模式下切换左右
    if (this.currentMode !== this.cameraModes.THIRD_PERSON)
      return

    this.followConfig.offset.x *= -1
    const player = this.experience.world?.player
    if (player?.movement) {
      player.movement.setCameraOffset(this.followConfig.offset)
    }
  }

  setInstances() {
    // 透视相机（用于第三人称与鸟瞰透视）
    this.perspectiveCamera = new THREE.PerspectiveCamera(
      this.trackingConfig.fov.baseFov,
      this.sizes.width / this.sizes.height,
      0.1,
      500,
    )
    this.perspectiveCamera.position.copy(this.position)
    this.perspectiveCamera.lookAt(this.target)

    // 正交相机（用于顶视）
    this.frustumSize = 1
    this.orthographicCamera = new THREE.OrthographicCamera(
      -this.frustumSize * this.sizes.aspect,
      this.frustumSize * this.sizes.aspect,
      this.frustumSize,
      -this.frustumSize,
      -50,
      1000,
    )
    this.orthographicCamera.position.set(0, 10, 0)
    this.orthographicCamera.lookAt(new THREE.Vector3(0, 0, 0))

    // 默认使用透视相机
    this.instance = this.perspectiveCamera
    this.scene.add(this.perspectiveCamera)
    this.scene.add(this.orthographicCamera)
  }

  setControls() {
    if (this.orbitControls) {
      this.orbitControls.dispose()
    }
    if (this.trackballControls) {
      this.trackballControls.dispose()
    }

    // OrbitControls 设置（默认绑定当前相机）
    this.orbitControls = new OrbitControls(this.instance, this.canvas)
    this.orbitControls.enableDamping = true
    this.orbitControls.enableZoom = true
    this.orbitControls.enablePan = false
    this.orbitControls.enabled = false // 第三人称默认禁用
    this.orbitControls.target.copy(this.target)

    // 约束
    this.orbitControls.maxPolarAngle = Math.PI / 2 - 0.05
    this.orbitControls.minDistance = 5

    // TrackballControls 设置（仅用于缩放，不允许旋转）
    this.trackballControls = new TrackballControls(this.instance, this.canvas)
    this.trackballControls.noRotate = true
    this.trackballControls.noPan = true
    this.trackballControls.noZoom = false
    this.trackballControls.zoomSpeed = 1
    this.trackballControls.enabled = false // 默认禁用

    // 同步两个控制器的目标点
    this.trackballControls.target.copy(this.target)
  }

  /**
   * 切换相机模式
   * @param {string} mode - 视角模式
   */
  switchMode(mode) {
    if (!Object.values(this.cameraModes).includes(mode))
      return
    if (mode === this.currentMode)
      return

    this.previousMode = this.currentMode
    this.currentMode = mode

    // 根据模式选择相机实例
    if (mode === this.cameraModes.ORTHO_TOP) {
      this.instance = this.orthographicCamera
    }
    else {
      this.instance = this.perspectiveCamera
      // 确保 FOV 使用基础值
      this.instance.fov = this.trackingConfig.fov.baseFov
      this.instance.updateProjectionMatrix()
    }

    // 重新挂载控制器到当前相机
    this.setControls()

    if (mode === this.cameraModes.THIRD_PERSON) {
      // 第三人称跟随：禁用 Orbit，使用自定义逻辑
      this.orbitControls.enabled = false
      this.trackballControls.enabled = false
    }
    else if (mode === this.cameraModes.BIRD_PERSPECTIVE) {
      // 鸟瞰透视：启用 Orbit，允许旋转/缩放
      this._configureBirdViewOrbit()
      this._applyTopViewPlacement()
    }
    else if (mode === this.cameraModes.ORTHO_TOP) {
      // 正交顶视：启用 Orbit，仅允许缩放
      this._configureOrthoViewOrbit()
      this._applyTopViewPlacement()
    }

    this._modeLabel.current = this._translateMode(mode)
    if (this._modeBinding) {
      this._modeBinding.refresh()
    }

    this._notifyRenderer()
  }

  /**
   * 鸟瞰模式的 Orbit 配置
   */
  _configureBirdViewOrbit() {
    const info = this._terrainInfo
    const radius = info?.radius || 80
    const minDistance = Math.max(5, radius * 0.3)
    const maxDistance = radius * 4

    this.orbitControls.enabled = true
    this.orbitControls.enableRotate = true
    this.orbitControls.enablePan = false
    this.orbitControls.enableZoom = true
    this.orbitControls.minDistance = minDistance
    this.orbitControls.maxDistance = maxDistance
    this.orbitControls.minPolarAngle = Math.PI * 0.1
    this.orbitControls.maxPolarAngle = Math.PI / 2 - 0.05
    this.trackballControls.enabled = false
  }

  /**
   * 正交模式的 Orbit 配置（只允许缩放）
   */
  _configureOrthoViewOrbit() {
    this.orbitControls.enabled = true
    this.orbitControls.enableRotate = false
    this.orbitControls.enablePan = false
    this.orbitControls.enableZoom = true
    // 限制缩放范围，避免过近导致裁剪
    this.orbitControls.minZoom = 0.2
    this.orbitControls.maxZoom = 8
    this.trackballControls.enabled = false
  }

  /**
   * 根据地形信息设置鸟瞰/正交视角的位置与投影
   */
  _applyTopViewPlacement() {
    const info = this._terrainInfo
    const center = info?.center || new THREE.Vector3(0, 0, 0)
    const radius = info?.radius || 80

    if (this.currentMode === this.cameraModes.BIRD_PERSPECTIVE) {
      const distance = radius * this._topViewConfig.birdDistanceRatio
      const height = radius * this._topViewConfig.birdHeightRatio
      const offset = new THREE.Vector3(distance, height, distance)
      this.instance.position.copy(center).add(offset)
      this.instance.lookAt(center)
      this.orbitControls.target.copy(center)
    }
    else if (this.currentMode === this.cameraModes.ORTHO_TOP) {
      const height = radius * this._topViewConfig.orthoHeightRatio
      this.instance.position.set(center.x, center.y + height, center.z)
      // 保持正交俯视
      this.instance.up.set(0, 1, 0)
      this.instance.lookAt(center)
      this.orbitControls.target.copy(center)
      this.updateOrthographicFrustum(info)
    }
  }

  /**
   * 更新正交相机的视锥，覆盖整张地形
   */
  updateOrthographicFrustum(info = this._terrainInfo) {
    const width = info?.width || 128
    const depth = info?.depth || 128
    const half = Math.max(width, depth) * 0.5 * this._topViewConfig.margin
    const aspect = this.sizes.width / this.sizes.height

    this.frustumSize = half * 2
    this.orthographicCamera.left = -half * aspect
    this.orthographicCamera.right = half * aspect
    this.orthographicCamera.top = half
    this.orthographicCamera.bottom = -half
    this.orthographicCamera.near = -50
    this.orthographicCamera.far = half * 10 + (info?.height || 20)
    this.orthographicCamera.updateProjectionMatrix()
  }

  /**
   * 获取地形信息：优先使用渲染器的真实包围信息
   */
  _getTerrainInfo() {
    const terrainRenderer = this.experience.world?.terrainRenderer
    if (terrainRenderer?.getBoundingInfo) {
      return terrainRenderer.getBoundingInfo()
    }
    const bounds = this.experience.terrainDataManager?.getBounds()
    if (bounds) {
      const width = bounds.maxX - bounds.minX
      const depth = bounds.maxY - bounds.minY
      const radius = Math.sqrt(width * width + depth * depth) * 0.5
      return {
        center: new THREE.Vector3(0, 0, 0),
        width,
        depth,
        height: 10,
        radius,
      }
    }
    // 兜底默认尺寸
    return {
      center: new THREE.Vector3(0, 0, 0),
      width: 128,
      depth: 128,
      height: 10,
      radius: 90,
    }
  }

  /**
   * 绑定渲染器（用于切换相机时通知 RenderPass）
   */
  attachRenderer(renderer) {
    this.rendererRef = renderer
    this._notifyRenderer()
  }

  _notifyRenderer() {
    if (this.rendererRef?.onCameraSwitched) {
      this.rendererRef.onCameraSwitched(this.instance)
    }
  }

  _translateMode(mode) {
    if (mode === this.cameraModes.THIRD_PERSON)
      return '第三人称'
    if (mode === this.cameraModes.ORTHO_TOP)
      return '正交顶视'
    return '鸟瞰透视'
  }

  setDebug() {
    if (this.debugActive) {
      const cameraFolder = this.debug.ui.addFolder({
        title: 'Camera',
        expanded: false,
      })

      // ===== 视角切换 =====
      const modeFolder = cameraFolder.addFolder({
        title: '视角切换',
        expanded: true,
      })

      this._modeBinding = modeFolder.addBinding(this._modeLabel, 'current', {
        label: '当前模式',
        readonly: true,
      })

      modeFolder.addButton({
        title: '第三人称',
      }).on('click', () => {
        this.switchMode(this.cameraModes.THIRD_PERSON)
      })

      modeFolder.addButton({
        title: '鸟瞰透视',
      }).on('click', () => {
        this.switchMode(this.cameraModes.BIRD_PERSPECTIVE)
      })

      modeFolder.addButton({
        title: '正交顶视',
      }).on('click', () => {
        this.switchMode(this.cameraModes.ORTHO_TOP)
      })

      // ===== 基础跟随设置 =====
      const followFolder = cameraFolder.addFolder({
        title: '跟随设置',
        expanded: false,
      })

      followFolder.addBinding(this.followConfig, 'offset', {
        label: '相机偏移',
        x: { min: -20, max: 20, step: 0.5 },
        y: { min: 0, max: 30, step: 0.5 },
        z: { min: -20, max: 20, step: 0.5 },
      }).on('change', () => {
        // 同步 offset 到 movement 的 cameraAnchor
        const player = this.experience.world?.player
        if (player?.movement) {
          player.movement.setCameraOffset(this.followConfig.offset)
        }
      })

      followFolder.addBinding(this.followConfig, 'targetOffset', {
        label: '目标偏移',
        x: { min: -20, max: 20, step: 0.5 },
        y: { min: -5, max: 10, step: 0.5 },
        z: { min: -30, max: 10, step: 0.5 },
      }).on('change', () => {
        // 同步 targetOffset 到 movement 的 targetAnchor
        const player = this.experience.world?.player
        if (player?.movement) {
          player.movement.setTargetOffset(this.followConfig.targetOffset)
        }
      })

      followFolder.addBinding(this.followConfig, 'smoothSpeed', {
        label: '位置平滑',
        min: 0.01,
        max: 0.5,
        step: 0.01,
      })

      followFolder.addBinding(this.followConfig, 'lookAtSmoothSpeed', {
        label: '视角平滑',
        min: 0.01,
        max: 0.5,
        step: 0.01,
      })

      // ===== Tracking Shot - 动态 FOV =====
      const fovFolder = cameraFolder.addFolder({
        title: '动态 FOV (速度感)',
        expanded: true,
      })

      fovFolder.addBinding(this.trackingConfig.fov, 'enabled', {
        label: '启用',
      })

      fovFolder.addBinding(this.trackingConfig.fov, 'baseFov', {
        label: '基础 FOV',
        min: 30,
        max: 90,
        step: 1,
      })

      fovFolder.addBinding(this.trackingConfig.fov, 'maxFov', {
        label: '最大 FOV',
        min: 45,
        max: 120,
        step: 1,
      })

      fovFolder.addBinding(this.trackingConfig.fov, 'speedThreshold', {
        label: '速度阈值',
        min: 1,
        max: 10,
        step: 0.5,
      })

      fovFolder.addBinding(this.trackingConfig.fov, 'smoothSpeed', {
        label: 'FOV 平滑',
        min: 0.01,
        max: 0.2,
        step: 0.01,
      })

      // ===== Camera Bobbing =====
      const bobbingFolder = cameraFolder.addFolder({
        title: '镜头震动 (Bobbing)',
        expanded: true,
      })

      bobbingFolder.addBinding(this.trackingConfig.bobbing, 'enabled', {
        label: '启用',
      })

      bobbingFolder.addBinding(this.trackingConfig.bobbing, 'verticalFrequency', {
        label: '垂直频率',
        min: 1,
        max: 20,
        step: 0.5,
      })

      bobbingFolder.addBinding(this.trackingConfig.bobbing, 'verticalAmplitude', {
        label: '垂直幅度',
        min: 0,
        max: 0.2,
        step: 0.005,
      })

      bobbingFolder.addBinding(this.trackingConfig.bobbing, 'horizontalFrequency', {
        label: '水平频率',
        min: 1,
        max: 20,
        step: 0.5,
      })

      bobbingFolder.addBinding(this.trackingConfig.bobbing, 'horizontalAmplitude', {
        label: '水平幅度',
        min: 0,
        max: 0.1,
        step: 0.005,
      })

      bobbingFolder.addBinding(this.trackingConfig.bobbing, 'rollFrequency', {
        label: 'Roll 频率',
        min: 1,
        max: 20,
        step: 0.5,
      })

      bobbingFolder.addBinding(this.trackingConfig.bobbing, 'rollAmplitude', {
        label: 'Roll 幅度',
        min: 0,
        max: 0.05,
        step: 0.001,
      })

      bobbingFolder.addBinding(this.trackingConfig.bobbing, 'speedMultiplier', {
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

      breathingFolder.addBinding(this.trackingConfig.bobbing.idleBreathing, 'enabled', {
        label: '启用',
      })

      breathingFolder.addBinding(this.trackingConfig.bobbing.idleBreathing, 'frequency', {
        label: '频率',
        min: 0.1,
        max: 2,
        step: 0.1,
      })

      breathingFolder.addBinding(this.trackingConfig.bobbing.idleBreathing, 'amplitude', {
        label: '幅度',
        min: 0,
        max: 0.02,
        step: 0.001,
      })

      // 切换控制器
      const controlsToggle = {
        useOrbitControls: false,
      }
      cameraFolder.addBinding(controlsToggle, 'useOrbitControls', {
        label: '使用 Orbit Controls',
      }).on('change', (ev) => {
        this.orbitControls.enabled = ev.value
        this.trackballControls.enabled = false
      })
    }
  }

  /**
   * 更新动态 FOV
   * 根据玩家速度动态调整 FOV，速度越快 FOV 越大（产生拉伸/推背感）
   */
  updateDynamicFov(speed) {
    if (!this.trackingConfig.fov.enabled || this.currentMode !== this.cameraModes.THIRD_PERSON)
      return

    const { baseFov, maxFov, speedThreshold, smoothSpeed } = this.trackingConfig.fov

    // 根据速度计算目标 FOV
    const speedRatio = Math.min(speed / speedThreshold, 1.0)
    const targetFov = baseFov + (maxFov - baseFov) * speedRatio

    // 平滑过渡到目标 FOV
    this._currentFov += (targetFov - this._currentFov) * smoothSpeed
    this.instance.fov = this._currentFov
    this.instance.updateProjectionMatrix()
  }

  /**
   * 更新 Camera Bobbing (手持/步伐震动)
   * 根据运动状态产生模拟真实摄影机的震动效果
   */
  updateBobbing(speed, isMoving) {
    if (!this.trackingConfig.bobbing.enabled) {
      this._bobbingOffset.set(0, 0, 0)
      this._bobbingRoll = 0
      return
    }

    const elapsed = this.time.elapsed / 1000 // 转换为秒
    const bobbing = this.trackingConfig.bobbing

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

  updateCamera() {
    this.instance.position.copy(this.position)
    this.instance.lookAt(this.target)
    this.orbitControls.target.copy(this.target)
    this.trackballControls.target.copy(this.target)
    this.orbitControls.update()
    this.trackballControls.update()
  }

  resize() {
    if (this.currentMode === this.cameraModes.ORTHO_TOP) {
      this.updateOrthographicFrustum()
    }
    else {
      this.instance.aspect = this.sizes.width / this.sizes.height
      this.instance.updateProjectionMatrix()
    }
    this.trackballControls.handleResize()
  }

  /**
   * 初始化錨點偏移（在 player 創建後調用）
   * 將 followConfig 的 offset 同步到 movement 的錨點
   */
  initAnchors() {
    const player = this.experience.world?.player
    if (player?.movement) {
      player.movement.setCameraOffset(this.followConfig.offset)
      player.movement.setTargetOffset(this.followConfig.targetOffset)
      this._anchorsInitialized = true
    }
  }

  update() {
    // 鸟瞰透视：Orbit 控制视角
    if (this.currentMode === this.cameraModes.BIRD_PERSPECTIVE) {
      this.orbitControls.update()
      this.trackballControls.update()
      return
    }

    // 正交顶视：仅处理缩放
    if (this.currentMode === this.cameraModes.ORTHO_TOP) {
      this.orbitControls.update()
      return
    }

    // 如果第三人称下主动开启 Orbit（调试时），优先使用 Orbit
    if (this.orbitControls.enabled) {
      this.orbitControls.update()
      return
    }

    // 第三人称跟随逻辑 + Tracking Shot
    if (this.experience.world?.player?.model) {
      const player = this.experience.world.player

      // 首次初始化錨點偏移
      if (!this._anchorsInitialized) {
        this.initAnchors()
      }

      // 计算玩家速度（用于 Tracking Shot 效果）
      let speed = 0
      let isMoving = false
      if (player.movement?.rigidBody) {
        const vel = player.movement.rigidBody.linvel()
        speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z)
        isMoving = speed > 0.1
      }
      this._playerSpeed = speed

      // ===== 從錨點獲取世界位置（自動包含朝向旋轉） =====
      const desiredCameraPos = new THREE.Vector3()
      const desiredTargetPos = new THREE.Vector3()

      // 從 cameraAnchor 獲取攝像頭目標位置
      player.movement.cameraAnchor.getWorldPosition(desiredCameraPos)
      // 從 targetAnchor 獲取觀察目標位置
      player.movement.targetAnchor.getWorldPosition(desiredTargetPos)

      // ===== 位置惯性 (Position Lag) =====
      // 平滑插值相机基础位置
      this._basePosition.lerp(
        desiredCameraPos,
        this.followConfig.smoothSpeed,
      )

      // ===== 视角平滑 (LookAt Smoothing) =====
      // 平滑插值目标点
      this._smoothedLookAtTarget.lerp(
        desiredTargetPos,
        this.followConfig.lookAtSmoothSpeed,
      )

      // ===== 动态 FOV =====
      this.updateDynamicFov(speed)

      // ===== Camera Bobbing =====
      this.updateBobbing(speed, isMoving)

      // ===== 应用最终位置 =====
      // 基础位置 + 震动偏移
      this.instance.position.copy(this._basePosition).add(this._bobbingOffset)

      // 更新相机朝向
      this.instance.lookAt(this._smoothedLookAtTarget)

      // 应用 Roll 倾斜（需要在 lookAt 之后）
      if (this._bobbingRoll !== 0) {
        this.instance.rotateZ(this._bobbingRoll)
      }

      // 更新控制器目标（如果需要切换到OrbitControls）
      this.orbitControls.target.copy(this._smoothedLookAtTarget)
      this.trackballControls.target.copy(this._smoothedLookAtTarget)
    }

    // 更新TrackballControls（即使禁用也要更新以保持同步）
    this.trackballControls.update()
  }
}
