import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js'

import Experience from '../experience.js'
import emitter from '../utils/event-bus.js'

export default class Camera {
  constructor() {
    this.experience = new Experience()
    this.sizes = this.experience.sizes
    this.scene = this.experience.scene
    this.canvas = this.experience.canvas
    this.debug = this.experience.debug
    this.debugActive = this.experience.debug.active
    this.time = this.experience.time

    // Rig Reference
    this.rig = null

    // 相机可视化助手
    this.cameraHelper = null
    this.cameraHelperVisible = false

    // 视角模式枚举（仅保留第三人称与鸟瞰）
    this.cameraModes = {
      THIRD_PERSON: 'third-person',
      BIRD_PERSPECTIVE: 'bird-perspective',
    }
    this.currentMode = null
    this.previousMode = null

    this.position = new THREE.Vector3(0, 0, 0)
    this.target = new THREE.Vector3(0, 0, 0)

    // 内部状态
    this._adaptiveY = null
    this._terrainInfo = this._getTerrainInfo()
    this._topViewConfig = {
      birdDistanceRatio: 1.6, // 鸟瞰距离 = 半径 * ratio
      birdHeightRatio: 1.2, // 鸟瞰高度 = 半径 * ratio
    }
    this._modeLabel = { current: '第三人称' }

    // 地形自适应配置
    this.terrainAdapt = {
      enabled: true,
      clearance: 1.5, // 期望离地净空
      smoothSpeed: 0.09, // 纵向平滑
      maxRaise: 6.0, // 单帧相对基础位置最大抬升
    }

    // 内部缓存
    // this._raycaster = new THREE.Raycaster() // 已移除遮挡避让

    // 初始化相机与控制器
    this.setInstances()
    this._createCameraHelper()
    this.setControls()
    // 默认进入第三人称，保证跟随逻辑与镜头震动生效
    this.switchMode(this.cameraModes.THIRD_PERSON)
    this.setDebug()

    emitter.on('input:toggle_camera_side', () => {
      this.toggleSide()
    })
    emitter.on('terrain:data-ready', () => {
      this._terrainInfo = this._getTerrainInfo()
      if (this.currentMode !== this.cameraModes.THIRD_PERSON) {
        this._applyTopViewPlacement()
      }
    })
  }

  attachRig(rig) {
    this.rig = rig
    if (this.debugActive && this.debugFolder && this.rig) {
      this.rig.setDebug(this.debugFolder)
    }
  }

  toggleSide() {
    // 仅在第三人称模式下切换左右
    if (this.currentMode !== this.cameraModes.THIRD_PERSON)
      return

    if (this.rig) {
      this.rig.toggleSide()
    }
  }

