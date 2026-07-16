/**
 * 皮肤预览场景
 * 独立的 3D 渲染器，用于皮肤选择界面的角色预览
 * 不依赖 Experience 单例，可独立运行
 *
 * Phase 4：独立 WebGPURenderer，通过 create() 等待异步初始化。
 */
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as THREE from 'three/webgpu'

/**
 * 初始化皮肤预览渲染器并强制验证 WebGPU 后端。
 * @param {THREE.WebGPURenderer} renderer - 待初始化的渲染器
 * @returns {Promise<void>} WebGPU 后端初始化完成后兑现
 */
export async function initializeSkinPreviewRenderer(renderer) {
  await renderer.init()
  if (renderer.backend?.isWebGPUBackend !== true)
    throw new Error('[SkinPreview] WebGPU backend unavailable')
}

export default class SkinPreviewScene {
  /**
   * 异步创建完成初始化的皮肤预览场景。
   * @param {HTMLCanvasElement} canvas - 渲染目标画布
   * @returns {Promise<SkinPreviewScene>} 完成初始化的预览场景
   */
  static async create(canvas) {
    const preview = new SkinPreviewScene(canvas)
    try {
      await preview._init()
      return preview
    }
    catch (error) {
      preview.dispose()
      throw error
    }
  }

  /**
   * 创建皮肤预览场景
   * @param {HTMLCanvasElement} canvas - 渲染目标画布
   */
  constructor(canvas) {
    // 画布引用
    this.canvas = canvas

    // 创建独立的场景
    this.scene = new THREE.Scene()

    // 创建透视相机
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)

    this.renderer = new THREE.WebGPURenderer({
      canvas,
      alpha: true,
      antialias: true,
    })
    this._disposed = false
    this._initialized = false

    // GLTF 加载器
    this.loader = new GLTFLoader()

    // 模型相关
    this.currentModel = null
    this.animations = [] // 存储所有动画 clips
    this.mixer = null
    this.currentAction = null

    // 旋转控制
    this.modelRotation = 0 // 初始朝向（面向相机）
    this.targetRotation = 0
    this.isDragging = false
    this.lastMouseX = 0

    // 加载控制（防止重复加载）
    this.loadingId = 0
    this.currentLoadingId = 0

    // 时钟（用于动画更新）
    this.clock = new THREE.Clock()

    // 动画帧 ID（用于清理）
    this.animationFrameId = null

