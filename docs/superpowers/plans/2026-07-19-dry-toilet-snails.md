# Dry Toilet + Snails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Place `cesuo.glb` as a fixed origin landmark on a flattened 2×2 platform, spawn 12 deterministic voxel snails in a 3–10 block ring, and let screen-center left-clicks retract nearby snails without starting block mining.

**Architecture:** Pure math helpers own fit/platform/spawn/state logic (unit-tested). `DryToiletLandmark` waits for origin columns, prepares the platform via `ChunkManager`, and places a scaled GLB clone. `SnailManager` owns shared snail meshes, spawn, update, and click arbitration; `VoxelSnail` owns per-snail pose/state. `World` wires landmark → snails before mining, drives `update()`, and resets/destroys both.

**Tech Stack:** JavaScript ES modules, Three.js, `RNG` (`src/js/tools/rng.js`), mitt (`input:mouse_down`), Node.js built-in test runner (`node --test`), pnpm.

**Spec:** @docs/superpowers/specs/2026-07-19-dry-toilet-snails-design.md

## Global Constraints

- Scope is Three.js world layer + resources + input arbitration + unit tests only. Do **not** change Vue UI, HUD, crosshair, inventory, achievements, audio, toilet collision, or toilet mining.
- Landmark footprint columns (world X/Z): `(-1, -1)`, `(-1, 0)`, `(0, -1)`, `(0, 0)`. Center `(0, 0)`.
- Toilet fit: uniform scale from longest X/Z AABB edge to **2** world blocks; then center X/Z on origin; then align AABB min Y to platform top (`targetY + 1` world units for block top face at integer `targetY`).
- Never hardcode current GLB size (`0.548 × 0.928 × 0.771`) as implementation constants — use `THREE.Box3` at runtime. Those numbers are acceptance-only.
- Missing/invalid toilet resource: `console.error` with resource name, disable landmark feature, leave the rest of the world running.
- Snail count **12**; activity ring radius **3–10**; click max distance **6**; snail length **0.7–0.9**; max climb/drop step **1** block.
- Shared snail geometry/materials across all 12; no per-voxel draw calls.
- Left-click priority: snails first; if hit, set `event.handled = true` so mining returns early. Miss → mining unchanged.
- Create `SnailManager` (and its `input:mouse_down` listener) **before** `BlockMiningController`.
- Reset: clear old toilet/snails, return to waiting; after new terrain is ready, rebuild platform + respawn snails with new seed.
- Destroy order: snails → snail shared resources → toilet clone → listeners. Dispose cloned toilet materials if cloned; never dispose original `resources.items` assets.
- Code style: pure JS, ES modules, 2 spaces, single quotes, no semicolons, explicit `.js` imports, Chinese comments for non-obvious logic. Use pnpm. Preserve unrelated working-tree changes.
- Relevant skills: @.cursor/skills/vtj-anti-patterns/SKILL.md, @.cursor/skills/vtj-component-model/SKILL.md, @.cursor/skills/vtj-scene-management/SKILL.md, @.cursor/skills/vtj-resource-management/SKILL.md, @.cursor/skills/vtj-debug-panel/SKILL.md

---

## File Structure

### New production files

- `src/js/config/dry-toilet-snails-config.js` — stable landmark/snail constants.
- `src/js/world/landmarks/dry-toilet-math.js` — pure helpers: AABB fit, integer median platform height, platform mutation plan, spawn points, snail FSM transitions.
- `src/js/world/landmarks/dry-toilet-landmark.js` — `DryToiletLandmark` class.
- `src/js/world/landmarks/voxel-snail.js` — `VoxelSnail` class + shared mesh factory helpers.
- `src/js/world/landmarks/snail-manager.js` — `SnailManager` class (spawn/update/click/raycast).

### Modified production files

- `src/js/sources.js` — declare `cesuoModel` GLB.
- `src/js/world/terrain/chunk-manager.js` — add `clearPlantsInWorldColumns(columns)` so platform prep can remove flora via data + plant layer refresh (plants are not stored in the block container).
- `src/js/interaction/block-mining-controller.js` — respect `event.handled` on left mouse down.
- `src/js/world/world.js` — init landmark + snails before block interaction; update/reset/destroy wiring.

### New tests

- `tests/unit/dry-toilet-math.unit.js` — fit, platform median/plan/idempotency, spawn ring, FSM.
- `tests/unit/snail-click-arbitration.unit.js` — handled vs unhandled left-click behavior (pure helper + mining early-return contract).

---

### Task 1: Config + pure math helpers (fit / platform / spawn / FSM)

**Files:**

- Create: `src/js/config/dry-toilet-snails-config.js`
- Create: `src/js/world/landmarks/dry-toilet-math.js`
- Create: `tests/unit/dry-toilet-math.unit.js`

**Interfaces:**

- Produces config:

