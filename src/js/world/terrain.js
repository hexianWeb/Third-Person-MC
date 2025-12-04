import * as THREE from 'three'
import fragmentShader from '../../shaders/terrain/fragment.glsl'
import vertexShader from '../../shaders/terrain/vertex.glsl'
import Experience from '../experience.js'

export default class Terrain {
  constructor(size = 64) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources
    this.debug = this.experience.debug
    this.time = this.experience.time

    this.size = size
    this.resolution = 128 // 分段数，越高越平滑，也越耗性能

    // 配置参数
    this.params = {
      color: '#6a954e', // 草方块绿色
      textureScale: 128, // 纹理重复次数，通常设为地形大小以保证 1 unit = 1 block
    }

    this.setGeometry()
    this.setTextures()
    this.setMaterial()
    this.setMesh()

    if (this.debug.active) {
      this.debugInit()
    }
  }

  setGeometry() {
    this.geometry = new THREE.PlaneGeometry(
      this.size,
      this.size,
      this.resolution,
      this.resolution,
    )
    // 旋转使其水平
    this.geometry.rotateX(-Math.PI / 2)
  }

  setTextures() {
    this.textures = {}

    // 获取 Top 纹理
    this.textures.top = this.resources.items.grass_block_top_texture
    this.textures.top.wrapS = THREE.RepeatWrapping
    this.textures.top.wrapT = THREE.RepeatWrapping
    this.textures.top.minFilter = THREE.NearestFilter // 像素风格
    this.textures.top.magFilter = THREE.NearestFilter

    // 获取 Side 纹理 (暂时备用)
    this.textures.side = this.resources.items.grass_block_side_texture
    if (this.textures.side) {
      this.textures.side.wrapS = THREE.RepeatWrapping
      this.textures.side.wrapT = THREE.RepeatWrapping
      this.textures.side.minFilter = THREE.NearestFilter
      this.textures.side.magFilter = THREE.NearestFilter
    }
  }

  setMaterial() {
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uTopTexture: { value: this.textures.top },
        uSideTexture: { value: this.textures.side },
        uColor: { value: new THREE.Color(this.params.color) },
        // 可以在这里传递缩放参数给 Shader 处理 UV，
        // 但更简单的方法是直接修改 geometry 的 uv 属性，或者在 shader 里乘
      },
      side: THREE.DoubleSide,
    })

    // 更新 UV 以实现纹理重复
    this.updateUVs()
  }

  updateUVs() {
    // 手动调整 UV 缩放
    const uvAttribute = this.geometry.attributes.uv
    for (let i = 0; i < uvAttribute.count; i++) {
      // 原始 UV 是 0-1
      // 乘以 params.textureScale 实现重复
      // 比如 64x64 的地块，想要 64 个格子，就乘 64
      const u = uvAttribute.getX(i) * this.params.textureScale
      const v = uvAttribute.getY(i) * this.params.textureScale

      // 我们这里暂时直接修改 buffer，或者可以在 Shader 里做 vUv = uv * uTextureScale
      // 考虑到性能，Shader 里做更动态，但修改 buffer 一次性搞定。
      // 为了方便  Debug 调整，我们改为在 Shader 里处理（需要添加 uniform）或者重写 buffer
      // 这里选择重写 buffer 的简单方式，但为了 Debug 实时性，最好用 Uniform。
      // 让我们修改一下 plan: 在 Shader 中处理 UV Scale
    }

    // 既然上面 Loop 写了一半，我决定改成用 Uniform 控制 Scale，更灵活
    this.material.uniforms.uTextureScale = { value: new THREE.Vector2(this.params.textureScale, this.params.textureScale) }
  }

  setMesh() {
    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.receiveShadow = true
    this.mesh.position.set(0, 0.01, 0)
    this.scene.add(this.mesh)
  }

  update() {
    this.material.uniforms.uTime.value = this.time.elapsed * 0.001
  }

  debugInit() {
    this.debugFolder = this.debug.ui.addFolder({
      title: 'Terrain Shader',
      expanded: true,
    })

    this.debugFolder.addBinding(this.params, 'color', {
      view: 'color',
      label: 'Grass Tint',
    }).on('change', () => {
      this.material.uniforms.uColor.value.set(this.params.color)
    })

    this.debugFolder.addBinding(this.params, 'textureScale', {
      min: 1,
      max: 256,
      step: 1,
      label: 'Texture Scale',
    }).on('change', () => {
      this.material.uniforms.uTextureScale.value.set(this.params.textureScale, this.params.textureScale)
    })
  }
}
