# Twelve-Biome Ecosystem Expansion Design

**Date:** 2026-07-26

**Status:** Approved design

**Scope:** New-world overworld biome selection, terrain profiles, surface
rules, voxel vegetation, lightweight flora rendering, and the personal-use
Minecraft Java Edition texture import used by `Third-Person-MC`

## Problem

The project currently defines seven biomes: plains, forest, birch forest,
cherry forest, desert, badlands, and frozen ocean. In practice, several are
hard to distinguish:

- Plains, forest, birch forest, and cherry forest share the same grass and dirt
  surface and depend mostly on tree frequency and tree textures.
- Frozen ocean has no reliable basin rule, ice cap, or underwater terrain
  profile, so it can generate like ordinary land with ice-colored blocks.
- Badlands has a single terracotta surface rather than red-sand caps and
  height-aligned terracotta bands.
- The current terrain profile has only `heightOffset` and `roughness`, which is
  insufficient to make swamps and snowy plains consistently flat while keeping
  jungles and badlands rugged.
- Existing tree placement supports only small, straight-trunk oak-like
  profiles. It cannot express spruce, acacia, swamp oak, or jungle silhouettes.
- Tree and flora placement consume a sequential RNG while iterating a chunk.
  This makes decoration behavior harder to reason about across regeneration and
  chunk boundaries.

Adding five climate anchors directly would increase the catalog to twelve, but
it would not make frozen ocean or swamp structurally distinct. It would also
make all twelve labels compete in the same two-dimensional climate space,
making occurrence rates harder to control.

## Goals

- Strengthen the seven existing biomes and add snowy plains, taiga, swamp,
  savanna, and jungle for a total of twelve.
- Keep the current deterministic macro-region field and organic, continuous
  biome transitions.
- Separate lowland/basin eligibility from ordinary land climate selection so
  frozen ocean and swamp have real terrain identities.
- Give every biome a readable combination of terrain, surface palette, tree
  silhouette, and flora.
- Keep biome, terrain, tree, and flora results deterministic from world seed
  and world coordinates, independent of chunk generation order.
- Prevent wide and tall tree shapes from being cut off at chunk boundaries.
- Keep the implementation data-driven so a future biome normally requires a
  registry entry and assets rather than edits to the classifier.
- Use allowlisted Minecraft Java Edition 1.21.11 default 16x16 textures for
  this personal-use project.
- Keep biome-map P95 within 10% of its pre-change baseline and full chunk
  generation P95 within 15% of its pre-change baseline.
- Preserve the WebGPU-only renderer, TSL/NodeMaterial patterns, resource
  ownership, and existing chunk streaming lifecycle.

## Non-goals

- Preserving the generated layout of existing worlds or seeds.
- Adding animals, hostile mobs, villages, temples, swamp huts, or other
  structures.
- Adding normal oceans, rivers, aquifers, caves, or a water-renderer rewrite.
- Reproducing Java Edition's full continentalness, erosion, weirdness,
  peaks-and-valleys, density functions, or biome color-map pipeline.
- Adding seasonal changes, weather-dependent surfaces, or dynamic snow.
- Providing redistribution rights for Mojang or Microsoft assets.
- Making the texture-import output suitable for a public or commercial
  repository.

## Approved Biome Catalog

| Biome ID | Display name | Selection role | Primary identity |
| --- | --- | --- | --- |
| `frozenOcean` | 冻洋 | Cold, wet basin | Submerged gravel basin, ice cap, sparse open water |
| `snowyPlains` | 雪原 | Very cold, open land | Flat snow surface, almost no trees |
| `taiga` | 针叶林 | Cold, humid land | Spruce trees, podzol patches, ferns |
| `birchForest` | 白桦木林 | Cool, temperate land | Tall birch trees and bright understory |
| `plains` | 平原 | Temperate, open land | Open grass, flowers, sparse oak |
| `forest` | 森林 | Temperate, humid land | Dense oak canopy and understory |
| `swamp` | 沼泽 | Warm, wet lowland | Shallow water, mud, dry hummocks, swamp oak |
| `cherryForest` | 樱花树林 | Warm, humid land | Cherry canopy, pink flowers, soft hills |
| `savanna` | 热带草原 | Hot, seasonal land | Dry grass, acacia silhouettes, long slopes |
| `desert` | 沙漠 | Very hot, dry land | Sand, cactus, dead bush |
| `badlands` | 恶地 | Hot, extremely dry land | Red sand cap, terracotta bands, rugged relief |
| `jungle` | 丛林 | Very hot, very humid land | Tall jungle trees, dense canopy, vines |

