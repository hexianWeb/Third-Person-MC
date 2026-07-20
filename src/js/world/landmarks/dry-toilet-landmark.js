import * as THREE from 'three'
import { DRY_TOILET_SNAILS_CONFIG as CFG } from '../../config/dry-toilet-snails-config.js'
import Experience from '../../experience.js'
import {
  buildPlatformPlan,
  computePlatformTargetY,
  computeToiletFitTransform,
  getSnailActivityColumns,
  isValidAabbSize,
} from './dry-toilet-math.js'

export default class DryToiletLandmark {
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources
    this.chunkManager = null

    this.ready = false
    this.disabled = false
    this.model = null
    this.activityCenter = null
    this._platformTopY = null
  }

  _cm() {
    return this.experience.terrainDataManager
  }

  _columnReady(cm, x, z) {
    const chunk = cm.getChunkAtWorld(x, z)
    if (!chunk || chunk.state !== 'dataReady')
      return false
    return cm.getTopSolidYWorld(x, z) != null
  }

  _columnsReady() {
    const cm = this._cm()
    if (!cm)
      return false
    // 底座 + 蜗牛活动环都必须就绪，才能平整清障
    if (!CFG.footprint.every(({ x, z }) => this._columnReady(cm, x, z)))
      return false
    return getSnailActivityColumns().every(({ x, z }) => this._columnReady(cm, x, z))
  }

  _readColumns() {
    const cm = this._cm()
    return CFG.footprint.map(({ x, z }) => {
      const surfaceY = cm.getTopSolidYWorld(x, z)
      const surfaceBlock = cm.getBlockWorld(x, surfaceY, z)
      const blocksAbove = []
      for (let y = surfaceY + 1; y < cm.chunkHeight; y++) {
        const b = cm.getBlockWorld(x, y, z)
        if (b?.id)
          blocksAbove.push({ y, id: b.id })
      }
      return {
        x,
        z,
        surfaceY,
        surfaceBlockId: surfaceBlock?.id ?? 1,
        blocksAbove,
      }
    })
  }

  _preparePlatform() {
    const cm = this._cm()
    const columns = this._readColumns()
    const targetY = computePlatformTargetY(columns.map(c => c.surfaceY))
    const originCol = columns.find(c => c.x === CFG.center.x && c.z === CFG.center.z) || columns[0]
    const plan = buildPlatformPlan({
      columns,
      targetY,
      fillBlockId: originCol.surfaceBlockId,
    })

    for (const op of plan.ops) {
      if (op.type === 'remove')
        cm.removeBlockWorld(op.x, op.y, op.z)
      else if (op.type === 'add')
        cm.addBlockWorld(op.x, op.y, op.z, op.blockId)
    }
    cm.clearPlantsInWorldColumns(plan.clearPlantColumns)
    // 蜗牛活动环：削高填平到同 targetY，并清掉上方全部方块
    this._flattenSnailActivityArea(targetY, originCol.surfaceBlockId)
    // 方块中心在整数 Y，顶面为 y + 0.5
    this._platformTopY = targetY + 0.5
  }

  /**
   * 清空厕所外围蜗牛活动带障碍，并垫平地表
   * @param {number} targetY
   * @param {number} fillBlockId
   */
  _flattenSnailActivityArea(targetY, fillBlockId) {
    const cm = this._cm()
    const columns = getSnailActivityColumns()

    for (const { x, z } of columns) {
      const surfaceY = cm.getTopSolidYWorld(x, z)
      if (surfaceY == null)
        continue

      // 目标面以上全部移除（树/叶/植物/突出地形）
      for (let y = targetY + 1; y < cm.chunkHeight; y++) {
        const block = cm.getBlockWorld(x, y, z)
        if (block?.id)
          cm.removeBlockWorld(x, y, z)
      }

      // 地表低于平台：填平
      if (surfaceY < targetY) {
        for (let y = surfaceY + 1; y <= targetY; y++)
          cm.addBlockWorld(x, y, z, fillBlockId)
      }
    }

    cm.clearPlantsInWorldColumns(columns)
  }

  _placeModel() {
    const name = CFG.resourceName
    const resource = this.resources.items?.[name]
    if (!resource?.scene) {
      console.error(`[DryToiletLandmark] missing resource: ${name}`)
      this.disabled = true
      return
    }

    const root = resource.scene.clone(true)
    root.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true
        obj.receiveShadow = true
      }
    })

    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const size = new THREE.Vector3()
    box.getSize(size)
    if (!isValidAabbSize(size)) {
      console.error(`[DryToiletLandmark] invalid aabb for resource: ${name}`, size)
      this.disabled = true
      return
    }

    // 先等比缩放到底边，再重新测包围盒并对齐平台顶面
    const fit = computeToiletFitTransform(
      { x: size.x, y: size.y, z: size.z },
      CFG.targetBaseSize,
    )
    root.scale.setScalar(fit.scale)
    root.updateMatrixWorld(true)

    const box2 = new THREE.Box3().setFromObject(root)
    const center = new THREE.Vector3()
    box2.getCenter(center)
    const min = box2.min
    // 脚印几何中心：4×4 覆盖 [30,34) → 中心 32
    root.position.x += -center.x + CFG.center.x
    root.position.z += -center.z + CFG.center.z
    // 包围盒底面贴齐平台顶面
    root.position.y += -min.y + this._platformTopY

    // 再测一次，消除缩放/位移后的浮点误差
    root.updateMatrixWorld(true)
    const box3 = new THREE.Box3().setFromObject(root)
    root.position.y += this._platformTopY - box3.min.y
    root.position.x += CFG.center.x - (box3.min.x + box3.max.x) * 0.5
    root.position.z += CFG.center.z - (box3.min.z + box3.max.z) * 0.5
    root.updateMatrixWorld(true)
    this.scene.add(root)
    this.model = root
    this.activityCenter = {
      x: CFG.center.x,
      y: this._platformTopY,
      z: CFG.center.z,
    }
    this.ready = true
  }

  update() {
    if (this.disabled || this.ready)
      return
    if (!this._columnsReady())
      return
    this._preparePlatform()
    this._placeModel()
  }

  isReady() {
    return this.ready
  }

  getActivityCenter() {
    return this.activityCenter
  }

  reset() {
    if (this.model) {
      this.scene.remove(this.model)
      this.model = null
    }
    this.ready = false
    this.disabled = false
    this.activityCenter = null
    this._platformTopY = null
  }

  destroy() {
    this.reset()
  }
}
