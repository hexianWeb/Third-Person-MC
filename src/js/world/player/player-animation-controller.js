import * as THREE from 'three'
import Experience from '../../experience.js'
import {
  AnimationCategories,
  AnimationClips,
  animationSettings,
  AnimationStates,
  animationSubGroupMap,
  BLEND_DIRECTIONS,
  LocomotionProfiles,
  timeScaleConfig,
  transitionDurations,
} from './animation-config.js'
import { PlayerAnimationStateMachine } from './animation-state-machine.js'

export class PlayerAnimationController {
  constructor(model, animations) {
    this.experience = new Experience()
    this.time = this.experience.time
    this.model = model
    this.mixer = new THREE.AnimationMixer(model)
    this.actions = {}
    this.currentAction = null

    // Init Actions
    this.initActions(animations)

    // State Machine
    this.stateMachine = new PlayerAnimationStateMachine(this)
    // Start in Intro
    this.stateMachine.setState(AnimationStates.INTRO)
  }

  initActions(animations) {
    if (!animations || animations.length === 0)
      return

    animations.forEach((clip) => {
      const action = this.mixer.clipAction(clip)
      this.actions[clip.name] = action

      const settings = animationSettings[clip.name]
      if (settings) {
        action.setLoop(settings.loop)
        if (settings.loop === THREE.LoopOnce) {
          action.clampWhenFinished = true
        }
        // TimeScale will be managed dynamically, but set base here
        action.timeScale = this.getEffectiveTimeScale(clip.name)
      }
    })

    // Pre-activate locomotion actions with 0 weight for blending
    const blendAnims = [
      AnimationClips.IDLE,
      AnimationClips.WALK_FORWARD,
      AnimationClips.WALK_BACK,
      AnimationClips.WALK_LEFT,
      AnimationClips.WALK_RIGHT,
      AnimationClips.RUN_FORWARD,
      AnimationClips.RUN_BACK,
      AnimationClips.RUN_LEFT,
      AnimationClips.RUN_RIGHT,
      AnimationClips.SNEAK_FORWARD,
      AnimationClips.SNEAK_BACK,
      AnimationClips.SNEAK_LEFT,
      AnimationClips.SNEAK_RIGHT,
    ]

    blendAnims.forEach((name) => {
      const action = this.actions[name]
      if (action) {
        action.enabled = true
        action.setEffectiveWeight(0)
        action.play()
      }
    })
  }

  /**
   * Calculate the effective time scale based on hierarchical config
   * Formula: Base * Global * Category * SubGroup
   */
  getEffectiveTimeScale(clipName) {
    const settings = animationSettings[clipName]
    if (!settings)
      return 1.0

    const baseScale = settings.timeScale || 1.0
    const globalScale = timeScaleConfig.global || 1.0

    const category = settings.category
    const categoryScale = timeScaleConfig.categories[category] || 1.0

    const subGroup = animationSubGroupMap[clipName]
    const subGroupScale = subGroup ? (timeScaleConfig.subGroups[subGroup] || 1.0) : 1.0

    return baseScale * globalScale * categoryScale * subGroupScale
  }

  /**
   * Update time scales for all active actions
   * Should be called whenever debug config changes
   */
  updateTimeScales() {
    for (const [name, action] of Object.entries(this.actions)) {
      if (action) {
        action.setEffectiveTimeScale(this.getEffectiveTimeScale(name))
      }
    }
  }

  update(dt, playerState) {
    this.mixer.update(dt * 0.001)

    // In debug mode, we might want to continuously update timescales if we expect them to change per frame
    // But for performance, we usually rely on the debug panel callback to trigger updateTimeScales()
    // However, to be safe and simple for this implementation, we can call it if debug is active
    // or just let the debug panel callbacks handle it.
    // Let's assume debug panel callbacks will handle it for efficiency.

    // Update State Machine
    this.stateMachine.update(dt, {
      ...playerState,
      currentActionName: this.currentAction ? this.currentAction.getClip().name : null,
    })
  }

