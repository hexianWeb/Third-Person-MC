import * as THREE from 'three'
import { useHudStore } from '../../../pinia/hudStore.js'
import { useSkinStore } from '../../../pinia/skinStore.js'
import { CAMERA_RIG_CONFIG } from '../../camera/camera-rig-config.js'
import { PLAYER_CONFIG } from '../../config/player-config.js'
import { SHADOW_QUALITY } from '../../config/shadow-config.js'
import {
  CANONICAL_MODEL_RESOURCE,
  CUSTOM_SKIN_ID,
  DEFAULT_SKIN_ID,
  SKIN_LIST,
} from '../../config/skin-config.js'
import Experience from '../../experience.js'
import { calculateKnockbackDir, createAttackBoxHelper, isInAttackBox, updateAttackBoxHelper } from '../../utils/combat-utils.js'
import emitter from '../../utils/event/event-bus.js'
import {
  AnimationCategories,
  AnimationClips,
  AnimationStates,
  timeScaleConfig,
} from './animation-config.js'
import { resolveDirectionInput } from './input-resolver.js'
import { PlayerAnimationController } from './player-animation-controller.js'
import { PlayerMovementController } from './player-movement-controller.js'
import {
  applySkinTextureToLayers,
  bindCharacterBodyLayers,
  configureSkinTexture,
  createTextureFromBlob,
  disposeOwnedSkinTexture,
} from './skin-texture-utils.js'

export default class Player {
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources
    this.time = this.experience.time
    this.debug = this.experience.debug
    this.renderer = this.experience.renderer // 用于控制速度线效果

    // Config
    // 深拷贝配置，避免调试修改污染默认值
    this.config = JSON.parse(JSON.stringify(PLAYER_CONFIG))
    this.targetFacingAngle = this.config.facingAngle // 目标朝向，用于平滑插值

    // FPS Calculation
    this._fontFrames = 0
    this._lastTime = performance.now()
    this._currentFps = 60

    // 速度线当前透明度
    this._speedLineOpacity = 0

    // HUD 更新阈值控制：位置/朝向变化超过阈值才触发 emit
    this._lastEmitPosition = new THREE.Vector3() // 上次 emit 时的位置
    this._lastEmitFacingAngle = 0 // 上次 emit 时的朝向角度
    this._positionThreshold = 1 // 位置变化阈值：移动超过 1 单位才更新
    this._angleThreshold = Math.PI / 60 // 角度变化阈值：转动超过 1° (π/180 弧度) 才更新

