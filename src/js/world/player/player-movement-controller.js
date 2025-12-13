import * as THREE from 'three'
import { MOVEMENT_CONSTANTS, MOVEMENT_DIRECTION_WEIGHTS } from '../../config/player-config.js'
import Experience from '../../experience.js'
import emitter from '../../utils/event-bus.js'
import { blocks } from '../terrain/blocks-config.js'
import { LocomotionProfiles } from './animation-config.js'
import PlayerCollisionSystem from './player-collision.js'

/**
 * 玩家移动控制器
 * - 支持 Rapier 物理与自研物理两套分支
 * - 通过胶囊体与地形方块碰撞来实现位移、跳跃与跌落处理
 */
export class PlayerMovementController {
  constructor(config) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.config = config

    this.isGrounded = false

    // 自研碰撞参数
    this.gravity = -9.81
    this.position = new THREE.Vector3(0, 0, 0) // 角色脚底点
    this.worldVelocity = new THREE.Vector3()
    this.capsule = {
      radius: 0.3,
      halfHeight: 0.55, // cylinder 半高
      offset: new THREE.Vector3(0, 0.85, 0), // 胶囊中心相对脚底位置
    }
    this.collision = new PlayerCollisionSystem()
    this.terrainContainer = this.experience.terrainContainer
    this._hasInitializedRespawn = false

    // 角色朝向角度（弧度）- 通過旋轉 group 實現
    this.facingAngle = config.facingAngle ?? Math.PI

    // 創建父容器 group
    this.group = new THREE.Group()
    this.group.rotation.y = this.facingAngle // 初始化 group 旋轉
    this.scene.add(this.group)

    // 攝像頭錨點（用於讓攝像頭跟隨，位置相對於 group 本地空間）
    this.cameraAnchor = new THREE.Object3D()
    this.cameraAnchor.name = 'CameraAnchor'
    // 初始 offset 將在 Camera 初始化時設置
    this.group.add(this.cameraAnchor)

    // 目標點錨點（用於攝像頭 lookAt）
    this.targetAnchor = new THREE.Object3D()
    this.targetAnchor.name = 'TargetAnchor'
    this.group.add(this.targetAnchor)

