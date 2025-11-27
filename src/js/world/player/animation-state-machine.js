import * as THREE from 'three'
import { AnimationStates } from './animation-config.js'

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
    // 1. Locomotion State (Idle, Walk, Run, Crouch)
    // ==========================================
    this.addState(AnimationStates.LOCOMOTION, {
      enter: (prevState, params) => {
        // 從其他狀態進入時，通常需要重新激活 blend tree
        if (prevState === AnimationStates.COMBAT || prevState === AnimationStates.AIRBORNE) {
          this.anim.fadeToLocomotion()
        }
      },
      update: (dt, params) => {
        // 持續更新方向混合權重
        const { inputState, isMoving, speedProfile } = params
        this.anim.updateLocomotion(dt, inputState, isMoving, speedProfile)

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
        // 如果是跳躍，會在 controller 外部直接觸發 jump action，這裡主要處理 falling
        // 但通常 airborne 是一個持續狀態
        if (prevState !== AnimationStates.AIRBORNE) {
          this.anim.playAction('falling', 0.2)
        }
      },
      update: (dt, params) => {
        if (params.isGrounded) {
          this.setState(AnimationStates.LOCOMOTION)
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
