/**
 * 固定数量的区块渲染槽位池，负责串行预编译与溢出网格的异步替换。
 */
import * as THREE from 'three'

import { FIXED_INSTANCE_BUFFER_BYTES, TOTAL_SLOT_COUNT } from '../../config/chunk-render-capacity.js'
import { disposeSharedTerrainResources } from './blocks-config.js'
import ChunkRenderSlot from './chunk-render-slot.js'

const WATER_COLOR = 0x3399CC
const COMPILE_RETRY_DELAY_MS = 250

function defaultDelay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

export default class ChunkRenderSlotPool {
  /**
   * @param {object} options 池依赖
   * @param {object} options.resources 已加载资源
   * @param {object} options.renderParams 共享渲染参数
   * @param {object} options.waterParams 共享水面参数
   * @param {typeof ChunkRenderSlot} [options.slotFactory] 槽位工厂
   * @param {(milliseconds: number) => Promise<void>} [options.delay] 重试延时函数
   */
  constructor({
    resources,
    renderParams = {},
    waterParams = {},
    slotFactory = ChunkRenderSlot,
    delay = defaultDelay,
  }) {
    this.resources = resources
    this.renderParams = renderParams
    this.waterParams = waterParams
    this.SlotFactory = slotFactory
    this.delay = delay

    this.slots = []
    this.renderer = null
    this.scene = null
    this.camera = null
    this.materialEpoch = 0
    this.meshCreateCount = 0
    this.compileCount = 0
    this.overflowCount = 0
    this.startupCompileCount = 0
    this.lastTransitionMs = 0

    this._readyPromise = null
    this._materialGenerationPromise = null
    this._acquiredSlots = new Set()
    this._invalidatedMaterialTypes = new Set()
    this._sharedWaterGeometry = null
    this._sharedWaterMaterial = null
    this._destroyed = false
  }

  /** 绑定一次实时 WebGPU 上下文并启动十四个槽位的串行预编译。 */
  initialize(renderer, scene, camera) {
    if (this._readyPromise)
      return this._readyPromise
    if (this._destroyed)
      return Promise.reject(new Error('Cannot initialize a disposed chunk render slot pool'))

    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this._readyPromise = this._initializeSlots()
    return this._readyPromise
  }

  whenReady() {
    return this._readyPromise ?? Promise.resolve()
  }

  _createSharedWaterResources() {
    const chunkWidth = this.renderParams.chunkWidth ?? 64
    this._sharedWaterGeometry = new THREE.PlaneGeometry(chunkWidth, chunkWidth)
    this._sharedWaterGeometry.rotateX(-Math.PI / 2)

    const waterTexture = this.resources?.items?.water_Texture
    if (waterTexture) {
      waterTexture.wrapS = THREE.RepeatWrapping
      waterTexture.wrapT = THREE.RepeatWrapping
      waterTexture.repeat.set(chunkWidth, chunkWidth)
    }

    this._sharedWaterMaterial = new THREE.MeshLambertMaterial({
      ...(waterTexture ? { map: waterTexture } : {}),
      color: WATER_COLOR,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    })
  }

  async _initializeSlots() {
    this._createSharedWaterResources()
    const onMeshCreated = () => {
      this.meshCreateCount++
    }

    for (let id = 0; id < TOTAL_SLOT_COUNT; id++) {
      this.slots.push(new this.SlotFactory({
        id,
        scene: this.scene,
        resources: this.resources,
        renderParams: this.renderParams,
        waterParams: this.waterParams,
        sharedWaterGeometry: this._sharedWaterGeometry,
        sharedWaterMaterial: this._sharedWaterMaterial,
        onMeshCreated,
      }))
    }

    for (const slot of this.slots) {
      if (this._destroyed)
        throw new Error('Chunk render slot pool was disposed during prewarm')

      slot.prepareForCompile()
      try {
        await this._compileWithRetry(slot, { phase: 'startup', slotId: slot.id })
        if (this._destroyed)
          throw new Error('Chunk render slot pool was disposed during prewarm')
        this.compileCount++
        this.startupCompileCount++
        slot.finishCompile(this.materialEpoch)
      }
      catch (error) {
        if (!this._destroyed) {
          slot.reset()
          slot.state = 'failed'
        }
        throw error
      }
    }

    // 启动期创建和编译单独计数，运行期计数从游戏可见前重新开始。
    this.meshCreateCount = 0
    this.compileCount = 0
  }

