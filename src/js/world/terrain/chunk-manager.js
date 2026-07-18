/**
 * ChunkManager：管理多个 TerrainChunk，并提供"世界坐标 -> 方块查询"接口
 * Step1：仅实现固定 3×3 初始化与 getBlockWorld（用于玩家碰撞/贴地）
 */
import {
  CHUNK_BASIC_CONFIG,
  RENDER_PARAMS,
  TERRAIN_PARAMS,
  TREE_PARAMS,
  WATER_PARAMS,
} from '../../config/chunk-config.js'
import {
  isSupportedChunkViewDistance,
  STAGING_SLOT_COUNT,
} from '../../config/chunk-render-capacity.js'
import { SHADOW_CONFIG, shouldTerrainCastShadow } from '../../config/shadow-config.js'
import Experience from '../../experience.js'
import emitter from '../../utils/event/event-bus.js'
import IdleQueue from '../../utils/utils/idle-queue.js'
import BiomeGenerator from './biome-generator.js'
import { blocks, createStagedMaterialGeneration, resources } from './blocks-config.js'
import ChunkRenderCapacityError from './chunk-render-capacity-error.js'
import ChunkRenderSlotPool from './chunk-render-slot-pool.js'
import {
  diffChunkWindows,
  getChunkWindow,
  getInitialChunkWindowCenter,
  getNextChunkWindowCenter,
  isCurrentChunkAssignment,
} from './chunk-window.js'
import TerrainChunk from './terrain-chunk.js'
import TerrainPersistence from './terrain-persistence.js'

function markPerformance(name) {
  const performanceApi = globalThis.performance
  performanceApi?.clearMarks?.(name)
  performanceApi?.mark?.(name)
}

export default class ChunkManager {
  constructor(options = {}) {
    this.experience = new Experience()
    this.debug = this.experience.debug

    // 静态配置：仅从 chunk-config 读取，不再接受 options 覆盖
    this.chunkWidth = CHUNK_BASIC_CONFIG.chunkWidth
    this.chunkHeight = CHUNK_BASIC_CONFIG.chunkHeight
    this.viewDistance = CHUNK_BASIC_CONFIG.viewDistance
    this.unloadPadding = CHUNK_BASIC_CONFIG.unloadPadding

    // 运行时参数：仅 seed、terrain、trees 等由 options 传入
    this.seed = options.seed ?? CHUNK_BASIC_CONFIG.seed
    this.terrainParams = options.terrain ? { ...TERRAIN_PARAMS, ...options.terrain } : { ...TERRAIN_PARAMS }
    this.treeParams = options.trees ? { ...TREE_PARAMS, ...options.trees } : { ...TREE_PARAMS }
    this.renderParams = { ...RENDER_PARAMS }
    this.renderParams.chunkWidth = this.chunkWidth
    this.waterParams = options.water ? { ...WATER_PARAMS, ...options.water } : { ...WATER_PARAMS }
    this.biomeParams = {
      biomeSource: options.biomeSource ?? 'generator',
      forcedBiome: options.forcedBiome ?? 'plains',
    }

    // STEP 2: 共享的群系生成器（所有 chunk 共用，确保跨 chunk 群系连贯）
    this.biomeGenerator = new BiomeGenerator(this.seed)

    this._statsParams = {
      totalInstances: 0,
      chunkCount: 0,
      queueSize: 0,
    }

    /** @type {Map<string, TerrainChunk>} */
    this.chunks = new Map()

    /** @type {Map<string, import('./chunk-render-slot.js').default>} */
    this.activeSlots = new Map()
    this.renderSlotPool = new ChunkRenderSlotPool({
      resources: this.experience.resources,
      renderParams: this.renderParams,
      waterParams: this.waterParams,
      onCompileFailure: details => this._handleChunkRenderCompileFailure(details),
    })

    this.idleQueue = new IdleQueue()

    this._renderPoolReadyPromise = null
    this._renderSlotsReady = false
    this._transitionRunnerPromise = null
    this._transitionId = 0
    this._nextAssignmentId = 0
    this._activeCapacityRefreshes = new Map()
    this._latestRequestedCenter = null
    this._committedCenter = null
    this._targetWindow = new Set()
    this._destroyed = false
    this._hasWarnedUnsupportedViewDistance = false
    this._handleShadowQualityChanged = this._handleShadowQualityChanged.bind(this)
    emitter.on('shadow:quality-changed', this._handleShadowQualityChanged)

    this._lastPlayerChunkX = null
    this._lastPlayerChunkZ = null

    // 持久化管理器
    this.persistence = new TerrainPersistence({
      worldName: options.worldName || CHUNK_BASIC_CONFIG.worldName,
      useIndexedDB: options.useIndexedDB ?? CHUNK_BASIC_CONFIG.useIndexedDB,
    })

    // 自动保存：节流，避免频繁写入
    this._saveTimeout = null
    this._autoSaveDelay = CHUNK_BASIC_CONFIG.autoSaveDelay

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
    // Step2：初始化时先确保玩家附近一圈 chunk 存在并排队生成
    // 这里以 (0,0) 为中心（玩家初始通常在 chunk(0,0)）
    this.updateStreaming({ x: this.chunkWidth * 0.5, z: this.chunkWidth * 0.5 }, true)
    return this.initializeRenderPool()
  }

  initializeRenderPool() {
    if (!this._renderPoolReadyPromise) {
      this._renderPoolReadyPromise = this.experience.renderer.whenReady()
        .then(() => this.renderSlotPool.initialize(
          this.experience.renderer.instance,
          this.experience.scene,
          this.experience.camera.instance,
          () => this.experience.renderer.isDeviceReady(),
          // 预热必须走真实渲染管线：compileAsync 的 render context 与运行时不同，缓存不会命中
          () => this.experience.renderer.renderPipeline?.render(),
        ))
        .then(async () => {
          this._renderSlotsReady = true
          const initialCenter = getInitialChunkWindowCenter(this._latestRequestedCenter)
          await this._requestWindow(initialCenter.x, initialCenter.z, true)
        })
    }
    return this._renderPoolReadyPromise
  }

