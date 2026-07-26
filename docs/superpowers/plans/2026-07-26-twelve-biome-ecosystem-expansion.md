# Twelve-Biome Ecosystem Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand new-world generation from seven weakly differentiated biomes to twelve deterministic, visually distinct ecosystems with basin/lowland selection, data-driven surfaces, cross-chunk trees, and Java Edition 1.21.11 personal-use textures.

**Architecture:** Keep the existing macro-site Voronoi field and add landform sampling only when a site is created. Blend `heightOffset`, `roughness`, and `flatness` continuously, while a pure surface-rule registry and coordinate-hashed decoration pipeline use the dominant biome for categorical content. Register all new voxel and lightweight plant assets through the existing WebGPU resource and render layers.

**Tech Stack:** JavaScript ES modules, Three.js WebGPU/TSL, Simplex noise, Node test runner, Playwright, pnpm, fflate

**Design reference:** `docs/superpowers/specs/2026-07-26-twelve-biome-ecosystem-expansion-design.md`

## Global Constraints

- Use `pnpm` exclusively; do not introduce npm or yarn commands.
- Preserve pure JavaScript ES modules, explicit `.js` imports, two-space indentation, no semicolons, single quotes, and trailing commas in multiline literals.
- Keep rendering WebGPU-only and use the existing Three.js NodeMaterial/TSL patterns.
- Declare every imported texture in `src/js/sources.js` and access it through `this.experience.resources.items`.
- Use Minecraft Java Edition `1.21.11` default 16x16 textures only for this approved personal-use scope; document that they must not be published as MIT project assets.
- Do not preserve old generated worlds; seed `1337` may produce a new layout.
- Keep `BiomeGenerator.getBiomeAt()` and `generateBiomeMap()` return shapes unchanged.
- Do not add mobs, structures, normal oceans, rivers, caves, aquifers, dynamic snow, or a full Minecraft color-map system.
- The twelve IDs are `frozenOcean`, `snowyPlains`, `taiga`, `birchForest`, `plains`, `forest`, `swamp`, `cherryForest`, `savanna`, `desert`, `badlands`, and `jungle`.
- Biome-map P95 may grow by at most 10% from the freshly captured baseline; full chunk-generation P95 may grow by at most 15%.
- Preserve unrelated working-tree changes. Stage and commit only files listed by the active task.

## File Structure

### New focused modules

- `src/js/world/terrain/biome-registry-schema.js`: approved biome IDs and surface/tree/plant shape name sets shared by validation and implementations.
- `src/js/world/terrain/biome-registry-validation.js`: validate biome selection, terrain, surface, tree, and flora references without renderer dependencies.
- `src/js/world/terrain/biome-surface-rules.js`: pure surface-layer and overlay decisions.
- `src/js/world/terrain/decoration-hash.js`: stable coordinate hashes, weighted choices, and local-priority spacing.
- `src/js/world/terrain/tree-decoration.js`: enumerate world-space tree roots and clip generated tree blocks into one chunk.
- `src/js/world/terrain/plant-geometry.js`: shared cross, horizontal, and face geometries.
- `scripts/minecraft-asset-manifest.js`: pinned texture allowlist and source-name mapping.
- `scripts/lib/minecraft-asset-import.js`: download verification and atomic allowlist extraction.
- `scripts/import-minecraft-assets.mjs`: CLI wrapper.

### Existing modules with focused changes

- `src/js/config/chunk-config.js`: landform parameters and special-role thresholds.
- `src/js/world/terrain/biome-config.js`: twelve data-only biome entries.
- `src/js/world/terrain/biome-generator.js`: site landform classification and dominant combined weight.
- `src/js/world/terrain/biome-terrain-profile.js`: blend and validate flatness.
- `src/js/world/terrain/terrain-biome-field.js`: reusable `sampleTerrainColumnAt()` function.
- `src/js/world/terrain/blocks-config.js`: new block/plant IDs, materials, textures, tints, and render shapes.
- `src/js/world/terrain/tree-shape.js`: spruce, swamp oak, acacia, and jungle templates.
- `src/js/world/terrain/terrain-generator.js`: surface rules and deterministic decoration phases.
- `src/js/world/terrain/plant-renderer.js`: geometry selection and facing transforms.
- `src/js/utils/core/resources.js`: fail loading explicitly when a declared texture is missing.
- `src/js/sources.js`: imported texture declarations.
- `src/debug/biome-map.js` and `biome-debug.html`: twelve colors and landform diagnostics.

---

### Task 1: Capture Pre-Change Performance and Lock the Twelve-Biome Contract

**Files:**
- Create: `docs/superpowers/plans/2026-07-26-twelve-biome-baseline.md`
- Create: `tests/benchmarks/full-chunk-generation.bench.js`
- Create: `tests/unit/biome-registry.unit.js`
- Create: `src/js/world/terrain/biome-registry-schema.js`
- Create: `src/js/world/terrain/biome-registry-validation.js`
- Modify: `src/js/world/terrain/biome-config.js`
- Modify: `src/js/world/terrain/blocks-config.js`

**Interfaces:**
- Consumes: existing `BIOMES`, `BLOCK_IDS`, `PLANT_IDS`
- Produces: `APPROVED_BIOME_IDS`, `SURFACE_RULE_NAMES`, `TREE_SHAPE_NAMES`, `PLANT_RENDER_SHAPES`
- Produces: `validateBiomeRegistry({ biomes, blockIds, plantIds, surfaceRuleNames, treeShapeNames, plantRenderShapes })`

- [ ] **Step 1: Capture the current biome benchmark**

