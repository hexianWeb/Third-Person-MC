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
import emitter from '../utils/event-bus.js'
import Environment from './environment.js'
import Player from './player/player.js'

import ChunkManager from './terrain/chunk-manager.js'

export default class World {
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources

    this.scene.add(new THREE.AxesHelper(5))

    emitter.on('core:ready', () => {
      // ===== Step1：初始化 3×3 chunk 管理器（渲染依赖资源 ready）=====
      this.chunkManager = new ChunkManager({
        chunkWidth: CHUNK_BASIC_CONFIG.chunkWidth,
        chunkHeight: CHUNK_BASIC_CONFIG.chunkHeight,
        viewDistance: CHUNK_BASIC_CONFIG.viewDistance, // 3×3
        seed: 1265, // 使用自定义 seed，覆盖默认值
        terrain: {
          // 与 TerrainGenerator 默认保持一致，可后续接 Debug/Pinia
          scale: TERRAIN_PARAMS.scale,
          magnitude: TERRAIN_PARAMS.magnitude, // 振幅 (0-32)，覆盖默认值
          // offset 为"高度偏移（方块层数）"
          offset: TERRAIN_PARAMS.offset, // 覆盖默认值
          rockExpose: TERRAIN_PARAMS.rockExpose, // 覆盖默认值
          fbm: TERRAIN_PARAMS.fbm, // 覆盖默认值
        },
      })

      // 暴露给 Experience，供玩家碰撞/贴地等使用
      this.experience.terrainDataManager = this.chunkManager
      // ===== 创建并渲染初始 3×3 chunks =====
      this.chunkManager.initInitialGrid()

      // Setup
      this.player = new Player()

      // Setup Camera Rig
      this.cameraRig = new CameraRig()
      this.cameraRig.attachPlayer(this.player)
      this.experience.camera.attachRig(this.cameraRig)

      this.environment = new Environment()

      // ===== 射线拾取 + 选中辅助 =====
      // 注意：此模块仅用于“指向提示/后续交互”，不会直接改动地形数据
      this.blockRaycaster = new BlockRaycaster({
        chunkManager: this.chunkManager,
        maxDistance: INTERACTION_CONFIG.raycast.maxDistance,
        useMouse: false, // 默认屏幕中心（PointerLock/FPS 交互）
      })
      this.blockSelectionHelper = new BlockSelectionHelper({
        enabled: true,
      })

      // Block mining controller (handles progressive mining with VFX)
      this.blockMiningController = new BlockMiningController({
        enabled: true,
        miningDuration: INTERACTION_CONFIG.mining.duration,
      })

      // Block mining overlay (displays crack texture on target block)
      this.blockMiningOverlay = new BlockMiningOverlay()

      // ===== 交互管理器 (Build/Destroy Mode) =====
      this.blockInteractionManager = new BlockInteractionManager({
        chunkManager: this.chunkManager,
        blockRaycaster: this.blockRaycaster,
        blockMiningController: this.blockMiningController,
      })

      // ===== 方块破碎粒子效果 =====
      this.blockBreakParticles = new BlockBreakParticles()

      // ===== Settings Listeners =====
      emitter.on('settings:chunks-changed', (data) => {
        if (!this.chunkManager)
          return

        if (data.viewDistance !== undefined) {
          this.chunkManager.viewDistance = data.viewDistance
        }
        if (data.unloadPadding !== undefined) {
          this.chunkManager.unloadPadding = data.unloadPadding
        }

        // Trigger a streaming update to apply new distance rules immediately
        if (this.player) {
          const pos = this.player.getPosition()
          this.chunkManager.updateStreaming({ x: pos.x, z: pos.z }, true)
        }
      })
    })
  }

  update() {
    // Step2：先做 chunk streaming，确保玩家碰撞查询能尽量命中已加载 chunk
    if (this.chunkManager && this.player) {
      const pos = this.player.getPosition()
      this.chunkManager.updateStreaming({ x: pos.x, z: pos.z })
      this.chunkManager.pumpIdleQueue()
    }

    // 更新动画材质（树叶摇摆等）
    if (this.chunkManager)
      this.chunkManager.update()

    // Update mining controller
    if (this.blockMiningController)
      this.blockMiningController.update()

    if (this.player)
      this.player.update()
    if (this.floor)
      this.floor.update()
    if (this.environment)
      this.environment.update()

    // 每帧射线检测：用于 hover 提示与后续交互
    if (this.blockRaycaster)
      this.blockRaycaster.update()

    // 更新辅助框位置
    if (this.blockSelectionHelper)
      this.blockSelectionHelper.update()

    // 更新粒子系统
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
