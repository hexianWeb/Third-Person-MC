import * as THREE from 'three'

import Experience from '../experience.js'
import emitter from '../utils/event-bus.js'

/**
 * BlockSelectionHelper
 * - 用于高亮当前“被交互的方块”（hover/选中）
 * - 仅负责可视化，不负责射线检测
 */
export default class BlockSelectionHelper {
  constructor(options = {}) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.debug = this.experience.debug

    this.params = {
      enabled: options.enabled ?? true,
      visibleThroughWalls: options.visibleThroughWalls ?? false,
      color: options.color ?? '#bfbfac',
      opacity: options.opacity ?? 0.3,
    }

    // 模式状态：remove | add
    this.mode = 'remove'
    this._colors = {
      remove: new THREE.Color('#ff3333'), // 红色
      add: new THREE.Color('#33ff33'), // 绿色
    }

    // 使用几何体：略大于 1 以防止 z-fighting
    this.geometry = new THREE.BoxGeometry(1.01, 1.01, 1.01)

    this.material = new THREE.MeshBasicMaterial({
      color: this._colors.remove, // 默认红色
      transparent: true,
      opacity: this.params.opacity,
      depthTest: !this.params.visibleThroughWalls,
      depthWrite: false,
    })

    this.object = new THREE.Mesh(this.geometry, this.material)
    this.object.visible = false
    this.object.frustumCulled = false
    this.object.renderOrder = 0
    this.scene.add(this.object)

    // 移除旧的事件监听 (改为 update 轮询)
    /*
    emitter.on('game:block-hover', (info) => {
      if (!this.params.enabled)
        return
      this.setTarget(info)
    })
    emitter.on('game:block-hover-clear', () => {
      this.clear()
    })
    */

    // 监听编辑模式切换
    emitter.on('game:block_edit_mode_changed', ({ mode }) => {
      this.mode = mode
      const color = this._colors[mode] || this._colors.remove
      this.material.color.copy(color)
      // 如果需要，可在此更新当前高亮位置（如果当前正选中方块）
    })

    if (this.debug.active) {
      this.debugInit()
    }
  }

  update() {
    if (!this.params.enabled) {
      this.clear()
      return
    }

    // 主动获取最新的射线检测结果
    const raycaster = this.experience.world?.blockRaycaster
    if (raycaster && raycaster.current) {
      this.setTarget(raycaster.current)
    }
    else {
      this.clear()
    }
  }

  /**
   * 设置当前选中方块
   * @param {{ worldPosition:THREE.Vector3, renderScale?:number }} info
   */
  setTarget(info) {
    if (!info?.worldPosition) {
      this.clear()
      return
    }

    const s = info.renderScale ?? 1
    this.object.scale.setScalar(s)

    // add 模式：基于 face.normal 预览相邻格子
    if (this.mode === 'add' && info.face?.normal) {
      const normal = info.face.normal
      // console.log(normal)
      // 注意高度可能有缩放
      const hScale = info.heightScale ?? 1

      this.object.position.set(
        info.worldPosition.x + normal.x * s,
        info.worldPosition.y + normal.y * s * hScale,
        info.worldPosition.z + normal.z * s,
      )
    }
    // remove 模式（或无 face）：高亮命中方块本身
    else {
      this.object.position.copy(info.worldPosition)
    }

    this.object.visible = true
  }

  /**
   * 清空选中
   */
  clear() {
    this.object.visible = false
  }

  debugInit() {
    this.debugFolder = this.debug.ui.addFolder({
      title: 'Block Selection',
      expanded: false,
    })

    this.debugFolder.addBinding(this.params, 'enabled', { label: '启用' }).on('change', () => {
      if (!this.params.enabled)
        this.clear()
    })

    this.debugFolder.addBinding(this.params, 'visibleThroughWalls', {
      label: '穿透显示',
    }).on('change', () => {
      this.material.depthTest = !this.params.visibleThroughWalls
      this.material.needsUpdate = true
    })

    this.debugFolder.addBinding(this.params, 'opacity', {
      label: '透明度',
      min: 0.05,
      max: 1,
      step: 0.05,
    }).on('change', () => {
      this.material.opacity = this.params.opacity
    })

    this.debugFolder.addBinding(this.params, 'color', {
      label: '颜色',
      view: 'color',
    }).on('change', () => {
      this.material.color.set(this.params.color)
    })
  }

  dispose() {
    this.scene.remove(this.object)
    this.object.geometry?.dispose?.()
    this.material?.dispose?.()
  }
}
