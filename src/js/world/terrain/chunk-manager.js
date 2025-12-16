/**
 * ChunkManager：管理多个 TerrainChunk，并提供“世界坐标 -> 方块查询”接口
 * Step1：仅实现固定 3×3 初始化与 getBlockWorld（用于玩家碰撞/贴地）
 */
import Experience from '../../experience.js'
import { blocks, resources } from './blocks-config.js'
import TerrainChunk from './terrain-chunk.js'

export default class ChunkManager {
  constructor(options = {}) {
    this.experience = new Experience()
    this.debug = this.experience.debug

    this.chunkWidth = options.chunkWidth ?? 64
    this.chunkHeight = options.chunkHeight ?? 32
    this.viewDistance = options.viewDistance ?? 1
    this.seed = options.seed ?? 1337

    // 所有 chunk 共用的地形生成参数（统一由一个 panel 控制）
    // 注意：terrain 参数会直接影响噪声采样，变更后必须全量 regenerate
    this.terrainParams = options.terrain || {
      scale: 35,
      magnitude: 0.17,
      // offset 为“高度偏移（方块层数）”，默认放在中间偏下更像平原
      offset: 16,
    }

    // 所有 chunk 共用的渲染参数（统一由一个 panel 控制）
    this.renderParams = {
      scale: 1,
      heightScale: 1,
      showOresOnly: false,
    }

    this._statsParams = {
      totalInstances: 0,
    }

    /** @type {Map<string, TerrainChunk>} */
    this.chunks = new Map()

    if (this.debug.active) {
      this.debugInit()
    }
  }

  _key(chunkX, chunkZ) {
    return `${chunkX},${chunkZ}`
  }

  /**
   * Step1：初始化 3×3（viewDistance=1）chunk 网格
   */
  initInitialGrid() {
    const d = this.viewDistance
    for (let cz = -d; cz <= d; cz++) {
      for (let cx = -d; cx <= d; cx++) {
        this._ensureChunk(cx, cz)
      }
    }

    // 初始化后刷新一次统计
    this._updateStats()
  }

  /**
   * 获取 chunk（不存在则返回 null）
   */
  getChunk(chunkX, chunkZ) {
    return this.chunks.get(this._key(chunkX, chunkZ)) || null
  }

  /**
   * 世界坐标找到 chunk（注意 worldX/worldZ 为连续值）
   */
  getChunkAtWorld(worldX, worldZ) {
    const chunkX = Math.floor(worldX / this.chunkWidth)
    const chunkZ = Math.floor(worldZ / this.chunkWidth)
    return this.getChunk(chunkX, chunkZ)
  }

  /**
   * 世界坐标查询方块
   * - 这里的 x/y/z 约定为“方块中心的整数坐标”，与碰撞系统一致
   * - 若 chunk 未生成/不存在，返回 empty
   */
  getBlockWorld(x, y, z) {
    const chunkX = Math.floor(x / this.chunkWidth)
    const chunkZ = Math.floor(z / this.chunkWidth)
    const chunk = this.getChunk(chunkX, chunkZ)
    if (!chunk) {
      return { id: blocks.empty.id, instanceId: null }
    }

    // 转换为 chunk 内局部坐标（确保落在 0..chunkWidth-1）
    const localX = Math.floor(x - chunkX * this.chunkWidth)
    const localZ = Math.floor(z - chunkZ * this.chunkWidth)
    return chunk.container.getBlock(localX, y, localZ)
  }

  /**
   * 获取某列 (worldX, worldZ) 的最高非空方块 y（找不到返回 null）
   * - 用于玩家重生点/贴地等
   */
  getTopSolidYWorld(worldX, worldZ) {
    const x = Math.floor(worldX)
    const z = Math.floor(worldZ)
    for (let y = this.chunkHeight - 1; y >= 0; y--) {
      const block = this.getBlockWorld(x, y, z)
      if (block?.id && block.id !== blocks.empty.id) {
        return y
      }
    }
    return null
  }

  /**
   * 确保 chunk 存在（不存在则创建）
   */
  _ensureChunk(chunkX, chunkZ) {
    const key = this._key(chunkX, chunkZ)
    if (this.chunks.has(key)) {
      return this.chunks.get(key)
    }

    const chunk = new TerrainChunk({
      chunkX,
      chunkZ,
      chunkWidth: this.chunkWidth,
      chunkHeight: this.chunkHeight,
      seed: this.seed,
      terrain: this.terrainParams,
      sharedTerrainParams: this.terrainParams,
      sharedRenderParams: this.renderParams,
    })

    this.chunks.set(key, chunk)
    return chunk
  }

