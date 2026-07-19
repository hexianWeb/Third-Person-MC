import * as THREE from 'three'
import { DRY_TOILET_SNAILS_CONFIG as CFG } from '../../config/dry-toilet-snails-config.js'
import Experience from '../../experience.js'
import {
  buildPlatformPlan,
  computePlatformTargetY,
  computeToiletFitTransform,
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

  _columnsReady() {
    const cm = this._cm()
    if (!cm)
      return false
    return CFG.footprint.every(({ x, z }) => {
      const chunk = cm.getChunkAtWorld(x, z)
      if (!chunk || chunk.state !== 'dataReady')
        return false
      return cm.getTopSolidYWorld(x, z) != null
    })
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
    this._platformTopY = targetY + 1
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

    // 先等比缩放到底边 2 格，再重新测包围盒并对齐地标中心平台顶面
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
    root.position.x += -center.x + CFG.center.x
    root.position.z += -center.z + CFG.center.z
    root.position.y += -min.y + this._platformTopY

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
