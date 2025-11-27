import * as THREE from 'three'
import Experience from '../experience.js'
import emitter from '../utils/event-bus.js'
import { AnimationClips, AnimationStates } from './player/animation-config.js'
import { PlayerAnimationController } from './player/player-animation-controller.js'
import { PlayerMovementController } from './player/player-movement-controller.js'

export default class Player {
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources
    this.time = this.experience.time
    this.debug = this.experience.debug

    // Config
    this.config = {
      speed: {
        crouch: 0.8,
        walk: 1.5,
        run: 3.2,
      },
      jumpForce: 5,
    }

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
        expanded: true,
      })
      this.debugInit()
    }
  }

  setModel() {
    this.model = this.resource.scene
    this.model.rotation.y = Math.PI
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
      }
    })

    // Add model to movement controller's group
    this.movement.group.add(this.model)
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

    // Attack Inputs
    const attackMap = {
      'input:punch_straight': AnimationClips.STRAIGHT_PUNCH,
      'input:punch_hook': AnimationClips.HOOK_PUNCH,
      'input:block': AnimationClips.BLOCK,
    }

    for (const [event, animName] of Object.entries(attackMap)) {
      emitter.on(event, (isBlocking) => {
        // Special case for blocking toggle
        if (event === 'input:block') {
          // Block logic is slightly different (loop/hold), current impl treats as one-shot for now
          // based on old code structure, block was LoopOnce.
          // If we want hold-block, we need a HOLD state.
          // For now, trigger as action.
          if (isBlocking) {
            this.animation.triggerAttack(animName)
          }
        }
        else {
          this.animation.triggerAttack(animName)
        }
      })
    }
  }

  update() {
    const isCombat = this.animation.stateMachine.currentState?.name === AnimationStates.COMBAT

    // Update Movement
    this.movement.update(this.inputState, isCombat)

    // Prepare state for animation
    const playerState = {
      inputState: this.inputState,
      isMoving: this.movement.isMoving(this.inputState),
      isGrounded: this.movement.isGrounded,
      speedProfile: this.movement.getSpeedProfile(this.inputState),
    }

    // Update Animation
    this.animation.update(this.time.delta, playerState)
  }

  debugInit() {
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
  }

  destroy() {
    // Cleanup
  }
}
