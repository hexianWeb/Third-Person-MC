# Held Item Attachment MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a debug-only runtime socket under `Arm:Right:Lower` with a procedural placeholder handle so we can validate bone attachment, local grip offsets, and existing animation compatibility.

**Architecture:** New `HeldItemAttachment` owns `bone → HeldItemSocket → PlaceholderHandle`. Debug UI mutates socket pose/visibility only. `Player` constructs, attaches after `setModel()`, wires Tweakpane under the Player folder, and destroys on teardown. No Pinia, mitt, GLB edits, or real tool assets.

**Tech Stack:** JavaScript ES modules, Three.js, Tweakpane (via Experience debug UI), Node.js built-in test runner (`node --test`), pnpm.

**Spec:** @docs/superpowers/specs/2026-07-19-held-item-attachment-mvp-design.md

**Status:** Approved with minor implementation corrections (2026-07-19)

## Global Constraints

- Parent under runtime bone name `ArmRightLower` only (GLTFLoader `sanitizeNodeName` strips `:` from asset name `Arm:Right:Lower`). Do not edit `player.glb`.
- Hierarchy must be `bone → HeldItemSocket (Object3D) → PlaceholderHandle (Mesh)`. Never parent the mesh directly on the bone.
- Debug tunes **socket** transform; mesh stays at local identity (geometry may bake grip offset via `translate`).
- Tool local axes: length `+Y`, front `+Z`, right `+X`, origin = grip point.
- Placeholder: `BoxGeometry(0.06, 0.7, 0.06)` then `geometry.translate(0, 0.25, 0)`.
- Material: `MeshStandardMaterial({ color: 0xff5533, roughness: 0.65, metalness: 0 })`.
- `socket.rotation.order = 'XYZ'`; rotation debug bindings use **radians**.
- Uniform scale only via `socket.scale.setScalar(params.scale)` with `min: 0.01` (never 0 or negative).
- Default `params.enabled = false` / `socket.visible = false`.
- `attach(model)` no-op only when the attachment is **live** on that model (full hierarchy check below). Detached/stale socket on the same model must repair. Different model → detach (keep GPU resources) then re-parent.
- Live attachment means all of:
  - `this.model === model`
  - `model.getObjectByName(BONE_NAME) === this.bone`
  - `this.socket?.parent === this.bone`
  - `this.mesh?.parent === this.socket`
- Missing bone: set `attachFailed`, log once per model attach cycle **and always include available bone names**; do not throw. Do not inject `debug.active`. When `attach()` switches to a different model, clear `_loggedMissingBoneForModel` so returning to a previously failed model logs again; repeated attach on the same failed model stays silent.
- No hotbar / Pinia / mitt / tool GLB / `sources.js` changes / new animations / `toolRoot`.
- Preserve unrelated working-tree changes. Use pnpm. Match repo style: pure JS, ES modules, 2 spaces, single quotes, no semicolons, explicit `.js` imports, Chinese comments for non-obvious logic.
- Relevant skills: @.cursor/skills/vtj-anti-patterns/SKILL.md, @.cursor/skills/vtj-component-model/SKILL.md, @.cursor/skills/vtj-debug-panel/SKILL.md

---

## File Structure

### New production files

- `src/js/world/player/held-item-attachment.js` — `HeldItemAttachment` class (attach / setEnabled / debugInit / destroy).

### Modified production files

- `src/js/world/player/player.js` — construct + `attach` after model ready; `debugInit` subfolder; `destroy` cleanup.

### New tests

- `tests/unit/held-item-attachment.unit.js` — hierarchy, enable, live no-op, detached repair, cross-model re-parent, pose apply + scale clamp, missing bone log cycle, destroy dispose. Use `t.after(() => held.destroy())` on tests that create an attachment.

---

### Task 1: HeldItemAttachment core + unit tests

**Files:**

- Create: `src/js/world/player/held-item-attachment.js`
- Create: `tests/unit/held-item-attachment.unit.js`

**Interfaces:**

- Produces: `export default class HeldItemAttachment`
- Produces: constants usable by tests / callers:
  - `BONE_NAME = 'Arm:Right:Lower'`
  - `SOCKET_NAME = 'HeldItemSocket'`
  - `MESH_NAME = 'PlaceholderHandle'`