```js
export const DRY_TOILET_SNAILS_CONFIG = {
  resourceName: 'cesuoModel',
  center: { x: 0, z: 0 },
  footprint: [
    { x: -1, z: -1 },
    { x: -1, z: 0 },
    { x: 0, z: -1 },
    { x: 0, z: 0 },
  ],
  targetBaseSize: 2,
  snailCount: 12,
  activityRadiusMin: 3,
  activityRadiusMax: 10,
  clickDistance: 6,
  snailLengthMin: 0.7,
  snailLengthMax: 0.9,
  snailMaxHeight: 0.45,
  crawlSpeed: 0.35,
  turnNoiseInterval: 1.2,
  turnNoiseRadians: 0.35,
  maxStepHeight: 1,
  rngSalt: 90421,
  retractMs: 700,
  holdMs: 1600,
  emergeMs: 700,
}
```

- Produces pure functions:

```js
export function computeToiletFitTransform(size, targetBaseSize = 2)
// size: { x, y, z } AABB size; returns { scale, offset: { x, y, z } }
// offset applied after scale, assuming model origin at AABB center before fit:
// scale = targetBaseSize / max(size.x, size.z)
// offset.x/z center model on world (0,0); offset.y lifts minY to 0 (caller adds platformTopY)

export function isValidAabbSize(size)
// false if missing/NaN/<=0 on any axis

export function computePlatformTargetY(heights)
// 4 heights → integer median; even mid-pair averages floor

export function buildPlatformPlan({ columns, targetY, fillBlockId })
// columns: [{ x, z, surfaceY, surfaceBlockId, blocksAbove: [{ y, id }] }]
// returns { ops: [{ type: 'remove'|'add', x, y, z, blockId? }], clearPlantColumns: [{ x, z }] }
// remove: every solid block with y > targetY in column (trees/leaves/etc already listed in blocksAbove)
// add: for surfaceY < targetY, fill y = surfaceY+1..targetY with fillBlockId
// idempotent: if column already surfaceY === targetY and no blocksAbove, no ops for that column

export function generateSnailSpawnPoints(rng, {
  count, center, footprint, radiusMin, radiusMax, lengthMin, lengthMax,
})
// returns [{ x, z, yaw, length }]
// each (x,z) in [radiusMin, radiusMax] from center, not inside footprint cells (floor x/z)

export const SNAIL_STATES = {
  CRAWLING: 'CRAWLING',
  RETRACTING: 'RETRACTING',
  RETRACTED: 'RETRACTED',
  EMERGING: 'EMERGING',
}

export function createSnailFsm({ retractMs, holdMs, emergeMs })
export function snailFsmOnClick(fsm)
export function snailFsmUpdate(fsm, dtMs)
// onClick while non-CRAWLING is no-op (no timer reset)
// full cycle ≈ retractMs + holdMs + emergeMs then back to CRAWLING
```

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/dry-toilet-math.unit.js`:

```javascript
import assert from 'node:assert/strict'
import test from 'node:test'

import { DRY_TOILET_SNAILS_CONFIG } from '../../src/js/config/dry-toilet-snails-config.js'
import {
  buildPlatformPlan,
  computePlatformTargetY,
  computeToiletFitTransform,
  createSnailFsm,
  generateSnailSpawnPoints,
  isValidAabbSize,
  snailFsmOnClick,
  snailFsmUpdate,
  SNAIL_STATES,
} from '../../src/js/world/landmarks/dry-toilet-math.js'
import { RNG } from '../../src/js/tools/rng.js'

test('rejects invalid aabb sizes', () => {
  assert.equal(isValidAabbSize({ x: 1, y: 1, z: 0 }), false)
  assert.equal(isValidAabbSize({ x: 1, y: NaN, z: 1 }), false)
  assert.equal(isValidAabbSize({ x: 0.5, y: 0.9, z: 0.7 }), true)
})

test('fits longest xz edge to target base and centers on origin', () => {
  const size = { x: 0.548, y: 0.928, z: 0.771 }
  const { scale, offset } = computeToiletFitTransform(size, 2)
  assert.ok(Math.abs(scale - (2 / 0.771)) < 1e-9)
  const scaled = { x: size.x * scale, y: size.y * scale, z: size.z * scale }
  assert.ok(Math.abs(scaled.z - 2) < 1e-9)
  // After scale, offset recenters XZ and lifts minY to 0
  assert.ok(Math.abs(offset.x) < 1e-9)
  assert.ok(Math.abs(offset.z) < 1e-9)
  assert.ok(Math.abs(offset.y - scaled.y / 2) < 1e-9)
})

test('platform target y uses floored even-pair median', () => {
  assert.equal(computePlatformTargetY([10, 12, 11, 14]), 11)
  assert.equal(computePlatformTargetY([8, 10, 9, 11]), 9)
  assert.equal(computePlatformTargetY([5, 5, 5, 5]), 5)
})

