import * as THREE from 'three'

import { DRY_TOILET_SNAILS_CONFIG as CFG } from '../../config/dry-toilet-snails-config.js'
import Experience from '../../experience.js'
import {
  createSnailFsm,
  SNAIL_STATES,
  snailFsmOnClick,
  snailFsmUpdate,
} from './dry-toilet-math.js'

/** 参考原型动画参数（体素局部空间） */
const ANIM = {
  speed: 1,
  stride: 0.18,
  shellWobble: 0.075,
  tentacleSwing: 0.16,
  headTurn: 0.22,
}

/**
 * @param {number} seed
 * @returns {() => number}
 */
function mulberry32(seed) {
  return function () {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

/**
 * @param {THREE.Texture} texture
 * @returns {THREE.Texture}
 */
function applyPixelTextureSettings(texture) {
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

/**
 * @param {{ base: string, dark: string, light: string, seed?: number, pattern?: string }} options
 * @returns {THREE.CanvasTexture}
 */
function createPixelTexture({ base, dark, light, seed = 1, pattern = 'speckle' }) {
  const size = 16
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const random = mulberry32(seed)

  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const chance = random()
      let color = null
      if (pattern === 'flesh') {
        if (chance > 0.78)
          color = light
        else if (chance < 0.16)
          color = dark
      }
      else {
        if (chance > 0.8)
          color = light
        else if (chance < 0.18)
          color = dark
      }
      if (color) {
        ctx.fillStyle = color
        ctx.fillRect(x, y, 1, 1)
      }
    }
  }

  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = random() > 0.5 ? dark : light
    ctx.fillRect(Math.floor(random() * 15), Math.floor(random() * 16), 2, 1)
  }

  return applyPixelTextureSettings(new THREE.CanvasTexture(canvas))
}

/**
 * @param {number} seed
 * @param {string} base
 * @param {string} dark
 * @param {string} light
 * @returns {THREE.CanvasTexture}
 */
function createShellTexture(seed = 21, base = '#78431f', dark = '#4e2a16', light = '#a7612d') {
  const size = 16
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const random = mulberry32(seed)

  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const chance = random()
      const band = Math.floor((x + y * 0.35) / 3) % 2
      let color = null
      if (band === 0 && chance > 0.36)
        color = dark
      else if (chance > 0.82)
        color = light
      if (color) {
        ctx.fillStyle = color
        ctx.fillRect(x, y, 1, 1)
      }
    }
  }

  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = random() > 0.5 ? dark : light
    ctx.fillRect(Math.floor(random() * 15), Math.floor(random() * 16), 2, 1)
  }

  return applyPixelTextureSettings(new THREE.CanvasTexture(canvas))
}

function materialFromTexture(texture) {
  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.92,
    metalness: 0,
  })
}