- Produces methods:
  - `constructor()`
  - `attach(model: THREE.Object3D): void`
  - `setEnabled(enabled: boolean): void`
  - `debugInit(parentFolder): void` (stub ok until Task 3; may be empty body that still guards `if (this.debugFolder) return`)
  - `destroy(): void`
- Produces state: `model`, `bone`, `socket`, `mesh`, `params`, `debugFolder`, `attachFailed`
- Produces `params` shape:

```js
{
  enabled: false,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 }, // radians, applied to socket.rotation XYZ
  scale: 1,
}
```

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/held-item-attachment.unit.js`:

```javascript
import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'

import HeldItemAttachment, {
  BONE_NAME,
  MESH_NAME,
  SOCKET_NAME,
} from '../../src/js/world/player/held-item-attachment.js'

function makeArmModel() {
  const model = new THREE.Group()
  model.name = 'playerRoot'
  const bone = new THREE.Bone()
  bone.name = BONE_NAME
  model.add(bone)
  return { model, bone }
}

test('attach parents HeldItemSocket under Arm:Right:Lower with PlaceholderHandle child', (t) => {
  const { model, bone } = makeArmModel()
  const held = new HeldItemAttachment()
  t.after(() => held.destroy())
  held.attach(model)

  assert.equal(held.bone, bone)
  assert.ok(held.socket)
  assert.equal(held.socket.name, SOCKET_NAME)
  assert.equal(held.socket.parent, bone)
  assert.ok(held.mesh)
  assert.equal(held.mesh.name, MESH_NAME)
  assert.equal(held.mesh.parent, held.socket)
  assert.equal(held.socket.visible, false)
  assert.equal(held.params.enabled, false)
  assert.equal(held.socket.rotation.order, 'XYZ')
})

test('setEnabled syncs params.enabled and socket.visible', (t) => {
  const { model } = makeArmModel()
  const held = new HeldItemAttachment()
  t.after(() => held.destroy())
  held.attach(model)
  held.setEnabled(true)
  assert.equal(held.params.enabled, true)
  assert.equal(held.socket.visible, true)
  held.setEnabled(false)
  assert.equal(held.params.enabled, false)
  assert.equal(held.socket.visible, false)
})

test('attach same live model is a no-op (single socket)', (t) => {
  const { model, bone } = makeArmModel()
  const held = new HeldItemAttachment()
  t.after(() => held.destroy())
  held.attach(model)
  const socketRef = held.socket
  held.attach(model)
  assert.equal(held.socket, socketRef)
  assert.equal(bone.children.filter((c) => c.name === SOCKET_NAME).length, 1)
})

test('attach repairs a detached socket on the same model', (t) => {
  const { model, bone } = makeArmModel()
  const held = new HeldItemAttachment()
  t.after(() => held.destroy())

  held.attach(model)
  held.socket.removeFromParent()
  held.attach(model)

  assert.equal(held.socket.parent, bone)
  assert.equal(held.mesh.parent, held.socket)
})

test('attach different model re-parents socket without duplicating', (t) => {
  const first = makeArmModel()
  const second = makeArmModel()
  const held = new HeldItemAttachment()
  t.after(() => held.destroy())
  held.attach(first.model)
  const socketRef = held.socket
  const meshRef = held.mesh
  held.attach(second.model)

  assert.equal(held.socket, socketRef)
  assert.equal(held.mesh, meshRef)
  assert.equal(held.socket.parent, second.bone)
  assert.equal(first.bone.children.filter((c) => c.name === SOCKET_NAME).length, 0)
  assert.equal(second.bone.children.filter((c) => c.name === SOCKET_NAME).length, 1)
})

test('attach applies pose params to socket while mesh stays local identity', (t) => {
  const { model } = makeArmModel()
  const held = new HeldItemAttachment()
  t.after(() => held.destroy())

  held.params.position = { x: 0.1, y: 0.2, z: -0.3 }
  held.params.rotation = { x: 0.4, y: -0.5, z: 0.6 }
  held.params.scale = 1.5

  held.attach(model)

  assert.deepEqual(held.socket.position.toArray(), [0.1, 0.2, -0.3])
  assert.equal(held.socket.rotation.x, 0.4)
  assert.equal(held.socket.rotation.y, -0.5)
  assert.equal(held.socket.rotation.z, 0.6)
  assert.deepEqual(held.socket.scale.toArray(), [1.5, 1.5, 1.5])

  assert.deepEqual(held.mesh.position.toArray(), [0, 0, 0])
  assert.deepEqual(held.mesh.rotation.toArray().slice(0, 3), [0, 0, 0])
  assert.deepEqual(held.mesh.scale.toArray(), [1, 1, 1])
})

