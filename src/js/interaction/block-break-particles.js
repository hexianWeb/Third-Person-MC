/**
 * BlockBreakParticles
 * - 管理挖掘时的粒子飞溅效果
 * - 使用 THREE.Sprite 实现 Billboard 粒子（始终朝向相机）
 * - 监听挖掘事件，阶段性生成粒子
 */
import * as THREE from 'three'
import Experience from '../experience.js'
import emitter from '../utils/event-bus.js'
import { BLOCK_IDS } from '../world/terrain/blocks-config.js'

// 方块 ID -> 粒子颜色映射（简化方案）
const BLOCK_COLORS = {
  [BLOCK_IDS.GRASS]: 0x341C0E,
  [BLOCK_IDS.DIRT]: 0x8B5A2B,
  [BLOCK_IDS.STONE]: 0x7F7F7F,
  [BLOCK_IDS.COAL_ORE]: 0x2A2A2A,
  [BLOCK_IDS.IRON_ORE]: 0xD4A574,
  [BLOCK_IDS.TREE_TRUNK]: 0x6B4423,
  [BLOCK_IDS.TREE_LEAVES]: 0x228B22,
  [BLOCK_IDS.SAND]: 0xC2B280,
  [BLOCK_IDS.BIRCH_TRUNK]: 0xE8E4D9,
  [BLOCK_IDS.BIRCH_LEAVES]: 0x5D8A3E,
  [BLOCK_IDS.CHERRY_TRUNK]: 0x8B4513,
  [BLOCK_IDS.CHERRY_LEAVES]: 0xFFB6C1,
  [BLOCK_IDS.CACTUS]: 0x2E8B57,
  [BLOCK_IDS.TERRACOTTA]: 0xD2691E,
  [BLOCK_IDS.RED_SAND]: 0xCD853F,
  [BLOCK_IDS.ICE]: 0xADD8E6,
  [BLOCK_IDS.PACKED_ICE]: 0x87CEEB,
  [BLOCK_IDS.SNOW]: 0xFFFAFA,
  [BLOCK_IDS.GRAVEL]: 0x808080,
}

const DEFAULT_COLOR = 0x888888

export default class BlockBreakParticles {
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.time = this.experience.time
    this.debug = this.experience.debug

    // 粒子配置
    this.params = {
      enabled: true,
      particleCount: 4, // 每次迸溅的粒子数
      particleSize: 0.08, // 粒子大小
      spawnInterval: 150, // 生成间隔 (ms)
      lifetime: 600, // 粒子生命周期 (ms)
      gravity: -9.8, // 重力加速度
      minSpeed: 0.6, // 最小速度
      maxSpeed: 1.6, // 最大速度
      spread: 0.6, // 方向扰动强度
      normalOffset: 0.5, // 法线方向偏移量
    }

    // 活跃粒子池
    this.particles = []

    // 上次生成时间
    this.lastSpawnTime = 0

    // 当前挖掘目标
    this.currentTarget = null

    // 事件绑定
    this._onMiningProgress = this._onMiningProgress.bind(this)
    this._onMiningComplete = this._onMiningComplete.bind(this)
    this._onMiningCancel = this._onMiningCancel.bind(this)

    emitter.on('game:mining-progress', this._onMiningProgress)
    emitter.on('game:mining-complete', this._onMiningComplete)
    emitter.on('game:mining-cancel', this._onMiningCancel)

