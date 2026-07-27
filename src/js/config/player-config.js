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
}

// 玩家默认配置（数值集中管理，便于调优）
export const PLAYER_CONFIG = {
  speed: {
    crouch: 1.3,
    walk: 3.00,
    run: 5.00,
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
  turnSmoothing: 0.10,
  respawn: {
    thresholdY: -2,
    position: { x: 0, y: 0, z: 0 },
  },
  speedLines: {
    fadeInSpeed: 5.0,
    fadeOutSpeed: 3.0,
    targetOpacity: 0.8,
  },
  // 第一人称手部模型（挂在相机容器下，仅第一人称可见）
  firstPersonHand: {
    // 相机局部空间偏移：模型原点在脚底，手臂约 1.4 高，需下移并略微前移
    offset: { x: 0, y: -1.45, z: 0.2 },
    rotationY: Math.PI, // 与本体约定一致：旋转 PI 后面向 -Z（视线方向）
    scale: 1.0,
  },
}
