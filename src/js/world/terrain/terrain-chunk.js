/**
 * TerrainChunk：无限地形中的单个 chunk
 * - 每个 chunk 拥有独立的 TerrainContainer（非单例）
 * - 使用 TerrainGenerator 的世界偏移(originX/originZ)生成连贯地形数据
 * - 使用 TerrainRenderer 生成 InstancedMesh，并把 renderer.group 偏移到 chunk 原点
 */
import TerrainContainer from './terrain-container.js'
import TerrainGenerator from './terrain-generator.js'
import TerrainRenderer from './terrain-renderer.js'

export default class TerrainChunk {
  /**
   * @param {{
   *  chunkX:number,
   *  chunkZ:number,
   *  chunkWidth:number,
   *  chunkHeight:number,
   *  seed:number,
   *  terrain?: { scale?:number, magnitude?:number, offset?:number }
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
      sharedRenderParams,
      sharedTerrainParams,
    } = options

    // ===== chunk 基础信息 =====
    this.chunkX = chunkX
    this.chunkZ = chunkZ
    this.userData = { x: chunkX, z: chunkZ }

    // ===== 状态机 =====
    // init -> dataReady -> meshReady -> disposed
    this.state = 'init'

    // chunk 的世界原点（左下角对齐世界坐标）
    this.originX = chunkX * chunkWidth
    this.originZ = chunkZ * chunkWidth

    // ===== chunk 数据容器（必须非单例）=====
    this.container = new TerrainContainer(
      { width: chunkWidth, height: chunkHeight },
      { useSingleton: false },
    )

    // ===== 生成地形数据（不广播全局 terrain:data-ready，避免干扰多 chunk）=====
    this.generator = new TerrainGenerator({
      size: { width: chunkWidth, height: chunkHeight },
      container: this.container,
      seed,
      terrain,
      sharedTerrainParams,
      originX: this.originX,
      originZ: this.originZ,
      // Step2：延迟生成，交由 ChunkManager 的 idle 队列调度
      autoGenerate: false,
      broadcast: false,
      debugEnabled: false,
    })

    // ===== 渲染：实例化 mesh，并把 group 放到 chunk 世界位置 =====
    // 注意：chunk 场景下不允许每个 chunk 各自创建 debug panel，否则面板会爆炸式增长
    // 渲染参数由 ChunkManager 提供 sharedRenderParams，统一控制所有 chunk
    this.renderer = new TerrainRenderer(this.container, {
      sharedParams: sharedRenderParams,
      debugEnabled: false,
      listenDataReady: false,
    })
    this.renderer.group.position.set(this.originX, 0, this.originZ)

    // 初始缩放同步一次（避免 scale 改动后新 chunk 不一致）
    this.renderer.group.scale.setScalar(sharedRenderParams?.scale ?? 1)
  }

  /**
   * 生成数据（可被重复调用，但会幂等保护）
   */
  generateData() {
    if (this.state === 'disposed')
      return false
    if (this.state !== 'init')
      return false

    this.generator.generate()
    this.state = 'dataReady'
    return true
  }

  /**
   * 构建 mesh（依赖数据 ready）
   */
  buildMesh() {
    if (this.state === 'disposed')
      return false
    if (this.state !== 'dataReady')
      return false

    this.renderer._rebuildFromContainer()
    this.state = 'meshReady'
    return true
  }

  /**
   * 释放当前 chunk 的渲染资源（用于动态卸载）
   * 注意：必须幂等，避免重复 dispose 报错
   */
  dispose() {
    if (this.state === 'disposed')
      return

    this.state = 'disposed'

    if (this.renderer) {
      this.renderer.dispose()
      this.renderer = null
    }
    // container/generator 目前不持有 WebGL 资源，无需 dispose
  }
}