  async _compileWithRetry(slot, context) {
    globalThis.performance?.mark('chunk-slot:compile-start')
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await this.renderer.compileAsync(slot.group, this.camera, this.scene)
          return
        }
        catch (error) {
          if (attempt === 1)
            throw error
          await this.delay(COMPILE_RETRY_DELAY_MS)
        }
      }
    }
    catch (error) {
      error.chunkRenderContext = context
      throw error
    }
    finally {
      globalThis.performance?.mark('chunk-slot:compile-end')
    }
  }

  /** 借出第一个空闲槽位；槽位不足时绝不扩容。 */
  acquire() {
    if (this._destroyed)
      return null

    const slot = this.slots.find(candidate => candidate.state === 'free' && !this._acquiredSlots.has(candidate))
    if (!slot)
      return null

    this._acquiredSlots.add(slot)
    return slot
  }

  /** 重置并归还池拥有的非活动槽位。 */
  release(slot) {
    if (!this.slots.includes(slot))
      throw new Error('Cannot release a chunk render slot owned by another pool')
    if (slot.state === 'active')
      throw new Error(`Cannot release active chunk render slot ${slot.id}`)

    slot.reset()
    this._acquiredSlots.delete(slot)
  }

  /**
   * 编译真实替换网格，等待完成后再由 guard 决定提交或丢弃。
   * @returns {Promise<boolean>} 是否提交了替换
   */
  async ensureCapacity(slot, error, guard) {
    if (!this.slots.includes(slot))
      throw new Error('Cannot resize a chunk render slot owned by another pool')
    if (typeof guard !== 'function')
      throw new TypeError('Chunk render overflow guard must be a function')

    const transaction = slot.replaceOverflowMesh(error)
    let committed = false
    try {
      await this._compileWithRetry(
        { group: transaction.mesh },
        {
          phase: 'overflow',
          slotId: slot.id,
          layer: error.layer,
          typeId: error.typeId,
          capacity: transaction.capacity,
          epoch: this.materialEpoch,
        },
      )

      if (this._destroyed || !guard())
        return false

      transaction.commit()
      committed = true
      this.compileCount++
      this.overflowCount++
      return true
    }
    finally {
      if (!committed)
        transaction.dispose()
    }
  }

  /** 标记结构材质失效，并推进供异步守卫校验的材质纪元。 */
  invalidateMaterialType(typeId, materialFactory) {
    if (this._destroyed)
      return this.materialEpoch

    this._invalidatedMaterialTypes.add(typeId)
    const epoch = ++this.materialEpoch
    if (typeof materialFactory !== 'function')
      return epoch

    const generation = this._replaceMaterialGeneration(typeId, materialFactory, epoch)
    generation.epoch = epoch
    this._materialGenerationPromise = generation
    return generation
  }

  _isCurrentMaterialGeneration(epoch) {
    return !this._destroyed && epoch === this.materialEpoch
  }

  _collectTransactionMaterials(transactions, key) {
    const materials = new Set()
    transactions.forEach((transaction) => {
      transaction[key].forEach((material) => {
        const materialList = Array.isArray(material) ? material : [material]
        materialList.filter(Boolean).forEach(item => materials.add(item))
      })
    })
    return materials
  }

  _disposeMaterials(materials, retainedMaterials = new Set()) {
    materials.forEach((material) => {
      if (!retainedMaterials.has(material))
        material.dispose?.()
    })
  }

  async _replaceMaterialGeneration(typeId, materialFactory, epoch) {
    const transactions = this.slots.map(slot => slot.prepareMaterialReplacement(typeId, materialFactory))
    const replacementMaterials = this._collectTransactionMaterials(transactions, 'materials')
    const oldMaterials = this._collectTransactionMaterials(transactions, 'oldMaterials')
    const discard = () => {
      transactions.forEach(transaction => transaction.dispose())
      this._disposeMaterials(replacementMaterials)
    }

    if (!transactions.some(transaction => transaction.hasReplacements)) {
      discard()
      return false
    }

    try {
      for (const transaction of transactions) {
        if (!transaction.hasReplacements)
          continue
        await this._compileWithRetry(transaction, {
          phase: 'material',
          typeId,
          epoch,
        })
        if (!this._isCurrentMaterialGeneration(epoch)) {
          discard()
          return false
        }
        this.compileCount++
      }

      if (!this._isCurrentMaterialGeneration(epoch)) {
        discard()
        return false
      }

      transactions.forEach((transaction) => {
        transaction.commit()
      })
      this.slots.forEach((slot) => {
        slot.materialEpoch = epoch
      })
      this._disposeMaterials(oldMaterials, replacementMaterials)
      return true
    }
    catch (error) {
      discard()
      if (!this._destroyed)
        console.warn(`[ChunkRenderSlotPool] material generation failed for ${typeId}:`, error)
      return false
    }
  }

  /** 每帧只更新一次全部共享动画材质的时间 uniform。 */
  update(elapsed) {
    if (this._destroyed)
      return

    const materials = new Set()
    this.slots[0]?.getRenderObjects?.().forEach((object) => {
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material]
      objectMaterials.filter(Boolean).forEach(material => materials.add(material))
    })
    materials.forEach((material) => {
      if (material._isAnimated && material.uniforms?.uTime)
        material.uniforms.uTime.value = elapsed
    })
  }

  getDiagnostics() {
    let activeSlots = 0
    let stagingSlots = 0
    let freeSlots = 0
    let failedSlots = 0

    this.slots.forEach((slot) => {
      if (slot.state === 'active')
        activeSlots++
      else if (slot.state === 'failed')
        failedSlots++
      else if (this._acquiredSlots.has(slot) || slot.state !== 'free')
        stagingSlots++
      else
        freeSlots++
    })

    return Object.freeze({
      totalSlots: this.slots.length,
      activeSlots,
      stagingSlots,
      freeSlots,
      failedSlots,
      meshCreateCount: this.meshCreateCount,
      compileCount: this.compileCount,
      overflowCount: this.overflowCount,
      estimatedBufferBytes: FIXED_INSTANCE_BUFFER_BYTES,
      lastTransitionMs: this.lastTransitionMs,
      startupCompileCount: this.startupCompileCount,
      materialEpoch: this.materialEpoch,
    })
  }

  dispose() {
    if (this._destroyed)
      return

    this._destroyed = true
    this._acquiredSlots.clear()
    this.slots.forEach(slot => slot.dispose())
    disposeSharedTerrainResources()
    this._sharedWaterGeometry?.dispose()
    this._sharedWaterMaterial?.dispose()
    this._sharedWaterGeometry = null
    this._sharedWaterMaterial = null
    this.renderer = null
    this.scene = null
    this.camera = null
  }
}
