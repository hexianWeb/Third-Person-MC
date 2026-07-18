import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ALL_SKINS,
  CANONICAL_MODEL_PATH,
  CANONICAL_MODEL_RESOURCE,
  CUSTOM_SKIN_ID,
  DEFAULT_SKIN_ID,
  SKIN_LIST,
} from '../../src/js/config/skin-config.js'
import sources from '../../src/js/sources.js'

test('canonical model constants point at playerModel', () => {
  assert.equal(CANONICAL_MODEL_RESOURCE, 'playerModel')
  assert.equal(CANONICAL_MODEL_PATH, 'models/character/player.glb')
  assert.equal(CUSTOM_SKIN_ID, 'custom')
  assert.equal(DEFAULT_SKIN_ID, 'steve')
})

test('preset skins describe textures instead of models', () => {
  for (const skin of SKIN_LIST) {
    assert.equal(skin.modelPath, undefined)
    assert.ok(skin.textureResourceName)
    assert.ok(skin.texturePath.endsWith('.png'))
    assert.ok(skin.thumbnail)
  }
  assert.ok(ALL_SKINS.some(s => s.id === CUSTOM_SKIN_ID))
  assert.equal(ALL_SKINS.find(s => s.id === CUSTOM_SKIN_ID).textureResourceName, undefined)
})

test('sources preload playerModel and preset skin textures only', () => {
  const names = sources.map(s => s.name)
  assert.ok(names.includes('playerModel'))
  assert.ok(names.includes('zombieModel'))
  assert.equal(names.includes('steveModel'), false)
  assert.equal(names.includes('alexModel'), false)
  assert.ok(names.includes('steveSkinTexture'))
  assert.ok(names.includes('alexSkinTexture'))
  assert.ok(names.includes('playerSkinTexture'))
})