  whenRenderReady() {
    return this._renderPoolReadyPromise ?? Promise.resolve()
  }

  setViewDistance(value) {
    if (!isSupportedChunkViewDistance(value)) {
      if (!this._hasWarnedUnsupportedViewDistance) {
        console.warn(`[ChunkManager] render slot pool requires viewDistance=1; ignored ${value}`)
        this._hasWarnedUnsupportedViewDistance = true
      }
      return false
    }
    this.viewDistance = value
    return true
  }

  getRenderDiagnostics() {
    return this.renderSlotPool.getDiagnostics()
  }

  _handleChunkRenderCompileFailure({ context, error }) {
    const { chunkX, chunkZ } = context
    if (!Number.isInteger(chunkX) || !Number.isInteger(chunkZ))
      return

    emitter.emit('game:chunk-render-failed', {
      chunkX,
      chunkZ,
      reason: error.message,
    })
  }

  _getActiveBlockLayer(chunkKey) {
    return this.activeSlots.get(chunkKey)?.blockLayer ?? null
  }

  _handleShadowQualityChanged(payload) {
    const quality = typeof payload === 'string' ? payload : payload?.quality
    if (!quality)
      return

    SHADOW_CONFIG.quality = quality
    this.renderSlotPool.slots.forEach((slot) => {
      slot.blockLayer.getMeshes().forEach((mesh) => {
        mesh.castShadow = shouldTerrainCastShadow(quality, mesh.userData.blockId)
      })
    })
  }

  invalidateMaterialType(typeId = 'all') {
    const materialGeneration = createStagedMaterialGeneration(typeId, this.experience.resources.items)
    const generation = this.renderSlotPool.invalidateMaterialType(typeId, materialGeneration)
    if (typeof generation === 'number') {
      materialGeneration.dispose()
      return Promise.resolve(false)
    }

    return generation
  }

  _addBlockInstanceSafely(chunkKey, renderer, x, y, z) {
    try {
      renderer.addBlockInstance(x, y, z)
    }
    catch (error) {
      if (!(error instanceof ChunkRenderCapacityError))
        throw error
      this._queueActiveCapacityRefresh(chunkKey, error)
    }
  }

  _refreshActiveChunk(chunkKey) {
    const slot = this.activeSlots.get(chunkKey)
    const chunk = this.chunks.get(chunkKey)
    if (!slot || !chunk || slot.state !== 'active')
      return false

    slot.blockLayer.populate(chunk.container)
    slot.plantLayer.populate(chunk.generator?.plantData ?? chunk.plantData ?? [])
    slot._refreshWaterHeight()
    return true
  }

  _queueActiveCapacityRefresh(chunkKey, error) {
    if (this._activeCapacityRefreshes.has(chunkKey))
      return

    const activeSlot = this.activeSlots.get(chunkKey)
    if (!activeSlot)
      return

    const transitionId = this._transitionId
    const activeAssignmentId = activeSlot.assignmentId
    const guard = () => !this._destroyed
      && transitionId === this._transitionId
      && this.activeSlots.get(chunkKey) === activeSlot
      && activeSlot.assignmentId === activeAssignmentId

    const refresh = this._replaceActiveSlotWhenReady(chunkKey, activeSlot, error, guard)
      .catch((refreshError) => {
        if (!this._destroyed)
          console.error(`Failed to refresh active chunk ${chunkKey}:`, refreshError)
      })
      .finally(() => {
        if (this._activeCapacityRefreshes.get(chunkKey) === refresh)
          this._activeCapacityRefreshes.delete(chunkKey)
      })

    this._activeCapacityRefreshes.set(chunkKey, refresh)
  }

  async _replaceActiveSlotWhenReady(chunkKey, activeSlot, error, guard) {
    const chunk = this.chunks.get(chunkKey)
    if (!chunk || !guard())
      return false

    const stagingSlot = this.renderSlotPool.acquire()
    if (!stagingSlot)
      return this._expandActiveSlotInPlace(chunkKey, activeSlot, error, guard)

    const assignmentId = ++this._nextAssignmentId
    stagingSlot.assignmentId = assignmentId
    const isCurrent = () => guard() && stagingSlot.assignmentId === assignmentId
    let overflow = error
    let committed = false

    try {
      while (isCurrent()) {
        try {
          stagingSlot.populate(chunk, { assignInstanceIds: false })
          if (!isCurrent())
            return false

          stagingSlot.attach(chunk.chunkX, chunk.chunkZ)
          this.activeSlots.set(chunkKey, stagingSlot)
          activeSlot.reset()
          this.renderSlotPool.release(activeSlot)
          stagingSlot.syncInstanceMappings()
          committed = true
          this._updateStats()
          return true
        }
        catch (nextError) {
          if (!(nextError instanceof ChunkRenderCapacityError))
            throw nextError
          overflow = nextError
        }

        const expanded = await this.renderSlotPool.ensureCapacity(stagingSlot, overflow, isCurrent, {
          chunkX: chunk.chunkX,
          chunkZ: chunk.chunkZ,
        })
        if (!expanded)
          return false
      }
      return false
    }
    finally {
      if (!committed && stagingSlot.assignmentId === assignmentId)
        this._releaseStaleSlots([stagingSlot])
    }
  }

