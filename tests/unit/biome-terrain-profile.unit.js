import assert from 'node:assert/strict'
import test from 'node:test'

import { BIOME_PARAMS } from '../../src/js/config/chunk-config.js'
import { BIOMES } from '../../src/js/world/terrain/biome-config.js'
import {
  blendBiomeTerrainProfile,
  calculateBiomeTerrainHeight,
  MAX_BIOME_ROUGHNESS,
  MIN_BIOME_ROUGHNESS,
  validateBiomeDefinitions,
} from '../../src/js/world/terrain/biome-terrain-profile.js'

test('macro biome defaults preserve a stable region core and bounded transition', () => {
  const minimumSiteSeparation = BIOME_PARAMS.regionSize
    * (1 - 2 * BIOME_PARAMS.regionJitter)

  assert.ok(BIOME_PARAMS.regionSize >= 128)
  assert.ok(minimumSiteSeparation >= 64)
  assert.ok(BIOME_PARAMS.transitionWidth <= minimumSiteSeparation / 2)
  assert.ok(BIOME_PARAMS.temperatureScale >= BIOME_PARAMS.regionSize * 3)
  assert.ok(BIOME_PARAMS.humidityScale >= BIOME_PARAMS.regionSize * 3)
  assert.ok(BIOME_PARAMS.siteCacheLimit >= 2048)
})

test('every biome exposes finite climate anchors and bounded terrain profiles', () => {
  assert.doesNotThrow(() => validateBiomeDefinitions(BIOMES))

  for (const biome of Object.values(BIOMES)) {
    assert.ok(Number.isFinite(biome.climate.temperature))
    assert.ok(Number.isFinite(biome.climate.humidity))
    assert.ok(biome.climate.temperature >= 0 && biome.climate.temperature <= 1)
    assert.ok(biome.climate.humidity >= 0 && biome.climate.humidity <= 1)
    assert.ok(Number.isFinite(biome.terrainParams.heightOffset))
    assert.ok(biome.terrainParams.roughness >= MIN_BIOME_ROUGHNESS)
    assert.ok(biome.terrainParams.roughness <= MAX_BIOME_ROUGHNESS)
  }
})

test('terrain profile blending is independent of weight insertion order', () => {
  const first = blendBiomeTerrainProfile({ plains: 0.75, badlands: 0.25 })
  const second = blendBiomeTerrainProfile({ badlands: 0.25, plains: 0.75 })

  assert.deepEqual(first, second)
  assert.deepEqual(first, {
    heightOffset: 0.5,
    roughness: 0.9,
  })
})

test('finite out-of-range roughness is clamped when a profile is read', () => {
  const customBiomes = {
    ROUGH: {
      id: 'rough',
      climate: { temperature: 0.5, humidity: 0.5 },
      terrainParams: { heightOffset: 0, roughness: 5 },
    },
  }

  assert.doesNotThrow(() => validateBiomeDefinitions(customBiomes))
  assert.deepEqual(
    blendBiomeTerrainProfile({ rough: 1 }, customBiomes),
    { heightOffset: 0, roughness: MAX_BIOME_ROUGHNESS },
  )
})

test('terrain profile rejects malformed weights and unknown biomes', () => {
  assert.throws(
    () => blendBiomeTerrainProfile({ plains: Number.NaN }),
    TypeError,
  )
  assert.throws(
    () => blendBiomeTerrainProfile({ plains: -0.1, forest: 1.1 }),
    RangeError,
  )
  assert.throws(
    () => blendBiomeTerrainProfile({ missingBiome: 1 }),
    RangeError,
  )
  assert.throws(
    () => blendBiomeTerrainProfile({ plains: 0.4, forest: 0.4 }),
    RangeError,
  )
})

test('height calculation applies one blended profile before flooring and clamping', () => {
  assert.equal(calculateBiomeTerrainHeight({
    baseOffset: 8,
    baseMagnitude: 6,
    terrainNoise: 0.5,
    weights: { plains: 0.75, badlands: 0.25 },
    maxHeight: 31,
  }), 11)

  assert.equal(calculateBiomeTerrainHeight({
    baseOffset: 30,
    baseMagnitude: 6,
    terrainNoise: 1,
    weights: { badlands: 1 },
    maxHeight: 31,
  }), 31)

  assert.equal(calculateBiomeTerrainHeight({
    baseOffset: 0,
    baseMagnitude: 6,
    terrainNoise: -1,
    weights: { badlands: 1 },
    maxHeight: 31,
  }), 0)
})

test('invalid biome definitions fail before terrain generation', () => {
  const invalidClimate = {
    BAD: {
      id: 'bad',
      climate: { temperature: 2, humidity: 0.5 },
      terrainParams: { heightOffset: 0, roughness: 1 },
    },
  }
  const invalidProfile = {
    BAD: {
      id: 'bad',
      climate: { temperature: 0.5, humidity: 0.5 },
      terrainParams: { heightOffset: 0, roughness: Number.NaN },
    },
  }

  assert.throws(() => validateBiomeDefinitions(invalidClimate), RangeError)
  assert.throws(() => validateBiomeDefinitions(invalidProfile), TypeError)
  assert.throws(() => validateBiomeDefinitions({}), RangeError)
})
