/**
 * Fireflies - Night-time pixel-style firefly particle system (chunk-based)
 *
 * Phase 1 PoC 临时妥协：ShaderMaterial 在 WebGPU 不可用，
 * 降级为 PointsMaterial（无呼吸动画 / 自定义尺寸衰减）。
 * TODO(Phase 3): PointsNodeMaterial + TSL。
 */
import * as THREE from 'three'
import Experience from '../../experience.js'

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

    // Cell map: "cx,cz" -> { points, geometry }
    this._cells = new Map()
    this._lastPlayerCellX = null
    this._lastPlayerCellZ = null

    // Shared material (all cells use the same shader)
    this._createMaterial()

    if (this.debug.active) {
      this.debugInit()
    }
  }

  // ===== Material (shared across all cells) =====

  _createMaterial() {
    this.material = new THREE.PointsMaterial({
      color: this.params.glowColor,
      size: this.params.size,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
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
   * Create a cell's Points mesh at grid position (cx, cz)
   */
  _createCell(cx, cz) {
    const { countPerCell, cellSize, spawnHeight } = this.params

    // Deterministic seed from cell coordinates
    const cellSeed = ((cx * 73856093) ^ (cz * 19349663)) & 0x7FFFFFFF
    const rand = this._seededRandom(cellSeed || 1)

    const geometry = new THREE.BufferGeometry()
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

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1))

    const points = new THREE.Points(geometry, this.material)
    points.frustumCulled = false

    this.scene.add(points)
    this._cells.set(this._cellKey(cx, cz), { points, geometry })
  }

  /**
   * Remove a cell and dispose its resources
   */
  _removeCell(key) {
    const cell = this._cells.get(key)
    if (!cell)
      return

    this.scene.remove(cell.points)
    cell.geometry.dispose()
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
    if (!this.material)
      return

    this.material.opacity = this._getNightFactor()
    this.material.visible = this.material.opacity > 0.01

    const player = this.experience.world?.player
    if (player) {
      this._updateStreaming(player.getPosition())
    }
  }

  resize() {
    // PointsMaterial 无需按 pixelRatio 更新 uniform
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
      this.material.size = ev.value
    })

    this.debugFolder.addBinding(this.params, 'glowColor', {
      label: 'Glow Color',
      view: 'color',
    }).on('change', (ev) => {
      this.material.color.set(ev.value)
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
    this.material?.dispose()
    this.material = null
  }
}
