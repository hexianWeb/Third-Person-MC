import assert from 'node:assert/strict'
import test from 'node:test'

import { RNG } from '../../src/js/tools/rng.js'
import {
  blendBiomeTerrainShape,
  calculateBiomeTerrainHeight,
  validateBiomeDefinitions,
} from '../../src/js/world/terrain/biome-terrain-profile.js'
import { BLOCK_IDS } from '../../src/js/world/terrain/blocks-config.js'
import {
  getCategoricalBiomeBlocks,
  selectStrataBlock,
  selectSurfaceVariant,
} from '../../src/js/world/terrain/terrain-biome-field.js'
import { placeTree } from '../../src/js/world/terrain/tree-shape.js'

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

test('surface variant buckets noise by cumulative weight', () => {
  const variants = [
    { blockId: BLOCK_IDS.ICE, weight: 3 },
    { blockId: BLOCK_IDS.SNOW, weight: 1 },
  ]
  assert.equal(selectSurfaceVariant(variants, -0.5), BLOCK_IDS.ICE)
  assert.equal(selectSurfaceVariant(variants, 0.9), BLOCK_IDS.SNOW)
  assert.throws(() => selectSurfaceVariant([], 0), RangeError)
  assert.throws(
    () => selectSurfaceVariant([{ blockId: 1, weight: 0 }], 0),
    RangeError,
  )
})

test('strata bands cycle by height with wrap-around', () => {
  const strata = { bands: [10, 11], bandHeight: 2, noiseAmplitude: 0 }
  assert.equal(selectStrataBlock(strata, 0, 0), 10)
  assert.equal(selectStrataBlock(strata, 2, 0), 11)
  assert.equal(selectStrataBlock(strata, 4, 0), 10)
  assert.equal(selectStrataBlock(strata, -1, 0), 11)
  assert.throws(() => selectStrataBlock({ bands: [] }, 0, 0), RangeError)
})

test('underwater blocks use biome override when declared', () => {
  assert.equal(
    getCategoricalBiomeBlocks({ dominantBiome: 'badlands', underwater: true, shore: false }).surface,
    BLOCK_IDS.RED_SAND,
  )
  assert.equal(
    getCategoricalBiomeBlocks({ dominantBiome: 'frozenOcean', underwater: true, shore: false }).surface,
    BLOCK_IDS.GRAVEL,
  )
  assert.equal(
    getCategoricalBiomeBlocks({ dominantBiome: 'desert', underwater: true, shore: false }).surface,
    BLOCK_IDS.SAND,
  )
})

test('biome validation rejects malformed variants and strata', () => {
  const base = {
    id: 'x',
    climate: { temperature: 0.5, humidity: 0.5 },
    terrainParams: { heightOffset: 0, roughness: 1 },
    blocks: { surface: 1, subsurface: 2, deep: 3 },
  }
  assert.throws(() => validateBiomeDefinitions({
    X: { ...base, blocks: { ...base.blocks, surfaceVariants: [] } },
  }), RangeError)
  assert.throws(() => validateBiomeDefinitions({
    X: { ...base, strata: { bands: [], bandHeight: 4 } },
  }), RangeError)
  assert.throws(() => validateBiomeDefinitions({
    X: { ...base, terrainParams: { ...base.terrainParams, shape: { type: 'spiral' } } },
  }), RangeError)
})

test('spike shape tapers from a 3x3 base to a single tip', () => {
  const width = 16
  const height = 32
  const data = new Map()
  const key = (x, y, z) => `${x},${y},${z}`
  const placed = placeTree('spike', {
    setBlockId: (x, y, z, id) => data.set(key(x, y, z), id),
    getBlockId: (x, y, z) => data.get(key(x, y, z)) ?? 0,
    emptyId: 0,
    x: 8,
    baseY: 4,
    z: 8,
    trunkBlock: 18, // PACKED_ICE
    coreBlock: 24, // BLUE_ICE
    coreChance: 1, // 强制核心，便于断言
    leavesBlock: null,
    heightRange: [8, 8],
    rng: new RNG(7),
    bounds: { width, height },
  })

  // 底部两层为 3x3（高 8 → baseLayers = 2），其上为 1x1
  assert.equal(data.get(key(7, 4, 7)), 18)
  assert.equal(data.get(key(9, 5, 9)), 18)
  assert.equal(data.get(key(8, 4, 8)), 24) // 核心蓝冰
  assert.equal(data.get(key(8, 11, 8)), 24) // 尖顶核心
  assert.equal(data.get(key(7, 6, 8)) ?? 0, 0) // 上部无 3x3
  assert.ok(placed.trunkBlocks >= 8 * 1 + 2 * 8) // 中心柱 + 底部两圈 8 格
  assert.equal(placed.leavesBlocks, 0)
})
