import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ACTIVE_SLOT_COUNT,
  BLOCK_INSTANCE_CAPACITY,
  FIXED_INSTANCE_BUFFER_BYTES,
  isSupportedChunkViewDistance,
  STAGING_SLOT_COUNT,
  TOTAL_SLOT_COUNT,
} from '../../src/js/config/chunk-render-capacity.js'
import ChunkRenderCapacityError from '../../src/js/world/terrain/chunk-render-capacity-error.js'
import {
  diffChunkWindows,
  getChunkWindow,
  getInitialChunkWindowCenter,
  getNextChunkWindowCenter,
  isCurrentChunkAssignment,
} from '../../src/js/world/terrain/chunk-window.js'
import TerrainContainer from '../../src/js/world/terrain/terrain-container.js'

test('fixed render policy owns nine active and five staging slots', () => {
  assert.equal(ACTIVE_SLOT_COUNT, 9)
  assert.equal(STAGING_SLOT_COUNT, 5)
  assert.equal(TOTAL_SLOT_COUNT, 14)
  assert.equal(Object.keys(BLOCK_INSTANCE_CAPACITY).length, 19)
  assert.equal(FIXED_INSTANCE_BUFFER_BYTES, 63594496)
  assert.equal(isSupportedChunkViewDistance(1), true)
  assert.equal(isSupportedChunkViewDistance(2), false)
})

test('a diagonal one-chunk move has five incoming chunks', () => {
  const current = getChunkWindow(0, 0)
  const target = getChunkWindow(1, 1)
  const diff = diffChunkWindows(current, target)

  assert.equal(diff.overlap.size, 4)
  assert.equal(diff.incoming.size, 5)
  assert.equal(diff.outgoing.size, 5)
})

test('a far request advances one complete window at a time', () => {
  const requested = { x: 3, z: 4 }
  let center = { x: 0, z: 0 }
  const steps = []

  while (center.x !== requested.x || center.z !== requested.z) {
    const next = getNextChunkWindowCenter(center, requested)
    const diff = diffChunkWindows(getChunkWindow(center.x, center.z), getChunkWindow(next.x, next.z))
    steps.push({ center: next, incoming: diff.incoming.size })
    center = next
  }

  assert.deepEqual(steps.map(({ center: stepCenter }) => stepCenter), [
    { x: 1, z: 1 },
    { x: 2, z: 2 },
    { x: 3, z: 3 },
    { x: 3, z: 4 },
  ])
  assert.ok(steps.every(({ incoming }) => incoming <= STAGING_SLOT_COUNT))
})

test('the initial render transition keeps a center requested during prewarm', () => {
  assert.deepEqual(getInitialChunkWindowCenter({ x: -4, z: 6 }), { x: -4, z: 6 })
  assert.deepEqual(getInitialChunkWindowCenter(null), { x: 0, z: 0 })
})

test('a superseded assignment is stale even when its key and slot still match', () => {
  const slot = { assignmentId: 7 }
  const targetWindow = getChunkWindow(1, 0)

  assert.equal(isCurrentChunkAssignment({
    assignmentId: 7,
    chunkKey: '1,0',
    currentTransitionId: 12,
    destroyed: false,
    slot,
    targetWindow,
    transitionId: 11,
  }), false)
})

test('capacity errors expose structured overflow context', () => {
  const error = new ChunkRenderCapacityError({
    layer: 'blocks',
    typeId: 'stone',
    required: 8193,
    capacity: 8192,
  })

  assert.equal(error.name, 'ChunkRenderCapacityError')
  assert.equal(error.layer, 'blocks')
  assert.equal(error.typeId, 'stone')
  assert.equal(error.required, 8193)
  assert.equal(error.capacity, 8192)
})

test('clearInstanceIds preserves block ids', () => {
  const container = new TerrainContainer({ width: 2, height: 2 }, { useSingleton: false })
  container.setBlockId(0, 0, 0, 1)
  container.setBlockInstanceId(0, 0, 0, 7)
  container.clearInstanceIds()

  assert.equal(container.getBlock(0, 0, 0).id, 1)
  assert.equal(container.getBlock(0, 0, 0).instanceId, null)
})