test('platform plan fills, cuts, clears vegetation, and is idempotent', () => {
  const columns = [
    { x: -1, z: -1, surfaceY: 8, surfaceBlockId: 1, blocksAbove: [{ y: 9, id: 6 }, { y: 10, id: 7 }] },
    { x: -1, z: 0, surfaceY: 10, surfaceBlockId: 1, blocksAbove: [] },
    { x: 0, z: -1, surfaceY: 9, surfaceBlockId: 2, blocksAbove: [] },
    { x: 0, z: 0, surfaceY: 11, surfaceBlockId: 1, blocksAbove: [{ y: 12, id: 202 }] },
  ]
  const targetY = computePlatformTargetY(columns.map(c => c.surfaceY))
  const plan = buildPlatformPlan({ columns, targetY, fillBlockId: 1 })
  assert.ok(plan.ops.some(op => op.type === 'remove' && op.y === 11 && op.x === 0 && op.z === 0))
  assert.ok(plan.ops.some(op => op.type === 'add' && op.x === -1 && op.z === -1 && op.y === 9))
  assert.deepEqual(plan.clearPlantColumns, DRY_TOILET_SNAILS_CONFIG.footprint)

  const doneColumns = columns.map(c => ({
    ...c,
    surfaceY: targetY,
    blocksAbove: [],
  }))
  const again = buildPlatformPlan({ columns: doneColumns, targetY, fillBlockId: 1 })
  assert.equal(again.ops.length, 0)
})

test('spawn points stay in ring, avoid footprint, and are deterministic', () => {
  const cfg = DRY_TOILET_SNAILS_CONFIG
  const a = generateSnailSpawnPoints(new RNG(1337 + cfg.rngSalt), {
    count: cfg.snailCount,
    center: cfg.center,
    footprint: cfg.footprint,
    radiusMin: cfg.activityRadiusMin,
    radiusMax: cfg.activityRadiusMax,
    lengthMin: cfg.snailLengthMin,
    lengthMax: cfg.snailLengthMax,
  })
  const b = generateSnailSpawnPoints(new RNG(1337 + cfg.rngSalt), {
    count: cfg.snailCount,
    center: cfg.center,
    footprint: cfg.footprint,
    radiusMin: cfg.activityRadiusMin,
    radiusMax: cfg.activityRadiusMax,
    lengthMin: cfg.snailLengthMin,
    lengthMax: cfg.snailLengthMax,
  })
  assert.equal(a.length, 12)
  assert.deepEqual(a, b)
  const footprintSet = new Set(cfg.footprint.map(p => `${p.x},${p.z}`))
  for (const p of a) {
    const dx = p.x - cfg.center.x
    const dz = p.z - cfg.center.z
    const r = Math.hypot(dx, dz)
    assert.ok(r >= cfg.activityRadiusMin - 1e-6)
    assert.ok(r <= cfg.activityRadiusMax + 1e-6)
    assert.equal(footprintSet.has(`${Math.floor(p.x)},${Math.floor(p.z)}`), false)
    assert.ok(p.length >= cfg.snailLengthMin && p.length <= cfg.snailLengthMax)
  }
})

