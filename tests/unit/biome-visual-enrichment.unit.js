import assert from 'node:assert/strict'
import test from 'node:test'

import {
  blendBiomeTerrainShape,
  calculateBiomeTerrainHeight,
} from '../../src/js/world/terrain/biome-terrain-profile.js'

const SHAPED_BIOMES = {
  FLAT: {
    id: 'flat',
    climate: { temperature: 0.5, humidity: 0.5 },
    terrainParams: { heightOffset: 0, roughness: 0.75 },
  },
  MESA: {
    id: 'mesa',
    climate: { temperature: 0.5, humidity: 0.1 },
    terrainParams: {
      heightOffset: 2,
      roughness: 1.35,
      shape: { type: 'plateau', levels: 4, amount: 1 },
    },
  },
  RIDGE: {
    id: 'ridge',
    climate: { temperature: 0.1, humidity: 0.8 },
    terrainParams: {
      heightOffset: 0,
      roughness: 0.8,
      shape: { type: 'ridged', gain: 1.6, amount: 1 },
    },
  },
}

test('shape blending defaults to zero for shapeless biomes', () => {
  assert.deepEqual(blendBiomeTerrainShape({ flat: 1 }, SHAPED_BIOMES), {
    plateauAmount: 0,
    plateauLevels: 4,
    ridgedAmount: 0,
    ridgedGain: 1.5,
  })
})

test('shape amounts blend with biome weights', () => {
  const shaped = blendBiomeTerrainShape({ mesa: 0.5, flat: 0.5 }, SHAPED_BIOMES)
  assert.equal(shaped.plateauAmount, 0.5)
  assert.equal(shaped.ridgedAmount, 0)

  const full = blendBiomeTerrainShape({ mesa: 1 }, SHAPED_BIOMES)
  assert.equal(full.plateauAmount, 1)
  assert.equal(full.plateauLevels, 4)

  const ridged = blendBiomeTerrainShape({ ridge: 1 }, SHAPED_BIOMES)
  assert.equal(ridged.ridgedAmount, 1)
  assert.ok(ridged.ridgedGain > 1)
})

test('height calculation is unchanged when no biome declares a shape', () => {
  const options = {
    baseOffset: 8,
    baseMagnitude: 6,
    terrainNoise: 0.5,
    weights: { plains: 0.75, desert: 0.25 },
    maxHeight: 31,
  }
  // 与塑形引入前相同的期望：floor(8 + 0.25 + 6 * 0.5 * 0.85) = floor(10.8) = 10
  assert.equal(calculateBiomeTerrainHeight(options), 10)
})

test('plateau shaping quantizes noise into terraces', () => {
  const heightAt = noise => calculateBiomeTerrainHeight({
    baseOffset: 8,
    baseMagnitude: 6,
    terrainNoise: noise,
    weights: { mesa: 1 },
    maxHeight: 63,
    biomeDefinitions: SHAPED_BIOMES,
  })
  // 同一台阶内的噪声值映射到相近高度，跨台阶出现跳变
  const low = heightAt(0.05)
  const mid = heightAt(0.45)
  const high = heightAt(0.55)
  assert.ok(high - low >= 2, `expected a terrace jump, got ${low} -> ${high}`)
  assert.ok(Math.abs(mid - high) <= 2 || high > mid)
  assert.ok(heightAt(1) <= 63 && heightAt(-1) >= 0)
})
