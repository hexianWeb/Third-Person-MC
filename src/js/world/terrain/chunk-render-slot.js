/**
 * 一个可反复绑定数据区块、但始终保留渲染对象身份的固定槽位。
 */
import * as THREE from 'three'

import { BLOCK_INSTANCE_CAPACITY, PLANT_INSTANCE_CAPACITY } from '../../config/chunk-render-capacity.js'
import { blocks } from './blocks-config.js'
import PlantRenderer from './plant-renderer.js'
import TerrainRenderer from './terrain-renderer.js'

const WATER_Y_EPSILON = 2.4

const SLOT_STATES = Object.freeze([
  'free',
  'filling',
  'compiling',
  'ready',
  'active',
  'retiring',
  'failed',
])

function createBlockLayer(options) {
  return new TerrainRenderer(options)
}

function createPlantLayer(options) {
  return new PlantRenderer(options)
}

function nextPowerOfTwo(value) {
  if (!Number.isInteger(value) || value < 1)
    throw new TypeError(`Overflow required count must be a positive integer: ${value}`)
  return 2 ** Math.ceil(Math.log2(value))
}

export { SLOT_STATES }

export default class ChunkRenderSlot {
  /**
   * @param {object} options 槽位依赖
   * @param {number} options.id 固定槽位编号
   * @param {THREE.Scene} options.scene 最终挂载槽位的场景
   * @param {object} options.resources 已加载资源
   * @param {object} options.renderParams 共享地形渲染参数
   * @param {object} options.waterParams 共享水面参数
   * @param {object} [options.capacities] 固定实例容量
   * @param {THREE.BufferGeometry} options.sharedWaterGeometry 共享水面几何体
   * @param {THREE.Material} options.sharedWaterMaterial 共享水面材质
   * @param {Function} [options.onMeshCreated] 渲染对象创建回调
   * @param {Function} [options.blockLayerFactory] 测试用方块层工厂
   * @param {Function} [options.plantLayerFactory] 测试用植物层工厂
   */
  constructor({
    id,
    scene,
    resources,
    renderParams = {},
    waterParams = {},
    capacities = BLOCK_INSTANCE_CAPACITY,
    sharedWaterGeometry,
    sharedWaterMaterial,
    onMeshCreated,
    blockLayerFactory = createBlockLayer,
    plantLayerFactory = createPlantLayer,
  }) {
    this.id = id
    this.scene = scene
    this.resources = resources
    this.renderParams = renderParams
    this.waterParams = waterParams
    this.capacities = capacities
    this.onMeshCreated = onMeshCreated
    this.chunkWidth = renderParams.chunkWidth ?? sharedWaterGeometry?.parameters?.width

    if (!Number.isFinite(this.chunkWidth))
      throw new TypeError('ChunkRenderSlot requires a finite chunk width')

    this.group = new THREE.Group()
    this.group.name = `chunk-render-slot-${id}`
    this.group.userData.slotId = id
    this.group.scale.setScalar(renderParams.scale ?? 1)

    this.state = 'free'
    this.chunkKey = null
    this.chunk = null
    this.materialEpoch = 0
    this._compileSnapshot = null
    this._assignsInstanceIds = true
    this._disposed = false

    this.blockLayer = blockLayerFactory({
      parent: this.group,
      resources,
      params: renderParams,
      capacities: capacities.blocks ?? capacities,
      onMeshCreated,
    })
    this.plantLayer = plantLayerFactory({
      parent: this.group,
      resources,
      params: renderParams,
      capacity: capacities.plants ?? PLANT_INSTANCE_CAPACITY,
      onMeshCreated,
    })

    this.waterMesh = new THREE.Mesh(sharedWaterGeometry, sharedWaterMaterial)
    this.waterMesh.name = `chunk-render-slot-${id}-water`
    this.waterMesh.renderOrder = 3
    this.waterMesh.raycast = () => {}
    this.waterMesh.userData.noRaycast = true
    this.waterMesh.userData.isWater = true
    this.waterMesh.position.set(this.chunkWidth / 2, 0, this.chunkWidth / 2)
    this.group.add(this.waterMesh)
    this.onMeshCreated?.(this.waterMesh)
    this._refreshWaterHeight()
  }

  _assertUsable() {
    if (this._disposed)
      throw new Error(`Chunk render slot ${this.id} is disposed`)
  }

  _refreshWaterHeight() {
    const waterOffset = this.waterParams.waterOffset ?? 8
    const heightScale = this.renderParams.heightScale ?? 1
    this.waterMesh.position.y = waterOffset * heightScale + WATER_Y_EPSILON
  }

