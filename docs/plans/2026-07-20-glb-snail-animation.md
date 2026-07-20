# GLB Snail Animation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace procedural voxel snails with a Blender-exported `snail.glb` (skeleton + `crawl` / `retract` / `emerge`) played via `AnimationMixer`, restoring snails with lower per-frame cost.

**Architecture:** Build one voxel-style snail in Blender (MCP), export GLB to `public/models/snail.glb`. Runtime loads it via `sources.js`, `SnailManager` clones with `SkeletonUtils.clone`, each `GlbSnail` owns FSM + mixer. Delete `voxel-snail.js`. Keep spawn/math/click arbitration.

**Tech Stack:** Blender + glTF export, Three.js `AnimationMixer` / `SkeletonUtils`, existing Experience / Resources / mitt input path.

**Design:** @docs/plans/2026-07-20-glb-snail-animation-design.md

**Project skills:** @.cursor/skills/vtj-resource-management/SKILL.md, @.cursor/skills/vtj-component-model/SKILL.md, @.cursor/skills/vtj-anti-patterns/SKILL.md

---

### Task 1: Blender — clear scene and build voxel snail mesh + armature

**Files:**
- Create (later export): `public/models/snail.glb`
- Tooling: Blender MCP (`execute_blender_code`, `get_scene_info`, `get_viewport_screenshot`)

**Step 1: Clear unrelated scene objects**

Via Blender MCP, remove or hide `SimplePlayer.*` and 棱角球 so the scene only has the snail work.

**Step 2: Build voxel body from unit cubes (1:1 `voxel-snail.js`)**

Copy `_buildFromReference` / `_createTentacle` exactly (do not approximate counts):

- 12 body segments along +X (`x = 0..11`); width `1` if `i<2||i>9` else `2`; mid segments `i∈(1,11)` get y=1 row; tail cube on segment 0 at `(-1,0,0)`
- Head at `(12, 0.4, 0)` + exact `headCells` (14 voxels); mat `i%3===0 ? bodyDark : body`
- Tentacles at head local `(1.15, 2.15, ±0.72)` with cubes y=0..3 (eye on tip)
- Shell at `(5.7, 2.25, 0)`; nested loops `sx∈[-3,3] sy∈[-1,5] sz∈[-2,2]` with `d<=1.05`
- Materials = code base colors; Blender place with `(x,-z,y)` so glTF matches Three.js Y-up
- Join per-part meshes; armature bones: `root`, `body_00..11`, `head`, `tentacle_L/R`, `shell`

**Step 3: Create armature and parent**

Bones: `root`, `body_00`…`body_11`, `head`, `tentacle_L`, `tentacle_R`, `shell`.  
Parent meshes with automatic weights or bone parenting for rigid voxel parts (rigid bone parent is fine for cubes).

**Step 4: Verify rest pose**

- Local +X = head forward
- Lowest vertex y ≈ 0
- Approximate unscaled length ≈ 14 local units

**Step 5: Viewport screenshot check**

Call `get_viewport_screenshot`; confirm silhouette reads as the old snail.

---

### Task 2: Blender — NLA actions `crawl`, `retract`, `emerge`

**Files:**
- Same Blender scene → eventual `public/models/snail.glb`

**Step 1: Action `crawl` (loop ~1.2–2.0s)**

Keyframe body segment phase offset (sin-like push/lift), slight head bob, tentacle sway, shell wobble — inspired by `_updateReferenceVisuals` with `retractProgress = 0`.

**Step 2: Action `retract` (~0.7s, once)**

End pose: tentacles collapsed, head packed toward shell, body segments packed under shell (match old retract end). First frame = crawl rest / mid-crawl neutral.

**Step 3: Action `emerge` (~0.7s, once)**

Start = retract end pose; end = crawl-ready rest.

**Step 4: Push to NLA / name clips exactly**

Clip names **must** be: `crawl`, `retract`, `emerge` (case-sensitive for runtime lookup).

**Step 5: Export GLB**

```text
File → Export → glTF 2.0 (.glb)
- Format: glTF Binary
- Include: Selected / Visible only (snail + armature)
- Animation: bake, export all actions as separate clips
```

Save to: `public/models/snail.glb`

**Step 6: Commit asset**

```bash
git add public/models/snail.glb
git commit -m "assets(landmarks): add animated voxel snail glb"
```

---

### Task 3: Register resource + config

**Files:**
- Modify: `src/js/sources.js`
- Modify: `src/js/config/dry-toilet-snails-config.js`

**Step 1: Add source entry**

