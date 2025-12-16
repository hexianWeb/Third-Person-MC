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
      // 支持共享 terrain params：多个 chunk 共用同一份参数对象
      terrain: options.sharedTerrainParams || {
        scale: options.terrain?.scale ?? 35, // 噪声缩放（越大越平滑）
        magnitude: options.terrain?.magnitude ?? 0.5, // 振幅
        offset: options.terrain?.offset ?? 0.5, // 基准偏移
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
    const simplexTerrain = new SimplexNoise(rng)
    const simplexResource = new SimplexNoise(rng)

    // 生成地形与矿产
    this.generateTerrain(simplexTerrain)
    const oreStats = this.generateResources(simplexResource)

    // 挂载并生成渲染数据
    this.generateMeshes(oreStats)

    return { heightMap: this.heightMap, oreStats }
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
        const scaled = (offset / height) + magnitude * n
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
   */
  _fillColumnLayers(x, z, surfaceHeight) {
    const soilDepth = Math.max(1, this.params.soilDepth)
    const stoneStart = Math.max(0, surfaceHeight - soilDepth)

    for (let y = 0; y <= surfaceHeight; y++) {
      // 顶层草
      if (y === surfaceHeight) {
        this.container.setBlockId(x, y, z, blocks.grass.id)
        continue
      }

      // 土层（靠近表面的几层）
      if (y > stoneStart) {
        this.container.setBlockId(x, y, z, blocks.dirt.id)
        continue
      }

      // 更深处为石头
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

    // 挂载到 Experience 供其他组件读取
    this.experience.terrainContainer = this.container
    this.experience.terrainHeightMap = this.heightMap

    // 通知外部：数据已准备好
    emitter.emit('terrain:data-ready', {
      container: this.container,
      heightMap: this.heightMap,
      size: this.container.getSize(),
      seed: this.params.seed,
      oreStats,
    })
  }

  /**
   * 调试面板
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
      max: 1,
      step: 0.01,
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

    // 重新生成按钮
    this.debugFolder.addButton({
      title: '🔄 重新生成',
    }).on('click', () => {
      this.params.seed = Math.floor(Math.random() * 1e9)
      this.generate()
    })
  }
}
