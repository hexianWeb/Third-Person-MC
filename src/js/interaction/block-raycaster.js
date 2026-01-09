import * as THREE from 'three'

import Experience from '../experience.js'
import emitter from '../utils/event-bus.js'
import { blocks } from '../world/terrain/blocks-config.js'

// 默认使用屏幕中心作为射线发射点（适配 PointerLock/FPS 交互）
const CENTER_SCREEN = new THREE.Vector2(0, 0)

/**
 * BlockRaycaster
 * - 面向 InstancedMesh 的方块拾取
 * - 支持 chunk 场景：通过 chunk 的 group userData 还原世界坐标（网格坐标 + 真实世界坐标）
 *
 * 事件：
 * - game:block-hover：命中方块（持续更新，但仅在目标变化时 emit）
 * - game:block-hover-clear：没有命中
 */
export default class BlockRaycaster {
  constructor(options = {}) {
    this.experience = new Experience()
    this.camera = this.experience.camera.instance
    this.iMouse = this.experience.iMouse
    this.debug = this.experience.debug

    this.chunkManager = options.chunkManager || this.experience.terrainDataManager

    this.params = {
      enabled: options.enabled ?? true,
      maxDistance: options.maxDistance ?? 8,
      // 默认使用屏幕中心；如果你后续要做“鼠标指哪打哪”，改为 useMouse=true 即可
      useMouse: options.useMouse ?? false,
    }

    this.raycaster = new THREE.Raycaster()
    this.raycaster.far = this.params.maxDistance

    // 缓存对象，避免每帧分配
    this._instanceMatrix = new THREE.Matrix4()
    this._worldMatrix = new THREE.Matrix4()
    this._localPos = new THREE.Vector3()
    this._worldPos = new THREE.Vector3()

    this._currentKey = null
    this.current = null

    // 用于调试面板监控
    this.debugInfo = {
      log: 'No hit',
    }

    if (this.debug.active) {
      this.debugInit()
    }
  }

  debugInit() {
    this.debugFolder = this.debug.ui.addFolder({
      title: 'Block Raycaster',
      expanded: false,
    })

    const settings = this.debugFolder.addFolder({ title: '设置', expanded: true })

    settings.addBinding(this.params, 'enabled', { label: '启用' }).on('change', () => {
      if (!this.params.enabled)
        this._clear()
    })

    settings.addBinding(this.params, 'useMouse', { label: '使用鼠标' })

    settings.addBinding(this.params, 'maxDistance', {
      label: '最大距离',
      min: 1,
      max: 30,
      step: 0.5,
    }).on('change', () => {
      this.raycaster.far = this.params.maxDistance
    })

    const monitor = this.debugFolder.addFolder({ title: '拾取监控 (Monitor)', expanded: true })

    monitor.addBinding(this.debugInfo, 'log', {
      label: '实时状态',
      readonly: true,
      multiline: true,
      rows: 6,
    })
  }

  /**
   * 每帧更新：做一次拾取并广播“hover 方块信息”
   */
  update() {
    if (!this.params.enabled || !this.chunkManager?.chunks) {
      this._clear()
      return
    }

    const ndc = this.params.useMouse ? this.iMouse.normalizedMouse : CENTER_SCREEN
    this.raycaster.far = this.params.maxDistance
    this.raycaster.setFromCamera(ndc, this.camera)

    const targets = this._collectTargets()
    if (targets.length === 0) {
      this._clear()
      return
    }

    const hits = this.raycaster.intersectObjects(targets, true)
    const first = hits.find(hit =>
      hit?.object?.isInstancedMesh
      && hit.instanceId !== undefined
      && hit.instanceId !== null,
    )

    if (!first) {
      this._clear()
      return
    }

    const info = this._buildHitInfo(first)
    if (!info) {
      this._clear()
      return
    }

    // 始终更新 current，确保 face/point 等信息是实时的（即使是同一个方块）
    this.current = info

    const key = `${info.chunkX},${info.chunkZ}:${info.local.x},${info.local.y},${info.local.z}`
    if (key !== this._currentKey) {
      this._currentKey = key

      // 更新调试监控
      if (this.debug.active) {
        this.debugInfo.log = `Block: ${info.blockName || 'unknown'} (ID: ${info.blockId})
Instance: ${info.instanceId}
Chunk: ${info.chunkX}, ${info.chunkZ}
World: ${info.worldBlock.x}, ${info.worldBlock.y}, ${info.worldBlock.z}
Local: ${info.local.x}, ${info.local.y}, ${info.local.z}
Dist: ${info.distance?.toFixed(2) || 'N/A'}`
      }

      emitter.emit('game:block-hover', info)
    }
  }