    // 初始化重生点监听：地形数据准备后更新到地形中心顶面
    this._setupRespawnPoint()
  }

  /**
   * 設置角色朝向角度
   * @param {number} angle - 朝向角度（弧度）
   */
  setFacing(angle) {
    this.facingAngle = angle
    this.group.rotation.y = angle
  }

  /**
   * 設置攝像頭錨點的本地偏移位置
   * @param {THREE.Vector3} offset - 攝像頭相對於角色的偏移
   */
  setCameraOffset(offset) {
    this.cameraAnchor.position.copy(offset)
  }

  /**
   * 設置目標點錨點的本地偏移位置
   * @param {THREE.Vector3} offset - 目標點相對於角色的偏移
   */
  setTargetOffset(offset) {
    this.targetAnchor.position.copy(offset)
  }

  /**
   * 每帧更新入口
   * @param {{forward:boolean,backward:boolean,left:boolean,right:boolean,shift:boolean,v:boolean}} inputState 输入状态
   * @param {boolean} isCombatActive 是否处于战斗减速
   */
  update(inputState, isCombatActive) {
    this._updateCustomPhysics(inputState, isCombatActive)
  }

  /**
   * 角色跳跃：依赖当前分支调用不同实现
   */
  jump() {
    if (this.isGrounded) {
      this.worldVelocity.y = this.config.jumpForce
      this.isGrounded = false
    }
  }

  /**
   * 获取胶囊体中心的世界坐标
   * @param {THREE.Vector3} target 输出向量
   * @returns {THREE.Vector3} 胶囊体中心的世界坐标
   */
  getCapsuleCenterWorld(target = new THREE.Vector3()) {
    return this.group.localToWorld(target.copy(this.capsule.offset))
  }

  /**
   * ====================== 自研物理分支 ======================
   */
  /**
   * 自研物理主循环
   * - 处理输入 -> 水平速度
   * - 应用重力 -> 预测位置 -> 碰撞修正
   * - 同步位置与状态
   * @param {{forward:boolean,backward:boolean,left:boolean,right:boolean,shift:boolean,v:boolean}} inputState 输入状态
   * @param {boolean} isCombatActive 是否战斗减速
   */
  _updateCustomPhysics(inputState, isCombatActive) {
    const dt = this.experience.time.delta * 0.001

    this.collision.prepareFrame()

    // 计算输入方向（世界坐标）
    const { worldX, worldZ } = this._computeWorldDirection(inputState)

    // 水平速度
    if (isCombatActive) {
      this.worldVelocity.multiplyScalar(MOVEMENT_CONSTANTS.COMBAT_DECELERATION)
    }
    else {
      let currentSpeed = this.config.speed.walk
      let profile = 'walk'
      if (inputState.shift) {
        currentSpeed = this.config.speed.run
        profile = 'run'
      }
      else if (inputState.v) {
        currentSpeed = this.config.speed.crouch
        profile = 'crouch'
      }

      const dirScale = this._computeDirectionScale(profile, inputState)
      this.worldVelocity.x = worldX * currentSpeed * dirScale
      this.worldVelocity.z = worldZ * currentSpeed * dirScale
    }

    // 重力
    this.worldVelocity.y += this.gravity * dt

    // 预测位置
    const nextPosition = new THREE.Vector3().copy(this.position).addScaledVector(this.worldVelocity, dt)

    // 构建胶囊状态
    const playerState = this._buildPlayerState(nextPosition)

    const container = this.experience.terrainContainer || this.terrainContainer
    const candidates = this.collision.broadPhase(playerState, container)
    const collisions = this.collision.narrowPhase(candidates, playerState)
    this.collision.resolveCollisions(collisions, playerState)
    this._snapToGround(playerState, container)

    // 同步结果
    this.isGrounded = playerState.isGrounded
    this.position.copy(playerState.basePosition)
    this.worldVelocity.copy(playerState.worldVelocity)

    // 超界重生
    this._checkRespawn()

    this._syncMeshCustom()
  }

  /**
   * 将输入方向从角色本地空间转换到世界空间
   * @param {{forward:boolean,backward:boolean,left:boolean,right:boolean}} inputState 输入状态
   * @returns {{worldX:number, worldZ:number}} 世界坐标系方向
   */
  _computeWorldDirection(inputState) {
    let localX = 0
    let localZ = 0

    if (inputState.forward)
      localZ -= MOVEMENT_DIRECTION_WEIGHTS.FORWARD
    if (inputState.backward)
      localZ += MOVEMENT_DIRECTION_WEIGHTS.BACKWARD
    if (inputState.left)
      localX -= MOVEMENT_DIRECTION_WEIGHTS.LEFT
    if (inputState.right)
      localX += MOVEMENT_DIRECTION_WEIGHTS.RIGHT

    const length = Math.sqrt(localX * localX + localZ * localZ)
    if (length > 0) {
      localX /= length
      localZ /= length
    }

    const cos = Math.cos(this.facingAngle)
    const sin = Math.sin(this.facingAngle)
    const worldX = localX * cos + localZ * sin
    const worldZ = -localX * sin + localZ * cos

    return { worldX, worldZ }
  }

  /**
   * 依据当前档位与输入方向计算额外方向倍率
   * - 后退单独衰减
   * - 任意左右输入再叠乘侧向衰减
   * @param {'walk'|'run'|'crouch'} profile
   * @param {{forward:boolean,backward:boolean,left:boolean,right:boolean}} inputState
   * @returns {number} 方向倍率
   */
  _computeDirectionScale(profile, inputState) {
    const multipliers = this.config.directionMultiplier?.[profile]
    if (!multipliers)
      return 1

    let scale = 1
    if (inputState.backward)
      scale *= multipliers.backward ?? 1
    if (inputState.left || inputState.right)
      scale *= multipliers.lateral ?? 1

    return scale
  }

  /**
   * 构建当前胶囊体状态
   * @param {THREE.Vector3} basePosition 脚底世界坐标
   * @returns {{ basePosition:THREE.Vector3, center:THREE.Vector3, halfHeight:number, radius:number, worldVelocity:THREE.Vector3, isGrounded:boolean }} 当前帧胶囊体状态（供碰撞系统就地修改）
   */
  _buildPlayerState(basePosition) {
    const center = new THREE.Vector3().copy(basePosition).add(this.capsule.offset)
    return {
      basePosition,
      center,
      halfHeight: this.capsule.halfHeight,
      radius: this.capsule.radius,
      worldVelocity: this.worldVelocity,
      isGrounded: false,
    }
  }

  /**
   * 同步 Three.js group 位置（自研分支）
   */
  _syncMeshCustom() {
    this.group.position.copy(this.position)
  }

  /**
   * 初始化重生点：优先使用已存在的地形容器，地形生成完成后再更新
   */
  _setupRespawnPoint() {
    // 尝试使用现有容器
    this._updateRespawnPoint(this.terrainContainer)

    // 等待地形生成完毕更新重生点
    emitter.on('terrain:data-ready', ({ container }) => {
      this._updateRespawnPoint(container)
    })
  }

  /**
   * 将重生点设置为地形中心列最高方块顶面
   * @param {*} container TerrainContainer
   */
  _updateRespawnPoint(container) {
    if (!container?.getSize)
      return

    const { width, height } = container.getSize()
    if (!width || !height)
      return

    const centerX = Math.floor(width / 2)
    const centerZ = Math.floor(width / 2)
    const topY = this._findTopY(container, centerX, centerZ, height)
    if (topY === null)
      return

    // 顶面为方块中心 +0.5，再抬高一点防止穿模
    const surfaceY = topY + 0.5
    const respawnPos = {
      x: centerX,
      y: surfaceY + 0.05,
      z: centerZ,
    }

    this.config.respawn.position = respawnPos

    // 首次初始化时同步角色位置，避免出生在地形下方
    if (!this._hasInitializedRespawn) {
      this.position.set(respawnPos.x, respawnPos.y, respawnPos.z)
      this.worldVelocity.set(0, 0, 0)
      this._syncMeshCustom()
      this._hasInitializedRespawn = true
    }
  }

  /**
   * 获取指定列的最高非空方块高度
   * @param {*} container TerrainContainer
   * @param {number} x
   * @param {number} z
   * @param {number} height
   * @returns {number|null} 最高非空方块的 y 索引，找不到返回 null
   */
  _findTopY(container, x, z, height) {
    for (let y = height - 1; y >= 0; y--) {
      const block = container.getBlock(x, y, z)
      if (block.id !== blocks.empty.id)
        return y
    }
    return null
  }

  /**
   * 跌出世界后的重生处理
   */
  _checkRespawn() {
    const threshold = this.config.respawn?.thresholdY ?? -10
    if (this.position.y > threshold)
      return

    const target = this.config.respawn?.position || { x: 10, y: 10, z: 10 }
    this.position.set(target.x, target.y, target.z)
    this.worldVelocity.set(0, 0, 0)
    this.isGrounded = false
  }

  /**
   * 贴地纠偏：当胶囊底部距离地面很近但未检测到碰撞时，吸附到地面防止误判空中
   * @param {*} playerState 当前帧状态（可变）
   * @param {*} container 地形容器
   */
  _snapToGround(playerState, container) {
    // 仅在下落或静止且未接地时尝试吸附，避免起跳被吞
    if (playerState.isGrounded || !container?.getSize || playerState.worldVelocity.y > 0.05) {
      return
    }

    const { width, height } = container.getSize()
    const baseY = playerState.basePosition.y
    const snapEps = 0.08
    const sampleRadius = this.capsule.radius * 0.7
    const samples = [
      [0, 0],
      [sampleRadius, 0],
      [-sampleRadius, 0],
      [0, sampleRadius],
      [0, -sampleRadius],
    ]

    let bestTop = -Infinity

    for (const [ox, oz] of samples) {
      const gx = Math.floor(playerState.basePosition.x + ox)
      const gz = Math.floor(playerState.basePosition.z + oz)
      if (gx < 0 || gz < 0 || gx >= width || gz >= width)
        continue

      // 从当前位置向下找到最近的非空方块
      for (let y = Math.min(height - 1, Math.floor(baseY) + 1); y >= 0; y--) {
        const block = container.getBlock(gx, y, gz)
        if (block.id === blocks.empty.id)
          continue

        const top = y + 0.5
        if (top <= baseY && top > bestTop)
          bestTop = top
        break
      }
    }

    if (bestTop === -Infinity)
      return

    const gap = baseY - bestTop
    if (gap >= 0 && gap <= snapEps) {
      playerState.basePosition.y = bestTop
      playerState.center.y = bestTop + this.capsule.offset.y
      playerState.worldVelocity.y = 0
      playerState.isGrounded = true
    }
  }

  // Helper to get current profile for animation
  /**
   * 获取动画速度档位
   * @param {{shift:boolean,v:boolean}} inputState 输入状态
   * @returns {LocomotionProfiles} 当前档位
   */
  getSpeedProfile(inputState) {
    if (inputState.shift)
      return LocomotionProfiles.RUN
    if (inputState.v)
      return LocomotionProfiles.CROUCH
    return LocomotionProfiles.WALK
  }

  /**
   * 是否有任何移动输入
   * @param {{forward:boolean,backward:boolean,left:boolean,right:boolean}} inputState 输入状态
   * @returns {boolean} 是否移动
   */
  isMoving(inputState) {
    return inputState.forward || inputState.backward || inputState.left || inputState.right
  }
}
