# Macro Biome Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace rectangular per-column climate classification with deterministic macro biome regions and continuous terrain-profile blending, eliminating tiny biome fragments and biome-induced vertical terrain walls without adding erosion or a full multi-noise terrain system.

**Architecture:** `BiomeGenerator` builds warped, jittered 128-block macro regions whose cached sites are labeled from temperature/humidity climate anchors. It returns normalized biome weights while `TerrainGenerator` keeps the existing five-octave global fBM and applies only a bounded blended `{ heightOffset, roughness }` profile. Dominant biome identity remains categorical for blocks, trees, and flora.

**Tech Stack:** JavaScript ES modules, Three.js `SimplexNoise`, existing `RNG` and `fbm2D`, Node.js built-in test runner through `pnpm exec node --test`, Playwright, Canvas 2D debug visualization, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-26-macro-biome-generation-design.md`

## Global Constraints

- Use `pnpm` exclusively. Do not add dependencies.
- Keep pure JavaScript ES modules with explicit `.js` imports, two-space indentation, no semicolons, single quotes, and trailing commas in multiline literals.
- Preserve the existing five-octave global terrain fBM. Do not add erosion, continentalness, weirdness, spline routing, density functions, workers, or neighbor-dependent cleanup.
- Default macro parameters are exactly: `regionSize: 128`, `regionJitter: 0.25`, `transitionWidth: 20`, `warpScale: 96`, `warpStrength: 12`, `temperatureScale: 384`, `humidityScale: 384`, `siteCacheLimit: 2048`.
- Initial biome climate anchors and terrain profiles must match the approved design table.
- `getBiomeAt()` and `generateBiomeMap()` must be deterministic from seed and world coordinates, including negative coordinates and chunk seams.
- Generator-mode `weights` is always a normalized object; a single biome is `{ [biomeId]: 1 }`, never `null`.
- Keep `[x][z]` orientation from `BiomeGenerator.generateBiomeMap()` and `[z][x]` orientation inside `TerrainGenerator`.
- Surface/subsurface/deep blocks, trees, and flora use the dominant biome. Do not use `Math.random()` to mix biome surface blocks.
- Validate finite coordinates and world-generation parameters. Keep both the chunk biome-map cache and site cache bounded or explicitly cleared.
- Preserve unrelated working-tree changes. At plan creation, `.gitignore` and `.codegraph/` are unrelated and must not be staged.
- Before every success claim, run the fresh command that proves it.

---

## File Structure

### New production file

- `src/js/world/terrain/biome-terrain-profile.js` — validates biome climate/profile configuration, blends numeric biome terrain profiles, and calculates final clamped block heights as pure functions.

### Modified production files

- `src/js/config/chunk-config.js` — owns immutable `BIOME_PARAMS`.
- `src/js/world/terrain/biome-config.js` — replaces rectangular ranges and unbounded height multipliers with climate anchors and bounded roughness profiles.
- `src/js/world/terrain/biome-generator.js` — owns seeded macro sites, coordinate warp, climate labeling, continuous weights, map/site caches, parameter updates, and reseeding.
- `src/js/world/terrain/terrain-generator.js` — uses the pure terrain-profile height function and dominant biome block mappings.
- `src/js/world/terrain/chunk-manager.js` — constructs/reseeds the shared biome generator and exposes the new debug controls without changing streaming scheduling.
- `src/debug/biome-map.js` — renders production dominant-biome, temperature, humidity, transition, site, and chunk-grid data.
- `biome-debug.html` — exposes matching controls and display overlays.

### New tests and benchmark

- `tests/unit/biome-terrain-profile.unit.js` — configuration validation, order-independent blending, bounds, and height formula.
- `tests/unit/biome-generator.unit.js` — determinism, seams, normalized weights, macro-region size, cache, updates, reseeding, and invalid inputs.
- `tests/unit/terrain-biome-integration.unit.js` — exact TerrainGenerator map orientation, fBM/profile integration, seed `1337` height regression, and categorical surface blocks.
- `tests/unit/chunk-biome-lifecycle.unit.js` — shared generator reseeding through `ChunkManager.regenerateAll()`.
- `tests/biome-debug.e2e.test.js` — debug-page controls, display modes, overlays, and console-error coverage.
- `tests/benchmarks/biome-generator.bench.js` — repeatable 3×3 chunk timing report.

---

### Task 1: Climate anchors and pure terrain profiles

**Files:**

- Modify: `src/js/config/chunk-config.js:18-33`
- Modify: `src/js/world/terrain/biome-config.js:16-297`
- Create: `src/js/world/terrain/biome-terrain-profile.js`
- Create: `tests/unit/biome-terrain-profile.unit.js`

**Interfaces:**

- Produces `BIOME_PARAMS` with the exact approved default shape.
- Replaces every biome's `tempRange`/`humidityRange` with:

```javascript
climate: {
  temperature: number,
  humidity: number,
}
```

- Replaces `terrainParams.heightMagnitude` with:

```javascript
terrainParams: {
  heightOffset: number,
  roughness: number,
}
```

- Produces from `biome-terrain-profile.js`:

```javascript
export const MIN_BIOME_ROUGHNESS = 0.75
export const MAX_BIOME_ROUGHNESS = 1.35
export function validateBiomeDefinitions(biomes): void
export function blendBiomeTerrainProfile(weights, biomes = BIOMES): {
  heightOffset: number,
  roughness: number,
}
export function calculateBiomeTerrainHeight({
  baseOffset,
  baseMagnitude,
  terrainNoise,
  weights,
  maxHeight,
  biomes,
}): number
```

- `biomes` is the `BIOMES` object keyed by config constant name. Weight keys are biome IDs such as `plains`.

- [ ] **Step 1: Write failing profile/configuration tests**

Create `tests/unit/biome-terrain-profile.unit.js`:

```javascript
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

test('macro biome defaults match the approved performance envelope', () => {
  assert.deepEqual(BIOME_PARAMS, {
    regionSize: 128,
    regionJitter: 0.25,
    transitionWidth: 20,
    warpScale: 96,
    warpStrength: 12,
    temperatureScale: 384,
    humidityScale: 384,
    siteCacheLimit: 2048,
  })
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
    assert.equal('tempRange' in biome, false)
    assert.equal('humidityRange' in biome, false)
    assert.equal('heightMagnitude' in biome.terrainParams, false)
  }
})

test('terrain profile blending is normalized and independent of key insertion order', () => {
  const first = blendBiomeTerrainProfile({ plains: 0.75, badlands: 0.25 })
  const second = blendBiomeTerrainProfile({ badlands: 0.25, plains: 0.75 })

  assert.deepEqual(first, second)
  assert.deepEqual(first, {
    heightOffset: 0.5,
    roughness: 0.9,
  })
})