test('socket scale is clamped to a positive minimum', (t) => {
  const { model } = makeArmModel()
  const held = new HeldItemAttachment()
  t.after(() => held.destroy())

  held.params.scale = 0
  held.attach(model)

  assert.equal(held.params.scale, 0.01)
  assert.deepEqual(held.socket.scale.toArray(), [0.01, 0.01, 0.01])
})

test('missing bone skips attach, logs once per model cycle, includes bone names', (t) => {
  const broken = new THREE.Group()
  const otherBone = new THREE.Bone()
  otherBone.name = 'SomeOtherBone'
  broken.add(otherBone)

  const valid = makeArmModel()
  const held = new HeldItemAttachment()
  t.after(() => held.destroy())

  const errors = []
  const original = console.error
  console.error = (...args) => {
    errors.push(args.join(' '))
  }
  try {
    held.attach(broken)
    held.attach(broken) // same failed model — no second log
    held.attach(valid.model) // success clears cycle
    held.attach(broken) // returning to failed model — log again
  }
  finally {
    console.error = original
  }

  assert.equal(errors.length, 2)
  assert.match(errors[0], /Arm:Right:Lower/)
  assert.match(errors[0], /SomeOtherBone/)
  assert.match(errors[1], /Arm:Right:Lower/)
})

test('destroy removes nodes and disposes geometry/material; second destroy is safe', () => {
  const { model } = makeArmModel()
  const held = new HeldItemAttachment()
  held.attach(model)
  const { geometry } = held.mesh
  const { material } = held.mesh
  let geoDisposed = 0
  let matDisposed = 0
  const geoDispose = geometry.dispose.bind(geometry)
  const matDispose = material.dispose.bind(material)
  geometry.dispose = () => {
    geoDisposed++
    geoDispose()
  }
  material.dispose = () => {
    matDisposed++
    matDispose()
  }

  held.destroy()
  assert.equal(held.socket, null)
  assert.equal(held.mesh, null)
  assert.equal(held.bone, null)
  assert.equal(held.model, null)
  assert.equal(geoDisposed, 1)
  assert.equal(matDisposed, 1)

  assert.doesNotThrow(() => held.destroy())
})

