import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { DRY_TOILET_SNAILS_CONFIG as CFG } from '../../config/dry-toilet-snails-config.js'
import Experience from '../../experience.js'
import {
  createSnailFsm,
  SNAIL_STATES,
  snailFsmOnClick,
  snailFsmUpdate,
} from './dry-toilet-math.js'

const COLORS = {
  bodyLight: new THREE.Color('#b8c86a'),
  bodyDark: new THREE.Color('#718341'),
  shellLight: new THREE.Color('#c47a3a'),
  shellDark: new THREE.Color('#754126'),
  eye: new THREE.Color('#16130f'),
}

function colorGeometry(geometry, color) {
  const colors = new Float32Array(geometry.getAttribute('position').count * 3)
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = color.r
    colors[i + 1] = color.g
    colors[i + 2] = color.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

function makeBox(width, height, depth, x, y, z, color) {
  const geometry = colorGeometry(new THREE.BoxGeometry(width, height, depth), color)
  geometry.translate(x, y, z)
  return geometry
}

function mergeBoxes(boxes) {
  const geometry = mergeGeometries(boxes, false)
  boxes.forEach(box => box.dispose())
  return geometry
}

/**
 * 创建所有蜗牛实例复用的几何体与材质。
 * @returns {{ geometries: Record<string, THREE.BufferGeometry>, materials: Record<string, THREE.Material>, dispose: () => void }} 可复用资源与统一销毁入口
 */
export function createSharedSnailAssets() {
  const geometries = {
    body: mergeBoxes([
      makeBox(0.26, 0.13, 0.24, 0, 0.075, 0, COLORS.bodyLight),
      makeBox(0.22, 0.045, 0.18, 0, 0.0225, 0.02, COLORS.bodyDark),
    ]),
    head: mergeBoxes([
      makeBox(0.28, 0.17, 0.24, 0, 0.105, 0, COLORS.bodyLight),
      makeBox(0.22, 0.055, 0.09, 0, 0.055, 0.085, COLORS.bodyDark),
    ]),
    shell: mergeBoxes([
      makeBox(0.42, 0.30, 0.34, 0, 0.25, 0, COLORS.shellLight),
      makeBox(0.34, 0.39, 0.26, 0, 0.255, 0, COLORS.shellLight),
      makeBox(0.22, 0.23, 0.36, 0, 0.27, 0, COLORS.shellDark),
    ]),
    antenna: makeBox(0.035, 0.23, 0.035, 0, 0.115, 0, COLORS.bodyDark),
    eye: makeBox(0.065, 0.065, 0.065, 0, 0, 0, COLORS.eye),
  }
  const materials = {
    voxel: new THREE.MeshStandardMaterial({
      roughness: 0.9,
      metalness: 0,
      vertexColors: true,
    }),
  }

  return {
    geometries,
    materials,
    dispose() {
      Object.values(geometries).forEach(geometry => geometry.dispose())
      Object.values(materials).forEach(material => material.dispose())
    },
  }
}

function smoothstep(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1)
  return t * t * (3 - 2 * t)
}

function stageVisibility(progress, stage) {
  return 1 - smoothstep(progress * 3 - stage)
}

export default class VoxelSnail {
  constructor({ shared, length, x, z, yaw, terrainProvider, activityCenter, footprint }) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.terrainProvider = terrainProvider
    this.activityCenter = activityCenter
    this.footprint = footprint
    this.length = length
    this.fsm = createSnailFsm(CFG)

    this.group = new THREE.Group()
    this.group.name = 'VoxelSnail'
    this.group.position.set(x, 0, z)
    this.group.rotation.y = yaw
    this.group.scale.setScalar(length)

    this.bodyPivots = [-0.40, -0.16, 0.08].map((bodyZ) => {
      const pivot = new THREE.Group()
      pivot.userData.baseZ = bodyZ
      pivot.position.z = bodyZ
      return pivot
    })
    this.headPivot = new THREE.Group()
    this.shellPivot = new THREE.Group()
    this.leftAntennaPivot = new THREE.Group()
    this.rightAntennaPivot = new THREE.Group()

