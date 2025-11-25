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
        walk: 2,
        run: 5,
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
      ctrl: false,
      space: false,
    }

    // State Machine
    this.state = {
      current: 'idle',
      isGrounded: false,
      isAttacking: false,
      isBlocking: false,
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
    // height = 1.7m approx -> halfHeight 0.5 + radius 0.3 * 2 = 1.1? No.
    // Capsule total height = 2 * halfHeight + 2 * radius
    // Let's assume radius 0.3.
    // To get ~1.7m height: 2*HL + 0.6 = 1.7 => 2*HL = 1.1 => HL = 0.55
    const colliderDesc = RAPIER.ColliderDesc.capsule(0.55, 0.3)
      .setTranslation(0, 0.85, 0) // Center offset
      .setFriction(0.0) // Friction handled by movement logic usually, or set low to prevent sticking walls
      .setRestitution(0.0)

    this.collider = this.physics.world.createCollider(colliderDesc, this.rigidBody)
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
    this.animation = {}
    this.animation.mixer = new THREE.AnimationMixer(this.model)
    this.animation.actions = {}
    this.animation.names = []

    if (this.resource.animations.length > 0) {
      this.resource.animations.forEach((clip) => {
        this.animation.names.push(clip.name)
        this.animation.actions[clip.name] = this.animation.mixer.clipAction(clip)
      })

      // Start with idle
      this.animation.current = this.animation.actions.idle
      this.animation.current.play()
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
      this.triggerAttack('left_straight_punch') // Or alternate
    })

    emitter.on('input:punch_hook', () => {
      this.triggerAttack('left_hook_punch')
    })

    emitter.on('input:block', (isBlocking) => {
      this.state.isBlocking = isBlocking
      if (isBlocking) {
        this.playAnimation('left_block') // Simplified
      }
      else {
        // Return to idle handled by update
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

          // Reset timer
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

    // Reset attacking state after animation finishes
    const duration = this.animation.actions[animName].getClip().duration * 1000
    this.attackResetTimer = setTimeout(() => {
      this.state.isAttacking = false
      if (this.state.current === 'idle')
        this.playAnimation('idle')
    }, duration * 0.9) // Slightly before end
  }

  playAnimation(name, duration = 0.2) {
    const newAction = this.animation.actions[name]
    const oldAction = this.animation.current

    if (!newAction || newAction === oldAction)
      return

    newAction.reset()
    newAction.play()
    newAction.crossFadeFrom(oldAction, duration)

    this.animation.current = newAction
    // Update current state name mostly for debug or simple logic
    // Real logic is driven by blending
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
    // Simple raycast check or relying on collision events
    // For now, let's just check velocity y or position?
    // Raycast is better.
    const translation = this.rigidBody.translation()
    const rayOrigin = { x: translation.x, y: translation.y + 0.1, z: translation.z }
    const rayDir = { x: 0, y: -1, z: 0 }
    const ray = new RAPIER.Ray(rayOrigin, rayDir)
    const hit = this.physics.world.castRay(ray, 0.2, true)

    if (hit && hit.timeOfImpact < 0.15) {
      if (!this.state.isGrounded && this.rigidBody.linvel().y <= 0.1) {
        // Landed
        this.state.isGrounded = true
        if (!this.state.isAttacking && !this.state.isBlocking) {
          this.playAnimation('idle', 0.1)
        }
      }
    }
    else {
      this.state.isGrounded = false
      // If falling
      if (this.rigidBody.linvel().y < -1 && !this.state.isAttacking) {
        this.playAnimation('falling', 0.5)
      }
    }
  }

  handleMovement() {
    if (this.state.isAttacking || this.state.isBlocking) {
      // Friction / Stop moving
      const vel = this.rigidBody.linvel()
      this.rigidBody.setLinvel({ x: vel.x * 0.9, y: vel.y, z: vel.z * 0.9 }, true)
      return
    }

    let moveX = 0
    let moveZ = 0

    if (this.inputState.forward)
      moveZ -= 1
    if (this.inputState.backward)
      moveZ += 1
    if (this.inputState.left)
      moveX -= 1
    if (this.inputState.right)
      moveX += 1

    // Normalization
    const length = Math.sqrt(moveX * moveX + moveZ * moveZ)
    if (length > 0) {
      moveX /= length
      moveZ /= length
    }

    const speed = this.inputState.shift ? this.config.speed.run : this.config.speed.walk

    // Rotation
    if (length > 0) {
      // Smooth rotation
      // Simple lerp for now, better use quaternions or rotateTowards

      // Get camera direction (flat on XZ plane)
      const camera = this.experience.camera.instance
      const cameraDir = new THREE.Vector3()
      camera.getWorldDirection(cameraDir)
      cameraDir.y = 0
      cameraDir.normalize()

      // Calculate move direction relative to camera
      // Forward (moveZ < 0) means align with camera direction
      // Backward (moveZ > 0) means opposite

      // Standard Third Person Control:
      // Input (moveX, moveZ) is relative to Camera View.
      // We need to transform input vector by camera rotation.

      // 1. Get camera rotation angle on Y axis
      const cameraAngleY = Math.atan2(cameraDir.x, cameraDir.z)

      // 2. Rotate input vector by camera angle
      // Input: moveX (Right is positive), moveZ (Back is positive)
      // But typically, Forward input (W) gives moveZ = -1.

      // Angle of input vector:
      const inputAngle = Math.atan2(moveX, moveZ)

      // Final rotation = CameraAngle + InputAngle
      // Note: atan2(x, z) gives angle from Z axis.
      // If Camera looks -Z (0,0,-1), angle is PI.
      // If Camera looks +X, angle is PI/2.

      // Let's try adding them.
      const targetRotation = inputAngle + cameraAngleY

      this.model.rotation.y = targetRotation

      // We only rotate the visual mesh to face movement direction.
      // But we do NOT rotate the velocity vector applied to physics yet.
      // Wait, physics velocity determines actual movement.
      // So we must rotate the velocity vector too!

      // Recalculate velocity based on targetRotation
      // VelX = sin(targetRotation) * speed
      // VelZ = cos(targetRotation) * speed

      const finalVelX = Math.sin(targetRotation) * speed
      const finalVelZ = Math.cos(targetRotation) * speed

      const currentVel = this.rigidBody.linvel()
      this.rigidBody.setLinvel({
        x: finalVelX,
        y: currentVel.y,
        z: finalVelZ,
      }, true)

      // Animation
      if (this.state.isGrounded) {
        if (this.inputState.shift) {
          this.playAnimation('running_forward') // Always run forward relative to model
        }
        else {
          this.playAnimation('forward') // Always walk forward relative to model
        }
      }
    }
    else {
      // Idle
      const currentVel = this.rigidBody.linvel()
      this.rigidBody.setLinvel({ x: 0, y: currentVel.y, z: 0 }, true)

      if (this.state.isGrounded && !this.state.isAttacking && !this.state.isBlocking) {
        this.playAnimation('idle')
      }
    }
  }

  syncMesh() {
    const position = this.rigidBody.translation()
    // Offset mesh to match collider (Collider is at center 0.85, Mesh origin is at feet 0)
    // If RigidBody is at Center of Mass...
    // RigidBody translation is Center of Mass?
    // When creating RB, translation is initial position.

    // The visual mesh origin is at (0,0,0) (feet).
    // The physics body origin (RB translation) depends on where we push it.
    // If we setTranslation(0,2,0), RB is at 0,2,0.
    // If we attach collider with translation (0, 0.85, 0), collider center is at 2.85.

    // Wait, usually we want RB translation to be at the feet or center.
    // If RB is at feet (0,0,0) relative to world.
    // Collider center should be at (0, 0.85, 0) relative to RB.

    this.model.position.set(position.x, position.y, position.z)
  }

  debugInit() {
    this.debugFolder.addBinding(this.config.speed, 'walk', { label: 'Walk Speed', min: 1, max: 10 })
    this.debugFolder.addBinding(this.config.speed, 'run', { label: 'Run Speed', min: 1, max: 20 })
    this.debugFolder.addBinding(this.config, 'jumpForce', { label: 'Jump Force', min: 1, max: 20 })
  }
}
