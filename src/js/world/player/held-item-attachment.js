import * as THREE from 'three'
import { isHeldTool, ITEM_BY_ID } from '../../config/items-config.js'

// GLTFLoader 会 sanitize 节点名并去掉 ':'（资产原名 Arm:Right:Lower）
export const BONE_NAME = 'ArmRightLower'
export const SOCKET_NAME = 'HeldItemSocket'
export const MESH_NAME = 'PlaceholderHandle'

/**
 * 运行时手持物挂载：bone → socket → 工具网格
 * tool.glb 原点已在握把；缩放由 socket.scale 统一应用（资产侧已 Apply Scale）
 */
export default class HeldItemAttachment {
  constructor() {
    this.model = null
    this.bone = null
    this.socket = null
    /** @type {THREE.Object3D | null} 当前显示的工具或占位 */
    this.mesh = null
    this.debugFolder = null
    this.attachFailed = false
    this._loggedMissingBoneForModel = null
    /** @type {Map<string, THREE.Object3D>} heldMesh 名 → 克隆体 */
    this._toolMeshes = new Map()
    this._activeToolName = null
    this._placeholder = null

    // 握持位姿：Y 抬到手掌附近，绕 X -π/2 对齐手柄轴向
    this.params = {
      enabled: false,
      position: { x: 0, y: 0.3, z: 0 },
      rotation: { x: -1.57, y: 0, z: 0 },
      scale: 1,
    }
  }

