/**
 * BiomeGenerator - 群系生成器
 * 基于温度/湿度噪声图自动生成群系，支持平滑过渡
 *
 * 核心功能：
 * - 使用独立的 Simplex 噪声生成温度/湿度分布
 * - 根据温度/湿度确定群系类型
 * - 边界区域计算混合权重，实现平滑过渡
 * - chunk 级别缓存，避免重复计算
 */
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js'
import { RNG } from '../../tools/rng.js'
import { BIOMES } from './biome-config.js'

export default class BiomeGenerator {
  /**
   * @param {number} seed - 随机种子
   * @param {object} options - 配置选项
   */
  constructor(seed, options = {}) {
    // 使用独立的 seed 偏移确保温度/湿度独立
    const rngTemp = new RNG(seed + 1000)
    const rngHumidity = new RNG(seed + 2000)

    this.tempNoise = new SimplexNoise(rngTemp)
    this.humidityNoise = new SimplexNoise(rngHumidity)

    // 噪声缩放参数（可配置）
    this.tempScale = options.tempScale ?? 200 // Temperature noise scale (larger = smoother)
    this.humidityScale = options.humidityScale ?? 200 // Humidity noise scale

    // Edge transition threshold
    this.transitionThreshold = options.transitionThreshold ?? 0.15

    // Cache: avoid repeated calculation
    // key: "originX,originZ" (chunk origin world coordinates)
    this.biomeCache = new Map()
  }

  /**
   * Generate biome map for entire chunk (batch calculation)
   * @param {number} originX - Chunk origin world X coordinate
   * @param {number} originZ - Chunk origin world Z coordinate
   * @param {number} chunkWidth - Chunk width
   * @returns {Array<Array<BiomeData>>} Biome map [x][z]
   */
  generateBiomeMap(originX, originZ, chunkWidth) {
    const cacheKey = `${originX},${originZ}`

    // Check cache
    if (this.biomeCache.has(cacheKey)) {
      return this.biomeCache.get(cacheKey)
    }

    const biomeMap = []

    for (let x = 0; x < chunkWidth; x++) {
      biomeMap[x] = []
      for (let z = 0; z < chunkWidth; z++) {
        const wx = originX + x
        const wz = originZ + z

        // Get temperature/humidity (normalized to 0-1)
        const temp = this._getTemperature(wx, wz)
        const humidity = this._getHumidity(wx, wz)

        // Determine biome
        const biomeId = this._getBiome(temp, humidity)

        // Calculate blend weights (for border regions)
        const weights = this._getBiomeWeights(temp, humidity)

        biomeMap[x][z] = {
          biome: biomeId,
          temp,
          humidity,
          weights, // null means single biome, otherwise { biomeId: weight, ... }
        }
      }
    }

    // Cache result
    this.biomeCache.set(cacheKey, biomeMap)

    return biomeMap
  }

  /**
   * Get single position biome data (for external queries)
   * @param {number} wx - World X coordinate
   * @param {number} wz - World Z coordinate
   * @returns {object} Biome data
   */
  getBiomeAt(wx, wz) {
    const temp = this._getTemperature(wx, wz)
    const humidity = this._getHumidity(wx, wz)
    const biomeId = this._getBiome(temp, humidity)
    const weights = this._getBiomeWeights(temp, humidity)

    return {
      biome: biomeId,
      temp,
      humidity,
      weights,
    }
  }

  /**
   * Get temperature at specified position (0-1)
   * @private
   */
  _getTemperature(wx, wz) {
    const noise = this.tempNoise.noise(wx / this.tempScale, wz / this.tempScale)
    return noise * 0.5 + 0.5 // Normalize to [0, 1]
  }

  /**
   * Get humidity at specified position (0-1)
   * @private
   */
  _getHumidity(wx, wz) {
    const noise = this.humidityNoise.noise(wx / this.humidityScale, wz / this.humidityScale)
    return noise * 0.5 + 0.5 // Normalize to [0, 1]
  }

  /**
   * Determine biome based on temperature/humidity
   * @private
   */
  _getBiome(temp, humidity) {
    // Traverse all biomes, find matching one
    for (const biome of Object.values(BIOMES)) {
      // Skip biomes without climate config
      if (!biome.tempRange || !biome.humidityRange)
        continue

      const tempInRange = temp >= biome.tempRange[0] && temp <= biome.tempRange[1]
      const humidityInRange = humidity >= biome.humidityRange[0] && humidity <= biome.humidityRange[1]

      if (tempInRange && humidityInRange) {
        return biome.id
      }
    }

    // Default biome (plains)
    return 'plains'
  }

  /**
   * Calculate biome blend weights (smooth transition)
   * Returns null for single biome, otherwise returns weight object
   * @private
   */
  _getBiomeWeights(temp, humidity) {
    const candidates = []
    const threshold = this.transitionThreshold

    // Find all "nearby" biomes
    for (const biome of Object.values(BIOMES)) {
      // Skip biomes without climate config
      if (!biome.tempRange || !biome.humidityRange)
        continue

      // Calculate distance to biome center
      const tempCenter = (biome.tempRange[0] + biome.tempRange[1]) / 2
      const humidityCenter = (biome.humidityRange[0] + biome.humidityRange[1]) / 2
      const tempRange = (biome.tempRange[1] - biome.tempRange[0]) / 2
      const humidityRange = (biome.humidityRange[1] - biome.humidityRange[0]) / 2

      // Normalized distance (considering range size)
      const tempDist = Math.abs(temp - tempCenter) / Math.max(tempRange, 0.1)
      const humidityDist = Math.abs(humidity - humidityCenter) / Math.max(humidityRange, 0.1)
      const totalDist = Math.sqrt(tempDist ** 2 + humidityDist ** 2)

      if (totalDist < 1 + threshold) {
        candidates.push({ biomeId: biome.id, dist: totalDist })
      }
    }

    // If only one candidate, return null (single biome)
    if (candidates.length <= 1) {
      return null
    }

    // Convert to weights (closer = higher weight)
    const weights = {}
    const totalInvDist = candidates.reduce((sum, c) => sum + 1 / (c.dist + 0.01), 0)

    candidates.forEach((c) => {
      weights[c.biomeId] = (1 / (c.dist + 0.01)) / totalInvDist
    })

    return weights
  }

  /**
   * Clear cache (call when chunk unloads)
   * @param {number} originX - Chunk origin X
   * @param {number} originZ - Chunk origin Z
   */
  clearCache(originX, originZ) {
    const cacheKey = `${originX},${originZ}`
    this.biomeCache.delete(cacheKey)
  }

  /**
   * Clear all cache
   */
  clearAllCache() {
    this.biomeCache.clear()
  }

  /**
   * Update noise parameters (requires cache clear)
   * @param {object} params - Parameters to update
   */
  updateParams(params = {}) {
    if (params.tempScale !== undefined) {
      this.tempScale = params.tempScale
    }
    if (params.humidityScale !== undefined) {
      this.humidityScale = params.humidityScale
    }
    if (params.transitionThreshold !== undefined) {
      this.transitionThreshold = params.transitionThreshold
    }

    // Clear cache after parameter change
    this.clearAllCache()
  }
}
