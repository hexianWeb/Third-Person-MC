/**
 * 地形生成器
 * - 基于 FBM 生成地形高度，填充草/土/石层
 * - 叠加 3D 噪声生成矿产（石头、煤矿、铁矿）
 * - 生成完成后通过 mitt 事件总线广播 terrain:data-ready
 */
import { Vector2, Vector3 } from 'three'
import Experience from '../experience.js'
import { FBM } from '../tools/noise.js'
import emitter from '../utils/event-bus.js'
import { blocks, resources } from './blocks-config.js'
import TerrainContainer from './terrain-container.js'

// 简单的可重复随机数生成器（mulberry32）
function createRng(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export default class TerrainGenerator {
  constructor(options = {}) {
    this.experience = new Experience()
    this.debug = this.experience.debug

    // 尺寸与容器（保持单例）
    const size = options.size || { width: 32, height: 32 }
    this.container = options.container || new TerrainContainer(size)

    // 参数配置（可调节）
    this.params = {
      seed: options.seed ?? Date.now(),
      noiseScale: options.noiseScale ?? 0.08, // 地形 2D 噪声缩放
      heightRatio: options.heightRatio ?? 0.7, // 相对最大高度（占容器高度比例）
      baseHeight: options.baseHeight ?? 2, // 基础抬升，保证地面不为 0
      soilDepth: options.soilDepth ?? 3, // 表层土厚度（含草顶层）
      noiseOffset: options.noiseOffset || { x: 0, z: 0 }, // 采样偏移
      octaves: options.octaves ?? 5,
      persistance: options.persistance ?? 0.5,
      lacunarity: options.lacunarity ?? 2,
      redistribution: options.redistribution ?? 1.1,
      oreThreshold: options.oreThreshold ?? 0.68, // 噪声阈值，越高越稀有
      resourceOffset: options.resourceOffset || { x: 0, y: 0, z: 0 }, // 矿产噪声偏移
    }

    // 内部状态
    this._rng = createRng(this.params.seed)
    this.heightMap = []

    this.heightNoise = this._createFBM(this.params.seed)
    this.resourceNoises = this._createResourceNoises()

    // 自动生成
    if (options.autoGenerate ?? true) {
      this.generate()
    }

    if (this.debug.active) {
      this.debugInit()
    }
  }

  /**
   * 生成地形 + 矿产
   */
  generate() {
    this.container.clear()
    this._buildHeightField()
    const oreStats = this._generateResources()

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

    return {
      heightMap: this.heightMap,
      oreStats,
    }
  }

  /**
   * 构建高度图并填充草/土/石
   */
  _buildHeightField() {
    const { width, height } = this.container.getSize()
    const maxHeight = Math.max(1, Math.floor((height - 1) * this.params.heightRatio))

    this.heightMap = []

    for (let z = 0; z < width; z++) {
      const row = []
      for (let x = 0; x < width; x++) {
        // 采样归一化噪声（0~1）
        const noiseVal = this.heightNoise.get2(new Vector2(
          (x + this.params.noiseOffset.x) * this.params.noiseScale,
          (z + this.params.noiseOffset.z) * this.params.noiseScale,
        ))

        // 映射到真实高度并加入基础抬升
        const columnHeight = Math.min(
          height - 1,
          Math.max(
            0,
            Math.floor(this.params.baseHeight + noiseVal * maxHeight),
          ),
        )

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
  _generateResources() {
    const { width } = this.container.getSize()
    const stats = {}

    resources.forEach((res, index) => {
      let placed = 0
      const fbm = this.resourceNoises[index]
      const scale = res.scale || { x: 20, y: 20, z: 20 }
      const threshold = res.scarcity ?? this.params.oreThreshold

      for (let z = 0; z < width; z++) {
        for (let x = 0; x < width; x++) {
          const surfaceHeight = this.heightMap[z][x]
          for (let y = 0; y <= surfaceHeight; y++) {
            const block = this.container.getBlock(x, y, z)
            // 仅在石块内部生成矿产，避免替换表层
            if (block.id !== blocks.stone.id)
              continue

            const sample = new Vector3(
              (x + this.params.resourceOffset.x) / scale.x,
              (y + this.params.resourceOffset.y) / scale.y,
              (z + this.params.resourceOffset.z) / scale.z,
            )
            const noiseVal = fbm.get3(sample)

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
   * 创建主地形噪声
   */
  _createFBM(seed) {
    return new FBM({
      seed,
      scale: 1,
      persistance: this.params.persistance,
      lacunarity: this.params.lacunarity,
      octaves: this.params.octaves,
      redistribution: this.params.redistribution,
    })
  }

  /**
   * 为每类矿产创建独立噪声实例（使用不同子种子）
   */
  _createResourceNoises() {
    const list = []
    resources.forEach(() => {
      const subSeed = Math.floor(this._rng() * 1e9)
      list.push(this._createFBM(subSeed))
    })
    return list
  }

  /**
   * 调试面板
   */
  debugInit() {
    this.debugFolder = this.debug.ui.addFolder({
      title: '地形生成器',
      expanded: false,
    })

    // 地形参数
    const terrainFolder = this.debugFolder.addFolder({
      title: '地形参数',
      expanded: true,
    })

    terrainFolder.addBinding(this.params, 'noiseScale', {
      label: '噪声缩放',
      min: 0.01,
      max: 0.3,
      step: 0.005,
    }).on('change', () => this.generate())

    terrainFolder.addBinding(this.params, 'heightRatio', {
      label: '高度比例',
      min: 0.2,
      max: 0.95,
      step: 0.05,
    }).on('change', () => this.generate())

    terrainFolder.addBinding(this.params, 'baseHeight', {
      label: '基础高度',
      min: 0,
      max: 8,
      step: 1,
    }).on('change', () => this.generate())

    terrainFolder.addBinding(this.params, 'soilDepth', {
      label: '土层厚度',
      min: 1,
      max: 8,
      step: 1,
    }).on('change', () => this.generate())

    // 噪声偏移（平移地形）
    terrainFolder.addBinding(this.params.noiseOffset, 'x', {
      label: '噪声偏移 X',
      min: -200,
      max: 200,
      step: 1,
    }).on('change', () => this.generate())
    terrainFolder.addBinding(this.params.noiseOffset, 'z', {
      label: '噪声偏移 Z',
      min: -200,
      max: 200,
      step: 1,
    }).on('change', () => this.generate())

    // 噪声层
    const fbmFolder = this.debugFolder.addFolder({
      title: 'FBM',
      expanded: false,
    })

    fbmFolder.addBinding(this.params, 'octaves', {
      label: '八度数',
      min: 1,
      max: 8,
      step: 1,
    }).on('change', () => this.generate())
    fbmFolder.addBinding(this.params, 'persistance', {
      label: '持续度',
      min: 0.1,
      max: 1,
      step: 0.05,
    }).on('change', () => this.generate())
    fbmFolder.addBinding(this.params, 'lacunarity', {
      label: '空隙度',
      min: 1,
      max: 4,
      step: 0.1,
    }).on('change', () => this.generate())
    fbmFolder.addBinding(this.params, 'redistribution', {
      label: '重分布',
      min: 0.6,
      max: 2.0,
      step: 0.05,
    }).on('change', () => this.generate())

    // 矿产
    const oreFolder = this.debugFolder.addFolder({
      title: '矿产',
      expanded: false,
    })
    oreFolder.addBinding(this.params, 'oreThreshold', {
      label: '矿产阈值',
      min: 0.4,
      max: 0.95,
      step: 0.01,
    }).on('change', () => this.generate())

    // 矿产噪声偏移
    oreFolder.addBinding(this.params.resourceOffset, 'x', {
      label: '矿偏移 X',
      min: -200,
      max: 200,
      step: 1,
    }).on('change', () => this.generate())
    oreFolder.addBinding(this.params.resourceOffset, 'y', {
      label: '矿偏移 Y',
      min: -200,
      max: 200,
      step: 1,
    }).on('change', () => this.generate())
    oreFolder.addBinding(this.params.resourceOffset, 'z', {
      label: '矿偏移 Z',
      min: -200,
      max: 200,
      step: 1,
    }).on('change', () => this.generate())

    // 重新生成按钮
    this.debugFolder.addButton({
      title: '🔄 重新生成',
    }).on('click', () => {
      this.params.seed = Math.floor(Math.random() * 1e9)
      this._rng = createRng(this.params.seed)
      this.heightNoise = this._createFBM(this.params.seed)
      this.resourceNoises = this._createResourceNoises()
      this.generate()
    })
  }
}
