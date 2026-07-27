import * as THREE from 'three'
import Experience from '../../experience.js'
import { PlayerAnimationController } from './player-animation-controller.js'
import {
  applySkinTextureToLayers,
  bindCharacterBodyLayers,
  EXPECTED_LAYER_NAMES,
} from './skin-texture-utils.js'

/**
 * 第一人称手部模型
 * 将仅含手臂几何的 player_hand.glb 挂在透视相机下，仅第一人称可见。
 * 动画复用与本体相同的 PlayerAnimationController（同配置、同状态机、同输入），
 * 因此无需额外同步逻辑即可与第三人称本体的动画状态保持一致。
 */
export default class FirstPersonHand {
  /**
   * @param {object} gltf - Resources 中的 playerHandModel（含 scene 与 animations）
   * @param {object} handConfig - PLAYER_CONFIG.firstPersonHand（位姿配置，debug 可实时调整）
   */
  constructor(gltf, handConfig) {
    this.experience = new Experience()
    this.handConfig = handConfig

    // 容器：挂在相机下，仅承载位姿，便于 debug 调参与整体显隐
    this.container = new THREE.Group()
    this.container.name = 'FirstPersonHand'
    this.container.visible = false

    this.model = gltf.scene
    this._setupModel()

    // 皮肤双层绑定（与本体层级名一致；失败时使用 GLB 内嵌贴图兜底）
    this._bodyLayers = null
    try {
      this._bodyLayers = bindCharacterBodyLayers(this.model)
    }
    catch (error) {
      console.warn('[FirstPersonHand] 皮肤层级绑定失败，使用内嵌贴图:', error)
    }

    this.container.add(this.model)
    this.applyTransform()

    // 动画：独立的控制器与状态机，输入与本体完全一致
    this.animation = new PlayerAnimationController(this.model, gltf.animations)

    // 挂到透视相机（camera.instance 恒为 perspectiveCamera）
    this.experience.camera.perspectiveCamera.add(this.container)
  }

  _setupModel() {
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // 蒙皮网格挂在相机下，包围盒不跟随相机，必须禁用视锥剔除
        child.frustumCulled = false
        // 第一人称手部不投影，避免阴影穿帮
        child.castShadow = false
        child.receiveShadow = false

        if (child.material) {
          child.material.side = THREE.FrontSide
          // 与本体一致的自发光，保证黑夜中可见
          if (child.material.map) {
            child.material.emissiveMap = child.material.map
            child.material.emissive = new THREE.Color(0xFFFFFF)
          }
          else if (child.material.color) {
            child.material.emissive = child.material.color.clone()
          }
          child.material.emissiveIntensity = 0.3
        }

        // 与本体一致的双层渲染顺序（外层 overlay 后绘制）
        if (child.name === EXPECTED_LAYER_NAMES.layer1) {
          child.renderOrder = 1
        }
        else if (child.name === EXPECTED_LAYER_NAMES.layer2) {
          child.renderOrder = 2
        }
      }
    })
  }

  /**
   * 应用位姿配置（debug 面板调整后调用）
   */
  applyTransform() {
    const { offset, rotationY, scale } = this.handConfig
    this.container.position.set(offset.x, offset.y, offset.z)
    this.container.rotation.set(0, rotationY, 0)
    this.container.scale.setScalar(scale)
  }

  /**
   * 第一人称显隐
   * @param {boolean} active
   */
  setActive(active) {
    this.container.visible = active
  }

  /**
   * 应用皮肤贴图（与本体共用同一张，材质更新后需重置自发光颜色）
   * @param {THREE.Texture} texture
   */
  applySkin(texture) {
    if (!this._bodyLayers) {
      return
    }
    applySkinTextureToLayers(this._bodyLayers, texture)
    for (const material of this._bodyLayers.materials) {
      if (material?.emissive) {
        material.emissive.set(0xFFFFFF)
        material.emissiveIntensity = 0.3
      }
    }
  }

  update(dt, playerState) {
    this.animation.update(dt, playerState)
  }

  triggerJump() {
    this.animation.triggerJump()
  }

  triggerAttack(name) {
    this.animation.triggerAttack(name)
  }

  debugInit(debugFolder) {
    const folder = debugFolder.addFolder({
      title: '第一人称手部',
      expanded: false,
    })

    folder.addBinding(this.handConfig.offset, 'x', {
      label: '偏移 X',
      min: -1,
      max: 1,
      step: 0.01,
    }).on('change', () => this.applyTransform())

    folder.addBinding(this.handConfig.offset, 'y', {
      label: '偏移 Y',
      min: -2.5,
      max: 0,
      step: 0.01,
    }).on('change', () => this.applyTransform())

    folder.addBinding(this.handConfig.offset, 'z', {
      label: '偏移 Z',
      min: -1.5,
      max: 0.5,
      step: 0.01,
    }).on('change', () => this.applyTransform())

    folder.addBinding(this.handConfig, 'rotationY', {
      label: '朝向旋转',
      min: -Math.PI,
      max: Math.PI,
      step: 0.01,
    }).on('change', () => this.applyTransform())

    folder.addBinding(this.handConfig, 'scale', {
      label: '缩放',
      min: 0.2,
      max: 3,
      step: 0.05,
    }).on('change', () => this.applyTransform())
  }

  destroy() {
    this.animation?.dispose()
    this.animation = null

    if (this.container?.parent) {
      this.container.parent.remove(this.container)
    }
    this.container = null
    this.model = null
    this._bodyLayers = null
  }
}
