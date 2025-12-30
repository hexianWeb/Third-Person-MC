/**
 * 地形渲染器（按方块类型分组 InstancedMesh）
 * 读取 TerrainContainer 中的数据，按方块 id 分组实例化，支持遮挡剔除
 */
import * as THREE from 'three'
import { SHADOW_CONFIG, SHADOW_QUALITY, TREE_BLOCK_IDS } from '../../config/shadow-config.js'
import Experience from '../../experience.js'
import emitter from '../../utils/event-bus.js'
import { ANIMATION_DEFAULTS, blocks, createMaterials, resources, sharedGeometry } from './blocks-config.js'
import TerrainContainer from './terrain-container.js'

// 将 id -> 配置映射缓存，避免每次遍历 Object.values
const BLOCK_BY_ID = Object.values(blocks).reduce((map, item) => {
  map[item.id] = item
  return map
}, {})
const RESOURCE_IDS = new Set(resources.map(r => r.id))

export default class TerrainRenderer {
  /**
   * @param {*} container TerrainContainer
   * @param {{ sharedParams?: any, debugEnabled?: boolean, debugTitle?: string, listenDataReady?: boolean }} options
   */
  constructor(container, options = {}) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources
    this.debug = this.experience.debug
    this.time = this.experience.time

    // 绑定容器（默认单例）
    this.container = container || new TerrainContainer()

    // 渲染参数（支持外部共享：让多个 renderer 共用同一份 params）
    this.params = options.sharedParams || {
      scale: 1, // 整体缩放
      heightScale: 1, // 高度缩放，仅作用于 y 轴
      showOresOnly: false, // 仅显示矿产
    }
    this._debugEnabled = options.debugEnabled ?? false
    this._debugTitle = options.debugTitle || `地形渲染器 ${options.chunkName || ''}`.trim()
    this._listenDataReady = options.listenDataReady ?? true

    this.group = new THREE.Group()
    if (options.chunkName) {
      this.group.name = `chunk(${options.chunkName})`
    }
    this.scene.add(this.group)

    this._tempObject = new THREE.Object3D()
    this._tempMatrix = new THREE.Matrix4()
    this._blockMeshes = new Map()
    this._animatedMaterials = [] // 统一追踪所有动画材质
    this._statsParams = {
      totalInstances: 0,
    }
    this._statsBinding = null

    // 事件绑定
    this._handleDataReady = this._handleDataReady.bind(this)
    if (this._listenDataReady) {
      emitter.on('terrain:data-ready', this._handleDataReady)
    }

    // Shadow quality event listener
    this._currentShadowQuality = SHADOW_CONFIG.quality
    this._handleShadowQuality = this._handleShadowQuality.bind(this)
    emitter.on('shadow:quality-changed', this._handleShadowQuality)

    // 若容器已有数据，立即绘制
    this._rebuildFromContainer()

