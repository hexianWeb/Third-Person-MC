import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

// 速度线 Shader
import speedLinesFragmentShader from '../shaders/speedlines/fragment.glsl'
import speedLinesVertexShader from '../shaders/speedlines/vertex.glsl'

import { SHADOW_CONFIG, SHADOW_QUALITY } from './config/shadow-config.js'
import Experience from './experience.js'
import emitter from './utils/event-bus.js'

export default class Renderer {
  constructor() {
    this.experience = new Experience()
    this.canvas = this.experience.canvas
    this.sizes = this.experience.sizes
    this.scene = this.experience.scene
    this.camera = this.experience.camera
    this.debug = this.experience.debug

    // 后期处理配置参数
    this.postProcessConfig = {
      // Bloom 辉光参数
      bloom: {
        enabled: true,
        strength: 0.05, // 辉光强度（降低 GPU 压力）
        radius: 0.1, // 辉光扩散半径（降低 GPU 压力）
        threshold: 0.85, // 亮度阈值（高于此值才会产生辉光）
      },
      // 速度线参数
      speedLines: {
        enabled: true, // 是否启用速度线效果
        color: { r: 255, g: 255, b: 255 }, // 速度线颜色 (白色)
        density: 66.0, // 三角形数量（扇区数）
        speed: 6.0, // 脉冲速度
        thickness: 0.24, // 三角形底边宽度（角度比例）
        minRadius: 0.4, // 三角形尖端最小半径
        maxRadius: 1.3, // 三角形起始半径
        randomness: 0.5, // 随机性强度
        opacity: 0.0, // 当前透明度（由 Player 控制）
      },
    }

    this.setInstance()
    this.setPostProcess()

    if (this.debug.active) {
      this.debugInit()
    }

    // 将渲染器与相机绑定，支持动态切换相机实例
    this.camera.attachRenderer(this)
  }

