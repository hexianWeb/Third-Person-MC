/**
 * 地形生成器
 * - 基于 Simplex 噪声生成地形高度，填充草/土/石层
 * - 使用 Simplex 3D 噪声生成矿产（石头、煤矿、铁矿）
 * - 生成完成后通过 mitt 事件总线广播 terrain:data-ready
 */
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js'
import Experience from '../../experience.js'
import { RNG } from '../../tools/rng.js'
import emitter from '../../utils/event/event-bus.js'
import { computeAllBlocksAO } from './ao-calculator.js'
import { getBiomeConfig } from './biome-config.js'
import BiomeGenerator from './biome-generator.js'
import { BLOCK_IDS, blocks, resources } from './blocks-config.js'
import { getFloraSpawnDensity } from './flora-density.js'
import {
  buildTerrainBiomeField,
  getCategoricalBiomeBlocks,
} from './terrain-biome-field.js'
import TerrainContainer from './terrain-container.js'

export default class TerrainGenerator {
  constructor(options = {}) {
    this.experience = new Experience()
    this.debug = this.experience.debug

    // 尺寸与容器（保持单例）
    const size = options.size || { width: 32, height: 32 }
    this.container = options.container || new TerrainContainer(size)

    // 世界偏移（用于 chunk 无缝拼接）
    // 约定：originX/originZ 为当前 chunk 的“左下角世界坐标”
    this.origin = {
      x: options.originX ?? 0,
      z: options.originZ ?? 0,
    }

    // 是否广播 terrain:data-ready（多 chunk 场景必须关掉，避免互相覆盖）
    this.broadcast = options.broadcast ?? true

    // 是否启用调试面板（chunk 场景必须关掉，避免面板爆炸）
    this._debugEnabled = options.debugEnabled ?? true
    this._debugTitle = options.debugTitle || '地形生成器'

    // 参数配置（可调节）
    this.params = {
      seed: options.seed ?? Date.now(),
      sizeWidth: size.width,
      sizeHeight: size.height,
      soilDepth: options.soilDepth ?? 3, // 默认土层深度
      // 支持共享 terrain params：多个 chunk 共用同一份参数对象
      terrain: options.sharedTerrainParams || {
        scale: options.terrain?.scale ?? 35, // 噪声缩放（越大越平滑）
        magnitude: options.terrain?.magnitude ?? 16, // 振幅 (0-32)
        offset: options.terrain?.offset ?? 0.5, // 基准偏移
        // fBm 参数
        fbm: {
          octaves: options.terrain?.fbm?.octaves ?? 5, // 八度数，叠加的噪声层数
          gain: options.terrain?.fbm?.gain ?? 0.5, // 振幅衰减系数（persistence）
          lacunarity: options.terrain?.fbm?.lacunarity ?? 2.0, // 频率倍增系数
        },
        // 裸岩暴露参数
        rockExpose: {
          maxDepth: options.terrain?.rockExpose?.maxDepth ?? 2, // 距离地表多少层内允许裸岩
          slopeThreshold: options.terrain?.rockExpose?.slopeThreshold ?? 2, // 邻居高度差阈值
        },
      },
      // 树参数：支持共享对象（chunk 场景下由 ChunkManager 统一控制）
      trees: options.sharedTreeParams || {
        // 树干高度范围
        minHeight: options.trees?.minHeight ?? 3,
        maxHeight: options.trees?.maxHeight ?? 6,
        // 树叶半径范围（球形/近似球形树冠）
        minRadius: options.trees?.minRadius ?? 2,
        maxRadius: options.trees?.maxRadius ?? 4,
        // 密度：0..1，越大树越多（同时受噪声影响呈现"成片"）
        frequency: options.trees?.frequency ?? 0.02,
        // 树冠稀疏度 (0 为最密，1 为最稀)
        canopyDensity: options.trees?.canopyDensity ?? 0.5,
      },
      // 水参数：支持共享对象（chunk 场景下由 ChunkManager 统一控制）
      water: options.sharedWaterParams || {
        // 水面层数（水平面高度 = waterOffset * heightScale）
        waterOffset: options.water?.waterOffset ?? 8,
      },
    }

    // 内部状态
    this.heightMap = []
    this.biomeMap = [] // 缓存群系 ID 2D 数组
    this.biomeDataMap = [] // 缓存群系数据（包含权重）
    this.plantData = [] // 植物数据 [{x, y, z, plantId}]

    // 群系相关参数
    this.params.biomeSource = options.biomeSource ?? 'panel' // 'panel' | 'generator'
    this.params.forcedBiome = options.forcedBiome ?? 'plains' // 强制群系（调试模式）

    // STEP 2: 共享的群系生成器（由 ChunkManager 传入，所有 chunk 共用）
    // 如果没有提供共享生成器，则创建一个私有实例
    if (options.sharedBiomeGenerator) {
      this.biomeGenerator = options.sharedBiomeGenerator
    }
    else if (this.params.biomeSource === 'generator') {
      // 创建私有 BiomeGenerator 实例
      this.biomeGenerator = new BiomeGenerator(this.params.seed)
    }
    else {
      this.biomeGenerator = null
    }

    // 自动生成
    if (options.autoGenerate ?? true) {
      this.generate()
    }

    if (this.debug.active && this._debugEnabled) {
      this.debugInit()
    }
  }

