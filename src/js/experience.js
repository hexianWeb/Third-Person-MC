import * as THREE from 'three'

import Camera from './camera/camera.js'
import Renderer from './renderer.js'
import sources from './sources.js'
import Resources from './utils/core/resources.js'
import Sizes from './utils/core/sizes.js'
import Stats from './utils/core/stats.js'
import Time from './utils/core/time.js'
import Debug from './utils/debug/debug.js'
import emitter from './utils/event/event-bus.js'
import IMouse from './utils/input/imouse.js'
import InputManager from './utils/input/input.js'
import PointerLockManager from './utils/input/pointer-lock.js'
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
    // WebGPURenderer 异步 init；render 侧靠 renderer.ready 门闩防竞态
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

    // Listen for pause state changes from UI
    this.isPaused = false
    emitter.on('ui:pause-changed', (paused) => {
      this.isPaused = paused
    })

    // Listen for world creation/reset events from UI
    emitter.on('game:create_world', ({ seed, terrain, trees }) => {
      // First world creation - world is initialized on core:ready
      // Just update seed if chunkManager already exists
      if (this.world?.chunkManager) {
        this.world.reset({ seed, terrain, trees })
      }
    })

    emitter.on('game:reset_world', ({ seed, terrain, trees }) => {
      // Reset existing world with new seed and worldgen params
      if (this.world) {
        this.world.reset({ seed, terrain, trees })
      }
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
    // When paused, skip world and camera updates but keep rendering
    if (!this.isPaused) {
      this.camera.update()
      this.world.update()
    }

    // Renderer 在 ready===false 时内部 no-op，避免 WebGPU 未 init 就 render
    this.renderer.update()
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
