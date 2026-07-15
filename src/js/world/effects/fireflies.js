/**
 * Fireflies - Night-time pixel-style firefly particle system (chunk-based)
 *
 * Phase 3：WebGPU 点图元仅支持 1px，故用 Sprite + PointsNodeMaterial（官方推荐）
 * 逻辑转译自 shaders/fireflies/*（GLSL 留作对照，Phase 5 归档）
 */
import {
  Fn,
  abs,
  cos,
  float,
  fract,
  instancedBufferAttribute,
  max,
  sin,
  smoothstep,
  uniform,
  uv,
  vec3,
} from 'three/tsl'
import * as THREE from 'three/webgpu'
import Experience from '../../experience.js'

/** 呼吸曲线：三角波 + smoothstep（对齐 GLSL breathe） */
const breathe = Fn(([t]) => {
  const tri = float(1).sub(abs(float(2).mul(fract(t)).sub(1)))
  return tri.mul(tri).mul(float(3).sub(tri.mul(2)))
})

export default class Fireflies {
  constructor(options = {}) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.time = this.experience.time
    this.debug = this.experience.debug

    // Configurable params
    this.params = {
      countPerCell: options.countPerCell ?? 40, // fireflies per cell
      cellSize: options.cellSize ?? 10, // world units per cell (match chunk width feel)
      viewRadius: options.viewRadius ?? 3, // cells in each direction to load
      unloadPadding: options.unloadPadding ?? 0, // hysteresis for unloading
      spawnHeight: options.spawnHeight ?? 16, // vertical range for spawning
      size: options.size ?? 0.0625 * 2, // 0.0625 blocks
      breathSpeed: options.breathSpeed ?? 0.4,
      glowColor: '#f6f644',
    }

    // Cell map: "cx,cz" -> { sprite, material, geometry attrs }
    this._cells = new Map()
    this._lastPlayerCellX = null
    this._lastPlayerCellZ = null

    // 跨 cell 共享的 TSL uniforms（一处写入，全部材质同步）
    this._createSharedUniforms()