  setInstances() {
    // 透视相机（用于第三人称与鸟瞰透视）
    // Initial FOV (will be updated by Rig)
    this.perspectiveCamera = new THREE.PerspectiveCamera(
      55,
      this.sizes.width / this.sizes.height,
      0.1,
      500,
    )
    this.perspectiveCamera.position.copy(this.position)
    this.perspectiveCamera.lookAt(this.target)

    // 默认使用透视相机
    this.instance = this.perspectiveCamera
    this.scene.add(this.perspectiveCamera)
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

    // 根据模式选择相机实例（仅透视相机）
    this.instance = this.perspectiveCamera
    // FOV 重置将由 Rig Update 处理 (如果是第三人称)
    // 如果是鸟瞰，恢复默认FOV?
    // 鸟瞰没有动态FOV，所以可以重置。
    // 但 Rig 的 _currentFov 状态可能还保留着。
    // 切换回第三人称时，Rig 会继续更新 FOV。

    this.instance.updateProjectionMatrix()

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

    this._modeLabel.current = this._translateMode(mode)
    if (this._modeBinding) {
      this._modeBinding.refresh()
    }

    // 切换相机后重建可视化助手
    this._createCameraHelper()

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
   * 根据地形信息设置鸟瞰透视的位置
   */
  _applyTopViewPlacement() {
    const info = this._terrainInfo
    const center = info?.center || new THREE.Vector3(0, 0, 0)
    const radius = info?.radius || 80

    const distance = radius * this._topViewConfig.birdDistanceRatio
    const height = radius * this._topViewConfig.birdHeightRatio
    const offset = new THREE.Vector3(distance, height, distance)
    this.instance.position.copy(center).add(offset)
    this.instance.lookAt(center)
    this.orbitControls.target.copy(center)
  }

  /**
   * 获取地形信息：优先使用渲染器的真实包围信息
   */
  _getTerrainInfo() {
    const terrainRenderer = this.experience.world?.terrainRenderer
    if (terrainRenderer?.getBoundingInfo) {
      return terrainRenderer.getBoundingInfo()
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

  _createCameraHelper() {
    // 释放旧助手
    if (this.cameraHelper) {
      this.scene.remove(this.cameraHelper)
      this.cameraHelper.geometry?.dispose?.()
      this.cameraHelper.material?.dispose?.()
    }
    this.cameraHelper = new THREE.CameraHelper(this.instance)
    this.cameraHelper.visible = this.cameraHelperVisible
    this.scene.add(this.cameraHelper)
  }

  _notifyRenderer() {
    if (this.rendererRef?.onCameraSwitched) {
      this.rendererRef.onCameraSwitched(this.instance)
    }
  }

  _translateMode(mode) {
    if (mode === this.cameraModes.THIRD_PERSON)
      return '第三人称'
    return '鸟瞰透视'
  }

  // #region
  setDebug() {
    if (this.debugActive) {
      this.debugFolder = this.debug.ui.addFolder({
        title: 'Camera',
        expanded: false,
      })

      // ===== 视角切换 =====
      const modeFolder = this.debugFolder.addFolder({
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

      // ===== Rig Debug (Follow, Tracking) =====
      // 这里的 Debug UI 将在 attachRig 中由 Rig 注入

      // ===== 地形自适应高度 =====
      const terrainFolder = this.debugFolder.addFolder({
        title: '地形自适应',
        expanded: true,
      })

      terrainFolder.addBinding(this.terrainAdapt, 'enabled', {
        label: '启用自适应',
      })

      terrainFolder.addBinding(this.terrainAdapt, 'clearance', {
        label: '离地净空',
        min: 0.2,
        max: 5,
        step: 0.1,
      })

      terrainFolder.addBinding(this.terrainAdapt, 'smoothSpeed', {
        label: '纵向平滑',
        min: 0.05,
        max: 0.6,
        step: 0.01,
      })

      terrainFolder.addBinding(this.terrainAdapt, 'maxRaise', {
        label: '单帧最大抬升',
        min: 0.5,
        max: 10,
        step: 0.1,
      })

      // 切换控制器
      const controlsToggle = {
        useOrbitControls: false,
      }
      this.debugFolder.addBinding(controlsToggle, 'useOrbitControls', {
        label: '使用 Orbit Controls',
      }).on('change', (ev) => {
        this.orbitControls.enabled = ev.value
        this.trackballControls.enabled = false
      })

      // 相机视锥助手
      this.debugFolder.addBinding(this, 'cameraHelperVisible', {
        label: '显示相机助手',
      }).on('change', (ev) => {
        if (this.cameraHelper) {
          this.cameraHelper.visible = ev.value
          this.cameraHelper.update()
        }
      })
    }
  }

  // #endregion

  updateCamera() {
    this.instance.position.copy(this.position)
    this.instance.lookAt(this.target)
    this.orbitControls.target.copy(this.target)
    this.trackballControls.target.copy(this.target)
    this.orbitControls.update()
    this.trackballControls.update()
  }

  resize() {
    this.instance.aspect = this.sizes.width / this.sizes.height
    this.instance.updateProjectionMatrix()
    if (this.cameraHelper)
      this.cameraHelper.update()
    this.trackballControls.handleResize()
  }

  update() {
    // 鸟瞰透视：Orbit 控制视角
    if (this.currentMode === this.cameraModes.BIRD_PERSPECTIVE) {
      this.orbitControls.update()
      this.trackballControls.update()
      return
    }

    // 如果第三人称下主动开启 Orbit（调试时），优先使用 Orbit
    if (this.orbitControls.enabled) {
      this.orbitControls.update()
      return
    }

    // 第三人称跟随逻辑 + Tracking Shot
    if (this.rig) {
      const output = this.rig.update()
      if (!output)
        return

      // ===== 位置处理 =====
      // 1. 获取 Rig 计算的基础位置 (已包含位置平滑)
      const basePos = output.cameraPos

      // 2. 地形自适应 (在基础位置上做纵向调整)
      const terrainAdjustedPos = this._applyTerrainAdaptation(basePos)

      // 3. 叠加 Bobbing 偏移 (最后叠加)
      this.instance.position.copy(terrainAdjustedPos).add(output.bobbingOffset)

      // ===== 朝向处理 =====
      // 更新相机朝向 (LookAt 已经由 Rig 平滑处理)
      this.instance.lookAt(output.targetPos)

      // 应用 Roll 倾斜（需要在 lookAt 之后）
      if (output.bobbingRoll !== 0) {
        this.instance.rotateZ(output.bobbingRoll)
      }

      // ===== FOV 处理 =====
      if (this.instance.fov !== output.fov) {
        this.instance.fov = output.fov
        this.instance.updateProjectionMatrix()
      }

      // 更新控制器目标（如果需要切换到OrbitControls）
      this.orbitControls.target.copy(output.targetPos)
      this.trackballControls.target.copy(output.targetPos)
    }

    // 更新TrackballControls（即使禁用也要更新以保持同步）
    this.trackballControls.update()
  }

  /**
   * 地形自适应：根据地面高度抬升相机，保持净空
   * @param {THREE.Vector3} desiredCameraPos - 錨點計算出的理想相機位置
   */
  _applyTerrainAdaptation(desiredCameraPos) {
    if (!this.terrainAdapt.enabled || this.rig.isInCave) {
      this._adaptiveY = desiredCameraPos.y
      return desiredCameraPos
    }

    const ground = this._sampleGroundHeight(desiredCameraPos.x, desiredCameraPos.z)

    if (ground === null) {
      this._adaptiveY = desiredCameraPos.y
      return desiredCameraPos
    }

    if (this._adaptiveY === null)
      this._adaptiveY = desiredCameraPos.y

    // 期望的最低高度：地面 + 净空
    const minY = ground + this.terrainAdapt.clearance
    // 不降低原有高度，只在需要时抬升，并限制单帧最大抬升
    const targetY = Math.min(
      Math.max(desiredCameraPos.y, minY),
      desiredCameraPos.y + this.terrainAdapt.maxRaise,
    )

    this._adaptiveY += (targetY - this._adaptiveY) * this.terrainAdapt.smoothSpeed

    const adjusted = desiredCameraPos.clone()
    adjusted.y = this._adaptiveY
    return adjusted
  }

  /**
   * 采样地面高度：从容器数据中查找最高非空方块
   */
  _sampleGroundHeight(x, z) {
    // 无限地形（chunk streaming）下，通过 ChunkManager（experience.terrainDataManager）采样
    const provider = this.experience.terrainDataManager

    const scale = provider?.renderParams?.scale ?? 1
    const heightScale = provider?.renderParams?.heightScale ?? 1

    // 将世界坐标映射到“方块索引空间”
    const ix = Math.floor(x / scale)
    const iz = Math.floor(z / scale)

    if (provider?.getTopSolidYWorld) {
      const topY = provider.getTopSolidYWorld(ix, iz)
      if (topY === null)
        return null
      // 方块顶部世界高度 = (y + 1) * heightScale * scale
      return (topY + 1) * heightScale * scale
    }

    return null
  }
}
