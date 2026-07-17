/**
 * TerrainChunk：无限地形中的单个数据 chunk。
 * - 每个 chunk 拥有独立的 TerrainContainer
 * - 使用世界原点偏移生成连续地形数据
 * - 渲染对象由 ChunkManager 的固定槽位池统一拥有
 */
import TerrainContainer from './terrain-container.js'
import TerrainGenerator from './terrain-generator.js'

export default class TerrainChunk {
  /**
   * @param {{
   *  chunkX:number,
   *  chunkZ:number,
   *  chunkWidth:number,
   *  chunkHeight:number,
   *  seed:number,
   *  terrain?: { scale?:number, magnitude?:number, offset?:number, rockExpose?: { maxDepth?:number, slopeThreshold?:number } },
   *  sharedTerrainParams?: object,
   *  sharedTreeParams?: object,
   *  sharedWaterParams?: object,
   *  sharedBiomeGenerator?: object,
   *  biomeSource?: string,
   *  forcedBiome?: string,
   * }} options
   */
  constructor(options) {
    const {
      chunkX,
      chunkZ,
      chunkWidth,
      chunkHeight,
      seed,
      terrain,
      sharedTerrainParams,
      sharedTreeParams,
      sharedWaterParams,
      sharedBiomeGenerator,
      biomeSource,
      forcedBiome,
    } = options

    this.chunkX = chunkX
    this.chunkZ = chunkZ
    this.userData = { x: chunkX, z: chunkZ }
    this.state = 'init'

    this.originX = chunkX * chunkWidth
    this.originZ = chunkZ * chunkWidth

    this.container = new TerrainContainer(
      { width: chunkWidth, height: chunkHeight },
      { useSingleton: false },
    )

    this.generator = new TerrainGenerator({
      size: { width: chunkWidth, height: chunkHeight },
      container: this.container,
      seed,
      terrain,
      sharedTerrainParams,
      sharedTreeParams,
      sharedWaterParams,
      sharedBiomeGenerator,
      originX: this.originX,
      originZ: this.originZ,
      biomeSource,
      forcedBiome,
      autoGenerate: false,
      broadcast: false,
      debugEnabled: false,
    })
  }

  /** 生成数据；重复调用不会重新生成。 */
  generateData() {
    if (this.state === 'disposed' || this.state !== 'init')
      return false

    this.generator.generate()

    this.state = 'dataReady'
    return true
  }

  /** 全量重新生成数据。 */
  regenerate(params = {}) {
    if (this.state === 'disposed')
      return

    this.generator.updateParams(params)
    this.generator.generate()
    this.state = 'dataReady'
  }

  /** 释放数据 chunk 的生命周期状态。 */
  dispose() {
    if (this.state === 'disposed')
      return

    this.state = 'disposed'
  }
}
