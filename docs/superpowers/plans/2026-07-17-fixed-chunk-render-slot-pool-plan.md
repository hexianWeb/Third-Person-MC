# Fixed Chunk Render Slot Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-chunk `InstancedMesh` creation with fourteen long-lived, precompiled render slots so normal 3x3 chunk streaming does not trigger runtime TSL/WebGPU pipeline compilation.

**Architecture:** `TerrainChunk` becomes data-only. `ChunkRenderSlotPool` owns fourteen stable `ChunkRenderSlot` objects; nine are active and five stage the largest diagonal window transition. `ChunkManager` prepares data and slot contents off the active window, then commits the complete target window atomically.

**Tech Stack:** JavaScript ES modules, Three.js 0.185.1 WebGPURenderer/TSL, Playwright, Node.js built-in test runner, Vite, pnpm.

## Global Constraints

- Runtime render distance is fixed at `viewDistance = 1`; reject other values without resizing the pool or changing the UI.
- Own exactly 14 render slots: 9 active plus 5 staging/free.
- Do not create an `InstancedMesh` in the normal post-prewarm transition path.
- Do not use synchronous first-render compilation as an error fallback.
- Keep outgoing slots active until every incoming slot is ready, then commit the complete window in one task.
- Preserve raycast mappings, block add/remove, persistence, AO, plants, water, shadow settings, and animated materials.
- Keep fixed instance buffers at or below 65 MiB and target total additional GPU memory at or below 80 MiB.
- Preserve unrelated working-tree changes and use pnpm for all commands.
- Match the repository style: pure JavaScript, ES modules, two spaces, single quotes, no semicolons, and explicit `.js` imports.

---

## File Structure

### New production files

- `src/js/config/chunk-render-capacity.js`: fixed slot counts, capacity table, byte estimate, and view-distance validation.
- `src/js/world/terrain/chunk-window.js`: pure target-window and diff calculation.
- `src/js/world/terrain/chunk-render-capacity-error.js`: structured overflow error shared by block/plant layers and the pool.
- `src/js/world/terrain/chunk-render-slot.js`: one stable slot, its root group, layers, water mesh, binding state, and prewarm helpers.
- `src/js/world/terrain/chunk-render-slot-pool.js`: fourteen-slot ownership, serial prewarm, retry, acquisition, release, epochs, diagnostics, and disposal.

### Modified production files

- `src/js/world/terrain/terrain-container.js`: clear stale `instanceId` values without rebuilding block data.
- `src/js/world/terrain/terrain-renderer.js`: reusable fixed-capacity block layer; no scene attachment or rebuild-time mesh destruction.
- `src/js/world/terrain/plant-renderer.js`: reusable fixed-capacity plant layer.
- `src/js/world/terrain/terrain-chunk.js`: data generation only.
- `src/js/world/terrain/chunk-manager.js`: data/render maps, transition runner, atomic commit, interaction routing, reset, and pool lifecycle.
- `src/js/world/world.js`: start pool initialization and validate settings changes through `ChunkManager`.
- `src/js/renderer.js`: expose device-loss/readiness state only if required by pool initialization; do not put chunk scheduling here.
- `playwright.config.js`: start/reuse the Vite server for focused Chromium tests.

### New tests

- `tests/unit/chunk-render-policy.unit.js`: constants, byte budget, window diff, and container instance reset.
- `tests/unit/terrain-render-layers.unit.js`: block/plant UUID stability, mapping reset, and overflow reporting.
- `tests/unit/chunk-render-slot.unit.js`: slot states, attachment, reset, and dummy prewarm state.
- `tests/unit/chunk-render-slot-pool.unit.js`: serial prewarm, retry, fixed count, stale operations, diagnostics, and disposal.
- `tests/chunk-render-slot-pool.e2e.test.js`: real WebGPU startup, transitions, UUID stability, interaction mappings, reset, and counters.

---

### Task 1: Add the fixed rendering policy and pure window helpers

**Files:**

- Create: `src/js/config/chunk-render-capacity.js`
- Create: `src/js/world/terrain/chunk-window.js`
- Create: `src/js/world/terrain/chunk-render-capacity-error.js`
- Modify: `src/js/world/terrain/terrain-container.js:120-145`
- Test: `tests/unit/chunk-render-policy.unit.js`

**Interfaces:**

- Produces: `CHUNK_RENDER_VIEW_DISTANCE`, `ACTIVE_SLOT_COUNT`, `STAGING_SLOT_COUNT`, `TOTAL_SLOT_COUNT`, `BLOCK_INSTANCE_CAPACITY`, `PLANT_INSTANCE_CAPACITY`, `FIXED_INSTANCE_BUFFER_BYTES`, `isSupportedChunkViewDistance(value)`.
- Produces: `getChunkWindow(centerX, centerZ)` and `diffChunkWindows(activeKeys, targetKeys)`.
- Produces: `ChunkRenderCapacityError` with `layer`, `typeId`, `required`, and `capacity` fields.
- Produces: `TerrainContainer.clearInstanceIds()`.

- [ ] **Step 1: Write the failing policy test**

