import * as THREE from 'three'
import CameraRig from '../camera/camera-rig.js'
import Experience from '../experience.js'
import Environment from './environment.js'
import Floor from './floor.js'
import Player from './player.js'
import ChunkManager from './terrain/chunk-manager.js'

export default class World {
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources

    this.scene.add(new THREE.AxesHelper(5))
    this.floor = new Floor(128, 1)
    // 隐藏原本的 Grid 地板，只保留物理
    if (this.floor.grid)
      this.floor.grid.visible = false

    // ===== Step1：初始化 3×3 chunk 管理器（渲染依赖资源 ready）=====
    this.chunkManager = new ChunkManager({
      chunkWidth: 64,
      chunkHeight: 32,
      viewDistance: 1, // 3×3
      seed: 1337,
      terrain: {
        // 与 TerrainGenerator 默认保持一致，可后续接 Debug/Pinia
        scale: 35,
        magnitude: 0.17,
        // offset 为“高度偏移（方块层数）”
        offset: 16,
      },
    })

    // 暴露给 Experience，供玩家碰撞/贴地等使用
    this.experience.terrainDataManager = this.chunkManager

    // Environment
    this.resources.on('ready', () => {
      // ===== 创建并渲染初始 3×3 chunks =====
      this.chunkManager.initInitialGrid()

      // 兼容旧逻辑：给相机/其他组件一个容器兜底（仅中心 chunk）
      // 注意：无限地形的正确查询应使用 experience.terrainDataManager
      const centerChunk = this.chunkManager.getChunk(0, 0)
      if (centerChunk) {
        this.experience.terrainContainer = centerChunk.container
        this.experience.terrainHeightMap = centerChunk.generator.heightMap
      }

      // Setup
      this.player = new Player()

      // Setup Camera Rig
      this.cameraRig = new CameraRig()
      this.cameraRig.attachPlayer(this.player)
      this.experience.camera.attachRig(this.cameraRig)

      this.environment = new Environment()
    })
  }

  update() {
    if (this.player)
      this.player.update()
    if (this.floor)
      this.floor.update()
  }
}
