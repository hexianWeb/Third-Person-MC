/**
 * 地形数据管理器
 * 负责生成和管理地形高度数据，提供给 3D 渲染和 2D 小地图使用
 */

import { Color, Vector2 } from 'three'
import Experience from '../experience.js'
import { FBM } from '../tools/noise.js'
import emitter from '../utils/event-bus.js'

export default class TerrainDataManager {
  constructor(options = {}) {
    this.experience = new Experience()
    this.debug = this.experience.debug

    // ===== 地形生成参数 =====
    this.params = {
      // 分辨率（方块数量 = resolution * resolution）
      resolution: options.resolution || 128,
      // 噪声缩放
      scale: options.scale || 0.1,
      // 随机种子
      seed: options.seed || Math.random(),
      // 高度倍数
      heightMultiplier: options.heightMultiplier || 1,
      // FBM 参数
      octaves: options.octaves || 6,
      persistance: options.persistance || 0.5,
      lacunarity: options.lacunarity || 2,
      // 水位线
      waterLevel: options.waterLevel || -0.2,
    }

    // ===== 颜色配置（7 段细分） =====
    this.colors = {
      // 水系（2 段）
      waterDeep: {
        threshold: -0.6, // height <= -0.6 深海
        color: '#003366',
      },
      waterShallow: {
        threshold: -0.2, // -0.6 < height <= -0.2 浅水
        color: '#0077be',
      },
      // 过渡区（2 段）
      wetSand: {
        threshold: -0.05, // -0.2 < height <= -0.05 湿沙/泥滩
        color: '#bd6723',
      },
      drySand: {
        threshold: 0.05, // -0.05 < height <= 0.05 干沙/海滩
        color: '#ded3a7',
      },
      // 植被区（2 段）
      lowGrass: {
        threshold: 0.4, // 0.05 < height <= 0.4 低地草
        color: '#4c752f',
      },
      highGrass: {
        threshold: 0.7, // 0.4 < height <= 0.7 高地灌木/森林
        color: '#145a32',
      },
      // 高山雪区（2 段）
      rock: {
        threshold: 0.85, // 0.7 < height <= 0.85 裸岩
        color: '#7f8c8d',
      },
      snow: {
        threshold: 1, // height > 0.85 积雪
        color: '#ecf0f1',
      },
    }

    // ===== 数据存储 =====
    this.surface = [] // Vector2 方格面数组
    this.dataBlocks = [] // 完整数据块 { x, y, height, color }
    this.heightMap = [] // 二维高度数组 [y][x]

    // 初始化 FBM 噪声生成器
    this._initNoise()

    // 生成地形数据
    this.generate()

    // 初始化调试面板
    if (this.debug.active) {
      this.debugInit()
    }
  }

  /**
   * 初始化 FBM 噪声生成器
   */
  _initNoise() {
    this.fbm = new FBM({
      seed: this.params.seed,
      scale: this.params.scale,
      persistance: this.params.persistance,
      lacunarity: this.params.lacunarity,
      octaves: this.params.octaves,
    })
  }

  /**
   * 生成地形数据
   */
  generate() {
    const { resolution } = this.params

    // 清空数据
    this.surface = []
    this.dataBlocks = []
    this.heightMap = []

    // 生成方格面（以原点为中心）
    const halfSize = resolution / 2

    for (let y = 0; y < resolution; y++) {
      this.heightMap[y] = []
      for (let x = 0; x < resolution; x++) {
        // 计算世界坐标（以原点为中心）
        const worldX = x - halfSize
        const worldY = y - halfSize

        // 创建 Vector2 点
        const point = new Vector2(worldX, worldY)
        this.surface.push(point)

        // 计算高度（FBM 输出 0~1，映射到 -1~1）
        const scaledPoint = point.clone().multiplyScalar(this.params.scale)
        const rawNoise = this.fbm.get2(scaledPoint)
        const height = (rawNoise * 2 - 1) * this.params.heightMultiplier

        // 存储高度
        this.heightMap[y][x] = height

        // 计算颜色
        const color = this.getColorForHeight(height)

        // 存储数据块
        this.dataBlocks.push({
          x: worldX,
          y: worldY,
          height,
          color,
        })
      }
    }

    // 地形生成完成，通知订阅者
    emitter.emit('terrain:updated', {
      resolution: this.params.resolution,
      heightMap: this.heightMap,
      dataBlocks: this.dataBlocks,
    })
  }

