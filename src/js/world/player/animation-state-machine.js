import { AnimationClips, AnimationStates } from './animation-config.js'

/**
 * 基礎狀態機類，提供狀態註冊與切換邏輯
 */
export class AnimationStateMachine {
  constructor() {
    this.states = {}
    this.currentState = null
    this.previousState = null
  }

  /**
   * 註冊狀態
   * @param {string} name - 狀態名稱
   * @param {object} config - 狀態配置 { enter, update, exit }
   */
  addState(name, config) {
    this.states[name] = {
      name,
      enter: config.enter || (() => {}),
      update: config.update || (() => {}),
      exit: config.exit || (() => {}),
    }
  }

  /**
   * 切換狀態
   * @param {string} name - 目標狀態名稱
   * @param {object} params - 傳遞給 enter 的參數
   */
  setState(name, params = {}) {
    const nextState = this.states[name]
    if (!nextState) {
      console.warn(`AnimationStateMachine: State '${name}' not found.`)
      return
    }

    if (this.currentState === nextState) {
      return
    }

    // Exit current state
    if (this.currentState) {
      this.previousState = this.currentState
      this.currentState.exit()
    }

    // Enter new state
    this.currentState = nextState
    this.currentState.enter(this.previousState ? this.previousState.name : null, params)
  }

  update(dt, params) {
    if (this.currentState) {
      this.currentState.update(dt, params)
    }
  }
}

/**
 * 玩家專用動畫狀態機，定義具體的狀態行為
 */
export class PlayerAnimationStateMachine extends AnimationStateMachine {
  constructor(animationController) {
    super()
    this.anim = animationController
    this.initStates()
  }

  initStates() {
    // ==========================================
    // 0. Intro State
    // ==========================================
    this.addState(AnimationStates.INTRO, {
      enter: () => {
        this.anim.playAction(AnimationClips.STANDUP)
      },
      update: (_dt, _params) => {
        const currentAction = this.anim.currentAction
        if (currentAction) {
          const clipName = currentAction.getClip().name
          // Check if finished
          if (clipName === AnimationClips.STANDUP && !currentAction.isRunning()) {
            this.setState(AnimationStates.LOCOMOTION)
          }
        }
        else {
          this.setState(AnimationStates.LOCOMOTION)
        }
      },
    })

    // ==========================================
    // 1. Locomotion State (Idle, Walk, Run, Crouch)
    // ==========================================
    this.addState(AnimationStates.LOCOMOTION, {
      enter: (prevState, _params) => {
        // 從其他狀態進入時，需要重新激活 blend tree
        // 包括 INTRO, COMBAT, AIRBORNE 等非 LOCOMOTION 狀態
        if (prevState && prevState !== AnimationStates.LOCOMOTION) {
          this.anim.fadeToLocomotion()
        }
      },
      update: (dt, params) => {
        // 持續更新方向混合權重
        const { inputState, isMoving, speedProfile, directionWeights } = params
        this.anim.updateLocomotion(dt, inputState, isMoving, speedProfile, directionWeights)

        // 狀態轉換檢查
        if (!params.isGrounded) {
          this.setState(AnimationStates.AIRBORNE)
        }
      },
    })

    // ==========================================
    // 2. Airborne State (Jump, Fall)
    // ==========================================
    this.addState(AnimationStates.AIRBORNE, {
      enter: (prevState) => {
        // 進入空中狀態時，預設播放 falling 動畫
        // 如果是跳躍觸發的，triggerJump() 會立即覆蓋播放 jump 動畫
        if (prevState !== AnimationStates.AIRBORNE) {
          this.anim.playAction('falling', 0.2)
        }
      },
      update: (dt, params) => {
        // 檢查是否落地
        if (params.isGrounded) {
          this.setState(AnimationStates.LOCOMOTION)
          return
        }

        // 如果當前在播放 jump 動畫且已結束（LoopOnce），切換到 falling
        const currentAction = this.anim.currentAction
        if (currentAction) {
          const clipName = currentAction.getClip().name
          // 如果是 jump 動畫且已經播放完畢（時間到達末尾）
          if (clipName === 'jump' && !currentAction.isRunning()) {
            this.anim.playAction('falling', 0.15)
          }
        }
      },
    })

    // ==========================================
    // 3. Combat State (Attack, Block, Hit)
    // ==========================================
    this.addState(AnimationStates.COMBAT, {
      enter: (prevState, params) => {
        // Combat 動作通常是 one-shot，由外部直接 playAction 觸發
        // 這裡只負責標記狀態，避免 locomotion 干擾
        if (params.actionName) {
          this.anim.playAction(params.actionName, 0.1)
        }
      },
      update: (dt, params) => {
        // 檢查動作是否結束
        if (!this.anim.isActionPlaying(params.currentActionName)) {
          this.setState(AnimationStates.LOCOMOTION)
        }
      },
      exit: () => {
        // 離開戰鬥狀態時，確保清理權重（雖然 fadeToLocomotion 會處理，但雙保險）
      },
    })
  }
}