In `sources.js` (near `cesuoModel`):

```js
{
  name: 'snailModel',
  type: 'gltfModel',
  path: 'models/snail.glb',
},
```

**Step 2: Update config**

```js
export const DRY_TOILET_SNAILS_CONFIG = {
  snailsEnabled: false, // enable in final task after wiring works
  snailResourceName: 'snailModel',
  resourceName: 'cesuoModel',
  // ...existing fields...
  snailRefLocalLength: 14, // keep for scale = length / ref
}
```

Remove any comments that imply runtime procedural mesh is still primary.

**Step 3: Commit**

```bash
git add src/js/sources.js src/js/config/dry-toilet-snails-config.js
git commit -m "feat(landmarks): register snail glb resource and config"
```

---

### Task 4: Implement `GlbSnail` + animation controller

**Files:**
- Create: `src/js/world/landmarks/glb-snail.js`
- Reference: `src/js/world/enemies/zombie-animation.js` (mixer pattern)
- Reference: `src/js/world/landmarks/voxel-snail.js` (movement / ground / FSM only — do not port mesh build)

**Step 1: Skeleton of class**

```js
import * as THREE from 'three'
import { SkeletonUtils } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { DRY_TOILET_SNAILS_CONFIG as CFG } from '../../config/dry-toilet-snails-config.js'
import Experience from '../../experience.js'
import {
  createSnailFsm,
  isInsideActivityMargin,
  SNAIL_STATES,
  snailFsmOnClick,
  snailFsmUpdate,
} from './dry-toilet-math.js'

export default class GlbSnail {
  constructor({
    template,
    animations,
    length,
    x,
    z,
    yaw,
    terrainProvider,
    activityCenter,
    footprint,
  }) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.terrainProvider = terrainProvider
    this.activityCenter = activityCenter
    this.footprint = footprint
    this.length = length
    this.fsm = createSnailFsm(CFG)
    this._prevFsmState = this.fsm.state

    this.group = new THREE.Group()
    this.group.name = 'GlbSnail'
    this.group.position.set(x, 0, z)
    this.group.rotation.y = yaw

    this.model = SkeletonUtils.clone(template)
    const scale = length / CFG.snailRefLocalLength
    this.model.scale.setScalar(scale)
    this.group.add(this.model)

    this._clickMeshes = []
    this.model.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true
        obj.receiveShadow = true
        obj.userData.snailRef = this
        this._clickMeshes.push(obj)
        // optional: nearest filter on maps
      }
    })

    this._initAnimation(animations)
    this._turnTimerSec = 0
    this._snapToGround()
    this.scene.add(this.group)
  }

  // ... port movement helpers from VoxelSnail without _updateReferenceVisuals
}
```

**Step 2: Animation init + state sync**

```js
_initAnimation(animations) {
  this.mixer = new THREE.AnimationMixer(this.model)
  this.actions = {}
  const map = {
    crawl: 'crawl',
    retract: 'retract',
    emerge: 'emerge',
  }
  for (const clip of animations || []) {
    const key = clip.name.toLowerCase()
    if (!Object.values(map).includes(key))
      continue
    const action = this.mixer.clipAction(clip)
    if (key === 'crawl') {
      action.setLoop(THREE.LoopRepeat)
    }
    else {
      action.setLoop(THREE.LoopOnce)
      action.clampWhenFinished = true
    }
    this.actions[key] = action
  }
  for (const name of Object.values(map)) {
    if (!this.actions[name])
      console.warn(`[GlbSnail] missing clip: ${name}`)
  }
  // Align clip duration to CFG ms when both exist
  if (this.actions.retract && this.actions.retract.getClip().duration > 0)
    this.actions.retract.timeScale = this.actions.retract.getClip().duration / (CFG.retractMs / 1000)
  if (this.actions.emerge && this.actions.emerge.getClip().duration > 0)
    this.actions.emerge.timeScale = this.actions.emerge.getClip().duration / (CFG.emergeMs / 1000)

  this.currentAction = this.actions.crawl
  this.currentAction?.reset().fadeIn(0.1).play()
}

_syncAnimationToFsm() {
  if (this.fsm.state === this._prevFsmState)
    return
  this._prevFsmState = this.fsm.state
  let next = null
  if (this.fsm.state === SNAIL_STATES.CRAWLING)
    next = this.actions.crawl
  else if (this.fsm.state === SNAIL_STATES.RETRACTING)
    next = this.actions.retract
  else if (this.fsm.state === SNAIL_STATES.EMERGING)
    next = this.actions.emerge
  // RETRACTED: keep clamped retract
  if (!next || next === this.currentAction)
    return
  next.reset().fadeIn(0.12).play()
  this.currentAction?.fadeOut(0.12)
  this.currentAction = next
}
```