  /**
   * 根据高度获取颜色（7 段细分）
   * @param {number} height - 高度值 [-1, 1]
   * @returns {Color} Three.js 颜色对象
   */
  getColorForHeight(height) {
    const { waterDeep, waterShallow, wetSand, drySand, lowGrass, highGrass, rock, snow } = this.colors

    let baseColor

    if (height <= waterDeep.threshold) {
      // 深海：根据深度调整明度
      baseColor = new Color(waterDeep.color)
      // 越深越暗
      const depthRatio = (waterDeep.threshold - height) / (waterDeep.threshold + 1)
      const hsl = { h: 0, s: 0, l: 0 }
      baseColor.getHSL(hsl)
      baseColor.setHSL(hsl.h, hsl.s, hsl.l * (1 - depthRatio * 0.4))
    }
    else if (height <= waterShallow.threshold) {
      // 浅水：轻微深浅变化
      baseColor = new Color(waterShallow.color)
      const shallowRatio = (waterShallow.threshold - height) / (waterShallow.threshold - waterDeep.threshold)
      const hsl = { h: 0, s: 0, l: 0 }
      baseColor.getHSL(hsl)
      baseColor.setHSL(hsl.h, hsl.s, hsl.l * (1 - shallowRatio * 0.2))
    }
    else if (height <= wetSand.threshold) {
      // 湿沙/泥滩
      baseColor = new Color(wetSand.color)
    }
    else if (height <= drySand.threshold) {
      // 干沙/海滩
      baseColor = new Color(drySand.color)
    }
    else if (height <= lowGrass.threshold) {
      // 低地草：轻微高度变化
      baseColor = new Color(lowGrass.color)
      const grassRatio = (height - drySand.threshold) / (lowGrass.threshold - drySand.threshold)
      const hsl = { h: 0, s: 0, l: 0 }
      baseColor.getHSL(hsl)
      baseColor.setHSL(hsl.h, hsl.s * (1 + grassRatio * 0.1), hsl.l * (1 - grassRatio * 0.1))
    }
    else if (height <= highGrass.threshold) {
      // 高地灌木/森林
      baseColor = new Color(highGrass.color)
    }
    else if (height <= rock.threshold) {
      // 裸岩
      baseColor = new Color(rock.color)
    }
    else {
      // 积雪
      baseColor = new Color(snow.color)
    }

    return baseColor
  }

  /**
   * 获取指定位置的高度
   * @param {number} x - X 坐标
   * @param {number} y - Y 坐标
   * @returns {number|null} 高度值或 null
   */
  getHeightAt(x, y) {
    const { resolution } = this.params
    const halfSize = resolution / 2

    // 转换为数组索引
    const indexX = Math.floor(x + halfSize)
    const indexY = Math.floor(y + halfSize)

    if (indexX >= 0 && indexX < resolution && indexY >= 0 && indexY < resolution) {
      return this.heightMap[indexY][indexX]
    }
    return null
  }

  /**
   * 重新生成地形（使用新种子）
   */
  regenerate() {
    this.params.seed = Math.random()
    this._initNoise()
    this.generate()
  }

  /**
   * 获取地形边界
   * @returns {object} { minX, maxX, minY, maxY }
   */
  getBounds() {
    const halfSize = this.params.resolution / 2
    return {
      minX: -halfSize,
      maxX: halfSize,
      minY: -halfSize,
      maxY: halfSize,
    }
  }

