# Vanilla-like Tree Foliage Design

Date: 2026-07-26  
Status: approved for implementation planning

## Goal

Replace the current spherical canopy + random hole leaf placement with **layered leaf disks + light horizontal branches**, so oak / birch / cherry look closer to vanilla Minecraft small trees. Cactus stays trunk-only.

This is an **approximation**, not a 1:1 port of Minecraft tree features / fancy oaks / giant trees.

## Problem

Current logic in `TerrainGenerator._generateVegetation`:

- Fills a sphere centered at trunk top (`dx²+dy²+dz² ≤ R²`)
- Randomly skips blocks via `canopyDensity` (also inverted vs its name)
- Same algorithm for all leafy trees; only `heightRange` / `canopyRadius` differ

Result: round, sparsely punched canopies unlike vanilla layered foliage.

## Decisions

| Topic | Choice |
|-------|--------|
| Fidelity | Layered canopy approximation (not full vanilla feature port) |
| Species | Separate templates for oak, birch, cherry; cactus = `none` |
| Branches | Include short horizontal branch logs (species-specific counts) |
| Cross-chunk canopy | Out of scope |
| Fancy / giant trees | Out of scope |
| Density / biome spawn rates | Unchanged |

## Architecture

```
biome-config vegetation.types
  → generateTrees / _generateVegetation
    → placeTree(shape, ctx)   // new module
      → placeOakTree | placeBirchTree | placeCherryTree | trunk-only
```

### New module: `src/js/world/terrain/tree-shape.js`

Pure placement helpers. No Experience / Three.js dependency.

```js
placeTree(shape, {
  setBlockId,   // (x, y, z, id) => void
  getBlockId,   // (x, y, z) => number
  emptyId,
  x, baseY, z,  // trunk base (first trunk block)
  trunkBlock,
  leavesBlock,  // unused when shape === 'none'
  heightRange,  // [min, max]
  rng,
  bounds,       // { width, height } local chunk size
}) => ({ trunkBlocks, leavesBlocks })
```

`shape`: `'oak' | 'birch' | 'cherry' | 'none'`

Placement rules shared by leafy shapes:

- Never write out of `bounds`
- Never replace non-empty blocks (trunk may write first; leaves skip occupied)
- Corner omission uses a fixed per-corner probability (~0.25–0.5), not global spherical sparseness
- Branches: 1–2 blocks horizontal from trunk near the top; optional small leaf tip cluster

### Species profiles (approximate)

| Shape | Trunk height | Foliage | Branches |
|-------|--------------|---------|----------|
| `oak` | 4–6 (from config `heightRange`) | 2–3 layered square disks near top (~5×5 lower, ~3×3 upper), random corner skips | 0–2 short side branches |
| `birch` | 5–7 typical via config | Similar layers but narrower footprint | 0–1 short side branch |
| `cherry` | 4–6 | Layered disks, slightly wider | 2–4 short side branches |
| `none` | config height | none | none |

Exact layer offsets and radii live in `tree-shape.js` as named constants per shape.

### Config: `biome-config.js`

Vegetation type entry becomes:

```js
{
  type: 'oak',          // display / debug id (keep)
  shape: 'oak',         // placement template key
  weight: 1,
  trunkBlock: BLOCK_IDS.TREE_TRUNK,
  leavesBlock: BLOCK_IDS.TREE_LEAVES,
  heightRange: [4, 6],
}
```

- Add required `shape`
- Remove `canopyRadius`
- Cactus: `shape: 'none'`, omit or ignore `leavesBlock`

Suggested mappings:

- plains / forest oak → `shape: 'oak'`
- birch forest → `shape: 'birch'`
- cherry grove → `shape: 'cherry'`
- desert cactus → `shape: 'none'`

### `terrain-generator.js`

- `_generateVegetation` delegates canopy/trunk writing to `placeTree`
- Stop using spherical loop and `canopyDensity` for placement
- Keep `trees.frequency` for spawn rate
- Debug bindings for `canopyDensity` / `minRadius` / `maxRadius`: leave unused or mark deprecated in labels; do not drive new shapes

## Testing

New unit file: `tests/unit/tree-shape.unit.js`

- Oak: contiguous vertical trunk; leaf layers form square footprints (not a filled sphere metric)
- Birch: trunk height respects taller `heightRange`; foliage footprint not wider than oak at comparable layers
- Cherry: for some fixed seeds, at least one trunk block offset from the center column (branch)
- `none`: trunk blocks only, zero leaves
- Edge: tree near chunk border does not throw; out-of-bounds writes skipped

Manual checks:

- Plains/forest: flat layered canopies, not round punched spheres
- Birch forest: taller/narrower look
- Cherry: visible short side branches
- Desert: cactus unchanged

## Out of scope

- Cross-chunk tree completion
- Fancy oak, mega spruce/jungle, etc.
- Changing vegetation density or biome distribution
- Exact vanilla RNG / feature parity

## Implementation notes

- Prefer minimal diff: extract shape logic to `tree-shape.js`; keep spawn loop in `generateTrees`
- Preserve Antfu JS style and `.js` extensions
- Add/adjust unit tests with the behavior change
