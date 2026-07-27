import * as THREE from 'three'

/** 俯仰角上限（弧度），约 ±89°，防止视线翻转 */
export const PITCH_LIMIT = Math.PI / 2 - 0.02

/**
 * 将俯仰角限制在安全范围内
 * @param {number} pitch - 当前俯仰角（弧度，正值抬头）
 * @param {number} [min] - 下限
 * @param {number} [max] - 上限
 * @returns {number} 限制后的俯仰角
 */
export function clampPitch(pitch, min = -PITCH_LIMIT, max = PITCH_LIMIT) {
  return Math.min(Math.max(pitch, min), max)
}

/**
 * 计算第一人称相机位姿
 * 朝向约定与世界前向一致：(-sin(yaw), 0, -cos(yaw))，pitch 为正值时抬头
 * @param {{ position: THREE.Vector3, facingAngle: number, pitch: number, eyeHeight: number, forwardOffset: number }} params
 *   position 为玩家脚底世界坐标；forwardOffset 让相机沿视线前移，避免近裁剪面切到自身模型
 * @returns {{ cameraPos: THREE.Vector3, targetPos: THREE.Vector3 }} 相机位置与 lookAt 目标点
 */
export function computeFirstPersonPose({ position, facingAngle, pitch, eyeHeight, forwardOffset }) {
  const safePitch = clampPitch(pitch)
  const cosPitch = Math.cos(safePitch)
  const forward = new THREE.Vector3(
    -Math.sin(facingAngle) * cosPitch,
    Math.sin(safePitch),
    -Math.cos(facingAngle) * cosPitch,
  )
  const eye = new THREE.Vector3(position.x, position.y + eyeHeight, position.z)
  const cameraPos = eye.clone().addScaledVector(forward, forwardOffset)
  const targetPos = eye.clone().add(forward)
  return { cameraPos, targetPos }
}
