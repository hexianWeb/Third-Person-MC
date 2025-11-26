import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import Experience from '../experience.js'
import emitter from '../utils/event-bus.js'

export default class Player {
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources
    this.time = this.experience.time
    this.debug = this.experience.debug
    this.physics = this.experience.physics

    // Config
    this.config = {
      speed: {
        walk: 1.5,
        run: 3.2,
      },
      jumpForce: 5,
    }

    // Animation Config
    this.animConfig = {
      globalTimeScale: 1.0,
      defaultTransition: 0.3,
      transitions: {
        // locomotion <-> locomotion
        locomotion_locomotion: 0.2,
        // idle <-> action
        locomotion_action: 0.1,
        // combat transitions
        combat_locomotion: 0.2,
        combat_combat: 0.1,
      },
      // Individual animation settings
      settings: {
        idle: { timeScale: 1.0, category: 'locomotion', loop: THREE.LoopRepeat },
        forward: { timeScale: 1.0, category: 'locomotion', loop: THREE.LoopRepeat },
        back: { timeScale: 1.0, category: 'locomotion', loop: THREE.LoopRepeat },
        left: { timeScale: 1.0, category: 'locomotion', loop: THREE.LoopRepeat },
        right: { timeScale: 1.0, category: 'locomotion', loop: THREE.LoopRepeat },
        running_forward: { timeScale: 1.2, category: 'locomotion', loop: THREE.LoopRepeat },
        running_backward: { timeScale: 1.2, category: 'locomotion', loop: THREE.LoopRepeat },
        running_left: { timeScale: 1.2, category: 'locomotion', loop: THREE.LoopRepeat },
        running_right: { timeScale: 1.2, category: 'locomotion', loop: THREE.LoopRepeat },
        jump: { timeScale: 1.0, category: 'action', loop: THREE.LoopOnce },
        falling: { timeScale: 1.0, category: 'action', loop: THREE.LoopRepeat },
        left_straight_punch: { timeScale: 1.5, category: 'combat', loop: THREE.LoopOnce },
        left_hook_punch: { timeScale: 1.5, category: 'combat', loop: THREE.LoopOnce },
        quick_combo_punch: { timeScale: 1.5, category: 'combat', loop: THREE.LoopOnce },
        left_block: { timeScale: 1.0, category: 'combat', loop: THREE.LoopOnce }, // Block is special, might want Clamp
      },
    }