```javascript
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ACTIVE_SLOT_COUNT,
  BLOCK_INSTANCE_CAPACITY,
  FIXED_INSTANCE_BUFFER_BYTES,
  isSupportedChunkViewDistance,
  STAGING_SLOT_COUNT,
  TOTAL_SLOT_COUNT,
} from '../../src/js/config/chunk-render-capacity.js'
import ChunkRenderCapacityError from '../../src/js/world/terrain/chunk-render-capacity-error.js'
import TerrainContainer from '../../src/js/world/terrain/terrain-container.js'
import { diffChunkWindows, getChunkWindow } from '../../src/js/world/terrain/chunk-window.js'

test('fixed render policy owns nine active and five staging slots', () => {
  assert.equal(ACTIVE_SLOT_COUNT, 9)
  assert.equal(STAGING_SLOT_COUNT, 5)
  assert.equal(TOTAL_SLOT_COUNT, 14)
  assert.equal(Object.keys(BLOCK_INSTANCE_CAPACITY).length, 19)
  assert.equal(FIXED_INSTANCE_BUFFER_BYTES, 63594496)
  assert.equal(isSupportedChunkViewDistance(1), true)
  assert.equal(isSupportedChunkViewDistance(2), false)
})

test('a diagonal one-chunk move has five incoming chunks', () => {
  const current = getChunkWindow(0, 0)
  const target = getChunkWindow(1, 1)
  const diff = diffChunkWindows(current, target)

  assert.equal(diff.overlap.size, 4)
  assert.equal(diff.incoming.size, 5)
  assert.equal(diff.outgoing.size, 5)
})

test('capacity errors expose structured overflow context', () => {
  const error = new ChunkRenderCapacityError({
    layer: 'blocks',
    typeId: 'stone',
    required: 8193,
    capacity: 8192,
  })

  assert.equal(error.name, 'ChunkRenderCapacityError')
  assert.equal(error.layer, 'blocks')
  assert.equal(error.typeId, 'stone')
  assert.equal(error.required, 8193)
  assert.equal(error.capacity, 8192)
})

test('clearInstanceIds preserves block ids', () => {
  const container = new TerrainContainer({ width: 2, height: 2 }, { useSingleton: false })
  container.setBlockId(0, 0, 0, 1)
  container.setBlockInstanceId(0, 0, 0, 7)
  container.clearInstanceIds()

  assert.equal(container.getBlock(0, 0, 0).id, 1)
  assert.equal(container.getBlock(0, 0, 0).instanceId, null)
})
```

- [ ] **Step 2: Run the test and confirm the missing-module/API failures**

Run:

```bash
node --test tests/unit/chunk-render-policy.unit.js
```

Expected: FAIL because `chunk-render-capacity.js`, `chunk-window.js`, and `clearInstanceIds()` do not exist.

- [ ] **Step 3: Implement the immutable policy**

Use this capacity table in `chunk-render-capacity.js`:

```javascript
export const CHUNK_RENDER_VIEW_DISTANCE = 1
export const ACTIVE_SLOT_COUNT = 9
export const STAGING_SLOT_COUNT = 5
export const TOTAL_SLOT_COUNT = 14

export const BLOCK_INSTANCE_CAPACITY = Object.freeze({
  grass: 4096,
  dirt: 4096,
  stone: 8192,
  coalOre: 512,
  ironOre: 512,
  treeTrunk: 1024,
  treeLeaves: 4096,
  sand: 4096,
  birchTrunk: 1024,
  birchLeaves: 4096,
  cherryTrunk: 1024,
  cherryLeaves: 4096,
  cactus: 1024,
  terracotta: 4096,
  redSand: 4096,
  ice: 4096,
  packedIce: 4096,
  snow: 4096,
  gravel: 4096,
})

export const PLANT_INSTANCE_CAPACITY = 512
export const FIXED_INSTANCE_BUFFER_BYTES = 63594496

export function isSupportedChunkViewDistance(value) {
  return value === CHUNK_RENDER_VIEW_DISTANCE
}
```

Implement window keys as the existing `${chunkX},${chunkZ}` format. `diffChunkWindows()` returns three `Set` instances and performs no scene or manager mutation.

Create the structured error in `chunk-render-capacity-error.js`:

```javascript
export default class ChunkRenderCapacityError extends Error {
  constructor({ layer, typeId, required, capacity }) {
    super(`${layer}:${typeId} requires ${required} instances; capacity is ${capacity}`)
    this.name = 'ChunkRenderCapacityError'
    this.layer = layer
    this.typeId = typeId
    this.required = required
    this.capacity = capacity
  }
}
```

- [ ] **Step 4: Add `clearInstanceIds()`**

```javascript
clearInstanceIds() {
  this.forEachFilled((block) => {
    block.instanceId = null
  })
}
```

- [ ] **Step 5: Run the focused test and lint the touched files**

```bash
node --test tests/unit/chunk-render-policy.unit.js
pnpm exec eslint src/js/config/chunk-render-capacity.js src/js/world/terrain/chunk-window.js src/js/world/terrain/chunk-render-capacity-error.js src/js/world/terrain/terrain-container.js tests/unit/chunk-render-policy.unit.js
```

Expected: all tests pass and ESLint exits 0.

- [ ] **Step 6: Commit the policy layer**

```bash
git add src/js/config/chunk-render-capacity.js src/js/world/terrain/chunk-window.js src/js/world/terrain/chunk-render-capacity-error.js src/js/world/terrain/terrain-container.js tests/unit/chunk-render-policy.unit.js
git commit -m "feat(chunks): add fixed render slot policy"
```

---

### Task 2: Convert block and plant renderers into reusable fixed layers

**Files:**

- Modify: `src/js/world/terrain/terrain-renderer.js:20-545`
- Modify: `src/js/world/terrain/plant-renderer.js:13-150`
- Test: `tests/unit/terrain-render-layers.unit.js`

**Interfaces:**

