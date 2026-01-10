/**
 * 噪声工具函数
 * 提供 fBm（分形布朗运动）噪声生成功能
 */

/**
 * 生成 2D fBm（分形布朗运动）噪声
 * 通过叠加多个不同频率和振幅的 Simplex 噪声来创建更自然的地形
 *
 * @param {SimplexNoise} simplex - SimplexNoise 实例
 * @param {number} x - 世界 X 坐标
 * @param {number} z - 世界 Z 坐标
 * @param {object} options - 配置选项
 * @param {number} options.octaves - 八度数，叠加的噪声层数（默认 5）
 * @param {number} options.gain - 振幅衰减系数（persistence），默认 0.5
 * @param {number} options.lacunarity - 频率倍增系数，默认 2.0
 * @param {number} options.scale - 基础缩放（从 terrain params 传入）
 * @returns {number} 归一化噪声值 [-1, 1]
 */
export function fbm2D(simplex, x, z, options = {}) {
  const {
    octaves = 5,
    gain = 0.5,
    lacunarity = 2.0,
    scale = 35,
  } = options

  let result = 0
  let amplitude = 1
  let frequency = 1
  let maxAmplitude = 0

  // 叠加多个八度的噪声
  for (let i = 0; i < octaves; i++) {
    // 计算当前八度的采样坐标
    const sampleX = x / (scale / frequency)
    const sampleZ = z / (scale / frequency)

    // 获取 Simplex 噪声值（范围约 [-1, 1]）
    const noiseVal = simplex.noise(sampleX, sampleZ)

    // 累加加权噪声值
    result += noiseVal * amplitude
    maxAmplitude += amplitude

    // 更新频率和振幅（为下一层做准备）
    frequency *= lacunarity
    amplitude *= gain
  }

  // 归一化到 [-1, 1] 范围
  return result / maxAmplitude
}
