import assert from 'node:assert/strict'
import test from 'node:test'
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js'

import { RNG } from '../../src/js/tools/rng.js'
import { fbm2D } from '../../src/js/utils/utils/noise-utils.js'
import BiomeGenerator from '../../src/js/world/terrain/biome-generator.js'
import {
  calculateBiomeTerrainHeight,
} from '../../src/js/world/terrain/biome-terrain-profile.js'
import { BLOCK_IDS } from '../../src/js/world/terrain/blocks-config.js'
import {
  buildTerrainBiomeField,
  getCategoricalBiomeBlocks,
} from '../../src/js/world/terrain/terrain-biome-field.js'

test('generateTerrain preserves [x][z] source and [z][x] internal orientation', () => {
  const source = [
    [
      { biome: 'plains', temp: 0.5, humidity: 0.5, weights: { plains: 1 } },
      { biome: 'forest', temp: 0.5, humidity: 0.8, weights: { forest: 1 } },
    ],
    [
      { biome: 'desert', temp: 0.9, humidity: 0.2, weights: { desert: 1 } },
      { biome: 'badlands', temp: 0.6, humidity: 0.1, weights: { badlands: 1 } },
    ],
  ]
  const simplex = new SimplexNoise(new RNG(1337))

  const result = buildTerrainBiomeField({
    width: 2,
    height: 32,
    originX: 0,
    originZ: 0,
    terrain: {
      scale: 168,
      magnitude: 6,
      offset: 8,
      fbm: { octaves: 5, gain: 0.5, lacunarity: 2 },
    },
    simplex,
    generatedBiomeMap: source,
  })

  assert.deepEqual(result.biomeMap, [
    ['plains', 'desert'],
    ['forest', 'badlands'],
  ])
  assert.deepEqual(result.biomeDataMap, [
    [source[0][0], source[1][0]],
    [source[0][1], source[1][1]],
  ])
  assert.equal(result.heightMap.length, 2)
  assert.equal(result.heightMap[0].length, 2)
})

test('seed 1337 regression boundary no longer jumps seven blocks', () => {
  const biomeGenerator = new BiomeGenerator(1337)
  const simplex = new SimplexNoise(new RNG(1337))
  const sampleHeight = (x, z) => {
    const terrainNoise = fbm2D(simplex, x, z, {
      octaves: 5,
      gain: 0.5,
      lacunarity: 2,
      scale: 168,
    })
    return calculateBiomeTerrainHeight({
      baseOffset: 8,
      baseMagnitude: 6,
      terrainNoise,
      weights: biomeGenerator.getBiomeAt(x, z).weights,
      maxHeight: 31,
    })
  }

  const first = sampleHeight(83, 6)
  const second = sampleHeight(84, 6)
  assert.ok(Math.abs(first - second) <= 1, `${first} -> ${second}`)
})

test('column layers use dominant biome blocks without Math.random mixing', () => {
  const originalRandom = Math.random
  Math.random = () => {
    throw new Error('Math.random must not select biome surface blocks')
  }
  try {
    assert.deepEqual(getCategoricalBiomeBlocks({
      dominantBiome: 'desert',
      underwater: false,
      shore: false,
    }), {
      surface: BLOCK_IDS.SAND,
      subsurface: BLOCK_IDS.SAND,
      deep: BLOCK_IDS.STONE,
    })
  }
  finally {
    Math.random = originalRandom
  }
})