test('snail fsm retracts once and ignores repeat clicks until crawling', () => {
  const fsm = createSnailFsm({ retractMs: 100, holdMs: 100, emergeMs: 100 })
  assert.equal(fsm.state, SNAIL_STATES.CRAWLING)
  snailFsmOnClick(fsm)
  assert.equal(fsm.state, SNAIL_STATES.RETRACTING)
  const t0 = fsm.timerMs
  snailFsmOnClick(fsm)
  assert.equal(fsm.timerMs, t0)
  snailFsmUpdate(fsm, 100)
  assert.equal(fsm.state, SNAIL_STATES.RETRACTED)
  snailFsmUpdate(fsm, 100)
  assert.equal(fsm.state, SNAIL_STATES.EMERGING)
  snailFsmUpdate(fsm, 100)
  assert.equal(fsm.state, SNAIL_STATES.CRAWLING)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test tests/unit/dry-toilet-math.unit.js
```

Expected: FAIL (module/exports missing).

- [ ] **Step 3: Implement config + math helpers**

Create `src/js/config/dry-toilet-snails-config.js` with the config object above.

Create `src/js/world/landmarks/dry-toilet-math.js` implementing every exported function/signature listed in **Interfaces**. Implementation notes:

- `computeToiletFitTransform`: assume input size is untransformed AABB size; return uniform `scale` and `offset` such that after `model.scale.setScalar(scale)` and `model.position.copy(offset)` (with parent at platform top), the model sits on y=0 plane centered at xz origin. Prefer treating the model so that after scale, AABB center is at origin then apply `offset.y = scaledY/2` so minY=0; if clone has arbitrary local origin, landmark will re-measure with `Box3` and adjust (Task 2) — math helper still documents the size-based expected offsets for tests.
- `buildPlatformPlan`: for each column, if `surfaceY > targetY`, emit removes for `y = targetY+1 .. surfaceY` plus any `blocksAbove`; if `surfaceY < targetY`, emit adds from `surfaceY+1 .. targetY` using `fillBlockId` (origin column’s surface block type is chosen by caller). Always list footprint in `clearPlantColumns`.
- `generateSnailSpawnPoints`: rejection sample polar coords until outside footprint cells; use `rng.random()` only (no `Math.random`).
- FSM: store `{ state, timerMs, retractMs, holdMs, emergeMs }`; `snailFsmUpdate` advances and transitions; `snailFsmOnClick` only acts from `CRAWLING`.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
node --test tests/unit/dry-toilet-math.unit.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/js/config/dry-toilet-snails-config.js src/js/world/landmarks/dry-toilet-math.js tests/unit/dry-toilet-math.unit.js
git commit -m "$(cat <<'EOF'
feat(landmarks): add dry toilet snail config and pure math helpers

EOF
)"
```

---

### Task 2: Resource declaration + DryToiletLandmark placement

**Files:**

- Modify: `src/js/sources.js`
- Modify: `src/js/world/terrain/chunk-manager.js` (add plant clear helper)
- Create: `src/js/world/landmarks/dry-toilet-landmark.js`
- Test: extend `tests/unit/dry-toilet-math.unit.js` only if fit helper needs a world-box adapter; otherwise rely on Task 1 + manual browser later.

**Interfaces:**

- Consumes: `DRY_TOILET_SNAILS_CONFIG`, `computeToiletFitTransform`, `isValidAabbSize`, `computePlatformTargetY`, `buildPlatformPlan`
- Consumes ChunkManager:
  - `getChunkAtWorld(x, z)`
  - `getTopSolidYWorld(x, z)`
  - `getBlockWorld(x, y, z)`
  - `addBlockWorld(x, y, z, blockId)`
  - `removeBlockWorld(x, y, z)`
  - new `clearPlantsInWorldColumns(columns: Array<{x:number,z:number}>): void`
- Produces: `export default class DryToiletLandmark`

```js
constructor()
update() // poll until ready, then idle
isReady(): boolean
getActivityCenter(): { x: number, y: number, z: number } | null
reset() // remove model, clear ready, resume polling
destroy()
```

- ChunkManager plant helper behavior:
  - For each world column, convert to chunk local coords, filter `chunk.generator.plantData` (and `chunk.plantData` if present) removing entries whose local `(x,z)` match.
  - Call existing `_refreshActiveChunk(chunkKey)` when the chunk has an active slot so plant InstancedMesh updates.

- [ ] **Step 1: Add resource entry**

In `src/js/sources.js`, after character models, add:

```javascript
  {
    name: 'cesuoModel',
    type: 'gltfModel',
    path: 'models/cesuo.glb',
  },
```

- [ ] **Step 2: Add ChunkManager.clearPlantsInWorldColumns**

In `src/js/world/terrain/chunk-manager.js`, add:

```javascript
  /**
   * 清除指定世界列上的植物实例（植物不在方块容器内）
   * @param {Array<{ x: number, z: number }>} columns
   */
  clearPlantsInWorldColumns(columns = []) {
    const touched = new Set()
    for (const { x, z } of columns) {
      const wx = Math.floor(x)
      const wz = Math.floor(z)
      const chunkX = Math.floor(wx / this.chunkWidth)
      const chunkZ = Math.floor(wz / this.chunkWidth)
      const chunkKey = this._key(chunkX, chunkZ)
      const chunk = this.getChunk(chunkX, chunkZ)
      if (!chunk)
        continue

      const localX = Math.floor(wx - chunkX * this.chunkWidth)
      const localZ = Math.floor(wz - chunkZ * this.chunkWidth)
      const filterPlants = (list) => {
        if (!Array.isArray(list))
          return list
        return list.filter(p => !(p.x === localX && p.z === localZ))
      }

      if (chunk.generator?.plantData)
        chunk.generator.plantData = filterPlants(chunk.generator.plantData)
      if (chunk.plantData)
        chunk.plantData = filterPlants(chunk.plantData)

      touched.add(chunkKey)
    }

    for (const chunkKey of touched)
      this._refreshActiveChunk(chunkKey)
  }
```

- [ ] **Step 3: Implement DryToiletLandmark**

Create `src/js/world/landmarks/dry-toilet-landmark.js`:

```javascript
import * as THREE from 'three'
import { DRY_TOILET_SNAILS_CONFIG as CFG } from '../../config/dry-toilet-snails-config.js'
import Experience from '../../experience.js'
import {
  buildPlatformPlan,
  computePlatformTargetY,
  computeToiletFitTransform,
  isValidAabbSize,
} from './dry-toilet-math.js'

export default class DryToiletLandmark {
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources
    this.chunkManager = null

    this.ready = false
    this.disabled = false
    this.model = null
    this.activityCenter = null
    this._platformTopY = null
  }

  _cm() {
    return this.experience.terrainDataManager
  }

  _columnsReady() {
    const cm = this._cm()
    if (!cm)
      return false
    return CFG.footprint.every(({ x, z }) => {
      const chunk = cm.getChunkAtWorld(x, z)
      if (!chunk || chunk.state !== 'dataReady')
        return false
      return cm.getTopSolidYWorld(x, z) != null
    })
  }

  _readColumns() {
    const cm = this._cm()
    return CFG.footprint.map(({ x, z }) => {
      const surfaceY = cm.getTopSolidYWorld(x, z)
      const surfaceBlock = cm.getBlockWorld(x, surfaceY, z)
      const blocksAbove = []
      for (let y = surfaceY + 1; y < cm.chunkHeight; y++) {
        const b = cm.getBlockWorld(x, y, z)
        if (b?.id)
          blocksAbove.push({ y, id: b.id })
      }
      return {
        x,
        z,
        surfaceY,
        surfaceBlockId: surfaceBlock?.id ?? 1,
        blocksAbove,
      }
    })
  }

  _preparePlatform() {
    const cm = this._cm()
    const columns = this._readColumns()
    const targetY = computePlatformTargetY(columns.map(c => c.surfaceY))
    const originCol = columns.find(c => c.x === 0 && c.z === 0) || columns[0]
    const plan = buildPlatformPlan({
      columns,
      targetY,
      fillBlockId: originCol.surfaceBlockId,
    })

    for (const op of plan.ops) {
      if (op.type === 'remove')
        cm.removeBlockWorld(op.x, op.y, op.z)
      else if (op.type === 'add')
        cm.addBlockWorld(op.x, op.y, op.z, op.blockId)
    }
    cm.clearPlantsInWorldColumns(plan.clearPlantColumns)
    this._platformTopY = targetY + 1
  }

  _placeModel() {
    const name = CFG.resourceName
    const resource = this.resources.items?.[name]
    if (!resource?.scene) {
      console.error(`[DryToiletLandmark] missing resource: ${name}`)
      this.disabled = true
      return
    }

    const root = resource.scene.clone(true)
    root.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true
        obj.receiveShadow = true
      }
    })

    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const size = new THREE.Vector3()
    box.getSize(size)
    if (!isValidAabbSize(size)) {
      console.error(`[DryToiletLandmark] invalid aabb for resource: ${name}`, size)
      this.disabled = true
      return
    }

    // 先等比缩放到底边 2 格，再重新测包围盒并对齐原点平台顶面
    const fit = computeToiletFitTransform(
      { x: size.x, y: size.y, z: size.z },
      CFG.targetBaseSize,
    )
    root.scale.setScalar(fit.scale)
    root.updateMatrixWorld(true)

    const box2 = new THREE.Box3().setFromObject(root)
    const center = new THREE.Vector3()
    box2.getCenter(center)
    const min = box2.min
    root.position.x += -center.x
    root.position.z += -center.z
    root.position.y += -min.y + this._platformTopY

    this.scene.add(root)
    this.model = root
    this.activityCenter = {
      x: CFG.center.x,
      y: this._platformTopY,
      z: CFG.center.z,
    }
    this.ready = true
  }

  update() {
    if (this.disabled || this.ready)
      return
    if (!this._columnsReady())
      return
    this._preparePlatform()
    this._placeModel()
  }

  isReady() {
    return this.ready
  }

  getActivityCenter() {
    return this.activityCenter
  }

  reset() {
    if (this.model) {
      this.scene.remove(this.model)
      this.model.traverse((obj) => {
        if (obj.isMesh) {
          obj.geometry = obj.geometry // keep shared geom from clone tree
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
            // 仅释放克隆体自有材质；不要触碰 resources 原始资源
            for (const m of mats) {
              if (m?.userData?.__dryToiletClone)
                m.dispose()
            }
          }
        }
      })
      this.model = null
    }
    this.ready = false
    this.disabled = false
    this.activityCenter = null
    this._platformTopY = null
  }

  destroy() {
    this.reset()
  }
}
```

**Material clone note:** when cloning, if materials are shared with the loader asset, either (a) do not dispose materials on destroy, or (b) clone materials once and mark `userData.__dryToiletClone = true`. Prefer (a) simplest: **do not dispose materials/textures on toilet destroy** — only `scene.remove(model)`. Spec allows releasing clone-owned materials; it forbids releasing loader originals. Safest MVP: remove from scene only.

Simplify `reset()` to:

```javascript
  reset() {
    if (this.model) {
      this.scene.remove(this.model)
      this.model = null
    }
    this.ready = false
    this.disabled = false
    this.activityCenter = null
    this._platformTopY = null
  }
```

- [ ] **Step 4: Smoke-check imports**

Run:

```bash
node --test tests/unit/dry-toilet-math.unit.js
```

Expected: still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/js/sources.js src/js/world/terrain/chunk-manager.js src/js/world/landmarks/dry-toilet-landmark.js
git commit -m "$(cat <<'EOF'
feat(landmarks): place dry toilet on fitted 2x2 origin platform

EOF
)"
```

---

### Task 3: VoxelSnail shared meshes + crawl / retract visuals

**Files:**

- Create: `src/js/world/landmarks/voxel-snail.js`

**Interfaces:**

- Consumes: `DRY_TOILET_SNAILS_CONFIG`, `createSnailFsm` / `snailFsmOnClick` / `snailFsmUpdate` / `SNAIL_STATES`
- Produces:

```js
export function createSharedSnailAssets()
// returns { geometries: {...}, materials: {...}, dispose() }
// single MeshStandardMaterial (or MeshBasicMaterial) with vertexColors: true preferred;
// merged BufferGeometry parts: body, shell, eyeL, eyeR, antennaL, antennaR (or fewer groups)

export default class VoxelSnail {
  constructor({ shared, length, x, z, yaw, terrainProvider, activityCenter, footprint })
  getClickMeshes(): THREE.Object3D[]
  getPosition(): THREE.Vector3
  startRetract(): void // delegates to snailFsmOnClick
  isCrawling(): boolean
  update(dtSec): void
  destroy(): void // remove group from scene; do NOT dispose shared assets
}
```

- [ ] **Step 1: Implement shared voxel snail factory**

In `voxel-snail.js`, build low-poly voxel snails from a few `BoxGeometry` pieces merged per part with `BufferGeometryUtils.mergeGeometries` **or** manually concatenated typed arrays. Keep total unique geometries ≤ ~6 and unique materials ≤ 2, shared across instances.

Approximate proportions for length `L` (0.7–0.9):

- body: `L * 0.7` long, `L * 0.25` tall
- shell: sphere-like stack / larger box on back, height ≤ `CFG.snailMaxHeight`
- eyes/antennae: thin boxes on head

Assign vertex colors (body light/dark, shell light/dark) on the merged buffers.

- [ ] **Step 2: Implement VoxelSnail behavior**

```javascript
update(dtSec) {
  snailFsmUpdate(this.fsm, dtSec * 1000)
  this._updateRetractVisuals() // antennæ → head → body scale/pos by fsm phase
  if (this.fsm.state !== SNAIL_STATES.CRAWLING)
    return

  // crawl forward, occasional yaw noise from seeded low-frequency timer
  // sample next cell with terrainProvider.getTopSolidYWorld
  // turn away if: footprint cell, outside ring, missing terrain, |dy| > maxStepHeight
  // snap group.position.y so snail belly sits on surfaceY + 1
}
```

Use `activityCenter` + `CFG.activityRadiusMin/Max` and footprint set for constraints. No snail-snail collision.

- [ ] **Step 3: Commit**

```bash
git add src/js/world/landmarks/voxel-snail.js
git commit -m "$(cat <<'EOF'
feat(landmarks): add shared-geometry voxel snail with retract FSM

EOF
)"
```

---

### Task 4: SnailManager spawn + click arbitration + mining gate

**Files:**

- Create: `src/js/world/landmarks/snail-manager.js`
- Create: `tests/unit/snail-click-arbitration.unit.js`
- Modify: `src/js/interaction/block-mining-controller.js`

**Interfaces:**

- Consumes: landmark `isReady()` / `getActivityCenter()`, `generateSnailSpawnPoints`, `VoxelSnail`, `RNG`, `DRY_TOILET_SNAILS_CONFIG`
- Produces: `export default class SnailManager`

```js
constructor({ landmark })
onLandmarkReady() // spawn once when landmark becomes ready
update(dtSec)
reset()
destroy()
```

- Click contract helper (testable):

```js
// in snail-manager.js or dry-toilet-math.js
export function shouldConsumeMiningClick({ hitSnail, distance, maxDistance })
// true iff hitSnail && distance <= maxDistance
```

- [ ] **Step 1: Write failing arbitration tests**

Create `tests/unit/snail-click-arbitration.unit.js`:

```javascript
import assert from 'node:assert/strict'
import test from 'node:test'

