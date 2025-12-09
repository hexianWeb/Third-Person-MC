/**
 * 地形渲染器（按方块类型分组 InstancedMesh）
 * 读取 TerrainContainer 中的数据，按方块 id 分组实例化，支持遮挡剔除
 */
import * as THREE from 'three'
import Experience from '../experience.js'
import emitter from '../utils/event-bus.js'
import { blocks, createMaterials, resources, sharedGeometry } from './blocks-config.js'
import TerrainContainer from './terrain-container.js'

// 将 id -> 配置映射缓存，避免每次遍历 Object.values
const BLOCK_BY_ID = Object.values(blocks).reduce((map, item) => {
  map[item.id] = item
  return map
}, {})
const RESOURCE_IDS = new Set(resources.map(r => r.id))

export default class TerrainRenderer {
  constructor(container) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources
    this.debug = this.experience.debug

    // 绑定容器（默认单例）
    this.container = container || new TerrainContainer()

    // 渲染参数
    this.params = {
      scale: 1, // 整体缩放
      heightScale: 1, // 高度缩放，仅作用于 y 轴
      showOresOnly: false, // 仅显示矿产
    }

    this.group = new THREE.Group()
    this.scene.add(this.group)

    this._tempObject = new THREE.Object3D()
    this._blockMeshes = new Map()
    this._statsParams = {
      totalInstances: 0,
    }
    this._statsBinding = null

    // 事件绑定
    this._handleDataReady = this._handleDataReady.bind(this)
    emitter.on('terrain:data-ready', this._handleDataReady)

    // 若容器已有数据，立即绘制
    this._rebuildFromContainer()

    if (this.debug.active) {
      this.debugInit()
    }
  }

  /**
   * 响应数据就绪事件
   */
  _handleDataReady(payload) {
    if (payload?.container)
      this.container = payload.container
    this._rebuildFromContainer()
  }

  /**
   * 重新根据容器构建所有 InstancedMesh
   */
  _rebuildFromContainer() {
    if (!this.container)
      return

    this._disposeChildren()

    const positionsByBlock = new Map()

    // 收集可见方块的位置
    this.container.forEachFilled((block, x, y, z) => {
      if (this.container.isBlockObscured(x, y, z))
        return

      if (this.params.showOresOnly && !RESOURCE_IDS.has(block.id))
        return

      const list = positionsByBlock.get(block.id) || []
      list.push({ x, y, z })
      positionsByBlock.set(block.id, list)
    })

    // 为每种方块创建 InstancedMesh
    positionsByBlock.forEach((positions, blockId) => {
      const blockType = BLOCK_BY_ID[blockId]
      if (!blockType || !blockType.visible)
        return

      const materials = createMaterials(blockType, this.resources.items)
      if (!materials)
        return

      const mesh = new THREE.InstancedMesh(sharedGeometry, materials, positions.length)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.receiveShadow = true

      positions.forEach((pos, index) => {
        this._tempObject.position.set(
          pos.x,
          pos.y * this.params.heightScale,
          pos.z,
        )
        this._tempObject.updateMatrix()
        mesh.setMatrixAt(index, this._tempObject.matrix)
      })

      mesh.instanceMatrix.needsUpdate = true
      this.group.add(mesh)
      this._blockMeshes.set(blockId, mesh)
    })

    // 更新统计
    this._statsParams.totalInstances = Array.from(this._blockMeshes.values())
      .reduce((sum, mesh) => sum + mesh.count, 0)

    // 应用整体缩放
    this.group.scale.setScalar(this.params.scale)

    this._updateStatsPanel()
  }

  /**
   * 调试面板
   */
  debugInit() {
    this.debugFolder = this.debug.ui.addFolder({
      title: '地形渲染器',
      expanded: true,
    })

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
      this.group.scale.setScalar(this.params.scale)
    })

    renderFolder.addBinding(this.params, 'heightScale', {
      label: '高度缩放',
      min: 0.5,
      max: 5,
      step: 0.1,
    }).on('change', () => {
      // 重新刷写矩阵
      this._rebuildFromContainer()
    })

    renderFolder.addBinding(this.params, 'showOresOnly', {
      label: '仅显示矿产',
    }).on('change', () => {
      this._rebuildFromContainer()
    })

    const statsFolder = this.debugFolder.addFolder({
      title: '统计信息',
      expanded: false,
    })
    this._statsBinding = statsFolder.addBinding(this._statsParams, 'totalInstances', {
      label: '实例总数',
      readonly: true,
    })
  }

  /**
   * 刷新统计显示（避免面板未初始化时报错）
   */
  _updateStatsPanel() {
    if (this._statsBinding?.refresh)
      this._statsBinding.refresh()
  }

  /**
   * 清理当前所有实例
   */
  _disposeChildren() {
    this._blockMeshes.forEach((mesh) => {
      if (mesh.material) {
        if (Array.isArray(mesh.material))
          mesh.material.forEach(mat => mat?.dispose?.())
        else
          mesh.material.dispose()
      }
      this.group.remove(mesh)
      mesh.dispose?.()
    })
    this._blockMeshes.clear()
  }

  /**
   * 释放资源
   */
  dispose() {
    emitter.off('terrain:data-ready', this._handleDataReady)
    this._disposeChildren()
    this.scene.remove(this.group)
  }
}