test('terrain profile rejects invalid weights and unknown biomes', () => {
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

test('height calculation applies one bounded blended profile before flooring', () => {
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
  const invalid = {
    BAD: {
      id: 'bad',
      climate: { temperature: 2, humidity: 0.5 },
      terrainParams: { heightOffset: 0, roughness: Number.NaN },
    },
  }

  assert.throws(() => validateBiomeDefinitions(invalid), RangeError)
  assert.throws(() => validateBiomeDefinitions({}), RangeError)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec node --test tests/unit/biome-terrain-profile.unit.js
```

Expected: FAIL because `BIOME_PARAMS` and `biome-terrain-profile.js` do not exist and the biome schema still uses ranges/magnitudes.

- [ ] **Step 3: Add approved static defaults and biome profiles**

Add to `src/js/config/chunk-config.js` after `TERRAIN_PARAMS`:

```javascript
export const BIOME_PARAMS = {
  regionSize: 128,
  regionJitter: 0.25,
  transitionWidth: 20,
  warpScale: 96,
  warpStrength: 12,
  temperatureScale: 384,
  humidityScale: 384,
  siteCacheLimit: 2048,
}
```

In `src/js/world/terrain/biome-config.js`, leave blocks, vegetation, and flora unchanged. Replace only climate and terrain fields with:

```javascript
// PLAINS
climate: { temperature: 0.50, humidity: 0.45 },
terrainParams: { heightOffset: 0, roughness: 0.75 },

// FOREST
climate: { temperature: 0.48, humidity: 0.78 },
terrainParams: { heightOffset: 0, roughness: 1.10 },

// BIRCH_FOREST
climate: { temperature: 0.25, humidity: 0.45 },
terrainParams: { heightOffset: 0, roughness: 0.95 },

// CHERRY_FOREST
climate: { temperature: 0.78, humidity: 0.72 },
terrainParams: { heightOffset: 0, roughness: 1.10 },

// DESERT
climate: { temperature: 0.88, humidity: 0.18 },
terrainParams: { heightOffset: 1, roughness: 1.15 },

// BADLANDS
climate: { temperature: 0.55, humidity: 0.10 },
terrainParams: { heightOffset: 2, roughness: 1.35 },

// FROZEN_OCEAN
climate: { temperature: 0.10, humidity: 0.80 },
terrainParams: { heightOffset: 0, roughness: 0.80 },
```

- [ ] **Step 4: Implement the pure terrain-profile module**

Create `src/js/world/terrain/biome-terrain-profile.js`:

```javascript
import { BIOMES, getBiomeConfig } from './biome-config.js'

export const MIN_BIOME_ROUGHNESS = 0.75
export const MAX_BIOME_ROUGHNESS = 1.35
const WEIGHT_EPSILON = 1e-9

function assertFinite(name, value) {
  if (!Number.isFinite(value))
    throw new TypeError(`${name} must be finite; received ${value}`)
}

export function validateBiomeDefinitions(biomes) {
  const definitions = Object.values(biomes)
  if (definitions.length === 0)
    throw new RangeError('At least one biome definition is required')

  const ids = new Set()
  for (const biome of definitions) {
    if (!biome?.id || ids.has(biome.id))
      throw new RangeError(`Biome IDs must be non-empty and unique: ${biome?.id}`)
    ids.add(biome.id)

    const temperature = biome.climate?.temperature
    const humidity = biome.climate?.humidity
    assertFinite(`${biome.id}.climate.temperature`, temperature)
    assertFinite(`${biome.id}.climate.humidity`, humidity)
    if (temperature < 0 || temperature > 1 || humidity < 0 || humidity > 1)
      throw new RangeError(`${biome.id} climate anchors must be in [0, 1]`)

    const heightOffset = biome.terrainParams?.heightOffset
    const roughness = biome.terrainParams?.roughness
    assertFinite(`${biome.id}.terrainParams.heightOffset`, heightOffset)
    assertFinite(`${biome.id}.terrainParams.roughness`, roughness)
  }
}

export function blendBiomeTerrainProfile(weights, biomes = BIOMES) {
  const entries = Object.entries(weights).sort(([first], [second]) =>
    first.localeCompare(second),
  )
  if (entries.length === 0)
    throw new RangeError('Biome weights must contain at least one entry')

  let totalWeight = 0
  let heightOffset = 0
  let roughness = 0

  for (const [biomeId, weight] of entries) {
    assertFinite(`Biome weight ${biomeId}`, weight)
    if (weight < 0)
      throw new RangeError(`Biome weight ${biomeId} cannot be negative`)

    const biome = biomes === BIOMES
      ? getBiomeConfig(biomeId)
      : Object.values(biomes).find(candidate => candidate.id === biomeId)
    if (!biome)
      throw new RangeError(`Unknown biome weight: ${biomeId}`)

    totalWeight += weight
    heightOffset += biome.terrainParams.heightOffset * weight
    const boundedRoughness = Math.min(
      MAX_BIOME_ROUGHNESS,
      Math.max(MIN_BIOME_ROUGHNESS, biome.terrainParams.roughness),
    )
    roughness += boundedRoughness * weight
  }

  if (Math.abs(totalWeight - 1) > WEIGHT_EPSILON)
    throw new RangeError(`Biome weights must sum to 1; received ${totalWeight}`)

  return { heightOffset, roughness }
}

export function calculateBiomeTerrainHeight({
  baseOffset,
  baseMagnitude,
  terrainNoise,
  weights,
  maxHeight,
  biomes = BIOMES,
}) {
  assertFinite('baseOffset', baseOffset)
  assertFinite('baseMagnitude', baseMagnitude)
  assertFinite('terrainNoise', terrainNoise)
  assertFinite('maxHeight', maxHeight)

  const { heightOffset, roughness } = blendBiomeTerrainProfile(weights, biomes)
  const continuousHeight = baseOffset
    + heightOffset
    + baseMagnitude * terrainNoise * roughness

  return Math.max(0, Math.min(Math.floor(continuousHeight), Math.floor(maxHeight)))
}
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
pnpm exec node --test tests/unit/biome-terrain-profile.unit.js
```

Expected: all tests PASS.

- [ ] **Step 6: Commit the schema and pure profile**

```bash
git add src/js/config/chunk-config.js src/js/world/terrain/biome-config.js src/js/world/terrain/biome-terrain-profile.js tests/unit/biome-terrain-profile.unit.js
git commit -m "refactor(biome): define climate anchors and terrain profiles"
```

---

### Task 2: Deterministic macro biome field

**Files:**

- Rewrite: `src/js/world/terrain/biome-generator.js:1-231`
- Create: `tests/unit/biome-generator.unit.js`

**Interfaces:**

- Consumes `BIOME_PARAMS`, `BIOMES`, `SimplexNoise`, `RNG`, and `validateBiomeDefinitions()`.
- Keeps:

```javascript
new BiomeGenerator(seed, options?)
generator.getBiomeAt(worldX, worldZ)
generator.generateBiomeMap(originX, originZ, chunkWidth)
generator.clearCache(originX, originZ, chunkWidth)
generator.clearAllCache()
generator.updateParams(params)
```

- Adds:

```javascript
generator.setSeed(seed): void
generator.getSitesInBounds(minX, minZ, maxX, maxZ): Array<{
  cellX: number,
  cellZ: number,
  x: number,
  z: number,
  temp: number,
  humidity: number,
  biome: string,
}>
generator.getCacheDiagnostics(): {
  biomeMaps: number,
  sites: number,
  siteLimit: number,
}
```

- Keeps public numeric fields for Tweakpane:

```javascript
regionSize
regionJitter
transitionWidth
warpScale
warpStrength
temperatureScale
humidityScale
siteCacheLimit
```

- [ ] **Step 1: Write failing determinism, weight, seam, and validation tests**

Create `tests/unit/biome-generator.unit.js`:

```javascript
import assert from 'node:assert/strict'
import test from 'node:test'

import { BIOME_PARAMS } from '../../src/js/config/chunk-config.js'
import BiomeGenerator from '../../src/js/world/terrain/biome-generator.js'

function assertNormalizedWeights(weights) {
  assert.ok(weights)
  const values = Object.values(weights)
  assert.ok(values.length >= 1)
  values.forEach((weight) => {
    assert.ok(Number.isFinite(weight))
    assert.ok(weight >= 0)
  })
  const total = values.reduce((sum, weight) => sum + weight, 0)
  assert.ok(Math.abs(total - 1) < 1e-9, `weight sum was ${total}`)
}

test('same seed and coordinates are deterministic across instances and cache clears', () => {
  const first = new BiomeGenerator(1337)
  const second = new BiomeGenerator(1337)
  const coordinates = [
    [0, 0],
    [63, 63],
    [64, 64],
    [-1, -1],
    [-129, 257],
    [12345, -67890],
  ]

  const expected = coordinates.map(([x, z]) => first.getBiomeAt(x, z))
  first.clearAllCache()

  assert.deepEqual(
    coordinates.map(([x, z]) => first.getBiomeAt(x, z)),
    expected,
  )
  assert.deepEqual(
    coordinates.map(([x, z]) => second.getBiomeAt(x, z)),
    expected,
  )
})

test('different seeds change the macro field', () => {
  const first = new BiomeGenerator(1337)
  const second = new BiomeGenerator(7331)
  const firstSample = []
  const secondSample = []

  for (let z = -256; z <= 256; z += 32) {
    for (let x = -256; x <= 256; x += 32) {
      firstSample.push(first.getBiomeAt(x, z).biome)
      secondSample.push(second.getBiomeAt(x, z).biome)
    }
  }

  assert.notDeepEqual(secondSample, firstSample)
})

test('generator data always has finite climate and normalized weights', () => {
  const generator = new BiomeGenerator(1337)
  for (let z = -128; z <= 128; z += 7) {
    for (let x = -128; x <= 128; x += 7) {
      const data = generator.getBiomeAt(x, z)
      assert.ok(Number.isFinite(data.temp))
      assert.ok(Number.isFinite(data.humidity))
      assert.ok(data.temp >= 0 && data.temp <= 1)
      assert.ok(data.humidity >= 0 && data.humidity <= 1)
      assertNormalizedWeights(data.weights)
      const dominant = Object.entries(data.weights)
        .sort(([firstId, firstWeight], [secondId, secondWeight]) =>
          secondWeight - firstWeight || firstId.localeCompare(secondId),
        )[0][0]
      assert.equal(data.biome, dominant)
    }
  }
})

test('chunk maps match point queries at positive and negative origins', () => {
  const generator = new BiomeGenerator(1337)
  for (const [originX, originZ] of [[0, 0], [-64, -64], [128, -192]]) {
    const map = generator.generateBiomeMap(originX, originZ, 64)
    for (const [x, z] of [[0, 0], [63, 63], [12, 51], [51, 12]]) {
      assert.deepEqual(
        map[x][z],
        generator.getBiomeAt(originX + x, originZ + z),
      )
    }
  }
})

test('adjacent chunk seam columns equal direct world-coordinate queries', () => {
  const generator = new BiomeGenerator(1337)
  const left = generator.generateBiomeMap(-64, 0, 64)
  const right = generator.generateBiomeMap(0, 0, 64)

  for (let z = 0; z < 64; z++) {
    assert.deepEqual(left[63][z], generator.getBiomeAt(-1, z))
    assert.deepEqual(right[0][z], generator.getBiomeAt(0, z))
  }
})

test('map cache key includes chunk width and clearCache targets one map', () => {
  const generator = new BiomeGenerator(1337)
  const small = generator.generateBiomeMap(0, 0, 16)
  const large = generator.generateBiomeMap(0, 0, 64)

  assert.equal(small.length, 16)
  assert.equal(large.length, 64)
  assert.equal(generator.getCacheDiagnostics().biomeMaps, 2)

  generator.clearCache(0, 0, 16)
  assert.equal(generator.getCacheDiagnostics().biomeMaps, 1)
})

test('site cache remains bounded and clearAllCache clears both cache types', () => {
  const generator = new BiomeGenerator(1337, { siteCacheLimit: 32 })
  for (let z = -4096; z <= 4096; z += 128) {
    for (let x = -4096; x <= 4096; x += 128)
      generator.getBiomeAt(x, z)
  }

  assert.equal(generator.getCacheDiagnostics().siteLimit, 32)
  assert.ok(generator.getCacheDiagnostics().sites <= 32)

  generator.generateBiomeMap(0, 0, 16)
  generator.clearAllCache()
  assert.deepEqual(generator.getCacheDiagnostics(), {
    biomeMaps: 0,
    sites: 0,
    siteLimit: 32,
  })
})

test('setSeed rebuilds noise state instead of mutating a passive field', () => {
  const generator = new BiomeGenerator(1337)
  const before = generator.generateBiomeMap(0, 0, 32)
  generator.setSeed(7331)
  const after = generator.generateBiomeMap(0, 0, 32)

  assert.notDeepEqual(after, before)
  generator.setSeed(1337)
  assert.deepEqual(generator.generateBiomeMap(0, 0, 32), before)
})

test('updateParams validates values, clamps approved bounds, and invalidates caches', () => {
  const generator = new BiomeGenerator(1337)
  generator.generateBiomeMap(0, 0, 16)

  generator.updateParams({
    regionJitter: 0.5,
    transitionWidth: 200,
    siteCacheLimit: 40.9,
  })

  assert.equal(generator.regionJitter, 0.25)
  assert.equal(generator.transitionWidth, 32)
  assert.equal(generator.siteCacheLimit, 40)
  assert.equal(generator.getCacheDiagnostics().biomeMaps, 0)

  assert.throws(() => generator.updateParams({ regionSize: 0 }), RangeError)
  assert.throws(() => generator.updateParams({ warpScale: Number.NaN }), TypeError)
  assert.throws(() => generator.getBiomeAt(Number.NaN, 0), TypeError)
  assert.throws(() => generator.generateBiomeMap(0, 0, 0), RangeError)
})

test('debug site queries return unique deterministic sites in bounds', () => {
  const generator = new BiomeGenerator(1337, BIOME_PARAMS)
  const sites = generator.getSitesInBounds(-256, -256, 256, 256)
  const keys = sites.map(site => `${site.cellX},${site.cellZ}`)

  assert.equal(new Set(keys).size, keys.length)
  assert.deepEqual(sites, new BiomeGenerator(1337).getSitesInBounds(-256, -256, 256, 256))
  sites.forEach((site) => {
    assert.ok(Number.isFinite(site.x))
    assert.ok(Number.isFinite(site.z))
    assert.ok(Number.isFinite(site.temp))
    assert.ok(Number.isFinite(site.humidity))
    assert.ok(site.biome)
  })
})

function findInteriorBiomeComponents(generator, originX, originZ, size) {
  const biomeIds = new Array(size * size)
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++)
      biomeIds[z * size + x] = generator.getBiomeAt(originX + x, originZ + z).biome
  }

  const seen = new Uint8Array(biomeIds.length)
  const components = []
  for (let start = 0; start < biomeIds.length; start++) {
    if (seen[start])
      continue

    const biome = biomeIds[start]
    const queue = [start]
    seen[start] = 1
    let head = 0
    let area = 0
    let touchesBorder = false

    while (head < queue.length) {
      const index = queue[head++]
      const x = index % size
      const z = Math.floor(index / size)
      area++
      touchesBorder ||= x === 0 || z === 0 || x === size - 1 || z === size - 1

      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < size ? index + 1 : -1,
        z > 0 ? index - size : -1,
        z + 1 < size ? index + size : -1,
      ]
      for (const next of neighbors) {
        if (next >= 0 && !seen[next] && biomeIds[next] === biome) {
          seen[next] = 1
          queue.push(next)
        }
      }
    }

    if (!touchesBorder)
      components.push({ biome, area })
  }
  return components
}

test('macro field has no interior biome component smaller than 32 columns', () => {
  for (const seed of [42, 1337, 987654]) {
    const generator = new BiomeGenerator(seed)
    const components = findInteriorBiomeComponents(generator, -256, -256, 512)
    const tiny = components.filter(component => component.area < 32)
    assert.deepEqual(tiny, [], `seed ${seed} tiny components: ${JSON.stringify(tiny)}`)
  }
})

test('jittered sites preserve the approved minimum separation', () => {
  const generator = new BiomeGenerator(1337)
  const sites = generator.getSitesInBounds(-1024, -1024, 1024, 1024)
  let minimumDistance = Number.POSITIVE_INFINITY

  for (let firstIndex = 0; firstIndex < sites.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < sites.length; secondIndex++) {
      const first = sites[firstIndex]
      const second = sites[secondIndex]
      if (
        Math.abs(first.cellX - second.cellX) > 1
        || Math.abs(first.cellZ - second.cellZ) > 1
      ) {
        continue
      }
      minimumDistance = Math.min(
        minimumDistance,
        Math.hypot(first.x - second.x, first.z - second.z),
      )
    }
  }

  assert.ok(minimumDistance >= 64, `minimum site distance was ${minimumDistance}`)
})
```

- [ ] **Step 2: Run generator tests and verify RED**

Run:

```bash
pnpm exec node --test tests/unit/biome-generator.unit.js
```

Expected: FAIL because the old generator returns nullable weights, has no macro-site/cache diagnostic APIs, and does not rebuild noise state on seed change.

- [ ] **Step 3: Replace the old generator state and validation**

Rewrite the constructor and parameter lifecycle in
`src/js/world/terrain/biome-generator.js` around this exact structure:

```javascript
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js'
import { BIOME_PARAMS } from '../../config/chunk-config.js'
import { RNG } from '../../tools/rng.js'
import { BIOMES } from './biome-config.js'
import { validateBiomeDefinitions } from './biome-terrain-profile.js'