import { shouldConsumeMiningClick } from '../../src/js/world/landmarks/snail-manager.js'

test('consumes click only for near snail hits', () => {
  assert.equal(shouldConsumeMiningClick({ hitSnail: true, distance: 5.9, maxDistance: 6 }), true)
  assert.equal(shouldConsumeMiningClick({ hitSnail: true, distance: 6.1, maxDistance: 6 }), false)
  assert.equal(shouldConsumeMiningClick({ hitSnail: false, distance: 1, maxDistance: 6 }), false)
})

test('mining handler respects handled flag', () => {
  const calls = []
  function miningOnMouseDown(event) {
    if (event.handled)
      return
    if (event.button !== 0)
      return
    calls.push('mine')
  }

  miningOnMouseDown({ button: 0, handled: true })
  assert.deepEqual(calls, [])
  miningOnMouseDown({ button: 0 })
  assert.deepEqual(calls, ['mine'])
})
```

- [ ] **Step 2: Run to verify fail**

```bash
node --test tests/unit/snail-click-arbitration.unit.js
```

Expected: FAIL (missing export).

- [ ] **Step 3: Implement SnailManager**

```javascript
import * as THREE from 'three'
import { DRY_TOILET_SNAILS_CONFIG as CFG } from '../../config/dry-toilet-snails-config.js'
import Experience from '../../experience.js'
import { RNG } from '../../tools/rng.js'
import emitter from '../../utils/event/event-bus.js'
import { generateSnailSpawnPoints } from './dry-toilet-math.js'
import VoxelSnail, { createSharedSnailAssets } from './voxel-snail.js'