## Architecture

The macro-site system remains the owner of biome identity. Terrain shape and
categorical decoration remain consumers of its output:

```text
world seed + macro-cell coordinate
        |
        +--> deterministic site position
        |
        +--> temperature noise ---------+
        +--> humidity noise ------------+--> site biome label
        +--> landform noise ------------+
                                             |
world coordinate --> warped site distances --+--> continuous biome weights
                                                    |
                    +-------------------------------+--------------------+
                    |                               |                    |
            blended terrain profile         dominant surface       decoration
                    |                            rules                registry
                    v                               v                    v
              terrain height                 voxel columns       trees + flora
```

`BiomeGenerator` samples temperature, humidity, and landform only when it
creates a macro site. A world-column query still samples only the existing
boundary-warp field and site distances. No new per-column climate field is
introduced.

`TerrainGenerator` consumes a pure world-column sampler for height and surface
decisions. It does not contain biome-specific switch statements. Tree templates
and surface rules are separate pure modules.

## Macro-Site Classification

### Fields

The existing temperature, humidity, and boundary-warp noises remain. Add one
landform Simplex source seeded independently:

```javascript
landformNoise = new SimplexNoise(new RNG(seed + 4000))
```

The default landform scale is `512` blocks. The normalized site sample remains
in `[-1, 1]`; it is internal diagnostic data and is not added to the public
biome query contract.

### Special Lowland Rules

Classification uses this order:

1. Select `frozenOcean` when temperature is at most `0.28`, humidity is at
   least `0.52`, and landform is at most `-0.32`.
2. Otherwise select `swamp` when temperature is at least `0.42`, humidity is at
   least `0.70`, and landform is at most `-0.12`.
3. Otherwise select the nearest climate anchor among the ten ordinary land
   biomes.

These initial thresholds are configuration values. Distribution tests may tune
their numeric values before the implementation is accepted, but the rule
ordering and the three-way role split are fixed.

### Ordinary Land Anchors

| Biome | Temperature | Humidity |
| --- | ---: | ---: |
| Snowy plains | 0.08 | 0.22 |
| Taiga | 0.25 | 0.68 |
| Birch forest | 0.30 | 0.43 |
| Plains | 0.50 | 0.42 |
| Forest | 0.48 | 0.78 |
| Badlands | 0.62 | 0.08 |
| Cherry forest | 0.72 | 0.68 |
| Savanna | 0.78 | 0.32 |
| Desert | 0.92 | 0.14 |
| Jungle | 0.92 | 0.88 |

Distance uses equal temperature and humidity weights. Candidate ties use biome
ID lexical order so object declaration order cannot affect world generation.

### Transition Contract

The existing macro-region distance weighting remains. Raw site weights are
combined by biome ID and normalized. The dominant biome is the biome with the
greatest combined weight; ties use biome ID lexical order.

Continuous numeric terrain properties use all normalized weights. Categorical
surface, tree, flora, debug color, and external biome identity use the dominant
biome only.

`getBiomeAt()` and `generateBiomeMap()` keep their current public shape:

```javascript
{
  biome: 'taiga',
  temp: 0.24,
  humidity: 0.66,
  weights: {
    snowyPlains: 0.15,
    taiga: 0.85,
  },
}
```

Seed or biome-parameter changes invalidate biome-map and site caches, including
the new landform-derived site labels.

## Data-Driven Biome Registry

Each biome definition owns selection metadata and categorical content:

```javascript
{
  id: 'taiga',
  name: '针叶林',
  selection: {
    role: 'land',
    climate: { temperature: 0.25, humidity: 0.68 },
  },
  terrain: {
    heightOffset: 0,
    roughness: 0.95,
    flatness: 0.15,
  },
  surface: {
    rule: 'taiga',
  },
  vegetation: {
    enabled: true,
    density: 0.12,
    minSpacing: 3,
    types: [/* weighted tree descriptors */],
  },
  flora: {
    enabled: true,
    density: 0.16,
    types: [/* weighted plant descriptors */],
  },
}
```

The registry validator fails during world initialization when it finds:

- duplicate or empty biome IDs;
- non-finite or out-of-range climate values;
- an unknown selection role;
- non-finite terrain values or `flatness` outside `[0, 1]`;
- missing surface rules or referenced block IDs;
- unknown tree shapes or plant render shapes;
- negative density, negative weights, or a positive-density list whose total
  weight is zero;
- an allowed-surface reference that cannot be produced by that biome's surface
  rule.

There is no silent plains fallback after registry validation succeeds.

## Continuous Terrain Profiles

The terrain profile becomes:

```javascript
{
  heightOffset,
  roughness,
  flatness,
}
```

All three values are blended from normalized biome weights before height
calculation. `flatness` compresses the terrain-noise range without changing the
global fBM source:

```javascript
const compressedNoise = clamp(terrainNoise, -0.25, 0.25)
const shapedNoise = mix(terrainNoise, compressedNoise, flatness)
const height = floor(
  baseOffset
  + heightOffset
  + baseMagnitude * shapedNoise * roughness
)
```

Initial profiles, measured in block offsets relative to the existing base
height, are:

| Biome | Height offset | Roughness | Flatness |
| --- | ---: | ---: | ---: |
| Frozen ocean | -10 | 0.75 | 0.80 |
| Snowy plains | 0 | 0.78 | 0.45 |
| Taiga | 0 | 0.95 | 0.15 |
| Birch forest | 0 | 0.95 | 0.10 |
| Plains | 0 | 0.75 | 0.35 |
| Forest | 0 | 1.10 | 0.10 |
| Swamp | -7 | 0.75 | 0.80 |
| Cherry forest | 1 | 1.05 | 0.15 |
| Savanna | 0 | 1.00 | 0.25 |
| Desert | 1 | 1.10 | 0.25 |
| Badlands | 2 | 1.35 | 0 |
| Jungle | 1 | 1.20 | 0.05 |

The frozen-ocean and swamp offsets assume the current default terrain base
height and water level. Tests assert their relationship to the configured
water level; if the shared terrain defaults change, the profile defaults must
change in the same commit.

The final block height is clamped to the terrain container only after the
continuous calculation.

## Surface Rules

Create a pure surface-rule registry. A rule receives:

```javascript
{
  biomeId,
  worldX,
  worldZ,
  y,
  surfaceHeight,
  depthFromSurface,
  waterLevel,
  columnHash,
}
```

It returns block IDs and optional overlay instructions. The caller evaluates
the rule using the dominant biome. Numeric transition weights never randomly
mix categorical surface blocks.

Approved rules:

- **Frozen ocean:** gravel surface and subsurface over stone. When the terrain
  is below water level, place an ice block at water level using a default ice
  coverage target of `0.85`. Across the fixed visual sample, accepted coverage
  is `0.75..0.90`. A low-frequency deterministic crack mask leaves connected
  open-water patches rather than pixel noise.
- **Snowy plains:** snow-block surface over dirt and stone. This scope uses a
  full snow surface block, not thin snow-layer geometry.
- **Taiga:** grass/dirt with deterministic podzol patches beneath and around
  spruce candidates.
- **Birch forest, plains, forest, cherry forest:** grass/dirt/stone with their
  existing exposed-rock behavior and biome-specific decoration.
- **Swamp:** mud for submerged columns, swamp-tinted grass over dirt on dry
  hummocks, then stone. Only dry hummocks permit tree roots.
