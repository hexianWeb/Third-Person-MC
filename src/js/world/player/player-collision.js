import * as THREE from 'three'
import Experience from '../../experience.js'
import { blocks } from '../terrain/blocks-config.js'

/**
 * 玩家胶囊体与方块的碰撞检测/修正
 * - broadPhase: 根据胶囊包围盒筛出潜在方块
 * - narrowPhase: 逐块计算最近点并检测是否与胶囊相交
 * - resolveCollisions: 按重叠深度由小到大修正位置与速度
 */
export default class PlayerCollisionSystem {
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.debug = this.experience.debug

    // 调试开关与统计
    this.params = {
      showCandidates: true,
      showContacts: true,
    }
    this.stats = {
      candidateCount: 0,
      collisionCount: 0,
    }

    // 调试辅助对象池
    this._candidateHelpers = []
    this._contactHelpers = []
    this._candidateIndex = 0
    this._contactIndex = 0

    this._boxGeometry = new THREE.BoxGeometry(1, 1, 1)
    this._boxEdges = new THREE.EdgesGeometry(this._boxGeometry)
    this._candidateMaterial = new THREE.LineBasicMaterial({ color: 0xFF0000 })
    this._contactMaterial = new THREE.MeshBasicMaterial({
      color: 0x00FFFF,
      wireframe: true,
    })
    this._contactGeometry = new THREE.SphereGeometry(0.05, 8, 8)
  }

  /**
   * 每帧开始重置索引与统计
   * - 调试辅助对象重新从池首开始使用
   * - 碰撞计数清零
   */
  prepareFrame() {
    this._candidateIndex = 0
    this._contactIndex = 0
    this.stats.candidateCount = 0
    this.stats.collisionCount = 0
  }

  /**
   * broad phase：通过胶囊体的 AABB 找到可能相交的方块
   * @param {{ center:THREE.Vector3, halfHeight:number, radius:number }} playerCapsule
   * @param {{ getBlockWorld:(x:number,y:number,z:number)=>{id:number,instanceId:any} }} provider 地形查询提供者（ChunkManager）
   * @returns {{x:number,y:number,z:number}[]} 返回可能相交的方块列表
   */
  broadPhase(playerCapsule, provider) {
    const candidates = []

    if (!provider?.getBlockWorld) {
      return candidates
    }

    const { center, radius, halfHeight } = playerCapsule
    const vertical = halfHeight + radius

    const minX = Math.floor(center.x - radius)
    const maxX = Math.ceil(center.x + radius)
    const minY = Math.floor(center.y - vertical)
    const maxY = Math.ceil(center.y + vertical)
    const minZ = Math.floor(center.z - radius)
    const maxZ = Math.ceil(center.z + radius)

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const block = provider.getBlockWorld(x, y, z)
          if (block?.id && block.id !== blocks.empty.id) {
            candidates.push({ x, y, z })
            if (this.debug.active && this.params.showCandidates) {
              this._addCandidateHelper(x, y, z)
            }
          }
        }
      }
    }

    this.stats.candidateCount = candidates.length
    return candidates
  }

  /**
   * narrow phase：逐方块检测是否与胶囊相交
   * @param {{x:number,y:number,z:number}[]} candidates
   * @param {{ center:THREE.Vector3, halfHeight:number, radius:number, worldVelocity:THREE.Vector3, basePosition:THREE.Vector3 }} playerCapsule
   * @returns {Array<{block:{x:number,y:number,z:number}, contactPoint:THREE.Vector3, normal:THREE.Vector3, overlap:number, ground:boolean}>} 返回实际发生碰撞的方块集合
   */
  narrowPhase(candidates, playerCapsule) {
    const collisions = []
    const { center, halfHeight, radius } = playerCapsule

    for (const block of candidates) {
      // 方块中心在整数坐标，边长 1，对应 [-0.5,0.5]
      const closestPoint = new THREE.Vector3(
        this._clamp(center.x, block.x - 0.5, block.x + 0.5),
        this._clamp(center.y, block.y - 0.5, block.y + 0.5),
        this._clamp(center.z, block.z - 0.5, block.z + 0.5),
      )

      const collision = this._capsuleContainsPoint(closestPoint, { center, halfHeight, radius })
      if (!collision) {
        continue
      }

      const { normal, overlap, ground } = collision

      collisions.push({
        block,
        contactPoint: closestPoint,
        normal,
        overlap,
        ground,
      })

      if (this.debug.active && this.params.showContacts) {
        this._addContactHelper(closestPoint)
      }
    }

    this.stats.collisionCount = collisions.length
    return collisions
  }

  /**
   * resolve：按重叠深度从小到大修正
   * - 按重叠深度排序，优先处理浅层碰撞减少穿模
   * - 推离方块并消除沿法线速度
   * - 检测地面状态，清理下落速度
   * @param {Array<{block:{x:number,y:number,z:number}, contactPoint:THREE.Vector3, normal:THREE.Vector3, overlap:number, ground:boolean}>} collisions 碰撞结果
   * @param {{ basePosition:THREE.Vector3, center:THREE.Vector3, halfHeight:number, radius:number, worldVelocity:THREE.Vector3, isGrounded:boolean }} playerState 玩家状态（会被就地修改）
   */
  resolveCollisions(collisions, playerState) {
    collisions.sort((a, b) => a.overlap - b.overlap)

    for (const collision of collisions) {
      // 位置调整后需要重新确认是否仍在胶囊内
      if (!this._capsuleContainsPoint(collision.contactPoint, {
        center: playerState.center,
        halfHeight: playerState.halfHeight,
        radius: playerState.radius,
      })) {
        continue
      }

      // 推离方块
      const deltaPosition = collision.normal.clone().multiplyScalar(collision.overlap)
      playerState.basePosition.add(deltaPosition)
      playerState.center.add(deltaPosition)

      // 速度去掉沿法线分量，避免继续穿透
      const vn = playerState.worldVelocity.dot(collision.normal)
      if (vn > 0) {
        playerState.worldVelocity.addScaledVector(collision.normal, -vn)
      }

      // 地面判定：法线向上即可视为着地
      if (collision.ground) {
        playerState.isGrounded = true
        // 防止在地面上继续积累下落速度
        if (playerState.worldVelocity.y < 0) {
          playerState.worldVelocity.y = 0
        }
      }
    }

    this._finalizeHelpers()
  }

  /**
   * 点是否在胶囊体内，返回法线与重叠
   * @param {THREE.Vector3} point
   * @param {{center:THREE.Vector3, halfHeight:number, radius:number}} capsule
   * @returns {{ normal:THREE.Vector3, overlap:number, ground:boolean } | null} 返回碰撞信息，若不相交则为 null
   */
  _capsuleContainsPoint(point, capsule) {
    const { center, halfHeight, radius } = capsule
    // 将点转换到胶囊本地空间（轴向 y）
    const local = new THREE.Vector3().subVectors(point, center)

    // 投影到轴线 [-halfHeight, halfHeight]
    const clampedY = this._clamp(local.y, -halfHeight, halfHeight)
    const axisPoint = new THREE.Vector3(0, clampedY, 0)
    const delta = new THREE.Vector3().subVectors(local, axisPoint)
    const dist = delta.length()

    if (dist > radius) {
      return null
    }

    const overlap = radius - dist

    // 法线指向“远离方块”方向：从方块指向胶囊中心
    let normal
    if (dist > 1e-6) {
      normal = delta.clone().negate().normalize()
    }
    else {
      // 退化情况：点在轴线上，使用 y 方向区分上下
      normal = local.y < 0 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, -1, 0)
    }

    // 判断是否接地：法线朝上且接触点靠近胶囊底部球体
    const bottomProximity = local.y + halfHeight // 接触点到胶囊底部中心的相对高度
    const ground = normal.y > 0.5 && bottomProximity <= radius + 0.05
    return { normal, overlap, ground }
  }

  /**
   * 调试：高亮候选方块
   * @param {number} x 方块世界 x
   * @param {number} y 方块世界 y
   * @param {number} z 方块世界 z
   */
  _addCandidateHelper(x, y, z) {
    const helper = this._candidateHelpers[this._candidateIndex] || this._createCandidateHelper()
    helper.position.set(x, y, z)
    helper.visible = true
    this._candidateIndex++
  }

  /**
   * 创建或复用候选方块线框
   * @returns {THREE.LineSegments} 候选方块辅助对象
   */
  _createCandidateHelper() {
    const mesh = new THREE.LineSegments(this._boxEdges, this._candidateMaterial)
    mesh.frustumCulled = false
    this.scene.add(mesh)
    this._candidateHelpers.push(mesh)
    return mesh
  }

  /**
   * 调试：接触点
   * @param {THREE.Vector3} position 接触点世界坐标
   */
  _addContactHelper(position) {
    const helper = this._contactHelpers[this._contactIndex] || this._createContactHelper()
    helper.position.copy(position)
    helper.visible = true
    this._contactIndex++
  }

  /**
   * 创建或复用接触点球体
   * @returns {THREE.Mesh} 接触点辅助对象
   */
  _createContactHelper() {
    const mesh = new THREE.Mesh(this._contactGeometry, this._contactMaterial)
    mesh.frustumCulled = false
    this.scene.add(mesh)
    this._contactHelpers.push(mesh)
    return mesh
  }

  /**
   * 收尾：隐藏未使用的 helper
   */
  _finalizeHelpers() {
    for (let i = this._candidateIndex; i < this._candidateHelpers.length; i++) {
      this._candidateHelpers[i].visible = false
    }
    for (let i = this._contactIndex; i < this._contactHelpers.length; i++) {
      this._contactHelpers[i].visible = false
    }
  }

  /**
   * 数值夹取，避免越界
   * @param {number} v 输入值
   * @param {number} min 下界
   * @param {number} max 上界
   * @returns {number} 夹取后的数值
   */
  _clamp(v, min, max) {
    return Math.max(min, Math.min(max, v))
  }
}