Before changing biome behavior, add
`tests/benchmarks/full-chunk-generation.bench.js`. Construct a data-only
`TerrainGenerator` harness with `Object.create(TerrainGenerator.prototype)`,
an injected non-singleton `TerrainContainer`, the production parameter
defaults, and a shared `BiomeGenerator`. For every measured chunk, invoke
`initialize()`, `generateTerrain()`, `generateResources()`, `generateTrees()`,
`generatePlants()`, and `computeAO()`. Enumerate filled block IDs and plant
data into a SHA-256 digest to represent mesh-data preparation without creating
WebGPU materials.

Run both baselines:

```bash
pnpm exec node tests/benchmarks/biome-generator.bench.js
pnpm exec node tests/benchmarks/full-chunk-generation.bench.js
```

Create the baseline document with the heading
`# Twelve-Biome Performance Baseline`, followed by the exact output of
`node --version`, `git rev-parse --short HEAD`, and both benchmark JSON
objects. Record the fixed workload as `3x3 chunks, 64x64 columns each`, warmups
as `5`, and measured runs as `30`. Copy command output verbatim; do not
substitute example numbers.

- [ ] **Step 2: Write failing registry tests**

Add tests that assert twelve unique IDs and explicit invalid cases:

```javascript
test('approved registry contains twelve unique biome ids', () => {
  const ids = Object.values(BIOMES).map(biome => biome.id)
  assert.equal(ids.length, 12)
  assert.equal(new Set(ids).size, 12)
  assert.deepEqual(new Set(ids), new Set(APPROVED_BIOME_IDS))
})

test('registry rejects unknown tree shapes with a path-specific error', () => {
  const biomes = structuredClone(BIOMES)
  biomes.TAIGA.vegetation.types[0].shape = 'missing-shape'
  assert.throws(
    () => validateBiomeRegistry(createValidationInput(biomes)),
    /BIOMES\.TAIGA\.vegetation\.types\[0\]\.shape/,
  )
})
```

Cover duplicate IDs, climate outside `[0, 1]`, flatness outside `[0, 1]`,
unknown surface rule, block ID, plant ID, tree shape, plant render shape,
negative density, negative weight, and zero total weight at positive density.

- [ ] **Step 3: Run the registry test and confirm the red state**

Run:

```bash
pnpm exec node --test tests/unit/biome-registry.unit.js
```

Expected: FAIL because the five new biomes and
`biome-registry-validation.js` do not exist.

- [ ] **Step 4: Add the validator and twelve data entries**

Implement a validator that reports a configuration path:

```javascript
function assertFiniteAt(path, value) {
  if (!Number.isFinite(value))
    throw new TypeError(`${path} must be finite`)
}

export function validateBiomeRegistry({
  biomes,
  blockIds,
  plantIds,
  surfaceRuleNames,
  treeShapeNames,
  plantRenderShapes,
}) {
  const seenIds = new Set()
  for (const [key, biome] of Object.entries(biomes)) {
    const path = `BIOMES.${key}`
    if (!biome.id || seenIds.has(biome.id))
      throw new RangeError(`${path}.id must be unique and non-empty`)
    seenIds.add(biome.id)
    assertFiniteAt(`${path}.terrainParams.heightOffset`, biome.terrainParams?.heightOffset)
    assertFiniteAt(`${path}.terrainParams.roughness`, biome.terrainParams?.roughness)
    assertFiniteAt(`${path}.terrainParams.flatness`, biome.terrainParams?.flatness)
    if (biome.terrainParams.flatness < 0 || biome.terrainParams.flatness > 1)
      throw new RangeError(`${path}.terrainParams.flatness must be between 0 and 1`)
    // Apply the same path-specific pattern to selection, surface, vegetation, and flora.
  }
}
```

Populate all twelve registry entries with the exact anchors and terrain values
from the approved design. Mark `frozenOcean` as role `basin`, `swamp` as role
`lowland`, and the other ten as role `land`. Surface rules use the names
`frozenOcean`, `snowyPlains`, `taiga`, `grassland`, `swamp`, `savanna`,
`desert`, `badlands`, and `jungle`.

Reserve the approved block IDs `24..40` and plant IDs `209..211` in
`blocks-config.js` so registry references are concrete. Task 6 adds their
renderable block and plant records. Put the approved biome IDs and the surface,
tree, and plant render-shape name sets in `biome-registry-schema.js`; Tasks 4,
7, and 9 must import those sets rather than defining competing name lists.

- [ ] **Step 5: Run, verify, and commit**

Run:

```bash
pnpm exec node --test tests/unit/biome-registry.unit.js tests/unit/biome-terrain-profile.unit.js
```

Expected: all tests PASS.

Commit:

```bash
git add docs/superpowers/plans/2026-07-26-twelve-biome-baseline.md tests/benchmarks/full-chunk-generation.bench.js tests/unit/biome-registry.unit.js src/js/world/terrain/biome-registry-schema.js src/js/world/terrain/biome-registry-validation.js src/js/world/terrain/biome-config.js src/js/world/terrain/blocks-config.js
git commit -m "feat(biome): define validated twelve-biome registry"
```

### Task 2: Add Landform-Aware Macro-Site Classification

**Files:**
- Modify: `src/js/config/chunk-config.js`
- Modify: `src/js/world/terrain/biome-generator.js`
- Modify: `tests/unit/biome-generator.unit.js`
- Modify: `tests/benchmarks/biome-generator.bench.js`

**Interfaces:**
- Consumes: validated `BIOMES`
- Produces: `BiomeGenerator._classifySite(temp, humidity, landform)` and site objects `{ cellX, cellZ, x, z, temp, humidity, landform, biome }`

- [ ] **Step 1: Write failing special-role and dominance tests**

Add direct classification cases through a public diagnostic helper:

```javascript
test('cold wet basins classify before swamp lowlands', () => {
  const generator = new BiomeGenerator(1337)
  assert.equal(generator.classifySiteClimate(0.20, 0.80, -0.50), 'frozenOcean')
  assert.equal(generator.classifySiteClimate(0.60, 0.85, -0.50), 'swamp')
  assert.equal(generator.classifySiteClimate(0.20, 0.80, 0.20), 'taiga')
})

test('dominant biome uses combined normalized weight with lexical ties', () => {
  assert.equal(
    selectDominantBiome({ plains: 0.2, forest: 0.4, taiga: 0.4 }),
    'forest',
  )
})
```

Also assert `getSitesInBounds()` returns finite `landform`, seed changes alter
it, and cache clears preserve the value. Assert `landformScale` must be
positive, every special-role threshold must be finite, and changing any of
those values through `updateParams()` clears both site and biome-map caches.

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```bash
pnpm exec node --test tests/unit/biome-generator.unit.js
```

Expected: FAIL because `landform`, `classifySiteClimate()`, and
`selectDominantBiome()` are absent.

- [ ] **Step 3: Implement site-only landform sampling**

Add exact defaults:

```javascript
export const BIOME_PARAMS = {
  regionSize: 128,
  regionJitter: 0.25,
  transitionWidth: 20,
  warpScale: 96,
  warpStrength: 12,
  temperatureScale: 384,
  humidityScale: 384,
  landformScale: 512,
  frozenOceanMaxTemperature: 0.28,
  frozenOceanMinHumidity: 0.52,
  frozenOceanMaxLandform: -0.32,
  swampMinTemperature: 0.42,
  swampMinHumidity: 0.70,
  swampMaxLandform: -0.12,
  siteCacheLimit: 2048,
}
```

Construct `landformNoise` from `seed + 4000`, sample it only in `_getSite()`,
apply frozen-ocean then swamp rules, and otherwise measure climate distance
against entries with `selection.role === 'land'`.

Replace the constructor's profile-only validation call with
`validateBiomeRegistry()` using the production block/plant ID sets and the
approved surface/tree/render-shape name sets.

Export this pure helper from `biome-generator.js`:

```javascript
export function selectDominantBiome(weights) {
  return Object.entries(weights)
    .sort(([firstId, firstWeight], [secondId, secondWeight]) =>
      secondWeight - firstWeight || firstId.localeCompare(secondId),
    )[0][0]
}
```

Use it after weights are normalized. Keep `temp`, `humidity`, and `weights` in
the public query result and keep `landform` internal to sites.

- [ ] **Step 4: Add the multi-seed distribution diagnostic**

Add a non-default benchmark mode invoked as:

```bash
pnpm exec node tests/benchmarks/biome-generator.bench.js --distribution
```

It samples site labels, not every world column, for seeds `0..31` over
`[-1024, 1024]` in both axes. It exits non-zero unless every biome appears in
at least 24 seeds, aggregate shares stay within `1%..20%`, and no per-seed
share exceeds `35%`. Tune only the thresholds and anchors declared in the
approved design until the command passes.

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm exec node --test tests/unit/biome-generator.unit.js
pnpm exec node tests/benchmarks/biome-generator.bench.js --distribution
```

Expected: tests PASS and distribution command exits `0`.

Commit:

```bash
git add src/js/config/chunk-config.js src/js/world/terrain/biome-generator.js tests/unit/biome-generator.unit.js tests/benchmarks/biome-generator.bench.js
git commit -m "feat(biome): classify basin and lowland macro sites"
```

### Task 3: Blend Flatness and Expose a Pure World-Column Sampler

**Files:**
- Modify: `src/js/world/terrain/biome-terrain-profile.js`
- Modify: `src/js/world/terrain/terrain-biome-field.js`
- Modify: `tests/unit/biome-terrain-profile.unit.js`
- Modify: `tests/unit/terrain-biome-integration.unit.js`

**Interfaces:**
- Produces: `blendBiomeTerrainProfile(weights) -> { heightOffset, roughness, flatness }`
- Produces: `sampleTerrainColumnAt({ worldX, worldZ, height, terrain, simplex, biomeData }) -> { height, biome, biomeData, terrainNoise, profile }`

- [ ] **Step 1: Write failing flatness tests**

```javascript
test('flatness compresses terrain noise before roughness', () => {
  const height = calculateBiomeTerrainHeight({
    baseOffset: 8,
    baseMagnitude: 12,
    terrainNoise: 0.8,
    weights: { swamp: 1 },
    maxHeight: 31,
  })
  assert.equal(height, 4)
})

test('point sampler and map builder return identical columns', () => {
  const sampled = sampleTerrainColumnAt(createColumnOptions(17, -9))
  const field = buildTerrainBiomeField(createFieldOptions(17, -9, 1))
  assert.equal(field.heightMap[0][0], sampled.height)
  assert.deepEqual(field.biomeDataMap[0][0], sampled.biomeData)
})
```

The expected height is `floor(8 - 7 + 12 * 0.36 * 0.75) = 4`; do not replace
the exact assertion with a loose inequality.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
pnpm exec node --test tests/unit/biome-terrain-profile.unit.js tests/unit/terrain-biome-integration.unit.js
```

Expected: FAIL because flatness and `sampleTerrainColumnAt()` are absent.

- [ ] **Step 3: Implement the profile and sampler**

Use:

```javascript
const compressedNoise = clamp(terrainNoise, -0.25, 0.25)
const shapedNoise = terrainNoise
  + (compressedNoise - terrainNoise) * profile.flatness
```

Validate and blend `flatness` in the same sorted weight loop as the other
numeric properties. Move one column's noise/profile/height work out of
`buildTerrainBiomeField()` into `sampleTerrainColumnAt()`; have the map builder
call the sampler so there is one formula.

- [ ] **Step 4: Verify transitions and seams**

