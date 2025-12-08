/**
 * 地形渲染器
 * 使用 InstancedMesh 高效渲染 TerrainDataManager 产出的地形数据
 */

import * as THREE from 'three'
import CustomShaderMaterial from 'three-custom-shader-material/vanilla'
import fragmentShader from '../../shaders/terrain/fragment.glsl'
import vertexShader from '../../shaders/terrain/vertex.glsl'
import Experience from '../experience.js'
import emitter from '../utils/event-bus.js'

export default class TerrainRenderer {
  constructor(dataManager) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.debug = this.experience.debug
    this.resources = this.experience.resources

    // 引用数据管理器
    this.dataManager = dataManager

    // 渲染参数
    this.params = {
      scale: 1, // 整体缩放
      heightScale: 3, // 高度缩放系数（z 方向）
    }

    // 用于矩阵更新的临时 Object3D
    this._tempObject = new THREE.Object3D()

    // InstancedMesh 实例
    this.instancedMesh = null
    this.group = null // 容器组，用于旋转

    // 初始化
    this._createInstancedMesh()
    this._setupEventListeners()

    // 首次更新
    this.updateFromData()

    // 调试面板
    if (this.debug.active) {
      this.debugInit()
    }
  }

  /**
   * 创建 InstancedMesh
   */
  _createInstancedMesh() {
    const { resolution } = this.dataManager.params
    const instanceCount = resolution * resolution

    // 创建方块几何体（BoxGeometry）- 单位立方体
    this.geometry = new THREE.BoxGeometry(1, 1, 1)

    // 获取纹理
    const topTexture = this.resources.items.grass_block_top_texture
    const sideTexture = this.resources.items.grass_block_side_texture

    // 设置纹理参数
    if (topTexture) {
      topTexture.magFilter = THREE.NearestFilter
      topTexture.minFilter = THREE.NearestFilter
      topTexture.colorSpace = THREE.SRGBColorSpace
    }
    if (sideTexture) {
      sideTexture.magFilter = THREE.NearestFilter
      sideTexture.minFilter = THREE.NearestFilter
      sideTexture.colorSpace = THREE.SRGBColorSpace
    }

    // 创建材质 - 使用 CustomShaderMaterial
    this.material = new CustomShaderMaterial({
      baseMaterial: THREE.MeshPhongMaterial,
      vertexShader,
      fragmentShader,
      uniforms: {
        uTopTexture: { value: topTexture },
        uSideTexture: { value: sideTexture },
        uTime: { value: 0 },
      },
      flatShading: true,
      metalness: 0,
      roughness: 0.7,
    })

    // 创建 InstancedMesh
    this.instancedMesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      instanceCount,
    )

    // 配置阴影
    // this.instancedMesh.castShadow = true
    this.instancedMesh.receiveShadow = true

    // 创建容器组
    this.group = new THREE.Group()
    // this.group.rotation.x = -Math.PI / 2 // 移除旋转，使局部 Y 轴依然指向世界 Y
    this.group.add(this.instancedMesh)

    // 添加到场景
    this.scene.add(this.group)
  }

  /**
   * 设置事件监听
   */
  _setupEventListeners() {
    // 监听地形数据更新事件
    emitter.on('terrain:updated', () => {
      this.updateFromData()
    })
  }

  /**
   * 从数据管理器更新 InstancedMesh
   */
  updateFromData() {
    if (!this.instancedMesh || !this.dataManager.dataBlocks.length)
      return

    const { dataBlocks } = this.dataManager
    const { scale, heightScale } = this.params
    const waterLevel = this.dataManager.params.waterLevel

    // 检查实例数量是否需要更新
    const newCount = dataBlocks.length
    if (newCount !== this.instancedMesh.count) {
      this._recreateInstancedMesh(newCount)
    }

    // 遍历数据块，更新每个实例
    for (let i = 0; i < dataBlocks.length; i++) {
      const block = dataBlocks[i]

      // 计算可见高度（水下区域显示为水面高度）
      let visibleHeight = block.height
      if (block.height < waterLevel) {
        visibleHeight = waterLevel
      }

      // 设置位置：x, z 为平面坐标，y 为高度
      // 之前因为旋转，y 对应 Z 轴。现在不旋转了，block.y 直接对应 z
      this._tempObject.position.set(
        block.x,
        visibleHeight * heightScale,
        block.y,
      )
      this._tempObject.updateMatrix()

      // 设置变换矩阵
      this.instancedMesh.setMatrixAt(i, this._tempObject.matrix)

      // 设置颜色（使用 dataManager 计算的颜色）
      this.instancedMesh.setColorAt(i, block.color)
    }

    // 更新整体缩放
    this.group.scale.setScalar(scale)

    // 标记需要更新
    this.instancedMesh.instanceMatrix.needsUpdate = true
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true
    }

    // 更新包围盒（用于视锥剔除）
    this.instancedMesh.computeBoundingSphere()
  }

  /**
   * 重新创建 InstancedMesh（当实例数量变化时）
   */
  _recreateInstancedMesh(newCount) {
    // 移除旧的
    if (this.instancedMesh) {
      this.group.remove(this.instancedMesh)
      this.instancedMesh.dispose()
    }

    // 创建新的
    this.instancedMesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      newCount,
    )

    // this.instancedMesh.castShadow = true
    this.instancedMesh.receiveShadow = true

    this.group.add(this.instancedMesh)
  }

  /**
   * 更新单个方块颜色（用于交互）
   */
  setBlockColor(index, color) {
    if (this.instancedMesh && index >= 0 && index < this.instancedMesh.count) {
      this.instancedMesh.setColorAt(index, color)
      this.instancedMesh.instanceColor.needsUpdate = true
    }
  }

  /**
   * 根据世界坐标获取方块索引
   */
  getBlockIndexAt(worldX, worldZ) {
    const { resolution } = this.dataManager.params
    const halfSize = resolution / 2

    const indexX = Math.floor(worldX + halfSize)
    const indexZ = Math.floor(worldZ + halfSize)

    if (indexX >= 0 && indexX < resolution && indexZ >= 0 && indexZ < resolution) {
      return indexZ * resolution + indexX
    }
    return -1
  }

  /**
   * 初始化调试面板
   */
  debugInit() {
    this.debugFolder = this.debug.ui.addFolder({
      title: '地形渲染器',
      expanded: true,
    })

    // ----- 渲染参数 -----
    const renderFolder = this.debugFolder.addFolder({
      title: '渲染参数',
      expanded: true,
    })

    renderFolder.addBinding(this.params, 'scale', {
      label: '整体缩放',
      min: 0.1,
      max: 3,
      step: 0.1,
    }).on('change', () => {
      this.updateFromData()
    })

    renderFolder.addBinding(this.params, 'heightScale', {
      label: '高度缩放',
      min: 1,
      max: 10,
      step: 0.5,
    }).on('change', () => {
      this.updateFromData()
    })

    // ----- 材质参数 -----
    const matFolder = this.debugFolder.addFolder({
      title: '材质参数',
      expanded: false,
    })

    matFolder.addBinding(this.material, 'flatShading', {
      label: '扁平着色',
    }).on('change', () => {
      this.material.needsUpdate = true
    })

    // ----- 统计信息 -----
    const statsFolder = this.debugFolder.addFolder({
      title: '统计信息',
      expanded: false,
    })

    this._statsParams = {
      instanceCount: this.instancedMesh?.count || 0,
    }

    statsFolder.addBinding(this._statsParams, 'instanceCount', {
      label: '实例数量',
      readonly: true,
    })
  }

  /**
   * 销毁资源
   */
  dispose() {
    emitter.off('terrain:updated')

    if (this.group) {
      this.scene.remove(this.group)
    }

    if (this.instancedMesh) {
      this.instancedMesh.dispose()
    }

    if (this.geometry) {
      this.geometry.dispose()
    }

    if (this.material) {
      this.material.dispose()
    }
  }
}
