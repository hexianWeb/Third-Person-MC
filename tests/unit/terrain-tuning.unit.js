import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FLORA_DENSITY_SCALE,
  TERRAIN_PARAMS,
} from '../../src/js/config/chunk-config.js'
import {
  getFloraSpawnDensity,
} from '../../src/js/world/terrain/flora-density.js'

test('default terrain amplitude is twelve blocks', () => {
  assert.equal(TERRAIN_PARAMS.magnitude, 12)
})

test('flora density is halved while preserving biome differences', () => {
  assert.equal(FLORA_DENSITY_SCALE, 0.5)
  assert.equal(getFloraSpawnDensity(0.20), 0.10)
  assert.equal(getFloraSpawnDensity(0.15), 0.075)
  assert.equal(getFloraSpawnDensity(0.03), 0.015)
})

test('effective flora density remains a valid probability', () => {
  assert.equal(getFloraSpawnDensity(-1), 0)
  assert.equal(getFloraSpawnDensity(3), 1)
})
