/**
 * 噪声生成工具库
 * 基于 three-noise 包改写，提供 Perlin 噪声和 FBM（分形布朗运动）生成功能
 *
 * 参考来源: https://github.com/FarazzShaikh/three-noise
 */

import { Vector2, Vector3 } from 'three'

// 预定义的排列表（用于生成伪随机梯度）
const p = [
  151,
  160,
  137,
  91,
  90,
  15,
  131,
  13,
  201,
  95,
  96,
  53,
  194,
  233,
  7,
  225,
  140,
  36,
  103,
  30,
  69,
  142,
  8,
  99,
  37,
  240,
  21,
  10,
  23,
  190,
  6,
  148,
  247,
  120,
  234,
  75,
  0,
  26,
  197,
  62,
  94,
  252,
  219,
  203,
  117,
  35,
  11,
  32,
  57,
  177,
  33,
  88,
  237,
  149,
  56,
  87,
  174,
  20,
  125,
  136,
  171,
  168,
  68,
  175,
  74,
  165,
  71,
  134,
  139,
  48,
  27,
  166,
  77,
  146,
  158,
  231,
  83,
  111,
  229,
  122,
  60,
  211,
  133,
  230,
  220,
  105,
  92,
  41,
  55,
  46,
  245,
  40,
  244,
  102,
  143,
  54,
  65,
  25,
  63,
  161,
  1,
  216,
  80,
  73,
  209,
  76,
  132,
  187,
  208,
  89,
  18,
  169,
  200,
  196,
  135,
  130,
  116,
  188,
  159,
  86,
  164,
  100,
  109,
  198,
  173,
  186,
  3,
  64,
  52,
  217,
  226,
  250,
  124,
  123,
  5,
  202,
  38,
  147,
  118,
  126,
  255,
  82,
  85,
  212,
  207,
  206,
  59,
  227,
  47,
  16,
  58,
  17,
  182,
  189,
  28,
  42,
  223,
  183,
  170,
  213,
  119,
  248,
  152,
  2,
  44,
  154,
  163,
  70,
  221,
  153,
  101,
  155,
  167,
  43,
  172,
  9,
  129,
  22,
  39,
  253,
  19,
  98,
  108,
  110,
  79,
  113,
  224,
  232,
  178,
  185,
  112,
  104,
  218,
  246,
  97,
  228,
  251,
  34,
  242,
  193,
  238,
  210,
  144,
  12,
  191,
  179,
  162,
  241,
  81,
  51,
  145,
  235,
  249,
  14,
  239,
  107,
  49,
  192,
  214,
  31,
  181,
  199,
  106,
  157,
  184,
  84,
  204,
  176,
  115,
  121,
  50,
  45,
  127,
  4,
  150,
  254,
  138,
  236,
  205,
  93,
  222,
  114,
  67,
  29,
  24,
  72,
  243,
  141,
  128,
  195,
  78,
  66,
  215,
  61,
  156,
  180,
]

/**
 * Perlin 噪声生成器
 * 基于 Ken Perlin 的经典算法实现
 */
export class Perlin {
  /**
   * 创建 Perlin 噪声实例
   * @param {number} seed - 随机种子值
   */
  constructor(seed) {
    // 梯度向量（用于 2D 和 3D 噪声）
    const _gradientVecs = [
      // 2D 向量
      new Vector3(1, 1, 0),
      new Vector3(-1, 1, 0),
      new Vector3(1, -1, 0),
      new Vector3(-1, -1, 0),
      // 3D 向量
      new Vector3(1, 0, 1),
      new Vector3(-1, 0, 1),
      new Vector3(1, 0, -1),
      new Vector3(-1, 0, -1),
      new Vector3(0, 1, 1),
      new Vector3(0, -1, 1),
      new Vector3(0, 1, -1),
      new Vector3(0, -1, -1),
    ]

    const perm = Array.from({ length: 512 })
    const gradP = Array.from({ length: 512 })

    // 处理种子值
    if (!seed)
      seed = 1
    seed *= 65536
    seed = Math.floor(seed)
    if (seed < 256) {
      seed |= seed << 8
    }

    // 初始化排列表和梯度表
    for (let i = 0; i < 256; i++) {
      let v
      if (i & 1) {
        v = p[i] ^ (seed & 255)
      }
      else {
        v = p[i] ^ ((seed >> 8) & 255)
      }

      perm[i] = perm[i + 256] = v
      gradP[i] = gradP[i + 256] = _gradientVecs[v % 12]
    }

    this._seed = seed
    this.perm = perm
    this.gradP = gradP

    // 偏移矩阵（用于遍历单元格顶点）
    this._offsetMatrix = [
      new Vector3(0, 0, 0),
      new Vector3(0, 0, 1),
      new Vector3(0, 1, 0),
      new Vector3(0, 1, 1),
      new Vector3(1, 0, 0),
      new Vector3(1, 0, 1),
      new Vector3(1, 1, 0),
      new Vector3(1, 1, 1),
    ]
  }