  /**
   * 收集当前可拾取的目标对象
   * - 使用每个 chunk 的 renderer.group 作为根对象（true 递归即可）
   */
  _collectTargets() {
    const groups = []
    for (const chunk of this.chunkManager.chunks.values()) {
      const g = chunk?.renderer?.group
      if (g)
        groups.push(g)
    }
    return groups
  }

  /**
   * 从 intersect 结果构建“方块信息”
   * @param {THREE.Intersection} hit
   */
  _buildHitInfo(hit) {
    const mesh = hit.object
    if (!mesh?.isInstancedMesh)
      return null

    const instanceId = hit.instanceId
    if (instanceId === undefined || instanceId === null)
      return null

    // chunk 信息：由 TerrainChunk 写入 group.userData
    const group = mesh.parent
    const chunkX = group?.userData?.chunkX ?? null
    const chunkZ = group?.userData?.chunkZ ?? null
    const originX = group?.userData?.originX ?? 0
    const originZ = group?.userData?.originZ ?? 0

    // 逻辑网格参数：与碰撞/采样一致（scale 仅用于视觉调试）
    const heightScale = this.chunkManager?.renderParams?.heightScale ?? 1
    const renderScale = this.chunkManager?.renderParams?.scale ?? 1

    // 1) instanceMatrix -> 局部位置（chunk 局部坐标）
    mesh.getMatrixAt(instanceId, this._instanceMatrix)
    this._localPos.setFromMatrixPosition(this._instanceMatrix)

    // 注意：y 在构建矩阵时被乘了 heightScale，需要反解回“方块索引 y”
    const localX = Math.round(this._localPos.x)
    const localZ = Math.round(this._localPos.z)
    const localY = Math.round(this._localPos.y / heightScale)

    // 2) 世界网格坐标（chunk 原点 + local）
    const worldBlockX = originX + localX
    const worldBlockZ = originZ + localZ
    const worldBlockY = localY

    // 3) Three.js 真实世界坐标：matrixWorld * instanceMatrix
    // 用于 selection helper / 后续交互特效
    this._worldMatrix.multiplyMatrices(mesh.matrixWorld, this._instanceMatrix)
    this._worldPos.setFromMatrixPosition(this._worldMatrix)

    // 4) 方块数据：优先用容器查询（避免 mesh.userData 在未来变化时失真）
    const block = this.chunkManager.getBlockWorld(worldBlockX, worldBlockY, worldBlockZ)
    const blockId = block?.id ?? mesh.userData?.blockId ?? blocks.empty.id
    const blockName = mesh.userData?.blockName

    return {
      // chunk 信息
      chunkX,
      chunkZ,
      origin: { x: originX, z: originZ },

      // instance 信息
      instanceId,
      blockId,
      blockName,

      // 坐标信息
      local: { x: localX, y: worldBlockY, z: localZ },
      worldBlock: { x: worldBlockX, y: worldBlockY, z: worldBlockZ },
      worldPosition: this._worldPos.clone(),

      // 渲染参数（供 helper 对齐）
      renderScale,
      heightScale,

      // 命中点（可能不是方块中心，但对“放置/破坏朝向”有用）
      point: hit.point?.clone?.() ?? null,
      face: hit.face ?? null,
      distance: hit.distance ?? null,
    }
  }

  _clear() {
    if (this._currentKey !== null) {
      this._currentKey = null
      this.current = null

      if (this.debug.active) {
        this.debugInfo.log = 'No hit'
      }

      emitter.emit('game:block-hover-clear')
    }
  }

  destroy() {
    this._clear()
    this.chunkManager = null
  }
}
