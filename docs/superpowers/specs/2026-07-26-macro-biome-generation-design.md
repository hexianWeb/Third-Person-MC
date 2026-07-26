# Macro Biome Generation Design

**Date:** 2026-07-26

**Status:** Approved design

**Scope:** Overworld biome distribution and biome-to-terrain transitions in `Third-Person-MC`

## Problem

The current biome generator samples one temperature Simplex field and one
humidity Simplex field at every world column. It selects the first biome whose
rectangular climate ranges contain that point. Terrain generation then applies
that biome's `heightOffset` and `heightMagnitude` directly to the shared fBM
sample.

This produces two visible failures:

- A climate value crossing a rectangular range boundary can immediately change
  `heightMagnitude` from `0.5` to as much as `5`, producing vertical walls and
  isolated columns at biome edges.
- Smooth temperature and humidity fields can cross several classification
  boundaries near a saddle or range corner, producing isolated biome fragments
  only a few blocks across.

The existing `_getBiomeWeights()` does not solve either failure consistently.
It blends only when more than one range-centered ellipse accepts the climate
point, so many categorical boundaries still have no weights at all. Its
candidate geometry also differs from `_getBiome()`'s rectangular geometry.

For seed `1337`, a `512×512` diagnostic sample measured:

- `10.23%` of columns with biome blend weights.
- `38.75%` of categorical biome-boundary edges with an effective terrain
  parameter jump of at least `1`.
- A maximum adjacent `heightOffset` jump of `2`.
- A maximum adjacent `heightMagnitude` jump of `4.5`.
- Several interior connected biome components with areas between `1` and `36`
  columns.

The existing climate-only workload for a `3×3` window of `64×64` chunks has a
local median of `11.06 ms` and P95 of `12.89 ms` across 30 measured runs after
warmup.

## Goals

- Produce broad, coherent biomes with an original-Minecraft-like sense of
  climate continuity without implementing modern Minecraft's complete
  multi-noise or erosion systems.
- Eliminate biome-induced vertical walls, spikes, and one-column terrain
  discontinuities.
- Prevent isolated biome regions with only five or six columns of area by
  construction rather than by chunk-local cleanup.
- Keep the existing global fBM terrain generator as the only multi-octave
  height source.
- Keep biome generation deterministic from seed and world coordinates,
  including negative coordinates and chunk seams.
- Keep biome generation no slower than the measured current climate workload.
- Preserve the existing `BiomeGenerator.getBiomeAt()` and
  `generateBiomeMap()` consumer contracts wherever practical.
- Preserve current block, vegetation, flora, chunk streaming, persistence, and
  debug behavior unless this design explicitly changes it.

## Non-goals

- Reproducing Java Edition 1.18+ continentalness, erosion, weirdness,
  peaks-and-valleys, spline routing, aquifers, caves, or density functions.
- Adding worker threads or changing the chunk generation queue.
- Running iterative erosion, neighbor relaxation, or connected-component
  cleanup while a chunk is generated.
- Adding new biome assets or redefining the available biome catalog.
- Reworking water, rivers, caves, ores, persistence, or rendering.
- Making biome boundaries visually fuzzy through nondeterministic mixtures of
  unrelated surface blocks.

## Architecture

Terrain shape and biome identity become separate inputs that meet only through
a bounded terrain profile:

```text
world seed + coordinates
        |
        +--> global fBM ---------------------> base terrain height
        |
        `--> macro biome field
              |-- cached climate at sites
              |-- climate-anchor biome label
              `-- continuous region weights
                         |
                         +--> bounded terrain profile adjustment
                         +--> dominant surface biome
                         `--> dominant vegetation/flora biome
