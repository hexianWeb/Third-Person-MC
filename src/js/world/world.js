import * as THREE from 'three'
import CameraRig from '../camera/camera-rig.js'
import {
  CHUNK_BASIC_CONFIG,
  TERRAIN_PARAMS,
} from '../config/chunk-config.js'
import { INTERACTION_CONFIG } from '../config/interaction-config.js'
import Experience from '../experience.js'
import BlockBreakParticles from '../interaction/block-break-particles.js'
import BlockInteractionManager from '../interaction/block-interaction-manager.js'
import BlockMiningController from '../interaction/block-mining-controller.js'
import BlockMiningOverlay from '../interaction/block-mining-overlay.js'
import BlockRaycaster from '../interaction/block-raycaster.js'
import BlockSelectionHelper from '../interaction/block-selection-helper.js'
import ItemPickupAnimator from '../interaction/item-pickup-animator.js'
import emitter from '../utils/event/event-bus.js'
import Environment from './environment.js'
import Player from './player/player.js'
import ChunkManager from './terrain/chunk-manager.js'

/**
 * World 场景编排器：只负责在 core:ready 后按依赖顺序创建组件、编排 update/destroy。
 * 具体职责见 .agent/skills/vtj-scene-management/SKILL.md
 */
export default class World {
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources

    this.scene.add(new THREE.AxesHelper(5))

    emitter.on('core:ready', () => {
      this._initTerrain()
      this._initPlayerAndCamera()
      this._initEnvironment()
      this._initBlockInteraction()
      this._initEffects()
      this._setupSettingsListeners()
    })
  }

  /** 地形：ChunkManager + 暴露 terrainDataManager + 初始网格 */
  _initTerrain() {
    this.chunkManager = new ChunkManager({
      chunkWidth: CHUNK_BASIC_CONFIG.chunkWidth,
      chunkHeight: CHUNK_BASIC_CONFIG.chunkHeight,
      viewDistance: CHUNK_BASIC_CONFIG.viewDistance,
      seed: 1265,
      terrain: {
        scale: TERRAIN_PARAMS.scale,
        magnitude: TERRAIN_PARAMS.magnitude,
        offset: TERRAIN_PARAMS.offset,
        rockExpose: TERRAIN_PARAMS.rockExpose,
        fbm: TERRAIN_PARAMS.fbm,
      },
    })
    this.experience.terrainDataManager = this.chunkManager
    this.chunkManager.initInitialGrid()
  }

  /** 玩家 + 相机 Rig，依赖地形（贴地/碰撞用 terrainDataManager） */
  _initPlayerAndCamera() {
    this.player = new Player()
    this.cameraRig = new CameraRig()
    this.cameraRig.attachPlayer(this.player)
    this.experience.camera.attachRig(this.cameraRig)

    // 启动时立即初始化玩家预览，避免依赖 settings 事件导致预览缺失
    this.experience.renderer.initPlayerPreview(this.player)
  }

  /** 环境（天空、光照等） */
  _initEnvironment() {
    this.environment = new Environment()
  }

  /** 方块交互链：射线、选中框、挖矿控制器/覆盖层、交互管理器 */
  _initBlockInteraction() {
    this.blockRaycaster = new BlockRaycaster({
      chunkManager: this.chunkManager,
      maxDistance: INTERACTION_CONFIG.raycast.maxDistance,
      useMouse: false,
    })
    this.blockSelectionHelper = new BlockSelectionHelper({ enabled: true })
    this.blockMiningController = new BlockMiningController({
      enabled: true,
      miningDuration: INTERACTION_CONFIG.mining.duration,
    })
    this.blockMiningOverlay = new BlockMiningOverlay()
    this.blockInteractionManager = new BlockInteractionManager({
      chunkManager: this.chunkManager,
      blockRaycaster: this.blockRaycaster,
      blockMiningController: this.blockMiningController,
    })
  }

  /** 视觉效果：破碎粒子、拾取动画 */
  _initEffects() {
    this.blockBreakParticles = new BlockBreakParticles()
    this.itemPickupAnimator = new ItemPickupAnimator()
  }

  /** 设置变更监听（视距等） */
  _setupSettingsListeners() {
    emitter.on('settings:chunks-changed', (data) => {
      if (!this.chunkManager)
        return
      if (data.viewDistance !== undefined)
        this.chunkManager.viewDistance = data.viewDistance
      if (data.unloadPadding !== undefined)
        this.chunkManager.unloadPadding = data.unloadPadding
      if (this.player) {
        const pos = this.player.getPosition()
        this.chunkManager.updateStreaming({ x: pos.x, z: pos.z }, true)
      }
      this.experience.renderer.initPlayerPreview(this.player)
    })
  }

  /**
   * 每帧更新，顺序与依赖一致：地形流式 → 地形动画 → 挖矿 → 玩家/环境 → 射线/选中框 → 粒子
   */
  update() {
    if (this.chunkManager && this.player) {
      const pos = this.player.getPosition()
      this.chunkManager.updateStreaming({ x: pos.x, z: pos.z })
      this.chunkManager.pumpIdleQueue()
    }
    if (this.chunkManager)
      this.chunkManager.update()
    if (this.blockMiningController)
      this.blockMiningController.update()
    if (this.player)
      this.player.update()
    if (this.environment)
      this.environment.update()
    if (this.blockRaycaster)
      this.blockRaycaster.update()
    if (this.blockSelectionHelper)
      this.blockSelectionHelper.update()
    if (this.blockBreakParticles)
      this.blockBreakParticles.update()
  }

  /**
   * Reset the world with new seed and worldgen params (lightweight rebuild)
   * @param {object} options
   * @param {number} options.seed - The new world seed
   * @param {object} [options.terrain] - Terrain generation params
   * @param {object} [options.trees] - Tree generation params
   */
  reset({ seed, terrain, trees } = {}) {
    if (!this.chunkManager) {
      console.warn('[World] Cannot reset: chunkManager not initialized')
      return
    }

    // Use the new lightweight regeneration API
    this.chunkManager.regenerateAll({
      seed,
      terrain,
      trees,
      centerPos: { x: this.chunkManager.chunkWidth * 0.5, z: this.chunkManager.chunkWidth * 0.5 },
      forceSyncCenterChunk: true,
    })

    // Reset player position to safe spawn point (Strategy A)
    if (this.player) {
      // 触发一次重生，它内部会通过最新的 chunkManager 数据计算正确的高度
      this.player.respawn()
    }
  }

  destroy() {
    // Destroy child components
    this.blockMiningOverlay?.dispose()
    this.blockInteractionManager?.destroy()
    this.blockMiningController?.destroy()
    this.blockBreakParticles?.destroy()
    this.itemPickupAnimator?.destroy()
    this.blockSelectionHelper?.dispose()
    this.blockRaycaster?.destroy()
    this.environment?.destroy()
    this.cameraRig?.destroy()
    this.player?.destroy()
    this.chunkManager?.destroy()

    // Clear terrainDataManager reference
    if (this.experience.terrainDataManager === this.chunkManager) {
      this.experience.terrainDataManager = null
    }
  }
}
