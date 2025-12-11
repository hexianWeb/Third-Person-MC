import * as THREE from 'three'
import Experience from '../experience.js'
import Environment from './environment.js'
import Floor from './floor.js'
import Player from './player.js'
import TerrainGenerator from './terrain/terrain-generator.js'
import TerrainRenderer from './terrain/terrain-renderer.js'

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

    // 初始化地形生成器（不依赖资源加载）
    this.terrainGenerator = new TerrainGenerator({
      size: { width: 128, height: 10 },
      noiseScale: 0.08,
      heightRatio: 0.75,
    })
    // 暴露给 Experience，方便其他组件读取
    this.experience.terrainContainer = this.terrainGenerator.container
    this.experience.terrainHeightMap = this.terrainGenerator.heightMap

    // Environment
    this.resources.on('ready', () => {
      // 初始化地形渲染器（按方块类型分组实例化）
      // 必须在资源加载完成后创建，否则纹理为空
      this.terrainRenderer = new TerrainRenderer(this.terrainGenerator.container)

      // Setup
      this.player = new Player()
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