    this.headPivot.position.set(0, 0, 0.34)
    this.shellPivot.position.set(0, 0, -0.15)
    this.leftAntennaPivot.position.set(-0.09, 0.17, 0.10)
    this.rightAntennaPivot.position.set(0.09, 0.17, 0.10)

    this.bodyMeshes = this.bodyPivots.map(() => this._makeMesh(shared.geometries.body, shared.materials.voxel))
    this.headMesh = this._makeMesh(shared.geometries.head, shared.materials.voxel)
    this.shellMesh = this._makeMesh(shared.geometries.shell, shared.materials.voxel)
    this.leftAntennaMesh = this._makeMesh(shared.geometries.antenna, shared.materials.voxel)
    this.rightAntennaMesh = this._makeMesh(shared.geometries.antenna, shared.materials.voxel)
    this.leftEyeMesh = this._makeMesh(shared.geometries.eye, shared.materials.voxel)
    this.rightEyeMesh = this._makeMesh(shared.geometries.eye, shared.materials.voxel)

    this.leftEyeMesh.position.y = 0.23
    this.rightEyeMesh.position.y = 0.23
    this.leftAntennaPivot.add(this.leftAntennaMesh, this.leftEyeMesh)
    this.rightAntennaPivot.add(this.rightAntennaMesh, this.rightEyeMesh)
    this.headPivot.add(this.headMesh, this.leftAntennaPivot, this.rightAntennaPivot)
    this.bodyPivots.forEach((pivot, index) => {
      pivot.add(this.bodyMeshes[index])
    })
    this.shellPivot.add(this.shellMesh)
    this.group.add(...this.bodyPivots, this.headPivot, this.shellPivot)

    this._clickMeshes = [
      ...this.bodyMeshes,
      this.headMesh,
      this.shellMesh,
      this.leftAntennaMesh,
      this.rightAntennaMesh,
      this.leftEyeMesh,
      this.rightEyeMesh,
    ]
    this._clickMeshes.forEach((mesh) => {
      mesh.userData.snailRef = this
    })

    this._elapsedSec = 0
    this._turnTimerSec = this._noise01(x, z) * CFG.turnNoiseInterval
    this._noiseState = this._seedFromPosition(x, z, length)