- Consumes: the capacity constants and `ChunkRenderCapacityError` from Task 1.
- Produces from `TerrainRenderer`: `populate(container)`, `reset(container)`, `getMeshes()`, `getMesh(blockId)`, `replaceMesh(blockId, mesh, capacity)`, `addBlockInstance()`, `removeInstance()`, and `dispose()`.
- Produces from `PlantRenderer`: `populate(plantData)`, `reset()`, `getMeshes()`, `replaceMesh(plantId, mesh, capacity)`, and `dispose()`.
- Both constructors accept a parent group, resources, shared params, and injectable material factories; neither adds itself to the global scene nor subscribes to global events.

- [ ] **Step 1: Write failing UUID and overflow tests**

The test creates small capacity maps and injected `THREE.MeshBasicMaterial` factories. Assert all of the following:

```javascript
test('block renderer reuses mesh identity across populate calls', () => {
  const firstUuid = renderer.getMesh(blocks.grass.id).uuid
  renderer.populate(firstContainer)
  renderer.reset(firstContainer)
  renderer.populate(secondContainer)
  assert.equal(renderer.getMesh(blocks.grass.id).uuid, firstUuid)
})

test('block renderer reports overflow before mutating counts', () => {
  assert.throws(
    () => renderer.populate(containerWithThreeGrassBlocks),
    (error) =>
      error instanceof ChunkRenderCapacityError &&
      error.layer === 'blocks' &&
      error.required === 3 &&
      error.capacity === 2,
  )
  assert.equal(renderer.getMesh(blocks.grass.id).count, 0)
})

test('plant renderer reuses identity and clears old counts', () => {
  const uuid = plantRenderer.getMeshes()[0].uuid
  plantRenderer.populate([{ x: 0, y: 1, z: 0, plantId: PLANT_IDS.SHORT_GRASS }])
  plantRenderer.reset()
  plantRenderer.populate([])
  assert.equal(plantRenderer.getMeshes()[0].uuid, uuid)
  assert.equal(plantRenderer.getMeshes()[0].count, 0)
})
```

- [ ] **Step 2: Run the renderer-layer tests and observe failures**

```bash
node --test tests/unit/terrain-render-layers.unit.js
```

Expected: FAIL because the existing renderers create/dispose meshes during each build and require `Experience`/scene ownership.

- [ ] **Step 3: Refactor constructors to dependency-owned groups**

Use these constructor shapes:

```javascript
new TerrainRenderer({
  parent,
  resources,
  params,
  capacities: BLOCK_INSTANCE_CAPACITY,
  materialFactory: getSharedBlockMaterials,
  onMeshCreated,
})

new PlantRenderer({
  parent,
  resources,
  params,
  capacity: PLANT_INSTANCE_CAPACITY,
  materialFactory: getSharedPlantMaterials,
  onMeshCreated,
})
```

At construction, create one mesh per visible type. A block mesh receives a cloned box geometry with an `aAo` attribute sized to its fixed capacity. A plant mesh uses the shared cross-plane geometry and a fixed instance matrix capacity. Store `{ mesh, capacity, type }` records in the existing maps.

- [ ] **Step 4: Replace rebuild/dispose behavior with validate-then-populate**

Before writing any array, collect positions and verify every required count. Throw `ChunkRenderCapacityError` on the first overflow. Only after all types fit:

```javascript
container.clearInstanceIds()
this._blockMeshes.forEach(({ mesh }) => {
  mesh.count = 0
  mesh.userData.instanceToGrid.length = 0
})
```

Write matrices, AO, mappings, and instance IDs, then set exact update ranges:

```javascript
mesh.instanceMatrix.clearUpdateRanges()
mesh.instanceMatrix.addUpdateRange(0, count * 16)
mesh.instanceMatrix.needsUpdate = true

const ao = mesh.geometry.getAttribute('aAo')
ao.clearUpdateRanges()
ao.addUpdateRange(0, count)
ao.needsUpdate = true
```

Keep `removeInstance()` swap-and-pop semantics and `addBlockInstance()` capacity checks so block interaction remains incremental.

- [ ] **Step 5: Make disposal explicit and one-shot**

`reset()` clears counts/mappings but does not remove or dispose meshes. `dispose()` removes each mesh from its parent, calls `mesh.dispose()`, disposes per-slot cloned block geometries, clears maps, and never disposes shared materials or the shared plant geometry.

- [ ] **Step 6: Run tests, lint, and build**

```bash
node --test tests/unit/terrain-render-layers.unit.js
pnpm exec eslint src/js/world/terrain/terrain-renderer.js src/js/world/terrain/plant-renderer.js tests/unit/terrain-render-layers.unit.js
pnpm build
```

Expected: unit tests pass, lint exits 0, and Vite production build succeeds.

- [ ] **Step 7: Commit reusable render layers**

```bash
git add src/js/world/terrain/terrain-renderer.js src/js/world/terrain/plant-renderer.js tests/unit/terrain-render-layers.unit.js
git commit -m "refactor(chunks): reuse fixed terrain render layers"
```

---

### Task 3: Implement one stable `ChunkRenderSlot`

**Files:**

- Create: `src/js/world/terrain/chunk-render-slot.js`
- Test: `tests/unit/chunk-render-slot.unit.js`

**Interfaces:**

- Consumes: reusable render layers from Task 2.
- Produces: `populate(chunk)`, `prepareForCompile()`, `finishCompile()`, `attach(chunkX, chunkZ)`, `reset()`, `getRenderObjects()`, `replaceOverflowMesh(error)`, and `dispose()`.
- Slot states are exactly `free`, `filling`, `compiling`, `ready`, `active`, `retiring`, and `failed`.

- [ ] **Step 1: Write failing slot lifecycle tests**

Use injected fake block/plant layers and a real `THREE.Scene`/`THREE.Group`. Verify:

```javascript
test('slot stays detached until attach and reset preserves identities', () => {
  slot.populate(chunk)
  assert.equal(slot.state, 'ready')
  assert.equal(scene.children.includes(slot.group), false)

  slot.attach(2, -1)
  assert.equal(slot.state, 'active')
  assert.equal(slot.group.position.x, 128)
  assert.equal(slot.group.position.z, -64)

  const uuids = slot.getRenderObjects().map((object) => object.uuid)
  slot.reset()
  assert.equal(slot.state, 'free')
  assert.deepEqual(
    slot.getRenderObjects().map((object) => object.uuid),
    uuids,
  )
})

test('dummy prewarm state is reversible', () => {
  slot.prepareForCompile()
  assert.equal(slot.state, 'compiling')
  assert.ok(slot.getRenderObjects().every((object) => object.count === undefined || object.count === 1))
  slot.finishCompile(3)
  assert.equal(slot.state, 'free')
  assert.equal(slot.materialEpoch, 3)
})
```

- [ ] **Step 2: Run the test and confirm the module is missing**

```bash
node --test tests/unit/chunk-render-slot.unit.js
```

Expected: FAIL because `chunk-render-slot.js` does not exist.

- [ ] **Step 3: Implement slot ownership and water reuse**

The constructor receives `{ id, scene, resources, renderParams, waterParams, capacities, sharedWaterGeometry, sharedWaterMaterial, onMeshCreated }`. Create one root group, instantiate block and plant layers under it, and create one stable water mesh using shared geometry/material.

`populate(chunk)` must set `state = 'filling'`, call both layer populate methods, update water height, assign `chunkKey`, then set `state = 'ready'`. If either layer throws, restore the slot to a resettable state and rethrow without attaching the root.

- [ ] **Step 4: Implement reversible prewarm and attachment**

`prepareForCompile()` saves every object's count and `frustumCulled`, writes an identity matrix at instance zero, sets count one, and disables culling. `finishCompile(epoch)` restores counts to zero and culling flags, records the epoch, and returns the detached slot to `free`.

`attach()` validates `ready`, positions the root from `chunkX * chunkWidth` and `chunkZ * chunkWidth`, adds it to the scene, and marks it active. `reset()` removes it from the scene, clears layer data and binding metadata, and never disposes resources.

- [ ] **Step 5: Run test, lint, and commit**

```bash
node --test tests/unit/chunk-render-slot.unit.js
pnpm exec eslint src/js/world/terrain/chunk-render-slot.js tests/unit/chunk-render-slot.unit.js
git add src/js/world/terrain/chunk-render-slot.js tests/unit/chunk-render-slot.unit.js
git commit -m "feat(chunks): add stable chunk render slot"
```

Expected: tests pass and the commit contains only the slot and its test.

---

### Task 4: Implement the fixed pool and serial WebGPU prewarm

**Files:**

- Create: `src/js/world/terrain/chunk-render-slot-pool.js`
- Test: `tests/unit/chunk-render-slot-pool.unit.js`

**Interfaces:**

- Consumes: `TOTAL_SLOT_COUNT`, `FIXED_INSTANCE_BUFFER_BYTES`, and `ChunkRenderSlot`.
- Produces: `initialize(renderer, scene, camera)`, `whenReady()`, `acquire()`, `release(slot)`, `ensureCapacity(slot, error, guard)`, `invalidateMaterialType(typeId)`, `update(elapsed)`, `getDiagnostics()`, and `dispose()`.
- Constructor accepts `{ resources, renderParams, waterParams, slotFactory, delay }`; `initialize(renderer, scene, camera)` binds the live WebGPU objects exactly once. `slotFactory` and `delay` are injectable for deterministic tests.

- [ ] **Step 1: Write failing pool tests with fake slots and renderer**

Cover all invariants:

```javascript
function createFakeSlot({ id }) {
  return {
    id,
    state: 'free',
    group: { slotId: id },
    resetCalls: 0,
    disposeCalls: 0,
    prepareForCompile() {
      this.state = 'compiling'
    },
    finishCompile() {
      this.state = 'free'
    },
    reset() {
      this.resetCalls++
      this.state = 'free'
    },
    dispose() {
      this.disposeCalls++
    },
  }
}

function createPool() {
  return new ChunkRenderSlotPool({
    resources: {},
    renderParams: {},
    waterParams: {},
    slotFactory: createFakeSlot,
    delay: () => Promise.resolve(),
  })
}

test('prewarms exactly fourteen slots serially', async () => {
  let inFlight = 0
  let maxInFlight = 0
  const renderer = {
    async compileAsync() {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await Promise.resolve()
      inFlight--
    },
  }

  const pool = createPool()
  const scene = {}
  const camera = {}
  await pool.initialize(renderer, scene, camera)
  assert.equal(pool.slots.length, 14)
  assert.equal(maxInFlight, 1)
  assert.equal(pool.getDiagnostics().freeSlots, 14)
})

test('retries compilation once and never creates a fifteenth slot', async () => {
  let firstSlotAttempts = 0
  const renderer = {
    async compileAsync(group) {
      if (group.slotId !== 0) return
      firstSlotAttempts++
      if (firstSlotAttempts === 1) throw new Error('transient compile failure')
    },
  }
  const pool = createPool()

  await pool.initialize(renderer, {}, {})

  assert.equal(firstSlotAttempts, 2)
  assert.equal(pool.slots.length, 14)
})

test('release resets a slot without disposing it', async () => {
  const pool = createPool()
  await pool.initialize({ compileAsync: async () => {} }, {}, {})
  const slot = pool.acquire()
  pool.release(slot)
  assert.equal(slot.resetCalls, 1)
  assert.equal(slot.disposeCalls, 0)
})
```