  /**
   * 初始化调试面板
   */
  debugInit() {
    this.debugFolder = this.debug.ui.addFolder({
      title: '地形数据管理器',
      expanded: false,
    })

    // ----- 生成参数 -----
    const genFolder = this.debugFolder.addFolder({
      title: '生成参数',
      expanded: true,
    })

    genFolder.addBinding(this.params, 'resolution', {
      label: '分辨率',
      min: 16,
      max: 256,
      step: 16,
    })

    genFolder.addBinding(this.params, 'scale', {
      label: '噪声缩放',
      min: 0.01,
      max: 1,
      step: 0.01,
    })

    genFolder.addBinding(this.params, 'heightMultiplier', {
      label: '高度倍数',
      min: 0.1,
      max: 3,
      step: 0.1,
    })

    genFolder.addBinding(this.params, 'octaves', {
      label: '八度数',
      min: 1,
      max: 10,
      step: 1,
    })

    genFolder.addBinding(this.params, 'persistance', {
      label: '持续度',
      min: 0.1,
      max: 1,
      step: 0.05,
    })

    genFolder.addBinding(this.params, 'lacunarity', {
      label: '空隙度',
      min: 1,
      max: 4,
      step: 0.1,
    })

    genFolder.addButton({
      title: '🔄 重新生成',
    }).on('click', () => {
      this.regenerate()
    })

    // ----- 颜色配置 -----
    const colorFolder = this.debugFolder.addFolder({
      title: '颜色配置',
      expanded: false,
    })

    colorFolder.addBinding(this.colors.waterDeep, 'color', {
      view: 'color',
      label: '深海',
    })

    colorFolder.addBinding(this.colors.waterShallow, 'color', {
      view: 'color',
      label: '浅水',
    })

    colorFolder.addBinding(this.colors.wetSand, 'color', {
      view: 'color',
      label: '湿沙',
    })

    colorFolder.addBinding(this.colors.drySand, 'color', {
      view: 'color',
      label: '干沙',
    })

    colorFolder.addBinding(this.colors.lowGrass, 'color', {
      view: 'color',
      label: '低地草',
    })

    colorFolder.addBinding(this.colors.highGrass, 'color', {
      view: 'color',
      label: '高地森林',
    })

    colorFolder.addBinding(this.colors.rock, 'color', {
      view: 'color',
      label: '裸岩',
    })

    colorFolder.addBinding(this.colors.snow, 'color', {
      view: 'color',
      label: '积雪',
    })

    // ----- 阈值配置 -----
    const thresholdFolder = this.debugFolder.addFolder({
      title: '高度阈值',
      expanded: false,
    })

    thresholdFolder.addBinding(this.colors.waterDeep, 'threshold', {
      label: '深海线',
      min: -1,
      max: -0.3,
      step: 0.05,
    })

    thresholdFolder.addBinding(this.colors.waterShallow, 'threshold', {
      label: '浅水线',
      min: -0.5,
      max: 0,
      step: 0.05,
    })

    thresholdFolder.addBinding(this.colors.wetSand, 'threshold', {
      label: '湿沙线',
      min: -0.3,
      max: 0.1,
      step: 0.05,
    })

    thresholdFolder.addBinding(this.colors.drySand, 'threshold', {
      label: '干沙线',
      min: -0.1,
      max: 0.2,
      step: 0.05,
    })

    thresholdFolder.addBinding(this.colors.lowGrass, 'threshold', {
      label: '低草线',
      min: 0.1,
      max: 0.5,
      step: 0.05,
    })

    thresholdFolder.addBinding(this.colors.highGrass, 'threshold', {
      label: '高草线',
      min: 0.4,
      max: 0.8,
      step: 0.05,
    })

    thresholdFolder.addBinding(this.colors.rock, 'threshold', {
      label: '裸岩线',
      min: 0.6,
      max: 0.95,
      step: 0.05,
    })
  }
}
