import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'

import Experience from '../../experience.js'
import emitter from '../event/event-bus.js'

export default class Resources {
  constructor(sources, options = {}) {
    this.experience = new Experience()
    this.renderer = this.experience.renderer
    this.sources = sources

    this.items = {}
    this.toLoad = this.sources.length
    this.loaded = 0

    this.options = {
      dracoDecoderPath: 'https://www.gstatic.com/draco/v1/decoders/',
      ktx2TranscoderPath: 'https://unpkg.com/three/examples/jsm/libs/basis/',
      ...options,
    }

    this.setLoaders()
    // WebGPURenderer 需 await init 后 hasFeature 才可用；延迟 KTX2 detectSupport + 资源加载
    this._bootstrapLoading()
  }

  setLoaders() {
    this.loaders = {}
    this.loaders.gltfLoader = new GLTFLoader()
    this.loaders.textureLoader = new THREE.TextureLoader()
    this.loaders.cubeTextureLoader = new THREE.CubeTextureLoader()
    this.loaders.fontLoader = new FontLoader()
    this.loaders.fbxLoader = new FBXLoader()
    this.loaders.audioLoader = new THREE.AudioLoader()
    this.loaders.objLoader = new OBJLoader()
    this.loaders.hdrTextureLoader = new HDRLoader()
    this.loaders.svgLoader = new SVGLoader()
    this.loaders.exrLoader = new EXRLoader()
    this.loaders.ktx2Loader = new KTX2Loader()

    // Set up DRACOLoader
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath(this.options.dracoDecoderPath)
    this.loaders.gltfLoader.setDRACOLoader(dracoLoader)

    // KTX2：只设路径与挂载；detectSupport 必须在 renderer.init() 之后（见 _bootstrapLoading）
    this.loaders.ktx2Loader.setTranscoderPath(this.options.ktx2TranscoderPath)
    this.loaders.gltfLoader.setKTX2Loader(this.loaders.ktx2Loader)
  }

  /**
   * 等待 WebGPU backend 就绪后再 detectSupport，避免 hasFeature 在 init 前抛错
   */
  async _bootstrapLoading() {
    try {
      if (this.renderer?.whenReady) {
        await this.renderer.whenReady()
      }
      this.loaders.ktx2Loader.detectSupport(this.renderer.instance)
    }
    catch (error) {
      console.error('[Resources] Renderer not ready; KTX2 detectSupport skipped:', error)
    }

    this.startLoading()
  }

  startLoading() {
    for (const source of this.sources) {
      switch (source.type) {
        case 'gltfModel': {
          this.loaders.gltfLoader.load(source.path, (file) => {
            this.sourceLoaded(source, file)
          })
          break
        }
        case 'texture': {
          this.loaders.textureLoader.load(source.path, (file) => {
            this.sourceLoaded(source, file)
          })
          break
        }
        case 'cubeTexture': {
          this.loaders.cubeTextureLoader.load(source.path, (file) => {
            this.sourceLoaded(source, file)
          })
          break
        }
        case 'font': {
          this.loaders.fontLoader.load(source.path, (file) => {
            this.sourceLoaded(source, file)
          })
          break
        }
        case 'fbxModel': {
          this.loaders.fbxLoader.load(source.path, (file) => {
            this.sourceLoaded(source, file)
          })
          break
        }
        case 'audio': {
          this.loaders.audioLoader.load(source.path, (file) => {
            this.sourceLoaded(source, file)
          })
          break
        }
        case 'objModel': {
          this.loaders.objLoader.load(source.path, (file) => {
            this.sourceLoaded(source, file)
          })
          break
        }
        case 'hdrTexture': {
          this.loaders.hdrTextureLoader.load(source.path, (file) => {
            this.sourceLoaded(source, file)
          })
          break
        }
        case 'svg': {
          this.loaders.svgLoader.load(source.path, (file) => {
            this.sourceLoaded(source, file)
          })
          break
        }
        case 'exrTexture': {
          this.loaders.exrLoader.load(source.path, (file) => {
            this.sourceLoaded(source, file)
          })
          break
        }
        case 'video': {
          this.loadVideoTexture(source.path).then((file) => {
            this.sourceLoaded(source, file)
          })
          break
        }
        case 'ktx2Texture': {
          this.loaders.ktx2Loader.load(source.path, (file) => {
            this.sourceLoaded(source, file)
          })
          break
        }
        // No default
      }
    }
  }

  sourceLoaded(source, file) {
    this.items[source.name] = file
    this.loaded++

    // 统一由 Vue LoadingScreen 消费进度
    emitter.emit('core:loading-progress', {
      loaded: this.loaded,
      total: this.toLoad,
      phase: 'assets',
    })

    if (this.loaded === this.toLoad)
      emitter.emit('core:ready')
  }

  loadVideoTexture(path) {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      video.src = path
      video.loop = true
      video.muted = true
      video.playsInline = true

      video.addEventListener('loadeddata', () => {
        const texture = new THREE.VideoTexture(video)
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.format = THREE.RGBFormat

        resolve(texture)
      })

      video.load()
    })
  }

  get loadProgress() {
    return this.loaded / this.toLoad
  }

  get isLoaded() {
    return this.loaded === this.toLoad
  }

  destroy() {
    // Dispose all loaded textures
    for (const item of Object.values(this.items)) {
      if (item?.dispose) {
        item.dispose()
      }
      // For GLTF models, traverse and dispose
      if (item?.scene?.traverse) {
        item.scene.traverse((child) => {
          if (child.geometry)
            child.geometry.dispose()
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose())
            }
            else {
              child.material.dispose()
            }
          }
        })
      }
    }

    // Clear items
    this.items = {}
    this.loaded = 0
  }
}