  async _expandActiveSlotInPlace(chunkKey, activeSlot, error, guard) {
    const [chunkX, chunkZ] = chunkKey.split(',').map(Number)
    let overflow = error
    while (guard()) {
      const expanded = await this.renderSlotPool.ensureCapacity(activeSlot, overflow, guard, { chunkX, chunkZ })
      if (!expanded || !guard())
        return false

      try {
        this._refreshActiveChunk(chunkKey)
        return true
      }
      catch (nextError) {
        if (!(nextError instanceof ChunkRenderCapacityError))
          throw nextError
        overflow = nextError
      }
    }
    return false
  }

  /**
   * Set world seed and regenerate all chunks
   * @param {number} newSeed - The new seed value
   */
  setSeed(newSeed) {
    return this.regenerateAll({ seed: newSeed, clearPersistence: false })
  }

  // ========================================
  // Public API for lightweight world regeneration
  // ========================================

  /**
   * Apply WorldGen params (field-by-field to preserve object references)
   * @param {object} params - { terrain, trees, water, biome }
   */
  applyWorldGenParams({ terrain, trees, water, biome } = {}) {
    // Apply terrain params
    if (terrain) {
      if (terrain.scale !== undefined)
        this.terrainParams.scale = terrain.scale
      if (terrain.magnitude !== undefined)
        this.terrainParams.magnitude = terrain.magnitude
      if (terrain.offset !== undefined)
        this.terrainParams.offset = terrain.offset
      if (terrain.fbm) {
        if (terrain.fbm.octaves !== undefined)
          this.terrainParams.fbm.octaves = terrain.fbm.octaves
        if (terrain.fbm.gain !== undefined)
          this.terrainParams.fbm.gain = terrain.fbm.gain
        if (terrain.fbm.lacunarity !== undefined)
          this.terrainParams.fbm.lacunarity = terrain.fbm.lacunarity
      }
    }

    // Apply tree params
    if (trees) {
      if (trees.minHeight !== undefined)
        this.treeParams.minHeight = trees.minHeight
      if (trees.maxHeight !== undefined)
        this.treeParams.maxHeight = trees.maxHeight
      if (trees.minRadius !== undefined)
        this.treeParams.minRadius = trees.minRadius
      if (trees.maxRadius !== undefined)
        this.treeParams.maxRadius = trees.maxRadius
      if (trees.frequency !== undefined)
        this.treeParams.frequency = trees.frequency
    }

    // Apply water params
    if (water) {
      if (water.waterOffset !== undefined)
        this.waterParams.waterOffset = water.waterOffset
    }

    // Apply biome params
    if (biome) {
      if (biome.biomeSource !== undefined)
        this.biomeParams.biomeSource = biome.biomeSource
      if (biome.forcedBiome !== undefined)
        this.biomeParams.forcedBiome = biome.forcedBiome
    }
  }