    if (this.debug.active) {
      this._initDebug()
    }
  }

  /**
   * 挖掘进度事件：阶段性生成粒子
   */
  _onMiningProgress({ progress: _progress, target: _target }) {
    if (!this.params.enabled)
      return

    const raycaster = this.experience.world?.blockRaycaster
    if (!raycaster?.current)
      return

    const now = this.time.elapsed
    if (now - this.lastSpawnTime < this.params.spawnInterval)
      return

    this.lastSpawnTime = now
    this.currentTarget = raycaster.current

    this._spawnParticles(raycaster.current)
  }

  /**
   * 挖掘完成事件：生成最终爆发粒子
   */
  _onMiningComplete({ target: _target }) {
    if (!this.params.enabled)
      return

    const raycaster = this.experience.world?.blockRaycaster
    if (!raycaster?.current)
      return

    // 最终爆发：生成更多粒子
    for (let i = 0; i < 3; i++) {
      this._spawnParticles(raycaster.current)
    }
  }

  /**
   * 挖掘取消事件：清理状态
   */
  _onMiningCancel() {
    this.currentTarget = null
  }

  /**
   * 生成一批粒子
   */
  _spawnParticles(raycastInfo) {
    const { worldPosition, face, blockId } = raycastInfo
    if (!worldPosition || !face?.normal)
      return

    const color = BLOCK_COLORS[blockId] ?? DEFAULT_COLOR

    // 计算面中心点：命中面稍微外移
    const faceCenter = worldPosition.clone()
      .add(face.normal.clone().multiplyScalar(this.params.normalOffset))

    for (let i = 0; i < this.params.particleCount; i++) {
      // 在面内随机偏移生成点
      const spawnPos = this._getRandomPointOnFace(faceCenter, face.normal)
      this._createParticle(spawnPos, face.normal, color)
    }
  }

  /**
   * 创建单个粒子
   */
  _createParticle(position, normal, color) {
    // 创建 Sprite 材质（关闭深度写入避免互相遮挡）
    const material = new THREE.SpriteMaterial({
      color,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
    })

    const sprite = new THREE.Sprite(material)

    // 随机化粒子大小
    const size = this.params.particleSize * THREE.MathUtils.lerp(0.7, 1.3, Math.random())
    sprite.scale.set(size, size, size)
    sprite.position.copy(position)

    // 微小随机起始偏移（防止第一帧 Z 重叠）
    sprite.position.addScaledVector(normal, Math.random() * 0.05)

    // 速度：法线方向 + 随机扰动 + 随机速度
    const velocity = this._randomizeDirection(normal)

    // 添加到场景
    this.scene.add(sprite)

    // 记录粒子状态
    this.particles.push({
      sprite,
      velocity,
      birthTime: this.time.elapsed,
      lifetime: this.params.lifetime,
    })
  }

  /**
   * 在面内生成随机偏移点
   */
  _getRandomPointOnFace(basePos, normal) {
    // 找到与 normal 不平行的一个轴作为切线
    const tangent = new THREE.Vector3(
      Math.abs(normal.y) > 0.9 ? 1 : 0,
      Math.abs(normal.y) > 0.9 ? 0 : 1,
      0,
    ).cross(normal).normalize()

    const bitangent = new THREE.Vector3()
      .crossVectors(normal, tangent)
      .normalize()

    // 在面内随机偏移 [-0.4, 0.4]
    const u = (Math.random() - 0.5) * 0.8
    const v = (Math.random() - 0.5) * 0.8

    return basePos.clone()
      .add(tangent.multiplyScalar(u))
      .add(bitangent.multiplyScalar(v))
  }

  /**
   * 以法线为主方向，加轻微向量扰动
   */
  _randomizeDirection(normal) {
    const dir = normal.clone()

    // 轻微向量扰动（更像碎屑）
    const spread = this.params.spread
    dir.x += (Math.random() - 0.5) * spread
    dir.y += (Math.random() - 0.5) * spread
    dir.z += (Math.random() - 0.5) * spread

    // 随机速度
    const speed = THREE.MathUtils.lerp(this.params.minSpeed, this.params.maxSpeed, Math.random())
    return dir.normalize().multiplyScalar(speed)
  }

  /**
   * 每帧更新粒子状态
   */
  update() {
    if (!this.params.enabled || this.particles.length === 0)
      return

    const now = this.time.elapsed
    const dt = this.time.delta / 1000 // 转换为秒

    // 更新并清理过期粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      const age = now - p.birthTime

      if (age >= p.lifetime) {
        // 移除过期粒子
        this.scene.remove(p.sprite)
        p.sprite.material.dispose()
        this.particles.splice(i, 1)
        continue
      }

      // 物理模拟：重力 + 速度衰减
      p.velocity.y += this.params.gravity * dt
      p.sprite.position.add(p.velocity.clone().multiplyScalar(dt))

      // 透明度渐变
      const lifeRatio = age / p.lifetime
      p.sprite.material.opacity = 1 - lifeRatio
    }
  }

  /**
   * 调试面板
   */
  _initDebug() {
    this.debugFolder = this.debug.ui.addFolder({
      title: 'Block Break Particles',
      expanded: false,
    })

    this.debugFolder.addBinding(this.params, 'enabled', { label: 'Enabled' })
    this.debugFolder.addBinding(this.params, 'particleCount', {
      label: 'Count/Spawn',
      min: 1,
      max: 10,
      step: 1,
    })
    this.debugFolder.addBinding(this.params, 'particleSize', {
      label: 'Size',
      min: 0.02,
      max: 0.2,
      step: 0.01,
    })
    this.debugFolder.addBinding(this.params, 'spawnInterval', {
      label: 'Interval (ms)',
      min: 50,
      max: 500,
      step: 10,
    })
    this.debugFolder.addBinding(this.params, 'lifetime', {
      label: 'Lifetime (ms)',
      min: 200,
      max: 2000,
      step: 50,
    })
    this.debugFolder.addBinding(this.params, 'gravity', {
      label: 'Gravity',
      min: -20,
      max: 0,
      step: 0.5,
    })
    this.debugFolder.addBinding(this.params, 'minSpeed', {
      label: 'Min Speed',
      min: 0.1,
      max: 2,
      step: 0.1,
    })
    this.debugFolder.addBinding(this.params, 'maxSpeed', {
      label: 'Max Speed',
      min: 0.5,
      max: 5,
      step: 0.1,
    })
    this.debugFolder.addBinding(this.params, 'spread', {
      label: 'Spread',
      min: 0.1,
      max: 1.0,
      step: 0.05,
    })
  }

  /**
   * 销毁
   */
  destroy() {
    emitter.off('game:mining-progress', this._onMiningProgress)
    emitter.off('game:mining-complete', this._onMiningComplete)
    emitter.off('game:mining-cancel', this._onMiningCancel)

    // 清理所有粒子
    for (const p of this.particles) {
      this.scene.remove(p.sprite)
      p.sprite.material.dispose()
    }
    this.particles = []
  }
}