    // Input state
    this.inputState = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      shift: false,
      ctrl: false,
      space: false,
    }

    // State Machine
    this.state = {
      current: 'idle',
      lastMode: 'none', // Track previous movement mode
      isGrounded: false,
      isAttacking: false,
      isBlocking: false,
      isBlending: false, // Flag for blend mode
    }

    // 资源设置
    this.resource = this.resources.items.playerModel

    this.setModel()
    this.setAnimations()
    this.setupInputListeners()
    this.initPhysics()

    // Debug
    if (this.debug.active) {
      this.debugFolder = this.debug.ui.addFolder({
        title: 'Player',
        expanded: true,
      })
      this.debugInit()
    }
  }

  initPhysics() {
    if (this.physics.ready) {
      this.createPhysicsBody()
    }
    else {
      emitter.on('physics:ready', () => {
        this.createPhysicsBody()
      })
    }
  }

  createPhysicsBody() {
    // Dynamic body
    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 5, 0)
      .setCanSleep(false)
      .lockRotations() // Lock rotation to prevent tipping over

    this.rigidBody = this.physics.world.createRigidBody(rigidBodyDesc)

    // Capsule collider
    const colliderDesc = RAPIER.ColliderDesc.capsule(0.55, 0.3)
      .setTranslation(0, 0.85, 0) // Center offset
      .setFriction(0.0)
      .setRestitution(0.0)

    this.collider = this.physics.world.createCollider(colliderDesc, this.rigidBody)
  }

  setModel() {
    this.model = this.resource.scene

    // 创建父级容器 Group
    // 用于控制整体位置，而 this.model 可用于控制旋转（如 lookAt）而不影响移动方向
    this.group = new THREE.Group()
    this.scene.add(this.group)
    this.group.add(this.model)

    this.model.rotation.y = Math.PI
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
      }
    })
  }

  setAnimations() {
    this.animation = {}
    this.animation.mixer = new THREE.AnimationMixer(this.model)
    this.animation.actions = {}
    this.animation.names = []
    this.animation.metadata = {} // Store metadata for runtime access

    if (this.resource.animations.length > 0) {
      this.resource.animations.forEach((clip) => {
        this.animation.names.push(clip.name)
        const action = this.animation.mixer.clipAction(clip)
        this.animation.actions[clip.name] = action

        // Apply settings if available
        const settings = this.animConfig.settings[clip.name]
        if (settings) {
          action.setLoop(settings.loop)
          if (settings.loop === THREE.LoopOnce) {
            action.clampWhenFinished = true
          }
          action.timeScale = settings.timeScale * this.animConfig.globalTimeScale

          // Store metadata
          this.animation.metadata[clip.name] = settings
        }
        else {
          // Default fallback
          this.animation.metadata[clip.name] = { category: 'unknown', timeScale: 1.0 }
        }
      })

      // Start with idle
      this.animation.current = this.animation.actions.idle
      this.animation.current.play()

      // Ensure locomotion animations are initialized for blending
      const blendAnims = ['forward', 'back', 'left', 'right', 'tpose']
      blendAnims.forEach((name) => {
        const action = this.animation.actions[name]
        if (action) {
          action.enabled = true
          action.setEffectiveWeight(0)
          action.play()
        }
      })
      // 禁用 tpose 动作
      this.animation.actions.tpose.enabled = false
      this.animation.actions.tpose.setEffectiveWeight(0)
      this.animation.actions.tpose.play()
    }
  }

  setupInputListeners() {
    emitter.on('input:update', (keys) => {
      this.inputState = keys
    })

    emitter.on('input:jump', () => {
      if (this.state.isGrounded && !this.state.isAttacking) {
        this.jump()
      }
    })

    emitter.on('input:punch_straight', () => {
      this.triggerAttack('left_straight_punch')
    })

    emitter.on('input:punch_hook', () => {
      this.triggerAttack('left_hook_punch')
    })

    emitter.on('input:block', (isBlocking) => {
      this.state.isBlocking = isBlocking
      if (isBlocking) {
        this.playAnimation('left_block')
      }
      else {
        if (this.animation.current.name === 'left_block') {
          this.playAnimation('idle')
        }
      }
    })
  }

  jump() {
    if (this.rigidBody) {
      this.rigidBody.applyImpulse({ x: 0, y: this.config.jumpForce, z: 0 }, true)
      this.playAnimation('jump')
      this.state.isGrounded = false
    }
  }

  triggerAttack(animName) {
    const now = Date.now()

    if (this.state.isAttacking) {
      // Combo Check
      if (this.lastAttackName === animName && now - this.lastAttackTime < 1000) {
        if (animName === 'left_straight_punch' || animName === 'left_hook_punch') {
          this.playAnimation('quick_combo_punch', 0.1)
          this.lastAttackName = 'quick_combo_punch'

          if (this.attackResetTimer)
            clearTimeout(this.attackResetTimer)

          const duration = this.animation.actions.quick_combo_punch.getClip().duration * 1000
          this.attackResetTimer = setTimeout(() => {
            this.state.isAttacking = false
            if (this.state.current === 'idle')
              this.playAnimation('idle')
          }, duration * 0.9)
          return
        }
      }
      return
    }

    this.state.isAttacking = true
    this.lastAttackName = animName
    this.lastAttackTime = now
    this.playAnimation(animName)

    const duration = this.animation.actions[animName].getClip().duration * 1000
    this.attackResetTimer = setTimeout(() => {
      this.state.isAttacking = false
      if (this.state.current === 'idle')
        this.playAnimation('idle')
    }, duration * 0.9)
  }

  clearRunningAnimations() {
    const runningAnims = ['running_forward', 'running_backward', 'running_left', 'running_right']
    runningAnims.forEach((name) => {
      const action = this.animation.actions[name]
      if (action && action.getEffectiveWeight() > 0) {
        action.fadeOut(0.2)
      }
    })
  }

  playAnimation(name, forcedDuration = null) {
    // If currently blending, and we play a non-blend animation, exit blend mode
    const blendAnims = ['idle', 'forward', 'back', 'left', 'right']
    if (this.state.isBlending && !blendAnims.includes(name)) {
      this.exitBlendMode()
    }

    const newAction = this.animation.actions[name]
    const oldAction = this.animation.current

    if (!newAction || newAction === oldAction)
      return

    // Calculate transition duration
    let duration = this.animConfig.defaultTransition
    if (forcedDuration !== null) {
      duration = forcedDuration
    }
    else {
      // Smart transition based on categories
      const oldMeta = this.animation.metadata[oldAction.getClip().name]
      const newMeta = this.animation.metadata[name]

      if (oldMeta && newMeta) {
        const key = `${oldMeta.category}_${newMeta.category}`
        if (this.animConfig.transitions[key] !== undefined) {
          duration = this.animConfig.transitions[key]
        }
      }
    }

    newAction.reset()

    // Ensure timeScale is up to date
    const settings = this.animConfig.settings[name]
    const baseScale = settings ? settings.timeScale : 1.0
    newAction.timeScale = baseScale * this.animConfig.globalTimeScale

    newAction.enabled = true
    newAction.setEffectiveTimeScale(newAction.timeScale)
    newAction.setEffectiveWeight(1)

    newAction.play()

    if (oldAction && oldAction !== newAction) {
      oldAction.fadeOut(duration)
    }
    newAction.fadeIn(duration)

    this.animation.current = newAction
  }

  enterBlendMode() {
    this.state.isBlending = true
    this.state.current = 'blend_state'

    // Clear any potential running animations from previous state
    this.clearRunningAnimations()

    // Ensure idle is playing
    const idleAction = this.animation.actions.idle
    if (idleAction) {
      idleAction.enabled = true
      idleAction.setEffectiveTimeScale(1)
      idleAction.play()
    }

    // Ensure direction animations are playing
    const directions = ['forward', 'back', 'left', 'right']
    directions.forEach((name) => {
      const action = this.animation.actions[name]
      if (action) {
        action.enabled = true
        action.setEffectiveTimeScale(1)
        action.play()
      }
    })

    this.animation.current = idleAction // Technically blending, but keep a reference
  }

  exitBlendMode() {
    if (!this.state.isBlending)
      return

    this.state.isBlending = false

    // 使用 fadeOut 平滑淡出所有混合动画，而不是立即设为 0
    // 这样可以避免瞬间回到 T-pose 的问题
    const blendAnims = ['idle', 'forward', 'back', 'left', 'right', 'tpose']
    const fadeDuration = 0.2 // 使用较短的淡出时间
    blendAnims.forEach((name) => {
      const action = this.animation.actions[name]
      if (action && action.getEffectiveWeight() > 0) {
        action.fadeOut(fadeDuration)
      }
    })

    // Safety clear running anims too, just in case
    this.clearRunningAnimations()
  }

  updateLocomotionBlend(isMoving) {
    const transitionSpeed = 0.1
    const isCrouching = this.inputState.ctrl

    // 1. Idle Weight Logic
    // Standing (No Ctrl): Blend idle (weight 1) + Direction (weight 1) -> Normal Walk
    // Crouching (Ctrl): Direction (weight 1) only -> Crouch Walk (pure direction anim)
    let targetIdleWeight = 1.0
    if (isMoving && isCrouching) {
      targetIdleWeight = 0.0
    }

    const idleAction = this.animation.actions.idle
    if (idleAction) {
      const currentIdleWeight = idleAction.getEffectiveWeight()
      idleAction.setEffectiveWeight(THREE.MathUtils.lerp(currentIdleWeight, targetIdleWeight, transitionSpeed))
    }

    // 2. Direction Weights
    const directions = [
      { name: 'forward', active: this.inputState.forward },
      { name: 'back', active: this.inputState.backward },
      { name: 'left', active: this.inputState.left },
      { name: 'right', active: this.inputState.right },
    ]

    directions.forEach((dir) => {
      const action = this.animation.actions[dir.name]
      if (action) {
        // Weight is 1 if moving and key pressed (regardless of crouch/stand)
        const targetWeight = (isMoving && dir.active) ? 1.0 : 0.0
        const currentWeight = action.getEffectiveWeight()
        action.setEffectiveWeight(THREE.MathUtils.lerp(currentWeight, targetWeight, transitionSpeed))
      }
    })
  }

  update() {
    // Update Physics & Movement
    if (this.rigidBody && this.model) {
      this.handleMovement()
      this.syncMesh()
      this.checkGroundStatus()
    }

    // Update Mixer
    if (this.animation && this.animation.mixer) {
      this.animation.mixer.update(this.time.delta * 0.001)
    }
  }

  checkGroundStatus() {
    const translation = this.rigidBody.translation()
    const rayOrigin = { x: translation.x, y: translation.y + 0.1, z: translation.z }
    const rayDir = { x: 0, y: -1, z: 0 }
    const ray = new RAPIER.Ray(rayOrigin, rayDir)
    const hit = this.physics.world.castRay(ray, 0.2, true)

    if (hit && hit.timeOfImpact < 0.15) {
      if (!this.state.isGrounded && this.rigidBody.linvel().y <= 0.1) {
        this.state.isGrounded = true
        if (!this.state.isAttacking && !this.state.isBlocking) {
          this.playAnimation('idle', 0.1)
        }
      }
    }
    else {
      this.state.isGrounded = false
      if (this.rigidBody.linvel().y < -1 && !this.state.isAttacking) {
        this.playAnimation('falling', 0.5)
      }
    }
  }

  handleMovement() {
    if (this.state.isAttacking || this.state.isBlocking) {
      // 攻击或格挡时减速
      const vel = this.rigidBody.linvel()
      this.rigidBody.setLinvel({ x: vel.x * 0.9, y: vel.y, z: vel.z * 0.9 }, true)
      return
    }

    let moveX = 0
    let moveZ = 0

    // 前进方向是 -Z 轴
    if (this.inputState.forward)
      moveZ -= 1

    // 后退仅播放动画和改变位置，但速度较慢
    if (this.inputState.backward)
      moveZ += 0.5 // 后退速度减半

    // 左右移动
    if (this.inputState.left)
      moveX -= 1
    if (this.inputState.right)
      moveX += 1

    // 归一化移动向量
    const length = Math.sqrt(moveX * moveX + moveZ * moveZ)
    if (length > 0) {
      moveX /= length
      moveZ /= length
    }

    const speed = this.inputState.shift ? this.config.speed.run : this.config.speed.walk

    // 应用速度
    const currentVel = this.rigidBody.linvel()
    this.rigidBody.setLinvel({
      x: moveX * speed,
      y: currentVel.y,
      z: moveZ * speed,
    }, true)

    // 角色始终朝向前方（-Z轴方向），不随左右移动改变朝向
    // 保持初始朝向或固定朝向
    // this.model.rotation.y = 0 // 如果初始朝向是0

    // 根据输入播放对应动画
    if (this.state.isGrounded) {
      const isRunning = this.inputState.shift

      if (isRunning && length > 0) {
        // Running Mode
        if (this.state.lastMode !== 'running') {
          this.state.lastMode = 'running'
          if (this.state.isBlending) {
            this.exitBlendMode()
          }
        }

        if (this.inputState.forward)
          this.playAnimation('running_forward')
        else if (this.inputState.backward)
          this.playAnimation('running_backward')
        else if (this.inputState.left)
          this.playAnimation('running_left')
        else if (this.inputState.right)
          this.playAnimation('running_right')
      }
      else {
        // Walking / Crouch / Idle Mode
        if (this.state.lastMode === 'running') {
          // Explicitly clear running animations when switching out of run mode
          this.clearRunningAnimations()
        }
        this.state.lastMode = 'walking'

        if (!this.state.isBlending) {
          this.enterBlendMode()
        }

        this.updateLocomotionBlend(length > 0)
      }
    }
    else {
      // Airborne
      this.state.lastMode = 'airborne'
      if (this.state.isBlending) {
        this.exitBlendMode()
      }

      // 静止时播放idle动画
      if (!this.state.isAttacking && !this.state.isBlocking) {
        // Check vertical velocity for falling
        if (this.rigidBody.linvel().y < -1) {
          this.playAnimation('falling', 0.5)
        }
      }
    }
  }

  syncMesh() {
    const position = this.rigidBody.translation()
    this.group.position.set(position.x, position.y, position.z)
  }

  updateAllAnimationTimeScales() {
    for (const name in this.animation.actions) {
      const settings = this.animConfig.settings[name]
      const baseScale = settings ? settings.timeScale : 1.0
      this.animation.actions[name].timeScale = baseScale * this.animConfig.globalTimeScale
    }
  }

  debugInit() {
    this.debugFolder.addBinding(this.config.speed, 'walk', { label: 'Walk Speed', min: 1, max: 10 })
    this.debugFolder.addBinding(this.config.speed, 'run', { label: 'Run Speed', min: 1, max: 20 })
    this.debugFolder.addBinding(this.config, 'jumpForce', { label: 'Jump Force', min: 1, max: 20 })

    const animFolder = this.debugFolder.addFolder({
      title: 'Animation Config',
      expanded: false,
    })

    animFolder.addBinding(this.animConfig, 'globalTimeScale', {
      label: 'Global Speed',
      min: 0.1,
      max: 3.0,
    }).on('change', () => {
      this.updateAllAnimationTimeScales()
    })

    animFolder.addBinding(this.animConfig, 'defaultTransition', {
      label: 'Default Fade',
      min: 0.05,
      max: 1.0,
    })

    // Transitions
    const transFolder = animFolder.addFolder({ title: 'Transitions', expanded: false })
    transFolder.addBinding(this.animConfig.transitions, 'locomotion_locomotion', { label: 'Loco <-> Loco', min: 0.05, max: 1.0 })
    transFolder.addBinding(this.animConfig.transitions, 'locomotion_action', { label: 'Loco <-> Action', min: 0.05, max: 1.0 })
    transFolder.addBinding(this.animConfig.transitions, 'combat_locomotion', { label: 'Combat <-> Loco', min: 0.05, max: 1.0 })
    transFolder.addBinding(this.animConfig.transitions, 'combat_combat', { label: 'Combat <-> Combat', min: 0.05, max: 1.0 })

    // Individual Speeds
    const speedFolder = animFolder.addFolder({ title: 'Clip Speeds', expanded: false })
    for (const name in this.animConfig.settings) {
      speedFolder.addBinding(this.animConfig.settings[name], 'timeScale', {
        label: name,
        min: 0.1,
        max: 3.0,
      }).on('change', () => {
        this.updateAllAnimationTimeScales()
      })
    }

    // Debug Blending Weights
    const blendFolder = this.debugFolder.addFolder({ title: 'Blending Monitor', expanded: false })
    const debugObj = {
      idle: 0,
      forward: 0,
      back: 0,
      left: 0,
      right: 0,
      running_forward: 0,
      running_backward: 0,
      running_left: 0,
      running_right: 0,
      tpose: 0,
    }

    const addMonitor = (name) => {
      blendFolder.addBinding(debugObj, name, {
        readonly: true,
        view: 'graph',
        min: 0,
        max: 1,
        interval: 50, // update interval
      })
    }

    ['idle', 'forward', 'back', 'left', 'right', 'running_forward', 'running_backward', 'running_left', 'running_right', 'tpose'].forEach(addMonitor)

    // Update monitors in loop
    this.experience.time.on('tick', () => {
      if (this.animation.actions.idle) {
        debugObj.idle = this.animation.actions.idle.getEffectiveWeight()
        debugObj.forward = this.animation.actions.forward ? this.animation.actions.forward.getEffectiveWeight() : 0
        debugObj.back = this.animation.actions.back ? this.animation.actions.back.getEffectiveWeight() : 0
        debugObj.left = this.animation.actions.left ? this.animation.actions.left.getEffectiveWeight() : 0
        debugObj.right = this.animation.actions.right ? this.animation.actions.right.getEffectiveWeight() : 0
        debugObj.running_forward = this.animation.actions.running_forward ? this.animation.actions.running_forward.getEffectiveWeight() : 0
        debugObj.running_backward = this.animation.actions.running_backward ? this.animation.actions.running_backward.getEffectiveWeight() : 0
        debugObj.running_left = this.animation.actions.running_left ? this.animation.actions.running_left.getEffectiveWeight() : 0
        debugObj.running_right = this.animation.actions.running_right ? this.animation.actions.running_right.getEffectiveWeight() : 0
        debugObj.tpose = this.animation.actions.tpose ? this.animation.actions.tpose.getEffectiveWeight() : 0
      }
    })
  }
}