    this._snapToGround()
    this.scene.add(this.group)
  }

  _makeMesh(geometry, material) {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  }

  _seedFromPosition(x, z, length) {
    let seed = Math.floor((x + 128) * 73856093) ^ Math.floor((z + 128) * 19349663)
    seed ^= Math.floor(length * 1000) ^ CFG.rngSalt
    return seed >>> 0 || 1
  }

  _noise01(x, z) {
    const value = Math.sin(x * 12.9898 + z * 78.233 + CFG.rngSalt) * 43758.5453
    return value - Math.floor(value)
  }

  _random() {
    this._noiseState = (Math.imul(this._noiseState, 1664525) + 1013904223) >>> 0
    return this._noiseState / 0x100000000
  }

  _surfaceY(x, z) {
    return this.terrainProvider?.getTopSolidYWorld?.(x, z)
  }

  _snapToGround() {
    const surfaceY = this._surfaceY(this.group.position.x, this.group.position.z)
    if (surfaceY != null)
      this.group.position.y = surfaceY + 1
  }

  _isFootprintCell(x, z) {
    const cellX = Math.floor(x)
    const cellZ = Math.floor(z)
    return this.footprint.some(cell => cell.x === cellX && cell.z === cellZ)
  }

  _isInsideActivityRing(x, z) {
    const dx = x - this.activityCenter.x
    const dz = z - this.activityCenter.z
    const distance = Math.hypot(dx, dz)
    return distance >= CFG.activityRadiusMin && distance <= CFG.activityRadiusMax
  }

  _turnAway() {
    const direction = this._random() < 0.5 ? -1 : 1
    this.group.rotation.y += direction * (Math.PI * 0.5 + this._random() * CFG.turnNoiseRadians)
  }

  _updateCrawlVisuals() {
    const antennaWave = Math.sin(this._elapsedSec * 4.5)
    this.bodyPivots.forEach((pivot, index) => {
      const wave = Math.sin(this._elapsedSec * 8 - index * 0.9)
      pivot.scale.y = 1 + wave * 0.06
      pivot.position.y = Math.max(0, wave) * 0.012
    })
    this.headPivot.rotation.y = Math.sin(this._elapsedSec * 2.2) * 0.08
    this.leftAntennaPivot.rotation.z = antennaWave * 0.11
    this.rightAntennaPivot.rotation.z = -antennaWave * 0.11
    this.shellPivot.rotation.z = Math.sin(this._elapsedSec * 3.2) * 0.035
  }

  _updateRetractVisuals() {
    let antenna = 1
    let head = 1
    let body = 1

    if (this.fsm.state === SNAIL_STATES.RETRACTING) {
      const progress = this.fsm.timerMs / this.fsm.retractMs
      antenna = stageVisibility(progress, 0)
      head = stageVisibility(progress, 1)
      body = stageVisibility(progress, 2)
    }
    else if (this.fsm.state === SNAIL_STATES.RETRACTED) {
      antenna = 0
      head = 0
      body = 0
    }
    else if (this.fsm.state === SNAIL_STATES.EMERGING) {
      const progress = 1 - this.fsm.timerMs / this.fsm.emergeMs
      antenna = stageVisibility(progress, 0)
      head = stageVisibility(progress, 1)
      body = stageVisibility(progress, 2)
    }

    // 保留极小缩放，避免零缩放矩阵造成射线与阴影边界异常
    const antennaScale = Math.max(antenna, 0.001)
    const headScale = Math.max(head, 0.001)
    const bodyScale = Math.max(body, 0.001)
    this.leftAntennaPivot.scale.set(antennaScale, antennaScale, antennaScale)
    this.rightAntennaPivot.scale.set(antennaScale, antennaScale, antennaScale)
    this.headMesh.scale.set(headScale, headScale, headScale)
    this.bodyPivots.forEach((pivot) => {
      pivot.scale.set(bodyScale, bodyScale, bodyScale)
      pivot.position.y = 0
      pivot.position.z = THREE.MathUtils.lerp(-0.15, pivot.userData.baseZ, body)
    })
    this.headPivot.position.z = 0.34 - (1 - head) * 0.22
  }

  getClickMeshes() {
    return this._clickMeshes
  }

  getPosition() {
    return this.group.position
  }

  startRetract() {
    snailFsmOnClick(this.fsm)
  }

  isCrawling() {
    return this.fsm.state === SNAIL_STATES.CRAWLING
  }

  update(dtSec) {
    const delta = Number.isFinite(dtSec) ? Math.max(0, dtSec) : 0
    snailFsmUpdate(this.fsm, delta * 1000)
    this._updateRetractVisuals()

    if (!this.isCrawling())
      return

    this._elapsedSec += delta
    this._turnTimerSec += delta
    if (this._turnTimerSec >= CFG.turnNoiseInterval) {
      this._turnTimerSec %= CFG.turnNoiseInterval
      this.group.rotation.y += (this._random() * 2 - 1) * CFG.turnNoiseRadians
    }
    this._updateCrawlVisuals()

    const distance = CFG.crawlSpeed * delta
    if (distance <= 0) {
      this._snapToGround()
      return
    }

    const x = this.group.position.x
    const z = this.group.position.z
    const nextX = x + Math.sin(this.group.rotation.y) * distance
    const nextZ = z + Math.cos(this.group.rotation.y) * distance
    const currentSurfaceY = this._surfaceY(x, z)
    const nextSurfaceY = this._surfaceY(nextX, nextZ)

    const blocked = currentSurfaceY == null
      || nextSurfaceY == null
      || this._isFootprintCell(nextX, nextZ)
      || !this._isInsideActivityRing(nextX, nextZ)
      || Math.abs(nextSurfaceY - currentSurfaceY) > CFG.maxStepHeight

    if (blocked) {
      this._turnAway()
      this._snapToGround()
      return
    }

    this.group.position.set(nextX, nextSurfaceY + 1, nextZ)
  }

  destroy() {
    this.scene.remove(this.group)
    this._clickMeshes.forEach((mesh) => {
      delete mesh.userData.snailRef
    })
    this._clickMeshes.length = 0
    this.group.clear()
  }
}