  /**
   * Lightweight world regeneration entry point
   * @param {object} options - { seed, terrain, trees, water, biome, centerPos, forceSyncCenterChunk, clearPersistence }
   */
  regenerateAll({
    seed,
    terrain,
    trees,
    water,
    biome,
    centerPos = { x: this.chunkWidth * 0.5, z: this.chunkWidth * 0.5 },
    forceSyncCenterChunk = true,
    clearPersistence = true,
  } = {}) {
    if (this._destroyed)
      return Promise.resolve({ seed: this.seed, dataReady: Promise.resolve(null) })

    this._invalidateTransitionState()
    this._releaseAllRenderSlots()

    this.chunks.forEach((chunk) => {
      chunk.dispose()
    })
    this.chunks.clear()
    this.biomeGenerator.clearAllCache()

    // (2) Update seed
    if (seed !== undefined) {
      this.seed = seed
      this.biomeGenerator.seed = seed
    }

    // (3) Apply worldgen params
    this.applyWorldGenParams({ terrain, trees, water, biome })

    // (3.5) Clear persistence data since it's a new world
    if (clearPersistence) {
      this.persistence.clearAll()
    }

    // (4) Force refresh streaming grid
    this._lastPlayerChunkX = null
    this._lastPlayerChunkZ = null

    // (5) Keep collision and respawn data independent from render prewarming.
    let currentChunk = null
    if (forceSyncCenterChunk) {
      const pcx = Math.floor(centerPos.x / this.chunkWidth)
      const pcz = Math.floor(centerPos.z / this.chunkWidth)
      currentChunk = this._ensureChunk(pcx, pcz)
      if (currentChunk.state === 'init') {
        currentChunk.generator.params.seed = this.seed
        currentChunk.generateData()
        this._applyChunkModifications(currentChunk)
      }
    }

    // (6) A fresh transition starts from the new data window without recreating the pool.
    const renderReady = this.updateStreaming(centerPos, true) ?? Promise.resolve()
    renderReady.dataReady = Promise.resolve(currentChunk)
    renderReady.seed = this.seed
    return renderReady
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

  // #region 世界坐标删除方块
  /**
   * 世界坐标删除方块
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  removeBlockWorld(x, y, z) {
    const chunkX = Math.floor(x / this.chunkWidth)
    const chunkZ = Math.floor(z / this.chunkWidth)
    const chunkKey = this._key(chunkX, chunkZ)
    const chunk = this.getChunk(chunkX, chunkZ)

    if (!chunk)
      return false

    const localX = Math.floor(x - chunkX * this.chunkWidth)
    const localZ = Math.floor(z - chunkZ * this.chunkWidth)

    // 1. 获取方块信息（包含 instanceId）
    const block = chunk.container.getBlock(localX, y, localZ)
    if (!block || block.id === blocks.empty.id)
      return false

    const blockId = block.id
    const instanceId = block.instanceId

    // 2. 更新数据层
    chunk.container.setBlockId(localX, y, localZ, blocks.empty.id)
    this.persistence.recordModification(x, y, z, blocks.empty.id, this.chunkWidth)
    this._scheduleSave()

    // 3. 更新渲染层
    const renderer = this._getActiveBlockLayer(chunkKey)
    if (renderer) {
      const mesh = renderer.getMesh(blockId)
      if (mesh) {
        renderer.removeInstance(mesh, instanceId)
      }

      // 4. 揭示邻居方块（原本被遮挡，现在可能变得可见）
      const neighbors = [
        { x: localX + 1, y, z: localZ },
        { x: localX - 1, y, z: localZ },
        { x: localX, y: y + 1, z: localZ },
        { x: localX, y: y - 1, z: localZ },
        { x: localX, y, z: localZ + 1 },
        { x: localX, y, z: localZ - 1 },
      ]

      for (const n of neighbors) {
        // 只有在 chunk 范围内的邻居才处理（跨 chunk 揭示暂不考虑，逻辑会变复杂）
        if (n.x >= 0 && n.x < this.chunkWidth && n.z >= 0 && n.z < this.chunkWidth && n.y >= 0 && n.y < this.chunkHeight) {
          const neighborBlock = chunk.container.getBlock(n.x, n.y, n.z)

          // 如果邻居非空、没有实例，且现在不再被遮挡
          if (neighborBlock.id !== blocks.empty.id && neighborBlock.instanceId === null) {
            if (!chunk.container.isBlockObscured(n.x, n.y, n.z)) {
              this._addBlockInstanceSafely(chunkKey, renderer, n.x, n.y, n.z)
            }
          }
        }
      }
    }

    // 记录修改（0 表示删除）

    return true
  }

  // #endregion

  // #region 世界坐标添加方块
  /**
   * 世界坐标添加方块
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} blockId
   */
  addBlockWorld(x, y, z, blockId) {
    const chunkX = Math.floor(x / this.chunkWidth)
    const chunkZ = Math.floor(z / this.chunkWidth)
    const chunkKey = this._key(chunkX, chunkZ)
    const chunk = this.getChunk(chunkX, chunkZ)

    if (!chunk)
      return false

    const localX = Math.floor(x - chunkX * this.chunkWidth)
    const localZ = Math.floor(z - chunkZ * this.chunkWidth)

    // 1. 检查目标位是否为空（防止重叠）
    const existing = chunk.container.getBlock(localX, y, localZ)
    if (existing.id !== blocks.empty.id)
      return false

    // 2. 更新数据层
    chunk.container.setBlockId(localX, y, localZ, blockId)
    this.persistence.recordModification(x, y, z, blockId, this.chunkWidth)
    this._scheduleSave()

    // 3. 更新渲染层
    const renderer = this._getActiveBlockLayer(chunkKey)
    if (renderer) {
      // 3a. 如果自身不被遮挡，添加实例
      if (!chunk.container.isBlockObscured(localX, y, localZ)) {
        this._addBlockInstanceSafely(chunkKey, renderer, localX, y, localZ)
      }

      // 3b. 隐藏现在被遮挡的邻居方块
      const neighbors = [
        { x: localX + 1, y, z: localZ },
        { x: localX - 1, y, z: localZ },
        { x: localX, y: y + 1, z: localZ },
        { x: localX, y: y - 1, z: localZ },
        { x: localX, y, z: localZ + 1 },
        { x: localX, y, z: localZ - 1 },
      ]

      for (const n of neighbors) {
        // 只处理 chunk 范围内的邻居
        if (n.x >= 0 && n.x < this.chunkWidth && n.z >= 0 && n.z < this.chunkWidth && n.y >= 0 && n.y < this.chunkHeight) {
          const neighborBlock = chunk.container.getBlock(n.x, n.y, n.z)

          // 如果邻居非空、有实例、且现在被完全遮挡
          if (neighborBlock.id !== blocks.empty.id && neighborBlock.instanceId !== null) {
            if (chunk.container.isBlockObscured(n.x, n.y, n.z)) {
              // 移除实例
              const mesh = renderer.getMesh(neighborBlock.id)
              if (mesh) {
                renderer.removeInstance(mesh, neighborBlock.instanceId)
              }
              // 清空 instanceId（关键：这样被挖掘后才能正确揭露）
              chunk.container.setBlockInstanceId(n.x, n.y, n.z, null)
            }
          }
        }
      }
    }

    // 记录修改

    return true
  }

  // #endregion

  // #region 获取某列 (worldX, worldZ) 的最高非空方块 y（找不到返回 null）
  /**
   * 获取某列 (worldX, worldZ) 的最高非空方块 y（找不到返回 null）
   * - 用于玩家重生点/贴地等
   */
  getTopSolidYWorld(worldX, worldZ) {
    const x = Math.floor(worldX)
    const z = Math.floor(worldZ)
    for (let y = this.chunkHeight - 1; y >= 0; y--) {
      const block = this.getBlockWorld(x, y, z)

      if (!block?.id || block.id === blocks.empty.id)
        continue

      // 排除所有树干和树叶类型
      const isTree
        = block.id === blocks.treeTrunk.id
          || block.id === blocks.treeLeaves.id
          || block.id === blocks.birchTrunk.id
          || block.id === blocks.birchLeaves.id
          || block.id === blocks.cherryTrunk.id
          || block.id === blocks.cherryLeaves.id

      if (!isTree) {
        return y
      }
    }
    return null
  }

  // #endregion

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
      sharedTreeParams: this.treeParams,
      sharedWaterParams: this.waterParams,
      sharedBiomeGenerator: this.biomeGenerator, // STEP 2: 共享群系生成器
      biomeSource: this.biomeParams.biomeSource,
      forcedBiome: this.biomeParams.forcedBiome,
    })

    this.chunks.set(key, chunk)

    // 标记需要应用修改（在生成后执行）
    chunk._pendingModifications = this.persistence.getChunkModifications(chunkX, chunkZ)

    return chunk
  }

  /**
   * Step2：动态 streaming 更新（每帧调用）
   * @param {{x:number,z:number}} playerPos 玩家脚底世界坐标（只取 x/z）
   * @param {boolean} force 是否强制刷新（初次/参数变更时）
   */
  updateStreaming(playerPos, force = false) {
    if (!playerPos)
      return

    const pcx = Math.floor(playerPos.x / this.chunkWidth)
    const pcz = Math.floor(playerPos.z / this.chunkWidth)

    if (!force && pcx === this._lastPlayerChunkX && pcz === this._lastPlayerChunkZ) {
      // 位置未跨 chunk：只需继续 pump 队列
      this._updateStats()
      return
    }

    this._lastPlayerChunkX = pcx
    this._lastPlayerChunkZ = pcz

    // 碰撞只依赖数据层，玩家当前 chunk 始终同步优先生成。
    const currentKey = this._key(pcx, pcz)
    const currentChunk = this._ensureChunk(pcx, pcz)
    if (currentChunk?.state === 'init') {
      currentChunk.generator.params.seed = this.seed
      currentChunk.generateData()
      this._applyChunkModifications(currentChunk)
      this.idleQueue.cancel(`${currentKey}:data`)
    }

    this._updateStats()
    return this._requestWindow(pcx, pcz)
  }

  /**
   * 每帧调用一次：驱动 requestIdleCallback 执行任务
   */
  pumpIdleQueue() {
    this._updateStats()
    this.idleQueue.pump()
  }

  // 新增：延迟保存（避免频繁写入）
  _scheduleSave() {
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout)
    }
    this._saveTimeout = setTimeout(() => {
      this.persistence.save()
    }, this._autoSaveDelay)
  }

  // 新增：应用 chunk 的修改记录
  _applyChunkModifications(chunk) {
    if (!chunk._pendingModifications || chunk._pendingModifications.size === 0) {
      return
    }

    for (const [blockKey, blockId] of chunk._pendingModifications.entries()) {
      const [localX, localY, localZ] = blockKey.split(',').map(Number)

      // 直接修改 container 数据（跳过渲染，稍后统一重建）
      chunk.container.setBlockId(localX, localY, localZ, blockId)
    }

    // 清除标记
    chunk._pendingModifications = null
  }

  _invalidateTransitionState() {
    this._transitionId++
    this._latestRequestedCenter = null
    this._committedCenter = null
    this._targetWindow = new Set()
    this._activeCapacityRefreshes.clear()
    this.renderSlotPool.slots.forEach((slot) => {
      slot.assignmentId = ++this._nextAssignmentId
    })

    // Replacing the queue lets obsolete awaited work settle through its stale guard
    // without allowing it to block the next reset transition.
    this.idleQueue = new IdleQueue()
    this._transitionRunnerPromise = null
  }

  _releaseAllRenderSlots() {
    this.activeSlots.clear()
    this.renderSlotPool.slots.forEach((slot) => {
      if (slot.state === 'active')
        slot.reset()
      this.renderSlotPool.release(slot)
    })
  }

  _requestWindow(centerX, centerZ) {
    if (this._destroyed)
      return Promise.resolve()

    this._latestRequestedCenter = { x: centerX, z: centerZ }
    this._transitionId++

    if (!this._renderSlotsReady)
      return this._transitionRunnerPromise ?? Promise.resolve()

    if (!this._transitionRunnerPromise) {
      const runner = this._runLatestTransition()
      const trackedRunner = runner.finally(() => {
        if (this._transitionRunnerPromise === trackedRunner)
          this._transitionRunnerPromise = null
      })
      this._transitionRunnerPromise = trackedRunner
    }
    return this._transitionRunnerPromise
  }

  async _runLatestTransition() {
    while (!this._destroyed && this._latestRequestedCenter) {
      const transitionId = this._transitionId
      const requestedCenter = { ...this._latestRequestedCenter }
      const center = this._getNextTransitionCenter(requestedCenter)
      const targetWindow = getChunkWindow(center.x, center.z)
      this._targetWindow = targetWindow

      const diff = diffChunkWindows(new Set(this.activeSlots.keys()), targetWindow)
      if (this.activeSlots.size > 0 && diff.incoming.size > STAGING_SLOT_COUNT)
        throw new Error(`Atomic chunk transition requires ${diff.incoming.size} staging slots`)

      const transitionStart = globalThis.performance?.now?.() ?? Date.now()
      markPerformance('chunk-transition:start')
      const incomingKeys = Array.from(diff.incoming).sort((left, right) => {
        const [leftX, leftZ] = left.split(',').map(Number)
        const [rightX, rightZ] = right.split(',').map(Number)
        const leftDistance = Math.max(Math.abs(leftX - center.x), Math.abs(leftZ - center.z))
        const rightDistance = Math.max(Math.abs(rightX - center.x), Math.abs(rightZ - center.z))
        return leftDistance - rightDistance
      })
      const stagedSlots = new Map()

      try {
        for (const chunkKey of incomingKeys) {
          if (transitionId !== this._transitionId)
            break

          const slot = await this._stageIncomingChunk(chunkKey, transitionId, center)
          if (!slot)
            break
          stagedSlots.set(chunkKey, slot)
        }
      }
      catch (error) {
        this._releaseStaleSlots(stagedSlots.values())
        if (error.chunkRenderUnavailable || error.chunkRenderContext)
          return
        throw error
      }

      const isCurrent = !this._destroyed
        && transitionId === this._transitionId
        && this._targetWindow === targetWindow
        && incomingKeys.every(chunkKey => stagedSlots.has(chunkKey))

      if (!isCurrent) {
        this._releaseStaleSlots(stagedSlots.values())
        continue
      }

      markPerformance('chunk-transition:data-ready')
      markPerformance('chunk-transition:populate-ready')

      this._commitTransition({
        center,
        diff,
        stagedSlots,
        targetWindow,
        transitionStart,
      })

      if (
        transitionId === this._transitionId
        && center.x === requestedCenter.x
        && center.z === requestedCenter.z
      ) {
        return
      }
    }
  }

  _getNextTransitionCenter(requestedCenter) {
    return getNextChunkWindowCenter(this._committedCenter, requestedCenter)
  }

  async _stageIncomingChunk(chunkKey, transitionId, center) {
    const [chunkX, chunkZ] = chunkKey.split(',').map(Number)
    const chunk = this._ensureChunk(chunkX, chunkZ)
    const slot = this.renderSlotPool.acquire()
    if (!slot)
      throw new Error(`No staging render slot available for chunk ${chunkKey}`)

    const assignmentId = ++this._nextAssignmentId
    slot.assignmentId = assignmentId
    const isCurrent = () => isCurrentChunkAssignment({
      assignmentId,
      chunkKey,
      currentTransitionId: this._transitionId,
      destroyed: this._destroyed,
      slot,
      targetWindow: this._targetWindow,
      transitionId,
    })
    const priority = Math.max(Math.abs(chunkX - center.x), Math.abs(chunkZ - center.z))
    const releaseSlot = () => {
      if (slot.assignmentId === assignmentId)
        this._releaseStaleSlots([slot])
    }

    try {
      while (isCurrent()) {
        try {
          const populated = await new Promise((resolve, reject) => {
            this.idleQueue.enqueue(`transition:${transitionId}:${chunkKey}`, () => {
              try {
                if (!isCurrent()) {
                  resolve(false)
                  return
                }

                if (chunk.state === 'init') {
                  chunk.generator.params.seed = this.seed
                  chunk.generateData()
                  this._applyChunkModifications(chunk)
                }
                if (!isCurrent()) {
                  resolve(false)
                  return
                }

                slot.populate(chunk)
                resolve(true)
              }
              catch (error) {
                reject(error)
              }
            }, priority)
            this.idleQueue.pump()
          })

          if (!populated || !isCurrent()) {
            releaseSlot()
            return null
          }
          return slot
        }
        catch (error) {
          if (!(error instanceof ChunkRenderCapacityError))
            throw error
          if (!isCurrent()) {
            releaseSlot()
            return null
          }

          const expanded = await this.renderSlotPool.ensureCapacity(slot, error, isCurrent, { chunkX, chunkZ })
          if (!expanded || !isCurrent()) {
            releaseSlot()
            return null
          }
        }
      }

      releaseSlot()
      return null
    }
    catch (error) {
      releaseSlot()
      throw error
    }
  }

  _commitTransition({ center, diff, stagedSlots, targetWindow, transitionStart }) {
    const previousActiveSlots = this.activeSlots
    const nextActiveSlots = new Map()
    targetWindow.forEach((chunkKey) => {
      const slot = previousActiveSlots.get(chunkKey) ?? stagedSlots.get(chunkKey)
      if (!slot)
        throw new Error(`Cannot commit incomplete chunk render window: ${chunkKey}`)
      nextActiveSlots.set(chunkKey, slot)
    })

    diff.incoming.forEach((chunkKey) => {
      const [chunkX, chunkZ] = chunkKey.split(',').map(Number)
      stagedSlots.get(chunkKey).attach(chunkX, chunkZ)
    })

    this.activeSlots = nextActiveSlots
    diff.outgoing.forEach((chunkKey) => {
      const slot = previousActiveSlots.get(chunkKey)
      slot.reset()
      this.renderSlotPool.release(slot)
    })
    this._committedCenter = { ...center }
    markPerformance('chunk-transition:commit')

    const transitionEnd = globalThis.performance?.now?.() ?? Date.now()
    this.renderSlotPool.lastTransitionMs = transitionEnd - transitionStart
    diff.incoming.forEach((chunkKey) => {
      const [chunkX, chunkZ] = chunkKey.split(',').map(Number)
      emitter.emit('game:chunk-built', { chunkX, chunkZ })
    })

    this._pruneDataChunks(center)
    this._updateStats()
  }

  _releaseStaleSlots(slots) {
    new Set(slots).forEach((slot) => {
      if (!slot || slot.state === 'active' || slot.state === 'failed')
        return
      slot.assignmentId = ++this._nextAssignmentId
      this.renderSlotPool.release(slot)
    })
  }

  _pruneDataChunks(center) {
    const unloadDistance = this.viewDistance + this.unloadPadding
    this.chunks.forEach((chunk, chunkKey) => {
      if (
        !this.activeSlots.has(chunkKey)
        && (Math.abs(chunk.chunkX - center.x) > unloadDistance || Math.abs(chunk.chunkZ - center.z) > unloadDistance)
      ) {
        chunk.dispose()
        this.chunks.delete(chunkKey)
      }
    })
  }

  // #region 调试面板
  /**
   * 统一控制面板（所有 chunk 共用）
   */
  debugInit() {
    this.debugFolder = this.debug.ui.addFolder({
      title: 'Chunk 地形',
      expanded: false,
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
      // 槽位身份固定，缩放同时写入活动与空闲槽位。
      this.renderSlotPool.slots.forEach(slot => slot.group.scale.setScalar(this.renderParams.scale))
    })

    renderFolder.addBinding(this.renderParams, 'heightScale', {
      label: '高度缩放',
      min: 0.5,
      max: 5,
      step: 0.1,
    }).on('change', () => {
      // 需要重建所有 chunk 的 instanceMatrix
      this._rebuildAllChunks()
      // 同步刷新所有 chunk 的水面高度
      this._refreshAllWater()
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

    statsFolder.addBinding(this._statsParams, 'chunkCount', {
      label: 'Chunk 数量',
      readonly: true,
    })
    statsFolder.addBinding(this._statsParams, 'queueSize', {
      label: '队列长度',
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
      max: 300,
      step: 1,
    }).on('change', () => this._regenerateAllChunks())

    genFolder.addBinding(this.terrainParams, 'magnitude', {
      label: '地形振幅',
      min: 0,
      max: 32,
      step: 1,
    }).on('change', () => this._regenerateAllChunks())

    genFolder.addBinding(this.terrainParams, 'offset', {
      label: '地形偏移',
      // offset 为"高度偏移（方块层数）"
      min: 0,
      max: this.chunkHeight,
      step: 1,
    }).on('change', () => this._regenerateAllChunks())

    // ===== fBm 参数（全局）=====
    const fbmFolder = genFolder.addFolder({
      title: 'fBm 参数（全局）',
      expanded: true,
    })

    fbmFolder.addBinding(this.terrainParams.fbm, 'octaves', {
      label: '八度数',
      min: 1,
      max: 8,
      step: 1,
    }).on('change', () => this._regenerateAllChunks())

    fbmFolder.addBinding(this.terrainParams.fbm, 'gain', {
      label: '振幅衰减',
      min: 0.1,
      max: 1.0,
      step: 0.05,
    }).on('change', () => this._regenerateAllChunks())

    fbmFolder.addBinding(this.terrainParams.fbm, 'lacunarity', {
      label: '频率倍增',
      min: 1.5,
      max: 3.0,
      step: 0.1,
    }).on('change', () => this._regenerateAllChunks())

    // ===== 水面参数（全局）=====
    const waterFolder = genFolder.addFolder({
      title: '水面参数（全局）',
      expanded: true,
    })

    waterFolder.addBinding(this.waterParams, 'waterOffset', {
      label: '水面层数',
      min: 0,
      max: this.chunkHeight - 1,
      step: 1,
    }).on('change', () => {
      // 水面高度变化需要：重新生成沙滩 + 刷新水面位置
      this._regenerateAllChunks()
      this._refreshAllWater()
    })

    waterFolder.addBinding(this.waterParams, 'flowSpeedX', {
      label: '水流速度 X',
      min: -0.2,
      max: 0.2,
      step: 0.001,
    })

    waterFolder.addBinding(this.waterParams, 'flowSpeedY', {
      label: '水流速度 Y',
      min: -0.2,
      max: 0.2,
      step: 0.001,
    })

    // ===== 树参数（全局）=====
    const treeFolder = genFolder.addFolder({
      title: '树参数（全局）',
      expanded: false,
    })

    treeFolder.addBinding(this.treeParams, 'minHeight', {
      label: '树干最小高度',
      min: 1,
      max: 32,
      step: 1,
    }).on('change', () => this._regenerateAllChunks())

    treeFolder.addBinding(this.treeParams, 'maxHeight', {
      label: '树干最大高度',
      min: 1,
      max: 32,
      step: 1,
    }).on('change', () => this._regenerateAllChunks())

    treeFolder.addBinding(this.treeParams, 'minRadius', {
      label: '树叶最小半径',
      min: 1,
      max: 12,
      step: 1,
    }).on('change', () => this._regenerateAllChunks())

    treeFolder.addBinding(this.treeParams, 'maxRadius', {
      label: '树叶最大半径',
      min: 1,
      max: 12,
      step: 1,
    }).on('change', () => this._regenerateAllChunks())

    treeFolder.addBinding(this.treeParams, 'frequency', {
      label: '树密度',
      min: 0,
      max: 1,
      step: 0.01,
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

    // ===== 群系参数（全局）=====
    const biomeFolder = this.debugFolder.addFolder({
      title: '群系系统（全局）',
      expanded: true,
    })

    biomeFolder.addBinding(this.biomeParams, 'biomeSource', {
      label: '群系来源',
      options: {
        调试面板: 'panel',
        自动生成: 'generator',
      },
    }).on('change', () => {
      // 切换模式时重新生成所有 chunk
      this._regenerateAllChunks()
    })

    biomeFolder.addBinding(this.biomeParams, 'forcedBiome', {
      label: '强制群系',
      options: {
        平原: 'plains',
        森林: 'forest',
        白桦木林: 'birchForest',
        樱花树林: 'cherryForest',
        沙漠: 'desert',
        恶地: 'badlands',
        冻洋: 'frozenOcean',
      },
    }).on('change', () => {
      // 仅在 panel 模式下重新生成
      if (this.biomeParams.biomeSource === 'panel') {
        this._regenerateAllChunks()
      }
    })

    // STEP 2: BiomeGenerator 参数控制（仅在 generator 模式下生效）
    const biomeGenFolder = biomeFolder.addFolder({
      title: '生成器参数',
      expanded: false,
    })

    biomeGenFolder.addBinding(this.biomeGenerator, 'tempScale', {
      label: '温度噪声缩放',
      min: 20,
      max: 300,
      step: 5,
    }).on('change', () => {
      if (this.biomeParams.biomeSource === 'generator') {
        this.biomeGenerator.clearAllCache()
        this._regenerateAllChunks()
      }
    })

    biomeGenFolder.addBinding(this.biomeGenerator, 'humidityScale', {
      label: '湿度噪声缩放',
      min: 20,
      max: 300,
      step: 5,
    }).on('change', () => {
      if (this.biomeParams.biomeSource === 'generator') {
        this.biomeGenerator.clearAllCache()
        this._regenerateAllChunks()
      }
    })

    biomeGenFolder.addBinding(this.biomeGenerator, 'transitionThreshold', {
      label: '过渡阈值',
      min: 0.05,
      max: 0.5,
      step: 0.01,
    }).on('change', () => {
      if (this.biomeParams.biomeSource === 'generator') {
        this.biomeGenerator.clearAllCache()
        this._regenerateAllChunks()
      }
    })

    // ===== Streaming 参数 =====
    const streamingFolder = this.debugFolder.addFolder({
      title: 'Streaming 参数',
      expanded: false,
    })
    streamingFolder.addBinding(this, 'viewDistance', {
      label: '加载半径(d)',
      min: 1,
      max: 1,
      step: 1,
      readonly: true,
    })
    streamingFolder.addBinding(this, 'unloadPadding', {
      label: '卸载滞后(+)',
      min: 0,
      max: 3,
      step: 1,
    }).on('change', () => {
      this._lastPlayerChunkX = null
      this._lastPlayerChunkZ = null
    })

    const persistFolder = this.debugFolder.addFolder({
      title: '持久化 (Persistence)',
      expanded: false,
    })

    const stats = this.persistence.getStats()
    const statsParams = {
      chunkCount: stats.chunkCount,
      totalMods: stats.totalModifications,
    }

    persistFolder.addBinding(statsParams, 'chunkCount', {
      label: '已修改 chunk 数',
      readonly: true,
    })

    persistFolder.addBinding(statsParams, 'totalMods', {
      label: '总修改数',
      readonly: true,
    })

    persistFolder.addButton({ title: '💾 手动保存' }).on('click', () => {
      this.persistence.save()
      const newStats = this.persistence.getStats()
      statsParams.chunkCount = newStats.chunkCount
      statsParams.totalMods = newStats.totalModifications
    })

    persistFolder.addButton({ title: '🔄 重新加载' }).on('click', () => {
      this.persistence.load()
      this._regenerateAllChunks()
    })

    persistFolder.addButton({ title: '🗑️ 清除所有修改' }).on('click', () => {
      // eslint-disable-next-line no-alert
      if (confirm('确定要清除所有玩家修改吗？此操作不可恢复！')) {
        this.persistence.modifications.clear()
        this.persistence.save()
        this._regenerateAllChunks()
      }
    })
  }

  // #endregion

  /**
   * 重建所有 chunk 的渲染层（基础参数如 scale/heightScale 变更）
   */
  _rebuildAllChunks() {
    this.activeSlots.forEach((_, chunkKey) => {
      try {
        this._refreshActiveChunk(chunkKey)
      }
      catch (error) {
        if (!(error instanceof ChunkRenderCapacityError))
          throw error
        this._queueActiveCapacityRefresh(chunkKey, error)
      }
    })
    // Keep the committed window intact while the fixed pool may be fully staged.
    // 当前固定池可能已被 transition 占满；保留现有完整窗口，等待后续窗口过渡重填。
    this._updateStats()
  }

  /**
   * 刷新所有 chunk 的水面高度（用于 waterOffset 或 heightScale 变更）
   */
  _refreshAllWater() {
    this.activeSlots.forEach((slot) => {
      slot._refreshWaterHeight()
    })
    // Do not replace committed slots in place: a failed fill must retain the prior window.
    // 与重建一致：不在已提交窗口中原地替换槽位，避免填充失败破坏原子完整性。
  }

  /**
   * 更新全局统计信息
   */
  _updateStats() {
    let total = 0
    this.activeSlots.forEach((slot) => {
      slot.getRenderObjects().forEach((object) => {
        total += object.isInstancedMesh ? object.count : 0
      })
    })
    this._statsParams.totalInstances = total
    this._statsParams.chunkCount = this.chunks.size
    this._statsParams.queueSize = this.idleQueue?.size?.() ?? 0
    if (this._statsBinding?.refresh)
      this._statsBinding.refresh()
  }

  /**
   * 每帧更新：遍历所有 chunk 更新动画材质
   */
  update() {
    // 更新水面贴图偏移，实现流动效果
    const waterTexture = this.experience.resources.items.water_Texture
    if (waterTexture) {
      const delta = this.experience.time.delta * 0.001 // 转换为秒
      waterTexture.offset.x += this.waterParams.flowSpeedX * delta
      waterTexture.offset.y += this.waterParams.flowSpeedY * delta
    }

    this.renderSlotPool.update(this.experience.time.elapsed * 0.001)
  }

  /**
   * 全量重新生成所有 chunk（用于生成参数变更：种子/群系）
   */
  _regenerateAllChunks() {
    // STEP 2: 清除群系缓存（确保使用新参数重新计算）
    this.biomeGenerator.clearAllCache()

    const params = {
      seed: this.seed,
      biomeSource: this.biomeParams.biomeSource,
      forcedBiome: this.biomeParams.forcedBiome,
    }

    this.chunks.forEach((chunk) => {
      // 确保每个 chunk 的 generator 使用共享的 biomeGenerator
      chunk.generator.biomeGenerator = this.biomeGenerator
      chunk.regenerate(params)
      chunk._pendingModifications = this.persistence.getChunkModifications(chunk.chunkX, chunk.chunkZ)
      this._applyChunkModifications(chunk)
    })

    this._rebuildAllChunks()
  }

  destroy() {
    this._destroyed = true
    this._invalidateTransitionState()
    emitter.off('shadow:quality-changed', this._handleShadowQualityChanged)

    // Cancel pending save
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout)
      this._saveTimeout = null
    }

    // Clear idle queue
    if (this.idleQueue) {
      this.idleQueue.clear?.()
    }

    // Dispose all chunks
    this.chunks.forEach((chunk) => {
      chunk.dispose()
    })
    this.chunks.clear()
    this.activeSlots.clear()
    this.renderSlotPool.dispose()
  }
}
