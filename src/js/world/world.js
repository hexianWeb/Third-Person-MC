import * as THREE from 'three'
import Experience from '../experience.js'
import Environment from './environment.js'
import Floor from './floor.js'
import Player from './player.js'
import TerrainDataManager from './terrain-data-manager.js'
import TerrainRenderer from './terrain-renderer.js'

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

    // 添加基础光源（确保地形能被照亮）
    this._setupBasicLights()

    // 初始化地形数据管理器（不依赖资源加载）
    // 由于是单例模式，这里获取的是同一个实例
    this.terrainDataManager = new TerrainDataManager({
      resolution: 128, // 128x128 方块
      scale: 0.05, // 噪声缩放
      heightMultiplier: 1, // 高度倍数
    })
    // 将单例挂载到 Experience 上，供 MiniMap 等组件使用
    this.experience.terrainDataManager = this.terrainDataManager

    // Environment
    this.resources.on('ready', () => {
      // 初始化地形渲染器（使用 InstancedMesh）
      // 必须在资源加载完成后创建，否则纹理为空
      this.terrainRenderer = new TerrainRenderer(this.terrainDataManager)

      // Setup
      this.player = new Player()
      this.environment = new Environment()
    })
  }

  /**
   * 设置基础光源
   */
  _setupBasicLights() {
    // 环境光 - 提供基础照明
    this.ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.6)
    this.scene.add(this.ambientLight)

    // 方向光 - 为地形提供主要照明
    this.directionalLight = new THREE.DirectionalLight(0xFFFFFF, 1.0)
    this.directionalLight.position.set(50, 100, 50)
    this.directionalLight.castShadow = true
    this.directionalLight.shadow.camera.left = -100
    this.directionalLight.shadow.camera.right = 100
    this.directionalLight.shadow.camera.top = 100
    this.directionalLight.shadow.camera.bottom = -100
    this.directionalLight.shadow.camera.far = 200
    this.scene.add(this.directionalLight)
  }

  update() {
    if (this.player)
      this.player.update()
    if (this.floor)
      this.floor.update()
  }
}
