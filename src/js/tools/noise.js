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
/**
 * Simplex 噪声生成器（支持 2D / 3D）
 * 实现参考 Stefan Gustavson 的经典算法
 */
export class Simplex {
  constructor(seed = 1) {
    this.perm = new Uint8Array(512)
    this.grad3 = [
      new Vector3(1, 1, 0),
      new Vector3(-1, 1, 0),
      new Vector3(1, -1, 0),
      new Vector3(-1, -1, 0),
      new Vector3(1, 0, 1),
      new Vector3(-1, 0, 1),
      new Vector3(1, 0, -1),
      new Vector3(-1, 0, -1),
      new Vector3(0, 1, 1),
      new Vector3(0, -1, 1),
      new Vector3(0, 1, -1),
      new Vector3(0, -1, -1),
    ]

    // 初始化排列表
    let s = seed
    if (s === 0)
      s = 1
    const perm = []
    for (let i = 0; i < 256; i++) {
      s = (s * 1664525 + 1013904223) % 0x100000000
      perm[i] = (p[i] + s) & 255
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = perm[i & 255]
    }
  }

  _dot(g, x, y, z = 0) {
    return g.x * x + g.y * y + g.z * z
  }

  get2(input) {
    const { x, y } = input
    const F2 = 0.5 * (Math.sqrt(3) - 1)
    const G2 = (3 - Math.sqrt(3)) / 6

    const s = (x + y) * F2
    const i = Math.floor(x + s)
    const j = Math.floor(y + s)
    const t = (i + j) * G2
    const X0 = i - t
    const Y0 = j - t
    const x0 = x - X0
    const y0 = y - Y0

    let i1
    let j1
    if (x0 > y0) {
      i1 = 1
      j1 = 0
    }
    else {
      i1 = 0
      j1 = 1
    }

    const x1 = x0 - i1 + G2
    const y1 = y0 - j1 + G2
    const x2 = x0 - 1 + 2 * G2
    const y2 = y0 - 1 + 2 * G2

    const ii = i & 255
    const jj = j & 255

    const gi0 = this.perm[ii + this.perm[jj]] % 12
    const gi1 = this.perm[ii + i1 + this.perm[jj + j1]] % 12
    const gi2 = this.perm[ii + 1 + this.perm[jj + 1]] % 12

    let n0 = 0
    let n1 = 0
    let n2 = 0

    let t0 = 0.5 - x0 * x0 - y0 * y0
    if (t0 >= 0) {
      t0 *= t0
      n0 = t0 * t0 * this._dot(this.grad3[gi0], x0, y0)
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1
    if (t1 >= 0) {
      t1 *= t1
      n1 = t1 * t1 * this._dot(this.grad3[gi1], x1, y1)
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2
    if (t2 >= 0) {
      t2 *= t2
      n2 = t2 * t2 * this._dot(this.grad3[gi2], x2, y2)
    }

    // 返回范围约 [-1, 1]
    return 70 * (n0 + n1 + n2)
  }

  get3(input) {
    const { x, y, z } = input
    const F3 = 1 / 3
    const G3 = 1 / 6

    const s = (x + y + z) * F3
    const i = Math.floor(x + s)
    const j = Math.floor(y + s)
    const k = Math.floor(z + s)
    const t = (i + j + k) * G3
    const X0 = i - t
    const Y0 = j - t
    const Z0 = k - t
    const x0 = x - X0
    const y0 = y - Y0
    const z0 = z - Z0

    let i1
    let j1
    let k1
    let i2
    let j2
    let k2

    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1
        j1 = 0
        k1 = 0
        i2 = 1
        j2 = 1
        k2 = 0
      }
      else if (x0 >= z0) {
        i1 = 1
        j1 = 0
        k1 = 0
        i2 = 1
        j2 = 0
        k2 = 1
      }
      else {
        i1 = 0
        j1 = 0
        k1 = 1
        i2 = 1
        j2 = 0
        k2 = 1
      }
    }
    else {
      if (y0 < z0) {
        i1 = 0
        j1 = 0
        k1 = 1
        i2 = 0
        j2 = 1
        k2 = 1
      }
      else if (x0 < z0) {
        i1 = 0
        j1 = 1
        k1 = 0
        i2 = 0
        j2 = 1
        k2 = 1
      }
      else {
        i1 = 0
        j1 = 1
        k1 = 0
        i2 = 1
        j2 = 1
        k2 = 0
      }
    }

    const x1 = x0 - i1 + G3
    const y1 = y0 - j1 + G3
    const z1 = z0 - k1 + G3
    const x2 = x0 - i2 + 2 * G3
    const y2 = y0 - j2 + 2 * G3
    const z2 = z0 - k2 + 2 * G3
    const x3 = x0 - 1 + 3 * G3
    const y3 = y0 - 1 + 3 * G3
    const z3 = z0 - 1 + 3 * G3

    const ii = i & 255
    const jj = j & 255
    const kk = k & 255

    const gi0 = this.perm[ii + this.perm[jj + this.perm[kk]]] % 12
    const gi1 = this.perm[ii + i1 + this.perm[jj + j1 + this.perm[kk + k1]]] % 12
    const gi2 = this.perm[ii + i2 + this.perm[jj + j2 + this.perm[kk + k2]]] % 12
    const gi3 = this.perm[ii + 1 + this.perm[jj + 1 + this.perm[kk + 1]]] % 12

    let n0 = 0
    let n1 = 0
    let n2 = 0
    let n3 = 0

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0
    if (t0 >= 0) {
      t0 *= t0
      n0 = t0 * t0 * this._dot(this.grad3[gi0], x0, y0, z0)
    }

    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1
    if (t1 >= 0) {
      t1 *= t1
      n1 = t1 * t1 * this._dot(this.grad3[gi1], x1, y1, z1)
    }

    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2
    if (t2 >= 0) {
      t2 *= t2
      n2 = t2 * t2 * this._dot(this.grad3[gi2], x2, y2, z2)
    }

    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3
    if (t3 >= 0) {
      t3 *= t3
      n3 = t3 * t3 * this._dot(this.grad3[gi3], x3, y3, z3)
    }

    // 返回范围约 [-1, 1]
    return 32 * (n0 + n1 + n2 + n3)
  }
}

/**
 * 分形布朗运动（FBM）噪声生成器
 * 通过叠加多个不同频率和振幅的噪声（Perlin 或 Simplex）来创建更自然的地形
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
    const { seed, scale, persistance, lacunarity, octaves, redistribution, noiseType } = options
    this._noise = (noiseType === 'simplex') ? new Simplex(seed) : new Perlin(seed)
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
