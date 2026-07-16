import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { mix, pass, vec4 } from 'three/tsl'
import * as THREE from 'three/webgpu'

import { SHADOW_CONFIG, SHADOW_QUALITY } from './config/shadow-config.js'
import Experience from './experience.js'
import { createGazeNode } from './postprocessing/gaze-node.js'
import { createSpeedLinesNode } from './postprocessing/speed-lines-node.js'
import emitter from './utils/event/event-bus.js'
import PlayerPreviewCamera from './world/player/player-preview-camera.js'
import { calculatePlayerPreviewRect } from './world/player/player-preview-rendering.js'

/** settings → 速度线 TSL uniform 字段映射 */
const SPEEDLINE_UNIFORM_MAP = {
  density: 'uDensity',
  speed: 'uSpeed',
  thickness: 'uThickness',
  minRadius: 'uMinRadius',
  maxRadius: 'uMaxRadius',
  randomness: 'uRandomness',
}

/**
 * Phase 2：WebGPURenderer + TSL RenderPipeline
 * 管线：scene pass → bloom → speed lines → gaze（tone/output 由 RenderPipeline 处理）
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

    // TSL 后处理管线引用
    this.renderPipeline = null
    this.scenePass = null
    this.bloomPass = null
    this.speedLineUniforms = null
    this.gazeUniforms = null

    // 玩家预览 pass（管线内合成，禁止在 renderPipeline.render() 之后手动 renderer.render()）
    this.previewPass = null
    this._outputNode = null
    this._outputNodeWithPreview = null
    this._previewComposited = false

    // 后期处理配置（Settings / Player / Enemy / Debug 共用）
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

    // 兼容 enemy-manager：gazePass.uniforms.uIntensity.value = ...
    // 管线建好后会指向真实 TSL UniformNode
    this.gazePass = {
      enabled: true,
      uniforms: {
        uIntensity: { value: this.postProcessConfig.gaze.intensity },
      },
    }

    this.setInstance()
    this._initPromise = this._init()

    this.camera.attachRenderer(this)
    this._setupSettingsListeners()
  }

  /** 监听设置 UI 的后期处理变更，同步到 TSL uniforms */
  _setupSettingsListeners() {
    emitter.on('settings:postprocess-changed', ({ speedLines, gaze }) => {
      if (speedLines) {
        if (speedLines.enabled !== undefined) {
          this.postProcessConfig.speedLines.enabled = speedLines.enabled
          if (this.speedLineUniforms)
            this.speedLineUniforms.uEnabled.value = speedLines.enabled ? 1 : 0
        }

        if (speedLines.color && this.speedLineUniforms) {
          this.postProcessConfig.speedLines.color = speedLines.color
          const { r, g, b } = speedLines.color
          this.speedLineUniforms.uColor.value.setRGB(r / 255, g / 255, b / 255)
        }

        for (const [key, uniformName] of Object.entries(SPEEDLINE_UNIFORM_MAP)) {
          if (speedLines[key] !== undefined) {
            this.postProcessConfig.speedLines[key] = speedLines[key]
            if (this.speedLineUniforms)
              this.speedLineUniforms[uniformName].value = speedLines[key]
          }
        }
      }

      if (gaze) {
        if (gaze.enabled !== undefined) {
          this.postProcessConfig.gaze.enabled = gaze.enabled
          this.gazePass.enabled = gaze.enabled
          if (this.gazeUniforms)
            this.gazeUniforms.uEnabled.value = gaze.enabled ? 1 : 0
        }
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
   * 异步初始化 WebGPU 设备，并搭建 TSL 后处理管线
   */
  async _init() {
    try {
      await this.instance.init()
      const isWebGPU = this.instance.backend?.isWebGPUBackend === true
      this.backendName = isWebGPU ? 'webgpu' : 'webgl'
      console.debug(`[Renderer] backend=${this.backendName}`)

      // 用户确认：100% WebGPU-only，不接受自动落到 WebGL 后端
      if (!isWebGPU) {
        this.ready = false
        throw new Error('[Renderer] WebGPU-only: WebGPU backend unavailable (got WebGL)')
      }

      this._setupPostProcessing()
      this.ready = true

      // 调试面板需在 TSL uniforms 就绪后创建，才能正确绑定 bloom / 速度线 / 凝视
      if (this.debug.active) {
        this.debugInit()
      }
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
   * 搭建 TSL 后处理：pass → bloom → speed lines → gaze
   * tone mapping / 色彩空间由 RenderPipeline.outputColorTransform 处理（对齐原 OutputPass）
   */
  _setupPostProcessing() {
    const cfg = this.postProcessConfig

    this.renderPipeline = new THREE.RenderPipeline(this.instance)
    this.scenePass = pass(this.scene, this.camera.instance)
    const scenePassColor = this.scenePass.getTextureNode('output')

    // Bloom（默认半分辨率，BloomNode._resolutionScale = 0.5）
    this.bloomPass = bloom(
      scenePassColor,
      cfg.bloom.strength,
      cfg.bloom.radius,
      cfg.bloom.threshold,
    )
    if (!cfg.bloom.enabled)
      this.bloomPass.strength.value = 0

    const bloomed = scenePassColor.add(this.bloomPass)

    // Speed Lines
    const speedLines = createSpeedLinesNode(bloomed, cfg.speedLines)
    this.speedLineUniforms = speedLines.uniforms

    // Gaze
    const gaze = createGazeNode(speedLines.node, cfg.gaze)
    this.gazeUniforms = gaze.uniforms
    // 对外兼容：enemy-manager 直接写 uniforms.uIntensity.value
    this.gazePass = {
      enabled: cfg.gaze.enabled,
      uniforms: {
        uIntensity: this.gazeUniforms.uIntensity,
      },
    }

    // 保留基础输出节点，玩家预览启用时会在其上合成预览 pass
    this._outputNode = gaze.node
    this.renderPipeline.outputNode = this._outputNode
  }

  /**
   * 将 bloom.enabled 映射到 strength（关闭时 strength=0，避免重建管线）
   */
  _syncBloomEnabled() {
    if (!this.bloomPass)
      return
    const { enabled, strength } = this.postProcessConfig.bloom
    this.bloomPass.strength.value = enabled ? strength : 0
  }

  /**
   * 调试面板：后端状态 + 后处理参数 + 阴影质量
   */
  debugInit() {
    const rendererFolder = this.debug.ui.addFolder({
      title: 'Renderer (WebGPU)',
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
      title: 'Post Processing',
      expanded: false,
    })

    // ===== Bloom =====
    const bloomFolder = postProcessFolder.addFolder({
      title: 'Bloom 辉光',
      expanded: true,
    })

    bloomFolder.addBinding(this.postProcessConfig.bloom, 'enabled', {
      label: '启用',
    }).on('change', () => {
      this._syncBloomEnabled()
    })

    bloomFolder.addBinding(this.postProcessConfig.bloom, 'strength', {
      label: '强度',
      min: 0,
      max: 3,
      step: 0.01,
    }).on('change', (ev) => {
      this.postProcessConfig.bloom.strength = ev.value
      this._syncBloomEnabled()
    })

    bloomFolder.addBinding(this.postProcessConfig.bloom, 'radius', {
      label: '半径',
      min: 0,
      max: 1,
      step: 0.01,
    }).on('change', (ev) => {
      if (this.bloomPass)
        this.bloomPass.radius.value = ev.value
    })

    bloomFolder.addBinding(this.postProcessConfig.bloom, 'threshold', {
      label: '阈值',
      min: 0,
      max: 1,
      step: 0.01,
    }).on('change', (ev) => {
      if (this.bloomPass)
        this.bloomPass.threshold.value = ev.value
    })

    // ===== Speed Lines =====
    const speedLinesFolder = postProcessFolder.addFolder({
      title: 'Speed Lines 速度线',
      expanded: true,
    })

    speedLinesFolder.addBinding(this.postProcessConfig.speedLines, 'enabled', {
      label: '启用',
    }).on('change', (ev) => {
      if (this.speedLineUniforms)
        this.speedLineUniforms.uEnabled.value = ev.value ? 1 : 0
    })

    speedLinesFolder.addBinding(this.postProcessConfig.speedLines, 'color', {
      label: '颜色',
      view: 'color',
    }).on('change', (ev) => {
      if (this.speedLineUniforms) {
        this.speedLineUniforms.uColor.value.setRGB(
          ev.value.r / 255,
          ev.value.g / 255,
          ev.value.b / 255,
        )
      }
    })

    speedLinesFolder.addBinding(this.postProcessConfig.speedLines, 'density', {
      label: '密度',
      min: 10,
      max: 100,
      step: 1,
    }).on('change', (ev) => {
      if (this.speedLineUniforms)
        this.speedLineUniforms.uDensity.value = ev.value
    })

    speedLinesFolder.addBinding(this.postProcessConfig.speedLines, 'speed', {
      label: '脉冲速度',
      min: 0.5,
      max: 10,
      step: 0.1,
    }).on('change', (ev) => {
      if (this.speedLineUniforms)
        this.speedLineUniforms.uSpeed.value = ev.value
    })

    speedLinesFolder.addBinding(this.postProcessConfig.speedLines, 'thickness', {
      label: '三角形宽度',
      min: 0.01,
      max: 0.5,
      step: 0.01,
    }).on('change', (ev) => {
      if (this.speedLineUniforms)
        this.speedLineUniforms.uThickness.value = ev.value
    })

    speedLinesFolder.addBinding(this.postProcessConfig.speedLines, 'minRadius', {
      label: '尖端半径',
      min: 0.1,
      max: 0.8,
      step: 0.01,
    }).on('change', (ev) => {
      if (this.speedLineUniforms)
        this.speedLineUniforms.uMinRadius.value = ev.value
    })

    speedLinesFolder.addBinding(this.postProcessConfig.speedLines, 'maxRadius', {
      label: '起始半径',
      min: 0.8,
      max: 2.0,
      step: 0.01,
    }).on('change', (ev) => {
      if (this.speedLineUniforms)
        this.speedLineUniforms.uMaxRadius.value = ev.value
    })

    speedLinesFolder.addBinding(this.postProcessConfig.speedLines, 'randomness', {
      label: '随机性',
      min: 0,
      max: 1,
      step: 0.01,
    }).on('change', (ev) => {
      if (this.speedLineUniforms)
        this.speedLineUniforms.uRandomness.value = ev.value
    })

    // 当前透明度只读，由 Player 冲刺驱动
    speedLinesFolder.addBinding(this.postProcessConfig.speedLines, 'opacity', {
      label: '当前透明度',
      min: 0,
      max: 1,
      step: 0.01,
      readonly: true,
    })

    // ===== Gaze =====
    const gazeFolder = postProcessFolder.addFolder({
      title: 'Gaze 凝视恐惧',
      expanded: true,
    })

    gazeFolder.addBinding(this.postProcessConfig.gaze, 'enabled', {
      label: '启用',
    }).on('change', (ev) => {
      this.gazePass.enabled = ev.value
      if (this.gazeUniforms)
        this.gazeUniforms.uEnabled.value = ev.value ? 1 : 0
    })

    gazeFolder.addBinding(this.gazePass.uniforms.uIntensity, 'value', {
      label: '强度',
      min: 0,
      max: 1,
      step: 0.01,
    }).on('change', (ev) => {
      this.postProcessConfig.gaze.intensity = ev.value
    })

    // ===== 阴影质量 =====
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
   * 设置速度线透明度（由 Player 冲刺驱动）
   * @param {number} opacity - 透明度值 (0-1)
   */
  setSpeedLineOpacity(opacity) {
    this.postProcessConfig.speedLines.opacity = opacity
    if (this.speedLineUniforms)
      this.speedLineUniforms.uOpacity.value = opacity
  }

  update() {
    if (!this.ready || !this.renderPipeline)
      return

    const elapsedSec = this.experience.time.elapsed * 0.001

    if (this.speedLineUniforms)
      this.speedLineUniforms.uTime.value = elapsedSec

    if (this.gazeUniforms) {
      this.gazeUniforms.uTime.value = elapsedSec
      // 与 gazePass.uniforms 同步（对外写入可能只改 intensity）
      this.postProcessConfig.gaze.intensity = this.gazePass.uniforms.uIntensity.value
      this.gazeUniforms.uEnabled.value = (
        this.postProcessConfig.gaze.enabled
        && this.gazePass.uniforms.uIntensity.value > 0.005
      )
        ? 1
        : 0
    }

    this._syncPlayerPreview()
    this.renderPipeline.render()
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
   * 构建玩家预览 pass 并生成带预览的合成输出节点
   * 预览 RT 每帧被清成透明黑（clearColor alpha=0），按预览像素的 alpha 叠加到主画面上，
   * 因此背景透出主场景且不会累积历史帧（拖影）
   */
  _buildPreviewPass() {
    this.previewPass = pass(this.scene, this.playerPreview.getCamera())

    const previewColor = this.previewPass.getTextureNode('output')
    this._outputNodeWithPreview = vec4(
      mix(this._outputNode.rgb, previewColor.rgb, previewColor.a),
      this._outputNode.a,
    )
  }

  /**
   * 每帧同步玩家预览状态：更新预览相机、设置 pass 级 viewport、按需切换管线输出节点
   * 必须在 renderPipeline.render() 之前调用（WebGPURenderer 不支持管线渲染后再手动 render）
   */
  _syncPlayerPreview() {
    let rect = null

    if (this.playerPreview?.enabled) {
      if (!this.previewPass)
        this._buildPreviewPass()
      rect = calculatePlayerPreviewRect(this.sizes, this.playerPreview.config)
    }

    const active = !!(rect && rect.width > 0 && rect.height > 0)

    // 启用状态变化时切换输出节点并触发管线重建
    if (active !== this._previewComposited) {
      this._previewComposited = active
      this.renderPipeline.outputNode = active ? this._outputNodeWithPreview : this._outputNode
      this.renderPipeline.needsUpdate = true
    }

    if (!active)
      return

    this.playerPreview.update()

    // PassNode 的 RT 为物理像素尺寸（drawing buffer size），viewport 需乘以 pixelRatio
    const pr = this.sizes.pixelRatio
    this.previewPass.setViewport(
      Math.round(rect.x * pr),
      Math.round(rect.y * pr),
      Math.round(rect.width * pr),
      Math.round(rect.height * pr),
    )
  }

  /**
   * 相机切换时更新 scenePass 相机引用
   * @param {THREE.Camera} cameraInstance
   */
  onCameraSwitched(cameraInstance) {
    if (this.scenePass)
      this.scenePass.camera = cameraInstance
  }

  destroy() {
    if (this.previewPass) {
      this.previewPass.dispose()
      this.previewPass = null
    }
    if (this.renderPipeline) {
      this.renderPipeline.dispose()
      this.renderPipeline = null
    }
    if (this.instance) {
      this.instance.dispose()
      this.instance.domElement = null
    }
    this.ready = false
  }
}