    if (this.debug.active) {
      this.debugInit()
    }
  }

  // ===== Shared uniforms =====

  _createSharedUniforms() {
    this.uTime = uniform(0)
    this.uOpacity = uniform(0)
    this.uSize = uniform(this.params.size)
    this.uBreathSpeed = uniform(this.params.breathSpeed)
    this.uGlowColor = uniform(new THREE.Color(this.params.glowColor))
  }

  /**
   * 每 cell 一份材质：positionNode 绑定该 cell 的 InstancedBufferAttribute
   * @param {THREE.InstancedBufferAttribute} positionsAttr
   * @param {THREE.InstancedBufferAttribute} randomsAttr
   */
  _createCellMaterial(positionsAttr, randomsAttr) {
    const basePos = instancedBufferAttribute(positionsAttr)
    const aRandom = instancedBufferAttribute(randomsAttr)

    const seed = aRandom.mul(6.2831)
    const t = this.uTime

    // 三层正弦漫游（对齐 fireflies/vertex.glsl）
    const offsetX = sin(t.mul(0.3).add(seed)).mul(2.0)
      .add(cos(t.mul(0.7).add(seed.mul(2.1))).mul(0.8))
      .add(sin(t.mul(2.3).add(seed.mul(4.1))).mul(0.15))
    const offsetY = sin(t.mul(0.2).add(seed.mul(1.3))).mul(1.5)
      .add(sin(t.mul(0.5).add(seed.mul(1.7))).mul(0.6))
      .add(cos(t.mul(1.9).add(seed.mul(3.3))).mul(0.10))
    const offsetZ = cos(t.mul(0.25).add(seed.mul(0.7))).mul(2.0)
      .add(sin(t.mul(0.6).add(seed.mul(2.5))).mul(0.8))
      .add(sin(t.mul(2.1).add(seed.mul(5.0))).mul(0.15))

    const material = new THREE.PointsNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })

    material.positionNode = basePos.add(vec3(offsetX, offsetY, offsetZ))
    material.sizeNode = this.uSize

    // 方形软边辉光 + 呼吸（对齐 fragment.glsl）
    const phase = aRandom.mul(6.2831)
    const breathT = breathe(this.uTime.mul(this.uBreathSpeed).add(phase))
    material.colorNode = this.uGlowColor.mul(breathT)

    material.opacityNode = Fn(() => {
      const center = uv().sub(0.5)
      const dist = max(abs(center.x), abs(center.y))
      const glow = float(1).sub(smoothstep(float(0.25), float(0.5), dist))
      return glow.mul(breathT).mul(this.uOpacity)
    })()

    return material
  }

  // ===== Cell Management (streaming) =====

  _cellKey(cx, cz) {
    return `${cx},${cz}`
  }

  /**
   * Deterministic pseudo-random number generator seeded by cell coordinates.
   * Produces the same firefly positions every time the same cell is loaded.
   */
  _seededRandom(seed) {
    // Simple hash-based PRNG
    let s = seed
    return () => {
      s = (s * 16807 + 0) % 2147483647
      return (s - 1) / 2147483646
    }
  }

  /**
   * Create a cell's Sprite (instanced) at grid position (cx, cz)
   */
  _createCell(cx, cz) {
    const { countPerCell, cellSize, spawnHeight } = this.params

    // Deterministic seed from cell coordinates
    const cellSeed = ((cx * 73856093) ^ (cz * 19349663)) & 0x7FFFFFFF
    const rand = this._seededRandom(cellSeed || 1)

    const positions = new Float32Array(countPerCell * 3)
    const randoms = new Float32Array(countPerCell)

    // World-space origin of this cell
    const originX = cx * cellSize
    const originZ = cz * cellSize

    for (let i = 0; i < countPerCell; i++) {
      const i3 = i * 3
      // Random position within the cell, in world coordinates
      positions[i3] = originX + rand() * cellSize
      positions[i3 + 1] = rand() * spawnHeight + 1 // 1 ~ spawnHeight+1
      positions[i3 + 2] = originZ + rand() * cellSize

      randoms[i] = rand()
    }

    const positionsAttr = new THREE.InstancedBufferAttribute(positions, 3)
    const randomsAttr = new THREE.InstancedBufferAttribute(randoms, 1)
    const material = this._createCellMaterial(positionsAttr, randomsAttr)

    // WebGPU：用 Sprite.count 做实例点精灵（Points 仅 1px）
    const sprite = new THREE.Sprite(material)
    sprite.count = countPerCell
    sprite.frustumCulled = false

    this.scene.add(sprite)
    this._cells.set(this._cellKey(cx, cz), { sprite, material, positionsAttr, randomsAttr })
  }

  /**
   * Remove a cell and dispose its resources
   */
  _removeCell(key) {
    const cell = this._cells.get(key)
    if (!cell)
      return

    this.scene.remove(cell.sprite)
    cell.material.dispose()
    this._cells.delete(key)
  }

  /**
   * Update cell streaming based on player position.
   * Loads cells within viewRadius, unloads cells beyond viewRadius + unloadPadding.
   */
  _updateStreaming(playerPos) {
    if (!playerPos)
      return

    const { cellSize, viewRadius, unloadPadding } = this.params

    const pcx = Math.floor(playerPos.x / cellSize)
    const pcz = Math.floor(playerPos.z / cellSize)

    // Skip if player hasn't crossed a cell boundary
    if (pcx === this._lastPlayerCellX && pcz === this._lastPlayerCellZ)
      return

    this._lastPlayerCellX = pcx
    this._lastPlayerCellZ = pcz

    // Load cells within viewRadius
    for (let cz = pcz - viewRadius; cz <= pcz + viewRadius; cz++) {
      for (let cx = pcx - viewRadius; cx <= pcx + viewRadius; cx++) {
        const key = this._cellKey(cx, cz)
        if (!this._cells.has(key)) {
          this._createCell(cx, cz)
        }
      }
    }

    // Unload cells beyond viewRadius + unloadPadding (hysteresis)
    const dUnload = viewRadius + unloadPadding
    for (const [key] of this._cells) {
      const [sx, sz] = key.split(',').map(Number)
      if (Math.abs(sx - pcx) > dUnload || Math.abs(sz - pcz) > dUnload) {
        this._removeCell(key)
      }
    }
  }

  // ===== Night Factor =====

  _getNightFactor() {
    const environment = this.experience.world?.environment
    if (!environment?.dayCycle)
      return 0

    const t = environment.dayCycle.params.timeOfDay

    if (t >= 0.28 && t <= 0.78)
      return 0
    if (t > 0.78 && t < 0.85) {
      const f = (t - 0.78) / 0.07
      return f * f * (3 - 2 * f) // smoothstep
    }
    if (t >= 0.85 || t < 0.22)
      return 1
    if (t >= 0.22 && t < 0.28) {
      const f = 1 - (t - 0.22) / 0.06
      return f * f * (3 - 2 * f)
    }
    return 0
  }

  // ===== Lifecycle =====

  update() {
    const night = this._getNightFactor()
    this.uOpacity.value = night
    this.uTime.value = this.time.elapsed * 0.001

    // 夜间不可见时仍可卸载/加载，但跳过无意义更新也可接受
    const visible = night > 0.01
    for (const cell of this._cells.values()) {
      cell.sprite.visible = visible
    }

    const player = this.experience.world?.player
    if (player) {
      this._updateStreaming(player.getPosition())
    }
  }

  resize() {
    // PointsNodeMaterial 使用内建 screenDPR / size attenuation，无需手动改 pixelRatio
  }

  debugInit() {
    this.debugFolder = this.debug.ui.addFolder({
      title: 'Fireflies',
      expanded: false,
    })

    this.debugFolder.addBinding(this.params, 'countPerCell', {
      label: 'Count / Cell',
      min: 5,
      max: 100,
      step: 5,
    }).on('change', () => this._rebuildAllCells())

    this.debugFolder.addBinding(this.params, 'cellSize', {
      label: 'Cell Size',
      min: 8,
      max: 64,
      step: 4,
    }).on('change', () => this._rebuildAllCells())

    this.debugFolder.addBinding(this.params, 'viewRadius', {
      label: 'View Radius',
      min: 1,
      max: 6,
      step: 1,
    }).on('change', () => this._rebuildAllCells())

    this.debugFolder.addBinding(this.params, 'spawnHeight', {
      label: 'Spawn Height',
      min: 2,
      max: 20,
      step: 1,
    }).on('change', () => this._rebuildAllCells())

    this.debugFolder.addBinding(this.params, 'size', {
      label: 'Size',
      min: 0.01,
      max: 0.5,
      step: 0.01,
    }).on('change', (ev) => {
      this.uSize.value = ev.value
    })

    this.debugFolder.addBinding(this.params, 'glowColor', {
      label: 'Glow Color',
      view: 'color',
    }).on('change', (ev) => {
      this.uGlowColor.value.set(ev.value)
    })
  }

  /**
   * Force rebuild all active cells (used for debug param changes)
   */
  _rebuildAllCells() {
    // Remove all existing cells
    for (const [key] of this._cells) {
      this._removeCell(key)
    }
    // Reset tracking to force reload
    this._lastPlayerCellX = null
    this._lastPlayerCellZ = null
  }

  destroy() {
    for (const [key] of this._cells) {
      this._removeCell(key)
    }
    this._cells.clear()
  }
}
