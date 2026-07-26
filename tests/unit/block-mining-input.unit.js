import assert from 'node:assert/strict'
import { register } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import emitter from '../../src/js/utils/event/event-bus.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
register(pathToFileURL(path.join(__dirname, 'vite-alias-loader.js')).href)

let BlockMiningController

test.before(async () => {
  ({ default: BlockMiningController } = await import('../../src/js/interaction/block-mining-controller.js'))
})

const blockTarget = {
  chunkX: 0,
  chunkZ: 0,
  worldBlock: { x: 1, y: 2, z: 3 },
  instanceId: 4,
  blockId: 5,
}

function makeController(current, { hasRaycaster = true } = {}) {
  const controller = Object.create(BlockMiningController.prototype)
  Object.assign(controller, {
    params: { enabled: true },
    experience: {
      world: hasRaycaster
        ? { blockRaycaster: { current } }
        : {},
    },
    time: { elapsed: 125 },
    isMining: false,
    miningStartTime: 0,
    miningProgress: 0,
    currentTarget: null,
  })
  return controller
}

test('left-click without a block emits one air swing', (t) => {
  const controller = makeController(null)
  let swings = 0
  let swingPayload = 'unset'
  const onSwing = (payload) => {
    swings++
    swingPayload = payload
  }
  emitter.on('input:air_swing', onSwing)
  t.after(() => emitter.off('input:air_swing', onSwing))

  controller._onMouseDown({ button: 0 })

  assert.equal(swings, 1)
  assert.equal(swingPayload, undefined)
  assert.equal(controller.isMining, false)
})

test('left-click with a block starts mining without an air swing', (t) => {
  const controller = makeController(blockTarget)
  let swings = 0
  let starts = 0
  const onSwing = () => swings++
  const onStart = () => starts++
  emitter.on('input:air_swing', onSwing)
  emitter.on('game:mining-start', onStart)
  t.after(() => {
    emitter.off('input:air_swing', onSwing)
    emitter.off('game:mining-start', onStart)
  })

  controller._onMouseDown({ button: 0 })

  assert.equal(swings, 0)
  assert.equal(starts, 1)
  assert.equal(controller.isMining, true)
  assert.deepEqual(controller.currentTarget.worldBlock, { x: 1, y: 2, z: 3 })
})

test('right and middle clicks do not mine or air swing without a block target', (t) => {
  const controller = makeController(null)
  let swings = 0
  let starts = 0
  const onSwing = () => swings++
  const onStart = () => starts++
  emitter.on('input:air_swing', onSwing)
  emitter.on('game:mining-start', onStart)
  t.after(() => {
    emitter.off('input:air_swing', onSwing)
    emitter.off('game:mining-start', onStart)
  })

  controller._onMouseDown({ button: 1 })
  controller._onMouseDown({ button: 2 })

  assert.equal(swings, 0)
  assert.equal(starts, 0)
  assert.equal(controller.isMining, false)
})

test('right and middle clicks do not mine or air swing with a block target', (t) => {
  const controller = makeController(blockTarget)
  let swings = 0
  let starts = 0
  const onSwing = () => swings++
  const onStart = () => starts++
  emitter.on('input:air_swing', onSwing)
  emitter.on('game:mining-start', onStart)
  t.after(() => {
    emitter.off('input:air_swing', onSwing)
    emitter.off('game:mining-start', onStart)
  })

  controller._onMouseDown({ button: 1 })
  controller._onMouseDown({ button: 2 })

  assert.equal(swings, 0)
  assert.equal(starts, 0)
  assert.equal(controller.isMining, false)
})

test('left-click without a block raycaster does not mine or air swing', (t) => {
  const controller = makeController(null, { hasRaycaster: false })
  let swings = 0
  let starts = 0
  const onSwing = () => swings++
  const onStart = () => starts++
  emitter.on('input:air_swing', onSwing)
  emitter.on('game:mining-start', onStart)
  t.after(() => {
    emitter.off('input:air_swing', onSwing)
    emitter.off('game:mining-start', onStart)
  })

  controller._onMouseDown({ button: 0 })

  assert.equal(swings, 0)
  assert.equal(starts, 0)
  assert.equal(controller.isMining, false)
})
