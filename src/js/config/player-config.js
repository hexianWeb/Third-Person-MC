// Player movement direction weights
// These constants determine the influence of each input direction before normalization
// For example, a lower backward weight means backward diagonal movement will be more sideways than backward

export const MOVEMENT_DIRECTION_WEIGHTS = {
  FORWARD: 1.0,
  BACKWARD: 0.8, // Slower backward / less influence in diagonals
  LEFT: 1.0,
  RIGHT: 1.0,
}

export const MOVEMENT_CONSTANTS = {
  COMBAT_DECELERATION: 0.9,
  GROUND_CHECK_RAY_OFFSET: 0.1,
  GROUND_CHECK_DISTANCE: 0.25,
  GROUND_CHECK_TOLERANCE: 0.2,
  GROUND_CHECK_MAX_FALL_SPEED: 0.5,
}

// 玩家默认配置（数值集中管理，便于调优）
export const PLAYER_CONFIG = {
  speed: {
    crouch: 1.3,
    walk: 2.3,
    run: 4.56,
  },
  // 方向速率倍率：区分档位以便精细调参
  directionMultiplier: {
    crouch: {
      lateral: 1.0, // 蹲行左右倍率
      backward: 1.0, // 蹲行后退倍率
    },
    walk: {
      lateral: 0.8, // 行走左右倍率
      backward: 0.75, // 行走后退倍率
    },
    run: {
      lateral: 0.9, // 奔跑左右倍率
      backward: 0.8, // 奔跑后退倍率
    },
  },
  jumpForce: 4.9,
  facingAngle: Math.PI,
  mouseSensitivity: 0.002,
  turnSmoothing: 0.05,
  respawn: {
    thresholdY: -2,
    position: { x: 0, y: 0, z: 0 },
  },
  speedLines: {
    fadeInSpeed: 5.0,
    fadeOutSpeed: 3.0,
    targetOpacity: 0.8,
  },
}