const UINT32_RANGE = 0x100000000
const PARAM_NAMES = Object.keys(BIOME_PARAMS)

function assertFinite(name, value) {
  if (!Number.isFinite(value))
    throw new TypeError(`${name} must be finite; received ${value}`)
}

function assertPositive(name, value) {
  assertFinite(name, value)
  if (value <= 0)
    throw new RangeError(`${name} must be greater than zero; received ${value}`)
}

function hashCoordinate(seed, cellX, cellZ, salt) {
  let hash = Math.imul(Math.trunc(seed), 0x9E3779B1)
  hash ^= Math.imul(cellX, 0x85EBCA77)
  hash ^= Math.imul(cellZ, 0xC2B2AE3D)
  hash ^= salt
  hash = Math.imul(hash ^ (hash >>> 16), 0x7FEB352D)
  hash = Math.imul(hash ^ (hash >>> 15), 0x846CA68B)
  return ((hash ^ (hash >>> 16)) >>> 0) / UINT32_RANGE
}

export default class BiomeGenerator {
  constructor(seed, options = {}) {
    validateBiomeDefinitions(BIOMES)
    this.biomeCache = new Map()
    this.siteCache = new Map()
    this._applyParams({ ...BIOME_PARAMS, ...options })
    this.setSeed(seed)
  }

