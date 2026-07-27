import assert from 'node:assert/strict'
import test from 'node:test'

import * as THREE from 'three'

import { clampPitch, computeFirstPersonPose, PITCH_LIMIT } from '../../src/js/camera/first-person-math.js'

test('clampPitch 限制在 ±PITCH_LIMIT 内', () => {
  assert.equal(clampPitch(10), PITCH_LIMIT)
  assert.equal(clampPitch(-10), -PITCH_LIMIT)
  assert.equal(clampPitch(0.3), 0.3)
  assert.equal(clampPitch(2, -1, 1), 1)
})

test('facingAngle = 0 且 pitch = 0 时朝 -Z 水平看', () => {
  const { cameraPos, targetPos } = computeFirstPersonPose({
    position: new THREE.Vector3(10, 64, 20),
    facingAngle: 0,
    pitch: 0,
    eyeHeight: 1.62,
    forwardOffset: 0.15,
  })
  // 视点 = 脚底 + 眼高
  assert.ok(Math.abs(cameraPos.y - 65.62) < 1e-9)
  // 相机沿 -Z 前移 forwardOffset
  assert.ok(Math.abs(cameraPos.x - 10) < 1e-9)
  assert.ok(Math.abs(cameraPos.z - (20 - 0.15)) < 1e-9)
  // 目标点 = 视点 + 单位前向 (0, 0, -1)
  assert.ok(Math.abs(targetPos.z - 19) < 1e-9)
  assert.ok(Math.abs(targetPos.y - 65.62) < 1e-9)
})

test('pitch 为正值时目标点抬升（抬头）', () => {
  const { targetPos } = computeFirstPersonPose({
    position: new THREE.Vector3(0, 0, 0),
    facingAngle: 0,
    pitch: Math.PI / 4,
    eyeHeight: 1.62,
    forwardOffset: 0.15,
  })
  assert.ok(targetPos.y > 1.62)
})

test('facingAngle = PI 时朝 +Z 看', () => {
  const { targetPos } = computeFirstPersonPose({
    position: new THREE.Vector3(0, 0, 0),
    facingAngle: Math.PI,
    pitch: 0,
    eyeHeight: 1.62,
    forwardOffset: 0.15,
  })
  assert.ok(targetPos.z > 0.9)
})
