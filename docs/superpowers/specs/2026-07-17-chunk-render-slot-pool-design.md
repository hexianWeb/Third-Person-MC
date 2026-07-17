# Fixed Chunk Render Slot Pool Design

**Date:** 2026-07-17

**Status:** Approved design

**Scope:** WebGPU terrain chunk rendering in `Third-Person-MC`

## Problem

Chrome Performance trace `Trace-20260717T154034.json` shows that new chunk meshes trigger synchronous WebGPU/TSL work during the first visible render. The representative long frame spends about 115 ms in the `needsRefresh -> getNodeBuilderState -> NodeBuilder.build` path, followed by a GPU-process stall of about 775 ms. The affected keyboard event handler itself takes only 0.164 ms; most of the reported 1078.5 ms INP is presentation delay.

The current chunk build timers do not include this cost. `TerrainChunk.buildMesh()` measures JavaScript mesh construction, while the expensive work starts later when `renderPipeline.render()` first traverses the newly created meshes.

Sharing materials alone is insufficient. Three.js 0.185.1 includes an `InstancedMesh` object's UUID in the render-object material cache key, so every newly created per-chunk `InstancedMesh` can require a new TSL node-builder state even when its material is shared.

## Goals

- Keep the normal chunk-streaming path from creating new `InstancedMesh` identities.
- Compile the actual long-lived mesh identities before gameplay can expose them to normal rendering.
- Keep the current 3x3 visible chunk window complete while an incoming window is prepared.
- Preserve block raycasting, mining, placement, persistence, AO, plants, water, shadows, and animated materials.
- Bound the renderer to 14 long-lived chunk render slots for `viewDistance = 1`.
- Keep fixed instance buffers at or below approximately 65 MiB and total additional GPU memory at or below approximately 80 MiB.
- Make stale asynchronous work unable to attach an obsolete chunk after movement, reset, or destroy.

## Non-goals

- Supporting render distances other than `viewDistance = 1` in this version.
- Combining the entire world into one global `InstancedMesh` per block type.
- Moving terrain generation to a worker.
- Optimizing `BlockRaycaster`; it is a separate sustained CPU hotspot, not the cause of the recorded one-second stall.
- Changing the Vue UI or adding a loading-progress interface.

## Fixed Runtime Constraint

This version is explicitly designed for `viewDistance = 1`. The active visible window therefore contains nine chunks. A diagonal one-chunk movement can introduce at most five incoming chunks, so the renderer owns exactly fourteen slots:

```text
9 active slots + 5 staging/free slots = 14 total slots
```

If a runtime settings event requests another view distance, `ChunkManager` keeps the last valid value of `1`, logs one contextual warning, and does not resize or recreate the pool. The existing UI is not changed by this work.

`unloadPadding` remains a data-cache policy. Chunks in the padding region may retain their `TerrainContainer` and generated data, but only the 3x3 target window owns active render slots.

## Architecture

### Ownership

```text
ChunkManager
|-- dataChunks: Map<chunkKey, TerrainChunk>
|   `-- TerrainContainer, TerrainGenerator, plantData, persistence state
|-- activeSlots: Map<chunkKey, ChunkRenderSlot>
`-- ChunkRenderSlotPool
    |-- 9 active slots
    `-- 5 staging/free slots
