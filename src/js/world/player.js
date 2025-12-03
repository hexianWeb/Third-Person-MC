import * as THREE from 'three'
import Experience from '../experience.js'
import emitter from '../utils/event-bus.js'
import {
  AnimationCategories,
  AnimationClips,
  AnimationStates,
  timeScaleConfig,
} from './player/animation-config.js'
import { resolveDirectionInput } from './player/input-resolver.js'
import { PlayerAnimationController } from './player/player-animation-controller.js'
import { PlayerMovementController } from './player/player-movement-controller.js'

export default class Player {
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources
    this.time = this.experience.time
    this.debug = this.experience.debug
    this.renderer = this.experience.renderer // 用于控制速度线效果

    // Config
    this.config = {
      speed: {
        crouch: 0.8,
        walk: 1.5,
        run: 3.2,
      },
      jumpForce: 1.45,
      facingAngle: Math.PI, // 初始朝向角度（弧度），Math.PI = 朝向 -Z 軸
      mouseSensitivity: 0.002, // 鼠标灵敏度
      // 速度线配置
      speedLines: {
        fadeInSpeed: 5.0, // 淡入速度
        fadeOutSpeed: 3.0, // 淡出速度
        targetOpacity: 0.8, // 冲刺时的目标透明度
      },
    }

    // 速度线当前透明度
    this._speedLineOpacity = 0

