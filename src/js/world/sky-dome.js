import {
  mix,
  uniform,
  uniformTexture,
} from 'three/tsl'
import * as THREE from 'three/webgpu'

import Experience from '../experience.js'

/**
 * SkyDome - 天空球组件
 *
 * Phase 3：MeshBasicNodeMaterial + TSL mix(textureA, textureB, factor)
 * 参考：shaders/sky/*（GLSL 留作对照，Phase 5 归档）
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

    // 占位 1x1 纹理，避免 init 时 sampler 为空
    this._placeholder = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
    this._placeholder.needsUpdate = true

    this.uTextureA = uniformTexture(this._placeholder)
    this.uTextureB = uniformTexture(this._placeholder)
    this.uMixFactor = uniform(0)

    this.material = new THREE.MeshBasicNodeMaterial({
      side: THREE.BackSide,
      depthWrite: false,
    })
    this.material.colorNode = mix(this.uTextureA, this.uTextureB, this.uMixFactor)

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
    this.uTextureA.value = current || this._placeholder
    this.uTextureB.value = next || current || this._placeholder
  }

  /**
   * 设置混合因子（0–1）
   * @param {number} factor - 0-1 的混合比例
   */
  setMixFactor(factor) {
    this.uMixFactor.value = factor
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
    this._placeholder.dispose()
  }
}
