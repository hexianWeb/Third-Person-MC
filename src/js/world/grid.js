import * as THREE from 'three'
import fragmentShader from '../../shaders/grid/fragment.glsl'
import vertexShader from '../../shaders/grid/vertex.glsl'
import Experience from '../experience.js'

export default class Grid {
  constructor(_planeSize = 200, _planeSubdiv = 1) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.debug = this.experience.debug
    this.camera = this.experience.camera.instance

    // Initialize params for all uniforms
    this.params = {
      uSize: 2.0,
      uColor: new THREE.Color(0.58, 0.58, 0.58),
      uFadeDistance: 100.0,
      uThickness: 1.0,
      uBaseColor: new THREE.Color(0, 0, 0),
      uPlusColor: new THREE.Color(0.36, 0.42, 0.61),
      uPlusScale: 0.5,
      uPlusThickness: 3.0,
      uSubdiv: 2.0,
    }

    this.planeSize = _planeSize
    this.planeSubdiv = _planeSubdiv

    this.setGeometry()
    this.setMaterial()
    this.setMesh()

    if (this.debug.active) {
      this.debugInit()
    }
  }

  setGeometry() {
    // Create a plane geometry
    // Size should be large enough to cover the view, but we will move it with camera
    this.geometry = new THREE.PlaneGeometry(this.planeSize, this.planeSize, this.planeSubdiv, this.planeSubdiv)
    this.geometry.rotateX(-Math.PI / 2)
  }

  setMaterial() {
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false, // Usually grid floors don't write depth to allow objects to show 'in' them or behind properly if transparent
      uniforms: {
        uSize: { value: this.params.uSize },
        uColor: { value: this.params.uColor },
        uFadeDistance: { value: this.params.uFadeDistance },
        uThickness: { value: this.params.uThickness },
        uBaseColor: { value: this.params.uBaseColor },
        uPlusColor: { value: this.params.uPlusColor },
        uPlusScale: { value: this.params.uPlusScale },
        uPlusThickness: { value: this.params.uPlusThickness },
        uSubdiv: { value: this.params.uSubdiv },
      },
    })
  }

  setMesh() {
    this.mesh = new THREE.Mesh(this.geometry, this.material)
    // Prevent frustum culling issues since we move it manually and it's "infinite"
    this.mesh.frustumCulled = false
    // Render order to help with transparency
    // this.mesh.renderOrder = -1
    this.scene.add(this.mesh)
  }

  update() {
    // Move the grid mesh to follow the camera on X and Z
    // This makes the geometry "infinite"
    // We floor it to uSize to avoid jittering if the pattern relies on local UVs,
    // but since we use world position in shader, smooth following is fine.
    if (this.camera) {
      this.mesh.position.x = this.camera.position.x
      this.mesh.position.z = this.camera.position.z
      // Keep Y at 0 or whatever floor level
      this.mesh.position.y = 0
    }
  }

  debugInit() {
    this.debugFolder = this.debug.ui.addFolder({
      title: 'Infinite Grid',
      expanded: false,
    })

    this.debugFolder.addBinding(this.params, 'uSize', {
      label: 'Grid Size',
      min: 1,
      max: 50,
      step: 1,
    }).on('change', ({ value }) => {
      this.material.uniforms.uSize.value = value
    })

    this.debugFolder.addBinding(this.params, 'uThickness', {
      label: 'Thickness',
      min: 0.1,
      max: 5.0,
      step: 0.1,
    }).on('change', ({ value }) => {
      this.material.uniforms.uThickness.value = value
    })

    this.debugFolder.addBinding(this.params, 'uFadeDistance', {
      label: 'Fade Distance',
      min: 10,
      max: 500,
      step: 10,
    }).on('change', ({ value }) => {
      this.material.uniforms.uFadeDistance.value = value
    })

    this.debugFolder.addBinding(this.params, 'uColor', {
      label: 'Grid Color',
      view: 'color',
      color: { type: 'float' },
    }).on('change', ({ value }) => {
      this.material.uniforms.uColor.value = value
    })

    this.debugFolder.addBinding(this.params, 'uBaseColor', {
      label: 'Base Color',
      view: 'color',
      color: { type: 'float' },
    }).on('change', ({ value }) => {
      this.material.uniforms.uBaseColor.value = value
    })

    this.debugFolder.addBinding(this.params, 'uPlusColor', {
      label: 'Plus Color',
      view: 'color',
      color: { type: 'float' },
    }).on('change', ({ value }) => {
      this.material.uniforms.uPlusColor.value = value
    })

    this.debugFolder.addBinding(this.params, 'uPlusScale', {
      label: 'Plus Size',
      min: 0.0,
      max: 0.9,
      step: 0.01,
    }).on('change', ({ value }) => {
      this.material.uniforms.uPlusScale.value = value
    })

    this.debugFolder.addBinding(this.params, 'uPlusThickness', {
      label: 'Plus Thickness',
      min: 0.1,
      max: 10.0,
      step: 0.1,
    }).on('change', ({ value }) => {
      this.material.uniforms.uPlusThickness.value = value
    })

    this.debugFolder.addBinding(this.params, 'uSubdiv', {
      label: 'Subdivisions',
      min: 1,
      max: 4,
      step: 1,
    }).on('change', ({ value }) => {
      this.material.uniforms.uSubdiv.value = value
    })
  }
}