- [ ] **Step 2: Run the test and confirm failure**

```bash
node --test tests/unit/chunk-render-slot-pool.unit.js
```

Expected: FAIL because the pool does not exist.

- [ ] **Step 3: Implement fixed construction and serial prewarm**

Create all fourteen slots before compiling. For each slot, mark performance entries, prepare dummy instances, call the real `renderer.compileAsync(slot.group, camera, scene)`, and finish with the current material epoch. Compile one slot at a time.

Use a single retry helper:

```javascript
async _compileWithRetry(slot, context) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await this.renderer.compileAsync(slot.group, this.camera, this.scene)
      return
    }
    catch (error) {
      if (attempt === 1)
        throw error
      await this.delay(250)
    }
  }
}
```

After successful startup prewarm, reset runtime `meshCreateCount` and `compileCount` to zero while retaining a separate `startupCompileCount = 14` for diagnostics.

- [ ] **Step 4: Implement bounded acquire/release and diagnostics**

`acquire()` returns the first free slot or `null`; it never allocates. `release()` accepts only pool-owned non-active slots, calls `reset()`, and updates counts. `getDiagnostics()` returns a fresh frozen snapshot containing all approved fields plus `startupCompileCount` and the current material epoch.

- [ ] **Step 5: Implement overflow replacement and stale guards**

`ensureCapacity()` creates only the overflowing type's replacement mesh at `nextPowerOfTwo(required)`, compiles the actual replacement, evaluates the supplied guard after await, and swaps only if current. On a stale guard, dispose only the uninstalled replacement. On success, retain the larger capacity for that slot and increment `overflowCount` and runtime `compileCount` once.

- [ ] **Step 6: Run tests, lint, and build**

```bash
node --test tests/unit/chunk-render-slot-pool.unit.js
pnpm exec eslint src/js/world/terrain/chunk-render-slot-pool.js tests/unit/chunk-render-slot-pool.unit.js
pnpm build
```

Expected: serial-prewarm, retry, fixed-count, stale-guard, and disposal tests pass.

- [ ] **Step 7: Commit the pool**

```bash
git add src/js/world/terrain/chunk-render-slot-pool.js tests/unit/chunk-render-slot-pool.unit.js
git commit -m "feat(chunks): prewarm fixed render slot pool"
```

---

### Task 5: Decouple `TerrainChunk` and integrate atomic window transitions

**Files:**

- Modify: `src/js/world/terrain/terrain-chunk.js:21-317`
- Modify: `src/js/world/terrain/chunk-manager.js:20-618`
- Modify: `playwright.config.js`
- Test: `tests/chunk-render-slot-pool.e2e.test.js`

**Interfaces:**

- Consumes: pool, window diff, and data-only chunks.
- Produces from `ChunkManager`: `initializeRenderPool()`, `whenRenderReady()`, `setViewDistance(value)`, `getRenderDiagnostics()`, `_requestWindow(centerX, centerZ)`, `_runLatestTransition()`, `_stageIncomingChunk()`, `_commitTransition()`, and `_releaseStaleSlots()`.
- `activeSlots` is a `Map<chunkKey, ChunkRenderSlot>` and `chunks` remains the data-chunk map.

- [ ] **Step 1: Configure focused Playwright startup and write the failing initial-window test**

Set `baseURL` to `http://127.0.0.1:4173` and enable:

```javascript
webServer: {
  command: 'pnpm dev --host 127.0.0.1 --port 4173',
  url: 'http://127.0.0.1:4173',
  reuseExistingServer: true,
  timeout: 120000,
},
```

Create a serial Chromium test that imports the existing singleton from the served page:

```javascript
import { expect, test } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

async function attachExperience(page) {
  await page.goto('/')
  await page.evaluate(async () => {
    const { default: Experience } = await import('/src/js/experience.js')
    window.__chunkSlotTestExperience = new Experience()
  })
  await page.waitForFunction(() => window.__chunkSlotTestExperience?.world?.chunkManager)
  await page.evaluate(() => window.__chunkSlotTestExperience.world.chunkManager.whenRenderReady())
}

test('starts with a complete fixed 3x3 render window', async ({ page }) => {
  await attachExperience(page)
  const diagnostics = await page.evaluate(() =>
    window.__chunkSlotTestExperience.world.chunkManager.getRenderDiagnostics(),
  )

  expect(diagnostics.totalSlots).toBe(14)
  expect(diagnostics.activeSlots).toBe(9)
  expect(diagnostics.freeSlots).toBe(5)
  expect(diagnostics.estimatedBufferBytes).toBe(63594496)
})
```

- [ ] **Step 2: Run the E2E test and confirm missing manager APIs**

```bash
pnpm exec playwright test tests/chunk-render-slot-pool.e2e.test.js --headed --project=chromium
```

Expected: FAIL because `whenRenderReady()` and pool diagnostics do not exist.

- [ ] **Step 3: Make `TerrainChunk` data-only**

Remove `TerrainRenderer`, `PlantRenderer`, water geometry/material, scene attachment, `buildMesh()`, and render updates from `TerrainChunk`. Keep `container`, `generator`, origin, generation, regeneration, and `dispose()` state. Its states become only `init`, `dataReady`, and `disposed`.

`generateData()` continues to return a boolean and applies no render work. `regenerate()` returns the chunk to `dataReady` after regenerating its data.

- [ ] **Step 4: Initialize the pool and preserve initial data generation**

In `ChunkManager`, add:

```javascript
initializeRenderPool() {
  if (!this._renderPoolReadyPromise) {
    this._renderPoolReadyPromise = this.experience.renderer.whenReady()
      .then(() => this.renderSlotPool.initialize(
        this.experience.renderer.instance,
        this.experience.scene,
        this.experience.camera.instance,
      ))
      .then(async () => {
        await this._requestWindow(0, 0, true)
      })
  }
  return this._renderPoolReadyPromise
}

whenRenderReady() {
  return this._renderPoolReadyPromise ?? Promise.resolve()
}
```

Keep the current high-priority synchronous data generation for the player's current chunk so collision never depends on rendering.

`_requestWindow()` must return the current transition-runner Promise. Therefore `whenRenderReady()` resolves only after the initial nine-slot commit, not merely after the fourteen-slot prewarm.

- [ ] **Step 5: Replace mesh queueing with a single latest-transition runner**

`updateStreaming()` records the latest center and increments `transitionId`. If no runner is active, start one loop. The loop snapshots the latest request, computes `overlap/incoming/outgoing`, ensures incoming data, acquires at most five staging slots, and populates them through keyed idle tasks.

Every await completion checks:

```javascript
const isCurrent = () =>
  !this._destroyed &&
  transitionId === this._transitionId &&
  this._targetWindow.has(chunkKey) &&
  slot.assignmentId === assignmentId
```

If stale, release staged slots and continue with the newest recorded target.

- [ ] **Step 6: Implement one-task commit**

Build a new map from overlap plus ready incoming slots. In one synchronous method, attach incoming roots, swap `activeSlots`, detach/release outgoing roots, mark performance entries, then emit `game:chunk-built` for incoming chunks. Prune only data chunks outside `viewDistance + unloadPadding` after commit.

No call to `renderPipeline.render()` or `renderer.instance.render()` belongs in this workflow.

- [ ] **Step 7: Enforce fixed distance**

```javascript
setViewDistance(value) {
  if (!isSupportedChunkViewDistance(value)) {
    if (!this._hasWarnedUnsupportedViewDistance) {
      console.warn(`[ChunkManager] render slot pool requires viewDistance=1; ignored ${value}`)
      this._hasWarnedUnsupportedViewDistance = true
    }
    return false
  }
  this.viewDistance = value
  return true
}
```

- [ ] **Step 8: Run the initial-window test, lint, and build**

```bash
pnpm exec playwright test tests/chunk-render-slot-pool.e2e.test.js --headed --project=chromium
pnpm exec eslint src/js/world/terrain/terrain-chunk.js src/js/world/terrain/chunk-manager.js tests/chunk-render-slot-pool.e2e.test.js playwright.config.js
pnpm build
```

Expected: the initial window reports 14/9/5 and the build succeeds.

- [ ] **Step 9: Commit data/render decoupling**

```bash
git add src/js/world/terrain/terrain-chunk.js src/js/world/terrain/chunk-manager.js playwright.config.js tests/chunk-render-slot-pool.e2e.test.js
git commit -m "refactor(chunks): stage atomic render windows"
```

---

### Task 6: Route interaction, regeneration, settings, and material changes through slots

**Files:**

- Modify: `src/js/world/terrain/chunk-manager.js:245-390,620-1094`
- Modify: `src/js/world/terrain/blocks-config.js:470-510`
- Modify: `src/js/world/world.js:54-74,120-134,168-222`
- Modify: `tests/chunk-render-slot-pool.e2e.test.js`

**Interfaces:**

- Consumes: `activeSlots` and pool epochs from Task 5.
- Produces: `_getActiveBlockLayer(chunkKey)`, `_refreshActiveChunk(chunkKey)`, `invalidateMaterialType(typeId)`, reset-safe pool reuse, and fixed-distance settings handling.

- [ ] **Step 1: Add failing crossing, UUID, mapping, and reset tests**

Extend the serial E2E suite:

```javascript
test('reuses UUIDs without runtime compile across ten crossings', async ({ page }) => {
  await attachExperience(page)
  const initialUuids = await page.evaluate(() =>
    window.__chunkSlotTestExperience.world.chunkManager.renderSlotPool.slots
      .flatMap((slot) => slot.getRenderObjects().map((object) => object.uuid))
      .sort(),
  )

  for (let chunkX = 1; chunkX <= 10; chunkX++) {
    await page.evaluate((x) => {
      const world = window.__chunkSlotTestExperience.world
      world.player.setPosition(x * 64 + 32, 20, 32)
    }, chunkX)
    await expect
      .poll(() =>
        page.evaluate((x) => {
          const manager = window.__chunkSlotTestExperience.world.chunkManager
          const actual = [...manager.activeSlots.keys()].sort()
          const expected = []
          for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) expected.push(`${x + dx},${dz}`)
          }
          return JSON.stringify(actual) === JSON.stringify(expected.sort())
        }, chunkX),
      )
      .toBe(true)
  }

  const result = await page.evaluate(() => {
    const manager = window.__chunkSlotTestExperience.world.chunkManager
    return {
      diagnostics: manager.getRenderDiagnostics(),
      uuids: manager.renderSlotPool.slots
        .flatMap((slot) => slot.getRenderObjects().map((object) => object.uuid))
        .sort(),
    }
  })

  expect(result.uuids).toEqual(initialUuids)
  expect(result.diagnostics.meshCreateCount).toBe(0)
  expect(result.diagnostics.compileCount).toBe(0)
})
```

Add the following cases to the same serial suite:

- Gate one staging `populate()` Promise, request `(1,0)`, and assert the old active key set and all old mappings remain unchanged until the gate resolves. After resolving it, assert the complete target key set appears in one observation.
- While that gate is pending, request `(1,1)` and assert only the latest 3x3 key set commits; the obsolete transition must never emit `game:chunk-built`.
- For every active block mesh, verify each `instanceToGrid[index]` resolves to a container block with the matching `blockId` and `instanceId` before and after slot reuse.
- Mine one visible block, place a different block, leave the chunk, return, and assert both persisted modifications and raycast mappings survive slot reuse.
- Call `setViewDistance(2)` and assert it returns `false`, the manager remains at one, the pool still has fourteen slots, and only one contextual warning is logged across repeated invalid calls.
- Force one block type over capacity and assert the old active slot remains attached until the asynchronously compiled replacement is ready; no fifteenth slot is created.
- Trigger a structural material invalidation with one replacement compile gated. Assert all active meshes keep the old material epoch until all fourteen replacements are ready, then switch as one generation.
- Reset during a pending transition and destroy during a pending compile. Assert UUIDs survive reset, resources dispose once on destroy, and late completions do not attach or emit.

- [ ] **Step 2: Run the extended E2E suite and confirm interaction/reset failures**

```bash
pnpm exec playwright test tests/chunk-render-slot-pool.e2e.test.js --headed --project=chromium
```

Expected: FAIL where code still reads `chunk.renderer`, rebuilds renderers, or does not expose settled transition state.

- [ ] **Step 3: Route block add/remove to the active slot**

Replace every `chunk.renderer` lookup with:

```javascript
_getActiveBlockLayer(chunkKey) {
  return this.activeSlots.get(chunkKey)?.terrainRenderer ?? null
}
```

Keep the existing swap-and-pop and neighbor visibility algorithms. If `addBlockInstance()` throws `ChunkRenderCapacityError`, acquire one staging slot, populate/expand it asynchronously, and atomically replace only that active chunk's slot. The data mutation and persistence write remain immediate; visual replacement waits for readiness.

- [ ] **Step 4: Make regeneration reuse the pool**

`regenerateAll()` increments `transitionId`, clears idle work, resets/releases active and staging slots, clears data chunks, regenerates the target data window, and requests a fresh initial commit. It does not reconstruct or recompile the pool when material structure is unchanged.

Height-scale and ore-filter debug changes repopulate existing active slots in place because they do not change mesh identities or capacities. Water height changes update every active slot's water transform. Scale changes update slot roots.

- [ ] **Step 5: Centralize render-setting and material events**

Remove per-slot global event listeners from render layers. `ChunkManager` listens once for shadow quality and material structural invalidation. Uniform-only animation settings update shared materials in place. Structural changes increment `materialEpoch`, invalidate the affected type, prepare fourteen replacements, compile them serially, and swap only after all replacements are ready.

Keep `clearSharedMaterialCache()` as a low-level cache function, but no runtime callback may call it followed by synchronous mesh reconstruction.

- [ ] **Step 6: Update `World` initialization and settings validation**

In `_initTerrain()`, create the manager, call `setViewDistance(settingsStore.chunkViewDistance)`, start `initializeRenderPool()`, then initialize data. In the settings listener, call `setViewDistance()` instead of direct assignment. Preserve `unloadPadding` updates.

`World.reset()` may remain synchronous to its caller, but internally it starts the manager's reset Promise; player respawn waits until the current data chunk is `dataReady`, not until render compilation.

- [ ] **Step 7: Implement reset/destroy guards and one-shot disposal**

Increment transition and assignment epochs before clearing queues. Dispose data chunks separately from slots. Pool destroy removes roots, disposes per-slot meshes/geometries once, then shared materials/geometries once. Promise completions check `_destroyed` before emitting or attaching.

- [ ] **Step 8: Run E2E, unit tests, lint, and build**

```bash
node --test tests/unit/chunk-render-policy.unit.js tests/unit/terrain-render-layers.unit.js tests/unit/chunk-render-slot.unit.js tests/unit/chunk-render-slot-pool.unit.js
pnpm exec playwright test tests/chunk-render-slot-pool.e2e.test.js --headed --project=chromium
pnpm exec eslint src/js/world/terrain src/js/world/world.js src/js/world/terrain/blocks-config.js tests/unit tests/chunk-render-slot-pool.e2e.test.js
pnpm build
```

Expected: UUID, crossing, stale-target, mapping, reset, and fixed-count tests pass.

- [ ] **Step 9: Commit lifecycle integration**

```bash
git add src/js/world/terrain/chunk-manager.js src/js/world/terrain/blocks-config.js src/js/world/world.js tests/chunk-render-slot-pool.e2e.test.js
git commit -m "perf(chunks): reuse precompiled render slots"
```

---

### Task 7: Add diagnostics, failure coverage, and performance guardrails

**Files:**

- Modify: `src/js/world/terrain/chunk-render-slot-pool.js`
- Modify: `src/js/world/terrain/chunk-manager.js`
- Modify: `src/js/renderer.js:153-192,473-508`
- Modify: `tests/unit/chunk-render-slot-pool.unit.js`
- Modify: `tests/chunk-render-slot-pool.e2e.test.js`

**Interfaces:**

- Produces: approved `performance.mark()` names, `game:chunk-render-failed`, device-loss stop behavior, and frame/transition diagnostics.
- Does not move chunk scheduling into `renderer.js`.

- [ ] **Step 1: Add failing retry, stale completion, and failure-event tests**

Unit-test a compile function that fails twice. Assert exactly two attempts, slot state `failed`, no fifteenth slot, and one failure callback. Resolve a stale compile after `dispose()` and assert it does not attach or dispose reassigned resources.

In E2E, install a `PerformanceObserver` before crossings and collect long tasks plus the approved chunk marks. Assert every successful transition has `start`, `data-ready`, `populate-ready`, and `commit` marks in order.

