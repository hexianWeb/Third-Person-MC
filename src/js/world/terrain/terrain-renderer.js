/**
 * 固定容量的方块渲染层。
 * 渲染层只管理传入父节点中的网格，不拥有全局场景或事件订阅。
 */
import * as THREE from 'three'

import { BLOCK_INSTANCE_CAPACITY } from '../../config/chunk-render-capacity.js'
import { SHADOW_CONFIG, shouldTerrainCastShadow } from '../../config/shadow-config.js'
import { blocks, getSharedBlockMaterials, resources as resourceBlocks, sharedGeometry } from './blocks-config.js'
import ChunkRenderCapacityError from './chunk-render-capacity-error.js'

const BLOCK_BY_ID = Object.values(blocks).reduce((map, item) => {
  map[item.id] = item
  return map
}, {})
const RESOURCE_IDS = new Set(resourceBlocks.map(({ id }) => id))

export default class TerrainRenderer {
  /**
   * @param {object} options 渲染层依赖
   * @param {THREE.Group} options.parent 网格所属父节点
   * @param {object} options.resources 已加载资源或资源字典
   * @param {object} options.params 共享渲染参数
   * @param {Record<string, number>} [options.capacities] 方块类型固定容量
   * @param {Function} [options.materialFactory] 共享材质工厂
   * @param {Function} [options.onMeshCreated] 网格创建回调
   */
  constructor({
    parent,
    resources,
    params,
    capacities = BLOCK_INSTANCE_CAPACITY,
    materialFactory = getSharedBlockMaterials,
    onMeshCreated,
  }) {
    this.parent = parent
    this.resources = resources
    this.params = params || {
      scale: 1,
      heightScale: 1,
      showOresOnly: false,
    }
    this.capacities = capacities
    this.materialFactory = materialFactory
    this.onMeshCreated = onMeshCreated
    this.container = null

    this._tempObject = new THREE.Object3D()
    this._tempMatrix = new THREE.Matrix4()
    this._blockMeshes = new Map()
    this._disposed = false

    this._createMeshes()
    this.parent.scale.setScalar(this.params.scale ?? 1)
  }