  /**
   * 从 tool.glb 构建手持网格库
   * @param {{ scene: THREE.Object3D } | null | undefined} gltf
   */
  loadToolKit(gltf) {
    if (!gltf?.scene)
      return

    this._disposeToolMeshes()
    gltf.scene.updateMatrixWorld(true)

    const needed = new Set(
      Object.values(ITEM_BY_ID).map(i => i.heldMesh).filter(Boolean),
    )

    needed.forEach((name) => {
      const src = gltf.scene.getObjectByName(name)
      if (!src) {
        console.warn(`[HeldItemAttachment] tool mesh "${name}" not found in tool.glb`)
        return
      }
      const clone = src.clone(true)
      clone.name = name
      clone.visible = false
      clone.frustumCulled = false
      clone.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true
          child.receiveShadow = false
          child.frustumCulled = false
        }
      })
      this._toolMeshes.set(name, clone)
    })

    // 有真实工具后隐藏占位条
    if (this._placeholder)
      this._placeholder.visible = false

    // 工具库就绪后，若已有选中工具则重新挂上
    if (this._activeToolName)
      this._showTool(this._activeToolName)
  }

  /**
   * 按物品 id 切换手持模型（非工具则隐藏）
   * @param {number | null} itemId
   */
  setHeldItemId(itemId) {
    if (!isHeldTool(itemId)) {
      this._hideActiveTool()
      this.setEnabled(false)
      return
    }

    const meshName = ITEM_BY_ID[itemId].heldMesh
    this._showTool(meshName)
    this.setEnabled(true)
    this._applyParamsToSocket()
  }

  /**
   * @param {THREE.Object3D | null | undefined} model
   */
  attach(model) {
    if (model == null)
      return

    const modelChanged = this.model !== model
    if (modelChanged)
      this._loggedMissingBoneForModel = null

    const isLiveAttachment
      = this.model === model
        && model.getObjectByName(BONE_NAME) === this.bone
        && this.socket?.parent === this.bone

    if (isLiveAttachment)
      return

    this._detachCurrentAttachment({ disposeResources: false })
    this.attachFailed = false
    this.model = model

    const bone = model.getObjectByName(BONE_NAME)
    if (!bone) {
      this.attachFailed = true
      this._logMissingBone(model)
      return
    }

    this.bone = bone
    if (!this.socket)
      this.socket = this._createSocket()
    if (!this._placeholder)
      this._placeholder = this._createPlaceholderMesh()

    // 恢复当前工具或占位到 socket
    if (this._activeToolName && this._toolMeshes.has(this._activeToolName)) {
      this.mesh = this._toolMeshes.get(this._activeToolName)
      this.mesh.visible = true
    }
    else {
      this.mesh = this._placeholder
      this.mesh.visible = this._toolMeshes.size === 0
    }

    if (this.mesh.parent !== this.socket)
      this.socket.add(this.mesh)
    if (this.socket.parent !== this.bone)
      this.bone.add(this.socket)

    this._applyParamsToSocket()
    this.socket.visible = this.params.enabled
  }

  /**
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.params.enabled = Boolean(enabled)
    if (this.socket)
      this.socket.visible = this.params.enabled
  }

  /**
   * @param {import('tweakpane').FolderApi | { addFolder: Function }} parentFolder
   */
  debugInit(parentFolder) {
    if (this.debugFolder || !parentFolder)
      return
    this.debugFolder = parentFolder.addFolder({
      title: 'Held Item',
      expanded: false,
    })

    this.debugFolder.addBinding(this.params, 'enabled', {
      label: '显示手持物',
    }).on('change', () => {
      this.setEnabled(this.params.enabled)
    })

    this.debugFolder.addBinding(this.params.position, 'x', {
      label: '位置 X',
      step: 0.01,
    }).on('change', () => this._applyParamsToSocket())
    this.debugFolder.addBinding(this.params.position, 'y', {
      label: '位置 Y',
      step: 0.01,
    }).on('change', () => this._applyParamsToSocket())
    this.debugFolder.addBinding(this.params.position, 'z', {
      label: '位置 Z',
      step: 0.01,
    }).on('change', () => this._applyParamsToSocket())

    this.debugFolder.addBinding(this.params.rotation, 'x', {
      label: '旋转 X (rad)',
      step: 0.01,
    }).on('change', () => this._applyParamsToSocket())
    this.debugFolder.addBinding(this.params.rotation, 'y', {
      label: '旋转 Y (rad)',
      step: 0.01,
    }).on('change', () => this._applyParamsToSocket())
    this.debugFolder.addBinding(this.params.rotation, 'z', {
      label: '旋转 Z (rad)',
      step: 0.01,
    }).on('change', () => this._applyParamsToSocket())

    this.debugFolder.addBinding(this.params, 'scale', {
      label: '缩放',
      min: 0.01,
      max: 5,
      step: 0.01,
    }).on('change', () => this._applyParamsToSocket())
  }

  destroy() {
    this.debugFolder?.dispose?.()
    this.debugFolder = null
    this._detachCurrentAttachment({ disposeResources: true })
    this._disposeToolMeshes()
    this.model = null
    this.attachFailed = false
    this._loggedMissingBoneForModel = null
  }

  _showTool(meshName) {
    if (this._activeToolName === meshName && this.mesh?.visible)
      return

    this._hideActiveTool()
    const tool = this._toolMeshes.get(meshName)
    if (!tool) {
      console.warn(`[HeldItemAttachment] missing tool mesh "${meshName}"`)
      return
    }

    this._activeToolName = meshName
    this.mesh = tool
    tool.visible = true
    if (this.socket && tool.parent !== this.socket)
      this.socket.add(tool)
    if (this._placeholder)
      this._placeholder.visible = false
    // 每次挂上工具都重刷 socket 缩放（避免仅改过 params 未生效）
    this._applyParamsToSocket()
  }

  _hideActiveTool() {
    if (this._activeToolName) {
      const prev = this._toolMeshes.get(this._activeToolName)
      if (prev) {
        prev.visible = false
        prev.removeFromParent()
      }
      this._activeToolName = null
    }
    this.mesh = this._placeholder
    if (this._placeholder && this.socket && this._placeholder.parent !== this.socket)
      this.socket.add(this._placeholder)
  }

  _createSocket() {
    const socket = new THREE.Object3D()
    socket.name = SOCKET_NAME
    socket.rotation.order = 'XYZ'
    return socket
  }

  _createPlaceholderMesh() {
    const geometry = new THREE.BoxGeometry(0.06, 0.7, 0.06)
    geometry.translate(0, 0.25, 0)
    const material = new THREE.MeshStandardMaterial({
      color: 0xFF5533,
      roughness: 0.65,
      metalness: 0,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = MESH_NAME
    mesh.visible = false
    this._placeholder = mesh
    return mesh
  }

  _applyParamsToSocket() {
    if (!this.socket)
      return
    const { position, rotation, scale } = this.params
    this.socket.position.set(position.x, position.y, position.z)
    this.socket.rotation.order = 'XYZ'
    this.socket.rotation.set(rotation.x, rotation.y, rotation.z)
    const safeScale = Math.max(0.01, Number(scale) || 0.01)
    this.params.scale = safeScale
    this.socket.scale.setScalar(safeScale)
  }

  /**
   * @param {{ disposeResources: boolean }} options
   */
  _detachCurrentAttachment({ disposeResources }) {
    this._toolMeshes.forEach(m => m.removeFromParent())
    if (this._placeholder)
      this._placeholder.removeFromParent()
    if (this.socket)
      this.socket.removeFromParent()

    this.bone = null
    this.mesh = null

    if (!disposeResources)
      return

    if (this._placeholder) {
      this._placeholder.geometry?.dispose()
      this._placeholder.material?.dispose?.()
      this._placeholder = null
    }
    this.socket = null
  }

  _disposeToolMeshes() {
    this._toolMeshes.forEach((obj) => {
      obj.removeFromParent()
      obj.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose()
          const { material } = child
          if (Array.isArray(material))
            material.forEach(m => m.dispose())
          else
            material?.dispose()
        }
      })
    })
    this._toolMeshes.clear()
    this._activeToolName = null
  }

  /**
   * @param {THREE.Object3D} model
   */
  _logMissingBone(model) {
    if (this._loggedMissingBoneForModel === model)
      return
    this._loggedMissingBoneForModel = model

    const boneNames = []
    model.traverse((child) => {
      if (child.isBone)
        boneNames.push(child.name)
    })
    const suffix = boneNames.length > 0
      ? ` Available bones: ${boneNames.join(', ')}`
      : ' No bones found on model.'
    console.error(
      `[HeldItemAttachment] Bone "${BONE_NAME}" was not found. Attachment skipped.${suffix}`,
    )
  }
}
