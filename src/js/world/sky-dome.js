import * as THREE from 'three'

import Experience from '../experience.js'

/**
 * SkyDome - 天空球组件
 *
 * Phase 1 PoC 临时妥协：ShaderMaterial 双贴图混合在 WebGPU 不可用，
 * 降级为 MeshBasicMaterial 单贴图（setTextures 取 current，忽略 mix）。
 * TODO(Phase 3): MeshBasicNodeMaterial + TSL mix(textureA, textureB, factor)
 */
export default class SkyDome {
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources

    this.geometry = new THREE.SphereGeometry(
      150,
      64,
      32,
      0,
      Math.PI * 2,
      0,
      Math.PI,
    )

    this.material = new THREE.MeshBasicMaterial({
      map: null,
      side: THREE.BackSide,
      depthWrite: false,
    })

    // 兼容旧 API 的占位（Phase 3 恢复真正混合）
    this._mixFactor = 0
    this._textureA = null
    this._textureB = null

    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.renderOrder = -1000
    this.scene.add(this.mesh)
  }

  /**
   * 设置当前和下一个贴图
   * @param {THREE.Texture} current - 当前时段贴图
   * @param {THREE.Texture} next - 下一时段贴图
   */
  setTextures(current, next) {
    this._textureA = current
    this._textureB = next
    // Phase 1：仅显示 current
    this.material.map = current
    this.material.needsUpdate = true
  }

  /**
   * 设置混合因子（Phase 1 无视觉效果）
   * @param {number} factor - 0-1 的混合比例
   */
  setMixFactor(factor) {
    this._mixFactor = factor
  }

  /**
   * 每帧更新：跟随相机位置
   * @param {THREE.Vector3} cameraPosition - 相机位置
   */
  update(cameraPosition) {
    if (cameraPosition) {
      this.mesh.position.copy(cameraPosition)
    }
  }

  /**
   * 销毁资源
   */
  destroy() {
    this.scene.remove(this.mesh)
    this.geometry.dispose()
    this.material.dispose()
  }
}