Add table-driven tests for all twelve single-biome profiles and a
`frozenOcean/swamp`, `swamp/forest`, and `badlands/desert` weight sweep from
`0` to `1` in increments of `0.05`. Assert finite profiles and adjacent
unfloored profile contributions that change continuously.

Run:

```bash
pnpm exec node --test tests/unit/biome-terrain-profile.unit.js tests/unit/terrain-biome-integration.unit.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/js/world/terrain/biome-terrain-profile.js src/js/world/terrain/terrain-biome-field.js tests/unit/biome-terrain-profile.unit.js tests/unit/terrain-biome-integration.unit.js
git commit -m "feat(terrain): blend biome flatness profiles"
```

### Task 4: Implement Pure Surface Rules

**Files:**
- Create: `src/js/world/terrain/biome-surface-rules.js`
- Create: `tests/unit/biome-surface-rules.unit.js`

**Interfaces:**
- Produces: `resolveBiomeSurface(input) -> { blockId, overlayBlockId: number|null }`
- Produces: `getSurfaceRuleNames() -> Set<string>`
- Consumes: `SURFACE_RULE_NAMES` from `biome-registry-schema.js`
- Consumes later: `TerrainGenerator._fillColumnLayers()`

- [ ] **Step 1: Write failing table-driven surface tests**

Use fixed world coordinates and assert:

```javascript
test('badlands bands depend on world height and not chunk origin', () => {
  const first = resolveBiomeSurface(createSurfaceInput({
    biomeId: 'badlands',
    worldX: 63,
    worldZ: -1,
    y: 5,
    surfaceHeight: 9,
  }))
  const second = resolveBiomeSurface(createSurfaceInput({
    biomeId: 'badlands',
    worldX: 63,
    worldZ: -1,
    y: 5,
    surfaceHeight: 9,
  }))
  assert.deepEqual(first, second)
  assert.ok(TERRACOTTA_BAND_IDS.has(first.blockId))
})

test('swamp returns mud under water and tinted grass on a dry hummock', () => {
  assert.equal(resolveBiomeSurface(swampInput({ surfaceHeight: 2 })).blockId, BLOCK_IDS.MUD)
  assert.equal(resolveBiomeSurface(swampInput({ surfaceHeight: 4 })).blockId, BLOCK_IDS.SWAMP_GRASS)
})
```

Cover all nine approved surface rule names, frozen-ocean ice overlay coverage,
snow block surface, taiga podzol patches, savanna and jungle tints, desert
sand, and categorical-only outputs.

- [ ] **Step 2: Run and confirm failure**

```bash
pnpm exec node --test tests/unit/biome-surface-rules.unit.js
```

Expected: FAIL because the module and new block IDs are absent.

- [ ] **Step 3: Implement rules with named hash salts**

Use a stable integer mixer local to the module until Task 7 extracts the shared
decoration hash:

```javascript
function columnHash(worldX, worldZ, salt) {
  let value = Math.imul(worldX | 0, 0x85EBCA77)
  value ^= Math.imul(worldZ | 0, 0xC2B2AE3D)
  value ^= salt
  value = Math.imul(value ^ (value >>> 16), 0x7FEB352D)
  return (value ^ (value >>> 15)) >>> 0
}
```

Return only registered block IDs. Use a low-frequency cell hash for ice cracks
and badlands band offsets so neighboring columns form patches rather than
salt-and-pepper noise.

- [ ] **Step 4: Add surface-rule seam fixtures**

Compare `x=63` and `x=64` through calls that supply only world coordinates;
also compare `-1` and `0`. Assert no rule reads chunk-local coordinates.

Run:

```bash
pnpm exec node --test tests/unit/biome-surface-rules.unit.js
```

Expected: all tests PASS using the concrete IDs reserved in Task 1.

- [ ] **Step 5: Commit the pure rule layer**

```bash
git add src/js/world/terrain/biome-surface-rules.js tests/unit/biome-surface-rules.unit.js
git commit -m "feat(terrain): add deterministic biome surface rules"
```

### Task 5: Add the Pinned Personal-Use Texture Importer

