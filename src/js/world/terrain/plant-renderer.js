/** 固定容量的植物渲染层，只管理传入父节点中的网格。 */
import * as THREE from 'three'

import { PLANT_INSTANCE_CAPACITY } from '../../config/chunk-render-capacity.js'
import { getSharedPlantMaterials, PLANT_BY_ID, sharedCrossPlaneGeometry } from './blocks-config.js'
import ChunkRenderCapacityError from './chunk-render-capacity-error.js'

export default class PlantRenderer {
  /**
   * @param {object} options 渲染层依赖
   * @param {THREE.Group} options.parent 网格所属父节点
   * @param {object} options.resources 已加载资源或资源字典
   * @param {object} options.params 共享渲染参数
   * @param {number} [options.capacity] 每种植物的固定容量
   * @param {Function} [options.materialFactory] 共享材质工厂
   * @param {Function} [options.onMeshCreated] 网格创建回调
   */
  constructor({
    parent,
    resources,
    params,
    capacity = PLANT_INSTANCE_CAPACITY,
    materialFactory = getSharedPlantMaterials,
    onMeshCreated,
  }) {
    this.parent = parent
    this.resources = resources
    this.params = params || { scale: 1, heightScale: 1 }
    this.capacity = capacity
    this.materialFactory = materialFactory
    this.onMeshCreated = onMeshCreated

    this._tempObject = new THREE.Object3D()
    this._plantMeshes = new Map()
    this._disposed = false

    this._createMeshes()
    this.parent.scale.setScalar(this.params.scale ?? 1)
  }

  _createMeshes() {
    Object.values(PLANT_BY_ID).forEach((type) => {
      if (!type.visible)
        return

      const material = this.materialFactory(type, this.resources?.items ?? this.resources)
      if (!material)
        return

      const mesh = new THREE.InstancedMesh(sharedCrossPlaneGeometry, material, this.capacity)
      const record = { mesh, capacity: this.capacity, type }
      this._normalizeMesh(record)
      this.parent.add(mesh)
      this._plantMeshes.set(type.id, record)
      this.onMeshCreated?.(mesh)
    })
  }

  _normalizeMesh({ mesh, capacity, type }) {
    if (mesh.instanceMatrix.count < capacity) {
      throw new ChunkRenderCapacityError({
        layer: 'plants',
        typeId: type.name,
        required: capacity,
        capacity: mesh.instanceMatrix.count,
      })
    }

    mesh.count = 0
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.userData.plantId = type.id
    mesh.userData.plantName = type.name
  }

  _markUpdates(mesh, count) {
    mesh.instanceMatrix.clearUpdateRanges()
    mesh.instanceMatrix.addUpdateRange(0, count * 16)
    mesh.instanceMatrix.needsUpdate = true
  }

  /**
   * 验证所有植物容量后写入固定网格。
   * @param {Array<{x: number, y: number, z: number, plantId: number}>} plantData 植物数据
   */
  populate(plantData = []) {
    const positionsByPlant = new Map()
    plantData.forEach(({ x, y, z, plantId }) => {
      const type = PLANT_BY_ID[plantId]
      if (!type?.visible)
        return
      const positions = positionsByPlant.get(plantId) || []
      positions.push({ x, y, z })
      positionsByPlant.set(plantId, positions)
    })

    positionsByPlant.forEach((positions, plantId) => {
      const record = this._plantMeshes.get(plantId)
      const capacity = record?.capacity ?? 0
      if (positions.length > capacity) {
        throw new ChunkRenderCapacityError({
          layer: 'plants',
          typeId: PLANT_BY_ID[plantId].name,
          required: positions.length,
          capacity,
        })
      }
    })

    this._plantMeshes.forEach(({ mesh }) => {
      mesh.count = 0
    })

    positionsByPlant.forEach((positions, plantId) => {
      const { mesh } = this._plantMeshes.get(plantId)
      positions.forEach(({ x, y, z }, index) => {
        this._tempObject.position.set(x, (y - 0.5) * this.params.heightScale, z)
        this._tempObject.updateMatrix()
        mesh.setMatrixAt(index, this._tempObject.matrix)
      })
      mesh.count = positions.length
      if (mesh.count > 0)
        mesh.computeBoundingSphere()
    })

    this._plantMeshes.forEach(({ mesh }) => this._markUpdates(mesh, mesh.count))
    this.parent.scale.setScalar(this.params.scale ?? 1)
  }

  /** 清空计数，保留固定网格和共享资源。 */
  reset() {
    this._plantMeshes.forEach(({ mesh }) => {
      mesh.count = 0
      this._markUpdates(mesh, 0)
    })
  }

  getMeshes() {
    return Array.from(this._plantMeshes.values(), ({ mesh }) => mesh)
  }

  /**
   * 原子提交已编译的替换网格，并退休原网格但保留共享资源。
   */
  replaceMesh(plantId, mesh, capacity) {
    const oldRecord = this._plantMeshes.get(plantId)
    if (!oldRecord)
      throw new Error(`Unknown plant render slot: ${plantId}`)

    const newRecord = { mesh, capacity, type: oldRecord.type }
    this._normalizeMesh(newRecord)

    this.parent.remove(oldRecord.mesh)
    this.parent.add(mesh)
    this._plantMeshes.set(plantId, newRecord)
    try {
      this.onMeshCreated?.(mesh)
    }
    catch (error) {
      this.parent.remove(mesh)
      this.parent.add(oldRecord.mesh)
      this._plantMeshes.set(plantId, oldRecord)
      throw error
    }

    oldRecord.mesh.dispose()
    return oldRecord
  }

  /** 释放槽位拥有的网格，不释放共享材质或植物几何体。 */
  dispose() {
    if (this._disposed)
      return

    this._plantMeshes.forEach(({ mesh }) => {
      this.parent.remove(mesh)
      mesh.dispose()
    })
    this._plantMeshes.clear()
    this._disposed = true
  }
}