  /**
   * 统一控制面板（所有 chunk 共用）
   */
  debugInit() {
    this.debugFolder = this.debug.ui.addFolder({
      title: 'Chunk 地形',
      expanded: true,
    })

    const renderFolder = this.debugFolder.addFolder({
      title: '渲染参数（全局）',
      expanded: true,
    })

    renderFolder.addBinding(this.renderParams, 'scale', {
      label: '整体缩放',
      min: 0.1,
      max: 3,
      step: 0.1,
    }).on('change', () => {
      // 直接同步所有 chunk 的 group 缩放
      this.chunks.forEach((chunk) => {
        chunk.renderer?.group?.scale?.setScalar?.(this.renderParams.scale)
      })
    })

    renderFolder.addBinding(this.renderParams, 'heightScale', {
      label: '高度缩放',
      min: 0.5,
      max: 5,
      step: 0.1,
    }).on('change', () => {
      // 需要重建所有 chunk 的 instanceMatrix
      this._rebuildAllChunks()
    })

    renderFolder.addBinding(this.renderParams, 'showOresOnly', {
      label: '仅显示矿产',
    }).on('change', () => {
      this._rebuildAllChunks()
    })

    const statsFolder = this.debugFolder.addFolder({
      title: '统计信息（全局）',
      expanded: false,
    })
    this._statsBinding = statsFolder.addBinding(this._statsParams, 'totalInstances', {
      label: '实例总数',
      readonly: true,
    })

    // ===== 生成器参数（全局）=====
    const genFolder = this.debugFolder.addFolder({
      title: '生成参数（全局）',
      expanded: false,
    })

    genFolder.addBinding(this, 'seed', {
      label: 'Seed',
      min: 0,
      max: 1e9,
      step: 1,
    }).on('change', () => {
      this._regenerateAllChunks()
    })

    genFolder.addBinding(this.terrainParams, 'scale', {
      label: '地形缩放',
      min: 5,
      max: 120,
      step: 1,
    }).on('change', () => this._regenerateAllChunks())

    genFolder.addBinding(this.terrainParams, 'magnitude', {
      label: '地形振幅',
      min: 0,
      max: 1,
      step: 0.01,
    }).on('change', () => this._regenerateAllChunks())

    genFolder.addBinding(this.terrainParams, 'offset', {
      label: '地形偏移',
      // offset 为“高度偏移（方块层数）”
      min: 0,
      max: this.chunkHeight,
      step: 1,
    }).on('change', () => this._regenerateAllChunks())

    const oresFolder = genFolder.addFolder({
      title: '矿物缩放（全局）',
      expanded: false,
    })

    resources.forEach((res) => {
      res.scale = res.scale || { x: 20, y: 20, z: 20 }
      const oreFolder = oresFolder.addFolder({
        title: `矿物-${res.name}`,
        expanded: false,
      })
      oreFolder.addBinding(res.scale, 'x', {
        label: 'X 噪声缩放',
        min: 5,
        max: 120,
        step: 1,
      }).on('change', () => this._regenerateAllChunks())

      oreFolder.addBinding(res.scale, 'z', {
        label: 'Z 噪声缩放',
        min: 5,
        max: 120,
        step: 1,
      }).on('change', () => this._regenerateAllChunks())
    })

    genFolder.addButton({
      title: '🔄 重新生成（随机 Seed）',
    }).on('click', () => {
      this.seed = Math.floor(Math.random() * 1e9)
      this._regenerateAllChunks()
    })
  }

  /**
   * 重建所有 chunk（用于全局参数变更）
   */
  _rebuildAllChunks() {
    this.chunks.forEach((chunk) => {
      chunk.renderer?._rebuildFromContainer?.()
      // 保险起见同步一次 scale
      chunk.renderer?.group?.scale?.setScalar?.(this.renderParams.scale)
    })
    this._updateStats()
  }

  /**
   * 更新全局统计信息
   */
  _updateStats() {
    let total = 0
    this.chunks.forEach((chunk) => {
      const count = chunk.renderer?._statsParams?.totalInstances ?? 0
      total += count
    })
    this._statsParams.totalInstances = total
    if (this._statsBinding?.refresh)
      this._statsBinding.refresh()
  }

  /**
   * 全量重新生成所有 chunk（用于生成参数变更）
   * - 重新生成 container 数据
   * - 重建 renderer 的 InstancedMesh
   */
  _regenerateAllChunks() {
    this.chunks.forEach((chunk) => {
      if (!chunk?.generator || !chunk?.renderer)
        return

      // 同步 seed（确保所有 chunk 使用一致的随机序列）
      chunk.generator.params.seed = this.seed

      // 重新生成数据（不会广播 terrain:data-ready）
      chunk.generator.generate()

      // 重建 mesh
      chunk.renderer._rebuildFromContainer()
      chunk.renderer.group.scale.setScalar(this.renderParams.scale)
    })

    this._updateStats()
  }
}
