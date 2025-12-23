/**
 * 地形生成器
 * - 基于 Simplex 噪声生成地形高度，填充草/土/石层
 * - 使用 Simplex 3D 噪声生成矿产（石头、煤矿、铁矿）
 * - 生成完成后通过 mitt 事件总线广播 terrain:data-ready
 */
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js'
import Experience from '../../experience.js'
import { RNG } from '../../tools/rng.js'
import emitter from '../../utils/event-bus.js'
import { blocks, resources } from './blocks-config.js'
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

    // 挂载并生成渲染数据
    this.generateMeshes({ ...oreStats, ...treeStats })

    return { heightMap: this.heightMap, oreStats, treeStats }
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
    const { scale, magnitude, offset } = this.params.terrain

    // 将 magnitude (0-32) 重映射到 (0-1)
    const normalizedMagnitude = magnitude / 32

    this.heightMap = []

    for (let z = 0; z < width; z++) {
      const row = []
      for (let x = 0; x < width; x++) {
        // Simplex 噪声 [-1,1]
        // 使用世界坐标采样，确保相邻 chunk 边界连贯
        const wx = this.origin.x + x
        const wz = this.origin.z + z
        const n = simplex.noise(wx / scale, wz / scale)
        // offset 改为“高度偏移（方块层数）”，通过 offset/height 转为 0..1 的基准，再叠加噪声扰动
        // 这样更直观：offset=16 表示地形基准在第 16 层附近
        const scaled = (offset / height) + normalizedMagnitude * n
        let columnHeight = Math.floor(height * scaled)
        columnHeight = Math.max(0, Math.min(columnHeight, height - 1))

        row.push(columnHeight)

        // 填充当前列：顶层草，表层土，深层石
        this._fillColumnLayers(x, z, columnHeight)
      }
      this.heightMap.push(row)
    }
  }

  /**
   * 填充一列方块：草顶 / 土层 / 石层
   * 水下 & 水岸区域统一使用沙子
   */
  _fillColumnLayers(x, z, surfaceHeight) {
    const soilDepth = Math.max(1, this.params.soilDepth)
    const stoneStart = Math.max(0, surfaceHeight - soilDepth)

    const waterOffset = this.params.water?.waterOffset ?? 8
    const shoreDepth = this.params.water?.shoreDepth ?? 2

    // 判定区域
    const isUnderwater = surfaceHeight <= waterOffset
    const isShore
    = surfaceHeight > waterOffset
      && surfaceHeight <= waterOffset + shoreDepth

    for (let y = 0; y <= surfaceHeight; y++) {
    // 顶层
      if (y === surfaceHeight) {
        if (isUnderwater || isShore) {
          this.container.setBlockId(x, y, z, blocks.sand.id)
        }
        else {
          this.container.setBlockId(x, y, z, blocks.grass.id)
        }
        continue
      }

      // 表层（土 / 沙）
      if (y > stoneStart) {
        if (isUnderwater || isShore) {
          this.container.setBlockId(x, y, z, blocks.sand.id)
        }
        else {
          this.container.setBlockId(x, y, z, blocks.dirt.id)
        }
        continue
      }

      // 深层石头
      this.container.setBlockId(x, y, z, blocks.stone.id)
    }
  }

  /**
   * 生成矿产：使用 3D 噪声对石层进行覆盖
   */
  generateResources(simplex) {
    const { width, height } = this.container.getSize()
    const stats = {}

    resources.forEach((res) => {
      let placed = 0
      const scale = res.scale || { x: 20, y: 20, z: 20 }
      const threshold = res.scarcity ?? 0.7

      for (let z = 0; z < width; z++) {
        for (let x = 0; x < width; x++) {
          for (let y = 0; y <= height; y++) {
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
   * 使用 3D 球形采样逻辑生成树
   * @param {RNG} rng
   */
  generateTrees(rng) {
    const { width, height } = this.container.getSize()
    const stats = {
      treeCount: 0,
      treeTrunkBlocks: 0,
      treeLeavesBlocks: 0,
    }

    const p = this.params.trees
    if (!p)
      return stats

    const simplex = new SimplexNoise(rng)
    const canopySize = p.maxRadius
    const frequency = p.frequency

    for (let baseX = canopySize; baseX < width - canopySize; baseX++) {
      for (let baseZ = canopySize; baseZ < width - canopySize; baseZ++) {
        // 使用世界坐标采样噪声，确保跨 chunk 连续
        const n = simplex.noise(
          this.origin.x + baseX,
          this.origin.z + baseZ,
        ) * 0.5 + 0.5

        if (n < (1 - frequency))
          continue

        // 寻找草地（从顶向下找）
        for (let y = height - 1; y >= 0; y--) {
          const block = this.container.getBlock(baseX, y, baseZ)
          if (block.id !== blocks.grass.id)
            continue

          // 找到草地，在上方一层开始
          const baseY = y + 1
          if (baseY >= height)
            break

          // 树干高度
          const trunkHeight = Math.round(rng.random() * (p.maxHeight - p.minHeight)) + p.minHeight
          const topY = baseY + trunkHeight

          // 填充树干
          for (let ty = baseY; ty <= topY; ty++) {
            if (ty >= height)
              break
            this.container.setBlockId(baseX, ty, baseZ, blocks.treeTrunk.id)
            stats.treeTrunkBlocks++
          }

          // 生成树叶（球形树冠）
          const R = Math.round(rng.random() * (p.maxRadius - p.minRadius)) + p.minRadius
          const R2 = R * R

          for (let x = -R; x <= R; x++) {
            for (let y = -R; y <= R; y++) {
              for (let z = -R; z <= R; z++) {
                if (x * x + y * y + z * z > R2)
                  continue

                const px = baseX + x
                const py = topY + y
                const pz = baseZ + z

                // 边界检查
                if (px < 0 || px >= width || pz < 0 || pz >= width || py < 0 || py >= height)
                  continue

                // 不覆盖非空方块
                if (this.container.getBlock(px, py, pz).id !== blocks.empty.id)
                  continue

                if (rng.random() > (p.canopyDensity ?? 0.4)) {
                  this.container.setBlockId(px, py, pz, blocks.treeLeaves.id)
                  stats.treeLeavesBlocks++
                }
              }
            }
          }

          stats.treeCount++
          // 这一列已经种了树，停止向下搜寻
          break
        }
      }
    }

    return stats
  }

  /**
   * 简单整数哈希 -> [0,1)
   * 用于从 (seed, worldX, worldZ) 派生稳定随机数（跨 chunk 一致）
   */
  _hash01(seed, x, z) {
    // 32-bit xorshift 风格混合（足够用于程序化生成）
    let h = (seed | 0) ^ (x | 0) * 374761393 ^ (z | 0) * 668265263
    h = (h ^ (h >>> 13)) * 1274126177
    h ^= h >>> 16
    // 转为无符号，并归一化
    return (h >>> 0) / 4294967296
  }

  /**
   * 创建可重复 RNG（SimplexNoise 依赖 Math.random 接口）
   */

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
      size: this.container.getSize(),
      seed: this.params.seed,
      oreStats,
    })
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
      // offset 为“高度偏移（方块层数）”
      min: 0,
      max: this.params.sizeHeight,
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