  /**
   * 生成地形 + 矿产
   */
  generate() {
    // 初始化容器尺寸
    this.initialize()

    // 使用同一随机序列驱动 Simplex 噪声（地形与矿产一致）
    const rng = new RNG(this.params.seed)
    const simplex = new SimplexNoise(rng)

    // 生成地形与矿产
    this.generateTerrain(simplex)
    const oreStats = this.generateResources(simplex)
    // 生成树（必须在矿产之后，避免树被矿产覆盖）
    const treeStats = this.generateTrees(rng)
    // 生成植物（草、花等）
    const plantStats = this.generatePlants(rng)

    // 计算 AO（必须在 mesh 生成前）
    this.computeAO()

    // 挂载并生成渲染数据
    this.generateMeshes({ ...oreStats, ...treeStats, ...plantStats })

    return { heightMap: this.heightMap, plantData: this.plantData, oreStats, treeStats, plantStats }
  }

  /**
   * 初始化容器（尺寸变更时重置）
   */
  initialize() {
    const currentSize = this.container.getSize()
    if (currentSize.width !== this.params.sizeWidth || currentSize.height !== this.params.sizeHeight) {
      this.container.initialize({
        width: this.params.sizeWidth,
        height: this.params.sizeHeight,
      })
    }
    this.container.clear()
  }

  /**
   * 构建高度图并填充草/土/石
   */
  generateTerrain(simplex) {
    const { width, height } = this.container.getSize()

    // STEP 2: 如果使用生成器模式且有 BiomeGenerator，预生成整个 chunk 的群系图
    let generatedBiomeMap = null
    if (this.params.biomeSource === 'generator' && this.biomeGenerator) {
      generatedBiomeMap = this.biomeGenerator.generateBiomeMap(
        this.origin.x,
        this.origin.z,
        width,
      )
    }

    const field = buildTerrainBiomeField({
      width,
      height,
      originX: this.origin.x,
      originZ: this.origin.z,
      terrain: this.params.terrain,
      simplex,
      generatedBiomeMap,
      fallbackBiomeAt: (x, z) => this._getBiomeAt(x, z),
    })
    this.heightMap = field.heightMap
    this.biomeMap = field.biomeMap
    this.biomeDataMap = field.biomeDataMap

    // 第二阶段：基于完整的 heightMap 填充方块（支持混合群系）
    for (let z = 0; z < width; z++) {
      for (let x = 0; x < width; x++) {
        const columnHeight = this.heightMap[z][x]
        const biomeData = this.biomeDataMap[z][x]
        this._fillColumnLayers(x, z, columnHeight, biomeData)
      }
    }
  }

  /**
   * 获取指定位置的群系 ID
   * @param {number} x - 局部 X 坐标
   * @param {number} z - 局部 Z 坐标
   * @returns {string} 群系 ID
   */
  _getBiomeAt(x, z) {
    // Panel 模式：从调试面板获取强制群系
    if (this.params.biomeSource === 'panel' && this.params.forcedBiome) {
      return this.params.forcedBiome
    }

    // Generator 模式：使用 BiomeGenerator 查询
    if (this.params.biomeSource === 'generator' && this.biomeGenerator) {
      const wx = this.origin.x + x
      const wz = this.origin.z + z
      const biomeData = this.biomeGenerator.getBiomeAt(wx, wz)
      return biomeData.biome
    }

    // 默认返回平原（向后兼容）
    return 'plains'
  }

