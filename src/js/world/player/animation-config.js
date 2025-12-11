import * as THREE from 'three'

// ===== 动画类别常量 =====
export const AnimationCategories = Object.freeze({
  LOCOMOTION: 'locomotion',
  ACTION: 'action',
  COMBAT: 'combat',
})

// ===== 动画状态常量（状态机用） =====
export const AnimationStates = Object.freeze({
  INTRO: 'intro',
  LOCOMOTION: 'locomotion',
  AIRBORNE: 'airborne',
  COMBAT: 'combat',
})

// ===== 动画剪辑名称集中定义，避免 magic string =====
export const AnimationClips = Object.freeze({
  IDLE: 'idle',
  WALK_FORWARD: 'forward',
  WALK_BACK: 'backward',
  WALK_LEFT: 'left',
  WALK_RIGHT: 'right',
  SNEAK_FORWARD: 'sneak_forward',
  SNEAK_BACK: 'sneak_backward',
  SNEAK_LEFT: 'sneak_left',
  SNEAK_RIGHT: 'sneak_right',
  RUN_FORWARD: 'running_forward',
  RUN_BACK: 'running_backward',
  RUN_LEFT: 'running_left',
  RUN_RIGHT: 'running_right',
  JUMP: 'jump',
  FALL: 'falling',
  BLOCK: 'left_block',
  STRAIGHT_PUNCH: 'left_straight_punch',
  HOOK_PUNCH: 'left_hook_punch',
  QUICK_COMBO: 'quick_combo_punch',
  // 新增动画
  RIGHT_STRAIGHT_PUNCH: 'right_straight_punch',
  RIGHT_HOOK_PUNCH: 'right_hook_punch',
  RIGHT_BLOCK: 'right_block',
  STANDUP: 'standup',
  TPOSE: 'tpose',
})

// ===== Blend Tree 方向顺序 =====
export const BLEND_DIRECTIONS = ['forward', 'backward', 'left', 'right']

// ===== 动画参数配置（沿用旧逻辑，但集中管理） =====
export const animationSettings = {
  [AnimationClips.IDLE]: { timeScale: 1.0, category: AnimationCategories.LOCOMOTION, loop: THREE.LoopRepeat },
  [AnimationClips.WALK_FORWARD]: { timeScale: 1.0, category: AnimationCategories.LOCOMOTION, loop: THREE.LoopRepeat },
  [AnimationClips.WALK_BACK]: { timeScale: 1.0, category: AnimationCategories.LOCOMOTION, loop: THREE.LoopRepeat },
  [AnimationClips.WALK_LEFT]: { timeScale: 1.0, category: AnimationCategories.LOCOMOTION, loop: THREE.LoopRepeat },
  [AnimationClips.WALK_RIGHT]: { timeScale: 1.0, category: AnimationCategories.LOCOMOTION, loop: THREE.LoopRepeat },
  [AnimationClips.SNEAK_FORWARD]: { timeScale: 1.0, category: AnimationCategories.LOCOMOTION, loop: THREE.LoopRepeat },
  [AnimationClips.SNEAK_BACK]: { timeScale: 1.0, category: AnimationCategories.LOCOMOTION, loop: THREE.LoopRepeat },
  [AnimationClips.SNEAK_LEFT]: { timeScale: 1.0, category: AnimationCategories.LOCOMOTION, loop: THREE.LoopRepeat },
  [AnimationClips.SNEAK_RIGHT]: { timeScale: 1.0, category: AnimationCategories.LOCOMOTION, loop: THREE.LoopRepeat },
  [AnimationClips.RUN_FORWARD]: { timeScale: 1.2, category: AnimationCategories.LOCOMOTION, loop: THREE.LoopRepeat },
  [AnimationClips.RUN_BACK]: { timeScale: 1.2, category: AnimationCategories.LOCOMOTION, loop: THREE.LoopRepeat },
  [AnimationClips.RUN_LEFT]: { timeScale: 1.2, category: AnimationCategories.LOCOMOTION, loop: THREE.LoopRepeat },
  [AnimationClips.RUN_RIGHT]: { timeScale: 1.2, category: AnimationCategories.LOCOMOTION, loop: THREE.LoopRepeat },
  [AnimationClips.JUMP]: { timeScale: 1.0, category: AnimationCategories.ACTION, loop: THREE.LoopOnce },
  [AnimationClips.FALL]: { timeScale: 1.0, category: AnimationCategories.ACTION, loop: THREE.LoopRepeat },
  [AnimationClips.STRAIGHT_PUNCH]: { timeScale: 1.5, category: AnimationCategories.COMBAT, loop: THREE.LoopOnce },
  [AnimationClips.HOOK_PUNCH]: { timeScale: 1.5, category: AnimationCategories.COMBAT, loop: THREE.LoopOnce },
  [AnimationClips.QUICK_COMBO]: { timeScale: 1.5, category: AnimationCategories.COMBAT, loop: THREE.LoopOnce },
  [AnimationClips.BLOCK]: { timeScale: 1.0, category: AnimationCategories.COMBAT, loop: THREE.LoopOnce },
  [AnimationClips.RIGHT_STRAIGHT_PUNCH]: { timeScale: 1.5, category: AnimationCategories.COMBAT, loop: THREE.LoopOnce },
  [AnimationClips.RIGHT_HOOK_PUNCH]: { timeScale: 1.5, category: AnimationCategories.COMBAT, loop: THREE.LoopOnce },
  [AnimationClips.RIGHT_BLOCK]: { timeScale: 1.0, category: AnimationCategories.COMBAT, loop: THREE.LoopOnce },
  [AnimationClips.STANDUP]: { timeScale: 1.0, category: AnimationCategories.ACTION, loop: THREE.LoopOnce },
}