  _clearBindingMetadata() {
    this.chunkKey = null
    this.chunk = null
    delete this.group.userData.chunkX
    delete this.group.userData.chunkZ
    delete this.group.userData.originX
    delete this.group.userData.originZ
  }

  _restoreCompileState() {
    if (!this._compileSnapshot)
      return

    this._compileSnapshot.forEach(({ count, frustumCulled, visible }, object) => {
      if (count !== undefined)
        object.count = count
      object.frustumCulled = frustumCulled
      if (visible !== undefined)
        object.visible = visible
    })
    this._compileSnapshot = null
  }

  /** 将数据写入已有渲染对象，但不挂载到全局场景。 */
  populate(chunk, { assignInstanceIds = true } = {}) {
    this._assertUsable()
    if (this.state !== 'free')
      throw new Error(`Cannot populate chunk render slot ${this.id} from state ${this.state}`)

    this.state = 'filling'
    try {
      this.blockLayer.populate(chunk.container, { assignInstanceIds })
      this.plantLayer.populate(chunk.generator?.plantData ?? chunk.plantData ?? [])
      this._refreshWaterHeight()
      this.chunk = chunk
      this.chunkKey = `${chunk.chunkX},${chunk.chunkZ}`
      this._assignsInstanceIds = assignInstanceIds
      this.state = 'ready'
      return this
    }
    catch (error) {
      this.blockLayer.reset(chunk.container, assignInstanceIds)
      this.plantLayer.reset()
      this._clearBindingMetadata()
      this.scene.remove(this.group)
      this.state = 'free'
      throw error
    }
  }

  /** 为 WebGPU 预编译临时暴露一个有效实例。 */
  prepareForCompile() {
    this._assertUsable()
    if (this.state !== 'free')
      throw new Error(`Cannot compile chunk render slot ${this.id} from state ${this.state}`)

    const identity = new THREE.Matrix4()
    this._compileSnapshot = new Map()
    this.getRenderObjects().forEach((object) => {
      this._compileSnapshot.set(object, {
        count: object.count,
        frustumCulled: object.frustumCulled,
        visible: object.visible,
      })
      if (object.isInstancedMesh) {
        object.setMatrixAt(0, identity)
        object.instanceMatrix.needsUpdate = true
      }
      if (object.count !== undefined)
        object.count = 1
      object.frustumCulled = false
      // 空网格平时隐藏，预热时必须强制渲染才能编译到全部网格
      object.visible = true
    })
    this.state = 'compiling'
  }

  /** 恢复预编译前状态；过期完成不会改写已重置槽位。 */
  finishCompile(epoch) {
    this._assertUsable()
    if (this.state !== 'compiling')
      return false

    this._restoreCompileState()
    this.scene.remove(this.group)
    this._clearBindingMetadata()
    this.materialEpoch = epoch
    this.state = 'free'
    return true
  }

  /** 将已填充槽位原子地挂载到指定区块原点。 */
  attach(chunkX, chunkZ) {
    this._assertUsable()
    if (this.state !== 'ready')
      throw new Error(`Cannot attach chunk render slot ${this.id} from state ${this.state}`)

    const originX = chunkX * this.chunkWidth
    const originZ = chunkZ * this.chunkWidth
    this.group.position.set(originX, 0, originZ)
    this.group.userData.chunkX = chunkX
    this.group.userData.chunkZ = chunkZ
    this.group.userData.originX = originX
    this.group.userData.originZ = originZ
    this.scene.add(this.group)
    this.state = 'active'
    return this
  }

  /** 脱离场景并清空绑定数据，保留全部渲染资源与对象身份。 */
  reset() {
    if (this._disposed)
      return

    this.state = 'retiring'
    this.scene.remove(this.group)
    this._restoreCompileState()
    this.blockLayer.reset(this.chunk?.container, this._assignsInstanceIds)
    this.plantLayer.reset()
    this._clearBindingMetadata()
    this._assignsInstanceIds = true
    this.group.position.set(0, 0, 0)
    this.state = 'free'
  }

  getRenderObjects() {
    return [
      ...this.blockLayer.getMeshes(),
      ...this.plantLayer.getMeshes(),
      this.waterMesh,
    ]
  }

  syncInstanceMappings() {
    this.blockLayer.syncInstanceIds(this.chunk?.container)
    this._assignsInstanceIds = true
  }