  setSeed(seed) {
    assertFinite('seed', seed)
    this.seed = Math.trunc(seed)
    this.temperatureNoise = new SimplexNoise(new RNG(this.seed + 1000))
    this.humidityNoise = new SimplexNoise(new RNG(this.seed + 2000))
    this.warpNoise = new SimplexNoise(new RNG(this.seed + 3000))
    this.clearAllCache()
  }

  updateParams(params = {}) {
    const unknown = Object.keys(params).filter(name => !PARAM_NAMES.includes(name))
    if (unknown.length > 0)
      throw new RangeError(`Unknown biome parameters: ${unknown.join(', ')}`)
    this._applyParams({ ...this._snapshotParams(), ...params })
    this.clearAllCache()
  }

  _snapshotParams() {
    return Object.fromEntries(PARAM_NAMES.map(name => [name, this[name]]))
  }

  _applyParams(params) {
    assertPositive('regionSize', params.regionSize)
    assertFinite('regionJitter', params.regionJitter)
    assertPositive('transitionWidth', params.transitionWidth)
    assertPositive('warpScale', params.warpScale)
    assertFinite('warpStrength', params.warpStrength)
    if (params.warpStrength < 0)
      throw new RangeError('warpStrength cannot be negative')
    assertPositive('temperatureScale', params.temperatureScale)
    assertPositive('humidityScale', params.humidityScale)
    assertPositive('siteCacheLimit', params.siteCacheLimit)

    this.regionSize = params.regionSize
    this.regionJitter = Math.min(0.25, Math.max(0, params.regionJitter))
    const minimumSiteSeparation = this.regionSize * (1 - 2 * this.regionJitter)
    this.transitionWidth = Math.min(params.transitionWidth, minimumSiteSeparation / 2)
    this.warpScale = params.warpScale
    this.warpStrength = params.warpStrength
    this.temperatureScale = params.temperatureScale
    this.humidityScale = params.humidityScale
    this.siteCacheLimit = Math.max(1, Math.floor(params.siteCacheLimit))
  }
}
```

- [ ] **Step 4: Implement macro sites, climate labeling, warp, and continuous weights**

Add these methods to the same class. Keep the candidate loop order fixed and
sort output weight keys so deep equality is independent of `Map` insertion
order:

```javascript
  getBiomeAt(worldX, worldZ) {
    this._validateCoordinate('worldX', worldX)
    this._validateCoordinate('worldZ', worldZ)
    return this._sampleBiomeAt(
      worldX,
      worldZ,
      (cellX, cellZ) => this._getSite(cellX, cellZ),
    )
  }

  _sampleBiomeAt(worldX, worldZ, siteLookup) {
    const warped = this._warpCoordinate(worldX, worldZ)
    const centerCellX = Math.floor(warped.x / this.regionSize)
    const centerCellZ = Math.floor(warped.z / this.regionSize)
    const candidates = []

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const site = siteLookup(centerCellX + dx, centerCellZ + dz)
        candidates.push({
          site,
          distance: Math.hypot(warped.x - site.x, warped.z - site.z),
        })
      }
    }

    candidates.sort((first, second) =>
      first.distance - second.distance
      || first.site.cellX - second.site.cellX
      || first.site.cellZ - second.site.cellZ,
    )

    const nearestDistance = candidates[0].distance
    const biomeWeights = new Map()
    let weightedTemp = 0
    let weightedHumidity = 0
    let totalWeight = 0

    for (const { site, distance } of candidates) {
      const proximity = Math.max(
        0,
        1 - (distance - nearestDistance) / this.transitionWidth,
      )
      const weight = proximity * proximity
      if (weight === 0)
        continue
      biomeWeights.set(site.biome, (biomeWeights.get(site.biome) ?? 0) + weight)
      weightedTemp += site.temp * weight
      weightedHumidity += site.humidity * weight
      totalWeight += weight
    }

    const weights = Object.fromEntries(
      [...biomeWeights.entries()]
        .map(([biomeId, weight]) => [biomeId, weight / totalWeight])
        .sort(([firstId], [secondId]) => firstId.localeCompare(secondId)),
    )
    const biome = Object.entries(weights)
      .sort(([firstId, firstWeight], [secondId, secondWeight]) =>
        secondWeight - firstWeight || firstId.localeCompare(secondId),
      )[0][0]

    return {
      biome,
      temp: weightedTemp / totalWeight,
      humidity: weightedHumidity / totalWeight,
      weights,
    }
  }

  _warpCoordinate(worldX, worldZ) {
    const warpX = this.warpNoise.noise(
      worldX / this.warpScale,
      worldZ / this.warpScale,
    )
    const warpZ = this.warpNoise.noise(
      (worldX + 10000) / this.warpScale,
      (worldZ - 10000) / this.warpScale,
    )
    return {
      x: worldX + warpX * this.warpStrength,
      z: worldZ + warpZ * this.warpStrength,
    }
  }

  _getSite(cellX, cellZ) {
    const key = `${cellX},${cellZ}`
    const cached = this.siteCache.get(key)
    if (cached) {
      this.siteCache.delete(key)
      this.siteCache.set(key, cached)
      return cached
    }

    const jitterX = (hashCoordinate(this.seed, cellX, cellZ, 0xA341316C) * 2 - 1)
      * this.regionJitter
    const jitterZ = (hashCoordinate(this.seed, cellX, cellZ, 0xC8013EA4) * 2 - 1)
      * this.regionJitter
    const x = (cellX + 0.5 + jitterX) * this.regionSize
    const z = (cellZ + 0.5 + jitterZ) * this.regionSize
    const temp = this.temperatureNoise.noise(
      x / this.temperatureScale,
      z / this.temperatureScale,
    ) * 0.5 + 0.5
    const humidity = this.humidityNoise.noise(
      x / this.humidityScale,
      z / this.humidityScale,
    ) * 0.5 + 0.5
    const biome = this._classifyClimate(temp, humidity)
    const site = { cellX, cellZ, x, z, temp, humidity, biome }

    this.siteCache.set(key, site)
    while (this.siteCache.size > this.siteCacheLimit) {
      const oldestKey = this.siteCache.keys().next().value
      this.siteCache.delete(oldestKey)
    }
    return site
  }

  _classifyClimate(temp, humidity) {
    return Object.values(BIOMES)
      .map((biome) => {
        const tempDistance = temp - biome.climate.temperature
        const humidityDistance = humidity - biome.climate.humidity
        return {
          biomeId: biome.id,
          distance: Math.hypot(tempDistance, humidityDistance),
        }
      })
      .sort((first, second) =>
        first.distance - second.distance
        || first.biomeId.localeCompare(second.biomeId),
      )[0].biomeId
  }

  _validateCoordinate(name, value) {
    assertFinite(name, value)
  }