// ===== 状态间过渡时长配置 =====
export const transitionDurations = {
  default: 0.3,
  [`${AnimationCategories.LOCOMOTION}:${AnimationCategories.LOCOMOTION}`]: 0.2,
  [`${AnimationCategories.LOCOMOTION}:${AnimationCategories.ACTION}`]: 0.1,
  [`${AnimationCategories.ACTION}:${AnimationCategories.LOCOMOTION}`]: 0.15,
  [`${AnimationCategories.COMBAT}:${AnimationCategories.LOCOMOTION}`]: 0.2,
  [`${AnimationCategories.COMBAT}:${AnimationCategories.COMBAT}`]: 0.1,
}

// ===== 统一的移动模式，跑步与行走共用同一套 blend tree 定义 =====
export const LocomotionProfiles = Object.freeze({
  WALK: {
    id: 'walk',
    idleWeight: 1,
    nodeMap: {
      forward: AnimationClips.WALK_FORWARD,
      backward: AnimationClips.WALK_BACK,
      left: AnimationClips.WALK_LEFT,
      right: AnimationClips.WALK_RIGHT,
    },
  },
  CROUCH: {
    id: 'crouch',
    idleWeight: 0, // 潜行模式下静止不播放 idle，暂时权重大约是 0，可能需要专门的 crouch idle，但目前先保持 0
    nodeMap: {
      forward: AnimationClips.SNEAK_FORWARD,
      backward: AnimationClips.SNEAK_BACK,
      left: AnimationClips.SNEAK_LEFT,
      right: AnimationClips.SNEAK_RIGHT,
    },
  },
  RUN: {
    id: 'run',
    idleWeight: 0,
    nodeMap: {
      forward: AnimationClips.RUN_FORWARD,
      backward: AnimationClips.RUN_BACK,
      left: AnimationClips.RUN_LEFT,
      right: AnimationClips.RUN_RIGHT,
    },
  },
})

export const CombatAnimations = Object.freeze([
  AnimationClips.STRAIGHT_PUNCH,
  AnimationClips.HOOK_PUNCH,
  AnimationClips.QUICK_COMBO,
  AnimationClips.BLOCK,
  AnimationClips.RIGHT_STRAIGHT_PUNCH,
  AnimationClips.RIGHT_HOOK_PUNCH,
  AnimationClips.RIGHT_BLOCK,
])

// ===== 播放速率配置（层级化） =====
export const timeScaleConfig = {
  global: 1.0,
  categories: {
    [AnimationCategories.LOCOMOTION]: 1.0,
    [AnimationCategories.ACTION]: 1.8,
    [AnimationCategories.COMBAT]: 1.3,
  },
  subGroups: {
    // Locomotion
    walk: 1.2,
    sneak: 0.9,
    run: 1.2,
    idle: 1.8,
    // Combat
    punch: 1.5,
    block: 2.0,
    // Action
    jump: 1.0,
    fall: 1.0,
    standup: 1.0,
  },
}

// ===== 动画子分组映射 =====
export const animationSubGroupMap = {
  [AnimationClips.IDLE]: 'idle',
  [AnimationClips.WALK_FORWARD]: 'walk',
  [AnimationClips.WALK_BACK]: 'walk',
  [AnimationClips.WALK_LEFT]: 'walk',
  [AnimationClips.WALK_RIGHT]: 'walk',
  [AnimationClips.SNEAK_FORWARD]: 'sneak',
  [AnimationClips.SNEAK_BACK]: 'sneak',
  [AnimationClips.SNEAK_LEFT]: 'sneak',
  [AnimationClips.SNEAK_RIGHT]: 'sneak',
  [AnimationClips.RUN_FORWARD]: 'run',
  [AnimationClips.RUN_BACK]: 'run',
  [AnimationClips.RUN_LEFT]: 'run',
  [AnimationClips.RUN_RIGHT]: 'run',
  [AnimationClips.JUMP]: 'jump',
  [AnimationClips.FALL]: 'fall',
  [AnimationClips.STRAIGHT_PUNCH]: 'punch',
  [AnimationClips.HOOK_PUNCH]: 'punch',
  [AnimationClips.QUICK_COMBO]: 'punch',
  [AnimationClips.RIGHT_STRAIGHT_PUNCH]: 'punch',
  [AnimationClips.RIGHT_HOOK_PUNCH]: 'punch',
  [AnimationClips.BLOCK]: 'block',
  [AnimationClips.RIGHT_BLOCK]: 'block',
  [AnimationClips.STANDUP]: 'standup',
  [AnimationClips.TPOSE]: 'idle',
}
