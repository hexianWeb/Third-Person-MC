# Character Texture Skin System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace one-GLB-per-skin switching with one canonical `playerModel` plus runtime 64×64 PNG texture swaps, including custom upload persistence in IndexedDB.

**Architecture:** Preset skins become external textures declared in `sources.js`. `skinStore` owns IDs, Blobs, revisions, and persistence. A Three.js skin-texture utility binds both body-layer materials. Player and selector preview load the canonical GLB once and swap maps only. Custom PNGs persist under a fixed IndexedDB `custom` key.

**Tech Stack:** JavaScript ES modules, Vue 3, Pinia, Three.js WebGPU, mitt event bus, IndexedDB, Node.js built-in test runner, Vite, pnpm.

**Spec:** @docs/superpowers/specs/2026-07-18-character-texture-skin-system-design.md

## Global Constraints

- Use one canonical runtime model: `resources.items.playerModel` / preview path `models/character/player.glb`.
- Never remove/replace the Player model, movement group, or `PlayerAnimationController` on skin change.
- Bind body layers by fixed hierarchy only:

```text
model.children[0]                 // SimplePlayer.arma
model.children[0].children[0]     // SimplePlayer.Body.Layer1
model.children[0].children[1]     // SimplePlayer.Body.Layer2
```

- Validate those three names once at bind time; throw a contextual error on mismatch.
- Each layer is one Mesh with one material. Do not support material arrays.
- Skin swaps update `map` and existing night-visibility `emissiveMap` only. Preserve Layer2 transparency/blending/depth/renderOrder.
- Preset textures are Resources-owned and must never be disposed by skin switching.
- Custom Blob textures are consumer-owned and must be disposed exactly once after successful replacement or consumer destroy.
- Store holds Blobs/IDs/revisions only. No `THREE.Texture` in Pinia.
- Await `skinStore.initialize()` in `App.vue` before `new Experience(...)`.
- Keep existing preset cards, 3D preview, animation controls, Apply, and Cancel.
- Do not create/convert artwork. Assume user-supplied PNGs exist at the declared public paths before browser verification.
- Preserve unrelated working-tree changes. Use pnpm. Match repo style: pure JS, ES modules, 2 spaces, single quotes, no semicolons, explicit `.js` imports, Chinese comments for non-obvious logic.
- Relevant skills: @.cursor/skills/vtj-anti-patterns/SKILL.md, @.cursor/skills/vtj-component-model/SKILL.md, @.cursor/skills/vtj-resource-management/SKILL.md, @.cursor/skills/vtj-state-management/SKILL.md, @.cursor/skills/vtj-ui-integration/SKILL.md

---

## File Structure

### New production files

- `src/js/utils/storage/custom-skin-storage.js`: IndexedDB open/read/write/clear for the fixed `custom` PNG Blob record.
- `src/js/world/player/skin-texture-utils.js`: hierarchy binding, texture create/configure/apply/dispose, stale-revision helpers, ownership flags.

### Modified production files

- `src/js/config/skin-config.js`: canonical model constants; texture descriptors; fixed `custom` skin; keep animation buttons.
- `src/js/sources.js`: remove `steveModel`/`alexModel` preload; keep `playerModel` + `zombieModel`; add preset skin textures.
- `src/pinia/skinStore.js`: async initialize, pending/committed custom Blobs, revision, upload/apply/cancel transactions.
- `src/App.vue`: await skin store hydration before Experience.
- `src/js/world/player/player.js`: load `playerModel` once; texture-swap `skin:changed` handler with revision guard.
- `src/js/components/skin-preview-scene.js`: load canonical GLB once; texture-swap API; owned custom texture disposal.
- `src/vue/components/menu/SkinSelector.vue`: custom upload card, await apply, preview texture API, change predicate.
- `src/locales/en.json` / `src/locales/zh.json`: custom skin and validation/error keys.

### New tests

- `tests/unit/custom-skin-storage.unit.js`
- `tests/unit/skin-texture-utils.unit.js`
- `tests/unit/skin-store.unit.js`

### Asset contract (outside code, required for visual QA)

Place user-supplied files at:

- `public/models/character/player.glb` (canonical hierarchy)
- `public/textures/skins/steve.png`
- `public/textures/skins/alex.png`
- `public/textures/skins/player.png`
- `public/textures/skins/steve-thumb.png`
- `public/textures/skins/alex-thumb.png`
- `public/textures/skins/player-thumb.png`

Removing old Steve/Alex GLBs is optional and not required by this feature.

---

### Task 1: Migrate skin config and resource manifest

**Files:**

- Modify: `src/js/config/skin-config.js`
- Modify: `src/js/sources.js:30-50`
- Test: `tests/unit/skin-config.unit.js`

**Interfaces:**

- Produces: `CANONICAL_MODEL_RESOURCE = 'playerModel'`
- Produces: `CANONICAL_MODEL_PATH = 'models/character/player.glb'`
- Produces: `CUSTOM_SKIN_ID = 'custom'`
- Produces: `SKIN_LIST` preset entries with `textureResourceName` + `texturePath`, no `modelPath`
- Produces: `CUSTOM_SKIN` descriptor and `ALL_SKINS` / helper that includes `custom`
- Produces: unchanged `DEFAULT_SKIN_ID`, `ANIMATION_BUTTONS`
- Removes: `steveModel`, `alexModel` from `sources.js`
- Adds: `steveSkinTexture`, `alexSkinTexture`, `playerSkinTexture` texture sources

- [ ] **Step 1: Write the failing config test**

```javascript
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ALL_SKINS,
  CANONICAL_MODEL_PATH,
  CANONICAL_MODEL_RESOURCE,
  CUSTOM_SKIN_ID,
  DEFAULT_SKIN_ID,
  SKIN_LIST,
} from '../../src/js/config/skin-config.js'
import sources from '../../src/js/sources.js'

test('canonical model constants point at playerModel', () => {
  assert.equal(CANONICAL_MODEL_RESOURCE, 'playerModel')
  assert.equal(CANONICAL_MODEL_PATH, 'models/character/player.glb')
  assert.equal(CUSTOM_SKIN_ID, 'custom')
  assert.equal(DEFAULT_SKIN_ID, 'steve')
})

test('preset skins describe textures instead of models', () => {
  for (const skin of SKIN_LIST) {
    assert.equal(skin.modelPath, undefined)
    assert.ok(skin.textureResourceName)
    assert.ok(skin.texturePath.endsWith('.png'))
    assert.ok(skin.thumbnail)
  }
  assert.ok(ALL_SKINS.some(s => s.id === CUSTOM_SKIN_ID))
  assert.equal(ALL_SKINS.find(s => s.id === CUSTOM_SKIN_ID).textureResourceName, undefined)
})

test('sources preload playerModel and preset skin textures only', () => {
  const names = sources.map(s => s.name)
  assert.ok(names.includes('playerModel'))
  assert.ok(names.includes('zombieModel'))
  assert.equal(names.includes('steveModel'), false)
  assert.equal(names.includes('alexModel'), false)
  assert.ok(names.includes('steveSkinTexture'))
  assert.ok(names.includes('alexSkinTexture'))
  assert.ok(names.includes('playerSkinTexture'))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/skin-config.unit.js`

Expected: FAIL because exports/fields do not exist yet.

- [ ] **Step 3: Implement config + sources**

```javascript
// skin-config.js (shape)
export const CANONICAL_MODEL_RESOURCE = 'playerModel'
export const CANONICAL_MODEL_PATH = 'models/character/player.glb'
export const CUSTOM_SKIN_ID = 'custom'
export const DEFAULT_SKIN_ID = 'steve'

export const SKIN_LIST = [
  {
    id: 'steve',
    name: 'Steve',
    nameKey: 'skin.steve',
    textureResourceName: 'steveSkinTexture',
    texturePath: 'textures/skins/steve.png',
    thumbnail: 'textures/skins/steve-thumb.png',
  },
  {
    id: 'alex',
    name: 'Alex',
    nameKey: 'skin.alex',
    textureResourceName: 'alexSkinTexture',
    texturePath: 'textures/skins/alex.png',
    thumbnail: 'textures/skins/alex-thumb.png',
  },
  {
    id: 'player',
    name: 'Classic',
    nameKey: 'skin.player',
    textureResourceName: 'playerSkinTexture',
    texturePath: 'textures/skins/player.png',
    thumbnail: 'textures/skins/player-thumb.png',
  },
]

export const CUSTOM_SKIN = {
  id: CUSTOM_SKIN_ID,
  name: 'Custom',
  nameKey: 'skin.custom',
  thumbnail: null,
}

export const ALL_SKINS = [...SKIN_LIST, CUSTOM_SKIN]
```

