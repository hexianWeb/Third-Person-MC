import assert from 'node:assert/strict'
import test from 'node:test'

import {
  refreshBiomeGenerator,
} from '../../src/js/world/terrain/biome-generator-lifecycle.js'

test('seed changes rebuild the shared biome generator noise state', () => {
  const calls = []
  const generator = {
    clearAllCache: () => calls.push(['clear']),
    setSeed: seed => calls.push(['setSeed', seed]),
  }

  const seed = refreshBiomeGenerator(generator, 1337, 7331)

  assert.equal(seed, 7331)
  assert.deepEqual(calls, [['setSeed', 7331]])
})

test('same-seed regeneration only clears shared biome caches', () => {
  const calls = []
  const generator = {
    clearAllCache: () => calls.push(['clear']),
    setSeed: seed => calls.push(['setSeed', seed]),
  }

  const seed = refreshBiomeGenerator(generator, 1337)

  assert.equal(seed, 1337)
  assert.deepEqual(calls, [['clear']])
})