```

- [ ] **Step 5: Implement map caching, debug sites, and cache diagnostics**

Add:

```javascript
  generateBiomeMap(originX, originZ, chunkWidth) {
    this._validateCoordinate('originX', originX)
    this._validateCoordinate('originZ', originZ)
    assertPositive('chunkWidth', chunkWidth)
    if (!Number.isInteger(chunkWidth))
      throw new RangeError(`chunkWidth must be an integer; received ${chunkWidth}`)

    const cacheKey = `${originX},${originZ},${chunkWidth}`
    const cached = this.biomeCache.get(cacheKey)
    if (cached)
      return cached

    const localSites = new Map()
    const siteLookup = (cellX, cellZ) => {
      const key = `${cellX},${cellZ}`
      if (!localSites.has(key))
        localSites.set(key, this._getSite(cellX, cellZ))
      return localSites.get(key)
    }
    const biomeMap = Array.from({ length: chunkWidth }, () =>
      Array(chunkWidth),
    )
    for (let x = 0; x < chunkWidth; x++) {
      for (let z = 0; z < chunkWidth; z++) {
        biomeMap[x][z] = this._sampleBiomeAt(
          originX + x,
          originZ + z,
          siteLookup,
        )
      }
    }
    this.biomeCache.set(cacheKey, biomeMap)
    return biomeMap
  }

  getSitesInBounds(minX, minZ, maxX, maxZ) {
    const bounds = [
      ['minX', minX],
      ['minZ', minZ],
      ['maxX', maxX],
      ['maxZ', maxZ],
    ]
    bounds.forEach(([name, value]) => this._validateCoordinate(name, value))
    if (maxX < minX || maxZ < minZ)
      throw new RangeError('Site bounds must have max >= min')

    const minCellX = Math.floor(minX / this.regionSize) - 1
    const maxCellX = Math.floor(maxX / this.regionSize) + 1
    const minCellZ = Math.floor(minZ / this.regionSize) - 1
    const maxCellZ = Math.floor(maxZ / this.regionSize) + 1
    const sites = []
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
        const site = this._getSite(cellX, cellZ)
        if (
          site.x >= minX
          && site.x <= maxX
          && site.z >= minZ
          && site.z <= maxZ
        ) {
          sites.push({ ...site })
        }
      }
    }
    return sites
  }

  clearCache(originX, originZ, chunkWidth) {
    this.biomeCache.delete(`${originX},${originZ},${chunkWidth}`)
  }

  clearAllCache() {
    this.biomeCache.clear()
    this.siteCache.clear()
  }

  getCacheDiagnostics() {
    return {
      biomeMaps: this.biomeCache.size,
      sites: this.siteCache.size,
      siteLimit: this.siteCacheLimit,
    }
  }
```

- [ ] **Step 6: Run generator and profile tests and verify GREEN**

Run:

```bash
pnpm exec node --test tests/unit/biome-generator.unit.js tests/unit/biome-terrain-profile.unit.js
```

Expected: all tests PASS.

- [ ] **Step 7: Commit the macro field**

```bash
git add src/js/world/terrain/biome-generator.js tests/unit/biome-generator.unit.js
git commit -m "feat(biome): generate deterministic macro regions"
```

---

### Task 3: Benchmark harness and performance acceptance

**Files:**

- Create: `tests/benchmarks/biome-generator.bench.js`

**Interfaces:**

- Consumes `BiomeGenerator.getBiomeAt()` only; it does not duplicate production classification.
- Benchmark prints JSON:

```javascript
{
  workload: '3x3 chunks, 64x64 columns each',
  runs: 30,
  medianMs: number,
  p95Ms: number,
  minMs: number,
  maxMs: number,
}
```

- [ ] **Step 1: Add the repeatable benchmark script**

Create `tests/benchmarks/biome-generator.bench.js`:

```javascript
import { performance } from 'node:perf_hooks'

import BiomeGenerator from '../../src/js/world/terrain/biome-generator.js'

const measuredRuns = 30
const warmupRuns = 5
const samples = []

for (let iteration = 0; iteration < warmupRuns + measuredRuns; iteration++) {
  const generator = new BiomeGenerator(1337 + iteration)
  const start = performance.now()
  for (let chunkZ = -1; chunkZ <= 1; chunkZ++) {
    for (let chunkX = -1; chunkX <= 1; chunkX++) {
      generator.generateBiomeMap(
        chunkX * 64,
        chunkZ * 64,
        64,
      )
    }
  }
  const elapsed = performance.now() - start
  if (iteration >= warmupRuns)
    samples.push(elapsed)
}

samples.sort((first, second) => first - second)
const percentile = fraction =>
  samples[Math.floor((samples.length - 1) * fraction)]

console.log(JSON.stringify({
  workload: '3x3 chunks, 64x64 columns each',
  runs: samples.length,
  medianMs: Number(percentile(0.5).toFixed(2)),
  p95Ms: Number(percentile(0.95).toFixed(2)),
  minMs: Number(samples[0].toFixed(2)),
  maxMs: Number(samples.at(-1).toFixed(2)),
}, null, 2))
```

- [ ] **Step 2: Run invariant tests and capture the first new benchmark**

Run:

```bash
pnpm exec node --test tests/unit/biome-generator.unit.js
pnpm exec node tests/benchmarks/biome-generator.bench.js
```

Expected:

- Unit tests PASS with no interior component under 32 columns.
- Benchmark emits 30 measured runs.
- Median is at or below `11.06 ms`.
- P95 is at or below `14.18 ms` (`12.89 ms + 10%`).

If timing fails, profile the biome phase before continuing. Do not reduce
region quality or remove tests to meet the budget. The first optimization is a
per-`generateBiomeMap()` local map of site key to site object so repeated
columns do not refresh the global LRU entry.

- [ ] **Step 3: Commit the benchmark harness**

```bash
git add tests/benchmarks/biome-generator.bench.js
git commit -m "test(biome): add generation performance benchmark"
```

---

### Task 4: Integrate blended profiles into TerrainGenerator

**Files:**

- Modify: `src/js/world/terrain/terrain-generator.js:13-14,162-278,375-457`
- Create: `tests/unit/terrain-biome-integration.unit.js`

**Interfaces:**

- Consumes:

```javascript
calculateBiomeTerrainHeight({
  baseOffset,
  baseMagnitude,
  terrainNoise,
  weights,
  maxHeight,
}): number
```

- `generatedBiomeMap[x][z]` remains converted into
  `this.biomeDataMap[z][x]`.
- Panel mode produces:

```javascript
{
  biome: forcedBiome,
  temp: 0.5,
  humidity: 0.5,
  weights: { [forcedBiome]: 1 },
}
```

- `_fillColumnLayers()` ignores transition weights for categorical block
  selection and uses `biomeData.biome`.
- Removes `_blendBiomeParam()` and `_selectBiomeBlockWithWeights()`.

- [ ] **Step 1: Write failing terrain integration tests**

Create `tests/unit/terrain-biome-integration.unit.js`:

```javascript
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
import TerrainGenerator from '../../src/js/world/terrain/terrain-generator.js'

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
  const filled = []
  const context = {
    container: {
      getSize: () => ({ width: 2, height: 32 }),
    },
    params: {
      biomeSource: 'generator',
      terrain: {
        scale: 168,
        magnitude: 6,
        offset: 8,
        fbm: { octaves: 5, gain: 0.5, lacunarity: 2 },
      },
    },
    origin: { x: 0, z: 0 },
    biomeGenerator: {
      generateBiomeMap: () => source,
    },
    _fillColumnLayers: (x, z, height, data) => {
      filled.push({ x, z, height, biome: data.biome })
    },
  }
  const simplex = new SimplexNoise(new RNG(1337))

  TerrainGenerator.prototype.generateTerrain.call(context, simplex)

  assert.deepEqual(context.biomeMap, [
    ['plains', 'desert'],
    ['forest', 'badlands'],
  ])
  assert.deepEqual(filled.map(item => item.biome), [
    'plains',
    'desert',
    'forest',
    'badlands',
  ])
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
  const writes = []
  const context = {
    biomeMap: [['desert']],
    params: {
      soilDepth: 3,
      water: { waterOffset: 0, shoreDepth: 0 },
    },
    container: {
      setBlockId: (x, y, z, id) => writes.push({ x, y, z, id }),
    },
    _isRockExposed: () => false,
    _selectBiomeBlock: TerrainGenerator.prototype._selectBiomeBlock,
  }
  const originalRandom = Math.random
  Math.random = () => {
    throw new Error('Math.random must not select biome surface blocks')
  }
  try {
    TerrainGenerator.prototype._fillColumnLayers.call(context, 0, 0, 8, {
      biome: 'desert',
      weights: { plains: 0.49, desert: 0.51 },
    })
  }
  finally {
    Math.random = originalRandom
  }

  assert.equal(writes.find(write => write.y === 8).id, BLOCK_IDS.SAND)
  assert.equal(writes.find(write => write.y === 7).id, BLOCK_IDS.SAND)
})
```

- [ ] **Step 2: Run integration tests and verify RED**

Run:

```bash
pnpm exec node --test tests/unit/terrain-biome-integration.unit.js
```

Expected: FAIL because `TerrainGenerator` still requests
`heightMagnitude` and `_fillColumnLayers()` calls the random weighted block
selector.

- [ ] **Step 3: Replace biome height multiplier logic**

Add the import:

```javascript
import { calculateBiomeTerrainHeight } from './biome-terrain-profile.js'
```

In `generateTerrain()`, replace the biome config lookup and
`heightOffset`/`heightMagnitude` branch with:

```javascript
        if (!biomeData.weights)
          biomeData.weights = { [biomeId]: 1 }

        const wx = this.origin.x + x
        const wz = this.origin.z + z
        const terrainNoise = fbm2D(simplex, wx, wz, {
          octaves: this.params.terrain.fbm.octaves,
          gain: this.params.terrain.fbm.gain,
          lacunarity: this.params.terrain.fbm.lacunarity,
          scale,
        })
        const columnHeight = calculateBiomeTerrainHeight({
          baseOffset,
          baseMagnitude,
          terrainNoise,
          weights: biomeData.weights,
          maxHeight: height - 1,
        })

        heightRow.push(columnHeight)
