import assert from 'node:assert/strict'
import test from 'node:test'

import { DRY_TOILET_SNAILS_CONFIG } from '../../src/js/config/dry-toilet-snails-config.js'
import { RNG } from '../../src/js/tools/rng.js'
import {
  buildPlatformPlan,
  computePlatformTargetY,
  computeToiletFitTransform,
  createSnailFsm,
  generateSnailSpawnPoints,
  isValidAabbSize,
  SNAIL_STATES,
  snailFsmOnClick,
  snailFsmUpdate,
} from '../../src/js/world/landmarks/dry-toilet-math.js'

test('rejects invalid aabb sizes', () => {
  assert.equal(isValidAabbSize({ x: 1, y: 1, z: 0 }), false)
  assert.equal(isValidAabbSize({ x: 1, y: Number.NaN, z: 1 }), false)
  assert.equal(isValidAabbSize({ x: 0.5, y: 0.9, z: 0.7 }), true)
})

test('fits longest xz edge to target base and centers on origin', () => {
  const size = { x: 0.548, y: 0.928, z: 0.771 }
  const { scale, offset } = computeToiletFitTransform(size, 2)
  assert.ok(Math.abs(scale - (2 / 0.771)) < 1e-9)
  const scaled = { x: size.x * scale, y: size.y * scale, z: size.z * scale }
  assert.ok(Math.abs(scaled.z - 2) < 1e-9)
  // After scale, offset recenters XZ and lifts minY to 0
  assert.ok(Math.abs(offset.x) < 1e-9)
  assert.ok(Math.abs(offset.z) < 1e-9)
  assert.ok(Math.abs(offset.y - scaled.y / 2) < 1e-9)
})

test('platform target y uses floored even-pair median', () => {
  assert.equal(computePlatformTargetY([10, 12, 11, 14]), 11)
  assert.equal(computePlatformTargetY([8, 10, 9, 11]), 9)
  assert.equal(computePlatformTargetY([5, 5, 5, 5]), 5)
})

test('platform plan fills, cuts, clears vegetation, and is idempotent', () => {
  const columns = [
    { x: -1, z: -1, surfaceY: 8, surfaceBlockId: 1, blocksAbove: [{ y: 9, id: 6 }, { y: 10, id: 7 }] },
    { x: -1, z: 0, surfaceY: 10, surfaceBlockId: 1, blocksAbove: [] },
    { x: 0, z: -1, surfaceY: 9, surfaceBlockId: 2, blocksAbove: [] },
    { x: 0, z: 0, surfaceY: 11, surfaceBlockId: 1, blocksAbove: [{ y: 12, id: 202 }] },
  ]
  const targetY = computePlatformTargetY(columns.map(c => c.surfaceY))
  const plan = buildPlatformPlan({ columns, targetY, fillBlockId: 1 })
  assert.ok(plan.ops.some(op => op.type === 'remove' && op.y === 11 && op.x === 0 && op.z === 0))
  assert.ok(plan.ops.some(op => op.type === 'add' && op.x === -1 && op.z === -1 && op.y === 9))
  assert.deepEqual(plan.clearPlantColumns, columns.map(({ x, z }) => ({ x, z })))

  const doneColumns = columns.map(c => ({
    ...c,
    surfaceY: targetY,
    blocksAbove: [],
  }))
  const again = buildPlatformPlan({ columns: doneColumns, targetY, fillBlockId: 1 })
  assert.equal(again.ops.length, 0)
})

test('spawn points stay in ring, avoid footprint, and are deterministic', () => {
  const cfg = DRY_TOILET_SNAILS_CONFIG
  const a = generateSnailSpawnPoints(new RNG(1337 + cfg.rngSalt), {
    count: cfg.snailCount,
    center: cfg.center,
    footprint: cfg.footprint,
    radiusMin: cfg.activityRadiusMin,
    radiusMax: cfg.activityRadiusMax,
    lengthMin: cfg.snailLengthMin,
    lengthMax: cfg.snailLengthMax,
  })
  const b = generateSnailSpawnPoints(new RNG(1337 + cfg.rngSalt), {
    count: cfg.snailCount,
    center: cfg.center,
    footprint: cfg.footprint,
    radiusMin: cfg.activityRadiusMin,
    radiusMax: cfg.activityRadiusMax,
    lengthMin: cfg.snailLengthMin,
    lengthMax: cfg.snailLengthMax,
  })
  assert.equal(a.length, 12)
  assert.deepEqual(a, b)
  const footprintSet = new Set(cfg.footprint.map(p => `${p.x},${p.z}`))
  for (const p of a) {
    const dx = p.x - cfg.center.x
    const dz = p.z - cfg.center.z
    const r = Math.hypot(dx, dz)
    assert.ok(r >= cfg.activityRadiusMin - 1e-6)
    assert.ok(r <= cfg.activityRadiusMax + 1e-6)
    assert.equal(footprintSet.has(`${Math.floor(p.x)},${Math.floor(p.z)}`), false)
    assert.ok(p.length >= cfg.snailLengthMin && p.length <= cfg.snailLengthMax)
  }
})

test('snail fsm retracts once and ignores repeat clicks until crawling', () => {
  const fsm = createSnailFsm({ retractMs: 100, holdMs: 100, emergeMs: 100 })
  assert.equal(fsm.state, SNAIL_STATES.CRAWLING)
  snailFsmOnClick(fsm)
  assert.equal(fsm.state, SNAIL_STATES.RETRACTING)
  const t0 = fsm.timerMs
  snailFsmOnClick(fsm)
  assert.equal(fsm.timerMs, t0)
  snailFsmUpdate(fsm, 100)
  assert.equal(fsm.state, SNAIL_STATES.RETRACTED)
  snailFsmUpdate(fsm, 100)
  assert.equal(fsm.state, SNAIL_STATES.EMERGING)
  snailFsmUpdate(fsm, 100)
  assert.equal(fsm.state, SNAIL_STATES.CRAWLING)
})
