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
      moveZ += 0.8 // Slower backward
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
    // 射線起點設置在膠囊體底部附近
    // 膠囊體配置：setTranslation(0, 0.85, 0)，半高 0.55，半徑 0.3
    // 膠囊體底部（半球中心）= 0.85 - 0.55 = 0.3，最低點 = 0.3 - 0.3 = 0
    // 射線從稍高於底部的位置發出（translation.y + 0.1）
    const rayOrigin = { x: translation.x, y: translation.y + 0.1, z: translation.z }
    const rayDir = { x: 0, y: -1, z: 0 }
    const ray = new RAPIER.Ray(rayOrigin, rayDir)

    // 使用過濾器排除自身碰撞體，防止射線檢測到自己
    // RAPIER castRay 參數: ray, maxToi, solid, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate
    const hit = this.physics.world.castRay(
      ray,
      0.25, // 最大檢測距離
      true, // solid
      null, // filterFlags
      null, // filterGroups
      this.collider, // filterExcludeCollider - 排除自身碰撞體
      null, // filterExcludeRigidBody
      null, // filterPredicate
    )

    // 只有當確實檢測到地面且角色正在下落或已穩定時才判定為著地
    if (hit && hit.timeOfImpact < 0.2) {
      const velY = this.rigidBody.linvel().y
      // 只有在下落（y速度 <= 0.5）或已穩定時才認為著地
      // 這可以防止跳躍上升階段被誤判為著地
      if (velY <= 0.5) {
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
