import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SHADOW_QUALITY,
  shouldTerrainCastShadow,
} from '../src/js/config/shadow-config.js'

test('LOW disables terrain shadows', () => {
  assert.equal(shouldTerrainCastShadow(SHADOW_QUALITY.LOW, 6), false)
})

test('MEDIUM enables only configured tree shadows', () => {
  assert.equal(shouldTerrainCastShadow(SHADOW_QUALITY.MEDIUM, 6), true)
  assert.equal(shouldTerrainCastShadow(SHADOW_QUALITY.MEDIUM, 1), false)
})

test('HIGH enables all terrain shadows', () => {
  assert.equal(shouldTerrainCastShadow(SHADOW_QUALITY.HIGH, 1), true)
})
