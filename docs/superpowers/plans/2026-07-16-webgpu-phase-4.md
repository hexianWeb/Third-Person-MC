# WebGPU Migration Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the independent skin preview to an explicitly initialized WebGPU renderer and verify the three existing shadow-quality levels without changing unrelated UI or rendering behavior.

**Architecture:** `SkinPreviewScene.create(canvas)` owns asynchronous WebGPU initialization and only starts scene behavior after a WebGPU backend is confirmed. A small lifecycle helper keeps Vue unmount races testable, while shared shadow-policy functions make LOW/MEDIUM/HIGH behavior deterministic and independently testable.

**Tech Stack:** JavaScript ES modules, Three.js `0.185.1` (`three/webgpu`), Vue 3 Composition API, Playwright test runner, Vite 5, pnpm.

## Global Constraints

- Scope is limited to migration-plan Tasks 4.1 and 4.2.
- Do not add the optional Vite `three` to `three/webgpu` alias.
- Preserve the current skin-preview UI, model animations, drag controls, background, and fake ground shadow.
- Require a real WebGPU backend; do not add a WebGL fallback.
- Keep `bias = -0.0005` and `normalBias = 0.05` unless runtime evidence shows an artifact.
- Do not modify Grid, GlassWall, GLSL archival, or `three-custom-shader-material` cleanup.

---

### Task 1: Asynchronous WebGPU Skin Preview Renderer

**Files:**
- Modify: `src/js/components/skin-preview-scene.js`
- Create: `tests/skin-preview-renderer-init.test.js`

**Interfaces:**
- Consumes: `HTMLCanvasElement`, `THREE.WebGPURenderer.init()`, `renderer.backend.isWebGPUBackend`.
- Produces: `SkinPreviewScene.create(canvas): Promise<SkinPreviewScene>` and `initializeSkinPreviewRenderer(renderer): Promise<void>`.

- [ ] **Step 1: Write failing renderer-initialization tests**

```javascript
import { expect, test } from '@playwright/test'

import { initializeSkinPreviewRenderer } from '../src/js/components/skin-preview-scene.js'

test('waits for WebGPU renderer initialization', async () => {
  let finishInit
  const renderer = {
    backend: { isWebGPUBackend: true },
    init: () => new Promise(resolve => { finishInit = resolve }),
  }

  let settled = false
  const initializing = initializeSkinPreviewRenderer(renderer).then(() => { settled = true })
  await Promise.resolve()
  expect(settled).toBe(false)

  finishInit()
  await initializing
  expect(settled).toBe(true)
})

test('rejects a non-WebGPU backend', async () => {
  const renderer = {
    backend: { isWebGPUBackend: false },
    init: async () => {},
  }

  await expect(initializeSkinPreviewRenderer(renderer)).rejects.toThrow('WebGPU backend unavailable')
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm exec playwright test tests/skin-preview-renderer-init.test.js --project=chromium`

Expected: FAIL because `initializeSkinPreviewRenderer` is not exported.

- [ ] **Step 3: Add the async factory and WebGPU initialization**

Change the import and add the initializer:

```javascript
import * as THREE from 'three/webgpu'

export async function initializeSkinPreviewRenderer(renderer) {
  await renderer.init()
  if (renderer.backend?.isWebGPUBackend !== true)
    throw new Error('[SkinPreview] WebGPU backend unavailable')
}
```

Add `static async create(canvas)`, move renderer-dependent setup out of the constructor, and delay listeners/rendering until initialization succeeds:

```javascript
static async create(canvas) {
  const preview = new SkinPreviewScene(canvas)
  try {
    await preview._init()
    return preview
  }
  catch (error) {
    preview.dispose()
    throw error
  }
}

async _init() {
  await initializeSkinPreviewRenderer(this.renderer)
  if (this._disposed)
    return
  this._setupScene()
  this._setupLights()
  this._setupBackground()
  this._setupShadow()
  this._setupDragControls()
  this._initialized = true
  this._startRenderLoop()
}
```

Construct the renderer as:

```javascript
this.renderer = new THREE.WebGPURenderer({
  canvas,
  alpha: true,
  antialias: true,
})
this._disposed = false
this._initialized = false
```

Remove constructor calls to `_setupScene()`, `_setupLights()`, `_setupBackground()`, `_setupShadow()`, `_setupDragControls()`, and `_startRenderLoop()`.

- [ ] **Step 4: Make cleanup WebGPU-safe and idempotent**

Start `dispose()` with:

```javascript
if (this._disposed)
  return
this._disposed = true
```

Guard the animation callback before scheduling or rendering:

```javascript
if (this._disposed)
  return
this.animationFrameId = requestAnimationFrame(animate)
```

End cleanup with `this.renderer?.dispose()` and remove `forceContextLoss()`.

- [ ] **Step 5: Run focused tests and syntax check**

Run:

```bash
pnpm exec playwright test tests/skin-preview-renderer-init.test.js --project=chromium
node --check src/js/components/skin-preview-scene.js
```

Expected: 2 tests pass and syntax check exits 0.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/js/components/skin-preview-scene.js tests/skin-preview-renderer-init.test.js
git commit -m "feat(skin-preview): migrate renderer to WebGPU"
```

---

### Task 2: Race-Safe Vue Preview Mounting

**Files:**
- Create: `src/js/components/skin-preview-lifecycle.js`
- Modify: `src/vue/components/menu/SkinSelector.vue`
- Create: `tests/skin-preview-lifecycle.test.js`

**Interfaces:**
- Consumes: `createPreview(): Promise<SkinPreviewScene>`, `isUnmounted(): boolean`.
- Produces: `mountSkinPreview({ createPreview, isUnmounted }): Promise<SkinPreviewScene|null>`.

- [ ] **Step 1: Write the failing unmount-race tests**

```javascript
import { expect, test } from '@playwright/test'

import { mountSkinPreview } from '../src/js/components/skin-preview-lifecycle.js'

test('returns the initialized preview while mounted', async () => {
  const preview = { dispose() {} }
  const result = await mountSkinPreview({
    createPreview: async () => preview,
    isUnmounted: () => false,
  })
  expect(result).toBe(preview)
})