**Files:**
- Create: `scripts/minecraft-asset-manifest.js`
- Create: `scripts/lib/minecraft-asset-import.js`
- Create: `scripts/import-minecraft-assets.mjs`
- Create: `tests/unit/minecraft-asset-import.unit.js`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.gitignore`
- Modify: `README.md`

**Interfaces:**
- Produces: `MINECRAFT_VERSION`, `TEXTURE_ALLOWLIST`
- Produces: `verifySha1(bytes, expected)`, `extractAllowlistedTextures({ archiveBytes, allowlist, destination })`, `importMinecraftAssets(options)`

- [ ] **Step 1: Write importer tests against an in-memory fixture archive**

Add `fflate` with:

```bash
pnpm add -D fflate
```

Create a fixture with `zipSync()` and test exact allowlisting, checksum
rejection, missing entry reporting, and atomic preservation of a previous
destination.

```javascript
test('extractor writes only allowlisted texture paths', async () => {
  const archiveBytes = zipSync({
    'assets/minecraft/textures/block/spruce_log.png': new Uint8Array([1]),
    'assets/minecraft/textures/block/unlisted.png': new Uint8Array([2]),
  })
  await extractAllowlistedTextures({
    archiveBytes,
    allowlist: [{
      archivePath: 'assets/minecraft/textures/block/spruce_log.png',
      outputPath: 'spruce_log.png',
    }],
    destination,
  })
  assert.deepEqual(await readdir(destination), ['spruce_log.png'])
})
```

- [ ] **Step 2: Run and confirm the red state**

```bash
pnpm exec node --test tests/unit/minecraft-asset-import.unit.js
```

Expected: FAIL because the importer modules do not exist.

- [ ] **Step 3: Implement pinned metadata, checksum, and atomic extraction**

Set:

```javascript
export const MINECRAFT_VERSION = '1.21.11'
export const IMPORT_ROOT = 'public/textures/blocks/minecraft-1.21.11'
```

The allowlist must include the exact block/plant textures named in the design,
including `grass_block_side_overlay.png`. Download the Mojang version manifest,
resolve the pinned version metadata and client URL, verify SHA-1, unzip into a
temporary sibling directory, verify every output, rename the previous complete
directory to a backup, swap the new directory in, then remove the backup.
Restore the backup if the swap fails.

- [ ] **Step 4: Wire the CLI and personal-use warning**

Add:

```json
"assets:import-minecraft": "node scripts/import-minecraft-assets.mjs"
```

Ignore only the archive cache:

```gitignore
.cache/minecraft-assets/
```

Document that the command downloads copyrighted Mojang textures for approved
personal use and that the imported directory must be removed before publishing
or relicensing the repository.

- [ ] **Step 5: Verify and commit importer code**

Run:

```bash
pnpm exec node --test tests/unit/minecraft-asset-import.unit.js
pnpm lint scripts tests/unit/minecraft-asset-import.unit.js
```

Expected: all tests and lint PASS.

Commit:

```bash
git add scripts tests/unit/minecraft-asset-import.unit.js package.json pnpm-lock.yaml .gitignore README.md
git commit -m "feat(assets): add pinned minecraft texture importer"
```

### Task 6: Import and Register New Blocks and Plants

**Files:**
- Create: `public/textures/blocks/minecraft-1.21.11/*.png`
- Modify: `src/js/sources.js`
- Modify: `src/js/world/terrain/blocks-config.js`
- Create: `tests/unit/terrain-asset-integrity.unit.js`
- Modify: `tests/unit/terrain-render-layers.unit.js`

**Interfaces:**
- Consumes block IDs `24..40` and plant IDs `209..211` reserved in Task 1
- Produces renderable `blocks` and `plants` records for every reserved ID

- [ ] **Step 1: Import the allowlisted textures**

Run:

```bash
pnpm assets:import-minecraft
```

Expected: checksum verification succeeds and every allowlisted PNG exists
under `public/textures/blocks/minecraft-1.21.11/`.

- [ ] **Step 2: Write failing asset-integrity tests**

Parse `sources.js` through its default export and assert every new texture path
exists. Assert each `textureKeys` or overlay key in `blocks` and `plants`
matches a source name.

Register these IDs in the test expectation:

```javascript
const EXPECTED_NEW_BLOCK_IDS = {
  SPRUCE_TRUNK: 24,
  SPRUCE_LEAVES: 25,
  ACACIA_TRUNK: 26,
  ACACIA_LEAVES: 27,
  JUNGLE_TRUNK: 28,
  JUNGLE_LEAVES: 29,
  PODZOL: 30,
  MUD: 31,
  SAVANNA_GRASS: 32,
  SWAMP_GRASS: 33,
  JUNGLE_GRASS: 34,
  WHITE_TERRACOTTA: 35,
  LIGHT_GRAY_TERRACOTTA: 36,
  YELLOW_TERRACOTTA: 37,
  ORANGE_TERRACOTTA: 38,
  RED_TERRACOTTA: 39,
  BROWN_TERRACOTTA: 40,
}

const EXPECTED_NEW_PLANT_IDS = {
  FERN: 209,
  VINE: 210,
  LILY_PAD: 211,
}
```

- [ ] **Step 3: Run and confirm failure**

```bash
pnpm exec node --test tests/unit/terrain-asset-integrity.unit.js
```

Expected: FAIL because sources and registries do not yet reference the imported
files.

- [ ] **Step 4: Register sources, blocks, plants, tint overlays, and load errors**

Add source names with the existing naming style. Extend block material creation
with:

```javascript
textureKeys: {
  side: 'grassBlockSide_Texture',
  sideOverlay: 'grassBlockSideOverlay_Texture',
  top: 'grassBlockTop_Texture',
  bottom: 'dirt_Texture',
},
tint: {
  sideOverlay: 0xBFB755,
  top: 0xBFB755,
},
```

Compose tinted side overlays in a TSL `colorNode` while keeping dirt untinted.
Tint leaf `all` textures per biome. Add plant `renderShape: 'cross'`,
`'horizontal'`, or `'face'`.

Update `Resources.startLoading()` so texture-loader failures call one shared
`sourceFailed(source, error)` method that emits `core:loading-error` with the
source name/path and prevents a false `core:ready`.

- [ ] **Step 5: Verify and commit registrations plus personal-use textures**

Run:

```bash
pnpm exec node --test tests/unit/terrain-asset-integrity.unit.js tests/unit/terrain-render-layers.unit.js tests/unit/biome-surface-rules.unit.js
pnpm lint src/js/sources.js src/js/world/terrain/blocks-config.js src/js/utils/core/resources.js tests/unit/terrain-asset-integrity.unit.js
```

Expected: all tests and lint PASS.

Commit:

```bash
git add public/textures/blocks/minecraft-1.21.11 src/js/sources.js src/js/world/terrain/blocks-config.js src/js/utils/core/resources.js tests/unit/terrain-asset-integrity.unit.js tests/unit/terrain-render-layers.unit.js
git commit -m "feat(terrain): register twelve-biome blocks and plants"
```

### Task 7: Add Four Vanilla-Like Tree Templates

**Files:**
- Modify: `src/js/world/terrain/tree-shape.js`
- Modify: `tests/unit/tree-shape.unit.js`

**Interfaces:**
- Consumes: `TREE_SHAPE_NAMES` from `biome-registry-schema.js`
- Produces: `getTreeShapeNames()`
- Extends: `placeTree(shape, ctx) -> { trunkBlocks, leavesBlocks, attachments }`

- [ ] **Step 1: Write failing coordinate-snapshot tests**

Use a seeded test RNG and collect sorted coordinates. Assert these structural
properties in addition to full snapshots:

```javascript
test('spruce is tapered and never exceeds radius three', () => {
  const placed = renderTree('spruce', 7)
  assert.equal(placed.maxHorizontalRadius, 3)
  assert.ok(placed.leafLayers.at(-1).radius <= placed.leafLayers[0].radius)
})

test('acacia includes a deterministic bend and flat canopy', () => {
  const placed = renderTree('acacia', 11)
  assert.ok(placed.trunkColumns.size >= 2)
  assert.ok(placed.topCanopyWidth >= 5)
})
```

Add exact snapshots for `spruce`, `swampOak`, `acacia`, and `jungle`, and keep
the existing oak/birch/cherry assertions unchanged.

- [ ] **Step 2: Run and confirm failure**

```bash
pnpm exec node --test tests/unit/tree-shape.unit.js
```

Expected: FAIL on unknown shape names.

- [ ] **Step 3: Split focused placement helpers**

Keep `trySet()` as the only block-write gate. Add the four focused helpers and
use one explicit dispatch table:

```javascript
const SHAPE_PLACERS = Object.freeze({
  spruce: placeSpruce,
  swampOak: placeSwampOak,
  acacia: placeAcacia,
  jungle: placeJungle,
})

const placer = SHAPE_PLACERS[shape]
if (placer) {
  const attachments = placer(ctx, trunkHeight, stats)
  return { ...stats, attachments }
}
```

`placeSpruce()` writes one centered trunk, then leaf disks of radii
`3, 3, 2, 2, 1, 1, 0` from lower to upper canopy, truncating the list when
the selected height is shorter. `placeSwampOak()` chooses one cardinal lean
from its RNG, shifts the upper two trunk blocks by one voxel, writes leaf disks
`3, 3, 2, 1`, and returns exposed canopy-edge faces as vine attachments.
`placeAcacia()` chooses a cardinal bend at two-thirds trunk height, writes a
second shorter branch in the opposite axis, and caps both tips with disks
`3, 2`. `placeJungle()` writes a centered trunk, lower disks `2, 1`, upper
disks `4, 3, 2, 1`, and returns exposed outer faces of the upper two disks as
vine attachments.

Each helper must place world-agnostic local coordinates through `trySet()`.
Return attachment candidates as:

```javascript
{ x, y, z, facing: 'north' | 'south' | 'east' | 'west' }
```

Only swamp oak and jungle emit vine candidates.

- [ ] **Step 4: Verify deterministic shapes and bounds**

Run the test twice:

```bash
pnpm exec node --test tests/unit/tree-shape.unit.js
pnpm exec node --test tests/unit/tree-shape.unit.js
```

Expected: identical PASS results with no writes outside supplied bounds.

- [ ] **Step 5: Commit**

```bash
git add src/js/world/terrain/tree-shape.js tests/unit/tree-shape.unit.js
git commit -m "feat(trees): add spruce swamp acacia and jungle shapes"
```

### Task 8: Implement Coordinate-Hashed Cross-Chunk Tree Decoration

**Files:**
- Create: `src/js/world/terrain/decoration-hash.js`
- Create: `src/js/world/terrain/tree-decoration.js`
- Create: `tests/unit/tree-decoration.unit.js`
- Modify: `src/js/world/terrain/terrain-generator.js`

**Interfaces:**
- Produces: `hashDecoration(seed, worldX, worldZ, salt) -> number in [0, 1)`
- Produces: `chooseWeightedByHash(types, value)`
- Produces: `generateChunkTrees(options) -> { treeCount, treeTrunkBlocks, treeLeavesBlocks, attachments }`

- [ ] **Step 1: Write failing determinism and seam tests**

Generate one tree whose root is at world `x=63`, render independent chunks at
origins `0` and `64`, combine their world-space outputs, and compare with one
unclipped reference container:

```javascript
assert.deepEqual(
  sortedWorldBlocks([...left.blocks, ...right.blocks]),
  sortedWorldBlocks(reference.blocks),
)
```

Also assert reversing chunk generation order produces identical blocks and
that separate salts isolate tree acceptance, type, height, and flora choices.

- [ ] **Step 2: Run and confirm failure**

```bash
pnpm exec node --test tests/unit/tree-decoration.unit.js
```

Expected: FAIL because the hash and decorator modules do not exist.

- [ ] **Step 3: Implement hash rejection, spacing, and clipped writes**

Enumerate roots over:

```javascript
const minX = originX - maximumCanopyRadius
const maxX = originX + width - 1 + maximumCanopyRadius
```

Run density and local-priority spacing before calling the injected
`sampleColumn(worldX, worldZ)`. Generate the complete tree in world
coordinates, but translate and write only blocks whose local X/Z fall in
`[0, width)`. Sort accepted roots by priority hash before placement so
overlapping candidates resolve identically in adjacent chunks.

- [ ] **Step 4: Replace sequential tree RNG in TerrainGenerator**

Inject:

```javascript
generateChunkTrees({
  seed: this.params.seed,
  origin: this.origin,
  size: this.container.getSize(),
  biomeAt: (worldX, worldZ) => this.biomeGenerator.getBiomeAt(worldX, worldZ),
  sampleColumn: (worldX, worldZ) => this._sampleWorldColumn(worldX, worldZ),
  getBiomeConfig,
  placeTree,
  setLocalBlock: (x, y, z, id) => this.container.setBlockId(x, y, z, id),
})
```

Remove tree decisions from the shared sequential RNG. Keep ore generation
unchanged.

- [ ] **Step 5: Verify and commit**

```bash
pnpm exec node --test tests/unit/tree-decoration.unit.js tests/unit/tree-shape.unit.js tests/unit/terrain-biome-integration.unit.js
```

Expected: all tests PASS.

Commit:

```bash
git add src/js/world/terrain/decoration-hash.js src/js/world/terrain/tree-decoration.js src/js/world/terrain/terrain-generator.js tests/unit/tree-decoration.unit.js
git commit -m "feat(trees): generate deterministic cross-chunk canopies"
```

### Task 9: Render Cross, Horizontal, and Face Plants

**Files:**
- Create: `src/js/world/terrain/plant-geometry.js`
- Modify: `src/js/world/terrain/plant-renderer.js`
- Modify: `src/js/world/terrain/blocks-config.js`
- Modify: `tests/unit/terrain-render-layers.unit.js`

**Interfaces:**
- Consumes: `PLANT_RENDER_SHAPES` from `biome-registry-schema.js`
- Produces: `PLANT_GEOMETRIES.cross`, `.horizontal`, `.face`
- Consumes plant data `{ x, y, z, plantId, facing? }`

- [ ] **Step 1: Write failing geometry and transform tests**

Populate one fern, lily pad, and vine. Assert mesh geometry identity and
instance transforms:

```javascript
assert.equal(fernMesh.geometry, PLANT_GEOMETRIES.cross)
assert.equal(lilyMesh.geometry, PLANT_GEOMETRIES.horizontal)
assert.equal(vineMesh.geometry, PLANT_GEOMETRIES.face)
assertFacingRotation(vineMesh, 0, 'east')
```

Assert reset, replacement rollback, capacity errors, and disposal still keep
shared geometries/materials alive.

- [ ] **Step 2: Run and confirm failure**

```bash
pnpm exec node --test tests/unit/terrain-render-layers.unit.js
```

Expected: FAIL because every plant currently uses
`sharedCrossPlaneGeometry`.

- [ ] **Step 3: Create and select shared geometries**

Export frozen shared geometries. `horizontal` lies slightly above the block
water plane to avoid z-fighting. `face` is offset by half a voxel plus a small
epsilon and has UV orientation matching the original vine texture.

Select geometry through:

```javascript
const geometry = getPlantGeometry(type.renderShape)
const mesh = new THREE.InstancedMesh(geometry, material, this.capacity)
```

- [ ] **Step 4: Apply facing transforms**

Keep current cross-plant Y offset. Lily pads use horizontal orientation and
water-level Y directly. Vines rotate around Y for four faces and translate
toward the attached face. Missing `facing` on a face plant is a validation
error before `populate()` mutates any mesh counts.

- [ ] **Step 5: Verify and commit**

```bash
pnpm exec node --test tests/unit/terrain-render-layers.unit.js
```

Expected: all tests PASS.

Commit:

```bash
git add src/js/world/terrain/plant-geometry.js src/js/world/terrain/plant-renderer.js src/js/world/terrain/blocks-config.js tests/unit/terrain-render-layers.unit.js
git commit -m "feat(flora): render lily pads and attached vines"
```

### Task 10: Integrate Surface Overlays and Deterministic Flora

**Files:**
- Modify: `src/js/world/terrain/terrain-generator.js`
- Modify: `src/js/world/terrain/biome-config.js`
- Create: `tests/unit/terrain-decoration-integration.unit.js`
- Modify: `tests/unit/terrain-biome-integration.unit.js`

**Interfaces:**
- Consumes: `resolveBiomeSurface()`, `hashDecoration()`, tree attachments
- Produces: `plantData` entries with optional `facing`

- [ ] **Step 1: Write failing forced-biome fixtures**

Build small deterministic containers for frozen ocean, swamp, badlands,
savanna, taiga, and jungle. Assert exact block and plant coordinates:

```javascript
test('frozen ocean fills a basin and places ice only at water level', () => {
  const result = generateForcedBiome('frozenOcean', { seed: 1337 })
  assert.ok(result.heightMap.flat().every(height => height < WATER_PARAMS.waterOffset))
  assert.ok(result.ice.every(block => block.y === WATER_PARAMS.waterOffset))
  assert.equal(result.plantData.length, 0)
})

test('swamp places trees on dry hummocks and lily pads over shallow water', () => {
  const result = generateForcedBiome('swamp', { seed: 1337 })
  assert.ok(result.treeRoots.every(root => root.surfaceY >= WATER_PARAMS.waterOffset))
  assert.ok(result.lilyPads.every(plant => plant.y === WATER_PARAMS.waterOffset))
})
```

- [ ] **Step 2: Run and confirm failure**

```bash
pnpm exec node --test tests/unit/terrain-decoration-integration.unit.js
```

Expected: FAIL because `_fillColumnLayers()` does not call surface rules and
flora still uses sequential RNG.

- [ ] **Step 3: Integrate surface layers and overlays**

For every filled Y, call `resolveBiomeSurface()` with world coordinates and
depth. After the terrain column is filled, place an overlay only when its
target block lies inside the container and is empty. Preserve existing
exposed-rock logic only for surface rules that opt into
`allowExposedRock: true`.

- [ ] **Step 4: Replace flora RNG with coordinate hashes**

Use independent salts:

```javascript
export const DECORATION_SALTS = {
  treeAccept: 0x1A2B3C4D,
  treeType: 0x2B3C4D5E,
  treeShape: 0x3C4D5E6F,
  floraAccept: 0x4D5E6F70,
  floraType: 0x5E6F7081,
}
```

Generate cross plants from allowed dry surfaces, lily pads only over
one-to-two-block shallow water, and vines only from tree attachment candidates.
Deduplicate plant coordinates before assigning `this.plantData`.

- [ ] **Step 5: Verify and commit**

```bash
pnpm exec node --test tests/unit/terrain-decoration-integration.unit.js tests/unit/terrain-biome-integration.unit.js tests/unit/tree-decoration.unit.js
```

Expected: all tests PASS.

Commit:

```bash
git add src/js/world/terrain/terrain-generator.js src/js/world/terrain/biome-config.js tests/unit/terrain-decoration-integration.unit.js tests/unit/terrain-biome-integration.unit.js
git commit -m "feat(terrain): integrate biome surfaces and flora"
```

### Task 11: Extend Debug Visualization and Tune Distribution

**Files:**
- Modify: `src/debug/biome-map.js`
- Modify: `biome-debug.html`
- Modify: `tests/benchmarks/biome-generator.bench.js`
- Create: `tests/browsers-biome-debug.test.js`

**Interfaces:**
- Consumes production `BiomeGenerator`
- Produces debug display modes `biome`, `transition`, and `landform`

- [ ] **Step 1: Write failing browser assertions**

Open `biome-debug.html`, wait for its ready marker, and assert the legend has
exactly twelve biome entries. Switch display modes and assert the canvas redraw
counter increments without console errors.

- [ ] **Step 2: Run and confirm failure**

```bash
pnpm exec playwright test tests/browsers-biome-debug.test.js --project=chromium
```

Expected: FAIL because the five new legend entries and landform mode are
missing.

- [ ] **Step 3: Add twelve colors and landform diagnostics**

Use a fixed color per approved biome ID. Read site `landform` only through
`getSitesInBounds()` for the optional site/landform overlay; do not duplicate
classification or noise code in the debug page.

- [ ] **Step 4: Run distribution and visual fixtures**

Run:

```bash
pnpm exec node tests/benchmarks/biome-generator.bench.js --distribution
pnpm exec playwright test tests/browsers-biome-debug.test.js --project=chromium
```

Expected: distribution exits `0`; browser test PASS with no console errors.
Inspect fixed seeds `0`, `7`, `42`, and `1337` at positive and negative chunk
seams.

- [ ] **Step 5: Commit**

```bash
git add src/debug/biome-map.js biome-debug.html tests/benchmarks/biome-generator.bench.js tests/browsers-biome-debug.test.js
git commit -m "feat(debug): visualize twelve-biome landform selection"
```

### Task 12: Finalize Benchmarks and Complete Verification

**Files:**
- Modify: `tests/benchmarks/full-chunk-generation.bench.js`
- Modify: `docs/superpowers/plans/2026-07-26-twelve-biome-baseline.md`
- Modify only if required by failing checks: files already listed in Tasks 1-11

**Interfaces:**
- Consumes: completed generator pipeline
- Produces: JSON benchmark output with median, P95, min, max, cache sizes, and deterministic digest

- [ ] **Step 1: Write the full-generation benchmark**

Generate a fixed `3x3` window of `64x32x64` chunks through the pure data
pipeline, including terrain, surfaces, ores, trees, flora, and AO, but excluding
WebGPU shader compilation. Warm up 5 seeds, measure 30, and hash block IDs plus
plant data to prove repeated runs are deterministic.

- [ ] **Step 2: Run focused and complete unit verification**

```bash
pnpm exec node --test tests/unit/biome-registry.unit.js tests/unit/biome-generator.unit.js tests/unit/biome-terrain-profile.unit.js tests/unit/biome-surface-rules.unit.js tests/unit/minecraft-asset-import.unit.js tests/unit/terrain-asset-integrity.unit.js tests/unit/tree-shape.unit.js tests/unit/tree-decoration.unit.js tests/unit/terrain-render-layers.unit.js tests/unit/terrain-decoration-integration.unit.js tests/unit/terrain-biome-integration.unit.js
```

Expected: all tests PASS with zero failures.

- [ ] **Step 3: Check performance budgets**

Run:

```bash
pnpm exec node tests/benchmarks/biome-generator.bench.js
pnpm exec node tests/benchmarks/full-chunk-generation.bench.js
```

Append both final JSON outputs to the baseline document. Calculate:

```text
growthPercent = (newP95 - baselineP95) / baselineP95 * 100
```

Biome P95 must be at most `10%`; full generation P95 must be at most `15%`.
If a budget fails, profile and optimize the measured hot path, then rerun both
benchmarks before changing any advisory budget.

- [ ] **Step 4: Run project and browser verification**

```bash
pnpm lint
pnpm build
pnpm exec playwright test tests/browsers-biome-debug.test.js --project=chromium
```

Expected: lint and build exit `0`; the Chromium test PASSes with no page or
console errors.

- [ ] **Step 5: Perform the visual acceptance checklist and commit evidence**

In forced-biome mode inspect all twelve biomes. In natural mode inspect fixed
seeds `0`, `7`, `42`, and `1337` for:

- frozen-ocean basin, ice coverage, and open-water cracks;
- snowy-plains openness;
- distinct spruce, birch, oak, cherry, swamp oak, acacia, and jungle shapes;
- swamp hummocks, shallow water, lily pads, and vines;
- continuous badlands bands;
- no visible positive or negative chunk seams;
- no biome-induced vertical walls.

Record pass/fail and the inspected coordinates in the baseline document.

Commit:

```bash
git add tests/benchmarks/full-chunk-generation.bench.js docs/superpowers/plans/2026-07-26-twelve-biome-baseline.md
git commit -m "test(biome): verify twelve-biome generation budgets"
```

## Completion Gate

Before claiming completion:

1. Re-run every command in Task 12 from a clean process.
2. Confirm `git status --short` contains no uncommitted files from this plan.
3. Confirm all twelve registry IDs appear in the distribution output.
4. Confirm the asset-integrity test reports no undeclared or missing texture.
5. Confirm benchmark growth stays within both approved limits.
6. Confirm every item in the visual acceptance checklist has coordinates and a
   recorded result.