function smoothRange(value, min, max) {
  const t = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * 创建所有蜗牛共享的几何体与像素材质（参考原型样式）
 * @returns {{ cubeGeometry: THREE.BoxGeometry, materials: Record<string, THREE.Material>, textures: Record<string, THREE.Texture>, dispose: () => void }}
 */
export function createSharedSnailAssets() {
  const textures = {
    body: createPixelTexture({ base: '#cbb38c', dark: '#a88c65', light: '#dfc9a4', seed: 11, pattern: 'flesh' }),
    bodyDark: createPixelTexture({ base: '#b99c75', dark: '#947756', light: '#ceb28b', seed: 12, pattern: 'flesh' }),
    eye: createPixelTexture({ base: '#171717', dark: '#050505', light: '#3d3d3d', seed: 31, pattern: 'speckle' }),
    shell: createShellTexture(21, '#78431f', '#4e2a16', '#a7612d'),
    shellDark: createShellTexture(22, '#5e341c', '#3d2112', '#844922'),
  }
  const materials = {
    body: materialFromTexture(textures.body),
    bodyDark: materialFromTexture(textures.bodyDark),
    eye: materialFromTexture(textures.eye),
    shell: materialFromTexture(textures.shell),
    shellDark: materialFromTexture(textures.shellDark),
  }
  const cubeGeometry = new THREE.BoxGeometry(1, 1, 1)

  return {
    cubeGeometry,
    materials,
    textures,
    // 兼容旧接口字段
    geometries: { cube: cubeGeometry },
    dispose() {
      cubeGeometry.dispose()
      Object.values(materials).forEach(material => material.dispose())
      Object.values(textures).forEach(texture => texture.dispose())
    },
  }
}

/**
 * 参考原型体素蜗牛：共享 cube/材质，实例自建部件层级
 */
export default class VoxelSnail {
  constructor({ shared, length, x, z, yaw, terrainProvider, activityCenter, footprint }) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.terrainProvider = terrainProvider
    this.activityCenter = activityCenter
    this.footprint = footprint
    this.length = length
    this.fsm = createSnailFsm(CFG)
    this.shared = shared

    this.group = new THREE.Group()
    this.group.name = 'VoxelSnail'
    this.group.position.set(x, 0, z)
    // 模型本地朝向 +X，yaw=0 时朝世界 +X
    this.group.rotation.y = yaw

    this.snail = new THREE.Group()
    this.group.add(this.snail)

    this._clickMeshes = []
    this._buildFromReference(shared)

    const scale = length / CFG.snailRefLocalLength
    this.snail.scale.setScalar(scale)
    // 体素底面在局部 -0.5，抬升 0.5 使底面落在 group 原点
    this.snail.position.y = 0.5 * scale

    this._elapsedSec = 0
    this._turnTimerSec = this._noise01(x, z) * CFG.turnNoiseInterval
    this._noiseState = this._seedFromPosition(x, z, length)

    this._snapToGround()
    this.scene.add(this.group)
  }

  /**
   * 按参考 HTML 搭建腹足 / 头 / 触角 / 壳体
   * @param {ReturnType<typeof createSharedSnailAssets>} shared
   */
  _buildFromReference(shared) {
    const { cubeGeometry, materials } = shared
    const segmentCount = 12
    this.bodySegments = []

    for (let i = 0; i < segmentCount; i++) {
      const segment = new THREE.Group()
      segment.position.x = i
      segment.userData.baseX = i
      this.snail.add(segment)
      this.bodySegments.push(segment)

      const width = i < 2 || i > 9 ? 1 : 2
      for (let z = -width; z <= width; z++)
        this._cube(segment, 0, 0, z, (i + z) % 2 ? materials.body : materials.bodyDark, cubeGeometry)

      if (i > 1 && i < 11) {
        this._cube(segment, 0, 1, -1, materials.bodyDark, cubeGeometry)
        this._cube(segment, 0, 1, 0, materials.body, cubeGeometry)
        this._cube(segment, 0, 1, 1, materials.bodyDark, cubeGeometry)
      }
    }

    this._cube(this.bodySegments[0], -1, 0, 0, materials.bodyDark, cubeGeometry)

    this.head = new THREE.Group()
    this.head.position.set(12, 0.4, 0)
    this.snail.add(this.head)
    this.headBase = this.head.position.clone()

    const headCells = [
      [0, 0, -1],
      [0, 0, 0],
      [0, 0, 1],
      [1, 0, -1],
      [1, 0, 0],
      [1, 0, 1],
      [0, 1, -1],
      [0, 1, 0],
      [0, 1, 1],
      [1, 1, -1],
      [1, 1, 0],
      [1, 1, 1],
      [0, 2, 0],
      [1, 2, 0],
    ]
    headCells.forEach(([cx, cy, cz], i) => {
      this._cube(this.head, cx, cy, cz, i % 3 ? materials.body : materials.bodyDark, cubeGeometry)
    })

    this.leftTentacle = this._createTentacle(-0.72, materials, cubeGeometry)
    this.rightTentacle = this._createTentacle(0.72, materials, cubeGeometry)

    this.shell = new THREE.Group()
    this.shell.position.set(5.7, 2.25, 0)
    this.snail.add(this.shell)
    this.shellBase = this.shell.position.clone()

    for (let sx = -3; sx <= 3; sx++) {
      for (let sy = -1; sy <= 5; sy++) {
        for (let sz = -2; sz <= 2; sz++) {
          const nx = sx / 3.1
          const ny = (sy - 2) / 3.1
          const nz = sz / 2.35
          const d = nx * nx + ny * ny + nz * nz
          if (d <= 1.05) {
            const stripe = (sx + sy * 2 + sz + 20) % 4
            this._cube(
              this.shell,
              sx,
              sy,
              sz,
              stripe === 0 ? materials.shellDark : materials.shell,
              cubeGeometry,
            )
          }
        }
      }
    }
  }

  _cube(parent, x, y, z, material, geometry) {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData.snailRef = this
    parent.add(mesh)
    this._clickMeshes.push(mesh)
    return mesh
  }

  _createTentacle(z, materials, geometry) {
    const root = new THREE.Group()
    root.position.set(1.15, 2.15, z)
    this.head.add(root)
    this._cube(root, 0, 0, 0, materials.bodyDark, geometry)
    this._cube(root, 0, 1, 0, materials.body, geometry)
    this._cube(root, 0, 2, 0, materials.bodyDark, geometry)
    this._cube(root, 0, 3, 0, materials.eye, geometry)
    return root
  }

  _seedFromPosition(x, z, length) {
    let seed = Math.floor((x + 128) * 73856093) ^ Math.floor((z + 128) * 19349663)
    seed ^= Math.floor(length * 1000) ^ CFG.rngSalt
    return seed >>> 0 || 1
  }

  _noise01(x, z) {
    const value = Math.sin(x * 12.9898 + z * 78.233 + CFG.rngSalt) * 43758.5453
    return value - Math.floor(value)
  }

  _random() {
    this._noiseState = (Math.imul(this._noiseState, 1664525) + 1013904223) >>> 0
    return this._noiseState / 0x100000000
  }

  _surfaceY(x, z) {
    return this.terrainProvider?.getTopSolidYWorld?.(x, z)
  }

  _snapToGround() {
    const surfaceY = this._surfaceY(this.group.position.x, this.group.position.z)
    if (surfaceY == null)
      return

    const scale = this.length / CFG.snailRefLocalLength
    // 方块顶面 = surfaceY + 0.5；体素方块中心在局部 y=0，底面在 -0.5
    this.group.position.y = surfaceY + 0.5
    this.snail.position.y = 0.5 * scale
  }

  _isFootprintCell(x, z) {
    const cellX = Math.floor(x)
    const cellZ = Math.floor(z)
    return this.footprint.some(cell => cell.x === cellX && cell.z === cellZ)
  }

  _isInsideActivityRing(x, z) {
    const dx = x - this.activityCenter.x
    const dz = z - this.activityCenter.z
    const distance = Math.hypot(dx, dz)
    return distance >= CFG.activityRadiusMin && distance <= CFG.activityRadiusMax
  }

  _turnAway() {
    const direction = this._random() < 0.5 ? -1 : 1
    // 仅旋转身体，头部相对朝向不变；移动始终沿头部方向
    this.group.rotation.y += direction * (Math.PI * 0.5 + this._random() * CFG.turnNoiseRadians)
  }

  /** 头部指向的世界 Y 轴偏航（模型本地 +X 为头朝向） */
  _getMoveYaw() {
    return this.group.rotation.y + this.head.rotation.y
  }

  /**
   * 将 FSM 状态映射为参考原型的 0..1 缩壳进度
   * @returns {number}
   */
  _retractProgress() {
    if (this.fsm.state === SNAIL_STATES.RETRACTING)
      return THREE.MathUtils.clamp(this.fsm.timerMs / this.fsm.retractMs, 0, 1)
    if (this.fsm.state === SNAIL_STATES.RETRACTED)
      return 1
    if (this.fsm.state === SNAIL_STATES.EMERGING)
      return 1 - THREE.MathUtils.clamp(this.fsm.timerMs / this.fsm.emergeMs, 0, 1)
    return 0
  }

  /**
   * 参考原型蠕动 + 缩壳动画
   * @param {number} retractProgress
   */
  _updateReferenceVisuals(retractProgress) {
    const crawl = this._elapsedSec * ANIM.speed * 4
    const tentacleRetract = smoothRange(retractProgress, 0.0, 0.38)
    const headRetract = smoothRange(retractProgress, 0.16, 0.76)
    const bodyRetract = smoothRange(retractProgress, 0.34, 1.0)
    const motionAmount = 1 - smoothRange(retractProgress, 0.0, 0.45)

    this.bodySegments.forEach((segment, index) => {
      const phase = crawl - index * 0.58
      const push = Math.sin(phase) * ANIM.stride * motionAmount
      const lift = Math.max(0, Math.sin(phase + 0.55)) * 0.12 * motionAmount

      const normalX = segment.userData.baseX + push
      const packedX = 4.9 + index * 0.27
      const packedY = 0.42 + Math.sin(index * 1.7) * 0.05

      segment.position.x = THREE.MathUtils.lerp(normalX, packedX, bodyRetract)
      segment.position.y = THREE.MathUtils.lerp(lift, packedY, bodyRetract)
      segment.position.z = THREE.MathUtils.lerp(0, Math.sin(index) * 0.12, bodyRetract)

      const packedScale = THREE.MathUtils.lerp(1, 0.52, bodyRetract)
      segment.scale.setScalar(packedScale)
    })

    const localHeadYaw = Math.sin(this._elapsedSec * 0.55) * ANIM.headTurn * motionAmount
    const normalHeadX = this.headBase.x + Math.sin(crawl + 0.4) * ANIM.stride * 1.7 * motionAmount
    const normalHeadY = this.headBase.y + Math.sin(crawl * 1.15) * 0.08 * motionAmount

    this.head.position.x = THREE.MathUtils.lerp(normalHeadX, 7.95, headRetract)
    this.head.position.y = THREE.MathUtils.lerp(normalHeadY, 0.92, headRetract)
    this.head.position.z = THREE.MathUtils.lerp(0, 0.05, headRetract)
    this.head.rotation.z = Math.sin(crawl * 0.85) * 0.035 * motionAmount
    this.head.rotation.y = localHeadYaw * (1 - headRetract)
    this.head.scale.setScalar(THREE.MathUtils.lerp(1, 0.38, headRetract))

    const tentacleScaleY = THREE.MathUtils.lerp(1, 0.12, tentacleRetract)
    this.leftTentacle.scale.set(1, tentacleScaleY, 1)
    this.rightTentacle.scale.set(1, tentacleScaleY, 1)

    this.leftTentacle.rotation.z = THREE.MathUtils.lerp(
      0.18 + Math.sin(crawl * 0.72) * ANIM.tentacleSwing * motionAmount,
      -1.08,
      tentacleRetract,
    )
    this.leftTentacle.rotation.x = THREE.MathUtils.lerp(
      Math.cos(crawl * 0.55) * ANIM.tentacleSwing * 0.45 * motionAmount,
      0.24,
      tentacleRetract,
    )
    this.rightTentacle.rotation.z = THREE.MathUtils.lerp(
      -0.18 - Math.sin(crawl * 0.72 + 0.8) * ANIM.tentacleSwing * motionAmount,
      1.08,
      tentacleRetract,
    )
    this.rightTentacle.rotation.x = THREE.MathUtils.lerp(
      Math.cos(crawl * 0.55 + 0.65) * ANIM.tentacleSwing * 0.45 * motionAmount,
      -0.24,
      tentacleRetract,
    )

    this.shell.position.x = this.shellBase.x - Math.sin(crawl) * ANIM.stride * 0.65 * motionAmount
    this.shell.position.y = this.shellBase.y + Math.sin(crawl * 0.9) * 0.045 * motionAmount
    this.shell.rotation.z = Math.sin(crawl * 0.72) * ANIM.shellWobble * motionAmount
    this.shell.rotation.x = Math.cos(crawl * 0.55) * ANIM.shellWobble * 0.45 * motionAmount

    const scale = this.length / CFG.snailRefLocalLength
    // 保持腹足底面贴地，仅叠加极小起伏
    this.snail.position.y = (0.5 + Math.sin(crawl * 0.5) * 0.025 * motionAmount) * scale
  }

  getClickMeshes() {
    return this._clickMeshes
  }

  getPosition() {
    return this.group.position
  }

  startRetract() {
    snailFsmOnClick(this.fsm)
  }

  isCrawling() {
    return this.fsm.state === SNAIL_STATES.CRAWLING
  }

  update(dtSec) {
    const delta = Number.isFinite(dtSec) ? Math.max(0, dtSec) : 0
    snailFsmUpdate(this.fsm, delta * 1000)

    const retractProgress = this._retractProgress()
    // 缩壳期间仍推进时间，保证展开动画相位连续
    this._elapsedSec += delta * (retractProgress < 0.45 ? 1 : 0.35)
    this._updateReferenceVisuals(retractProgress)

    if (!this.isCrawling()) {
      this._snapToGround()
      return
    }

    this._turnTimerSec += delta
    if (this._turnTimerSec >= CFG.turnNoiseInterval) {
      this._turnTimerSec %= CFG.turnNoiseInterval
      this.group.rotation.y += (this._random() * 2 - 1) * CFG.turnNoiseRadians
    }

    const distance = CFG.crawlSpeed * delta
    if (distance <= 0) {
      this._snapToGround()
      return
    }

    const x = this.group.position.x
    const z = this.group.position.z
    // 沿头部朝向（本地 +X）前进，不用单独的身体偏航
    const moveYaw = this._getMoveYaw()
    const nextX = x + Math.cos(moveYaw) * distance
    const nextZ = z + Math.sin(moveYaw) * distance
    const currentSurfaceY = this._surfaceY(x, z)
    const nextSurfaceY = this._surfaceY(nextX, nextZ)

    const blocked = currentSurfaceY == null
      || nextSurfaceY == null
      || this._isFootprintCell(nextX, nextZ)
      || !this._isInsideActivityRing(nextX, nextZ)
      || Math.abs(nextSurfaceY - currentSurfaceY) > CFG.maxStepHeight

    if (blocked) {
      this._turnAway()
      this._snapToGround()
      return
    }

    this.group.position.x = nextX
    this.group.position.z = nextZ
    this.group.position.y = nextSurfaceY + 0.5
  }

  destroy() {
    this.scene.remove(this.group)
    this._clickMeshes.forEach((mesh) => {
      delete mesh.userData.snailRef
    })
    this._clickMeshes.length = 0
    this.group.clear()
  }
}