  /**
   * 根据群系和层级选择方块类型
   * @param {string} biomeId - 群系 ID（如 'plains', 'desert'）
   * @param {string} layer - 层级：'surface' | 'subsurface' | 'deep'
   * @returns {number} 方块 ID
   */
  _selectBiomeBlock(biomeId, layer) {
    const biomeConfig = getBiomeConfig(biomeId)
    if (!biomeConfig) {
      console.warn(`Unknown biome: ${biomeId}, using default`)
      return BLOCK_IDS.GRASS // 默认返回草方块
    }

    return biomeConfig.blocks[layer] || BLOCK_IDS.STONE
  }

  /**
   * 判断当前位置是否应该暴露为石块（基于侧向暴露和坡度）
   * @param {number} x - X 坐标
   * @param {number} y - Y 坐标（当前方块高度）
   * @param {number} z - Z 坐标
   * @param {number} surfaceHeight - 当前列的表面高度
   * @returns {boolean} 是否应该使用石块
   */
  _isRockExposed(x, y, z, surfaceHeight) {
    const { width } = this.container.getSize()
    const { maxDepth, slopeThreshold } = this.params.terrain.rockExpose

    // 只在接近地表时考虑（深度限制）
    if (surfaceHeight - y > maxDepth)
      return false

    // 四邻域方向：±X, ±Z
    const neighbors = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]

    for (const [dx, dz] of neighbors) {
      const nx = x + dx
      const nz = z + dz

      // 边界检查
      if (nx < 0 || nx >= width || nz < 0 || nz >= width)
        continue

      // 获取邻居高度（注意：heightMap[z][x] 的索引顺序）
      const neighborHeight = this.heightMap[nz]?.[nx]
      if (neighborHeight === undefined)
        continue

      // 邻居明显更低 → 当前侧面暴露
      if (surfaceHeight - neighborHeight >= slopeThreshold) {
        return true
      }
    }