  /**
   * 播放指定動作 (處理 CrossFade)
   */
  playAction(name, forcedDuration = null) {
    const newAction = this.actions[name]
    if (!newAction)
      return

    const oldAction = this.currentAction

    // 如果是同一個動作且正在播放，則不重置（除非是 LoopOnce 已結束）
    if (newAction === oldAction && newAction.isRunning()) {
      return
    }

    // 計算過渡時間
    let duration = transitionDurations.default
    if (forcedDuration !== null) {
      duration = forcedDuration
    }
    else if (oldAction) {
      const oldName = oldAction.getClip().name
      const newName = newAction.getClip().name
      const oldCat = animationSettings[oldName]?.category
      const newCat = animationSettings[newName]?.category
      const key = `${oldCat}:${newCat}`
      if (transitionDurations[key] !== undefined) {
        duration = transitionDurations[key]
      }
    }

    // 如果是非 Locomotion 动画，淡出 blend tree
    const settings = animationSettings[name]
    if (settings && settings.category !== AnimationCategories.LOCOMOTION) {
      this.fadeOutLocomotion(duration)
    }

    // 設置新動作
    newAction.reset()
    // Ensure we use the latest calculated time scale
    newAction.setEffectiveTimeScale(this.getEffectiveTimeScale(name))
    newAction.setEffectiveWeight(1)
    newAction.play()

    // CrossFade
    if (oldAction) {
      oldAction.crossFadeTo(newAction, duration, true)
    }
    // 如果沒有舊動作，則直接 fadeIn
    else {
      newAction.fadeIn(duration)
    }

    this.currentAction = newAction
  }

  /**
   * 淡出所有 Locomotion Blend Tree 动画
   * 用于进入 Combat/Airborne 等非 Locomotion 状态时
   */
  fadeOutLocomotion(duration = 0.1) {
    const blendAnims = [
      AnimationClips.IDLE,
      AnimationClips.WALK_FORWARD,
      AnimationClips.WALK_BACK,
      AnimationClips.WALK_LEFT,
      AnimationClips.WALK_RIGHT,
      AnimationClips.RUN_FORWARD,
      AnimationClips.RUN_BACK,
      AnimationClips.RUN_LEFT,
      AnimationClips.RUN_RIGHT,
      AnimationClips.SNEAK_FORWARD,
      AnimationClips.SNEAK_BACK,
      AnimationClips.SNEAK_LEFT,
      AnimationClips.SNEAK_RIGHT,
    ]

    blendAnims.forEach((name) => {
      const action = this.actions[name]
      if (action && action.getEffectiveWeight() > 0) {
        action.fadeOut(duration)
      }
    })
  }

  /**
   * 從 Combat/Airborne 平滑過渡回 Locomotion Blend Tree
   */
  fadeToLocomotion() {
    // Locomotion 狀態下，我們不播放單一 Action，而是依賴 updateLocomotion 計算權重
    // 但為了平滑過渡，我們將 currentAction fadeOut，同時 updateLocomotion 會負責 fadeIn 對應的 blend 權重
    // 這裡其實有一個技巧：我們把 currentAction 設為 null，讓 updateLocomotion 接管權重管理
    // 但為了不突兀，我们需要手动 fadeOut 旧的 action

    if (this.currentAction) {
      this.currentAction.fadeOut(0.2)
      this.currentAction = null
    }

    // 重新激活所有 locomotion 动画（因为 fadeOutLocomotion 会禁用它们）
    this.reactivateLocomotion()
  }

  /**
   * 重新激活所有 Locomotion Blend Tree 动画
   * 在从 Combat/Airborne 返回 Locomotion 时调用
   */
  reactivateLocomotion() {
    const blendAnims = [
      AnimationClips.IDLE,
      AnimationClips.WALK_FORWARD,
      AnimationClips.WALK_BACK,
      AnimationClips.WALK_LEFT,
      AnimationClips.WALK_RIGHT,
      AnimationClips.RUN_FORWARD,
      AnimationClips.RUN_BACK,
      AnimationClips.RUN_LEFT,
      AnimationClips.RUN_RIGHT,
      AnimationClips.SNEAK_FORWARD,
      AnimationClips.SNEAK_BACK,
      AnimationClips.SNEAK_LEFT,
      AnimationClips.SNEAK_RIGHT,
    ]

    blendAnims.forEach((name) => {
      const action = this.actions[name]
      if (action) {
        // 重新启用动画并播放（权重从 0 开始，由 updateLocomotion 控制）
        action.enabled = true
        action.setEffectiveWeight(0)
        if (!action.isRunning()) {
          action.play()
        }
      }
    })
  }