- **Savanna:** savanna-tinted grass over dirt and stone.
- **Desert:** sand surface and subsurface over stone.
- **Badlands:** a red-sand cap two to three blocks deep. Deeper exposed layers
  select white, light-gray, yellow, orange, red, brown, or base terracotta from
  a world-height band sequence offset by a low-frequency column hash. Bands
  depend on world coordinates and cannot reset at chunk boundaries.
- **Jungle:** jungle-tinted grass over dirt and stone.

Fixed per-biome grass and foliage tints reuse original grayscale textures.
Implementing Java Edition's complete biome color maps is explicitly out of
scope.

Water rendering remains the existing shared horizontal water surface. Frozen
ocean and swamp obtain their water identity from terrain height, overlay
blocks, and decoration rather than a second water renderer.

## Tree Templates

`placeTree(shape, context)` remains a pure entry point. Replace the assumption
that every tree is one vertical trunk plus circular leaf disks with named
template functions:

- `oak`, `birch`, and `cherry`: preserve the approved existing small-tree
  profiles.
- `spruce`: straight trunk, height `6..10`, tapered conical leaf layers with a
  maximum radius of `3`.
- `swampOak`: trunk height `4..7`, optional one-block lean, broad irregular
  canopy with a maximum radius of `3`, and vine attachment candidates.
- `acacia`: trunk height `5..8`, one deterministic bend or branch, and one or
  two flat canopy disks with a maximum radius of `3`.
- `jungle`: trunk height `9..14`, broad upper canopy with a maximum radius of
  `4`, sparse lower leaf clusters, and vine attachment candidates.
- `none`: preserve cactus-style trunk-only placement.

Templates return placed trunk and leaf counts plus attachment candidates.
They do not access `Experience`, renderer state, loaded chunks, or global
randomness.

## Deterministic Cross-Chunk Decoration

Replace sequential decoration RNG decisions with coordinate hashes:

```text
hash(worldSeed, worldX, worldZ, decorationSalt)
```

The hash determines candidate acceptance, weighted type choice, height,
orientation, branch direction, canopy variation, and flora choice. Separate
salts prevent adding a flower type from changing tree placement.

For trees:

1. Enumerate possible roots in the current chunk plus the maximum registered
   canopy radius.
2. Run the cheap coordinate-hash density and spacing tests first.
3. For accepted candidates only, sample the root's world-column biome, height,
   and surface using the pure terrain-column sampler.
4. Generate the complete tree in world coordinates.
5. Write only tree blocks whose coordinates belong to the current chunk.

Every adjacent chunk independently evaluates the same boundary candidates and
therefore reconstructs its portion of the same tree. Chunks never mutate each
other and results do not depend on load order.

Minimum spacing uses deterministic priority: a candidate survives only when
its priority hash is greater than every candidate within that biome/type's
configured spacing radius. Jungle uses a larger spacing than ordinary forest
trees so its broad canopies do not seal the whole view.

## Flora and Lightweight Attachment Rendering

Plant configuration gains a render shape:

- `cross`: grass, flowers, ferns, and dead bush;
- `horizontal`: lily pads at water level;
- `face`: vines attached to a tree trunk or leaf face.

Plant instance data becomes:

```javascript
{
  x,
  y,
  z,
  plantId,
  facing,
}
```

`facing` is omitted for cross plants, horizontal for lily pads, and one of the
four horizontal block faces for vines. The renderer builds shared geometries
per render shape and keeps the current instanced WebGPU/TSL material pattern.

Decoration order is:

1. terrain columns and water-relative overlays;
2. voxel trees;
3. tree attachment candidates such as vines;
4. ground and water-surface flora;
5. ambient occlusion and mesh generation.

Special constraints:

- Swamp oak roots require a dry hummock at or above water level. Lily pads
  require shallow water and an unobstructed water surface.
- Frozen ocean has no tree or ground-flora pass.
- Snowy plains flora density is at most `0.03` and has no default trees.
- Jungle tree spacing is at least `5` blocks even when density configuration
  would accept closer candidates.