test('disposes a preview that resolves after unmount', async () => {
  let disposed = 0
  const preview = { dispose: () => { disposed++ } }
  const result = await mountSkinPreview({
    createPreview: async () => preview,
    isUnmounted: () => true,
  })
  expect(result).toBeNull()
  expect(disposed).toBe(1)
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm exec playwright test tests/skin-preview-lifecycle.test.js --project=chromium`

Expected: FAIL because `skin-preview-lifecycle.js` does not exist.

- [ ] **Step 3: Implement the lifecycle helper**

```javascript
export async function mountSkinPreview({ createPreview, isUnmounted }) {
  const preview = await createPreview()
  if (isUnmounted()) {
    preview.dispose()
    return null
  }
  return preview
}
```

- [ ] **Step 4: Update `SkinSelector.vue` lifecycle**

Import `mountSkinPreview`, track `let isUnmounted = false`, and use:

```javascript
onMounted(async () => {
  skinStore.initPreview()
  if (!previewCanvas.value)
    return

  try {
    const preview = await mountSkinPreview({
      createPreview: () => SkinPreviewScene.create(previewCanvas.value),
      isUnmounted: () => isUnmounted,
    })
    if (!preview)
      return

    previewScene.value = preview
    updateCanvasSize()
    window.addEventListener('resize', updateCanvasSize)

    const skin = SKIN_LIST.find(s => s.id === skinStore.previewSkinId)
    if (skin)
      await preview.loadModel(skin.modelPath)
  }
  catch (error) {
    console.error('[SkinSelector] Failed to initialize WebGPU preview:', error)
  }
})

onUnmounted(() => {
  isUnmounted = true
  window.removeEventListener('resize', updateCanvasSize)
  previewScene.value?.dispose()
  previewScene.value = null
})
```

Remove the old synchronous construction and duplicate initial model load.

- [ ] **Step 5: Run focused tests**

Run: `pnpm exec playwright test tests/skin-preview-lifecycle.test.js --project=chromium`

Expected: 2 tests pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/js/components/skin-preview-lifecycle.js src/vue/components/menu/SkinSelector.vue tests/skin-preview-lifecycle.test.js
git commit -m "fix(skin-preview): handle async mount lifecycle"
```

---

### Task 3: Testable Shadow Quality Policy

**Files:**
- Modify: `src/js/config/shadow-config.js`
- Modify: `src/js/world/terrain/terrain-renderer.js`
- Create: `tests/shadow-quality.test.js`

**Interfaces:**
- Consumes: `SHADOW_QUALITY`, `TREE_BLOCK_IDS`, numeric block ID.
- Produces: `shouldTerrainCastShadow(quality, blockId): boolean`.

- [ ] **Step 1: Write the failing policy tests**

```javascript
import { expect, test } from '@playwright/test'

import {
  SHADOW_QUALITY,
  shouldTerrainCastShadow,
} from '../src/js/config/shadow-config.js'

test('LOW disables terrain shadows', () => {
  expect(shouldTerrainCastShadow(SHADOW_QUALITY.LOW, 6)).toBe(false)
})

test('MEDIUM enables only configured tree shadows', () => {
  expect(shouldTerrainCastShadow(SHADOW_QUALITY.MEDIUM, 6)).toBe(true)
  expect(shouldTerrainCastShadow(SHADOW_QUALITY.MEDIUM, 1)).toBe(false)
})

test('HIGH enables all terrain shadows', () => {
  expect(shouldTerrainCastShadow(SHADOW_QUALITY.HIGH, 1)).toBe(true)
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm exec playwright test tests/shadow-quality.test.js --project=chromium`

Expected: FAIL because `shouldTerrainCastShadow` is not exported.

- [ ] **Step 3: Implement and adopt the policy**

Add to `shadow-config.js`:

```javascript
export function shouldTerrainCastShadow(quality, blockId) {
  if (quality === SHADOW_QUALITY.LOW)
    return false
  if (quality === SHADOW_QUALITY.MEDIUM)
    return TREE_BLOCK_IDS.has(blockId)
  return true
}
```

Import it in `terrain-renderer.js` and replace the LOW/MEDIUM/HIGH branch inside `_applyShadowSettings()` with:

```javascript
mesh.castShadow = shouldTerrainCastShadow(quality, blockId)
```

Do not change player shadow behavior or bias values.

- [ ] **Step 4: Run focused shadow tests**

Run: `pnpm exec playwright test tests/shadow-quality.test.js --project=chromium`

Expected: 3 tests pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/js/config/shadow-config.js src/js/world/terrain/terrain-renderer.js tests/shadow-quality.test.js
git commit -m "test(shadow): cover WebGPU quality levels"
```

---

### Task 4: Full Verification and Migration Plan Status

**Files:**
- Modify: `docs/plans/2026-07-14-webgpu-renderer-migration.md`
- Modify only if runtime evidence requires it: `src/js/world/environment.js`

**Interfaces:**
- Consumes: completed Tasks 1–3 and a WebGPU-capable Chromium runtime.
- Produces: verified Phase 4 status and, only if necessary, evidence-based shadow bias values.

- [ ] **Step 1: Install the locked dependencies**

Run: `pnpm install --frozen-lockfile`

Expected: exit 0 with no lockfile changes.

- [ ] **Step 2: Run automated verification**

Run:

```bash
pnpm exec playwright test tests/skin-preview-renderer-init.test.js tests/skin-preview-lifecycle.test.js tests/shadow-quality.test.js tests/plant-wind-height.test.js --project=chromium
pnpm lint
pnpm build
```

Expected: all focused tests pass; lint and build exit 0.

- [ ] **Step 3: Run WebGPU skin-preview acceptance**

Run `pnpm dev`, open the skin selector in WebGPU-capable Chromium, and verify:

1. No `WebGLRenderer` or WebGPU initialization error appears in the console.
2. The current skin renders and animates.
3. Drag, rotate buttons, animation buttons, skin changes, resize, close, and reopen work.
4. Closing during initialization produces no late rendering or leaked event behavior.

- [ ] **Step 4: Run shadow acceptance**

Use the Renderer debug panel to select LOW, MEDIUM, and HIGH and verify:

1. LOW: no player or terrain casting shadows.
2. MEDIUM: player and tree blocks cast; ordinary terrain does not.
3. HIGH: player and all terrain cast.
4. Moving near trees and terrain shows no acne, peter-panning, or unstable shadows.

If and only if step 4 shows an artifact, adjust `sunLight.shadow.bias` and `sunLight.shadow.normalBias` in `environment.js`, record the observed artifact and final values in the migration plan, then repeat steps 2 and 4.

- [ ] **Step 5: Mark Phase 4 status accurately**

Update the migration plan to mark Tasks 4.1 and 4.2 complete only when their automated and runtime checks have passed. Leave Task 4.3 skipped by scope and preserve Phase 5 as pending.

- [ ] **Step 6: Commit verification status**

```bash
git add docs/plans/2026-07-14-webgpu-renderer-migration.md src/js/world/environment.js
git commit -m "docs(webgpu): complete phase 4 verification"
```

Omit `environment.js` from `git add` when bias values did not change.
