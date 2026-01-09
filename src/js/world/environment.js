import * as THREE from 'three'

import Experience from '../experience.js'

export default class Environment {
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources
    this.debug = this.experience.debug.ui
    this.debugActive = this.experience.debug.active

    this.params = {
      sunPos: { x: 70, y: 70, z: 70 },
      sunTarget: { x: 0, y: 0, z: 0 },
      sunColor: '#ffffff',
      sunIntensity: 3.0,
      shadowRange: 65,
      shadowNear: 16,
      shadowFar: 256,
      ambientColor: '#ffffff',
      ambientIntensity: 0.3,
      fogColor: '#989490',
      fogDensity: 0.01,
      background: 'Image',
    }

    // Axes Helper
    this.axesHelper = new THREE.AxesHelper(5)
    this.axesHelper.visible = false
    this.scene.add(this.axesHelper)

    // Setup
    this.setSunLight()
    this.setEnvironmentMap()
    this.setFog()
    this.debuggerInit()
  }

  setFog() {
    this.fog = new THREE.FogExp2(
      this.params.fogColor,
      this.params.fogDensity,
    )
    this.scene.fog = this.fog
  }

  updateFog() {
    if (this.fog) {
      this.fog.color.set(this.params.fogColor)
      this.fog.density = this.params.fogDensity
    }
  }

  setSunLight() {
    this.sunLight = new THREE.DirectionalLight(
      this.params.sunColor,
      this.params.sunIntensity,
    )
    this.sunLight.castShadow = true
    this.sunLight.shadow.camera.near = this.params.shadowNear
    this.sunLight.shadow.camera.far = this.params.shadowFar
    // 降低阴影贴图分辨率：低端机优先保性能
    this.sunLight.shadow.mapSize.set(1024, 1024)
    this.sunLight.shadow.normalBias = 0.05
    this.sunLight.shadow.bias = -0.0005
    // 将位置/目标拆分为 XZ 平面与 Y 高度，便于独立调控
    this.sunLightPosition = new THREE.Vector3(
      this.params.sunPos.x,
      this.params.sunPos.y,
      this.params.sunPos.z,
    )
    this.sunLight.position.copy(this.sunLightPosition)
    this.scene.add(this.sunLight)

    // 设置 sunLight Target
    this.sunLight.target = new THREE.Object3D()
    this.sunLightTarget = new THREE.Vector3(
      this.params.sunTarget.x,
      this.params.sunTarget.y,
      this.params.sunTarget.z,
    )
    this.sunLight.target.position.copy(this.sunLightTarget)
    this.scene.add(this.sunLight.target)

    this.helper = new THREE.CameraHelper(this.sunLight.shadow.camera)
    this.helper.visible = false
    this.scene.add(this.helper)

    // 阴影相机视锥统一使用单一范围值
    this.updateSunLightShadowRange()

    // 环境光
    this.ambientLight = new THREE.AmbientLight(
      new THREE.Color(this.params.ambientColor),
      this.params.ambientIntensity,
    )
    this.scene.add(this.ambientLight)
  }

  setEnvironmentMap() {
    this.environmentMap = {}
    this.environmentMap.intensity = 1
    this.environmentMap.texture = this.resources.items.environmentMapHDRTexture
    this.environmentMap.texture.mapping = THREE.EquirectangularReflectionMapping
    // this.environmentMap.texture.colorSpace = THREE.SRGBColorSpace // RGBELoader usually handles this, or it might be Linear. Let's check standard implementation.

    // 背景贴图
    this.backgroundTexture = this.resources.items.backgroundTexture
    if (this.backgroundTexture) {
      this.backgroundTexture.colorSpace = THREE.SRGBColorSpace
      this.backgroundTexture.mapping = THREE.EquirectangularReflectionMapping
    }

    this.scene.environment = this.environmentMap.texture
    this.updateBackground()
  }

  updateBackground() {
    if (this.params.background === 'HDR') {
      this.scene.background = this.environmentMap.texture
    }
    else if (this.params.background === 'Image' && this.backgroundTexture) {
      this.scene.background = this.backgroundTexture
    }
  }

  updateSunLightPosition() {
    // 仅仅是触发更新，实际逻辑在 update() 中执行，依赖 player 位置
    // 如果没有 player，可以在这里保留静态更新逻辑作为 fallback
    if (!this.experience.world.player) {
      this.sunLightPosition.set(
        this.params.sunPos.x,
        this.params.sunPos.y,
        this.params.sunPos.z,
      )
      this.sunLight.position.copy(this.sunLightPosition)
      this.sunLightTarget.set(
        this.params.sunTarget.x,
        this.params.sunTarget.y,
        this.params.sunTarget.z,
      )
      this.sunLight.target.position.copy(this.sunLightTarget)
      this.helper.update()
    }
  }

  updateSunLightColor() {
    this.sunLight.color.set(this.params.sunColor)
  }

  updateSunLightIntensity() {
    this.sunLight.intensity = this.params.sunIntensity
  }

  updateAmbientLight() {
    if (this.ambientLight) {
      this.ambientLight.color.set(this.params.ambientColor)
      this.ambientLight.intensity = this.params.ambientIntensity
    }
  }

  updateSunLightShadowRange() {
    // 统一调控阴影相机的 top/bottom/left/right
    const cam = this.sunLight.shadow.camera
    cam.top = this.params.shadowRange
    cam.bottom = -this.params.shadowRange
    cam.left = -this.params.shadowRange
    cam.right = this.params.shadowRange
    cam.updateProjectionMatrix()
    this.helper.update()
  }

  updateSunLightShadowDistance() {
    const cam = this.sunLight.shadow.camera
    cam.near = this.params.shadowNear
    cam.far = this.params.shadowFar
    cam.updateProjectionMatrix()
    this.helper.update()
  }

  update() {
    const player = this.experience.world.player
    if (player) {
      const playerPos = player.getPosition()

      // 更新 sunLight 位置：玩家位置 + 偏移量
      this.sunLight.position.set(
        playerPos.x + this.params.sunPos.x,
        playerPos.y + this.params.sunPos.y,
        playerPos.z + this.params.sunPos.z,
      )

      // 更新 sunLight 目标位置：玩家位置 + 目标偏移量
      this.sunLight.target.position.set(
        playerPos.x + this.params.sunTarget.x,
        playerPos.y + this.params.sunTarget.y,
        playerPos.z + this.params.sunTarget.z,
      )

      // 实时更新 helper，方便调试观察跟随效果
      if (this.helper.visible) {
        this.helper.update()
      }
    }
  }

  debuggerInit() {
    if (this.debugActive) {
      const environmentFolder = this.debug.addFolder({
        title: 'Environment',
        expanded: false,
      })

      environmentFolder.addBinding(this.params, 'background', {
        label: 'Background',
        options: {
          HDR: 'HDR',
          Image: 'Image',
        },
      }).on('change', this.updateBackground.bind(this))

      environmentFolder.addBinding(this.scene, 'environmentIntensity', {
        min: 0,
        max: 2,
        step: 0.01,
        label: 'Intensity',
      })

      const sunLightFolder = environmentFolder.addFolder({
        title: 'Sun Light',
        expanded: true,
      })

      // 使用 3D 点控件统一调节向量
      sunLightFolder.addBinding(this.params, 'sunPos', {
        label: 'sunPos 偏移',
        view: 'point3d',
        x: { step: 5 },
        y: { min: 0, max: 100, step: 5 },
        z: { step: 5 },
      }).on('change', this.updateSunLightPosition.bind(this))

      sunLightFolder.addBinding(this.params, 'sunTarget', {
        label: 'sunTarget 偏移',
        view: 'point3d',
        x: { step: 5 },
        y: { min: 0, max: 100, step: 5 },
        z: { step: 5 },
      }).on('change', this.updateSunLightPosition.bind(this))

      sunLightFolder
        .addBinding(this.params, 'sunColor', {
          label: 'Light Color',
          view: 'color',
        })
        .on('change', this.updateSunLightColor.bind(this))

      sunLightFolder
        .addBinding(this.params, 'sunIntensity', {
          label: 'Light Intensity',
          min: 0,
          max: 20,
          step: 0.1,
        })
        .on('change', this.updateSunLightIntensity.bind(this))

      sunLightFolder
        .addBinding(this.params, 'shadowNear', {
          label: 'Shadow Near',
          min: 0.01,
          max: 50,
          step: 0.1,
        })
        .on('change', this.updateSunLightShadowDistance.bind(this))

      sunLightFolder
        .addBinding(this.params, 'shadowFar', {
          label: 'Shadow Far',
          min: 1,
          max: 300,
          step: 1,
        })
        .on('change', this.updateSunLightShadowDistance.bind(this))

      // 阴影相机 top/bottom/left/right 共用同一数值
      sunLightFolder
        .addBinding(this.params, 'shadowRange', {
          label: 'Shadow Range',
          min: 1,
          max: 100,
          step: 0.5,
        })
        .on('change', this.updateSunLightShadowRange.bind(this))

      sunLightFolder.addBinding(this.helper, 'visible', {
        label: 'Helper',
      })

      const ambientFolder = environmentFolder.addFolder({
        title: 'Ambient Light',
        expanded: false,
      })

      ambientFolder.addBinding(this.params, 'ambientColor', {
        label: '环境光颜色',
        view: 'color',
      }).on('change', this.updateAmbientLight.bind(this))

      ambientFolder.addBinding(this.params, 'ambientIntensity', {
        label: '环境光强度',
        min: 0,
        max: 5,
        step: 0.01,
      }).on('change', this.updateAmbientLight.bind(this))

      // Fog Folder
      const fogFolder = environmentFolder.addFolder({
        title: 'Fog',
        expanded: false,
      })

      fogFolder.addBinding(this.params, 'fogColor', {
        label: 'Fog Color',
        view: 'color',
      }).on('change', this.updateFog.bind(this))

      fogFolder.addBinding(this.params, 'fogDensity', {
        label: 'Fog Density',
        min: 0,
        max: 0.1,
        step: 0.0001,
      }).on('change', this.updateFog.bind(this))

      if (this.axesHelper) {
        this.debug.addBinding(this.axesHelper, 'visible', {
          label: 'Axes',
        })
      }
    }
  }

  destroy() {
    // Remove lights from scene
    if (this.sunLight) {
      this.scene.remove(this.sunLight)
      this.scene.remove(this.sunLight.target)
    }
    if (this.ambientLight) {
      this.scene.remove(this.ambientLight)
    }

    // Remove helper
    if (this.helper) {
      this.scene.remove(this.helper)
      this.helper.dispose?.()
    }

    // Remove axes helper
    if (this.axesHelper) {
      this.scene.remove(this.axesHelper)
      this.axesHelper.dispose?.()
    }

    // Clear fog
    this.scene.fog = null
  }
}
