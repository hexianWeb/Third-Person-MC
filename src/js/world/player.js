import * as THREE from 'three'
import Experience from '../experience.js'

export default class Player {
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources
    this.time = this.experience.time
    this.debug = this.experience.debug

    // 调试
    if (this.debug.active) {
      this.debugFolder = this.debug.ui.addFolder({
        title: 'Player',
        expanded: true,
      })
    }

    // 资源设置
    this.resource = this.resources.items.playerModel

    this.setModel()
    this.setAnimations()

    if (this.debug.active) {
      this.debugInit()
    }
  }

  setModel() {
    this.model = this.resource.scene
    this.scene.add(this.model)

    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
      }
    })
  }

  setAnimations() {
    // 混合器
    this.animation = {}
    this.animation.mixer = new THREE.AnimationMixer(this.model)

    // 动作
    this.animation.actions = {}
    this.animation.names = []

    /*
     模型包含以下动画：
     - back
     - left_block
     - falling
     - forward
     - idle
     - jump
     - left
     - left_hook_punch
     - left_straight_punch
     - quick_combo_punch
     - right
     - right_block
     - right_hook_punch
     - right_straight_punch
     - running_backward
     - running_forward
     - running_left
     - running_right
     - standup
     - tpose
    */

    if (this.resource.animations.length > 0) {
      this.resource.animations.forEach((clip) => {
        // console.log(`Animation Name: ${clip.name}`)
        this.animation.names.push(clip.name)
        this.animation.actions[clip.name] = this.animation.mixer.clipAction(clip)
      })

      // 默认播放 tpose 动画
      this.animation.current = this.animation.actions.tpose
      this.animation.current.play()
    }
    else {
      console.warn('No animations found in playerModel')
    }
  }

  debugInit() {
    const debugObject = {
      currentAnimation: 'tpose',
    }

    // 准备下拉菜单的选项
    const animationOptions = {}
    this.animation.names.forEach((name) => {
      animationOptions[name] = name
    })

    this.debugFolder.addBinding(
      debugObject,
      'currentAnimation',
      {
        label: '动作',
        options: animationOptions,
      },
    ).on('change', (event) => {
      this.playAnimation(event.value)
    })
  }

  playAnimation(name) {
    const newAction = this.animation.actions[name]
    const oldAction = this.animation.current

    if (newAction === oldAction)
      return

    newAction.reset()
    newAction.play()
    newAction.crossFadeFrom(oldAction, 0.5)

    this.animation.current = newAction
  }

  update() {
    if (this.animation && this.animation.mixer) {
      this.animation.mixer.update(this.time.delta * 0.001)
    }
  }
}