```

Change the panel fallback from `weights: null` to:

```javascript
biomeData = {
  biome: biomeId,
  temp: 0.5,
  humidity: 0.5,
  weights: { [biomeId]: 1 },
}
```

Delete `_blendBiomeParam()`. Do not change the fBM options or coordinate
sampling.

- [ ] **Step 4: Make surface blocks categorical**

In `_fillColumnLayers()`, replace the weighted branch with:

```javascript
    let surfaceBlockId
    let subsurfaceBlockId
    if (isUnderwater || isShore) {
      surfaceBlockId = blocks.sand.id
      subsurfaceBlockId = blocks.sand.id
    }
    else {
      surfaceBlockId = this._selectBiomeBlock(biomeId, 'surface')
      subsurfaceBlockId = this._selectBiomeBlock(biomeId, 'subsurface')
    }
```

Delete `_selectBiomeBlockWithWeights()` completely. Leave the existing deep
block, shore, exposed-rock, tree, and flora logic unchanged; they already read
the dominant `this.biomeMap[z][x]`.

- [ ] **Step 5: Run all terrain/biome unit tests and verify GREEN**

Run:

```bash
pnpm exec node --test tests/unit/biome-terrain-profile.unit.js tests/unit/biome-generator.unit.js tests/unit/terrain-biome-integration.unit.js
```

Expected: all tests PASS.

- [ ] **Step 6: Commit terrain integration**

```bash
git add src/js/world/terrain/terrain-generator.js tests/unit/terrain-biome-integration.unit.js
git commit -m "fix(terrain): blend biome profiles without hard edges"
```

---

### Task 5: Shared generator lifecycle and runtime controls

**Files:**

- Modify: `src/js/world/terrain/chunk-manager.js:5-11,41-64,417-446,1324-1364`
- Create: `tests/unit/chunk-biome-lifecycle.unit.js`

**Interfaces:**

- Consumes `BIOME_PARAMS` from `chunk-config.js`.
- `ChunkManager` constructs:

```javascript
this.biomeGenerator = new BiomeGenerator(this.seed, BIOME_PARAMS)
```

- A seed change calls `this.biomeGenerator.setSeed(seed)` exactly once.
- A same-seed regeneration calls `clearAllCache()` without rebuilding noises.
- Runtime debug bindings mutate the new direct generator fields through
  `updateParams({ [name]: value })` and regenerate generator-mode chunks.

- [ ] **Step 1: Write the failing seed lifecycle test**

Create `tests/unit/chunk-biome-lifecycle.unit.js`:

```javascript
import assert from 'node:assert/strict'
import test from 'node:test'

import ChunkManager from '../../src/js/world/terrain/chunk-manager.js'

function makeManagerHarness() {
  const calls = []
  const resolved = Promise.resolve()
  resolved.dataReady = Promise.resolve(null)
  return {
    calls,
    manager: {
      _destroyed: false,
      _invalidateTransitionState: () => {},
      _releaseAllRenderSlots: () => {},
      chunks: new Map(),
      biomeGenerator: {
        clearAllCache: () => calls.push(['clear']),
        setSeed: seed => calls.push(['setSeed', seed]),
      },
      seed: 1337,
      chunkWidth: 64,
      biomeParams: { biomeSource: 'generator', forcedBiome: 'plains' },
      applyWorldGenParams: () => {},
      persistence: { clearAll: () => {} },
      updateStreaming: () => resolved,
      _lastPlayerChunkX: 0,
      _lastPlayerChunkZ: 0,
    },
  }
}

test('regenerateAll reseeds the shared generator when seed changes', async () => {
  const { manager, calls } = makeManagerHarness()
  await ChunkManager.prototype.regenerateAll.call(manager, {
    seed: 7331,
    forceSyncCenterChunk: false,
    clearPersistence: false,
  })

  assert.equal(manager.seed, 7331)
  assert.deepEqual(calls, [['setSeed', 7331]])
})

test('regenerateAll only clears biome caches when seed is unchanged', async () => {
  const { manager, calls } = makeManagerHarness()
  await ChunkManager.prototype.regenerateAll.call(manager, {
    forceSyncCenterChunk: false,
    clearPersistence: false,
  })

  assert.deepEqual(calls, [['clear']])
})
```

- [ ] **Step 2: Run lifecycle test and verify RED**

Run:

```bash
pnpm exec node --test tests/unit/chunk-biome-lifecycle.unit.js
```

Expected: FAIL because current `regenerateAll()` clears first and then mutates
`this.biomeGenerator.seed` without rebuilding noise instances.

- [ ] **Step 3: Wire static params and correct reseeding**

Add `BIOME_PARAMS` to the existing chunk-config import and change construction:

```javascript
import {
  BIOME_PARAMS,
  CHUNK_BASIC_CONFIG,
  RENDER_PARAMS,
  TERRAIN_PARAMS,
  TREE_PARAMS,
  WATER_PARAMS,
} from '../../config/chunk-config.js'
```

```javascript
this.biomeGenerator = new BiomeGenerator(this.seed, BIOME_PARAMS)
```

Replace lines 437-443 of `regenerateAll()` with:

```javascript
    if (seed !== undefined) {
      this.seed = seed
      this.biomeGenerator.setSeed(seed)
    }
    else {
      this.biomeGenerator.clearAllCache()
    }
