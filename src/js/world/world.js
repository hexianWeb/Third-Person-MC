import * as THREE from 'three'
import CameraRig from '../camera/camera-rig.js'
import {
  CHUNK_BASIC_CONFIG,
  TERRAIN_PARAMS,
} from '../config/chunk-config.js'
import Experience from '../experience.js'
import BlockRaycaster from '../interaction/block-raycaster.js'
import BlockSelectionHelper from '../interaction/block-selection-helper.js'
import emitter from '../utils/event-bus.js'
import Environment from './environment.js'
import Player from './player/player.js'
import { blocks } from './terrain/blocks-config.js'
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
        maxDistance: 10,
        useMouse: false, // 默认屏幕中心（PointerLock/FPS 交互）
      })
      this.blockSelectionHelper = new BlockSelectionHelper({
        enabled: true,
      })

      // 默认编辑模式
      this.blockEditMode = 'remove'

      // 监听模式切换
      emitter.on('input:toggle_block_edit_mode', () => {
        this.blockEditMode = this.blockEditMode === 'remove' ? 'add' : 'remove'
        // console.log('Edit Mode:', this.blockEditMode)
        emitter.emit('game:block_edit_mode_changed', { mode: this.blockEditMode })
      })

      // ===== 交互事件绑定：删除/新增方块 =====
      emitter.on('input:mouse_down', (event) => {
        // 0 为左键
        if (event.button === 0 && this.blockRaycaster?.current) {
          const { worldBlock, face } = this.blockRaycaster.current

          if (this.blockEditMode === 'remove') {
            this.chunkManager.removeBlockWorld(worldBlock.x, worldBlock.y, worldBlock.z)
          }
          else if (this.blockEditMode === 'add') {
            // 根据法线计算相邻格子
            if (face && face.normal) {
              const nx = Math.round(face.normal.x)
              const ny = Math.round(face.normal.y)
              const nz = Math.round(face.normal.z)

              const targetX = worldBlock.x + nx
              const targetY = worldBlock.y + ny
              const targetZ = worldBlock.z + nz

              // 默认放置草方块
              this.chunkManager.addBlockWorld(targetX, targetY, targetZ, blocks.stone.id)
            }
          }
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