  /**
   * 平滑插值函数（5次多项式）
   * @param {number} t - 插值参数 [0, 1]
   * @returns {number} 平滑后的值
   */
  _fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10)
  }

  /**
   * 线性插值
   * @param {number} a - 起始值
   * @param {number} b - 结束值
   * @param {number} t - 插值参数 [0, 1]
   * @returns {number} 插值结果
   */
  _lerp(a, b, t) {
    return (1 - t) * a + t * b
  }

  /**
   * 计算梯度索引
   * @param {Vector2|Vector3} posInCell - 单元格内的位置
   * @returns {number} 梯度索引
   */
  _gradient(posInCell) {
    if (posInCell instanceof Vector3) {
      return posInCell.x + this.perm[posInCell.y + this.perm[posInCell.z]]
    }
    else {
      return posInCell.x + this.perm[posInCell.y]
    }
  }

  /**
   * 将值从一个范围映射到另一个范围
   * @param {number} x - 输入值
   * @param {number} inMin - 输入范围最小值
   * @param {number} inMax - 输入范围最大值
   * @param {number} outMin - 输出范围最小值
   * @param {number} outMax - 输出范围最大值
   * @returns {number} 映射后的值
   */
  static map(x, inMin, inMax, outMin, outMax) {
    return ((x - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin
  }

  /**
   * 采样 2D Perlin 噪声
   * @param {Vector2|Vector3} input - 采样坐标
   * @returns {number} 噪声值（范围约 -1 到 1）
   */
  get2(input) {
    // 如果是 Vector3，转换为 Vector2
    if (input.z !== undefined)
      input = new Vector2(input.x, input.y)

    // 计算所在单元格
    const cell = new Vector2(Math.floor(input.x), Math.floor(input.y))
    input.sub(cell)

    // 限制单元格坐标范围
    cell.x &= 255
    cell.y &= 255

    // 计算四个顶点的梯度点积
    const gradiantDot = []
    for (let i = 0; i < 4; i++) {
      const s3 = this._offsetMatrix[i * 2]
      const s = new Vector2(s3.x, s3.y)

      const grad3 = this.gradP[this._gradient(new Vector2().addVectors(cell, s))]
      const grad2 = new Vector2(grad3.x, grad3.y)
      const dist2 = new Vector2().subVectors(input, s)

      gradiantDot.push(grad2.dot(dist2))
    }

    // 平滑插值
    const u = this._fade(input.x)
    const v = this._fade(input.y)

    const value = this._lerp(
      this._lerp(gradiantDot[0], gradiantDot[2], u),
      this._lerp(gradiantDot[1], gradiantDot[3], u),
      v,
    )

    return value
  }

  /**
   * 采样 3D Perlin 噪声
   * @param {Vector3} input - 采样坐标
   * @returns {number} 噪声值（范围约 -1 到 1）
   */
  get3(input) {
    if (input.z === undefined)
      throw new Error('Input to Perlin::get3() must be of type Vector3')

    // 计算所在单元格
    const cell = new Vector3(
      Math.floor(input.x),
      Math.floor(input.y),
      Math.floor(input.z),
    )
    input.sub(cell)

    // 限制单元格坐标范围
    cell.x &= 255
    cell.y &= 255
    cell.z &= 255

    // 计算八个顶点的梯度点积
    const gradiantDot = []
    for (let i = 0; i < 8; i++) {
      const s = this._offsetMatrix[i]

      const grad3 = this.gradP[this._gradient(new Vector3().addVectors(cell, s))]
      const dist2 = new Vector3().subVectors(input, s)

      gradiantDot.push(grad3.dot(dist2))
    }

    // 平滑插值
    const u = this._fade(input.x)
    const v = this._fade(input.y)
    const w = this._fade(input.z)

    const value = this._lerp(
      this._lerp(
        this._lerp(gradiantDot[0], gradiantDot[4], u),
        this._lerp(gradiantDot[1], gradiantDot[5], u),
        w,
      ),
      this._lerp(
        this._lerp(gradiantDot[2], gradiantDot[6], u),
        this._lerp(gradiantDot[3], gradiantDot[7], u),
        w,
      ),
      v,
    )

    return value
  }
}

/**
 * 分形布朗运动（FBM）噪声生成器
 * 通过叠加多个不同频率和振幅的 Perlin 噪声来创建更自然的地形
 */
export class FBM {
  /**
   * 创建 FBM 噪声实例
   * @param {object} options - 配置选项
   * @param {number} options.seed - 随机种子
   * @param {number} options.scale - 噪声缩放（默认 1）
   * @param {number} options.persistance - 持续度，控制每个八度的振幅衰减（默认 0.5）
   * @param {number} options.lacunarity - 空隙度，控制每个八度的频率增加（默认 2）
   * @param {number} options.octaves - 八度数，叠加的噪声层数（默认 6）
   * @param {number} options.redistribution - 重分布指数，用于调整整体分布（默认 1）
   */
  constructor(options = {}) {
    const { seed, scale, persistance, lacunarity, octaves, redistribution } = options
    this._noise = new Perlin(seed)
    this._scale = scale || 1
    this._persistance = persistance || 0.5
    this._lacunarity = lacunarity || 2
    this._octaves = octaves || 6
    this._redistribution = redistribution || 1
  }

  /**
   * 采样 2D FBM 噪声
   * @param {Vector2} input - 采样坐标
   * @returns {number} 归一化噪声值 [0, 1]
   */
  get2(input) {
    let result = 0
    let amplitude = 1
    let frequency = 1
    let maxAmplitude = 0

    const noiseFunction = this._noise.get2.bind(this._noise)

    // 叠加多个八度的噪声
    for (let i = 0; i < this._octaves; i++) {
      const position = new Vector2(
        input.x * this._scale * frequency,
        input.y * this._scale * frequency,
      )

      // Perlin 噪声返回 -1~1，先映射到 0~1
      const noiseVal = (noiseFunction(position) + 1) * 0.5
      result += noiseVal * amplitude
      maxAmplitude += amplitude

      frequency *= this._lacunarity
      amplitude *= this._persistance
    }

    // 归一化到 0~1
    const normalized = result / maxAmplitude

    // 应用重分布（调整高度分布曲线）
    return normalized ** this._redistribution
  }

  /**
   * 采样 3D FBM 噪声
   * @param {Vector3} input - 采样坐标
   * @returns {number} 归一化噪声值 [0, 1]
   */
  get3(input) {
    let result = 0
    let amplitude = 1
    let frequency = 1
    let maxAmplitude = 0

    const noiseFunction = this._noise.get3.bind(this._noise)

    // 叠加多个八度的噪声
    for (let i = 0; i < this._octaves; i++) {
      const position = new Vector3(
        input.x * this._scale * frequency,
        input.y * this._scale * frequency,
        input.z * this._scale * frequency,
      )

      // Perlin 噪声返回 -1~1，先映射到 0~1
      const noiseVal = (noiseFunction(position) + 1) * 0.5
      result += noiseVal * amplitude
      maxAmplitude += amplitude

      frequency *= this._lacunarity
      amplitude *= this._persistance
    }

    // 归一化到 0~1
    const normalized = result / maxAmplitude

    // 应用重分布（调整高度分布曲线）
    return normalized ** this._redistribution
  }
}