    return false
  }

  /**
   * 填充一列方块：根据群系选择地表/土层/深层方块
   * 水下 & 水岸区域统一使用沙子（保持原有逻辑）
   * 坡面裸岩：土层在侧面暴露时会使用石块
   * @param {number} x - 局部 X 坐标
   * @param {number} z - 局部 Z 坐标
   * @param {number} surfaceHeight - 表面高度
   * @param {object} biomeData - 群系数据（包含 biome, weights）
   */
  _fillColumnLayers(x, z, surfaceHeight, biomeData = null) {
    // 获取群系 ID（兼容旧调用方式）
    const biomeId = biomeData?.biome || this.biomeMap[z][x]

    const soilDepth = Math.max(1, this.params.soilDepth)
    const stoneStart = Math.max(0, surfaceHeight - soilDepth)

    const waterOffset = this.params.water?.waterOffset ?? 8
    const shoreDepth = this.params.water?.shoreDepth ?? 2

    // 判定区域
    const isUnderwater = surfaceHeight <= waterOffset
    const isShore = !isUnderwater && surfaceHeight <= waterOffset + shoreDepth

    const columnBlocks = getCategoricalBiomeBlocks({
      dominantBiome: biomeId,
      underwater: isUnderwater,
      shore: isShore,
    })
    const surfaceBlockId = columnBlocks.surface
    const subsurfaceBlockId = columnBlocks.subsurface
    const deepBlockId = columnBlocks.deep

    // 1. 深层：统一填充石头（或其他深层块）
    for (let y = 0; y <= stoneStart; y++) {
      this.container.setBlockId(x, y, z, deepBlockId)
    }

    // 2. 表层与地表
    for (let y = stoneStart + 1; y <= surfaceHeight; y++) {
      if (y === surfaceHeight) {
        this.container.setBlockId(x, y, z, surfaceBlockId)
      }
      else {
        // 坡面裸岩判定（仅限非水域/沙滩的表层）
        if (!isUnderwater && !isShore && this._isRockExposed(x, y, z, surfaceHeight)) {
          this.container.setBlockId(x, y, z, BLOCK_IDS.STONE)
        }
        else {
          this.container.setBlockId(x, y, z, subsurfaceBlockId)
        }
      }
    }
  }

  /**
   * 生成矿产：使用 3D 噪声对石层进行覆盖
   */
  generateResources(simplex) {
    const { width } = this.container.getSize()
    const stats = {}

    resources.forEach((res) => {
      let placed = 0
      const scale = res.scale || { x: 20, y: 20, z: 20 }
      const threshold = res.scarcity ?? 0.7

      for (let z = 0; z < width; z++) {
        for (let x = 0; x < width; x++) {
          // 石块只存在于地表以下，用 heightMap 限制 y 上限，跳过地表以上的大片空气
          const surfaceHeight = this.heightMap[z]?.[x] ?? -1
          for (let y = 0; y <= surfaceHeight; y++) {
            // 仅在石块内部生成矿产，避免替换表层
            const block = this.container.getBlock(x, y, z)
            if (block.id !== blocks.stone.id)
              continue

            const noiseVal = simplex.noise3d(
              (this.origin.x + x) / scale.x,
              y / scale.y,
              (this.origin.z + z) / scale.z,
            )

            if (noiseVal >= threshold) {
              this.container.setBlockId(x, y, z, res.id)
              placed++
            }
          }
        }
      }

      stats[res.name] = placed
    })

    return stats
  }

  /**
   * 根据权重选择植被类型
   * @param {Array} types - 植被类型列表
   * @param {RNG} rng - 随机数生成器
   * @returns {object|null} 选中的植被类型配置
   */
  _selectVegetationType(types, rng) {
    if (!types || types.length === 0)
      return null

    const totalWeight = types.reduce((sum, t) => sum + t.weight, 0)
    if (totalWeight === 0)
      return null

    const rand = rng.random() * totalWeight
    let cumWeight = 0

    for (const type of types) {
      cumWeight += type.weight
      if (rand < cumWeight)
        return type
    }

    return types[0] // 兜底
  }

  /**
   * 生成植被（树或仙人掌）
   * @param {number} x - X 坐标
   * @param {number} baseY - 基础 Y 坐标（地表上方）
   * @param {number} z - Z 坐标
   * @param {object} vegetationType - 植被类型配置
   * @param {RNG} rng - 随机数生成器
   * @param {object} stats - 统计对象（会被修改）
   */
  _generateVegetation(x, baseY, z, vegetationType, rng, stats) {
    const { heightRange, canopyRadius, trunkBlock, leavesBlock } = vegetationType
    const { height } = this.container.getSize()

    // 树干高度
    const trunkHeight = Math.round(
      rng.random() * (heightRange[1] - heightRange[0]) + heightRange[0],
    )
    const topY = baseY + trunkHeight

    // 填充树干
    for (let y = baseY; y < topY; y++) {
      if (y >= height)
        break
      this.container.setBlockId(x, y, z, trunkBlock)
      stats.treeTrunkBlocks++
    }

    // 生成树叶（如果有）
    if (leavesBlock && canopyRadius && canopyRadius[1] > 0) {
      const R = Math.round(
        rng.random() * (canopyRadius[1] - canopyRadius[0]) + canopyRadius[0],
      )
      const R2 = R * R
      const { width } = this.container.getSize()
      const canopyDensity = this.params.trees?.canopyDensity ?? 0.5

      // 球形树冠生成逻辑
      for (let dx = -R; dx <= R; dx++) {
        for (let dy = -R; dy <= R; dy++) {
          for (let dz = -R; dz <= R; dz++) {
            if (dx * dx + dy * dy + dz * dz > R2)
              continue

            const px = x + dx
            const py = topY + dy
            const pz = z + dz

            // 边界检查
            if (px < 0 || px >= width || pz < 0 || pz >= width || py < baseY + trunkHeight - 2 || py >= height)
              continue

            // 不覆盖非空方块
            if (this.container.getBlock(px, py, pz).id !== blocks.empty.id)
              continue

            // 根据稀疏度决定是否生成树叶
            if (rng.random() > canopyDensity) {
              this.container.setBlockId(px, py, pz, leavesBlock)
              stats.treeLeavesBlocks++
            }
          }
        }
      }
    }
  }

  /**
   * 生成植被：由 biome 配置驱动
   * @param {RNG} rng - 随机数生成器
   * @returns {object} 统计信息
   */
  generateTrees(rng) {
    const { width, height } = this.container.getSize()
    const stats = {
      treeCount: 0,
      treeTrunkBlocks: 0,
      treeLeavesBlocks: 0,
    }

    // 遍历每个位置
    for (let baseX = 0; baseX < width; baseX++) {
      for (let baseZ = 0; baseZ < width; baseZ++) {
        // 获取缓存的群系
        const biomeId = this.biomeMap[baseZ][baseX]
        const biomeConfig = getBiomeConfig(biomeId)

        if (!biomeConfig) {
          console.warn(`Unknown biome: ${biomeId}`)
          continue
        }

        // 检查群系是否允许生成植被
        if (!biomeConfig.vegetation?.enabled) {
          continue
        }

        // 检查地表方块是否允许
        const surfaceHeight = this.heightMap[baseZ]?.[baseX]
        if (surfaceHeight === undefined)
          continue

        const surfaceBlock = this.container.getBlock(baseX, surfaceHeight, baseZ)
        if (!biomeConfig.vegetation.allowedSurface.includes(surfaceBlock.id)) {
          continue
        }

        // 根据群系密度决定是否生成
        const density = biomeConfig.vegetation.density * (this.params.trees?.frequency ?? 0.02)
        if (rng.random() > density) {
          continue
        }

        // 选择植被类型（根据权重）
        const vegetationType = this._selectVegetationType(biomeConfig.vegetation.types, rng)
        if (!vegetationType) {
          continue
        }

        // 生成植被
        const baseY = surfaceHeight + 1
        if (baseY >= height)
          continue

        this._generateVegetation(baseX, baseY, baseZ, vegetationType, rng, stats)
        stats.treeCount++
      }
    }

    return stats
  }

  /**
   * 生成植物（草、花等）：由 biome 的 flora 配置驱动
   * @param {RNG} rng - 随机数生成器
   * @returns {object} 统计信息
   */
  generatePlants(rng) {
    const { width } = this.container.getSize()
    this.plantData = []
    const stats = { plantCount: 0 }

    for (let x = 0; x < width; x++) {
      for (let z = 0; z < width; z++) {
        // 获取缓存的群系
        const biomeId = this.biomeMap[z][x]
        const biomeConfig = getBiomeConfig(biomeId)

        if (!biomeConfig)
          continue

        // 检查群系是否允许生成植物
        const floraConfig = biomeConfig.flora
        if (!floraConfig?.enabled)
          continue

        // 检查地表方块是否允许
        const surfaceHeight = this.heightMap[z]?.[x]
        if (surfaceHeight === undefined)
          continue

        const surfaceBlock = this.container.getBlock(x, surfaceHeight, z)
        if (!floraConfig.allowedSurface.includes(surfaceBlock.id))
          continue

        // 检查地表上方是否为空
        const plantY = surfaceHeight + 1
        const aboveBlock = this.container.getBlock(x, plantY, z)
        if (aboveBlock && aboveBlock.id !== blocks.empty.id)
          continue

        // 根据密度决定是否生成
        if (rng.random() > getFloraSpawnDensity(floraConfig.density))
          continue

        // 选择植物类型（根据权重）
        const floraType = this._selectFloraType(floraConfig.types, rng)
        if (!floraType)
          continue

        // 记录植物数据
        this.plantData.push({
          x,
          y: plantY,
          z,
          plantId: floraType.plantId,
        })
        stats.plantCount++
      }
    }

    return stats
  }

  /**
   * 根据权重选择植物类型
   * @param {Array} types - 植物类型列表
   * @param {RNG} rng - 随机数生成器
   * @returns {object|null} 选中的植物类型配置
   */
  _selectFloraType(types, rng) {
    if (!types || types.length === 0)
      return null

    const totalWeight = types.reduce((sum, t) => sum + t.weight, 0)
    if (totalWeight === 0)
      return null

    const rand = rng.random() * totalWeight
    let cumWeight = 0

    for (const type of types) {
      cumWeight += type.weight
      if (rand < cumWeight)
        return type
    }

    return types[0]
  }

  /**
   * 计算所有可见方块的 AO 值
   */
  computeAO() {
    computeAllBlocksAO(this.container)
  }

  /**
   * 生成渲染层需要的数据并广播事件
   */
  generateMeshes(oreStats) {
    // 多 chunk 场景不允许广播全局事件，否则会互相覆盖 terrainContainer/renderer
    if (!this.broadcast) {
      return
    }

    // 通知外部：数据已准备好
    emitter.emit('terrain:data-ready', {
      container: this.container,
      heightMap: this.heightMap,
      plantData: this.plantData, // 植物数据
      size: this.container.getSize(),
      seed: this.params.seed,
      oreStats,
    })
  }

  /**
   * 批量更新生成器参数并重新生成（按需）
   * @param {object} params - 需要更新的参数
   * @param {boolean} triggerGenerate - 是否立即触发重新生成
   */
  updateParams(params = {}, triggerGenerate = false) {
    if (params.seed !== undefined)
      this.params.seed = params.seed
    if (params.biomeSource !== undefined)
      this.params.biomeSource = params.biomeSource
    if (params.forcedBiome !== undefined)
      this.params.forcedBiome = params.forcedBiome

    // 如果指定了其他嵌套参数，也可以在此扩展
    if (triggerGenerate) {
      this.generate()
    }
  }

  // #region 调试面板
  /**
   * 调试面板 ( 单个 chunk 专用 )
   */
  debugInit() {
    this.debugFolder = this.debug.ui.addFolder({
      title: this._debugTitle,
      expanded: false,
    })

    // 地形参数
    const terrainFolder = this.debugFolder.addFolder({
      title: '地形参数',
      expanded: true,
    })

    terrainFolder.addBinding(this.params, 'sizeWidth', {
      label: '地图宽度',
      min: 8,
      max: 256,
      step: 1,
    }).on('change', () => this.generate())

    terrainFolder.addBinding(this.params, 'sizeHeight', {
      label: '地图高度',
      min: 4,
      max: 256,
      step: 1,
    }).on('change', () => this.generate())

    terrainFolder.addBinding(this.params.terrain, 'scale', {
      label: '地形缩放',
      min: 5,
      max: 120,
      step: 1,
    }).on('change', () => this.generate())

    terrainFolder.addBinding(this.params.terrain, 'magnitude', {
      label: '地形振幅',
      min: 0,
      max: 32,
      step: 1,
    }).on('change', () => this.generate())

    terrainFolder.addBinding(this.params.terrain, 'offset', {
      label: '地形偏移',
      // offset 为"高度偏移（方块层数）"
      min: 0,
      max: this.params.sizeHeight,
      step: 1,
    }).on('change', () => this.generate())

    // 裸岩参数
    terrainFolder.addBinding(this.params.terrain.rockExpose, 'maxDepth', {
      label: '裸岩最大深度',
      min: 1,
      max: 5,
      step: 1,
    }).on('change', () => this.generate())

    terrainFolder.addBinding(this.params.terrain.rockExpose, 'slopeThreshold', {
      label: '坡度阈值',
      min: 1,
      max: 5,
      step: 1,
    }).on('change', () => this.generate())

    // 矿物噪声缩放调节：仅暴露 X/Z，便于控制矿脉走向
    const oresFolder = this.debugFolder.addFolder({
      title: '矿物缩放',
      expanded: false,
    })

    resources.forEach((res) => {
      // 兜底确保 scale 存在，避免外部删除导致面板失效
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
      }).on('change', () => this.generate())

      oreFolder.addBinding(res.scale, 'z', {
        label: 'Z 噪声缩放',
        min: 5,
        max: 120,
        step: 1,
      }).on('change', () => this.generate())
    })

    // 树木参数
    const treeFolder = this.debugFolder.addFolder({
      title: '树木参数',
      expanded: false,
    })

    treeFolder.addBinding(this.params.trees, 'frequency', {
      label: '生成频率',
      min: 0,
      max: 1,
      step: 0.01,
    }).on('change', () => this.generate())

    treeFolder.addBinding(this.params.trees, 'canopyDensity', {
      label: '树冠稀疏度',
      min: 0,
      max: 1,
      step: 0.01,
    }).on('change', () => this.generate())

    // 群系调试面板
    const biomeFolder = this.debugFolder.addFolder({
      title: '群系系统',
      expanded: true,
    })

    // 群系来源选择
    biomeFolder.addBinding(this.params, 'biomeSource', {
      label: '群系来源',
      options: {
        调试面板: 'panel',
        自动生成: 'generator',
      },
    }).on('change', () => {
      // 切换模式时重新生成
      this.generate()
    })

    // 强制群系（仅在 panel 模式下生效）
    biomeFolder.addBinding(this.params, 'forcedBiome', {
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
      if (this.params.biomeSource === 'panel') {
        this.generate()
      }
    })

    // 重新生成按钮
    this.debugFolder.addButton({
      title: '🔄 重新生成',
    }).on('click', () => {
      this.params.seed = Math.floor(Math.random() * 1e9)
      this.generate()
    })
  }
  // #endregion
}