```

Do not recreate `ChunkManager`, render slots, or the generator object.

- [ ] **Step 4: Replace obsolete generator debug bindings**

Replace the old `tempScale`, `humidityScale`, and `transitionThreshold`
bindings with a small helper and these fields:

```javascript
    const regenerateForBiomeParam = (name, value) => {
      if (this.biomeParams.biomeSource !== 'generator')
        return
      this.biomeGenerator.updateParams({ [name]: value })
      this._regenerateAllChunks()
    }

    const biomeGeneratorBindings = [
      ['regionSize', '生态区域大小', 64, 256, 16],
      ['transitionWidth', '过渡宽度', 4, 48, 1],
      ['warpStrength', '边界扭曲', 0, 32, 1],
      ['temperatureScale', '温度尺度', 128, 768, 16],
      ['humidityScale', '湿度尺度', 128, 768, 16],
    ]

    biomeGeneratorBindings.forEach(([name, label, min, max, step]) => {
      biomeGenFolder.addBinding(this.biomeGenerator, name, {
        label,
        min,
        max,
        step,
      }).on('change', ({ value }) => {
        regenerateForBiomeParam(name, value)
      })
    })
```

Do not bind `siteCacheLimit` or `regionJitter` in Tweakpane; they are structural
safety parameters, not visual tuning controls.

- [ ] **Step 5: Run lifecycle and all biome tests**

Run:

```bash
pnpm exec node --test tests/unit/chunk-biome-lifecycle.unit.js tests/unit/biome-terrain-profile.unit.js tests/unit/biome-generator.unit.js tests/unit/terrain-biome-integration.unit.js
```

Expected: all tests PASS.

- [ ] **Step 6: Commit lifecycle integration**

```bash
git add src/js/world/terrain/chunk-manager.js tests/unit/chunk-biome-lifecycle.unit.js
git commit -m "fix(biome): reseed shared generator correctly"
```

---

### Task 6: Production-backed biome debug visualization

**Files:**

- Modify: `src/debug/biome-map.js:28-354`
- Modify: `biome-debug.html:215-268`
- Create: `tests/biome-debug.e2e.test.js`

**Interfaces:**

- Display modes:

```text
biome | temperature | humidity | transition
```

- Overlay controls:

```text
showSites | showChunks
```

- Debug generator options use the same names as `BIOME_PARAMS`.
- Temperature and humidity render from `getBiomeAt()`, not private generator
  methods.
- Transition intensity is `Math.min(1, (1 - maxWeight) * 2)`.

- [ ] **Step 1: Write the failing Playwright debug-page test**

Create `tests/biome-debug.e2e.test.js`:

```javascript
import { expect, test } from '@playwright/test'

test('biome debug map exposes macro controls and production display modes', async ({ page }) => {
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error')
      consoleErrors.push(message.text())
  })

  await page.goto('/biome-debug.html')
  await expect(page.locator('#map-canvas')).toBeVisible()
  await expect(page.locator('#ctrl-region-size')).toHaveValue('128')
  await expect(page.locator('#ctrl-transition-width')).toHaveValue('20')
  await expect(page.locator('#ctrl-warp-strength')).toHaveValue('12')
  await expect(page.locator('[data-mode="transition"]')).toBeVisible()
  await expect(page.locator('#ctrl-show-sites')).toBeChecked()
  await expect(page.locator('#ctrl-show-chunks')).toBeChecked()

  await page.locator('[data-mode="transition"]').click()
  await expect(page.locator('[data-mode="transition"]')).toHaveClass(/active/)

  await page.locator('#ctrl-region-size').evaluate((element) => {
    element.value = '160'
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await expect(page.locator('#val-region-size')).toHaveText('160')

  await page.waitForTimeout(250)
  expect(consoleErrors).toEqual([])
})
```

- [ ] **Step 2: Run the focused browser test and verify RED**

Run:

```bash
pnpm exec playwright test tests/biome-debug.e2e.test.js --project=chromium
```

Expected: FAIL because the macro controls, transition mode, and overlay
checkboxes do not exist.

- [ ] **Step 3: Replace obsolete HTML controls**

In `biome-debug.html`, keep the seed, legend, canvas, and navigation hints.
Replace the noise-parameter section with controls using these exact IDs and
defaults:

```html
<div class="panel-section">
  <h3>Macro Biome Parameters</h3>
  <div class="control-row">
    <label>Region Size</label>
    <input type="range" id="ctrl-region-size" min="64" max="256" step="16" value="128" />
    <span class="value-display" id="val-region-size">128</span>
  </div>
  <div class="control-row">
    <label>Transition Width</label>
    <input type="range" id="ctrl-transition-width" min="4" max="48" value="20" />
    <span class="value-display" id="val-transition-width">20</span>
  </div>
  <div class="control-row">
    <label>Warp Strength</label>
    <input type="range" id="ctrl-warp-strength" min="0" max="32" value="12" />
    <span class="value-display" id="val-warp-strength">12</span>
  </div>
  <div class="control-row">
    <label>Temperature Scale</label>
    <input type="range" id="ctrl-temp-scale" min="128" max="768" step="16" value="384" />
    <span class="value-display" id="val-temp-scale">384</span>
  </div>
  <div class="control-row">
    <label>Humidity Scale</label>
    <input type="range" id="ctrl-humidity-scale" min="128" max="768" step="16" value="384" />
    <span class="value-display" id="val-humidity-scale">384</span>
  </div>
</div>
```

Add the mode and overlay controls:

```html
<button class="mode-btn" data-mode="transition">Transition</button>

<div class="panel-section">
  <h3>Overlays</h3>
  <label><input type="checkbox" id="ctrl-show-sites" checked /> Biome sites</label>
  <label><input type="checkbox" id="ctrl-show-chunks" checked /> Chunk grid</label>
</div>
```

- [ ] **Step 4: Update debug generator construction and rendering**

In `src/debug/biome-map.js`:

```javascript
let displayMode = 'biome'
let showSites = true
let showChunks = true

function readGeneratorOptions() {
  return {
    regionSize: Number(document.getElementById('ctrl-region-size').value),
    transitionWidth: Number(document.getElementById('ctrl-transition-width').value),
    warpStrength: Number(document.getElementById('ctrl-warp-strength').value),
    temperatureScale: Number(document.getElementById('ctrl-temp-scale').value),
    humidityScale: Number(document.getElementById('ctrl-humidity-scale').value),
  }
}

function createGenerator() {
  generator = new BiomeGenerator(seed, readGeneratorOptions())
  needsRedraw = true
}
```

Inside `drawMap()`, query once per sampled pixel:

```javascript
      const biomeData = generator.getBiomeAt(wx, wz)
```

Use it for all four modes:

```javascript
      if (displayMode === 'biome') {
        const color = BIOME_COLORS[biomeData.biome] || FALLBACK_COLOR
        r = color[0]
        g = color[1]
        b = color[2]
      }
      else if (displayMode === 'temperature') {
        r = Math.floor(biomeData.temp * 255)
        g = Math.floor((1 - Math.abs(biomeData.temp - 0.5) * 2) * 180)
        b = Math.floor((1 - biomeData.temp) * 255)
      }
      else if (displayMode === 'humidity') {
        r = Math.floor((1 - biomeData.humidity) * 200)
        g = Math.floor((1 - biomeData.humidity) * 180 + biomeData.humidity * 100)
        b = Math.floor(biomeData.humidity * 255)
      }
      else {
        const maxWeight = Math.max(...Object.values(biomeData.weights))
        const intensity = Math.floor(Math.min(1, (1 - maxWeight) * 2) * 255)
        r = intensity
        g = intensity
        b = intensity
      }
```

After `ctx.putImageData()`, draw overlays from production data:

```javascript
  if (showChunks)
    drawChunkGrid()
  if (showSites)
    drawBiomeSites()
  drawCrosshair()
```

Add the exact overlay helpers:

```javascript
function getVisibleWorldBounds() {
  return {
    minX: camX - canvas.width / (2 * zoom),
    maxX: camX + canvas.width / (2 * zoom),
    minZ: camZ - canvas.height / (2 * zoom),
    maxZ: camZ + canvas.height / (2 * zoom),
  }
}

function worldToScreen(worldX, worldZ) {
  return {
    x: canvas.width / 2 + (worldX - camX) * zoom,
    y: canvas.height / 2 + (worldZ - camZ) * zoom,
  }
}

