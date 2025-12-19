import * as THREE from 'three'
import CameraRig from '../camera/camera-rig.js'
import Experience from '../experience.js'
import BlockRaycaster from '../interaction/block-raycaster.js'
import BlockSelectionHelper from '../interaction/block-selection-helper.js'
import emitter from '../utils/event-bus.js'
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
      seed: 1265,
      terrain: {
        // 与 TerrainGenerator 默认保持一致，可后续接 Debug/Pinia
        scale: 35,
        magnitude: 0.20,
        // offset 为“高度偏移（方块层数）”
        offset: 3,
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

      // ===== 射线拾取 + 选中辅助 =====
      // 注意：此模块仅用于“指向提示/后续交互”，不会直接改动地形数据
      this.blockRaycaster = new BlockRaycaster({
        chunkManager: this.chunkManager,
        maxDistance: 10,
        useMouse: false, // 默认屏幕中心（PointerLock/FPS 交互）
      })
      this.blockSelectionHelper = new BlockSelectionHelper({
        enabled: true,
      })

      // ===== 交互事件绑定：删除方块 =====
      emitter.on('input:mouse_down', (event) => {
        // 0 为左键（通常用于破坏/删除）
        if (event.button === 0 && this.blockRaycaster?.current) {
          const { worldBlock } = this.blockRaycaster.current
          this.chunkManager.removeBlockWorld(worldBlock.x, worldBlock.y, worldBlock.z)
        }
      })
    })
  }

  update() {
    // Step2：先做 chunk streaming，确保玩家碰撞查询能尽量命中已加载 chunk
    if (this.chunkManager && this.player) {
      const pos = this.player.getPosition()
      this.chunkManager.updateStreaming({ x: pos.x, z: pos.z })
      this.chunkManager.pumpIdleQueue()
    }

    if (this.player)
      this.player.update()
    if (this.floor)
      this.floor.update()
    if (this.environment)
      this.environment.update()

    // 每帧射线检测：用于 hover 提示与后续交互
    if (this.blockRaycaster)
      this.blockRaycaster.update()
  }
}
