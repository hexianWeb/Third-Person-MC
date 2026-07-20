import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveSnailClickHitRadius,
  shouldConsumeMiningClick,
} from '../../src/js/world/landmarks/dry-toilet-math.js'

test('consumes click only for near snail hits', () => {
  assert.equal(shouldConsumeMiningClick({ hitSnail: true, distance: 5.9, maxDistance: 6 }), true)
  assert.equal(shouldConsumeMiningClick({ hitSnail: true, distance: 6.1, maxDistance: 6 }), false)
  assert.equal(shouldConsumeMiningClick({ hitSnail: false, distance: 1, maxDistance: 6 }), false)
})

test('click hit radius uses min floor and length factor', () => {
  assert.equal(resolveSnailClickHitRadius(0.5, { min: 0.4, factor: 0.75 }), 0.4)
  assert.equal(resolveSnailClickHitRadius(1.0, { min: 0.4, factor: 0.75 }), 0.75)
  assert.equal(resolveSnailClickHitRadius(Number.NaN, { min: 0.4, factor: 0.75 }), 0.4)
})

test('mining handler respects handled flag', () => {
  const calls = []
  function miningOnMouseDown(event) {
    if (event.handled)
      return
    if (event.button !== 0)
      return
    calls.push('mine')
  }

  miningOnMouseDown({ button: 0, handled: true })
  assert.deepEqual(calls, [])
  miningOnMouseDown({ button: 0 })
  assert.deepEqual(calls, ['mine'])
})