```

`BiomeGenerator` owns the macro biome field. It remains shared by all chunks
through `ChunkManager`. `TerrainGenerator` continues to own height sampling and
column filling. It consumes the continuous biome weights to calculate a
terrain profile, but it uses one dominant biome for categorical content.

No result depends on which chunk was generated first, what neighboring chunks
are loaded, or any mutable simulation state.

## Macro Region Field

### Site Placement

The world is divided into square macro cells with a default
`regionSize` of `128` blocks. Every macro cell owns exactly one biome site.
The site begins at the cell center and receives a deterministic seeded jitter
of at most `regionJitter = 0.25` cell widths on each axis:

```text
siteX = (cellX + 0.5 + jitterX) * regionSize
siteZ = (cellZ + 0.5 + jitterZ) * regionSize
jitterX, jitterZ in [-0.25, 0.25]
```

Jitter comes from a coordinate hash using the world seed and macro cell
coordinates. Adjacent sites are therefore separated by at least `64` blocks
before coordinate warping. A site's Voronoi region contains a stable core with
an approximate radius of at least `32` blocks, preventing five- or six-column
biome islands by construction.

For a world position, the generator searches the `3×3` macro-cell neighborhood
around the warped coordinate. This is sufficient because each site stays
inside the central half of its owning macro cell.

### Organic Boundary Warp

Unmodified Voronoi regions expose long straight edges. Before site-distance
evaluation, the world coordinate receives a low-cost continuous warp:

```text
warpedX = worldX + warpX(worldX, worldZ) * warpStrength
warpedZ = worldZ + warpZ(worldX, worldZ) * warpStrength
```

The defaults are `warpScale = 96` and `warpStrength = 12`. `warpX` and `warpZ`
are two offset samples from one seeded, single-octave noise source. They do not
use fBM and do not participate in terrain height. The new per-column warp cost
replaces the current per-column temperature and humidity samples; it does not
add a third climate-noise layer.

The warp is smooth and weak relative to the guaranteed site separation, so it
curves boundaries without collapsing stable region cores.

### Climate Sampling and Biome Labels

Temperature and humidity are sampled only when a biome site is created. Their
noise scales default to `384` blocks, producing gradual climate changes across
neighboring sites. The values remain normalized to `[0, 1]`.

Each biome defines one climate anchor:

```javascript
climate: {
  temperature: 0.5,
  humidity: 0.5,
}
```

The site's biome is the anchor with the smallest normalized Euclidean distance
from the site's temperature and humidity. This replaces rectangular
`tempRange` and `humidityRange` membership. It has no gaps, no overlapping
range ambiguity, no fallback-to-plains holes, and no dependence on object
declaration order.

The approved initial anchors preserve the current catalog's intended climate
ordering:

| Biome | Temperature | Humidity |
| --- | ---: | ---: |
| Frozen ocean | 0.10 | 0.80 |
| Birch forest | 0.25 | 0.45 |
| Badlands | 0.55 | 0.10 |
| Plains | 0.50 | 0.45 |
| Forest | 0.48 | 0.78 |
| Desert | 0.88 | 0.18 |
| Cherry forest | 0.78 | 0.72 |

Temperature and humidity use equal distance weights initially. Anchor values
are static world-generation configuration, not runtime UI preferences.

## Continuous Region Weights

For each queried position, the generator calculates distances to the nine
candidate sites. Let `nearestDistance` be the smallest distance. A site's raw
weight is:

```javascript
const proximity = Math.max(
  0,
  1 - (siteDistance - nearestDistance) / transitionWidth,
)
const rawWeight = proximity * proximity
```

The default `transitionWidth` is `20` blocks. Only sites within that distance
band of the nearest site contribute. Raw weights are summed by biome ID, then
normalized so all returned weights are finite, non-negative, and total `1`.

The returned dominant biome is the biome with the greatest combined weight.
When every contributing site has the same biome, the result is represented as
a single `{ [biomeId]: 1 }` weight rather than an artificial transition.

The weight function reaches zero continuously at the edge of its support.
Entering or leaving a transition band therefore cannot cause a terrain-profile
jump. Triple junctions remain continuous because all nine candidates
participate before weights are combined.

## Terrain Profile

The current `heightMagnitude` multiplier is replaced by a bounded
`roughness` profile. The approved initial range is `0.75` through `1.35`; any
invalid configuration outside that range is clamped when the profile is read.

The initial profiles are:

| Biome | Height offset | Roughness |
| --- | ---: | ---: |
| Frozen ocean | 0 | 0.80 |
| Birch forest | 0 | 0.95 |
| Badlands | 2 | 1.35 |
| Plains | 0 | 0.75 |
| Forest | 0 | 1.10 |
| Desert | 1 | 1.15 |
| Cherry forest | 0 | 1.10 |

For each world column:

```javascript
const baseVariation = baseMagnitude * terrainNoise
const blendedOffset = weightedBiomeParam('heightOffset')
const blendedRoughness = weightedBiomeParam('roughness')
const finalHeight = baseOffset
  + blendedOffset
  + baseVariation * blendedRoughness