test('placeholder uses grip-offset box and standard material flags', (t) => {
  const { model } = makeArmModel()
  const held = new HeldItemAttachment()
  t.after(() => held.destroy())
  held.attach(model)
  assert.ok(held.mesh.geometry)
  // BoxGeometry(0.06, 0.7, 0.06) centered then translate(0, 0.25, 0)
  // → Y bounds roughly [-0.1, 0.6]
  held.mesh.geometry.computeBoundingBox()
  const { min, max } = held.mesh.geometry.boundingBox
  assert.ok(min.y < 0)
  assert.ok(max.y > 0.5)
  assert.equal(held.mesh.material.color.getHex(), 0xff5533)
  assert.equal(held.mesh.material.roughness, 0.65)
  assert.equal(held.mesh.material.metalness, 0)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test tests/unit/held-item-attachment.unit.js
```

Expected: FAIL (module / class not found).

- [ ] **Step 3: Implement `HeldItemAttachment`**

Create `src/js/world/player/held-item-attachment.js`:

```javascript
import * as THREE from 'three'

export const BONE_NAME = 'Arm:Right:Lower'
export const SOCKET_NAME = 'HeldItemSocket'
export const MESH_NAME = 'PlaceholderHandle'

/**
 * 运行时手持物挂载：bone → socket → placeholder
 * Debug 只调 socket 位姿；默认隐藏，用于验证握持点与动画兼容性
 */
export default class HeldItemAttachment {
  constructor() {
    this.model = null
    this.bone = null
    this.socket = null
    this.mesh = null
    this.debugFolder = null
    this.attachFailed = false
    this._loggedMissingBoneForModel = null

    this.params = {
      enabled: false,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: 1,
    }
  }

  /**
   * @param {THREE.Object3D | null | undefined} model
   */
  attach(model) {
    if (model == null)
      return

    const modelChanged = this.model !== model
    if (modelChanged)
      this._loggedMissingBoneForModel = null

    const isLiveAttachment =
      this.model === model
      && model.getObjectByName(BONE_NAME) === this.bone
      && this.socket?.parent === this.bone
      && this.mesh?.parent === this.socket

    if (isLiveAttachment)
      return

    this._detachCurrentAttachment({ disposeResources: false })
    this.attachFailed = false
    this.model = model

    const bone = model.getObjectByName(BONE_NAME)
    if (!bone) {
      this.attachFailed = true
      this._logMissingBone(model)
      return
    }

    this.bone = bone
    if (!this.socket)
      this.socket = this._createSocket()
    if (!this.mesh)
      this.mesh = this._createPlaceholderMesh()

    if (this.mesh.parent !== this.socket)
      this.socket.add(this.mesh)
    if (this.socket.parent !== this.bone)
      this.bone.add(this.socket)

    this._applyParamsToSocket()
    this.socket.visible = this.params.enabled
  }

  /**
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.params.enabled = Boolean(enabled)
    if (this.socket)
      this.socket.visible = this.params.enabled
  }

  /**
   * @param {import('tweakpane').FolderApi | { addFolder: Function }} parentFolder
   */
  debugInit(parentFolder) {
    if (this.debugFolder || !parentFolder)
      return
    // Task 3 fills bindings; keep guard only in Task 1 if preferred,
    // but implement full panel here to avoid a second pass on this file:
    this.debugFolder = parentFolder.addFolder({
      title: 'Held Item',
      expanded: false,
    })

    this.debugFolder.addBinding(this.params, 'enabled', {
      label: '显示手持物',
    }).on('change', () => {
      this.setEnabled(this.params.enabled)
    })

    this.debugFolder.addBinding(this.params.position, 'x', {
      label: '位置 X',
      step: 0.01,
    }).on('change', () => this._applyParamsToSocket())
    this.debugFolder.addBinding(this.params.position, 'y', {
      label: '位置 Y',
      step: 0.01,
    }).on('change', () => this._applyParamsToSocket())
    this.debugFolder.addBinding(this.params.position, 'z', {
      label: '位置 Z',
      step: 0.01,
    }).on('change', () => this._applyParamsToSocket())

    this.debugFolder.addBinding(this.params.rotation, 'x', {
      label: '旋转 X (rad)',
      step: 0.01,
    }).on('change', () => this._applyParamsToSocket())
    this.debugFolder.addBinding(this.params.rotation, 'y', {
      label: '旋转 Y (rad)',
      step: 0.01,
    }).on('change', () => this._applyParamsToSocket())
    this.debugFolder.addBinding(this.params.rotation, 'z', {
      label: '旋转 Z (rad)',
      step: 0.01,
    }).on('change', () => this._applyParamsToSocket())

    this.debugFolder.addBinding(this.params, 'scale', {
      label: '缩放',
      min: 0.01,
      max: 5,
      step: 0.01,
    }).on('change', () => this._applyParamsToSocket())
  }

  destroy() {
    this.debugFolder?.dispose?.()
    this.debugFolder = null
    this._detachCurrentAttachment({ disposeResources: true })
    this.model = null
    this.attachFailed = false
    this._loggedMissingBoneForModel = null
  }

  _createSocket() {
    const socket = new THREE.Object3D()
    socket.name = SOCKET_NAME
    socket.rotation.order = 'XYZ'
    return socket
  }

  _createPlaceholderMesh() {
    const geometry = new THREE.BoxGeometry(0.06, 0.7, 0.06)
    // 将握持点靠近局部原点（默认 Box 原点在中心）
    geometry.translate(0, 0.25, 0)
    const material = new THREE.MeshStandardMaterial({
      color: 0xff5533,
      roughness: 0.65,
      metalness: 0,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = MESH_NAME
    return mesh
  }

  _applyParamsToSocket() {
    if (!this.socket)
      return
    const { position, rotation, scale } = this.params
    this.socket.position.set(position.x, position.y, position.z)
    this.socket.rotation.order = 'XYZ'
    this.socket.rotation.set(rotation.x, rotation.y, rotation.z)
    const safeScale = Math.max(0.01, Number(scale) || 0.01)
    this.params.scale = safeScale
    this.socket.scale.setScalar(safeScale)
  }

  /**
   * @param {{ disposeResources: boolean }} options
   */
  _detachCurrentAttachment({ disposeResources }) {
    if (this.mesh)
      this.mesh.removeFromParent()
    if (this.socket)
      this.socket.removeFromParent()

    this.bone = null

    if (!disposeResources)
      return

    if (this.mesh) {
      this.mesh.geometry?.dispose()
      const { material } = this.mesh
      if (Array.isArray(material))
        material.forEach((m) => m.dispose())
      else
        material?.dispose()
    }

    this.mesh = null
    this.socket = null
  }

  /**
   * @param {THREE.Object3D} model
   */
  _logMissingBone(model) {
    if (this._loggedMissingBoneForModel === model)
      return
    this._loggedMissingBoneForModel = model

    const boneNames = []
    model.traverse((child) => {
      if (child.isBone)
        boneNames.push(child.name)
    })
    const suffix = boneNames.length > 0
      ? ` Available bones: ${boneNames.join(', ')}`
      : ' No bones found on model.'
    console.error(
      `[HeldItemAttachment] Bone "${BONE_NAME}" was not found. Attachment skipped.${suffix}`,
    )
  }
}
```

Notes for implementer:

- Export named constants from the same module so tests import them.
- `debugInit` is included in Task 1 so the class is complete; Task 2 only wires Player.
- Live no-op **must** verify parent chain + bone identity; non-null refs alone are insufficient.
- On `modelChanged`, clear `_loggedMissingBoneForModel` before missing-bone handling so return visits re-log.
- Missing-bone errors always append available bone names (no `debug.active` injection).
- Unit tests that create an attachment should register `t.after(() => held.destroy())` (destroy test is exempt — it asserts destroy itself).

- [ ] **Step 4: Run unit tests to verify they pass**

Run:

```bash
node --test tests/unit/held-item-attachment.unit.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/js/world/player/held-item-attachment.js tests/unit/held-item-attachment.unit.js
git commit -m "$(cat <<'EOF'
feat(player): add HeldItemAttachment runtime socket MVP

EOF
)"
```

---

### Task 2: Wire HeldItemAttachment into Player

**Files:**

- Modify: `src/js/world/player/player.js`
- Test: `tests/unit/held-item-attachment.unit.js` (no new file; re-run to ensure untouched)

**Interfaces:**

- Consumes: `HeldItemAttachment` from `./held-item-attachment.js`
- Produces on `Player` instance:
  - `this.heldItemAttachment: HeldItemAttachment`
- Lifecycle:
  - After `setModel()` (and body-layer bind is fine either before or after attach; attach only needs the bone present on `this.model`):
    - `this.heldItemAttachment = new HeldItemAttachment()`
    - `this.heldItemAttachment.attach(this.model)`
  - In `debugInit()` when `this.debugFolder` exists:
    - `this.heldItemAttachment.debugInit(this.debugFolder)`
  - In `destroy()`:
    - `this.heldItemAttachment?.destroy()`
    - `this.heldItemAttachment = null`

- [ ] **Step 1: Add import**

Near other player-local imports in `player.js`, add:

```javascript
import HeldItemAttachment from './held-item-attachment.js'
```

- [ ] **Step 2: Construct and attach after model setup**

In `constructor()`, immediately after `this.setModel()` (and after `_bodyLayers` bind is acceptable), add:

```javascript
    // 手持物挂载（debug 占位），验证右前臂骨骼握持点
    this.heldItemAttachment = new HeldItemAttachment()
    this.heldItemAttachment.attach(this.model)
```

Suggested placement right after:

```javascript
    this.setModel()
    this._bodyLayers = bindCharacterBodyLayers(this.model)
```

so the model hierarchy is ready:

```javascript
    this.setModel()
    this._bodyLayers = bindCharacterBodyLayers(this.model)
    this.heldItemAttachment = new HeldItemAttachment()
    this.heldItemAttachment.attach(this.model)
```

- [ ] **Step 3: Wire debug panel**

At the **start** of `debugInit()` (after the method opens), call:

```javascript
    this.heldItemAttachment?.debugInit(this.debugFolder)
```

Do not create a second Player-level “Held Item” folder outside the component.

- [ ] **Step 4: Destroy cleanup**

In `destroy()`, before or after existing skin cleanup, add:

```javascript
    this.heldItemAttachment?.destroy()
    this.heldItemAttachment = null
```

- [ ] **Step 5: Re-run unit tests + lint the touched files**

Run:

```bash
node --test tests/unit/held-item-attachment.unit.js
pnpm exec eslint src/js/world/player/held-item-attachment.js src/js/world/player/player.js tests/unit/held-item-attachment.unit.js
```

Expected: tests PASS; eslint clean (or only pre-existing unrelated issues outside these files).

- [ ] **Step 6: Commit**

```bash
git add src/js/world/player/player.js
git commit -m "$(cat <<'EOF'
feat(player): wire HeldItemAttachment into Player lifecycle

EOF
)"
```

---

### Task 3: Manual verification checklist

**Files:**

- None (manual QA against running game)

**Interfaces:**

- Consumes: Task 1–2 runtime behavior in `pnpm dev` with debug UI active

- [ ] **Step 1: Start the game with debug**

Run:

```bash
pnpm dev
```

Enter play mode with Tweakpane / debug active (same path used for other Player debug folders).

- [ ] **Step 2: Verify hierarchy and defaults**

In browser console (optional):

```javascript
// After Experience/Player exists — adjust path if project exposes a different hook
const player = /* obtain Player instance from world */
const bone = player.model.getObjectByName('Arm:Right:Lower')
const socket = bone?.getObjectByName('HeldItemSocket')
console.log(!!socket, socket?.visible, socket?.children[0]?.name)
```

Expected: socket exists, `visible === false`, child name `PlaceholderHandle`.

- [ ] **Step 3: Tune and animate**

1. Open **Player → Held Item**, enable **显示手持物** → orange handle near right forearm/hand.
2. Walk / run / jump → follows right arm.
3. Punch / mine → follows arm swing.
4. Adjust position / rotation / scale until grip looks plausible; confirm scale cannot go below `0.01`.
5. Disable → hidden; re-enable still works.
6. Leave world / destroy player path if available → no leftover orange mesh in scene.

- [ ] **Step 4: Commit docs only if verification notes were added**

If no code changes from QA, skip commit. If you adjusted default `params.position/rotation` after tuning, commit that small default update:

```bash
git add src/js/world/player/held-item-attachment.js
git commit -m "$(cat <<'EOF'
chore(player): tune HeldItemAttachment default socket pose

EOF
)"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|------------------|------|
| Runtime socket under `Arm:Right:Lower` | Task 1 |
| Placeholder axes + geometry translate + standard material | Task 1 |
| Debug tunes socket; uniform scale `min: 0.01`; Euler XYZ radians | Task 1 |
| Pose params applied to socket; mesh local identity | Task 1 |
| Scale clamp to `0.01` | Task 1 |
| `setEnabled` syncs params + visibility | Task 1 |
| Live hierarchy no-op + detached socket repair | Task 1 |
| Idempotent / re-parent across models | Task 1 |
| Missing bone: one log per model cycle + bone list; re-log after model switch | Task 1 |
| `debugInit` once + folder dispose on destroy | Task 1–2 |
| `destroy` order / safe double destroy | Task 1–2 |
| Player construct / attach / debug / destroy wiring | Task 2 |
| Manual locomotion + punch/mine validation | Task 3 |
| Non-goals (no GLB/hotbar/Pinia/mitt/toolRoot) | All tasks omit |

## Self-Review Notes

- No TBD / placeholder steps.
- Named exports (`BONE_NAME`, etc.) match test imports and attachment contract in the spec.
- `debugInit` implemented in Task 1 so Task 2 is wiring-only; avoids splitting incomplete public API.
- Player `destroy()` currently is skin-focused; plan only adds held-item cleanup and does not expand unrelated teardown.
- Review corrections absorbed: live attachment check, always-on bone-name logs, model-cycle log reset, pose/scale tests, `t.after(destroy)` hygiene.
- Design spec updated in lockstep for attach / error-handling contracts.