    // 事件处理函数引用（用于移除监听）
    this._onMouseMove = null
    this._onMouseUp = null
  }

  /**
   * 等待 WebGPU 就绪后再安装交互并启动渲染循环。
   * @returns {Promise<void>}
   */
  async _init() {
    await initializeSkinPreviewRenderer(this.renderer)
    if (this._disposed)
      return

    this._setupScene()
    this._setupLights()
    this._setupBackground()
    this._setupShadow()
    this._setupDragControls()
    this._initialized = true
    this._startRenderLoop()
  }

  /**
   * 初始化场景
   * 设置相机位置和渲染器参数
   */
  _setupScene() {
    // 相机位置（正面稍偏上，看向角色胸部位置）
    this.camera.position.set(0, 1.2, 3.5)
    this.camera.lookAt(0, 0.9, 0)

    // 渲染器设置
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
  }

  /**
   * 设置灯光（模拟户外光照）
   * 三点光源布局：主光、环境光、补光
   */
  _setupLights() {
    // 主光源（从相机方向照射，照亮正面）
    const sunLight = new THREE.DirectionalLight(0xFFFFFF, 1.5)
    sunLight.position.set(0, 5, 5) // 从正面稍上方照射
    this.scene.add(sunLight)

    // 环境光（天空散射光）
    const ambientLight = new THREE.AmbientLight(0x87CEEB, 0.6)
    this.scene.add(ambientLight)

    // 补光（从侧面补充，减少阴影过暗）
    const fillLight = new THREE.DirectionalLight(0xFFFFFF, 0.4)
    fillLight.position.set(3, 3, 3) // 从右前侧照射
    this.scene.add(fillLight)

    // 背面补光（轻微照亮背面，避免完全黑暗）
    const backLight = new THREE.DirectionalLight(0xFFFFFF, 0.2)
    backLight.position.set(0, 3, -3) // 从背面照射，强度较低
    this.scene.add(backLight)

    // 底部反射光（模拟地面反射）
    const bounceLight = new THREE.DirectionalLight(0x5BA85B, 0.2)
    bounceLight.position.set(0, -2, 0)
    this.scene.add(bounceLight)
  }

  /**
   * 设置景深模糊背景（类似 PMC 风格）
   * 使用 Canvas 2D 绘制渐变背景
   */
  _setupBackground() {
    // 创建渐变背景纹理
    const bgCanvas = document.createElement('canvas')
    bgCanvas.width = 256
    bgCanvas.height = 256
    const ctx = bgCanvas.getContext('2d')

    // 渐变：天空蓝 → 草地绿
    const gradient = ctx.createLinearGradient(0, 0, 0, 256)
    gradient.addColorStop(0, '#ced8df') // 天空蓝
    gradient.addColorStop(0.5, '#d0ddd9') // 浅草绿
    gradient.addColorStop(0.7, '#5BA85B') // 草地绿
    gradient.addColorStop(1, '#3A7A3A') // 深绿

    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 256, 256)

    // 创建纹理并设置为场景背景
    const bgTexture = new THREE.CanvasTexture(bgCanvas)
    this.scene.background = bgTexture
  }

  /**
   * 创建并设置角色脚底的圆形假阴影
   */
  _setupShadow() {
    // 创建径向渐变纹理
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')

    // 径向渐变：中心黑(半透明) -> 边缘透明
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.5)') // 中心透明度 0.7
    gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.45)') // 中心透明度 0.5
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)') // 边缘完全透明

    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 128, 128)

    const shadowTexture = new THREE.CanvasTexture(canvas)

    // 创建阴影平面
    // 大小设置为 1.2，略大于一般角色站立面积
    const geometry = new THREE.PlaneGeometry(1.2, 1.2)
    const material = new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false, // 防止遮挡模型
      opacity: 0.8,
    })

    this.shadowMesh = new THREE.Mesh(geometry, material)

    // 旋转至水平并稍微抬高以避免 z-fighting
    this.shadowMesh.rotation.x = -Math.PI / 2
    this.shadowMesh.position.y = 0.01

    this.scene.add(this.shadowMesh)
  }

  /**
   * 设置鼠标拖拽旋转控制
   * 支持鼠标左键拖拽旋转角色
   */
  _setupDragControls() {
    // 鼠标按下事件
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true
      this.lastMouseX = e.clientX
    })

    // 鼠标移动事件（绑定到 window 以支持拖出画布）
    this._onMouseMove = (e) => {
      if (!this.isDragging)
        return

      const deltaX = e.clientX - this.lastMouseX
      // 水平移动转换为旋转角度
      this.targetRotation -= deltaX * 0.01
      this.lastMouseX = e.clientX
    }

    // 鼠标释放事件
    this._onMouseUp = () => {
      this.isDragging = false
    }

    // 添加全局事件监听
    window.addEventListener('mousemove', this._onMouseMove)
    window.addEventListener('mouseup', this._onMouseUp)

    // 触摸事件支持
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.isDragging = true
        this.lastMouseX = e.touches[0].clientX
      }
    })

    this._onTouchMove = (e) => {
      if (!this.isDragging || e.touches.length !== 1)
        return

      const deltaX = e.touches[0].clientX - this.lastMouseX
      this.targetRotation -= deltaX * 0.01
      this.lastMouseX = e.touches[0].clientX
    }

    this._onTouchEnd = () => {
      this.isDragging = false
    }

    window.addEventListener('touchmove', this._onTouchMove)
    window.addEventListener('touchend', this._onTouchEnd)
  }

  /**
   * 加载并显示皮肤模型
   * @param {string} modelPath - 模型路径（相对于 public 目录）
   * @returns {Promise<void>}
   */
  async loadModel(modelPath) {
    // 生成新的加载 ID
    this.loadingId++
    const currentLoadId = this.loadingId

    // 移除旧模型
    if (this.currentModel) {
      this.scene.remove(this.currentModel)

      // 停止并清理动画混合器
      if (this.mixer) {
        this.mixer.stopAllAction()
        this.mixer = null
      }

      // 释放旧模型资源
      this._disposeModel(this.currentModel)

      this.currentModel = null
      this.animations = []
      this.currentAction = null
    }

    try {
      // 加载新模型
      const gltf = await this.loader.loadAsync(modelPath)

      // 检查是否是最新的加载请求（防止并发加载导致重复模型）
      if (currentLoadId !== this.loadingId) {
        // 这不是最新的加载请求，释放已加载的模型并返回
        this._disposeModel(gltf.scene)
        return
      }

      this.currentLoadingId = currentLoadId
      this.currentModel = gltf.scene

      // 设置初始旋转
      this.currentModel.rotation.y = this.modelRotation

      // 添加到场景
      this.scene.add(this.currentModel)

      // 存储动画 clips
      this.animations = gltf.animations

      // 初始化动画混合器
      if (this.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(this.currentModel)
        // 默认播放 idle 动画
        this.playAnimation('idle')
      }
    }
    catch (error) {
      console.error('加载皮肤模型失败:', error)
      throw error
    }
  }

  /**
   * 播放指定动画
   * @param {string} clipName - 动画名称（支持模糊匹配）
   */
  playAnimation(clipName) {
    if (!this.mixer || this.animations.length === 0)
      return

    // 查找匹配的动画 clip（模糊匹配，不区分大小写）
    const clip
      = this.animations.find(a =>
        a.name.toLowerCase().includes(clipName.toLowerCase()),
      ) || this.animations[0]

    if (!clip) {
      console.warn(`未找到动画: ${clipName}`)
      return
    }

    // 平滑过渡：淡出当前动画
    if (this.currentAction) {
      this.currentAction.fadeOut(0.3)
    }

    // 创建并播放新动画
    this.currentAction = this.mixer.clipAction(clip)
    this.currentAction.reset()
    this.currentAction.timeScale = 1.5 // 设置播放速度为 1.5X
    this.currentAction.fadeIn(0.3)
    this.currentAction.play()
  }

  /**
   * 获取当前可用的动画列表
   * @returns {Array<string>} 动画名称数组
   */
  getAvailableAnimations() {
    return this.animations.map(clip => clip.name)
  }

  /**
   * 按钮控制旋转
   * @param {number} angle - 旋转角度（弧度），正值为顺时针
   */
  rotate(angle) {
    this.targetRotation += angle
  }

  /**
   * 向左旋转（顺时针 45 度）
   */
  rotateLeft() {
    this.rotate(Math.PI / 4)
  }

  /**
   * 向右旋转（逆时针 45 度）
   */
  rotateRight() {
    this.rotate(-Math.PI / 4)
  }

  /**
   * 重置旋转到初始位置
   */
  resetRotation() {
    this.targetRotation = 0
  }

  /**
   * 启动渲染循环
   */
  _startRenderLoop() {
    const animate = () => {
      if (this._disposed)
        return

      this.animationFrameId = requestAnimationFrame(animate)

      const delta = this.clock.getDelta()

      // 更新动画混合器
      if (this.mixer) {
        this.mixer.update(delta)
      }

      // 平滑旋转插值
      if (this.currentModel) {
        // 使用 lerp 实现平滑过渡
        this.modelRotation += (this.targetRotation - this.modelRotation) * 0.1
        this.currentModel.rotation.y = this.modelRotation
      }

      // 渲染场景
      this.renderer.render(this.scene, this.camera)
    }

    animate()
  }

  /**
   * 调整画布大小
   * @param {number} width - 新宽度
   * @param {number} height - 新高度
   */
  resize(width, height) {
    // 更新相机宽高比
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()

    // 更新渲染器尺寸
    this.renderer.setSize(width, height)
  }

  /**
   * 释放模型资源
   * @param {THREE.Object3D} model - 要释放的模型
   */
  _disposeModel(model) {
    model.traverse((child) => {
      if (child.isMesh) {
        // 释放几何体
        if (child.geometry) {
          child.geometry.dispose()
        }

        // 释放材质
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(material =>
              this._disposeMaterial(material),
            )
          }
          else {
            this._disposeMaterial(child.material)
          }
        }
      }
    })
  }

  /**
   * 释放材质资源
   * @param {THREE.Material} material - 要释放的材质
   */
  _disposeMaterial(material) {
    // 释放材质中的所有纹理
    for (const key of Object.keys(material)) {
      const value = material[key]
      if (value && value.isTexture) {
        value.dispose()
      }
    }
    material.dispose()
  }

  /**
   * 清理所有资源
   * 在 Vue 组件卸载时调用
   */
  dispose() {
    if (this._disposed)
      return
    this._disposed = true

    // 停止渲染循环
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    // 停止动画
    if (this.mixer) {
      this.mixer.stopAllAction()
      this.mixer = null
    }

    // 移除鼠标事件监听
    if (this._onMouseMove) {
      window.removeEventListener('mousemove', this._onMouseMove)
    }
    if (this._onMouseUp) {
      window.removeEventListener('mouseup', this._onMouseUp)
    }

    // 移除触摸事件监听
    if (this._onTouchMove) {
      window.removeEventListener('touchmove', this._onTouchMove)
    }
    if (this._onTouchEnd) {
      window.removeEventListener('touchend', this._onTouchEnd)
    }

    // 释放当前模型
    if (this.currentModel) {
      this.scene.remove(this.currentModel)
      this._disposeModel(this.currentModel)
      this.currentModel = null
    }

    // 释放背景纹理
    if (this.scene.background && this.scene.background.isTexture) {
      this.scene.background.dispose()
    }

    // 释放阴影资源
    if (this.shadowMesh) {
      this.shadowMesh.geometry.dispose()
      if (this.shadowMesh.material.map) {
        this.shadowMesh.material.map.dispose()
      }
      this.shadowMesh.material.dispose()
      this.shadowMesh = null
    }

    // 清空场景
    this.scene.clear()

    // 释放渲染器
    this.renderer?.dispose()

    // 清空引用
    this.animations = []
    this.currentAction = null
  }
}