  _createMeshes() {
    Object.entries(this.capacities).forEach(([typeKey, capacity]) => {
      const type = blocks[typeKey]
      if (!type?.visible)
        return

      const material = this.materialFactory(type, this.resources?.items ?? this.resources)
      if (!material)
        return

      const geometry = sharedGeometry.clone()
      geometry.setAttribute('aAo', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1))
      const mesh = new THREE.InstancedMesh(geometry, material, capacity)
      const record = { mesh, capacity, type }

      this._normalizeMesh(record, typeKey)
      this.parent.add(mesh)
      this._blockMeshes.set(type.id, record)
      this.onMeshCreated?.(mesh)
    })
  }

  _normalizeMesh(record, typeKey) {
    const { mesh, capacity, type } = record
    if (mesh.instanceMatrix.count < capacity) {
      throw new ChunkRenderCapacityError({
        layer: 'blocks',
        typeId: typeKey,
        required: capacity,
        capacity: mesh.instanceMatrix.count,
      })
    }

    let ao = mesh.geometry.getAttribute('aAo')
    if (!ao || ao.count < capacity) {
      ao = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1)
      mesh.geometry.setAttribute('aAo', ao)
    }

    mesh.count = 0
    // 空网格不参与每帧场景遍历与阴影 pass，有实例时才显示
    mesh.visible = false
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.castShadow = shouldTerrainCastShadow(SHADOW_CONFIG.quality, type.id)
    mesh.receiveShadow = true
    mesh.userData.blockId = type.id
    mesh.userData.blockName = type.name
    mesh.userData.instanceToGrid = []
  }

  _getTypeKey(blockId) {
    return Object.keys(this.capacities).find(key => blocks[key]?.id === blockId) ?? String(blockId)
  }

  _collectPositions(container) {
    const positionsByBlock = new Map()

    container.forEachFilled((block, x, y, z) => {
      if (container.isBlockObscured(x, y, z))
        return
      if (this.params.showOresOnly && !RESOURCE_IDS.has(block.id))
        return

      const type = BLOCK_BY_ID[block.id]
      if (!type?.visible)
        return

      const positions = positionsByBlock.get(block.id) || []
      positions.push({ x, y, z })
      positionsByBlock.set(block.id, positions)
    })

    return positionsByBlock
  }

  _validatePositions(positionsByBlock) {
    positionsByBlock.forEach((positions, blockId) => {
      const record = this._blockMeshes.get(blockId)
      const capacity = record?.capacity ?? 0
      if (positions.length > capacity) {
        throw new ChunkRenderCapacityError({
          layer: 'blocks',
          typeId: this._getTypeKey(blockId),
          required: positions.length,
          capacity,
        })
      }
    })
  }

  _markUpdates(mesh, count) {
    mesh.instanceMatrix.clearUpdateRanges()
    mesh.instanceMatrix.addUpdateRange(0, count * 16)
    mesh.instanceMatrix.needsUpdate = true

    const ao = mesh.geometry.getAttribute('aAo')
    ao.clearUpdateRanges()
    ao.addUpdateRange(0, count)
    ao.needsUpdate = true
  }

  /**
   * 验证容量后，将容器数据写入固定网格。
   * @param {import('./terrain-container.js').default} container 地形数据容器
   */
  populate(container, { assignInstanceIds = true } = {}) {
    const positionsByBlock = this._collectPositions(container)
    this._validatePositions(positionsByBlock)

    if (assignInstanceIds)
      container.clearInstanceIds()
    this._blockMeshes.forEach(({ mesh }) => {
      mesh.count = 0
      mesh.userData.instanceToGrid.length = 0
    })

    positionsByBlock.forEach((positions, blockId) => {
      const { mesh } = this._blockMeshes.get(blockId)
      const ao = mesh.geometry.getAttribute('aAo')

      positions.forEach((position, index) => {
        const { x, y, z } = position
        const block = container.getBlock(x, y, z)
        this._tempObject.position.set(x, y * this.params.heightScale, z)
        this._tempObject.updateMatrix()
        mesh.setMatrixAt(index, this._tempObject.matrix)
        ao.setX(index, block.ao != null ? block.ao / 3 : 0)
        mesh.userData.instanceToGrid[index] = position
        if (assignInstanceIds)
          container.setBlockInstanceId(x, y, z, index)
      })

      mesh.count = positions.length
      if (mesh.count > 0)
        mesh.computeBoundingSphere()
    })

    this._blockMeshes.forEach(({ mesh }) => {
      mesh.visible = mesh.count > 0
      this._markUpdates(mesh, mesh.count)
    })
    this.parent.scale.setScalar(this.params.scale ?? 1)
    this.container = container
  }

  /**
   * 清空渲染计数和索引映射，保留固定网格及 GPU 资源。
   * @param {import('./terrain-container.js').default} [container] 需要清理实例索引的容器
   */
  reset(container = this.container, clearInstanceIds = true) {
    if (clearInstanceIds)
      container?.clearInstanceIds()
    this._blockMeshes.forEach(({ mesh }) => {
      mesh.count = 0
      mesh.visible = false
      mesh.userData.instanceToGrid.length = 0
      this._markUpdates(mesh, 0)
    })
    if (container === this.container || !clearInstanceIds)
      this.container = null
  }

  syncInstanceIds(container = this.container) {
    if (!container)
      return

    container.clearInstanceIds()
    this._blockMeshes.forEach(({ mesh }) => {
      mesh.userData.instanceToGrid.forEach(({ x, y, z }, instanceId) => {
        container.setBlockInstanceId(x, y, z, instanceId)
      })
    })
    this.container = container
  }

  getMeshes() {
    return Array.from(this._blockMeshes.values(), ({ mesh }) => mesh)
  }

  getMesh(blockId) {
    return this._blockMeshes.get(blockId)?.mesh
  }

  /**
   * 原子提交已编译的替换网格，并退休原槽位资源。
   * @param {number} blockId 方块 ID
   * @param {THREE.InstancedMesh} mesh 替换网格
   * @param {number} capacity 固定容量
   * @returns {{ mesh: THREE.InstancedMesh, capacity: number, type: object }} 旧记录
   */
  replaceMesh(blockId, mesh, capacity) {
    const oldRecord = this._blockMeshes.get(blockId)
    if (!oldRecord)
      throw new Error(`Unknown block render slot: ${blockId}`)

    const newRecord = { mesh, capacity, type: oldRecord.type }
    this._normalizeMesh(newRecord, this._getTypeKey(blockId))

    this.parent.remove(oldRecord.mesh)
    this.parent.add(mesh)
    this._blockMeshes.set(blockId, newRecord)
    try {
      this.onMeshCreated?.(mesh)
    }
    catch (error) {
      this.parent.remove(mesh)
      this.parent.add(oldRecord.mesh)
      this._blockMeshes.set(blockId, oldRecord)
      throw error
    }

    oldRecord.mesh.dispose()
    oldRecord.mesh.geometry.dispose()
    return oldRecord
  }

  /**
   * 使用 swap-and-pop 移除单个实例。
   * @param {THREE.InstancedMesh} mesh 实例网格
   * @param {number} instanceId 实例索引
   */
  removeInstance(mesh, instanceId) {
    if (!mesh || instanceId == null || instanceId < 0 || instanceId >= mesh.count)
      return

    const lastIndex = mesh.count - 1
    const removedGrid = mesh.userData.instanceToGrid[instanceId]
    const ao = mesh.geometry.getAttribute('aAo')

    if (instanceId < lastIndex) {
      mesh.getMatrixAt(lastIndex, this._tempMatrix)
      mesh.setMatrixAt(instanceId, this._tempMatrix)
      ao.setX(instanceId, ao.getX(lastIndex))

      const lastGrid = mesh.userData.instanceToGrid[lastIndex]
      mesh.userData.instanceToGrid[instanceId] = lastGrid
      this.container?.setBlockInstanceId(lastGrid.x, lastGrid.y, lastGrid.z, instanceId)
    }

    mesh.userData.instanceToGrid.pop()
    if (removedGrid)
      this.container?.setBlockInstanceId(removedGrid.x, removedGrid.y, removedGrid.z, null)
    mesh.count = lastIndex
    mesh.visible = mesh.count > 0
    this._markUpdates(mesh, mesh.count)
    if (mesh.count > 0)
      mesh.computeBoundingSphere()
  }

  /**
   * 为新暴露方块追加实例，容量不足时保持当前数据并抛出结构化错误。
   */
  addBlockInstance(x, y, z) {
    if (!this.container)
      return

    const block = this.container.getBlock(x, y, z)
    if (!block || block.id === blocks.empty.id || block.instanceId !== null)
      return

    const record = this._blockMeshes.get(block.id)
    const capacity = record?.capacity ?? 0
    const required = (record?.mesh.count ?? 0) + 1
    if (!record || required > capacity) {
      throw new ChunkRenderCapacityError({
        layer: 'blocks',
        typeId: this._getTypeKey(block.id),
        required,
        capacity,
      })
    }

    const { mesh } = record
    const instanceId = mesh.count
    this._tempObject.position.set(x, y * this.params.heightScale, z)
    this._tempObject.updateMatrix()
    mesh.setMatrixAt(instanceId, this._tempObject.matrix)
    mesh.geometry.getAttribute('aAo').setX(instanceId, block.ao != null ? block.ao / 3 : 0)
    mesh.userData.instanceToGrid[instanceId] = { x, y, z }
    this.container.setBlockInstanceId(x, y, z, instanceId)
    mesh.count++
    mesh.visible = true
    this._markUpdates(mesh, mesh.count)
    mesh.computeBoundingSphere()
  }

  /** 释放槽位拥有的网格和方块几何体，不释放共享材质。 */
  dispose() {
    if (this._disposed)
      return

    this._blockMeshes.forEach(({ mesh }) => {
      this.parent.remove(mesh)
      mesh.dispose()
      mesh.geometry.dispose()
    })
    this._blockMeshes.clear()
    this.container = null
    this._disposed = true
  }
}
