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
      opacity: options.opacity ?? 0.1,
    }

    // 使用几何体：略大于 1 以防止 z-fighting
    this.geometry = new THREE.BoxGeometry(1.01, 1.01, 1.01)

    this.material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.params.color),
      transparent: true,
      opacity: this.params.opacity,
      depthTest: !this.params.visibleThroughWalls,
      depthWrite: false,
    })

    this.object = new THREE.Mesh(this.geometry, this.material)
    this.object.visible = false
    this.object.frustumCulled = false
    this.object.renderOrder = 999
    this.scene.add(this.object)

    // 监听射线模块输出
    emitter.on('game:block-hover', (info) => {
      if (!this.params.enabled)
        return
      this.setTarget(info)
    })
    emitter.on('game:block-hover-clear', () => {
      this.clear()
    })

    if (this.debug.active) {
      this.debugInit()
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
    this.object.position.copy(info.worldPosition)
    this.object.scale.setScalar(s)
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
