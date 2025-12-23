/**
 * TerrainChunk：无限地形中的单个 chunk
 * - 每个 chunk 拥有独立的 TerrainContainer
 * - 使用 TerrainGenerator 的世界偏移(originX/originZ)生成连贯地形数据
 * - 使用 TerrainRenderer 生成 InstancedMesh，并把 renderer.group 偏移到 chunk 原点
 * - 管理水面 mesh（水平平面，不参与射线拾取）
 */
import * as THREE from 'three'
import Experience from '../../experience.js'
import TerrainContainer from './terrain-container.js'
import TerrainGenerator from './terrain-generator.js'
import TerrainRenderer from './terrain-renderer.js'

// 水面颜色（偏蓝绿色）
const WATER_COLOR = 0x3399CC

// 水面防 z-fighting 的偏移量
const WATER_Y_EPSILON = 2.4

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
      sharedTreeParams,
      sharedWaterParams,
    } = options

    // 保存共享参数引用，供刷新时使用
    this._sharedRenderParams = sharedRenderParams
    this._sharedWaterParams = sharedWaterParams
    this._chunkWidth = chunkWidth
    this._chunkHeight = chunkHeight

    // 获取 Experience 单例实例
    this.experience = new Experience()
    this.resources = this.experience.resources

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

    // ===== chunk 数据容器=====
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
      sharedTreeParams,
      sharedWaterParams,
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
      debugEnabled: true,
      listenDataReady: false,
      chunkName: `${this.chunkX}-${this.chunkZ}`,
    })
    this.renderer.group.position.set(this.originX, 0, this.originZ)
    // 给射线拾取/交互提供 chunk 元信息（避免依赖 parent 链条猜测）
    this.renderer.group.userData.chunkX = this.chunkX
    this.renderer.group.userData.chunkZ = this.chunkZ
    this.renderer.group.userData.originX = this.originX
    this.renderer.group.userData.originZ = this.originZ

    // 初始缩放同步一次（避免 scale 改动后新 chunk 不一致）
    this.renderer.group.scale.setScalar(sharedRenderParams?.scale ?? 1)

    // ===== 水面 mesh =====
    this.waterMesh = null
    this._createWaterMesh()
  }

  // #region 水面相关方法

  /**
   * 创建水面 mesh（PlaneGeometry + MeshLambertMaterial）
   * - 覆写 raycast 使其不参与射线拾取
   * - 挂到 renderer.group 下，自动继承 chunk 世界偏移与缩放
   */
  _createWaterMesh() {
    const waterOffset = this._sharedWaterParams?.waterOffset ?? 8
    const heightScale = this._sharedRenderParams?.heightScale ?? 1

    // PlaneGeometry 默认在 XY 平面，旋转到 XZ 平面（水平）
    const geometry = new THREE.PlaneGeometry(this._chunkWidth, this._chunkWidth)
    geometry.rotateX(-Math.PI / 2)

    // 获取并设置水面贴图
    const waterTexture = this.resources.items.water_Texture
    if (waterTexture) {
      waterTexture.wrapS = THREE.RepeatWrapping
      waterTexture.wrapT = THREE.RepeatWrapping
      // 一单位长度 repeat 一次
      waterTexture.repeat.set(this._chunkWidth, this._chunkWidth)
    }

    const material = new THREE.MeshLambertMaterial({
      map: waterTexture,
      color: WATER_COLOR,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    })

    this.waterMesh = new THREE.Mesh(geometry, material)

    this.waterMesh.renderOrder = 3
    // 覆写 raycast，使其永远不命中
    this.waterMesh.raycast = () => {}
    // 标记用于调试/识别
    this.waterMesh.userData.noRaycast = true
    this.waterMesh.userData.isWater = true

    // 设置位置：中心对齐 chunk 中心，高度为 waterOffset * heightScale
    this.waterMesh.position.set(
      this._chunkWidth / 2,
      waterOffset * heightScale + WATER_Y_EPSILON,
      this._chunkWidth / 2,
    )

    this.renderer.group.add(this.waterMesh)
  }

  /**
   * 刷新水面高度（当 waterOffset 或 heightScale 变化时调用）
   */
  refreshWater() {
    if (!this.waterMesh)
      return

    const waterOffset = this._sharedWaterParams?.waterOffset ?? 8
    const heightScale = this._sharedRenderParams?.heightScale ?? 1

    this.waterMesh.position.y = waterOffset * heightScale + WATER_Y_EPSILON
  }

  /**
   * 释放水面 mesh 资源
   */
  _disposeWaterMesh() {
    if (!this.waterMesh)
      return

    this.waterMesh.geometry?.dispose()
    this.waterMesh.material?.dispose()
    this.renderer?.group?.remove(this.waterMesh)
    this.waterMesh = null
  }

  // #endregion

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
   * 每帧更新：转发到 renderer 更新动画材质
   */
  update() {
    if (this.state !== 'meshReady')
      return
    this.renderer?.update()
  }

  /**
   * 释放当前 chunk 的渲染资源（用于动态卸载）
   * 注意：必须幂等，避免重复 dispose 报错
   */
  dispose() {
    if (this.state === 'disposed')
      return

    this.state = 'disposed'

    // 释放水面 mesh
    this._disposeWaterMesh()

    if (this.renderer) {
      this.renderer.dispose()
      this.renderer = null
    }
    // container/generator 目前不持有 WebGL 资源，无需 dispose
  }
}