In `sources.js`, delete the `steveModel` and `alexModel` entries. Keep `playerModel` and `zombieModel`. Add three `type: 'texture'` entries matching the resource names above.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/skin-config.unit.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/js/config/skin-config.js src/js/sources.js tests/unit/skin-config.unit.js
git commit -m "$(cat <<'EOF'
refactor(skin): switch preset skins to texture descriptors

EOF
)"
```

---

### Task 2: IndexedDB custom-skin storage adapter

**Files:**

- Create: `src/js/utils/storage/custom-skin-storage.js`
- Test: `tests/unit/custom-skin-storage.unit.js`

**Interfaces:**

```javascript
export const CUSTOM_SKIN_DB_NAME = 'mc-custom-skin'
export const CUSTOM_SKIN_STORE = 'skins'
export const CUSTOM_SKIN_KEY = 'custom'
export const CUSTOM_SKIN_SCHEMA_VERSION = 1

export function createCustomSkinStorage({ indexedDB = globalThis.indexedDB } = {})
// returns:
//   open()
//   getCustomSkin() -> Promise<{ blob: Blob, schemaVersion: number } | null>
//   setCustomSkin(blob) -> Promise<void>
//   clearCustomSkin() -> Promise<void>
```

No Vue/Pinia/Three imports.

- [ ] **Step 1: Write failing storage tests with a fake IndexedDB**

```javascript
import assert from 'node:assert/strict'
import test from 'node:test'

import { createCustomSkinStorage, CUSTOM_SKIN_KEY } from '../../src/js/utils/storage/custom-skin-storage.js'

function createMemoryIndexedDB() {
  const stores = new Map()
  // Minimal fake: implement open/transaction/objectStore get/put/delete
  // sufficient for the adapter API under test.
  // Keep the fake inside the test file.
}

test('reads null when no custom skin exists', async () => {
  const storage = createCustomSkinStorage({ indexedDB: createMemoryIndexedDB() })
  assert.equal(await storage.getCustomSkin(), null)
})

test('writes and reads the fixed custom record', async () => {
  const storage = createCustomSkinStorage({ indexedDB: createMemoryIndexedDB() })
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
  await storage.setCustomSkin(blob)
  const record = await storage.getCustomSkin()
  assert.equal(record.schemaVersion, 1)
  assert.equal(record.blob.type, 'image/png')
  assert.equal(await record.blob.arrayBuffer().then(b => new Uint8Array(b)[0]), 1)
})

test('clear removes the custom record', async () => {
  const storage = createCustomSkinStorage({ indexedDB: createMemoryIndexedDB() })
  await storage.setCustomSkin(new Blob(['x'], { type: 'image/png' }))
  await storage.clearCustomSkin()
  assert.equal(await storage.getCustomSkin(), null)
})
```

If Node lacks `Blob`, use `globalThis.Blob` polyfill from `buffer` only inside the test, not production code.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/custom-skin-storage.unit.js`

Expected: FAIL module not found.

- [ ] **Step 3: Implement the adapter**

Use a single object store. Upsert under key `'custom'`. Record shape:

```javascript
{ id: CUSTOM_SKIN_KEY, blob, schemaVersion: CUSTOM_SKIN_SCHEMA_VERSION }
```

Wrap IDBRequest in Promises. Surface open/read/write failures as rejected Errors with operation context in `message` (no image bytes).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/custom-skin-storage.unit.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/js/utils/storage/custom-skin-storage.js tests/unit/custom-skin-storage.unit.js
git commit -m "$(cat <<'EOF'
feat(skin): add IndexedDB adapter for custom skin blob

