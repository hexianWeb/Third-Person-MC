import * as THREE from 'three'
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

import Experience from './experience.js'

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
        strength: 0.3, // 辉光强度
        radius: 0.28, // 辉光扩散半径
        threshold: 0.85, // 亮度阈值（高于此值才会产生辉光）
      },
      // Afterimage 残影/运动模糊参数
      afterimage: {
        enabled: true,
        damp: 0.55, // 残影衰减系数 (0-1)，越大残影越明显
      },
      // SMAA 抗锯齿参数
      smaa: {
        enabled: true, // 是否启用 SMAA 抗锯齿
      },
    }

    this.setInstance()
    this.setPostProcess()

    if (this.debug.active) {
      this.debugInit()
    }
  }

  setInstance() {
    this.instance = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
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
   * 渲染顺序: RenderPass -> UnrealBloomPass -> AfterimagePass -> OutputPass
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

    // 3. AfterimagePass - 运动残影/拖尾效果
    this.afterimagePass = new AfterimagePass(this.postProcessConfig.afterimage.damp)
    this.afterimagePass.enabled = this.postProcessConfig.afterimage.enabled
    this.composer.addPass(this.afterimagePass)

    // 4. SMAAPass - SMAA 抗锯齿（子像素形态学抗锯齿）
    // 注意：需要传入实际渲染分辨率（宽高 × 像素比）
    this.smaaPass = new SMAAPass(
      this.sizes.width * this.sizes.pixelRatio,
      this.sizes.height * this.sizes.pixelRatio,
    )
    this.smaaPass.enabled = this.postProcessConfig.smaa.enabled
    this.composer.addPass(this.smaaPass)

    // 5. OutputPass - 色调映射与色彩空间转换（确保最终输出正确）
    this.outputPass = new OutputPass()
    this.composer.addPass(this.outputPass)
  }

  /**
   * 调试面板初始化
   */
  debugInit() {
    const postProcessFolder = this.debug.ui.addFolder({
      title: 'Post Processing',
      expanded: true,
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

    // ===== Afterimage 残影控制 =====
    const afterimageFolder = postProcessFolder.addFolder({
      title: 'Motion Blur 运动模糊',
      expanded: true,
    })

    afterimageFolder.addBinding(this.postProcessConfig.afterimage, 'enabled', {
      label: '启用',
    }).on('change', (ev) => {
      this.afterimagePass.enabled = ev.value
    })

    afterimageFolder.addBinding(this.postProcessConfig.afterimage, 'damp', {
      label: '残影强度',
      min: 0,
      max: 0.99,
      step: 0.01,
    }).on('change', (ev) => {
      this.afterimagePass.uniforms.damp.value = ev.value
    })

    // ===== SMAA 抗锯齿控制 =====
    const smaaFolder = postProcessFolder.addFolder({
      title: 'SMAA 抗锯齿',
      expanded: true,
    })

    smaaFolder.addBinding(this.postProcessConfig.smaa, 'enabled', {
      label: '启用',
    }).on('change', (ev) => {
      this.smaaPass.enabled = ev.value
    })
  }

  resize() {
    this.instance.setSize(this.sizes.width, this.sizes.height)
    this.instance.setPixelRatio(this.sizes.pixelRatio)

    // 同步更新 Composer 尺寸
    this.composer.setSize(this.sizes.width, this.sizes.height)
    this.composer.setPixelRatio(this.sizes.pixelRatio)

    // 更新 SMAA Pass 尺寸（需要实际渲染分辨率）
    this.smaaPass.setSize(
      this.sizes.width * this.sizes.pixelRatio,
      this.sizes.height * this.sizes.pixelRatio,
    )
  }

  update() {
    // 使用 EffectComposer 渲染（包含所有后期处理）
    this.composer.render()
  }
}
