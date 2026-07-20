import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BLOCK_IDS,
  getHotbarIconTextureKey,
  isFlatHotbarItem,
} from '../../src/js/world/terrain/blocks-config.js'

test('snail uses flat hotbar icon from object texture', () => {
  assert.equal(isFlatHotbarItem(BLOCK_IDS.SNAIL), true)
  assert.equal(getHotbarIconTextureKey(BLOCK_IDS.SNAIL), 'snail_Texture')
})

test('normal blocks use 3D hotbar display', () => {
  assert.equal(isFlatHotbarItem(BLOCK_IDS.GRASS), false)
  assert.equal(isFlatHotbarItem(BLOCK_IDS.EMPTY), false)
})
