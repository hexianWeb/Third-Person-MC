import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applySkinTextureToLayers,
  bindCharacterBodyLayers,
  configureSkinTexture,
  disposeOwnedSkinTexture,
} from '../../src/js/world/player/skin-texture-utils.js'

function makeModel(names = ['SimplePlayerarma', 'SimplePlayerBodyLayer1', 'SimplePlayerBodyLayer2']) {
  const mat1 = { map: null, emissiveMap: null, needsUpdate: false }
  const mat2 = { map: null, emissiveMap: null, needsUpdate: false }
  return {
    children: [{
      name: names[0],
      children: [
        { name: names[1], isMesh: true, material: mat1 },
        { name: names[2], isMesh: true, material: mat2 },
        { name: 'MAIN' },
      ],
    }],
  }
}

test('bindCharacterBodyLayers validates fixed hierarchy names', () => {
  const layers = bindCharacterBodyLayers(makeModel())
  assert.equal(layers.layer1.name, 'SimplePlayerBodyLayer1')
  assert.equal(layers.layer2.name, 'SimplePlayerBodyLayer2')
})

test('bindCharacterBodyLayers throws contextual error on mismatch', () => {
  assert.throws(
    () => bindCharacterBodyLayers(makeModel(['Wrong', 'A', 'B'])),
    /SimplePlayerarma/,
  )
})

test('applySkinTextureToLayers updates map and emissiveMap on both materials', () => {
  const layers = bindCharacterBodyLayers(makeModel())
  const texture = { userData: {} }
  applySkinTextureToLayers(layers, texture)
  assert.equal(layers.materials[0].map, texture)
  assert.equal(layers.materials[1].map, texture)
  assert.equal(layers.materials[0].emissiveMap, texture)
  assert.equal(layers.materials[1].emissiveMap, texture)
  assert.equal(layers.materials[0].needsUpdate, true)
})

test('disposeOwnedSkinTexture disposes owned custom textures only once', () => {
  let disposed = 0
  const owned = {
    userData: { skinOwned: true },
    dispose: () => {
      disposed++
    },
  }
  const shared = {
    userData: { skinOwned: false },
    dispose: () => {
      disposed++
    },
  }
  disposeOwnedSkinTexture(shared)
  disposeOwnedSkinTexture(owned)
  disposeOwnedSkinTexture(owned) // second call must be a no-op after clearing flag or nulling
  assert.equal(disposed, 1)
})

test('configureSkinTexture stamps sampling flags and ownership', () => {
  const fakeThree = {
    SRGBColorSpace: 'srgb',
    NearestFilter: 1003,
  }
  const texture = { userData: {} }
  configureSkinTexture(texture, { owned: true }, fakeThree)
  assert.equal(texture.colorSpace, 'srgb')
  assert.equal(texture.flipY, false)
  assert.equal(texture.magFilter, 1003)
  assert.equal(texture.minFilter, 1003)
  assert.equal(texture.generateMipmaps, false)
  assert.equal(texture.needsUpdate, true)
  assert.equal(texture.userData.skinOwned, true)
})