- [ ] **Step 2: Run tests and confirm missing diagnostics/failure behavior**

```bash
node --test tests/unit/chunk-render-slot-pool.unit.js
pnpm exec playwright test tests/chunk-render-slot-pool.e2e.test.js --headed --project=chromium
```

Expected: FAIL until marks, failure emission, and stale disposal guards are implemented.

- [ ] **Step 3: Add exact performance marks and bounded diagnostics**

Emit:

```text
chunk-transition:start
chunk-transition:data-ready
chunk-transition:populate-ready
chunk-transition:commit
chunk-slot:compile-start
chunk-slot:compile-end
```

Clear or reuse measures so diagnostics do not grow without bound. `getDiagnostics()` returns counts and last durations, not accumulated per-transition arrays.

- [ ] **Step 4: Wire failure emission and renderer device state**

After the second compilation failure, keep the old active window, mark the slot failed, release other staging slots, and emit `game:chunk-render-failed` with `{ chunkX, chunkZ, reason }`. Add only the smallest renderer readiness/device-loss accessor needed for the pool to stop submissions; keep `renderPipeline.render()` unchanged.

- [ ] **Step 5: Preserve the existing slow-frame logger as a regression signal**

Keep the `>= 50 ms` warning around `renderPipeline.render()`. Do not suppress warnings. The E2E test listens for `[renderer] slow frame` during post-prewarm transitions and records any occurrence as a failure artifact; avoid a hard timing assertion in unit tests.

- [ ] **Step 6: Run all automated verification**

```bash
node --test tests/unit/chunk-render-policy.unit.js tests/unit/terrain-render-layers.unit.js tests/unit/chunk-render-slot.unit.js tests/unit/chunk-render-slot-pool.unit.js
pnpm exec playwright test tests/chunk-render-slot-pool.e2e.test.js --headed --project=chromium
pnpm lint
pnpm build
```

Expected: all commands exit 0. If full lint reports unrelated existing failures, record them separately and verify every touched file with `pnpm exec eslint <touched paths>`.

- [ ] **Step 7: Commit diagnostics and guardrails**

```bash
git add src/js/world/terrain/chunk-render-slot-pool.js src/js/world/terrain/chunk-manager.js src/js/renderer.js tests/unit/chunk-render-slot-pool.unit.js tests/chunk-render-slot-pool.e2e.test.js
git commit -m "test(chunks): guard render slot performance"
```

---

### Task 8: Record a clean browser trace and close acceptance

**Files:**

- Modify only if measurements require a correction: files already listed in Tasks 1-7.
- Record results in the implementation handoff; do not commit the large Chrome trace JSON.

**Interfaces:**

- Consumes: performance marks and diagnostics from Task 7.
- Produces: evidence for frame time, runtime compile count, GPU-task correlation, memory budget, and bounded resource counts.

- [ ] **Step 1: Start a production-equivalent local run**

```bash
pnpm build
pnpm preview --host 127.0.0.1 --port 4173
```

Use Chrome with EventMonitorPanel, Stats, Tweakpane, Vue DevTools, Grammarly, and unrelated extensions disabled.

- [ ] **Step 2: Record the acceptance route**

Record startup/prewarm, ten straight chunk crossings, one diagonal crossing, return to visited terrain, and thirty seconds stationary. Capture Memory and Screenshots in the Performance panel.

- [ ] **Step 3: Verify trace and runtime counters**

Confirm:

- No normal post-prewarm transition contains `NodeBuilder.build()`.
- Runtime `meshCreateCount` and `compileCount` stay zero on adequately sized chunks.
- No chunk transition produces a 0.5-2 second `pipeline.render()` call.
- Transition frames remain below 50 ms; target P99 is below 16.67 ms.
- No several-hundred-millisecond `GPUTask` sequence aligns with normal commit marks.
- Fixed buffer estimate remains `63594496` bytes and total added GPU memory is near or below 80 MiB.
- Slot count stays fourteen and settled state stays nine active/five free.
- Resource, listener, and material counts remain bounded after returning to visited terrain.

- [ ] **Step 4: If an acceptance metric fails, make one scoped correction and repeat verification**

Classify the failure as populate/upload time, capacity overflow, material invalidation, stale transition, or unrelated renderer work. Add a focused regression test before changing code, apply the smallest correction in the owning component, rerun Task 7 commands, then repeat the trace route.

- [ ] **Step 5: Commit any measurement-driven correction separately**

Use a scoped conventional commit matching the actual correction, for example:

```bash
git add <only-the-corrected-source-and-test-files>
git commit -m "perf(chunks): bound slot buffer uploads"
```

- [ ] **Step 6: Final handoff**

Report the exact commands run, pass/fail status, trace observations, final buffer estimate, whether any capacity overflow occurred, and any unrelated existing lint or environment noise. Do not claim the stutter fixed without the clean trace evidence.

---

## Final Verification Checklist

- [ ] `node --test` unit suite passes.
- [ ] Focused Chromium Playwright suite passes.
- [ ] `pnpm lint` passes or unrelated pre-existing failures are explicitly separated from touched-file lint.
- [ ] `pnpm build` passes.
- [ ] Normal transitions create no meshes and compile no pipelines after prewarm.
- [ ] Exactly fourteen slots exist; settled state is nine active and five free.
- [ ] UUIDs remain stable across ten straight crossings and a diagonal crossing.
- [ ] Raycast mappings and block edits remain correct after slot reuse.
- [ ] Reset preserves slot UUIDs; destroy is one-shot and stale-safe.
- [ ] Clean Chrome trace meets the approved frame, GPU-task, INP, and memory criteria.