  prepareMaterialReplacement(typeId, materialFactory) {
    this._assertUsable()
    if (typeof materialFactory !== 'function')
      throw new TypeError('Chunk render material factory must be a function')

    const group = new THREE.Group()
    const identity = new THREE.Matrix4()
    const replacements = []
    this.getRenderObjects().forEach((object) => {
      if (!object.isInstancedMesh)
        return

      const material = materialFactory(object, typeId)
      if (!material || material === object.material)
        return

      const preview = new THREE.InstancedMesh(object.geometry, material, 1)
      preview.setMatrixAt(0, identity)
      preview.count = 1
      preview.frustumCulled = false
      group.add(preview)
      replacements.push({ object, material, preview })
    })

    let state = 'pending'
    const releasePreviews = () => {
      replacements.forEach(({ preview }) => {
        group.remove(preview)
        preview.dispose()
      })
    }

    return {
      group,
      materials: new Set(replacements.map(({ material }) => material)),
      oldMaterials: new Set(replacements.map(({ object }) => object.material)),
      hasReplacements: replacements.length > 0,
      isCurrent: () => !this._disposed && replacements.every(({ object }) => object.parent === this.group),
      commit: () => {
        if (state !== 'pending')
          throw new Error(`Cannot commit material replacement from state ${state}`)
        if (!replacements.every(({ object }) => object.parent === this.group))
          throw new Error('Cannot commit material replacement for a retired render object')
        replacements.forEach(({ object, material }) => {
          object.material = material
        })
        releasePreviews()
        state = 'committed'
      },
      dispose: () => {
        if (state !== 'pending')
          return
        releasePreviews()
        state = 'disposed'
      },
    }
  }

  /**
   * 为溢出类型准备一个未安装的替换网格；调用方完成异步编译后再决定提交或丢弃。
   * @param {{ layer: string, typeId: string | number, required: number }} error 容量溢出上下文
   */
  replaceOverflowMesh(error) {
    this._assertUsable()
    const { layer, typeId, required } = error
    const capacity = nextPowerOfTwo(required)
    let renderLayer
    let oldMesh
    let replacement
    let replaceTypeId
    let ownsGeometry = false

    if (layer === 'blocks') {
      renderLayer = this.blockLayer
      const configuredTypeId = typeof typeId === 'string' ? blocks[typeId]?.id : undefined
      oldMesh = renderLayer.getMeshes().find(mesh =>
        mesh.userData.blockId === (configuredTypeId ?? typeId)
        || mesh.userData.blockName === typeId,
      )
      if (oldMesh) {
        replaceTypeId = oldMesh.userData.blockId
        const geometry = oldMesh.geometry.clone()
        geometry.setAttribute('aAo', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1))
        replacement = new THREE.InstancedMesh(geometry, oldMesh.material, capacity)
        ownsGeometry = true
      }
    }
    else if (layer === 'plants') {
      renderLayer = this.plantLayer
      oldMesh = renderLayer.getMeshes().find(mesh =>
        mesh.userData.plantId === typeId
        || mesh.userData.plantName === typeId,
      )
      if (oldMesh) {
        replaceTypeId = oldMesh.userData.plantId
        replacement = new THREE.InstancedMesh(oldMesh.geometry, oldMesh.material, capacity)
      }
    }
    else {
      throw new Error(`Unknown overflow render layer: ${layer} (type ${typeId})`)
    }

    if (!oldMesh)
      throw new Error(`Unknown ${layer} overflow render type: ${typeId}`)

    let transactionState = 'pending'
    return {
      mesh: replacement,
      capacity,
      commit() {
        if (transactionState === 'committed')
          throw new Error(`Overflow replacement for ${layer}:${typeId} is already committed`)
        if (transactionState === 'disposed')
          throw new Error(`Overflow replacement for ${layer}:${typeId} is already disposed`)

        const oldRecord = renderLayer.replaceMesh(replaceTypeId, replacement, capacity)
        transactionState = 'committed'
        return oldRecord
      },
      dispose() {
        if (transactionState !== 'pending')
          return

        replacement.dispose()
        if (ownsGeometry)
          replacement.geometry.dispose()
        transactionState = 'disposed'
      },
    }
  }

  /** 释放槽位独占资源；共享水面资源由池统一释放。 */
  dispose() {
    if (this._disposed)
      return

    this.reset()
    this.blockLayer.dispose()
    this.plantLayer.dispose()
    this.group.remove(this.waterMesh)
    this._disposed = true
  }
}
