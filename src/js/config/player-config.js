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
    crouch: 1.6,
    walk: 3.0,
    run: 6.4,
  },
  jumpForce: 4.9,
  facingAngle: Math.PI,
  mouseSensitivity: 0.002,
  respawn: {
    thresholdY: -10,
    position: { x: 10, y: 10, z: 10 },
  },
  speedLines: {
    fadeInSpeed: 5.0,
    fadeOutSpeed: 3.0,
    targetOpacity: 0.8,
  },
}