- Desert and badlands decoration remains sparse and deterministic.

## Personal-Use Java Texture Import

Add a `pnpm` script backed by `scripts/import-minecraft-assets.mjs`. It:

1. resolves the pinned Minecraft Java Edition `1.21.11` metadata from Mojang's
   official version manifest;
2. downloads the client archive into a project-local ignored cache;
3. verifies the archive SHA-1 from the version metadata;
4. extracts only an explicit allowlist of required block and plant PNG files;
5. writes them under a versioned project asset directory;
6. reports every missing allowlisted archive path and exits non-zero without
   leaving a partially updated asset set.

The extractor uses one small `pnpm` development dependency capable of reading
ZIP/JAR entries. It writes to a temporary sibling directory and performs a
validated directory swap only after the full allowlist succeeds.

The allowlist includes:

- spruce, acacia, and jungle logs and leaves;
- podzol, mud, snow, ice, packed ice, gravel, red sand, sand, and stone;
- base, white, light-gray, yellow, orange, red, and brown terracotta;
- fern, vine, lily pad, dead bush, and the existing flowers referenced by the
  twelve-biome registry. Large fern is not part of this scope.

All extracted textures are declared in `src/js/sources.js` and consumed through
`this.experience.resources.items`. Runtime world generation performs no
network access.

The imported files are accepted only for this personal-use scope. The design
does not claim permission to publish or commercially redistribute them. The
project documentation must call out this constraint beside the import command.

## Cache and Lifecycle

- The existing biome-map and bounded site caches remain.
- Site entries add one finite `landform` value and the final classified biome
  ID.
- Coordinate-hash decoration decisions require no unbounded cache.
- A small per-chunk accepted-tree candidate list exists only for the duration
  of chunk generation and is released before mesh generation completes.
- Shared geometries and materials for new block and plant types follow the
  existing renderer ownership and disposal lifecycle.
- Destroy and world reset clear biome caches and release all new texture,
  material, geometry, and event resources.

## Expected Code Boundaries

- Modify `src/js/config/chunk-config.js`: add landform scale and special-role
  thresholds.
- Modify `src/js/sources.js`: declare imported texture assets.
- Modify `src/js/world/terrain/biome-config.js`: define the twelve-biome
  registry and decoration data.
- Modify `src/js/world/terrain/biome-generator.js`: sample site landform,
  apply special-role classification, and select dominant combined weight.
- Modify `src/js/world/terrain/biome-terrain-profile.js`: validate and blend
  `flatness`.
- Modify `src/js/world/terrain/terrain-biome-field.js`: expose a reusable pure
  world-column height sampler.
- Create `src/js/world/terrain/biome-surface-rules.js`: pure categorical
  surface and overlay decisions.
- Modify `src/js/world/terrain/terrain-generator.js`: use surface rules and the
  deterministic decoration passes.
- Modify `src/js/world/terrain/tree-shape.js`: add named branching and conical
  templates plus attachment candidates.
- Modify `src/js/world/terrain/blocks-config.js`: register new blocks, plants,
  tints, textures, and render shapes.
- Modify the existing terrain mesh/plant instance component that currently
  constructs cross-plane flora: add horizontal and face geometries without
  changing Vue ownership.
- Modify `src/debug/biome-map.js` and `biome-debug.html`: add the five biome
  colors and an optional landform view.
- Create `scripts/import-minecraft-assets.mjs`: pinned, verified, allowlisted
  personal-use import.
- Add focused unit and benchmark coverage under `tests/unit/` and
  `tests/benchmarks/`.

No Vue menu, persistence format, crafting recipe, player control, interaction,
mob, structure, or renderer-backend changes are expected.

## Failure Policy

- Invalid world coordinates and generation parameters fail with the existing
  typed errors.
- Invalid biome registries fail before chunk generation.
- A missing imported texture fails the asset-integrity test and resource
  bootstrap; it does not hang the loading screen or substitute an unrelated
  texture.