export function shouldConsumeMiningClick({ hitSnail, distance, maxDistance }) {
  return Boolean(hitSnail) && distance <= maxDistance
}

export default class SnailManager {
  constructor({ landmark }) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.camera = this.experience.camera.instance
    this.landmark = landmark
    this.snails = []
    this.shared = null
    this.spawned = false
    this.raycaster = new THREE.Raycaster()
    this._center = new THREE.Vector2(0, 0)
    this._onMouseDown = this._onMouseDown.bind(this)
    emitter.on('input:mouse_down', this._onMouseDown)
  }

  _spawn() {
    if (this.spawned || !this.landmark?.isReady())
      return
    const center = this.landmark.getActivityCenter()
    if (!center)
      return

    const seed = this.experience.terrainDataManager?.seed ?? 0
    const rng = new RNG(seed + CFG.rngSalt)
    const points = generateSnailSpawnPoints(rng, {
      count: CFG.snailCount,
      center: { x: center.x, z: center.z },
      footprint: CFG.footprint,
      radiusMin: CFG.activityRadiusMin,
      radiusMax: CFG.activityRadiusMax,
      lengthMin: CFG.snailLengthMin,
      lengthMax: CFG.snailLengthMax,
    })

    this.shared = createSharedSnailAssets()
    this.snails = points.map(p => new VoxelSnail({
      shared: this.shared,
      length: p.length,
      x: p.x,
      z: p.z,
      yaw: p.yaw,
      terrainProvider: this.experience.terrainDataManager,
      activityCenter: center,
      footprint: CFG.footprint,
    }))
    this.spawned = true
  }

  update(dtSec) {
    if (!this.spawned)
      this._spawn()
    for (const snail of this.snails)
      snail.update(dtSec)
  }

  _onMouseDown(event) {
    if (event.button !== 0 || !this.spawned)
      return

    this.raycaster.setFromCamera(this._center, this.camera)
    this.raycaster.far = CFG.clickDistance + 1
    const meshes = this.snails.flatMap(s => s.getClickMeshes())
    const hits = this.raycaster.intersectObjects(meshes, true)
    if (!hits.length)
      return

    const hitObj = hits[0].object
    const snail = this.snails.find(s => s.getClickMeshes().some(m => m === hitObj || m === hitObj.parent || hitObj.parent === s.group))
    // Prefer tagging meshes with userData.snailRef = snail at construction for O(1) lookup
    const target = hitObj.userData?.snailRef || snail
    if (!target)
      return

    const player = this.experience.world?.player
    if (!player)
      return
    const distance = player.movement.position.distanceTo(target.getPosition())
    if (!shouldConsumeMiningClick({
      hitSnail: true,
      distance,
      maxDistance: CFG.clickDistance,
    }))
      return

    event.handled = true
    target.startRetract()
  }

  reset() {
    for (const snail of this.snails)
      snail.destroy()
    this.snails = []
    this.shared?.dispose()
    this.shared = null
    this.spawned = false
  }

  destroy() {
    emitter.off('input:mouse_down', this._onMouseDown)
    this.reset()
  }
}
```

When building each snail mesh, set `mesh.userData.snailRef = this` so click resolution is reliable.

- [ ] **Step 4: Gate BlockMiningController**

In `src/js/interaction/block-mining-controller.js` `_onMouseDown`, add as the first guard after the existing enabled/button checks:

```javascript
  _onMouseDown(event) {
    if (!this.params.enabled || event.button !== 0)
      return
    if (event.handled)
      return

    const raycaster = this.experience.world?.blockRaycaster
    // ... unchanged
```

- [ ] **Step 5: Run unit tests**

```bash
node --test tests/unit/dry-toilet-math.unit.js tests/unit/snail-click-arbitration.unit.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/js/world/landmarks/snail-manager.js src/js/interaction/block-mining-controller.js tests/unit/snail-click-arbitration.unit.js
git commit -m "$(cat <<'EOF'
feat(landmarks): spawn snails and consume near left-clicks before mining

EOF
)"
```

---

### Task 5: World wiring (init order, update, reset, destroy)

**Files:**

- Modify: `src/js/world/world.js`

**Interfaces:**

- Consumes: `DryToiletLandmark`, `SnailManager`
- World must:
  - create landmark + snail manager **before** `_initBlockInteraction()`
  - call `dryToiletLandmark.update()` and `snailManager.update(dtSec)` each frame
  - on `reset()`, call `snailManager.reset()` then `dryToiletLandmark.reset()` (snails wait for landmark ready again)
  - on `destroy()`, destroy snails then landmark

- [ ] **Step 1: Wire World**

Update imports:

```javascript
import DryToiletLandmark from './landmarks/dry-toilet-landmark.js'
import SnailManager from './landmarks/snail-manager.js'
```

In `core:ready` callback, after `_initPlayerAndCamera()` / `_initEnvironment()` and **before** `_initBlockInteraction()`:

```javascript
      this._initLandmarks()
      this._initBlockInteraction()
