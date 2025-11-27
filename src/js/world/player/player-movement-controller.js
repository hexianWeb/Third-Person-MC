import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import Experience from '../../experience.js'
import emitter from '../../utils/event-bus.js'
import { LocomotionProfiles } from './animation-config.js'

export class PlayerMovementController {
  constructor(config) {
    this.experience = new Experience()
    this.physics = this.experience.physics
    this.scene = this.experience.scene
    this.config = config

    this.rigidBody = null
    this.collider = null
    this.isGrounded = false

    this.group = new THREE.Group()
    this.scene.add(this.group)

    this.initPhysics()
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
    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 0, 0)
      .setCanSleep(false)
      .lockRotations()

    this.rigidBody = this.physics.world.createRigidBody(rigidBodyDesc)

    const colliderDesc = RAPIER.ColliderDesc.capsule(0.55, 0.3)
      .setTranslation(0, 0.85, 0)
      .setFriction(0.0)
      .setRestitution(0.0)

    this.collider = this.physics.world.createCollider(colliderDesc, this.rigidBody)
  }

  update(inputState, isCombatActive) {
    if (!this.rigidBody)
      return

    this.checkGroundStatus()
    this.handleMovement(inputState, isCombatActive)
    this.syncMesh()
  }

  handleMovement(inputState, isCombatActive) {
    if (isCombatActive) {
      // Decelerate during combat
      const vel = this.rigidBody.linvel()
      this.rigidBody.setLinvel({ x: vel.x * 0.9, y: vel.y, z: vel.z * 0.9 }, true)
      return
    }

    let moveX = 0
    let moveZ = 0

    if (inputState.forward)
      moveZ -= 1
    if (inputState.backward)
      moveZ += 0.5 // Slower backward
    if (inputState.left)
      moveX -= 1
    if (inputState.right)
      moveX += 1

    // Normalize
    const length = Math.sqrt(moveX * moveX + moveZ * moveZ)
    if (length > 0) {
      moveX /= length
      moveZ /= length
    }

    // Determine Speed
    let currentSpeed = this.config.speed.walk
    if (inputState.shift)
      currentSpeed = this.config.speed.run
    else if (inputState.v)
      currentSpeed = this.config.speed.crouch

    // Apply Velocity
    const currentVel = this.rigidBody.linvel()
    this.rigidBody.setLinvel({
      x: moveX * currentSpeed,
      y: currentVel.y,
      z: moveZ * currentSpeed,
    }, true)
  }

  jump() {
    if (this.isGrounded && this.rigidBody) {
      this.rigidBody.applyImpulse({ x: 0, y: this.config.jumpForce, z: 0 }, true)
      this.isGrounded = false
    }
  }

  checkGroundStatus() {
    const translation = this.rigidBody.translation()
    const rayOrigin = { x: translation.x, y: translation.y + 0.1, z: translation.z }
    const rayDir = { x: 0, y: -1, z: 0 }
    const ray = new RAPIER.Ray(rayOrigin, rayDir)
    const hit = this.physics.world.castRay(ray, 0.2, true)

    if (hit && hit.timeOfImpact < 0.15) {
      if (!this.isGrounded && this.rigidBody.linvel().y <= 0.1) {
        this.isGrounded = true
      }
    }
    else {
      this.isGrounded = false
    }
  }

  syncMesh() {
    const position = this.rigidBody.translation()
    this.group.position.set(position.x, position.y, position.z)
  }

  // Helper to get current profile for animation
  getSpeedProfile(inputState) {
    if (inputState.shift)
      return LocomotionProfiles.RUN
    if (inputState.v)
      return LocomotionProfiles.CROUCH
    return LocomotionProfiles.WALK
  }

  isMoving(inputState) {
    return inputState.forward || inputState.backward || inputState.left || inputState.right
  }
}