```

`terrainNoise` remains the existing five-octave fBM value sampled in world
coordinates. There is no biome-specific second height noise, slope relaxation,
or neighbor-dependent pass.

Both profile parameters are blended before height is calculated. A categorical
biome change cannot alter the height formula because categorical identity is
not used by the formula. Flooring to a block height happens only after the
continuous calculation and world-height clamp.

## Categorical Surface and Decoration

The dominant biome controls:

- Surface, subsurface, and deep block mappings.
- Tree configuration and type selection.
- Flora configuration and type selection.
- External biome ID queries and biome debug colors.

Biome weights do not randomly choose grass, sand, or terracotta per layer. The
current `_selectBiomeBlockWithWeights()` behavior, which uses `Math.random()`,
is removed from terrain filling. Surface and subsurface in one column always
come from the same deterministic dominant biome, except for the existing
water/shore and exposed-rock rules.

This intentionally preserves a crisp, block-aligned Minecraft biome boundary
while giving that boundary an organic large-scale shape. Only height-related
numeric properties blend across the transition band.

Vegetation and flora remain categorical so small weight changes cannot create
isolated cactus, cherry, or tree placements inside another biome. Their
existing seeded placement behavior is preserved.

## Public Data Contract

`getBiomeAt(worldX, worldZ)` and every cell returned by
`generateBiomeMap(originX, originZ, chunkWidth)` return:

```javascript
{
  biome: 'plains',
  temp: 0.5,
  humidity: 0.5,
  weights: {
    plains: 0.8,
    forest: 0.2,
  },
}
```

`temp` and `humidity` are the normalized, weight-averaged climate values of
the contributing sites. They are diagnostic climate values, not fresh
per-column noise samples.

`weights` is always a normalized object in generator mode. Callers must not
use `null` to distinguish single and blended regions; a single region has one
entry with weight `1`. Panel-forced biome mode may continue to construct a
single-weight result directly.

`generateBiomeMap()` keeps its current `[x][z]` orientation. TerrainGenerator
continues storing its own public maps as `[z][x]`, performing the existing
orientation conversion while consuming the generated map.

## Configuration Ownership

Static macro-biome defaults move to `src/js/config/chunk-config.js` as
`BIOME_PARAMS`, alongside other chunk world-generation defaults:

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

`ChunkManager` creates the shared `BiomeGenerator` with these parameters.
`BiomeGenerator.updateParams()` accepts the same names for debug regeneration,
validates finite positive scales and cache sizes, clamps
`regionJitter` to `[0, 0.25]`, and clamps `transitionWidth` so it cannot exceed
half the guaranteed minimum site separation.

Changing seed or any biome-generation parameter invalidates both the chunk
biome-map cache and site cache. A seed change reconstructs all seed-derived
noise and hash state before chunks regenerate.

## Cache and Lifecycle

Two caches remain:

- The existing biome-map cache is keyed by origin and chunk width:
  `"originX,originZ,chunkWidth"`. Including width prevents returning an
  incompatible map for a different caller.
- A site LRU cache is keyed by macro cell coordinates. Its default maximum is
  `2048` entries. Access refreshes recency, and inserting above the limit
  evicts the least recently used entry.

A site cache entry contains only site coordinates, temperature, humidity, and
the selected biome ID. It contains no chunk, scene, renderer, or mutable
terrain reference.

`clearCache(originX, originZ, chunkWidth)` removes one biome map.
`clearAllCache()` clears both maps and sites. Chunk unload continues clearing
its biome map, while the bounded site cache preserves nearby reuse safely.
Destroy and world reset leave no unbounded biome data behind.

## Failure and Validation Policy

All public coordinate queries require finite numbers. Invalid coordinates
throw `TypeError` with the operation and received values because silently
caching `NaN` coordinates would poison deterministic generation.

Invalid constructor or update parameters follow these rules:

- Non-finite or non-positive scales, sizes, transition widths, and cache limits
  throw `RangeError`.
- Non-integer cache limits are floored after validation.
- `regionJitter` and terrain `roughness` use the explicit clamps described
  above.
- A biome without finite climate anchors or terrain parameters fails fast
  during generator construction rather than during a later chunk build.
- If no configured biome exists, construction throws instead of silently
  returning plains.

No runtime fallback changes the seed, returns random blocks, or reads a loaded
neighbor chunk.

## Debug Visualization

The existing biome debug map is updated to use the same production
`BiomeGenerator` and configuration. It supports two views:

- Dominant biome colors, showing actual categorical regions.
- Transition strength, showing `1 - max(weights)` as a grayscale overlay.

The visualization displays macro-site positions and chunk boundaries as
optional overlays. It must query production APIs rather than duplicate the
region algorithm. Debug parameter changes call `updateParams()`, clear both
caches, and redraw.

Visual review covers:

- Plains to desert.
- Plains to badlands.
- Plains or birch forest to forest.
- Forest to cherry forest.
- A macro-region triple junction.
- Positive and negative chunk seams.

## Expected File Boundaries

- Modify `src/js/config/chunk-config.js`: own `BIOME_PARAMS`.
- Modify `src/js/world/terrain/biome-config.js`: replace climate ranges with
  climate anchors and replace `heightMagnitude` with bounded `roughness`.
- Rewrite `src/js/world/terrain/biome-generator.js`: deterministic site
  placement, boundary warp, site climate classification, continuous weights,
  validation, and bounded caches.
- Create `src/js/world/terrain/biome-terrain-profile.js`: pure validation and
  weighted terrain-profile calculation used by terrain generation and unit
  tests.
- Modify `src/js/world/terrain/terrain-generator.js`: calculate the global fBM
  base variation once, apply the blended profile, and use dominant biome blocks
  instead of random weighted block selection.
- Modify `src/js/world/terrain/chunk-manager.js`: construct and reseed the
  shared generator from `BIOME_PARAMS` without changing streaming scheduling.
- Modify `src/debug/biome-map.js` and `biome-debug.html`: expose dominant,
  transition, site, and chunk-boundary visualization.
- Add `tests/unit/biome-generator.unit.js`: deterministic macro-region,
  continuity, seam, cache, parameter, and component-size coverage.
- Add `tests/unit/biome-terrain-profile.unit.js`: pure profile validation and
  blending coverage.

No Vue, renderer, material, asset, persistence, or dependency file changes are
expected.

## Automated Verification

Tests use the existing Node test style through:

```bash
pnpm exec node --test tests/unit/biome-generator.unit.js tests/unit/biome-terrain-profile.unit.js
```

Focused automated coverage verifies:

1. Same seed and world coordinate return deeply equal biome data across fresh
   generator instances, cache clears, and repeated calls.
2. Different seeds produce different site layouts or biome labels in a fixed
   sample.
3. `generateBiomeMap()` matches `getBiomeAt()` at every sampled coordinate,
   including negative chunk origins.
4. Adjacent chunks agree with point queries on both sides of their seam.
5. Every weight is finite and non-negative, and each weight object sums to `1`
   within floating-point tolerance.
6. A single-biome region returns exactly one weight of `1`.
7. Site separation and configured jitter preserve the structural stable-core
   bound.
8. Interior connected components in fixed `512×512` samples across multiple
   seeds have no component area below `32` columns.
9. Seed `1337` no longer produces the measured seven-block plains/desert
   height jump between world columns `(83, 6)` and `(84, 6)`.
10. Blended `heightOffset` and `roughness` vary continuously across sampled
    transitions and remain within approved profile bounds.
11. The terrain-profile helper produces identical output regardless of weight
    object insertion order.
12. Cache keys distinguish chunk width, the site cache stays within `2048`
    entries, and parameter or seed changes invalidate old results.
13. Invalid coordinates and generator parameters fail with the documented
    error types.

Project verification then runs:

```bash
pnpm lint
pnpm build
```

The existing browser test is run if the debug page or runtime integration
requires browser-only coverage:

```bash
pnpm test:chrome
```

## Performance Acceptance

The local benchmark generates a fresh `BiomeGenerator` and one `3×3` chunk
window of `64×64` columns for at least 30 measured seeds after five warmup
runs. The same Node version and idle machine conditions are used before and
after the change.

The design passes when:

- Median biome generation time does not exceed the current `11.06 ms`
  baseline.
- P95 does not exceed the current `12.89 ms` baseline by more than `10%`.
- Site cache size never exceeds its configured limit during extended
  traversal.
- The generated chunk window is byte-for-behavior deterministic across
  benchmark repetitions.
- ChunkManager scheduling, render-slot compilation counts, and mesh lifetimes
  are unchanged.

## Visual Acceptance

Using seed `1337`, compare the same world areas before and after the change.
The result is accepted when:

- No biome boundary produces a vertical wall or isolated stone column caused
  by a terrain-profile switch.
- Desert, badlands, plains, forest, birch forest, cherry forest, and frozen
  ocean appear as broad readable regions rather than scattered fragments.
- Biome boundaries curve organically and do not reveal the `128`-block macro
  grid.
- Surface blocks remain categorical and coherent at the edge rather than
  appearing as random grass/sand/terracotta noise.
- Terrain and biome identity remain continuous across positive and negative
  chunk seams.
- Newly generated chunks do not create a perceptible biome-generation stall
  beyond the existing terrain and mesh-generation work.
