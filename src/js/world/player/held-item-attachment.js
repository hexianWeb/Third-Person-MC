import * as THREE from 'three'

// GLTFLoader 会 sanitize 节点名并去掉 ':'（资产原名 Arm:Right:Lower）
export const BONE_NAME = 'ArmRightLower'
export const SOCKET_NAME = 'HeldItemSocket'
export const MESH_NAME = 'PlaceholderHandle'

/**
 * 运行时手持物挂载：bone → socket → placeholder
 * Debug 只调 socket 位姿；默认隐藏，用于验证握持点与动画兼容性
 */
export default class HeldItemAttachment {
  constructor() {
    this.model = null
    this.bone = null
    this.socket = null
    this.mesh = null
    /** @type {THREE.Object3D | null} 自定义手持物（如蜗牛），不 dispose 共享几何 */
    this._customHeld = null
    this.debugFolder = null
    this.attachFailed = false
    this._loggedMissingBoneForModel = null

    this.params = {
      enabled: false,
      // 默认握持位姿：Y 抬到手掌附近，绕 X 转 -π/2 让手柄轴向更合理
      position: { x: 0, y: 0.3, z: 0 },
      rotation: { x: -Math.PI / 2, y: 0, z: 0 },
      scale: 1,
    }
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

    const isLiveAttachment =
      this.model === model
      && model.getObjectByName(BONE_NAME) === this.bone
      && this.socket?.parent === this.bone
      && this.mesh?.parent === this.socket

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
    if (!this.mesh)
      this.mesh = this._createPlaceholderMesh()

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
   * 设置自定义手持物；传 null 清除并隐藏（占位块一并隐藏）
   * @param {THREE.Object3D | null} object3D
   */
  setHeldObject(object3D) {
    this._clearCustomHeld()

    if (!object3D) {
      if (this.mesh)
        this.mesh.visible = true
      this.setEnabled(false)
      return
    }

    if (!this.socket) {
      console.warn('[HeldItemAttachment] setHeldObject skipped: socket not ready')
      return
    }

    if (this.mesh)
      this.mesh.visible = false

    this._customHeld = object3D
    this.socket.add(object3D)
    this.setEnabled(true)
  }

  _clearCustomHeld() {
    if (!this._customHeld)
      return
    this._customHeld.removeFromParent()
    this._customHeld = null
  }

  /**
   * @param {import('tweakpane').FolderApi | { addFolder: Function }} parentFolder
   */
  debugInit(parentFolder) {
    if (this.debugFolder || !parentFolder)
      return
    // Task 3 fills bindings; keep guard only in Task 1 if preferred,
    // but implement full panel here to avoid a second pass on this file:
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
    this.model = null
    this.attachFailed = false
    this._loggedMissingBoneForModel = null
  }

  _createSocket() {
    const socket = new THREE.Object3D()
    socket.name = SOCKET_NAME
    socket.rotation.order = 'XYZ'
    return socket
  }

  _createPlaceholderMesh() {
    const geometry = new THREE.BoxGeometry(0.06, 0.7, 0.06)
    // 将握持点靠近局部原点（默认 Box 原点在中心）
    geometry.translate(0, 0.25, 0)
    const material = new THREE.MeshStandardMaterial({
      color: 0xff5533,
      roughness: 0.65,
      metalness: 0,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = MESH_NAME
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
    this._clearCustomHeld()

    if (this.mesh)
      this.mesh.removeFromParent()
    if (this.socket)
      this.socket.removeFromParent()

    this.bone = null

    if (!disposeResources)
      return

    if (this.mesh) {
      this.mesh.geometry?.dispose()
      const { material } = this.mesh
      if (Array.isArray(material))
        material.forEach((m) => m.dispose())
      else
        material?.dispose()
    }

    this.mesh = null
    this.socket = null
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