    if (this.debug.active && this._debugEnabled) {
      this.debugInit()
    }
  }

  /**
   * Handle shadow quality change event
   * @param {{ quality: string }} payload - Shadow quality payload
   */
  _handleShadowQuality(payload) {
    this._currentShadowQuality = payload.quality
    this._applyShadowSettings()
  }

  /**
   * Apply shadow settings to all block meshes based on current quality
   * - LOW: All blocks castShadow = false
   * - MEDIUM: Only tree blocks castShadow = true
   * - HIGH: All blocks castShadow = true
   */
  _applyShadowSettings() {
    const quality = this._currentShadowQuality

    this._blockMeshes.forEach((mesh, blockId) => {
      if (quality === SHADOW_QUALITY.LOW) {
        mesh.castShadow = false
      }
      else if (quality === SHADOW_QUALITY.MEDIUM) {
        // Only tree blocks cast shadows
        mesh.castShadow = TREE_BLOCK_IDS.has(blockId)
      }
      else {
        // HIGH quality: all blocks cast shadows
        mesh.castShadow = true
      }
    })
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

      // 收集动画材质，供 update() 统一更新时间 uniform
      const matArray = Array.isArray(materials) ? materials : [materials]
      matArray.forEach((mat) => {
        if (mat._isAnimated) {
          this._animatedMaterials.push(mat)
        }
      })

      const mesh = new THREE.InstancedMesh(sharedGeometry, materials, positions.length)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

      // castShadow is dynamically controlled by _applyShadowSettings based on quality
      mesh.receiveShadow = true

      // 射线拾取辅助信息：记录当前 InstancedMesh 对应的方块类型
      // 注意：instanceId 仍需通过 matrix 反解局部 (x,y,z)
      mesh.userData.blockId = blockId
      mesh.userData.blockName = blockType.name
      // 逆向映射：instanceId -> local grid position {x, y, z}
      mesh.userData.instanceToGrid = []

      positions.forEach((pos, index) => {
        this._tempObject.position.set(
          pos.x,
          pos.y * this.params.heightScale,
          pos.z,
        )
        this._tempObject.updateMatrix()
        mesh.setMatrixAt(index, this._tempObject.matrix)

        // 记录映射关系，方便 swap-and-pop 时更新 container
        mesh.userData.instanceToGrid[index] = { x: pos.x, y: pos.y, z: pos.z }
        this.container.setBlockInstanceId(pos.x, pos.y, pos.z, index)
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

    // Apply shadow settings based on current quality
    this._applyShadowSettings()

    this._updateStatsPanel()
  }

  /**
   * 移除单个实例 (Swap-and-pop 优化)
   * @param {THREE.InstancedMesh} mesh
   * @param {number} instanceId
   */
  removeInstance(mesh, instanceId) {
    if (!mesh || instanceId === undefined || instanceId === null)
      return
    if (instanceId >= mesh.count)
      return

    const lastIndex = mesh.count - 1

    // 如果移除的是最后一个，直接减 count 即可
    // 如果不是最后一个，则将最后一个交换到当前位置
    if (instanceId < lastIndex) {
      // 1. 获取最后一个实例的矩阵
      mesh.getMatrixAt(lastIndex, this._tempMatrix)
      // 2. 将其设置到当前被删除的位置
      mesh.setMatrixAt(instanceId, this._tempMatrix)

      // 3. 更新逆向映射和容器中的 instanceId
      const lastGridPos = mesh.userData.instanceToGrid[lastIndex]
      mesh.userData.instanceToGrid[instanceId] = lastGridPos
      this.container.setBlockInstanceId(lastGridPos.x, lastGridPos.y, lastGridPos.z, instanceId)
    }

    // 清理最后一个索引的数据（可选，主要为了内存整洁）
    mesh.userData.instanceToGrid[lastIndex] = null

    // 减少渲染总数
    mesh.count--
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    // 更新统计
    this._statsParams.totalInstances--
    this._updateStatsPanel()
  }

  /**
   * 为 (x,y,z) 处的方块创建一个新的实例（揭示被遮挡的方块）
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  addBlockInstance(x, y, z) {
    if (!this.container)
      return

    const block = this.container.getBlock(x, y, z)
    // 只有非空且还没有 instanceId 的方块才需要添加实例
    if (!block || block.id === blocks.empty.id || block.instanceId !== null) {
      return
    }

    const mesh = this._blockMeshes.get(block.id)
    if (!mesh) {
      // 如果该类型的 InstancedMesh 根本不存在，说明之前这个 chunk 里没这种方块
      // 最稳妥的方法是直接 rebuild
      this._rebuildFromContainer()
      return
    }

    // 检查 InstancedMesh 是否还有容量
    if (mesh.count < mesh.instanceMatrix.count) {
      const instanceId = mesh.count
      mesh.count++

      this._tempObject.position.set(
        x,
        y * this.params.heightScale,
        z,
      )
      this._tempObject.updateMatrix()
      mesh.setMatrixAt(instanceId, this._tempObject.matrix)

      // 更新映射关系
      mesh.userData.instanceToGrid[instanceId] = { x, y, z }
      this.container.setBlockInstanceId(x, y, z, instanceId)

      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()

      this._statsParams.totalInstances++
      this._updateStatsPanel()
    }
    else {
      // 容量不足，触发全量重建以扩容
      this._rebuildFromContainer()
    }
  }

  /**
   * 调试面板
   */
  debugInit() {
    this.debugFolder = this.debug.ui.addFolder({
      title: this._debugTitle,
      expanded: false,
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

    // 方块材质调试
    const materialsFolder = this.debugFolder.addFolder({
      title: '方块材质',
      expanded: false,
    })

    materialsFolder.addBinding(blocks.treeLeaves, 'alphaTest', {
      label: '树叶 AlphaTest',
      min: 0,
      max: 1,
      step: 0.01,
    }).on('change', () => {
      this._rebuildFromContainer()
    })

    materialsFolder.addBinding(blocks.treeLeaves, 'transparent', {
      label: '树叶 透明',
    }).on('change', () => {
      this._rebuildFromContainer()
    })

    // ===== 风动效果参数 =====
    const windFolder = this.debugFolder.addFolder({
      title: '风动效果',
      expanded: false,
    })

    windFolder.addBinding(ANIMATION_DEFAULTS.wind, 'windSpeed', {
      label: '风速',
      min: 0.5,
      max: 5,
      step: 0.1,
    }).on('change', () => {
      // 实时更新所有动画材质的 windSpeed uniform
      this._animatedMaterials.forEach((mat) => {
        if (mat.uniforms?.uWindSpeed) {
          mat.uniforms.uWindSpeed.value = ANIMATION_DEFAULTS.wind.windSpeed
        }
      })
    })

    windFolder.addBinding(ANIMATION_DEFAULTS.wind, 'swayAmplitude', {
      label: '摇摆幅度',
      min: 0,
      max: 2,
      step: 0.01,
    }).on('change', () => {
      this._animatedMaterials.forEach((mat) => {
        if (mat.uniforms?.uSwayAmplitude) {
          mat.uniforms.uSwayAmplitude.value = ANIMATION_DEFAULTS.wind.swayAmplitude
        }
      })
    })

    windFolder.addBinding(ANIMATION_DEFAULTS.wind, 'phaseScale', {
      label: '相位差',
      min: 0.1,
      max: 3,
      step: 0.1,
    }).on('change', () => {
      this._animatedMaterials.forEach((mat) => {
        if (mat.uniforms?.uPhaseScale) {
          mat.uniforms.uPhaseScale.value = ANIMATION_DEFAULTS.wind.phaseScale
        }
      })
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
   * 每帧更新：更新所有动画材质的时间 uniform
   */
  update() {
    if (this._animatedMaterials.length === 0)
      return

    // 将毫秒转换为秒
    const elapsed = this.time.elapsed * 0.001

    this._animatedMaterials.forEach((mat) => {
      if (mat.uniforms?.uTime) {
        mat.uniforms.uTime.value = elapsed
      }
    })
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
    // 清理动画材质追踪列表
    this._animatedMaterials = []
  }

  /**
   * 释放资源
   */
  dispose() {
    if (this._listenDataReady) {
      emitter.off('terrain:data-ready', this._handleDataReady)
    }
    emitter.off('shadow:quality-changed', this._handleShadowQuality)
    this._disposeChildren()
    this.scene.remove(this.group)
  }
}
