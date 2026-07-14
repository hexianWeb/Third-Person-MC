import * as THREE from 'three/webgpu'

import { SHADOW_CONFIG, SHADOW_QUALITY } from './config/shadow-config.js'
import Experience from './experience.js'
import emitter from './utils/event/event-bus.js'
import PlayerPreviewCamera from './world/player/player-preview-camera.js'

/**
 * Phase 1 PoC：WebGPURenderer 直渲（无 EffectComposer）
 * 后处理（Bloom / Speed Lines / Gaze）留待 Phase 2 TSL 迁移
 */
export default class Renderer {
  constructor() {
    this.experience = new Experience()
    this.canvas = this.experience.canvas
    this.sizes = this.experience.sizes
    this.scene = this.experience.scene
    this.camera = this.experience.camera
    this.debug = this.experience.debug

    this.playerPreview = null
    // WebGPU 异步 init 完成前禁止 render，避免竞态
    this.ready = false
    this.backendName = 'pending'
    this._initPromise = null

    // 后期处理配置保留（供 Settings / Player / Enemy 写入；Phase 1 不生效）
    this.postProcessConfig = {
      bloom: {
        enabled: true,
        strength: 0.05,
        radius: 0.1,
        threshold: 0.85,
      },
      speedLines: {
        enabled: true,
        color: { r: 255, g: 255, b: 255 },
        density: 66.0,
        speed: 6.0,
        thickness: 0.24,
        minRadius: 0.4,
        maxRadius: 1.3,
        randomness: 0.5,
        opacity: 0.0,
      },
      gaze: {
        enabled: true,
        intensity: 0.0,
      },
    }

    // 兼容 enemy-manager 等对 gazePass.uniforms 的写入（Phase 1 stub）
    this.gazePass = {
      enabled: false,
      uniforms: {
        uIntensity: { value: this.postProcessConfig.gaze.intensity },
      },
    }

    this.setInstance()
    this._initPromise = this._init()

    if (this.debug.active) {
      this.debugInit()
    }

    this.camera.attachRenderer(this)
    this._setupSettingsListeners()
  }

  /** 监听设置 UI 的后期处理变更（Phase 1 仅同步配置，不驱动 pass） */
  _setupSettingsListeners() {
    emitter.on('settings:postprocess-changed', ({ speedLines, gaze }) => {
      if (speedLines) {
        Object.assign(this.postProcessConfig.speedLines, speedLines)
      }

      if (gaze) {
        if (gaze.enabled !== undefined)
          this.postProcessConfig.gaze.enabled = gaze.enabled
        if (gaze.intensity !== undefined) {
          this.postProcessConfig.gaze.intensity = gaze.intensity
          this.gazePass.uniforms.uIntensity.value = gaze.intensity
        }
      }
    })
  }

