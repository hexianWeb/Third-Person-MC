import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clearChunkBiomeCache,
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

test('pruning a chunk clears its world-coordinate biome map cache', () => {
  const calls = []
  const generator = {
    clearCache: (...args) => calls.push(args),
  }

  clearChunkBiomeCache(generator, { chunkX: -2, chunkZ: 3 }, 64)

  assert.deepEqual(calls, [[-128, 192, 64]])
})