    // Input state
    this.inputState = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      shift: false,
      v: false,
      space: false,
    }

    // 攻击左右手交替状态（toggle）
    this._useLeftStraight = true // 直拳：true=左手, false=右手
    this._useLeftHook = true // 勾拳：true=左手, false=右手
    // 挖掘状态
    this.isMining = false
    // 望远镜状态
    this.isTelescopeActive = false

    // Attack cooldown system
    this.attackCooldown = 0
    this.ATTACK_COOLDOWN = 0.5 // 500ms cooldown

    // Attack config (width x depth for box detection)
    this.attackConfig = {
      width: 3.0, // lateral sweep range
      depth: 1.5, // forward extension
      damage: 5,
    }
    this.showAttackBox = false // debug visualization toggle

    // Invulnerability system
    this.isInvulnerable = false
    this.invulnerabilityDuration = 1.0 // 1 second
    this.invulnerabilityTimer = 0

    // 统一使用 canonical 模型，运行时只替换纹理
    this.resource = this.resources.items[CANONICAL_MODEL_RESOURCE]
    this._skinRequestId = 0
    this._activeSkinTexture = null
    this._bodyLayers = null

    // Controllers
    this.movement = new PlayerMovementController(this.config)

    this.setModel()
    this._bodyLayers = bindCharacterBodyLayers(this.model)
    // 首帧隐藏，避免自定义皮肤装备时闪现 GLB 内嵌贴图
    this.model.visible = false

    // Animation Controller needs model
    this.animation = new PlayerAnimationController(this.model, this.resource.animations)

    this.setupInputListeners()

    // 监听皮肤变更事件（保留绑定引用以便 destroy 时 off）
    this._handleSkinChange = this._handleSkinChange.bind(this)
    emitter.on('skin:changed', this._handleSkinChange)

    // Shadow quality event listener
    this._handleShadowQuality = this._handleShadowQuality.bind(this)
    emitter.on('shadow:quality-changed', this._handleShadowQuality)

    // 应用 store 中的初始皮肤
    const skinStore = useSkinStore()
    void this._applySkinById(skinStore.currentSkinId, { isInitial: true })

    // Debug
    if (this.debug.active) {
      this.debugFolder = this.debug.ui.addFolder({
        title: 'Player',
        expanded: false,
      })
      this.debugInit()
    }
  }

  /**
   * Handle shadow quality change event
   * @param {{ quality: string }} payload - Shadow quality payload
   */
  _handleShadowQuality(payload) {
    const shouldCastShadow = payload.quality !== SHADOW_QUALITY.LOW
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = shouldCastShadow
      }
    })
  }

  /**
   * 按 skinId 准备贴图（预设共享 Resources；自定义从 Blob 创建并拥有）
   * @param {string} skinId
   * @returns {Promise<{ texture: THREE.Texture, owned: boolean }>} 贴图与是否由 Player 拥有
   */
  async _prepareSkinTexture(skinId) {
    if (skinId === CUSTOM_SKIN_ID) {
      const skinStore = useSkinStore()
      const blob = skinStore.committedCustomSkin
      if (!blob)
        throw new Error('[Player] committedCustomSkin is missing for custom skin')

      const { texture } = await createTextureFromBlob(blob, THREE)
      return { texture, owned: true }
    }

    const skinConfig = SKIN_LIST.find(s => s.id === skinId)
    if (!skinConfig?.textureResourceName)
      throw new Error(`[Player] Unknown preset skin: ${skinId}`)

    const sharedTexture = this.resources.items[skinConfig.textureResourceName]
    if (!sharedTexture)
      throw new Error(`[Player] Missing texture resource: ${skinConfig.textureResourceName}`)

    const texture = configureSkinTexture(sharedTexture, { owned: false })
    return { texture, owned: false }
  }

  /**
   * 应用皮肤贴图；通过 _skinRequestId 丢弃过期异步结果
   * @param {string} skinId
   * @param {{ isInitial?: boolean }} [options]
   */
  async _applySkinById(skinId, { isInitial = false } = {}) {
    const requestId = ++this._skinRequestId
    try {
      const prepared = await this._prepareSkinTexture(skinId)

      // 请求已被更新的切换取代：丢弃本次拥有的贴图
      if (requestId !== this._skinRequestId) {
        disposeOwnedSkinTexture(prepared.owned ? prepared.texture : null)
        return
      }

      const previous = this._activeSkinTexture
      applySkinTextureToLayers(this._bodyLayers, prepared.texture)
      this._activeSkinTexture = prepared
      if (previous?.owned)
        disposeOwnedSkinTexture(previous.texture)

      this.model.visible = true
    }
    catch (error) {
      console.error('[Player] Failed to apply skin:', skinId, error)
      // 初始应用失败时回退默认预设一次，再显示模型
      if (isInitial && skinId !== DEFAULT_SKIN_ID) {
        await this._applySkinById(DEFAULT_SKIN_ID, { isInitial: true })
        return
      }
      if (isInitial)
        this.model.visible = true
    }
  }

  /**
   * 皮肤变更：仅换贴图，不重建模型 / 动画控制器
   * @param {{ skinId: string, revision: number }} payload
   */
  _handleSkinChange({ skinId }) {
    void this._applySkinById(skinId)
  }

  setModel() {
    this.model = this.resource.scene
    // 模型始終保持 rotation.y = Math.PI，確保動畫正常播放
    // 整體朝向通過父容器 movement.group 控制
    this.model.rotation.y = Math.PI
    this.model.updateMatrixWorld()
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        if (child.material) {
          child.material.side = THREE.FrontSide
          child.material.transparent = true

          // 设置自发光保证黑夜中可见度
          if (child.material.map) {
            child.material.emissiveMap = child.material.map
            child.material.emissive = new THREE.Color(0xFFFFFF)
          }
          else if (child.material.color) {
            child.material.emissive = child.material.color.clone()
          }
          child.material.emissiveIntensity = 0.3
        }
        // 启用 Layer 1，用于预览相机渲染
        child.layers.enable(1)
      }
    })

    this.model.children[0].children[0].traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.renderOrder = 1
      }
    })
    this.model.children[0].children[1].traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.renderOrder = 2
      }
    })
    // Add model to movement controller's group
    this.movement.group.add(this.model)
  }

  setOpacity(value) {
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material.opacity = value
      }
    })
  }

  /**
   * 获取角色位置(脚底点)
   * @returns {THREE.Vector3}
   */
  getPosition() {
    return this.movement.position.clone()
  }

  /**
   * 获取角色朝向角度
   * @returns {number}
   */
  getFacingAngle() {
    return this.config.facingAngle
  }

  /**
   * 获取角色速度
   * @returns {THREE.Vector3}
   */
  getVelocity() {
    return this.movement.worldVelocity.clone()
  }

  /**
   * 是否正在移动 (基于物理速度)
   * @returns {boolean}
   */
  isMoving() {
    const v = this.movement.worldVelocity
    // 速度大于 0.1 视为移动 (参考原 Camera 逻辑)
    return (v.x * v.x + v.z * v.z) > 0.01
  }

  /**
   * 設置角色朝向角度
   * @param {number} angle - 朝向角度（弧度），0 = +Z，Math.PI = -Z
   */
  setFacing(angle) {
    this.config.facingAngle = angle
    this.movement.setFacing(angle)
  }

  setupInputListeners() {
    emitter.on('input:update', (keys) => {
      this.inputState = keys
    })

    emitter.on('input:jump', () => {
      // 挖掘时阻断跳跃输入
      if (this.isMining) {
        return
      }
      if (this.movement.isGrounded && this.animation.stateMachine.currentState.name !== AnimationStates.COMBAT) {
        this.movement.jump()
        this.animation.triggerJump()
      }
    })

    // ==================== 攻击输入 ====================

    // 直拳（Z键）- 左右交替
    emitter.on('input:punch_straight', () => {
      if (this.attackCooldown > 0)
        return
      const anim = this._useLeftStraight
        ? AnimationClips.STRAIGHT_PUNCH // 左直拳
        : AnimationClips.RIGHT_STRAIGHT_PUNCH // 右直拳
      this._useLeftStraight = !this._useLeftStraight // 切换下次使用的手
      this.animation.triggerAttack(anim)
      this.handleAttack()
    })

    // 勾拳（X键）- 左右交替
    emitter.on('input:punch_hook', () => {
      if (this.attackCooldown > 0)
        return
      const anim = this._useLeftHook
        ? AnimationClips.HOOK_PUNCH // 左勾拳
        : AnimationClips.RIGHT_HOOK_PUNCH // 右勾拳
      this._useLeftHook = !this._useLeftHook // 切换下次使用的手
      this.animation.triggerAttack(anim)
      this.handleAttack()
    })

    // 格挡（C键）- 保持原逻辑
    emitter.on('input:block', (isBlocking) => {
      if (isBlocking) {
        this.animation.triggerAttack(AnimationClips.BLOCK)
      }
    })

    // ==================== 挖掘事件 ====================
    emitter.on('game:mining-start', () => {
      this.isMining = true
      this.animation.triggerAttack(AnimationClips.QUICK_COMBO)
    })

    emitter.on('game:mining-cancel', () => {
      this.isMining = false
      this.animation.stateMachine.setState(AnimationStates.LOCOMOTION)
    })

    emitter.on('game:mining-complete', () => {
      this.isMining = false
      this.animation.stateMachine.setState(AnimationStates.LOCOMOTION)
    })

    // ==================== 望远镜事件 ====================
    emitter.on('input:telescope', (isActive) => {
      this.isTelescopeActive = isActive
    })

    // ==================== 鼠标旋转（Pointer Lock 模式） ====================
    emitter.on('input:mouse_move', ({ movementX }) => {
      // 望远镜模式下的鼠标灵敏度缩放
      const sensitivityMultiplier = (this.isTelescopeActive && CAMERA_RIG_CONFIG.trackingShot.telescope?.enabled)
        ? CAMERA_RIG_CONFIG.trackingShot.telescope.sensitivityMultiplier
        : 1.0

      // 更新目标朝向，而非直接设置
      this.targetFacingAngle -= movementX * this.config.mouseSensitivity * sensitivityMultiplier
    })

    // ==================== 重生 ====================
    emitter.on('input:respawn', () => {
      this.respawn()
    })
  }

  /**
   * 触发角色重生
   */
  respawn() {
    this.movement.respawn()
  }

  /**
   * 瞬间移动角色到指定位置
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setPosition(x, y, z) {
    this.movement.setPosition(x, y, z)
  }

  /**
   * Take damage: flash red, knockback, invulnerability, death check
   * @param {number} amount - damage amount
   * @param {THREE.Vector3} knockbackDir - knockback direction
   */
  takeDamage(amount, knockbackDir) {
    if (this.isInvulnerable)
      return

    const hudStore = useHudStore()
    hudStore.takeDamage(amount)

    // Enable invulnerability
    this.isInvulnerable = true
    this.invulnerabilityTimer = this.invulnerabilityDuration

    // Flash red - clone materials
    this.model.traverse((child) => {
      if (child.isMesh && child.material) {
        if (!child.userData.isCloned) {
          child.userData.originalMaterial = child.material
          child.material = child.material.clone()
          child.userData.isCloned = true
        }
        if (!child.userData.flashOriginalColor) {
          child.userData.flashOriginalColor = child.material.color.clone()
        }
        child.material.color.setHex(0xFF5555)
      }
    })

    // Restore color after 200ms
    setTimeout(() => {
      if (!this.model)
        return
      this.model.traverse((child) => {
        if (child.isMesh && child.material && child.userData.flashOriginalColor) {
          child.material.color.copy(child.userData.flashOriginalColor)
        }
      })
    }, 200)

    // Knockback
    if (knockbackDir && this.movement) {
      this.movement.applyKnockback(knockbackDir, 6, 5)
    }

    // Death check
    if (hudStore.health <= 0) {
      this.die()
    }
  }

  /**
   * Handle player death: delayed respawn with full health restore
   */
  die() {
    setTimeout(() => {
      this.respawn()
      const hudStore = useHudStore()
      hudStore.setHealth(hudStore.maxHealth)
    }, 1000)
  }

  /**
   * Handle attack: check cooldown, detect hits, apply damage
   */
  handleAttack() {
    if (this.attackCooldown > 0)
      return

    const enemyManager = this.experience.world?.enemyManager
    if (!enemyManager)
      return

    this.attackCooldown = this.ATTACK_COOLDOWN

    const { width, depth, damage } = this.attackConfig
    const attackerPos = this.getPosition()

    // Player forward direction: model.rotation.y = PI corrects model to face group's -Z
    // Group -Z in world = (-sin(facingAngle), -cos(facingAngle))
    const angle = this.movement.facingAngle
    const forwardDir = { x: -Math.sin(angle), z: -Math.cos(angle) }

    enemyManager.activeEnemies.forEach((zombie) => {
      if (isInAttackBox(attackerPos, forwardDir, zombie.movement.position, width, depth)) {
        const knockbackDir = calculateKnockbackDir(attackerPos, zombie.movement.position)
        zombie.takeDamage(damage, knockbackDir)
      }
    })
  }

  update() {
    const isCombat = this.animation.stateMachine.currentState?.name === AnimationStates.COMBAT

    // Update attack cooldown
    if (this.attackCooldown > 0) {
      const dt = this.time.delta * 0.001
      this.attackCooldown = Math.max(0, this.attackCooldown - dt)
    }

    // Update invulnerability timer
    if (this.isInvulnerable && this.invulnerabilityTimer > 0) {
      const dt = this.time.delta * 0.001
      this.invulnerabilityTimer -= dt
      if (this.invulnerabilityTimer <= 0) {
        this.isInvulnerable = false
      }
    }

    // Debug attack box visualization
    if (this.showAttackBox) {
      if (!this._attackBoxHelper) {
        this._attackBoxHelper = createAttackBoxHelper(0xFF0000)
        this.scene.add(this._attackBoxHelper)
      }
      this._attackBoxHelper.visible = true
      const angle = this.movement.facingAngle
      const fwd = { x: -Math.sin(angle), z: -Math.cos(angle) }
      updateAttackBoxHelper(this._attackBoxHelper, this.movement.position, fwd, this.attackConfig.width, this.attackConfig.depth)
    }
    else if (this._attackBoxHelper) {
      this._attackBoxHelper.visible = false
    }

    // Resolve Input (Conflict & Normalize)
    const { resolvedInput, weights } = resolveDirectionInput(this.inputState)

    // 挖掘时强制清空方向输入与水平速度，确保立即停下
    const effectiveInput = this.isMining
      ? {
          forward: false,
          backward: false,
          left: false,
          right: false,
          shift: false,
          v: false,
          space: false,
        }
      : resolvedInput

    if (this.isMining) {
      this.movement.worldVelocity.x = 0
      this.movement.worldVelocity.z = 0
    }

    // Update Movement
    this.movement.update(effectiveInput, isCombat)

    // ===== 平滑转向 =====
    if (Math.abs(this.config.facingAngle - this.targetFacingAngle) > 0.0001) {
      // 角度 lerp 平滑
      let angle = this.config.facingAngle
      // 简单的 lerp
      angle += (this.targetFacingAngle - angle) * this.config.turnSmoothing

      this.setFacing(angle)
    }

    // Prepare state for animation
    const playerState = {
      inputState: effectiveInput,
      directionWeights: this.isMining ? { forward: 0, backward: 0, left: 0, right: 0 } : weights, // Pass normalized weights
      isMoving: this.isMining ? false : this.movement.isMoving(effectiveInput),
      isGrounded: this.movement.isGrounded,
      speedProfile: this.movement.getSpeedProfile(effectiveInput),
      isMining: this.isMining,
    }

    // Update Animation
    this.animation.update(this.time.delta, playerState)

    // ==================== 速度线控制 ====================
    this.updateSpeedLines(effectiveInput)

    // ==================== HUD 更新 ====================

    // Calculate FPS
    this._fontFrames++
    const now = performance.now()
    if (now >= this._lastTime + 1000) {
      this._currentFps = Math.round((this._fontFrames * 1000) / (now - this._lastTime))
      this._fontFrames = 0
      this._lastTime = now
    }

    // 获取当前位置和朝向
    const currentPosition = this.getPosition()
    const currentFacingAngle = this.getFacingAngle()

    // 计算位置变化距离
    const positionDiff = currentPosition.distanceTo(this._lastEmitPosition)

    // 计算角度变化（归一化到 [0, π] 范围）
    let angleDiff = Math.abs(currentFacingAngle - this._lastEmitFacingAngle)
    angleDiff = Math.min(angleDiff, 2 * Math.PI - angleDiff) // 处理角度环绕

    // 判断是否需要更新：位置或角度变化超过阈值
    const shouldEmit = positionDiff >= this._positionThreshold || angleDiff >= this._angleThreshold

    if (shouldEmit) {
      emitter.emit('hud:update', {
        position: currentPosition.clone(),
        facingAngle: currentFacingAngle,
        fps: this._currentFps,
      })
      // 记录本次 emit 的状态
      this._lastEmitPosition.copy(currentPosition)
      this._lastEmitFacingAngle = currentFacingAngle
    }
  }

  /**
   * 更新速度线效果
   * 当玩家按住 Shift + 方向键冲刺时，显示速度线
   * @param {object} inputState - 输入状态
   */
  updateSpeedLines(inputState) {
    // 检查是否处于冲刺状态：shift + 任意方向键
    const isMoving = inputState.forward || inputState.backward || inputState.left || inputState.right
    const isSprinting = inputState.shift && isMoving

    // 计算时间增量（秒）
    const deltaTime = this.time.delta * 0.001

    // 平滑过渡透明度
    if (isSprinting) {
      // 淡入：向目标透明度靠近
      this._speedLineOpacity += (this.config.speedLines.targetOpacity - this._speedLineOpacity)
        * this.config.speedLines.fadeInSpeed * deltaTime
    }
    else {
      // 淡出：向 0 靠近
      this._speedLineOpacity -= this._speedLineOpacity
        * this.config.speedLines.fadeOutSpeed * deltaTime
    }

    // 限制范围 [0, 1]
    this._speedLineOpacity = Math.max(0, Math.min(1, this._speedLineOpacity))

    // 更新渲染器中的速度线透明度
    this.renderer.setSpeedLineOpacity(this._speedLineOpacity)
  }

  debugInit() {
    // ===== 朝向控制 =====
    this.debugFolder.addBinding(this.config, 'facingAngle', {
      label: '朝向角度',
      min: -Math.PI,
      max: Math.PI,
      step: 0.01,
    }).on('change', () => {
      this.setFacing(this.config.facingAngle)
    })

    // ===== 鼠标灵敏度控制 =====
    this.debugFolder.addBinding(this.config, 'mouseSensitivity', {
      label: '鼠标灵敏度',
      min: 0.0001,
      max: 0.01,
      step: 0.0001,
    })

    this.debugFolder.addBinding(this.config, 'turnSmoothing', {
      label: '转向平滑度',
      min: 0.01,
      max: 1.0,
      step: 0.01,
    })

    // ===== HUD 更新阈值控制 =====
    const hudThresholdFolder = this.debugFolder.addFolder({
      title: 'HUD 更新阈值',
      expanded: false,
    })

    hudThresholdFolder.addBinding(this, '_positionThreshold', {
      label: '位置阈值',
      min: 0.01,
      max: 2.0,
      step: 0.01,
    })

    hudThresholdFolder.addBinding(this, '_angleThreshold', {
      label: '角度阈值(弧度)',
      min: 0.001,
      max: Math.PI / 4,
      step: 0.001,
    })

    // ===== 速度控制 =====
    this.debugFolder.addBinding(this.config.speed, 'crouch', { label: 'Crouch Speed', min: 0.1, max: 5 })
    this.debugFolder.addBinding(this.config.speed, 'walk', { label: 'Walk Speed', min: 1, max: 10 })
    this.debugFolder.addBinding(this.config.speed, 'run', { label: 'Run Speed', min: 1, max: 20 })
    this.debugFolder.addBinding(this.config, 'jumpForce', { label: 'Jump Force', min: 1, max: 20 })

    // Add Animation State Debug
    const debugState = { state: '' }
    this.debugFolder.addBinding(debugState, 'state', {
      readonly: true,
      label: 'Current State',
      multiline: true,
    })

    emitter.on('core:tick', () => {
      if (this.animation.stateMachine.currentState) {
        debugState.state = this.animation.stateMachine.currentState.name
      }
    })

    // ===== Animation Speed Control =====
    const animSpeedFolder = this.debugFolder.addFolder({
      title: 'Animation Speed',
      expanded: false,
    })

    // Helper to update time scales
    const updateTimeScales = () => {
      this.animation.updateTimeScales()
    }

    // 1. Global Speed
    animSpeedFolder.addBinding(timeScaleConfig, 'global', {
      label: 'Global Rate',
      min: 0.1,
      max: 3.0,
      step: 0.1,
    }).on('change', updateTimeScales)

    // 2. Categories
    const categoriesFolder = animSpeedFolder.addFolder({ title: 'Categories', expanded: true })

    categoriesFolder.addBinding(timeScaleConfig.categories, AnimationCategories.LOCOMOTION, {
      label: 'Locomotion',
      min: 0.1,
      max: 3.0,
      step: 0.1,
    }).on('change', updateTimeScales)

    categoriesFolder.addBinding(timeScaleConfig.categories, AnimationCategories.COMBAT, {
      label: 'Combat',
      min: 0.1,
      max: 3.0,
      step: 0.1,
    }).on('change', updateTimeScales)

    categoriesFolder.addBinding(timeScaleConfig.categories, AnimationCategories.ACTION, {
      label: 'Action',
      min: 0.1,
      max: 3.0,
      step: 0.1,
    }).on('change', updateTimeScales)

    // 3. SubGroups
    const subGroupsFolder = animSpeedFolder.addFolder({ title: 'Sub Groups', expanded: false })

    // Locomotion Subgroups
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'walk', { label: 'Walk', min: 0.1, max: 3.0 }).on('change', updateTimeScales)
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'run', { label: 'Run', min: 0.1, max: 3.0 }).on('change', updateTimeScales)
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'sneak', { label: 'Sneak', min: 0.1, max: 3.0 }).on('change', updateTimeScales)
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'idle', { label: 'Idle', min: 0.1, max: 3.0 }).on('change', updateTimeScales)

    // Combat Subgroups
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'punch', { label: 'Punch', min: 0.1, max: 3.0 }).on('change', updateTimeScales)
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'block', { label: 'Block', min: 0.1, max: 3.0 }).on('change', updateTimeScales)

    // Action Subgroups
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'jump', { label: 'Jump', min: 0.1, max: 3.0 }).on('change', updateTimeScales)
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'fall', { label: 'Fall', min: 0.1, max: 3.0 }).on('change', updateTimeScales)
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'standup', { label: 'Standup', min: 0.1, max: 3.0 }).on('change', updateTimeScales)

    // ===== 碰撞调试 =====
    if (this.movement?.collision) {
      const collisionFolder = this.debugFolder.addFolder({
        title: '碰撞调试',
        expanded: false,
      })

      collisionFolder.addBinding(this.movement.collision.params, 'showCandidates', {
        label: '候选高亮',
      })
      collisionFolder.addBinding(this.movement.collision.params, 'showContacts', {
        label: '接触点',
      })
      collisionFolder.addBinding(this.movement.collision.stats, 'candidateCount', {
        label: '候选数量',
        readonly: true,
      })
      collisionFolder.addBinding(this.movement.collision.stats, 'collisionCount', {
        label: '碰撞数量',
        readonly: true,
      })
    }

    // ===== 战斗调试 =====
    const combatFolder = this.debugFolder.addFolder({
      title: '战斗系统',
      expanded: false,
    })

    combatFolder.addBinding(this.attackConfig, 'width', {
      label: '攻击宽度',
      min: 0.5,
      max: 6.0,
      step: 0.1,
    })

    combatFolder.addBinding(this.attackConfig, 'depth', {
      label: '攻击深度',
      min: 0.5,
      max: 5.0,
      step: 0.1,
    })

    combatFolder.addBinding(this.attackConfig, 'damage', {
      label: '攻击伤害',
      min: 1,
      max: 20,
      step: 1,
    })

    combatFolder.addBinding(this, 'showAttackBox', {
      label: '显示攻击范围',
    })

    combatFolder.addBinding(this, 'attackCooldown', {
      label: '当前冷却',
      readonly: true,
    })

    combatFolder.addBinding(this, 'isInvulnerable', {
      label: '无敌状态',
      readonly: true,
    })

    // Test button
    const testParams = { damage: 2 }
    combatFolder.addBinding(testParams, 'damage', {
      label: '测试伤害值',
      min: 1,
      max: 10,
      step: 1,
    })
    combatFolder.addButton({
      title: '对自己造成伤害',
    }).on('click', () => {
      this.takeDamage(testParams.damage, new THREE.Vector3(1, 0, 0))
    })

    // ===== 重生设置 =====
    const respawnFolder = this.debugFolder.addFolder({
      title: '重生设置',
      expanded: false,
    })
    respawnFolder.addBinding(this.config.respawn, 'thresholdY', {
      label: '阈值Y',
      min: -100,
      max: 100,
      step: 1,
    })
    respawnFolder.addBinding(this.config.respawn.position, 'x', { label: '重生X', min: -200, max: 200, step: 1 })
    respawnFolder.addBinding(this.config.respawn.position, 'y', { label: '重生Y', min: -200, max: 200, step: 1 })
    respawnFolder.addBinding(this.config.respawn.position, 'z', { label: '重生Z', min: -200, max: 200, step: 1 })
  }

  destroy() {
    emitter.off('skin:changed', this._handleSkinChange)
    if (this._activeSkinTexture?.owned)
      disposeOwnedSkinTexture(this._activeSkinTexture.texture)
    this._activeSkinTexture = null
  }
}