  setInstance() {
    this.instance = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false, // 关闭抗锯齿：低端机优先保帧率
    })
    this.instance.toneMapping = THREE.ACESFilmicToneMapping
    this.instance.toneMappingExposure = 1
    this.instance.shadowMap.enabled = true
    this.instance.shadowMap.type = THREE.PCFSoftShadowMap
    this.instance.setClearColor('#000000')
    this.instance.setSize(this.sizes.width, this.sizes.height)
    this.instance.setPixelRatio(this.sizes.pixelRatio)
  }

  /**
   * 设置后期处理管线
   * 渲染顺序: RenderPass -> UnrealBloomPass -> SpeedLinePass -> OutputPass
   */
  setPostProcess() {
    // 创建 EffectComposer
    this.composer = new EffectComposer(this.instance)

    // 1. RenderPass - 基础场景渲染
    this.renderPass = new RenderPass(this.scene, this.camera.instance)
    this.composer.addPass(this.renderPass)

    // 2. UnrealBloomPass - 辉光效果，增加画面氛围感
    const resolution = new THREE.Vector2(this.sizes.width, this.sizes.height)
    this.bloomPass = new UnrealBloomPass(
      resolution,
      this.postProcessConfig.bloom.strength,
      this.postProcessConfig.bloom.radius,
      this.postProcessConfig.bloom.threshold,
    )
    this.bloomPass.enabled = this.postProcessConfig.bloom.enabled
    this.composer.addPass(this.bloomPass)

    // 3. SpeedLinePass - 速度线效果（冲刺时显示）
    this.speedLinePass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uOpacity: { value: this.postProcessConfig.speedLines.opacity },
        uColor: { value: new THREE.Color(
          this.postProcessConfig.speedLines.color.r / 255,
          this.postProcessConfig.speedLines.color.g / 255,
          this.postProcessConfig.speedLines.color.b / 255,
        ) },
        uDensity: { value: this.postProcessConfig.speedLines.density },
        uSpeed: { value: this.postProcessConfig.speedLines.speed },
        uThickness: { value: this.postProcessConfig.speedLines.thickness },
        uMinRadius: { value: this.postProcessConfig.speedLines.minRadius },
        uMaxRadius: { value: this.postProcessConfig.speedLines.maxRadius },
        uRandomness: { value: this.postProcessConfig.speedLines.randomness },
      },
      vertexShader: speedLinesVertexShader,
      fragmentShader: speedLinesFragmentShader,
    })
    this.speedLinePass.enabled = this.postProcessConfig.speedLines.enabled
    this.composer.addPass(this.speedLinePass)

    // 4. OutputPass - 色调映射与色彩空间转换（确保最终输出正确）
    this.outputPass = new OutputPass()
    this.composer.addPass(this.outputPass)
  }

  /**
   * 调试面板初始化
   */
  debugInit() {
    const postProcessFolder = this.debug.ui.addFolder({
      title: 'Post Processing',
      expanded: false,
    })

    // ===== Bloom 辉光控制 =====
    const bloomFolder = postProcessFolder.addFolder({
      title: 'Bloom 辉光',
      expanded: true,
    })

    bloomFolder.addBinding(this.postProcessConfig.bloom, 'enabled', {
      label: '启用',
    }).on('change', (ev) => {
      this.bloomPass.enabled = ev.value
    })

    bloomFolder.addBinding(this.postProcessConfig.bloom, 'strength', {
      label: '强度',
      min: 0,
      max: 3,
      step: 0.01,
    }).on('change', (ev) => {
      this.bloomPass.strength = ev.value
    })

    bloomFolder.addBinding(this.postProcessConfig.bloom, 'radius', {
      label: '半径',
      min: 0,
      max: 1,
      step: 0.01,
    }).on('change', (ev) => {
      this.bloomPass.radius = ev.value
    })

    bloomFolder.addBinding(this.postProcessConfig.bloom, 'threshold', {
      label: '阈值',
      min: 0,
      max: 1,
      step: 0.01,
    }).on('change', (ev) => {
      this.bloomPass.threshold = ev.value
    })

    // ===== 速度线控制 =====
    const speedLinesFolder = postProcessFolder.addFolder({
      title: 'Speed Lines 速度线',
      expanded: true,
    })

    speedLinesFolder.addBinding(this.postProcessConfig.speedLines, 'enabled', {
      label: '启用',
    }).on('change', (ev) => {
      this.speedLinePass.enabled = ev.value
    })

    speedLinesFolder.addBinding(this.postProcessConfig.speedLines, 'color', {
      label: '颜色',
      view: 'color',
    }).on('change', (ev) => {
      this.speedLinePass.uniforms.uColor.value.setRGB(
        ev.value.r / 255,
        ev.value.g / 255,
        ev.value.b / 255,
      )
    })

    speedLinesFolder.addBinding(this.postProcessConfig.speedLines, 'density', {
      label: '密度',
      min: 10,
      max: 100,
      step: 1,
    }).on('change', (ev) => {
      this.speedLinePass.uniforms.uDensity.value = ev.value
    })

    speedLinesFolder.addBinding(this.postProcessConfig.speedLines, 'speed', {
      label: '脉冲速度',
      min: 0.5,
      max: 10,
      step: 0.1,
    }).on('change', (ev) => {
      this.speedLinePass.uniforms.uSpeed.value = ev.value
    })

    speedLinesFolder.addBinding(this.postProcessConfig.speedLines, 'thickness', {
      label: '三角形宽度',
      min: 0.01,
      max: 0.5,
      step: 0.01,
    }).on('change', (ev) => {
      this.speedLinePass.uniforms.uThickness.value = ev.value
    })

    speedLinesFolder.addBinding(this.postProcessConfig.speedLines, 'minRadius', {
      label: '尖端半径',
      min: 0.1,
      max: 0.8,
      step: 0.01,
    }).on('change', (ev) => {
      this.speedLinePass.uniforms.uMinRadius.value = ev.value
    })

    speedLinesFolder.addBinding(this.postProcessConfig.speedLines, 'maxRadius', {
      label: '起始半径',
      min: 0.8,
      max: 2.0,
      step: 0.01,
    }).on('change', (ev) => {
      this.speedLinePass.uniforms.uMaxRadius.value = ev.value
    })

    speedLinesFolder.addBinding(this.postProcessConfig.speedLines, 'randomness', {
      label: '随机性',
      min: 0,
      max: 1,
      step: 0.01,
    }).on('change', (ev) => {
      this.speedLinePass.uniforms.uRandomness.value = ev.value
    })

    // 透明度（只读，由 Player 控制）
    speedLinesFolder.addBinding(this.postProcessConfig.speedLines, 'opacity', {
      label: '当前透明度',
      min: 0,
      max: 1,
      step: 0.01,
      readonly: true,
    })

    // ===== 阴影质量控制 =====
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
      // Emit event to notify all modules about shadow quality change
      emitter.emit('shadow:quality-changed', { quality: ev.value })
    })

    // Emit initial shadow quality to ensure all modules are in sync
    emitter.emit('shadow:quality-changed', { quality: SHADOW_CONFIG.quality })
  }

  resize() {
    this.instance.setSize(this.sizes.width, this.sizes.height)
    this.instance.setPixelRatio(this.sizes.pixelRatio)

    // 同步更新 Composer 尺寸
    this.composer.setSize(this.sizes.width, this.sizes.height)
    this.composer.setPixelRatio(this.sizes.pixelRatio)
  }

  /**
   * 设置速度线透明度（供 Player 控制）
   * @param {number} opacity - 透明度值 (0-1)
   */
  setSpeedLineOpacity(opacity) {
    this.postProcessConfig.speedLines.opacity = opacity
    this.speedLinePass.uniforms.uOpacity.value = opacity
  }

  update() {
    // 更新速度线时间 uniform
    this.speedLinePass.uniforms.uTime.value = this.experience.time.elapsed * 0.001

    // 使用 EffectComposer 渲染（包含所有后期处理）
    this.composer.render()
  }

  /**
   * 当相机切换时更新 RenderPass 的相机引用
   * @param {THREE.Camera} cameraInstance - 当前激活的相机
   */
  onCameraSwitched(cameraInstance) {
    if (this.renderPass) {
      this.renderPass.camera = cameraInstance
    }
  }
}