**Step 3: `update` / click API / destroy**

Port from `VoxelSnail`:

- `startRetract`, `isCrawling`, `getClickMeshes`, `getPosition`
- Movement: crawl speed, turn noise, footprint / activity margin, `_snapToGround`
- `update(dtSec)`: `snailFsmUpdate` → `_syncAnimationToFsm` → `mixer.update(dtSec)` → movement if crawling
- `destroy`: stop mixer actions, remove group, clear `userData.snailRef`; do **not** dispose template geometries

**Step 4: Commit**

```bash
git add src/js/world/landmarks/glb-snail.js
git commit -m "feat(landmarks): add GlbSnail with AnimationMixer clips"
```

---

### Task 5: Wire `SnailManager`, delete `voxel-snail.js`, enable snails

**Files:**
- Modify: `src/js/world/landmarks/snail-manager.js`
- Modify: `src/js/config/dry-toilet-snails-config.js` (`snailsEnabled: true`)
- Modify: `src/js/world/world.js` (keep gated init; no other changes required if already using `snailsEnabled`)
- Delete: `src/js/world/landmarks/voxel-snail.js`

**Step 1: Update SnailManager spawn**

```js
import GlbSnail from './glb-snail.js'

_spawn() {
  if (this.spawned || !this.landmark?.isReady())
    return
  const center = this.landmark.getActivityCenter()
  if (!center)
    return

  const gltf = this.experience.resources.items[CFG.snailResourceName]
  if (!gltf?.scene) {
    console.warn('[SnailManager] snailModel not loaded')
    return
  }

  const seed = this.experience.terrainDataManager?.seed ?? 0
  const rng = new RNG(seed + CFG.rngSalt)
  const count = resolveSnailCount(rng, CFG)
  const points = generateSnailSpawnPoints(rng, {
    count,
    footprint: CFG.footprint,
    marginMax: CFG.activityMarginMax,
    lengthMin: CFG.snailLengthMin,
    lengthMax: CFG.snailLengthMax,
  })

  this.template = gltf.scene
  this.animations = gltf.animations || []
  this.snails = points.map(point => new GlbSnail({
    template: this.template,
    animations: this.animations,
    length: point.length,
    x: point.x,
    z: point.z,
    yaw: point.yaw,
    terrainProvider: this.experience.terrainDataManager,
    activityCenter: center,
    footprint: CFG.footprint,
  }))
  this.spawned = true
}

reset() {
  for (const snail of this.snails)
    snail.destroy()
  this.snails = []
  this.template = null
  this.animations = null
  this.spawned = false
}
```

Remove `createSharedSnailAssets` / `shared.dispose()`.

**Step 2: Delete `voxel-snail.js` and fix any remaining imports**

```bash
# ensure no imports remain
rg "voxel-snail" src tests
```

**Step 3: Set `snailsEnabled: true`**

**Step 4: Run unit tests**

```bash
node --test tests/unit/dry-toilet-math.unit.js tests/unit/snail-click-arbitration.unit.js
```

Expected: PASS

**Step 5: Manual playtest checklist**

- [ ] 3–5 snails around toilet, crawl loop visible
- [ ] Click retract → hold → emerge → crawl
- [ ] Mining not started on snail hit; works on miss
- [ ] World reset respawns snails
- [ ] FPS improved vs procedural (subjective / stats panel)

**Step 6: Commit**

```bash
git add src/js/world/landmarks/snail-manager.js src/js/config/dry-toilet-snails-config.js src/js/world/landmarks/voxel-snail.js
git commit -m "feat(landmarks): replace procedural snails with glb instances"
```

---

### Task 6: Polish export mismatches (only if playtest fails)

**Files:**
- Possibly re-export `public/models/snail.glb`
- Possibly tweak `glb-snail.js` scale / Y offset / clip name aliases

**Step 1: If clips missing** — fix Blender action names and re-export  
**Step 2: If floating/sinking** — adjust `model.position.y` after scale  
**Step 3: If facing wrong** — rotate model root +90°/Y before add  
**Step 4: Commit fix**

```bash
git commit -m "fix(landmarks): correct snail glb orientation or clip binding"
```

---

## Done when

All §4 acceptance criteria in the design doc are met, `voxel-snail.js` is gone, and unit tests pass.