EOF
)"
```

---

### Task 3: Skin texture utility

**Files:**

- Create: `src/js/world/player/skin-texture-utils.js`
- Test: `tests/unit/skin-texture-utils.unit.js`

**Interfaces:**

```javascript
export const EXPECTED_LAYER_NAMES = {
  root: 'SimplePlayer.arma',
  layer1: 'SimplePlayer.Body.Layer1',
  layer2: 'SimplePlayer.Body.Layer2',
}

export function bindCharacterBodyLayers(model)
// returns { characterRoot, layer1, layer2, materials: [mat1, mat2] }
// throws Error naming expected vs actual on mismatch

export function configureSkinTexture(texture, { owned })
// sets colorSpace SRGBColorSpace, flipY false, NearestFilter, no mipmaps
// stamps texture.userData.skinOwned = owned

export function applySkinTextureToLayers(layers, texture)
// assigns map + emissiveMap when present; sets needsUpdate

export function disposeOwnedSkinTexture(texture)
// disposes only when texture?.userData?.skinOwned === true

export function createTextureFromBlob(blob, THREE, { createObjectURL, revokeObjectURL } = URL)
// returns Promise<{ texture, objectUrl }>
```

- [ ] **Step 1: Write failing utility tests with fake meshes/materials**

```javascript
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applySkinTextureToLayers,
  bindCharacterBodyLayers,
  configureSkinTexture,
  disposeOwnedSkinTexture,
} from '../../src/js/world/player/skin-texture-utils.js'

function makeModel(names = ['SimplePlayer.arma', 'SimplePlayer.Body.Layer1', 'SimplePlayer.Body.Layer2']) {
  const mat1 = { map: null, emissiveMap: null, needsUpdate: false }
  const mat2 = { map: null, emissiveMap: null, needsUpdate: false }
  return {
    children: [{
      name: names[0],
      children: [
        { name: names[1], isMesh: true, material: mat1 },
        { name: names[2], isMesh: true, material: mat2 },
        { name: 'MAIN' },
      ],
    }],
  }
}

test('bindCharacterBodyLayers validates fixed hierarchy names', () => {
  const layers = bindCharacterBodyLayers(makeModel())
  assert.equal(layers.layer1.name, 'SimplePlayer.Body.Layer1')
  assert.equal(layers.layer2.name, 'SimplePlayer.Body.Layer2')
})

test('bindCharacterBodyLayers throws contextual error on mismatch', () => {
  assert.throws(
    () => bindCharacterBodyLayers(makeModel(['Wrong', 'A', 'B'])),
    /SimplePlayer\.arma/,
  )
})

test('applySkinTextureToLayers updates map and emissiveMap on both materials', () => {
  const layers = bindCharacterBodyLayers(makeModel())
  const texture = { userData: {} }
  applySkinTextureToLayers(layers, texture)
  assert.equal(layers.materials[0].map, texture)
  assert.equal(layers.materials[1].map, texture)
  assert.equal(layers.materials[0].emissiveMap, texture)
  assert.equal(layers.materials[1].emissiveMap, texture)
  assert.equal(layers.materials[0].needsUpdate, true)
})