function drawChunkGrid() {
  const bounds = getVisibleWorldBounds()
  const firstX = Math.ceil(bounds.minX / 64) * 64
  const firstZ = Math.ceil(bounds.minZ / 64) * 64

  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let worldX = firstX; worldX <= bounds.maxX; worldX += 64) {
    const { x } = worldToScreen(worldX, 0)
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvas.height)
  }
  for (let worldZ = firstZ; worldZ <= bounds.maxZ; worldZ += 64) {
    const { y } = worldToScreen(0, worldZ)
    ctx.moveTo(0, y)
    ctx.lineTo(canvas.width, y)
  }
  ctx.stroke()
  ctx.restore()
}

function drawBiomeSites() {
  const bounds = getVisibleWorldBounds()
  const sites = generator.getSitesInBounds(
    bounds.minX,
    bounds.minZ,
    bounds.maxX,
    bounds.maxZ,
  )

  ctx.save()
  ctx.lineWidth = 1
  ctx.strokeStyle = '#fff'
  for (const site of sites) {
    const screen = worldToScreen(site.x, site.z)
    const color = BIOME_COLORS[site.biome] || FALLBACK_COLOR
    ctx.fillStyle = `rgb(${color.join(',')})`
    ctx.beginPath()
    ctx.arc(screen.x, screen.y, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}
```

Bind sliders using production names:

```javascript
  const sliderBindings = [
    ['ctrl-region-size', 'val-region-size', 'regionSize'],
    ['ctrl-transition-width', 'val-transition-width', 'transitionWidth'],
    ['ctrl-warp-strength', 'val-warp-strength', 'warpStrength'],
    ['ctrl-temp-scale', 'val-temp-scale', 'temperatureScale'],
    ['ctrl-humidity-scale', 'val-humidity-scale', 'humidityScale'],
  ]
  sliderBindings.forEach(([sliderId, valueId, parameter]) => {
    bindSlider(sliderId, valueId, (value) => {
      generator.updateParams({ [parameter]: value })
      needsRedraw = true
    })
  })
```

Bind both checkboxes:

```javascript
  document.getElementById('ctrl-show-sites').addEventListener('change', (event) => {
    showSites = event.target.checked
    needsRedraw = true
  })
  document.getElementById('ctrl-show-chunks').addEventListener('change', (event) => {
    showChunks = event.target.checked
    needsRedraw = true
  })
```

Remove all calls to private `_getTemperature()` and `_getHumidity()`.

- [ ] **Step 5: Run the focused E2E test and verify GREEN**

Run:

```bash
pnpm exec playwright test tests/biome-debug.e2e.test.js --project=chromium
```

Expected: PASS with no browser console errors.

- [ ] **Step 6: Commit debug visualization**

```bash
git add biome-debug.html src/debug/biome-map.js tests/biome-debug.e2e.test.js
git commit -m "feat(debug): visualize macro biome transitions"
```

---

### Task 7: Full verification and visual acceptance

**Files:**

- No planned production edits.
- If verification exposes a defect, return to the owning task, add a failing
  regression test there, and make one focused fix before repeating this task.

**Interfaces:**

- Consumes all previous tasks.
- Produces fresh test, lint, build, benchmark, and visual evidence.

- [ ] **Step 1: Run every focused unit test**

Run:

```bash
pnpm exec node --test tests/unit/biome-terrain-profile.unit.js tests/unit/biome-generator.unit.js tests/unit/terrain-biome-integration.unit.js tests/unit/chunk-biome-lifecycle.unit.js
```

Expected: all tests PASS with zero failures.

- [ ] **Step 2: Run the focused browser test**

Run:

```bash
pnpm exec playwright test tests/biome-debug.e2e.test.js --project=chromium
```

Expected: PASS with no console errors.

- [ ] **Step 3: Run source validation and production compilation**

Run:

```bash
pnpm lint
pnpm build
```

Expected: both exit `0`. Do not claim completion if either command reports an
error, even if it appears unrelated; report the exact pre-existing blocker or
fix only an in-scope regression.

- [ ] **Step 4: Run the final performance comparison**

Run:

```bash
pnpm exec node tests/benchmarks/biome-generator.bench.js
```

Acceptance:

- Median `<= 11.06 ms`.
- P95 `<= 14.18 ms`.
- `getCacheDiagnostics().sites <= 2048` remains covered by unit tests.

- [ ] **Step 5: Inspect the debug map visually**

Start:

```bash
pnpm dev
```

Open `/biome-debug.html` and inspect seed `1337`:

1. Dominant mode shows large readable regions for all configured biomes.
2. No visible biome island is five or six columns across.
3. Boundaries curve organically rather than revealing a 128-block square grid.
4. Transition mode shows continuous bands near region boundaries and no
   isolated bright single pixels.
5. Site overlay shows one jittered site per macro cell.
6. Chunk-grid overlay confirms identical behavior across positive and negative
   seams.

- [ ] **Step 6: Inspect the generated game terrain**

Open the game with debug mode and seed `1337`. Check:

1. Plains to desert.
2. Plains to badlands.
3. Plains/birch forest to forest.
4. Forest to cherry forest.
5. A three-biome junction.
6. At least one positive and one negative chunk seam.
7. The former `(83, 6)` to `(84, 6)` seven-block regression area.

Acceptance:

- No biome-induced vertical wall or isolated full-height stone column.
- Surface blocks are coherent by dominant biome rather than randomly speckled.
- Trees and flora stay inside their dominant biome.
- New chunk generation does not introduce a perceptible additional stall.

- [ ] **Step 7: Review the final diff against scope**

Run:

```bash
git status --short
git diff --stat bd52099..HEAD
git diff --check bd52099..HEAD
```

Confirm only the files listed by this plan changed, except the pre-existing
unrelated `.gitignore` and `.codegraph/` state. Confirm no dependency, Vue,
renderer, material, persistence, or asset files changed.

---

## Spec Coverage Check

| Approved requirement | Plan coverage |
| --- | --- |
| Macro sites spaced at 128 blocks with ±0.25 jitter | Tasks 1–3 |
| Stable biome core and no tiny interior fragments | Task 2 |
| Organic boundary warp with two single-octave samples | Task 2 |
| Climate sampled only at cached sites | Task 2 |
| Climate-anchor classification with deterministic tie break | Tasks 1–2 |
| Continuous normalized multi-site weights | Task 2 |
| Global five-octave fBM remains the only height source | Task 4 |
| Bounded `heightOffset`/`roughness` profile | Tasks 1 and 4 |
| Dominant categorical blocks/trees/flora; remove `Math.random()` mixing | Task 4 |
| Existing public map contract and orientations | Tasks 2 and 4 |
| Static `BIOME_PARAMS` ownership | Tasks 1 and 5 |
| Seed or parameter change invalidates/rebuilds correct state | Tasks 2 and 5 |
| Chunk-width-aware map cache and bounded site cache | Tasks 2–3 |
| Invalid input policy | Tasks 1–2 |
| Dominant/transition/site/chunk debug views | Task 6 |
| Determinism, seams, weights, size, cache, and seed `1337` regression tests | Tasks 1–5 |
| Median no slower than 11.06 ms; P95 no higher than 14.18 ms | Tasks 3 and 7 |
| Lint, build, browser, and visual verification | Task 7 |

## Self-Review Notes

- Every production behavior starts with a failing test except debug overlay
  drawing, which starts with a failing Playwright page contract.
- Public names are consistent across tasks:
  `temperatureScale`, `humidityScale`, `transitionWidth`, `setSeed()`,
  `getSitesInBounds()`, and `getCacheDiagnostics()`.
- Generator weights are always normalized objects; panel fallback explicitly
  creates a single-entry object before the pure height function runs.
- The seed lifecycle test prevents the existing passive
  `biomeGenerator.seed = seed` bug.
- Region/component analysis ignores sample-window edge components so cropped
  valid regions cannot create false tiny-biome failures.
- Performance remediation is limited to caching site lookups; quality defaults
  cannot be weakened to pass timing.
- No implementation step modifies `.gitignore`, `.codegraph/`, dependencies,
  Vue, renderer, materials, assets, water, persistence, or chunk scheduling.
