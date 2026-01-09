import * as THREE from 'three'

import Camera from './camera/camera.js'
import Renderer from './renderer.js'
import sources from './sources.js'
import Debug from './utils/debug.js'
import emitter from './utils/event-bus.js'
import IMouse from './utils/imouse.js'
import InputManager from './utils/input.js'
import PointerLockManager from './utils/pointer-lock.js'
import Resources from './utils/resources.js'
import Sizes from './utils/sizes.js'
import Stats from './utils/stats.js'
import Time from './utils/time.js'
import World from './world/world.js'

let instance

export default class Experience {
  constructor(canvas) {
    // Singleton
    if (instance) {
      return instance
    }

    instance = this

    // Global access
    window.Experience = this

    this.canvas = canvas

    // Panel
    this.debug = new Debug()
    this.stats = new Stats()
    this.sizes = new Sizes()
    this.time = new Time()
    this.scene = new THREE.Scene()
    this.camera = new Camera()
    this.renderer = new Renderer()
    this.resources = new Resources(sources)
    this.iMouse = new IMouse()
    this.input = new InputManager()
    this.pointerLock = new PointerLockManager() // 鼠标锁定管理器
    this.terrainDataManager = null // 地形数据管理器 - 将在 World 中初始化
    this.world = new World()

    emitter.on('core:resize', () => {
      this.resize()
    })

    emitter.on('core:tick', () => {
      this.update()
    })

    window.addEventListener('beforeunload', () => {
      this.destroy()
    })
  }

  resize() {
    this.camera.resize()
    this.renderer.resize()
  }

  update() {
    this.camera.update()
    this.world.update()
    this.renderer.update() // 切换为手动更新
    this.stats.update()
    this.iMouse.update()
  }

  destroy() {
    // 1. Stop update loop first
    this.time?.destroy()

    // 2. Destroy child components (reverse init order)
    this.world?.destroy()
    this.pointerLock?.destroy()
    this.input?.destroy()
    this.iMouse?.destroy()
    this.resources?.destroy()
    this.renderer?.destroy()
    this.camera?.destroy()

    // 3. Destroy utils
    this.stats?.destroy()
    this.sizes?.destroy()
    this.debug?.destroy()

    // 4. Clear scene
    if (this.scene) {
      this.scene.traverse((child) => {
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
      this.scene.clear()
    }

    // 5. Clear all mitt events (unified cleanup)
    emitter.all.clear()

    // 6. Clear global references
    if (window.Experience === this) {
      window.Experience = null
    }

    // 7. Reset singleton
    instance = null
  }
}
