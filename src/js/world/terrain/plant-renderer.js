/**
 * 植物渲染器
 * 使用 InstancedMesh 渲染 X 形交叉平面植物
 */
import * as THREE from 'three'
import Experience from '../../experience.js'
import {
  createPlantMaterials,
  PLANT_BY_ID,
  sharedCrossPlaneGeometry,
} from './blocks-config.js'

export default class PlantRenderer {
  /**
   * @param {object} container TerrainContainer
   * @param {object} options 配置选项
   */
  constructor(container, options = {}) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources
    this.time = this.experience.time

    this.container = container

    // 渲染参数
    this.params = options.sharedParams || {
      scale: 1,
      heightScale: 1,
    }
    this._chunkName = options.chunkName

    this.group = new THREE.Group()
    if (this._chunkName) {
      this.group.name = `plants(${this._chunkName})`
    }
    this.scene.add(this.group)

    this._tempObject = new THREE.Object3D()
    this._plantMeshes = new Map() // plantId -> InstancedMesh
    this._animatedMaterials = []
    // 位置到实例索引的映射：'x,y,z' -> { plantId, instanceIndex }
    this._positionToInstance = new Map()
  }

  /**
   * 构建植物的 InstancedMesh
   * @param {Array<{x: number, y: number, z: number, plantId: number}>} plantData 植物数据
   */
  build(plantData) {
    this._disposeChildren()

    if (!plantData || plantData.length === 0)
      return

    // 清空位置映射
    this._positionToInstance.clear()

    // 按植物类型分组
    const positionsByPlant = new Map()
    plantData.forEach(({ x, y, z, plantId }) => {
      const list = positionsByPlant.get(plantId) || []
      list.push({ x, y, z })
      positionsByPlant.set(plantId, list)
    })

    // 为每种植物创建 InstancedMesh
    positionsByPlant.forEach((positions, plantId) => {
      const plantType = PLANT_BY_ID[plantId]
      if (!plantType || !plantType.visible)
        return

      const material = createPlantMaterials(plantType, this.resources.items)
      if (!material)
        return

      // 追踪动画材质
      if (material._isAnimated) {
        this._animatedMaterials.push(material)
      }

      const mesh = new THREE.InstancedMesh(
        sharedCrossPlaneGeometry,
        material,
        positions.length,
      )
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.castShadow = false
      mesh.receiveShadow = false

      // 辅助信息
      mesh.userData.plantId = plantId
      mesh.userData.plantName = plantType.name
      if (this._chunkName) {
        mesh.name = `(${this._chunkName}) - ${plantType.name}`
      }
      else {
        mesh.name = plantType.name
      }

      positions.forEach((pos, index) => {
        this._tempObject.position.set(
          pos.x, // center in block
          (pos.y - 0.5) * this.params.heightScale, // align bottom with ground
          pos.z, // center in block
        )
        this._tempObject.updateMatrix()
        mesh.setMatrixAt(index, this._tempObject.matrix)

        // 记录位置到实例的映射
        const key = `${pos.x},${pos.y},${pos.z}`
        this._positionToInstance.set(key, { plantId, instanceIndex: index })
      })

      mesh.instanceMatrix.needsUpdate = true
      this.group.add(mesh)
      this._plantMeshes.set(plantId, mesh)
    })

    // 应用整体缩放
    this.group.scale.setScalar(this.params.scale)
  }

  /**
   * 移除指定位置的植物实例（高效版本：只隐藏实例，不重建 mesh）
   * @param {number} x - 局部 X 坐标
   * @param {number} y - Y 坐标
   * @param {number} z - 局部 Z 坐标
   * @param {Array} plantData - 植物数据数组引用（会被修改）
   * @returns {boolean} 是否成功移除
   */
  removePlantAt(x, y, z, plantData) {
    const key = `${x},${y},${z}`
    const instance = this._positionToInstance.get(key)

    if (!instance)
      return false

    const { plantId, instanceIndex } = instance
    const mesh = this._plantMeshes.get(plantId)

    if (!mesh)
      return false

    // 方法 1：将实例缩放为 0（推荐，最快）
    this._tempObject.position.set(x, (y - 0.5) * this.params.heightScale, z)
    this._tempObject.scale.set(0, 0, 0) // 缩放为 0，完全隐藏
    this._tempObject.updateMatrix()
    mesh.setMatrixAt(instanceIndex, this._tempObject.matrix)
    mesh.instanceMatrix.needsUpdate = true

    // 从映射中移除
    this._positionToInstance.delete(key)

    // 从数据源中移除（保持数据一致性）
    const dataIndex = plantData.findIndex((p) => p.x === x && p.y === y && p.z === z)
    if (dataIndex !== -1) {
      plantData.splice(dataIndex, 1)
    }

    return true
  }

  /**
   * 每帧更新：更新动画材质的时间 uniform
   */
  update() {
    if (this._animatedMaterials.length === 0)
      return

    const elapsed = this.time.elapsed * 0.001
    this._animatedMaterials.forEach((mat) => {
      if (mat.uniforms?.uTime) {
        mat.uniforms.uTime.value = elapsed
      }
    })
  }

  /**
   * 清理所有 InstancedMesh
   */
  _disposeChildren() {
    this._plantMeshes.forEach((mesh) => {
      if (mesh.material) {
        mesh.material.dispose?.()
      }
      this.group.remove(mesh)
      mesh.dispose?.()
    })
    this._plantMeshes.clear()
    this._animatedMaterials = []
  }

  /**
   * 释放资源
   */
  dispose() {
    this._disposeChildren()
    this.scene.remove(this.group)
  }
}