  setInstance() {
    // 100% WebGPU-only：不设置 forceWebGL
    this.instance = new THREE.WebGPURenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: true,
    })
    this.instance.toneMapping = THREE.ACESFilmicToneMapping
    this.instance.toneMappingExposure = 1
    this.instance.shadowMap.enabled = true
    this.instance.shadowMap.type = THREE.PCFShadowMap
    this.instance.setClearColor('#000000', 0)
    this.instance.setSize(this.sizes.width, this.sizes.height)
    this.instance.setPixelRatio(this.sizes.pixelRatio)
    this.instance.autoClear = false
  }

  /**
   * 等待 WebGPU backend 初始化完成（供 Resources.detectSupport 等依赖 hasFeature 的调用方使用）
   * @returns {Promise<void>}
   */
  whenReady() {
    return this._initPromise ?? Promise.resolve()
  }

  /**
   * 异步初始化 WebGPU 设备
   */
  async _init() {
    try {
      await this.instance.init()
      const isWebGPU = this.instance.backend?.isWebGPUBackend === true
      this.backendName = isWebGPU ? 'webgpu' : 'webgl'
      console.info(`[Renderer] backend=${this.backendName}`)

      // 用户确认：100% WebGPU-only，不接受自动落到 WebGL 后端
      if (!isWebGPU) {
        this.ready = false
        throw new Error('[Renderer] WebGPU-only PoC: WebGPU backend unavailable (got WebGL)')
      }

      this.ready = true
    }
    catch (error) {
      console.error('[Renderer] WebGPU init failed:', error)
      this.ready = false
      if (this.backendName === 'pending')
        this.backendName = 'failed'
      throw error
    }
  }

  /**
   * 调试面板：显示后端 + 阴影质量；后处理面板标注 Phase 1 停用
   */
  debugInit() {
    const rendererFolder = this.debug.ui.addFolder({
      title: 'Renderer (WebGPU PoC)',
      expanded: true,
    })

    rendererFolder.addBinding(this, 'backendName', {
      label: '后端',
      readonly: true,
    })

    rendererFolder.addBinding(this, 'ready', {
      label: 'ready',
      readonly: true,
    })

    const postProcessFolder = this.debug.ui.addFolder({
      title: 'Post Processing (Phase 1 关闭)',
      expanded: false,
    })

    postProcessFolder.addBinding(this.postProcessConfig.speedLines, 'opacity', {
      label: '速度线透明度(仅配置)',
      min: 0,
      max: 1,
      step: 0.01,
      readonly: true,
    })

    postProcessFolder.addBinding(this.gazePass.uniforms.uIntensity, 'value', {
      label: '凝视强度(仅配置)',
      min: 0,
      max: 1,
      step: 0.01,
      readonly: true,
    })

    const shadowFolder = this.debug.ui.addFolder({
      title: 'Shadow Quality 阴影质量',
      expanded: true,
    })

    shadowFolder.addBinding(SHADOW_CONFIG, 'quality', {
      label: '质量等级',
      options: {
        '低 (Low)': SHADOW_QUALITY.LOW,
        '中 (Medium)': SHADOW_QUALITY.MEDIUM,
        '高 (High)': SHADOW_QUALITY.HIGH,
      },
    }).on('change', (ev) => {
      emitter.emit('shadow:quality-changed', { quality: ev.value })
    })

    emitter.emit('shadow:quality-changed', { quality: SHADOW_CONFIG.quality })
  }

  resize() {
    if (!this.instance)
      return

    this.instance.setSize(this.sizes.width, this.sizes.height)
    this.instance.setPixelRatio(this.sizes.pixelRatio)

    if (this.playerPreview) {
      this.playerPreview.resize()
    }
  }

  /**
   * 设置速度线透明度（Phase 1 仅写配置，视觉效果待 Phase 2）
   * @param {number} opacity - 透明度值 (0-1)
   */
  setSpeedLineOpacity(opacity) {
    this.postProcessConfig.speedLines.opacity = opacity
  }

  update() {
    if (!this.ready)
      return

    // 同步 stub，供调试面板只读显示
    this.postProcessConfig.gaze.intensity = this.gazePass.uniforms.uIntensity.value

    this.instance.render(this.scene, this.camera.instance)
    this._renderPlayerPreview()
  }

  /**
   * 初始化玩家预览系统
   * @param {import('./world/player/player.js').default} player
   */
  initPlayerPreview(player) {
    this.playerPreview = new PlayerPreviewCamera()
    this.playerPreview.setPlayer(player)
  }

  /**
   * 渲染玩家预览（Viewport + setScissor）
   */
  _renderPlayerPreview() {
    if (!this.playerPreview?.enabled)
      return

    const preview = this.playerPreview
    preview.update()

    const { size, margin } = preview.config
    const pixelRatio = this.sizes.pixelRatio
    const x = Math.floor(margin.left * pixelRatio)
    const y = Math.floor(margin.bottom * pixelRatio)
    const wh = Math.floor(size * pixelRatio)

    const savedBackground = this.scene.background
    this.scene.background = null

    this.instance.setScissorTest(true)
    this.instance.setScissor(x, y, wh, wh)
    this.instance.setViewport(x, y, wh, wh)
    this.instance.clear(false, true, false)
    this.instance.render(this.scene, preview.getCamera())

    this.instance.setScissorTest(false)
    this.instance.setViewport(0, 0, this.sizes.width * pixelRatio, this.sizes.height * pixelRatio)
    this.scene.background = savedBackground
  }

  /**
   * 相机切换回调（Phase 1 直渲无需更新 RenderPass）
   * @param {THREE.Camera} _cameraInstance
   */
  onCameraSwitched(_cameraInstance) {
    // Phase 2 TSL pass 再重建相机引用
  }

  destroy() {
    if (this.instance) {
      this.instance.dispose()
      this.instance.domElement = null
    }
    this.ready = false
  }
}