test('disposeOwnedSkinTexture disposes owned custom textures only once', () => {
  let disposed = 0
  const owned = { userData: { skinOwned: true }, dispose: () => { disposed++ } }
  const shared = { userData: { skinOwned: false }, dispose: () => { disposed++ } }
  disposeOwnedSkinTexture(shared)
  disposeOwnedSkinTexture(owned)
  disposeOwnedSkinTexture(owned) // second call must be a no-op after clearing flag or nulling
  assert.equal(disposed, 1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/skin-texture-utils.unit.js`

Expected: FAIL module not found.

- [ ] **Step 3: Implement utility**

Important details:

- Use `isMesh` / `material` checks; reject material arrays.
- `configureSkinTexture`:

```javascript
texture.colorSpace = THREE.SRGBColorSpace
texture.flipY = false
texture.magFilter = THREE.NearestFilter
texture.minFilter = THREE.NearestFilter
texture.generateMipmaps = false
texture.needsUpdate = true
texture.userData.skinOwned = Boolean(owned)
```

- `disposeOwnedSkinTexture` must set `userData.skinOwned = false` after dispose so a second call is harmless.
- `createTextureFromBlob` loads via Object URL + `TextureLoader` or `Image` + `Texture`, then revokes the URL after load success/failure.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/skin-texture-utils.unit.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/js/world/player/skin-texture-utils.js tests/unit/skin-texture-utils.unit.js
git commit -m "$(cat <<'EOF'
feat(skin): add texture bind/apply ownership helpers

EOF
)"
```

---

### Task 4: Rewrite skinStore with custom Blob transactions

**Files:**

- Modify: `src/pinia/skinStore.js`
- Test: `tests/unit/skin-store.unit.js`

**Interfaces / state:**

```javascript
currentSkinId
previewSkinId
committedCustomSkin   // Blob | null
pendingCustomSkin     // Blob | null
committedRevision     // number
previewRevision       // number
isLoading
errorKey              // i18n key | null
hasPendingCustomSkin  // getter/computed bool
hasPreviewChanges     // true if previewSkinId differs OR pending custom exists
```

Actions:

```javascript
async initialize({ storage, localStorage } = defaults)
setPreviewSkin(skinId)
async setPendingCustomSkin(file) // validate PNG 64x64, set pending + preview custom
async applySkin() // returns { ok: boolean, errorKey?: string }
cancelPreview()
getSkinConfig(skinId) // search ALL_SKINS
```

Events:

```javascript
emitter.emit('skin:changed', { skinId, revision: committedRevision })
```

Validation helper may live in the store file or `skin-texture-utils.js`; keep it injectable/pure for Node tests:

```javascript
export async function validateSkinPng(file, { createImageBitmap })
// rejects non-image/png, decode failures, and non-64x64 with error keys
```

- [ ] **Step 1: Write failing store tests**

Prefer testing a pure factory if Pinia setup is awkward in Node:

```javascript
import assert from 'node:assert/strict'
import test from 'node:test'

import { createSkinStoreLogic } from '../../src/pinia/skinStore.js'
```

If exporting a pure `createSkinStoreLogic` keeps Pinia thin, do that. Otherwise boot Pinia:

```javascript
import { createPinia, setActivePinia } from 'pinia'
import { useSkinStore } from '../../src/pinia/skinStore.js'

setActivePinia(createPinia())
```

Required cases from the spec:

1. initialize restores valid custom record and keeps `currentSkinId === 'custom'`
2. initialize with `custom` in localStorage but missing record falls back to `DEFAULT_SKIN_ID` and repairs localStorage
3. upload creates pending candidate without calling storage.setCustomSkin
4. cancel leaves committed Blob + currentSkinId unchanged
5. successful apply commits to storage before mutating current state
6. failed apply preserves current and previously committed custom skin
7. pending custom counts as change when both IDs are `custom`
8. storage open failure does not throw out of initialize; sets recoverable error and default preset

Use fake storage:

```javascript
function createFakeStorage(initial = null) {
  let record = initial
  return {
    getCustomSkin: async () => record,
    setCustomSkin: async (blob) => { record = { blob, schemaVersion: 1 } },
    clearCustomSkin: async () => { record = null },
  }
}
```

Fake localStorage with a plain object map.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/skin-store.unit.js`

Expected: FAIL missing APIs.

- [ ] **Step 3: Implement store**

Key transaction rules:

**initialize**

1. Read localStorage ID.
2. Open storage; on failure set `errorKey`, keep default preset, return.
3. Load custom record when present into `committedCustomSkin`.
4. If saved ID is `custom` and no valid blob, fallback to `DEFAULT_SKIN_ID`, rewrite localStorage.
5. If saved ID is a known preset, accept it.
6. Do not emit `skin:changed` during initialize.

**setPendingCustomSkin(file)**

1. Validate type/decode/size.
2. On invalid: set `errorKey`, leave previous preview untouched, return `{ ok: false }`.
3. On valid: store Blob in `pendingCustomSkin`, `previewSkinId = 'custom'`, bump `previewRevision`, clear error.

**applySkin**

- Preset path: set current ID, save localStorage, bump/use committedRevision, emit, clear pending, return `{ ok: true }`.
- Custom pending path:
  1. Write pending Blob to IndexedDB first.
  2. Only on success: promote pending → committed, set ID `custom`, save localStorage, bump `committedRevision`, emit, clear pending.
  3. On failure: keep previous committed/current, set error, return `{ ok: false }`.

**cancelPreview**

- Discard pending Blob.
- Restore `previewSkinId` to `currentSkinId`.
- Clear preview-only error/loading flags.
- No persistent writes. No `skin:changed`.

**hasPreviewChanges**

```javascript
previewSkinId !== currentSkinId || pendingCustomSkin != null
```

Remove the old synchronous `loadSkin()` side effect at store creation time; hydration happens only via `initialize()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/skin-store.unit.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pinia/skinStore.js tests/unit/skin-store.unit.js
git commit -m "$(cat <<'EOF'
feat(skin): hydrate and commit custom skins through pinia

EOF
)"
```

---

### Task 5: Await skin hydration before Experience

**Files:**

- Modify: `src/App.vue:1-20`

- [ ] **Step 1: Update App mount sequence**

```javascript
import { useSkinStore } from '@pinia/skinStore.js'
import Experience from '@three/experience.js'
// ...existing imports

const threeCanvas = ref(null)
let experience = null

onMounted(async () => {
  const skinStore = useSkinStore()
  await skinStore.initialize()
  experience = new Experience(threeCanvas.value)
})
```

Do not construct Experience before initialize settles. Storage failure inside initialize must already be handled by the store (no throw).

- [ ] **Step 2: Manual smoke check**

Run: `pnpm dev`

Expected: app still boots to loading/menu; console has no uncaught initialize rejection when IndexedDB is available.

- [ ] **Step 3: Commit**

```bash
git add src/App.vue
git commit -m "$(cat <<'EOF'
fix(skin): hydrate skin store before creating Experience

EOF
)"
```

---

### Task 6: Player runtime texture replacement

**Files:**

- Modify: `src/js/world/player/player.js`
- Optionally extend: `tests/unit/skin-texture-utils.unit.js` if player-specific pure helper is extracted

**Behavior:**

1. Always set `this.resource = this.resources.items.playerModel`.
2. Call `setModel()` once; keep shadow/layer/emissiveIntensity/rotation/renderOrder setup.
3. After `setModel()`, `bindCharacterBodyLayers(this.model)` and store as `this._bodyLayers`.
4. Apply initial skin from store:
   - preset → configure shared Resources texture (`owned: false`) and apply
   - custom → create owned texture from `committedCustomSkin`
5. Keep player hidden / invisible until initial apply succeeds or falls back to default preset (use `this.model.visible = false` then true). Do not flash the wrong embedded GLB texture if a custom skin is equipped.
6. Replace `_handleSkinChange` with async revision-guarded texture swap.
7. Retain bound handler reference and unregister in `destroy()` via `emitter.off`.

- [ ] **Step 1: Rewrite skin resolution helpers**

Delete model-swapping `_getModelResource` usage for skins. Add something equivalent to:

```javascript
async _applySkinById(skinId, revision) {
  const requestId = ++this._skinRequestId
  try {
    const prepared = await this._prepareSkinTexture(skinId)
    if (requestId !== this._skinRequestId)
      return void disposeOwnedSkinTexture(prepared.owned ? prepared.texture : null)

    const previous = this._activeSkinTexture
    applySkinTextureToLayers(this._bodyLayers, prepared.texture)
    this._activeSkinTexture = prepared
    if (previous?.owned)
      disposeOwnedSkinTexture(previous.texture)
    this.model.visible = true
  }
  catch (error) {
    console.error('[Player] Failed to apply skin:', skinId, error)
    // fall back to DEFAULT_SKIN_ID preset once if this was initial apply
  }
}

_handleSkinChange({ skinId, revision }) {
  void this._applySkinById(skinId, revision)
}
```

`_prepareSkinTexture`:

- preset: `configureSkinTexture(resources.items[textureResourceName], { owned: false })`
- custom: create from store committed Blob with `{ owned: true }`

Do not dispose/recreate animation controller. Do not remove model from movement group.

- [ ] **Step 2: Add stale-revision unit coverage if helper is pure**

If the request-id guard is easiest to test as a tiny pure function, extract and test:

```javascript
export function shouldAcceptSkinRequest(requestId, latestId) {
  return requestId === latestId
}
```

Otherwise cover via the existing store/util tests and verify Player by browser checklist in Task 9.

- [ ] **Step 3: Targeted lint**

Run: `pnpm exec eslint src/js/world/player/player.js src/js/world/player/skin-texture-utils.js`

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/js/world/player/player.js src/js/world/player/skin-texture-utils.js tests/unit/skin-texture-utils.unit.js
git commit -m "$(cat <<'EOF'
feat(player): swap skin textures without rebuilding model

EOF
)"
```

---

### Task 7: Selector preview texture replacement

**Files:**

- Modify: `src/js/components/skin-preview-scene.js`
- Modify: `src/vue/components/menu/SkinSelector.vue` mount/watch paths as needed for API rename

**API changes:**

```javascript
async loadCanonicalModel(modelPath = CANONICAL_MODEL_PATH)
async applySkinTexture({ texture | blob | textureResource })
// preserve currentModel, mixer, currentAction, rotation, camera
dispose() // also dispose owned custom preview texture + revoke leftover object URLs
```

- [ ] **Step 1: Replace loadModel-based switching**

On mount, call `loadCanonicalModel` once.

Add `applyPresetTexture(texture)` / `applyCustomBlob(blob)` that:

1. bump `textureRequestId`
2. prepare texture
3. ignore stale results and dispose owned stale textures
4. bind both layer materials
5. dispose previous owned custom texture after successful bind

Do not call `_disposeModel` on skin switch. `_disposeModel` may still run on full scene dispose, but must not dispose Resources-owned preset textures. Update disposal to skip `userData.skinOwned === false` shared maps and only dispose owned custom textures explicitly tracked by the preview.

- [ ] **Step 2: Wire SkinSelector watchers**

```javascript
// mount
await preview.loadCanonicalModel(CANONICAL_MODEL_PATH)
await applyPreviewFromStore()

watch(
  () => [skinStore.previewSkinId, skinStore.previewRevision],
  async () => {
    await applyPreviewFromStore()
    currentAnim.value = 'idle'
  },
)
```

`applyPreviewFromStore`:

- pending custom → `preview.applyCustomBlob(pendingCustomSkin)`
- committed custom with no pending → committed Blob
- preset → Resources texture if available, else load from `skin.texturePath` via preview loader (prefer Resources when Experience already loaded; selector can also TextureLoader-load the public path because preview is isolated)

Because the selector preview uses an isolated renderer, it cannot safely share GPU textures from the main Experience Resources across renderers. Prefer loading preset PNGs by public path (`skin.texturePath`) inside the preview, marked `owned: true` for that preview instance, OR clone textures if already proven safe. Simplest correct approach for this codebase: preview loads preset PNGs by URL and owns those preview textures; main Player uses Resources textures.

- [ ] **Step 3: Manual check**

Open selector, switch Steve/Alex/Classic: model must not reload, idle animation continues, only texture changes.

- [ ] **Step 4: Commit**

```bash
git add src/js/components/skin-preview-scene.js src/vue/components/menu/SkinSelector.vue
git commit -m "$(cat <<'EOF'
feat(skin-preview): replace textures on a single canonical model

EOF
)"
```

---

### Task 8: SkinSelector custom upload UI and apply/cancel wiring

**Files:**

- Modify: `src/vue/components/menu/SkinSelector.vue`
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh.json`

**UI scope (minimal):**

- Keep existing preset cards.
- Add one custom card with file input `accept="image/png"`.
- Show loading/error via existing `isLoading` + new `errorKey` with `$t(errorKey)`.
- Apply disabled when `!skinStore.hasPreviewChanges` or while loading.
- `apply()` awaits store and exits only on success.
- `cancel()` calls `cancelPreview()` then exits as today.

- [ ] **Step 1: Add i18n keys**

```json
"skin": {
  "steve": "Steve",
  "alex": "Alex",
  "player": "Classic",
  "custom": "Custom",
  "upload": "Upload PNG",
  "uploadHint": "64×64 PNG",
  "equipped": "Equipped",
  "credits": "Special thanks to skin creators:",
  "errorInvalidType": "Please choose a PNG image.",
  "errorInvalidSize": "Skin must be exactly 64×64 pixels.",
  "errorDecode": "Could not read that image.",
  "errorSave": "Could not save custom skin. Please try again."
}
```

Mirror Chinese strings in `zh.json`.

- [ ] **Step 2: Wire upload + async apply**

```javascript
async function onCustomFileChange(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  await skinStore.setPendingCustomSkin(file)
}

async function apply() {
  const result = await skinStore.applySkin()
  if (result?.ok !== false)
    ui.exitSkinSelector()
}

function cancel() {
  skinStore.cancelPreview()
  // preview scene cancel cleanup happens via store-driven watcher / explicit preview.resetToEquipped()
  ui.exitSkinSelector()
}
```

Ensure cancel also asks preview to drop pending owned texture if the watcher does not automatically restore equipped skin.

- [ ] **Step 3: Keep layout stable**

Do not redesign the selector. Add the custom card in the existing card row/grid style. No new menus or editors.

- [ ] **Step 4: Commit**

```bash
git add src/vue/components/menu/SkinSelector.vue src/locales/en.json src/locales/zh.json
git commit -m "$(cat <<'EOF'
feat(skin): add custom png upload card and async apply

EOF
)"
```

---

### Task 9: Full verification

**Files:** none new; run checks and browser checklist from the spec.

- [ ] **Step 1: Run all new unit tests**

Run:

```bash
node --test tests/unit/skin-config.unit.js tests/unit/custom-skin-storage.unit.js tests/unit/skin-texture-utils.unit.js tests/unit/skin-store.unit.js
```

Expected: all PASS

- [ ] **Step 2: Lint touched files then full lint**

```bash
pnpm exec eslint src/js/config/skin-config.js src/js/sources.js src/js/utils/storage/custom-skin-storage.js src/js/world/player/skin-texture-utils.js src/js/world/player/player.js src/js/components/skin-preview-scene.js src/pinia/skinStore.js src/App.vue src/vue/components/menu/SkinSelector.vue src/locales/en.json src/locales/zh.json tests/unit/skin-config.unit.js tests/unit/custom-skin-storage.unit.js tests/unit/skin-texture-utils.unit.js tests/unit/skin-store.unit.js
pnpm lint
```

Expected: clean for touched files; fix only issues introduced by this work.

- [ ] **Step 3: Production build**

Run: `pnpm build`

Expected: success. Missing preset PNG files will not fail the JS build, but browser QA needs them present.

- [ ] **Step 4: Browser checklist**

With assets in place and `pnpm dev`:

1. Select/apply each preset: Player model and animation controller are not rebuilt; only texture changes.
2. Upload valid 64×64 PNG: preview updates; game Player unchanged until Apply.
3. Cancel pending custom: equipped skin and IndexedDB committed record unchanged.
4. Apply custom, reload page: custom skin restored on Player.
5. Upload a second custom and Apply: single custom slot replaced.
6. Reject non-PNG, wrong dimensions, and corrupt image without losing current skin.
7. Layer2 overlay transparency still looks correct; no UV flip.

- [ ] **Step 5: Final commit only if verification produced fixes**

```bash
git add <fixed-files>
git commit -m "$(cat <<'EOF'
fix(skin): address verification findings for texture skin system

EOF
)"
```

---

## Execution Notes

- Prefer TDD order inside each task: failing test → minimal implementation → pass → commit.
- If preset PNG assets are not yet available, complete Tasks 1–8 and unit/lint/build; defer visual acceptance until assets arrive.
- Do not remove `zombieModel` or touch terrain/camera/HUD systems.
- `skin:changed` payload must include `{ skinId, revision }` for Player stale-guard compatibility; keep field names stable.
- When both equipped and pending IDs are `custom`, UI and store must use `hasPreviewChanges`, not ID equality alone.