    // Input state
    this.inputState = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      shift: false,
      v: false,
      space: false,
    }

    // 攻击左右手交替状态（toggle）
    this._useLeftStraight = true // 直拳：true=左手, false=右手
    this._useLeftHook = true // 勾拳：true=左手, false=右手

    // Resource
    this.resource = this.resources.items.playerModel

    // Controllers
    this.movement = new PlayerMovementController(this.config)

    this.setModel()

    // Animation Controller needs model
    this.animation = new PlayerAnimationController(this.model, this.resource.animations)

    this.setupInputListeners()

    // Debug
    if (this.debug.active) {
      this.debugFolder = this.debug.ui.addFolder({
        title: 'Player',
        expanded: false,
      })
      this.debugInit()
    }
  }

  setModel() {
    this.model = this.resource.scene
    // 模型始終保持 rotation.y = Math.PI，確保動畫正常播放
    // 整體朝向通過父容器 movement.group 控制
    this.model.rotation.y = Math.PI
    this.model.updateMatrixWorld()
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.material.side = THREE.DoubleSide
      }
    })

    // Add model to movement controller's group
    this.movement.group.add(this.model)
  }

  /**
   * 設置角色朝向角度
   * @param {number} angle - 朝向角度（弧度），0 = +Z，Math.PI = -Z
   */
  setFacing(angle) {
    this.config.facingAngle = angle
    this.movement.setFacing(angle)
  }

  setupInputListeners() {
    emitter.on('input:update', (keys) => {
      this.inputState = keys
    })

    emitter.on('input:jump', () => {
      if (this.movement.isGrounded && this.animation.stateMachine.currentState.name !== AnimationStates.COMBAT) {
        this.movement.jump()
        this.animation.triggerJump()
      }
    })

    // ==================== 攻击输入 ====================

    // 直拳（鼠标左键 / Z键）- 左右交替
    emitter.on('input:punch_straight', () => {
      const anim = this._useLeftStraight
        ? AnimationClips.STRAIGHT_PUNCH // 左直拳
        : AnimationClips.RIGHT_STRAIGHT_PUNCH // 右直拳
      this._useLeftStraight = !this._useLeftStraight // 切换下次使用的手
      this.animation.triggerAttack(anim)
    })

    // 勾拳（鼠标右键 / X键）- 左右交替
    emitter.on('input:punch_hook', () => {
      const anim = this._useLeftHook
        ? AnimationClips.HOOK_PUNCH // 左勾拳
        : AnimationClips.RIGHT_HOOK_PUNCH // 右勾拳
      this._useLeftHook = !this._useLeftHook // 切换下次使用的手
      this.animation.triggerAttack(anim)
    })

    // 格挡（C键）- 保持原逻辑
    emitter.on('input:block', (isBlocking) => {
      if (isBlocking) {
        this.animation.triggerAttack(AnimationClips.BLOCK)
      }
    })

    // ==================== 鼠标旋转（Pointer Lock 模式） ====================
    emitter.on('input:mouse_move', ({ movementX }) => {
      const newAngle = this.config.facingAngle - movementX * this.config.mouseSensitivity
      this.setFacing(newAngle)
    })
  }

  update() {
    const isCombat = this.animation.stateMachine.currentState?.name === AnimationStates.COMBAT

    // Resolve Input (Conflict & Normalize)
    const { resolvedInput, weights } = resolveDirectionInput(this.inputState)

    // Update Movement
    this.movement.update(resolvedInput, isCombat)

    // Prepare state for animation
    const playerState = {
      inputState: resolvedInput,
      directionWeights: weights, // Pass normalized weights
      isMoving: this.movement.isMoving(resolvedInput),
      isGrounded: this.movement.isGrounded,
      speedProfile: this.movement.getSpeedProfile(resolvedInput),
    }

    // Update Animation
    this.animation.update(this.time.delta, playerState)

    // ==================== 速度线控制 ====================
    this.updateSpeedLines(resolvedInput)
  }

  /**
   * 更新速度线效果
   * 当玩家按住 Shift + 方向键冲刺时，显示速度线
   * @param {object} inputState - 输入状态
   */
  updateSpeedLines(inputState) {
    // 检查是否处于冲刺状态：shift + 任意方向键
    const isMoving = inputState.forward || inputState.backward || inputState.left || inputState.right
    const isSprinting = inputState.shift && isMoving

    // 计算时间增量（秒）
    const deltaTime = this.time.delta * 0.001

    // 平滑过渡透明度
    if (isSprinting) {
      // 淡入：向目标透明度靠近
      this._speedLineOpacity += (this.config.speedLines.targetOpacity - this._speedLineOpacity)
        * this.config.speedLines.fadeInSpeed * deltaTime
    }
    else {
      // 淡出：向 0 靠近
      this._speedLineOpacity -= this._speedLineOpacity
        * this.config.speedLines.fadeOutSpeed * deltaTime
    }

    // 限制范围 [0, 1]
    this._speedLineOpacity = Math.max(0, Math.min(1, this._speedLineOpacity))

    // 更新渲染器中的速度线透明度
    this.renderer.setSpeedLineOpacity(this._speedLineOpacity)
  }

  debugInit() {
    // ===== 朝向控制 =====
    this.debugFolder.addBinding(this.config, 'facingAngle', {
      label: '朝向角度',
      min: -Math.PI,
      max: Math.PI,
      step: 0.01,
    }).on('change', () => {
      this.setFacing(this.config.facingAngle)
    })

    // ===== 鼠标灵敏度控制 =====
    this.debugFolder.addBinding(this.config, 'mouseSensitivity', {
      label: '鼠标灵敏度',
      min: 0.0001,
      max: 0.01,
      step: 0.0001,
    })

    // ===== 速度控制 =====

    // ===== 速度控制 =====
    this.debugFolder.addBinding(this.config.speed, 'crouch', { label: 'Crouch Speed', min: 0.1, max: 5 })
    this.debugFolder.addBinding(this.config.speed, 'walk', { label: 'Walk Speed', min: 1, max: 10 })
    this.debugFolder.addBinding(this.config.speed, 'run', { label: 'Run Speed', min: 1, max: 20 })
    this.debugFolder.addBinding(this.config, 'jumpForce', { label: 'Jump Force', min: 1, max: 20 })

    // Add Animation State Debug
    const debugState = { state: '' }
    this.debugFolder.addBinding(debugState, 'state', {
      readonly: true,
      label: 'Current State',
      multiline: true,
    })

    this.experience.time.on('tick', () => {
      if (this.animation.stateMachine.currentState) {
        debugState.state = this.animation.stateMachine.currentState.name
      }
    })

    // ===== Animation Speed Control =====
    const animSpeedFolder = this.debugFolder.addFolder({
      title: 'Animation Speed',
      expanded: false,
    })

    // Helper to update time scales
    const updateTimeScales = () => {
      this.animation.updateTimeScales()
    }

    // 1. Global Speed
    animSpeedFolder.addBinding(timeScaleConfig, 'global', {
      label: 'Global Rate',
      min: 0.1,
      max: 3.0,
      step: 0.1,
    }).on('change', updateTimeScales)

    // 2. Categories
    const categoriesFolder = animSpeedFolder.addFolder({ title: 'Categories', expanded: true })

    categoriesFolder.addBinding(timeScaleConfig.categories, AnimationCategories.LOCOMOTION, {
      label: 'Locomotion',
      min: 0.1,
      max: 3.0,
      step: 0.1,
    }).on('change', updateTimeScales)

    categoriesFolder.addBinding(timeScaleConfig.categories, AnimationCategories.COMBAT, {
      label: 'Combat',
      min: 0.1,
      max: 3.0,
      step: 0.1,
    }).on('change', updateTimeScales)

    categoriesFolder.addBinding(timeScaleConfig.categories, AnimationCategories.ACTION, {
      label: 'Action',
      min: 0.1,
      max: 3.0,
      step: 0.1,
    }).on('change', updateTimeScales)

    // 3. SubGroups
    const subGroupsFolder = animSpeedFolder.addFolder({ title: 'Sub Groups', expanded: false })

    // Locomotion Subgroups
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'walk', { label: 'Walk', min: 0.1, max: 3.0 }).on('change', updateTimeScales)
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'run', { label: 'Run', min: 0.1, max: 3.0 }).on('change', updateTimeScales)
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'sneak', { label: 'Sneak', min: 0.1, max: 3.0 }).on('change', updateTimeScales)
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'idle', { label: 'Idle', min: 0.1, max: 3.0 }).on('change', updateTimeScales)

    // Combat Subgroups
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'punch', { label: 'Punch', min: 0.1, max: 3.0 }).on('change', updateTimeScales)
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'block', { label: 'Block', min: 0.1, max: 3.0 }).on('change', updateTimeScales)

    // Action Subgroups
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'jump', { label: 'Jump', min: 0.1, max: 3.0 }).on('change', updateTimeScales)
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'fall', { label: 'Fall', min: 0.1, max: 3.0 }).on('change', updateTimeScales)
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'standup', { label: 'Standup', min: 0.1, max: 3.0 }).on('change', updateTimeScales)
  }

  destroy() {
    // Cleanup
  }
}