  /**
   * 更新移動混合樹 (Blend Tree Logic)
   * 這是核心邏輯：統一 Walk/Run/Crouch，只依賴 LocomotionProfile
   *
   * @param {number} dt Delta time
   * @param {object} inputState Boolean state of keys
   * @param {boolean} isMoving Whether player is moving
   * @param {object} profile Current speed profile (Walk/Run/Crouch)
   * @param {object} directionWeights Normalized weights from InputResolver { forward: 0.5, ... }
   */
  updateLocomotion(dt, inputState, isMoving, profile, directionWeights = {}) {
    const transitionSpeed = 0.1

    // 1. Idle Weight
    // 核心邏輯：不移動時顯示 idle，移動時 idle 權重歸零
    // 無論當前是 WALK/RUN/CROUCH profile，靜止時都應該顯示 idle
    const targetIdleWeight = isMoving ? 0 : 1

    const idleAction = this.actions[AnimationClips.IDLE]
    if (idleAction) {
      // Ensure idle speed is updated
      idleAction.setEffectiveTimeScale(this.getEffectiveTimeScale(AnimationClips.IDLE))

      const currentWeight = idleAction.getEffectiveWeight()
      idleAction.setEffectiveWeight(THREE.MathUtils.lerp(currentWeight, targetIdleWeight, transitionSpeed))
    }

    // 2. Directional Weights
    // 這裡最關鍵：根據 profile.nodeMap 映射 input 到具體動畫 (Run vs Walk)
    // 同時確保非當前 profile 的動畫權重歸零

    // 遍歷所有方向
    BLEND_DIRECTIONS.forEach((dir) => {
      // 當前 Profile 對應的動畫名稱
      const targetClipName = profile.nodeMap[dir];

      // 遍歷所有可能的 clip (Walk, Run, Sneak) 以便正確設置權重
      // 我們需要知道這個方向對應的 Walk, Run, Sneak 分別是什麼
      [
        LocomotionProfiles.WALK.nodeMap[dir],
        LocomotionProfiles.RUN.nodeMap[dir],
        LocomotionProfiles.CROUCH.nodeMap[dir],
      ].forEach((clipName) => {
        const action = this.actions[clipName]
        if (!action)
          return

        // Ensure active locomotion actions have updated speed
        // Optimization: only update if weight > 0 or about to be > 0
        // But simple approach is just update always or rely on global update
        if (action.getEffectiveWeight() > 0 || (isMoving && clipName === targetClipName)) {
          action.setEffectiveTimeScale(this.getEffectiveTimeScale(clipName))
        }

        // 判斷是否為目標動畫
        const isTarget = (clipName === targetClipName)

        // 目標權重：必須是 (移動中) && (是當前 Profile 的動畫) -> 使用歸一化權重
        // 如果 directionWeights[dir] 存在則使用，否則為 0
        const weight = directionWeights[dir] || 0
        const targetWeight = (isMoving && isTarget) ? weight : 0.0

        const currentWeight = action.getEffectiveWeight()
        if (Math.abs(currentWeight - targetWeight) > 0.01) {
          action.setEffectiveWeight(THREE.MathUtils.lerp(currentWeight, targetWeight, transitionSpeed))
        }
        else {
          action.setEffectiveWeight(targetWeight)
        }
      })
    })
  }

  isActionPlaying(name) {
    const action = this.actions[name]
    return action && action.isRunning() && action.getEffectiveWeight() > 0
  }

  // 外部觸發事件
  triggerJump() {
    if (this.stateMachine.currentState.name !== AnimationStates.COMBAT) {
      this.stateMachine.setState(AnimationStates.AIRBORNE)
      this.playAction(AnimationClips.JUMP)
    }
  }

  triggerAttack(name) {
    // 允許 Combat -> Combat (Combo)
    this.stateMachine.setState(AnimationStates.COMBAT, { actionName: name })
  }
}