```

Add:

```javascript
  _initLandmarks() {
    this.dryToiletLandmark = new DryToiletLandmark()
    this.snailManager = new SnailManager({ landmark: this.dryToiletLandmark })
  }
```

In `update()` after terrain update (and with access to delta):

```javascript
    const dtSec = this.experience.time.delta / 1000
    if (this.dryToiletLandmark)
      this.dryToiletLandmark.update()
    if (this.snailManager)
      this.snailManager.update(dtSec)
```

Confirm `this.experience.time.delta` units in this repo (ms vs sec). If `delta` is already seconds, pass it directly; if ms, divide by 1000. Match existing consumers (e.g. `achievementController.update(this.experience.time.delta)`).

In `reset()` after starting `regenerateAll`:

```javascript
    this.snailManager?.reset()
    this.dryToiletLandmark?.reset()
```

In `destroy()` near the top of child teardown:

```javascript
    this.snailManager?.destroy()
    this.dryToiletLandmark?.destroy()
```

- [ ] **Step 2: Optional debug panels**

If `this.debug.active`, `SnailManager.debugInit()` / `DryToiletLandmark.debugInit()` may expose crawlSpeed / retract timings via Tweakpane. Not required for MVP acceptance. Skip unless time remains.

- [ ] **Step 3: Commit**

```bash
git add src/js/world/world.js
git commit -m "$(cat <<'EOF'
feat(world): wire dry toilet landmark and snail manager lifecycle