- Texture download, checksum, or extraction failure preserves the previous
  complete imported asset directory.
- An unknown surface, tree, or plant shape is a configuration error, not a
  runtime fallback.
- Decoration outside vertical chunk bounds is clipped safely and does not
  allocate overflow storage.

## Automated Verification

Focused tests cover:

1. The registry contains exactly twelve unique IDs and every referenced block,
   tree shape, plant, and surface rule exists.
2. Fresh generators return deeply equal results for the same seed and world
   coordinates, before and after cache clears.
3. Different seeds change site placement, landform classification, or
   decoration in a fixed sample.
4. Generated maps match point queries across positive and negative chunk
   seams.
5. Every biome-weight object is finite, non-negative, and normalized.
6. Special lowland rule ordering classifies frozen ocean before swamp.
7. A `2048x2048` diagnostic suite for seeds `0..31` observes each biome in at
   least 24 of the 32 samples. Aggregated across all samples, every biome owns
   between 1% and 20% of classified sites, and no biome owns more than 35% of
   sites in any one sample.
8. Connected-component checks retain the macro-region stable-core guarantee.
9. Blended height offset, roughness, and flatness remain continuous and within
   configured bounds across all sampled transitions.
10. Frozen-ocean terrain lies below water level and its ice mask is connected
    rather than single-column noise.
11. Swamp diagnostics contain both shallow water and dry hummocks.
12. Badlands band choice is identical on both sides of chunk seams.
13. Surface-rule outputs contain only registered block IDs.
14. Spruce, swamp oak, acacia, and jungle tree shape fixtures match approved
    block-coordinate snapshots.
15. A boundary tree reconstructed by two independent chunk generators equals
    the same tree generated in one combined test container.
16. Tree and flora results do not change when chunk generation order is
    reversed.
17. Cross, horizontal, and face plant instances select the correct geometry
    and render layer.
18. The texture allowlist, extracted files, source declarations, and block or
    plant references agree exactly.
19. Invalid registry values and missing assets produce the documented
    failures.
20. Extended traversal keeps biome caches within their configured limits and
    leaves no decoration cache growth.

Run focused tests with explicit paths through `pnpm exec node --test`, followed
by:

```bash
pnpm lint
pnpm build
```

Run the focused Chromium Playwright test when plant render shapes, resource
loading, or the biome debug page changes.

## Performance Acceptance

Capture fresh pre-change baselines on the implementation machine before making
generation changes.

- The existing biome-map benchmark continues to generate a fixed multi-chunk
  window for at least 30 measured seeds after warmup. Its new P95 must not
  exceed the captured baseline by more than 10%.
- Add a full chunk benchmark that includes terrain, surfaces, trees, flora, AO,
  and mesh-data preparation but excludes shader compilation. Its new P95 must
  not exceed the captured baseline by more than 15%.
- Coordinate-hash rejection happens before expensive external-root terrain
  samples.
- No site, biome-map, tree-candidate, plant, material, or texture collection
  grows without a documented owner and bound.

## Visual Acceptance

Use fixed seeds and forced-biome debug mode to inspect every biome:

- Frozen ocean reads as a basin with an ice cap and coherent open-water cracks.
- Snowy plains reads as open snow rather than a white forest.
- Taiga, birch, oak forest, cherry forest, savanna, swamp, and jungle are
  identifiable from tree silhouettes before inspecting textures closely.
- Swamp has shallow water, dry tree islands, lily pads, and hanging vines.
- Badlands exposes red-sand caps and continuous horizontal terracotta bands.
- Jungle feels dense without broad canopies completely blocking traversal and
  sight lines.
- Grass and foliage colors distinguish swamp, savanna, and jungle without
  visible per-column color noise.
- Biome transitions curve organically, terrain does not form biome-induced
  vertical walls, and surfaces remain categorically coherent.
- Trees, vines, ice masks, terracotta bands, and flora do not reveal positive
  or negative chunk boundaries.

The feature is complete only when automated, performance, and visual acceptance
all pass.