```

World data and render resources have independent lifetimes. `TerrainChunk` becomes a data owner and no longer constructs `TerrainRenderer`, `PlantRenderer`, or water meshes. `ChunkManager` is the only component allowed to bind a data chunk to a render slot.

### ChunkRenderSlot

Each `ChunkRenderSlot` owns stable render identities for the lifetime of the pool:

- One detached root `THREE.Group`.
- One block `InstancedMesh` for every visible block type.
- One plant `InstancedMesh` for every visible plant type.
- One water mesh.
- A current `chunkKey`, origin, capacity table, material epoch, compile state, and slot state.
- Per-block `instanceToGrid` mappings used by raycasting and interaction.

Its public lifecycle is:

```javascript
slot.populate(chunk)
slot.attach(chunkX, chunkZ)
slot.reset()
slot.dispose()
```

`populate()` updates existing arrays, counts, mappings, bounds, and origin. It does not create a mesh in the normal path. `reset()` detaches the root, clears binding metadata and counts, and preserves all GPU resources. Only `dispose()` destroys those resources.

The existing `TerrainRenderer` and `PlantRenderer` are refactored into slot-owned block and plant layers. They accept a parent group and fixed mesh set, do not add themselves directly to the global scene, do not destroy meshes during repopulation, and do not independently own global event listeners. `ChunkManager` routes render-setting and interaction changes to the applicable active slot.

### ChunkRenderSlotPool

`ChunkRenderSlotPool` creates, prewarms, lends, resets, and destroys the fixed fourteen slots:

```javascript
await pool.initialize(renderer, scene, camera)
pool.acquire()
pool.release(slot)
pool.dispose()
```

It also owns shared block, plant, and water materials, shared base geometries, the material epoch, and aggregate diagnostics. Shared animated-material time uniforms are updated once per frame by the pool instead of once per chunk.

The renderer wrapper continues to own `renderer.instance` and WebGPU readiness. It does not schedule chunk work.

## Slot and Chunk States

Data chunks use the following states:

```text
init -> dataReady -> disposed
```

Render slots use:

```text
free -> filling -> compiling -> ready -> active -> retiring -> free
```

A prewarmed, adequately sized slot normally skips `compiling`:

```text
free -> filling -> ready -> active
```

The `compiling` state is reserved for startup prewarm, capacity overflow, a material-structure change, or a newly introduced render type.

## Startup Prewarm

Pool initialization begins after `core:ready`, when the WebGPU renderer and loaded texture resources are available. Initial 3x3 data generation may proceed in parallel.

For each of the fourteen actual slots:

1. Create every fixed block, plant, and water render identity.
2. Temporarily set every mesh to one valid dummy instance so zero-count culling cannot skip it.
3. Disable frustum culling for the prewarm traversal.
4. Call `renderer.instance.compileAsync(slot.group, camera, scene)` serially, one slot at a time.
5. Restore culling, set all instance counts to zero, and leave the root detached.
6. Mark the slot free and compiled for the current material epoch.

The initial visible terrain commits only after both its data and the slot pool are ready. Prewarm normally completes while the main menu is open. If the player starts immediately, the initial terrain waits for the pool; normal rendering is never allowed to compile these slot identities synchronously as a fallback.

## Window Transition

On every player chunk-coordinate change, `ChunkManager` computes four sets:

- `overlap`: target chunks that already have active slots.
- `incoming`: target chunks without active slots.
- `outgoing`: active chunks outside the new target window.
- `cached`: data-only chunks retained by `unloadPadding`.

The transition is prepared as follows:

1. Keep overlap and outgoing slots attached.
2. Increment and capture `transitionId`.
3. Ensure every incoming data chunk reaches `dataReady`, applying persisted modifications before rendering.
4. Acquire one free staging slot per incoming chunk; a diagonal transition needs at most five.
5. Populate staging slots through the existing idle queue, nearest chunks first and one bounded task at a time.
6. If every slot is precompiled for the current material epoch and capacities fit, mark them ready without calling `compileAsync()`.
7. If an overflow or structural invalidation creates a replacement mesh, compile that actual replacement asynchronously before the slot becomes ready.
8. When all incoming slots are ready and the transition is still current, commit the complete target window in one main-thread task.

The commit task attaches all incoming roots, replaces `activeSlots`, detaches all outgoing roots, resets/releases outgoing slots, and then emits `game:chunk-built` for each newly active chunk. Normal rendering therefore cannot observe a partially committed target window.

Only one window transition may own staging slots. If movement requests a second target before the first is ready, the manager records only the newest target and invalidates the earlier `transitionId`. Work already submitted to WebGPU is allowed to finish, but its completion may only reset/release the stale slot; it may never attach it.

Collision and terrain queries continue to use data chunks, so player support does not depend on render-slot readiness.

## Capacity and Buffer Layout

The current configuration contains nineteen visible block types and nine visible plant types. Initial per-slot capacities are:

| Type | Capacity per slot |
| --- | ---: |
| `stone` | 8192 |
| `grass`, `dirt`, `sand`, `terracotta`, `redSand`, `ice`, `packedIce`, `snow`, `gravel` | 4096 each |
| `treeLeaves`, `birchLeaves`, `cherryLeaves` | 4096 each |
| `treeTrunk`, `birchTrunk`, `cherryTrunk`, `cactus` | 1024 each |
| `coalOre`, `ironOre` | 512 each |
| Every plant type | 512 each |

Each block instance reserves 64 bytes for its matrix and 4 bytes for AO. Each plant instance reserves 64 bytes for its matrix. Across fourteen slots, the fixed instance buffers are approximately 60.7 MiB on the GPU and another 60.7 MiB in CPU typed arrays.

`slot.populate(chunk)` performs these operations in order:

1. Set all mesh counts to zero.
2. Call `container.clearInstanceIds()` to eliminate identifiers from a previous slot binding.
3. Group visible block and plant positions by type.
4. Write the existing `instanceMatrix` and `aAo` arrays.
5. Rebuild `instanceToGrid` and write container instance identifiers.
6. Mark precise update ranges for `[0, count)` rather than uploading unused capacity.
7. Set counts and update bounding boxes/spheres.
8. Leave absent types at count zero without destroying their mesh.

## Capacity Overflow

Replacing the array or attribute captured by the existing TSL node-builder state is not treated as a safe in-place resize. When `requiredCount` exceeds a type's capacity, the next capacity is `nextPowerOfTwo(requiredCount)` and the replacement is prepared off the active path:

1. Preserve the current active window.
2. Create a replacement `InstancedMesh` in the staging slot with the new capacity and the same material/geometry structure.
3. Fill its matrices, AO, mappings, and bounds.
4. Compile the actual replacement mesh asynchronously.
5. Recheck `transitionId`, material epoch, pool liveness, and target membership.
6. Replace and dispose the smaller mesh only after successful compilation.

For block placement that overflows an active mesh, the data update succeeds immediately, but the new visual instance waits for the asynchronous replacement. The game thread never falls back to synchronous first-render compilation.

The larger replacement remains part of that slot until pool destruction, so the same overflow does not recur each time the slot is reused.

## Material Lifecycle

All slots share materials per block or plant type. Material changes are classified as follows:

- Uniform-only changes, including time, wind values, and numeric tuning uniforms, update in place and do not change the material epoch.
- Structural changes, including `transparent`, `alphaTest`, node-graph structure, texture presence, or vertex-layout requirements, increment `materialEpoch`.

On a structural change, the pool invalidates the affected type, prepares replacement meshes/materials for all fourteen slots, compiles them asynchronously, and switches only after every required replacement is ready. Active slots keep their old version during preparation.

Existing debug callbacks that call `clearSharedMaterialCache()` followed by synchronous renderer rebuilding are redirected to this structural invalidation path.

Base water geometry and water material are shared across slots. A slot retains only its water mesh identity and transform. Shared resources are disposed once by the pool, never by an individual slot reset.

## Cancellation, Reset, and Destruction

Every asynchronous completion must verify all of the following before mutating scene state:

- Its `transitionId` is current.
- Its material epoch is current.
- The target chunk is still in the latest target window.
- The slot is still assigned to the operation.
- The pool and `ChunkManager` have not been destroyed.

World reset increments `transitionId`, clears the idle queue, detaches and resets every slot, clears old data chunks, generates the new initial data window, and reuses the already compiled pool when material structure is unchanged.

Destroy sets `_destroyed`, invalidates all transitions, removes all roots, disposes each mesh and per-slot geometry/buffer once, and finally disposes shared materials/geometries once. Late Promise completions may return but cannot attach, emit chunk-built events, or dispose a newly reassigned resource.

## Failure Policy

An asynchronous compilation error is caught with slot, chunk, render type, capacity, transition, and epoch context. The active window remains attached. The operation retries once after 250 ms. A second failure marks the slot failed, stops the current transition, and emits:

```javascript
emitter.emit('game:chunk-render-failed', {
  chunkX,
  chunkZ,
  reason,
})
```

The system does not create a fifteenth slot and does not invoke synchronous rendering as a fallback. If no free staging slot exists, the manager retains only the latest requested target and retries after the current operation releases its slots. A WebGPU device-loss condition stops new pool submissions and is delegated to the renderer's device-error lifecycle.

## Diagnostics

The pool exposes read-only diagnostics:

```javascript
{
  totalSlots: 14,
  activeSlots: 9,
  stagingSlots: 0,
  freeSlots: 5,
  failedSlots: 0,
  meshCreateCount: 0,
  compileCount: 0,
  overflowCount: 0,
  estimatedBufferBytes: 63594496,
  lastTransitionMs: 0,
}
```

After startup prewarm, `meshCreateCount` and `compileCount` are reset. Both must remain zero during normal adequately sized transitions.

Performance marks are emitted for:

```text
chunk-transition:start
chunk-transition:data-ready
chunk-transition:populate-ready
chunk-transition:commit
chunk-slot:compile-start
chunk-slot:compile-end
```

These marks make later Chrome traces directly align chunk lifecycle work with main-thread and GPU work.

## Expected File Boundaries

- Create `src/js/world/terrain/chunk-render-slot.js`: one long-lived slot and its block, plant, water, capacity, mapping, populate, reset, and disposal behavior.
- Create `src/js/world/terrain/chunk-render-slot-pool.js`: fixed pool ownership, startup prewarm, material epoch, acquisition, release, diagnostics, and shared-resource disposal.
- Create `src/js/config/chunk-render-capacity.js`: the approved immutable capacity table and the fixed `viewDistance = 1` slot-count constants.
- Modify `src/js/world/terrain/terrain-chunk.js`: retain data generation and persistence-facing state; remove ownership of scene renderers.
- Modify `src/js/world/terrain/terrain-renderer.js`: convert block rendering into a slot-owned, reusable layer that populates fixed meshes without scene attachment or per-rebuild disposal.
- Modify `src/js/world/terrain/plant-renderer.js`: convert plant rendering into a slot-owned, reusable layer.
- Modify `src/js/world/terrain/chunk-manager.js`: own data/render mappings, transitions, cancellation, atomic commit, fixed-distance validation, and pool lifecycle.
- Modify `src/js/world/world.js`: start pool initialization and preserve renderer readiness ordering.
- Modify `src/js/renderer.js` only if a small public readiness/device-loss hook is required; chunk scheduling must not move into the renderer.
- Add focused Playwright coverage under `tests/` for lifecycle, stability, race, interaction, reset, and performance counters.

## Automated Verification

Focused tests cover:

1. Fourteen slot and mesh UUID sets remain stable across at least ten chunk crossings.
2. Normal transitions keep `meshCreateCount === 0` and `compileCount === 0` after prewarm.
3. The pool never creates a fifteenth slot; a settled window has nine active and five free slots.
4. Active mappings remain unchanged until every incoming slot is ready, then switch atomically.
5. A stale transition completion cannot attach an obsolete chunk.
6. A forced overflow keeps the current window, asynchronously compiles a replacement, and swaps only after success.
7. Raycast `instanceId` mappings, mining, placement, and persisted modifications remain correct after slot reuse.
8. Reset and destroy during pending work do not double-dispose or reattach resources.
9. A requested `viewDistance` other than one is rejected without changing the active pool.

Verification commands are:

```bash
pnpm lint
pnpm build
pnpm test:chrome
```

## Performance Acceptance

Record a clean Chrome Performance trace with EventMonitorPanel, Stats, Tweakpane, Vue DevTools, and unrelated browser extensions disabled. The run includes startup/prewarm, ten straight chunk crossings, at least one diagonal crossing, returning to visited terrain, and thirty seconds stationary.

The design passes when:

- No normal post-prewarm chunk transition enters `NodeBuilder.build()`.
- No chunk transition produces a 0.5-2 second `pipeline.render()` call.
- Main-thread transition frames remain below 50 ms, with a target P99 below 16.67 ms.
- No several-hundred-millisecond `GPUTask` sequence aligns with a normal chunk commit.
- Keyboard presentation delay no longer rises by hundreds of milliseconds during chunk movement.
- Fixed slot buffers remain at or below 65 MiB and total additional GPU memory remains near or below 80 MiB.
- Slot, material, listener, and render-object counts remain bounded after extended traversal and returning to previously visited terrain.
