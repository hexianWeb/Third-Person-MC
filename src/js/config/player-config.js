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
