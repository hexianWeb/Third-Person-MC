import * as THREE from 'three'
import Experience from '../../experience.js'
import {
  AnimationClips,
  animationSettings,
  AnimationStates,
  BLEND_DIRECTIONS,
  LocomotionProfiles,
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
    // Start in Locomotion
    this.stateMachine.setState(AnimationStates.LOCOMOTION)
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
        action.timeScale = settings.timeScale
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

  update(dt, playerState) {
    this.mixer.update(dt * 0.001)

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

    // 設置新動作
    newAction.reset()
    newAction.setEffectiveTimeScale(animationSettings[name]?.timeScale || 1)
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
  }

  /**
   * 更新移動混合樹 (Blend Tree Logic)
   * 這是核心邏輯：統一 Walk/Run/Crouch，只依賴 LocomotionProfile
   */
  updateLocomotion(dt, inputState, isMoving, profile) {
    const transitionSpeed = 0.1

    // 1. Idle Weight
    // 如果當前有其他 One-shot action 正在播放且權重很高（例如攻擊未結束），這裡的權重計算應該暫停或被覆蓋？
    // 由於 StateMachine 只有在 LOCOMOTION 狀態才呼叫此方法，所以這裡假設是純移動狀態

    // 計算目標 Idle 權重
    let targetIdleWeight = profile.idleWeight // Walk=1, Run=0, Crouch=0
    if (isMoving) {
      targetIdleWeight = 0 // 移動時 idle 權重歸零
    }
    // 特例：Crouch 下不移動時也是 idle 嗎？Crouch Idle?
    // 根據舊代碼：Crouch 時 targetIdleWeight = 0 (即使不移動?)
    // 舊代碼：if (isMoving && isCrouching) targetIdleWeight = 0
    // 實際上 Crouch Idle 應該有獨立動畫，目前沒有，所以 Crouch 靜止時可能會顯示 weird
    // 暫時沿用 profile 設定

    const idleAction = this.actions[AnimationClips.IDLE]
    if (idleAction) {
      const currentWeight = idleAction.getEffectiveWeight()
      idleAction.setEffectiveWeight(THREE.MathUtils.lerp(currentWeight, targetIdleWeight, transitionSpeed))
    }

    // 2. Directional Weights
    // 這裡最關鍵：根據 profile.nodeMap 映射 input 到具體動畫 (Run vs Walk)
    // 同時確保非當前 profile 的動畫權重歸零

    // 遍歷所有方向
    BLEND_DIRECTIONS.forEach((dir) => {
      const isActiveDir = inputState[dir] // true/false

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

        // 判斷是否為目標動畫
        const isTarget = (clipName === targetClipName)

        // 目標權重：必須是 (移動中) && (按下該方向鍵) && (是當前 Profile 的動畫)
        const targetWeight = (isMoving && isActiveDir && isTarget) ? 1.0 : 0.0

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