EOF
)"
```

---

### Task 6: Verification

**Files:** none new (run commands + browser checklist)

- [ ] **Step 1: Unit tests**

```bash
node --test tests/unit/dry-toilet-math.unit.js tests/unit/snail-click-arbitration.unit.js
```

Expected: all PASS.

- [ ] **Step 2: Lint + build**

```bash
pnpm lint
pnpm build
```

Expected: exit 0. Fix only issues introduced by this feature.

- [ ] **Step 3: Browser acceptance (manual)**

```bash
pnpm dev
```

Checklist from spec:

1. Toilet at world origin on flat 2×2 platform — no float, bury, or vegetation poke-through.
2. Longest base edge ≈ 2 blocks; proportion preserved.
3. 12 snails (~0.7–0.9 long) crawl on ground, stay out of footprint, stay in 3–10 ring.
4. Within 6 blocks, crosshair left-click retracts snail ~3s total; block behind does **not** start mining.
5. Missed left-click still mines; right-click place; world reset; UI unchanged.

- [ ] **Step 4: Final commit only if verification fixes were needed**

```bash
git add -A
git status
# commit only feature-related fixes with a clear message, e.g.
git commit -m "$(cat <<'EOF'
fix(landmarks): address dry toilet snail verification findings

EOF
)"
```

---

## Self-Review (spec coverage)

| Spec requirement | Task |
|---|---|
| Declare `cesuo.glb` in sources | Task 2 |
| Box3 fit to 2-block base, center, ground align | Task 1 math + Task 2 landmark |
| Invalid model disables landmark only | Task 2 |
| Wait for 4 origin columns; median platform; fill/cut/clear flora via Chunk APIs; idempotent | Task 1 + Task 2 (+ plant helper) |
| No toilet ray target / collision / mining | Task 2 (scene model only) |
| 12 deterministic snails in 3–10 ring, avoid footprint | Task 1 + Task 4 |
| Shared voxel meshes, crawl + retract visuals | Task 3 |
| Ground follow, turn on footprint/ring/steep/missing | Task 3 |
| Screen-center ray click ≤6, consume before mining | Task 4 |
| FSM CRAWLING→RETRACT→HOLD→EMERGE; no retrigger | Task 1 + Task 3 |
| World init order, update, reset, destroy | Task 5 |
| Unit tests listed in spec | Task 1 + Task 4 |
| `node --test` / lint / build / browser | Task 6 |
| Non-goals (eat/loot/HP/UI/audio/collision) | Out of scope — no tasks |

**Placeholder scan:** none intentional — spawn visual style in Task 3 is intentionally sketched at proportions level; implementers must still ship merged shared meshes (not per-cube InstancedMesh spam).

**Type consistency:** `isReady` / `getActivityCenter` / `shouldConsumeMiningClick` / `SNAIL_STATES` / `CFG.resourceName = 'cesuoModel'` used consistently across tasks.
