# Held Item Attachment MVP Design

## Context

The player character (`public/models/character/player.glb`) is a single skinned GLB with a 13-bone armature. The outermost right-arm bone is `Arm:Right:Lower`. There is no dedicated hand / wrist / weapon socket bone, and no runtime equip or hold system.

Combat and mining currently reuse fist animations. Hotbar / equipment UI slots are decorative and do not bind 3D meshes. Before wiring hotbar selection or real tool assets, we need a cheap way to validate that parenting an object to the right arm looks correct during locomotion and punch/mine clips.

## Goals

- Attach a simple placeholder mesh under `Arm:Right:Lower` via a runtime socket `Object3D`.
- Toggle visibility and tweak **socket** local pose (position / rotation / scale) from the existing Player Tweakpane debug folder.
- Keep the attachment following existing arm animations without new animation clips.
- Support idempotent re-attach when the player model is reloaded in development.
- Dispose cleanly when the player is destroyed.

## Non-goals

- Editing or re-exporting `player.glb` (no Blender `HandSocket` empty, no new Hand bone).
- Loading real tool / weapon GLBs or declaring them in `sources.js`.
- Binding hotbar selection, inventory, or Pinia equip state.
- Adding mitt events for equip / unequip.
- Adding hold / swing animation clips.
- Introducing a separate `toolRoot` node for per-tool orientation correction (reserved for a later iteration).
- Changing mining damage, combat hitboxes, or UI equipment slots.

## Selected Approach

**Bone parenting + runtime socket + debug-only placeholder (Approach A).**

`Arm:Right:Lower` is a forearm bone, not a true hand grip point. Parenting the mesh directly to that bone works for validation but couples grip pose to the mesh. Instead, insert a runtime socket:

```text
Arm:Right:Lower
└─ HeldItemSocket          (Object3D — grip pose, debug-tuned)
   └─ PlaceholderHandle    (Mesh — standard local axes, grip at origin)
```

Still Approach A: no GLB changes. Benefits:

- Placeholder keeps a standard local coordinate frame.
- Socket pose and future tool-internal pose can be managed separately.
- Detach / replace / destroy are cleaner.
- Later migration to a Blender `HandSocket` changes the bone lookup target, not the component API.

Steps:

1. After the player model is ready, resolve `Arm:Right:Lower` by name.
2. Create `HeldItemSocket` (`THREE.Object3D`), parent it to the bone.
3. Create a procedural handle mesh, parent it to the socket.
4. Debug UI mutates **socket** transform + visibility; mesh stays at identity under the socket (aside from baked geometry translate for grip origin).
5. Default `socket.visible = false` so normal play is unchanged until debug is used.

### Alternatives considered

| Approach | Why not for this MVP |
|----------|----------------------|
| Parent mesh directly on the bone | Works, but mixes grip pose with mesh; harder to swap tools later |
| Blender `HandSocket` empty on the arm bone | Better long-term alignment, but requires asset export |
| New skinned Hand bone | High cost; risks breaking existing punch/mine clips |
| Hotbar-driven real tool GLB | Needs item assets + equip state; premature before the attach point is proven |

## Architecture

### New component

`src/js/world/player/held-item-attachment.js`

Class `HeldItemAttachment` owns:

```js
this.model = null
this.bone = null
this.socket = null   // HeldItemSocket Object3D
this.mesh = null     // PlaceholderHandle Mesh
this.params = { enabled, position, rotation, scale }
this.debugFolder = null
this.attachFailed = false
```

Public methods:

- `attach(model)`
- `setEnabled(enabled)`
- `debugInit(parentFolder)`
- `destroy()`

Internal helpers (suggested):

- `_detachCurrentAttachment({ disposeResources })` — remove socket/mesh from graph; optionally dispose geometry/material
- `_createPlaceholderMesh()`
- `_listBoneNames(model)` — debug aid when bone is missing

### Integration

`Player`:

- Instantiates `HeldItemAttachment` once the model hierarchy is ready, then calls `attach(this.model)`.
- Calls `heldItemAttachment.debugInit(this.debugFolder)` inside `debugInit()` when debug is active.
- Calls `heldItemAttachment.destroy()` from `Player.destroy()`.

No Pinia / mitt wiring in this MVP.

### Attachment contract

Runtime bone name (post-GLTF `PropertyBinding.sanitizeNodeName`; asset was `Arm:Right:Lower`):

```text
ArmRightLower
```

Socket object name:

```text
HeldItemSocket
```

Placeholder mesh name:

```text
PlaceholderHandle
```

If the bone is missing: set `attachFailed`, log once per model attach cycle (always include available bone names from `model.traverse` / `child.isBone`), skip attachment, do not throw. Do not require `debug.active`. Switching away to another model clears the log gate so returning to the failed model logs again.

### Placeholder axis convention

Fixed tool local frame (document for future real tools too):

```text
Length axis:  +Y
Front face:   +Z
Right side:   +X
Origin:       grip point
```

Placeholder geometry:

```js
const geometry = new THREE.BoxGeometry(0.06, 0.7, 0.06)
geometry.translate(0, 0.25, 0) // shift so grip sits near local origin, not box center
```

Material (observe real lighting; distinct debug color):

```js
new THREE.MeshStandardMaterial({
  color: 0xff5533,
  roughness: 0.65,
  metalness: 0,
})
```

MVP omits `toolRoot`. Future real tools may insert:

```text
socket → toolRoot → mesh
```

where `toolRoot` absorbs per-asset orientation correction while socket stays the shared grip pose.

### Pose params

Debug tunes the **socket**, not the mesh:

| Param | Binding target | Notes |
|-------|----------------|-------|
| `enabled` | `params.enabled` + `socket.visible` | via `setEnabled()` |
| `position.x\|y\|z` | `socket.position` | local to bone |
| `rotation.x\|y\|z` | `socket.rotation` | **radians**, `socket.rotation.order = 'XYZ'` |
| `scale` | `socket.scale.setScalar(params.scale)` | uniform only; `min: 0.01` (never 0 or negative) |

Radians match existing Player debug controls (e.g. `facingAngle`). Degrees are not used in this MVP.

## Attach semantics (idempotent)

```js
attach(model) {
  if (model == null) return

  const modelChanged = this.model !== model
  if (modelChanged)
    this._loggedMissingBoneForModel = null

  const isLiveAttachment =
    this.model === model &&
    model.getObjectByName(BONE_NAME) === this.bone &&
    this.socket?.parent === this.bone &&
    this.mesh?.parent === this.socket

  if (isLiveAttachment) return

  // Stale/detached socket or different model → detach first (keep geometry if reusing)
  this._detachCurrentAttachment({ disposeResources: false })
  this.attachFailed = false
  this.model = model

  // resolve bone; on failure set attachFailed, log once per model attach cycle
  // (always include available bone names), return
  // ensure socket + mesh exist (create if needed)
  // bone.add(socket); socket.add(mesh)
  // apply params to socket; socket.visible = params.enabled
}
```

Rules:

- Same model with **live** hierarchy: return immediately.
- Same model with detached/stale socket: repair (re-parent); do not no-op on non-null refs alone.
- Different model: clear missing-bone log gate, remove from old bone, re-parent (reuse geometry/material when possible).
- `destroy()`: full dispose (see below).
- Internal re-attach: prefer remove-and-reparent over dispose-and-recreate of GPU resources.

## `setEnabled(enabled)`

```js
setEnabled(enabled) {
  this.params.enabled = Boolean(enabled)
  if (this.socket) this.socket.visible = this.params.enabled
}
```

Keeps Tweakpane-bound `params.enabled` and render state in sync when called from code.

## Debug UI

Under existing Player folder, add subfolder `Held Item` once:

```js
debugInit(parentFolder) {
  if (this.debugFolder) return
  // create folder + bindings
}
```

Bindings:

- `enabled` → `setEnabled` / or bind `params.enabled` with `on('change')` that sets `socket.visible`
- position / rotation (radians) / uniform scale (`min: 0.01`) writing to the socket

On destroy, dispose the folder if the project’s Tweakpane wrapper supports it (`this.debugFolder?.dispose()`), then null the reference.

Only created when Player debug is active.

## Error handling

- Missing bone: one `console.error` per model attach cycle; message includes expected bone name **and** available bone names. Component stays inert (`attachFailed = true`).
- Repeated `attach` with the same failed model: do not spam (gate on `_loggedMissingBoneForModel === model`).
- After attaching a different model, returning to the failed model logs again.
- `destroy()` when never attached: safe no-op.
- Multiple `destroy()` calls: safe.

## `destroy()` order

```js
destroy() {
  this.debugFolder?.dispose?.()
  this.debugFolder = null

  if (this.mesh) {
    this.mesh.removeFromParent()
    this.mesh.geometry?.dispose()
    const { material } = this.mesh
    if (Array.isArray(material)) material.forEach((m) => m.dispose())
    else material?.dispose()
  }

  this.socket?.removeFromParent()

  this.mesh = null
  this.socket = null
  this.bone = null
  this.model = null
  this.attachFailed = false
}
```

Prefer `removeFromParent()` over relying solely on a stored bone reference. Support array materials even though the MVP uses a single material.

## Data flow

```text
Player model ready
  → HeldItemAttachment.attach(model)
  → resolve Arm:Right:Lower
  → create/reuse HeldItemSocket + PlaceholderHandle
  → bone.add(socket); socket.add(mesh)
  → socket.visible = params.enabled (default false)

Arm animation updates bone matrix
  → socket + placeholder follow automatically

Debug (Player → Held Item)
  → enabled / position / rotation / scale
  → mutate socket (not mesh)

Player.destroy
  → HeldItemAttachment.destroy()
```

## Testing / verification

Manual checks (debug build):

1. Open Player → Held Item, enable → orange placeholder appears near the right hand / grip.
2. Walk / run / jump → attachment follows the right arm.
3. Trigger punch / mining animation → attachment follows the arm swing.
4. Adjust socket position / rotation / scale until the handle looks gripped; scale cannot go to 0.
5. Disable → hidden; `params.enabled` stays consistent with visibility.
6. (Dev) Re-attach / reload player model → no duplicate sockets; no attachment stuck on a disposed bone.
7. Leave world / destroy player → no leftover nodes; geometry/material disposed.

No automated E2E required for this debug-only MVP unless a later hotbar equip feature lands.

## Future follow-ups (out of scope)

- Insert `toolRoot` between socket and mesh for per-tool orientation.
- Replace placeholder with tool GLBs from `sources.js`.
- Drive `setEnabled` / mesh swap from hotbar selection (Pinia).
- Optional Blender `HandSocket` empty once a stable socket pose is known (swap bone/socket lookup target).
- Dedicated hold / swing clips if fist animations look wrong with tools.

## Approval

- Approach: A — runtime socket under `Arm:Right:Lower` (not mesh-directly-on-bone)
- Trigger: debug panel only (no hotkey / hotbar)
- Asset: procedural placeholder box with fixed +Y length / grip-at-origin convention
- Review refinements accepted: 2026-07-19 (runtime socket, uniform scale, Euler XYZ radians, idempotent attach, one-shot bone errors, destroy order)
- Plan corrections accepted: 2026-07-19 (live hierarchy check, always-on bone-name logs, model-cycle log reset, pose/scale tests)
- Status: **Approved with minor implementation corrections**
- User approved initial design: 2026-07-19
