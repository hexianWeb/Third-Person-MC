# WebGPU Player Preview Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the HUD player preview inside its lower-left frame with the current game image visible behind it and no historical-frame trails.

**Architecture:** Extract WebGPU preview rectangle calculation and scoped renderer-state management into a focused player-preview rendering module. `Renderer._renderPlayerPreview()` updates the camera, delegates rendering to the module, and leaves the post-processing renderer in its original state.

**Tech Stack:** JavaScript ES modules, Three.js `0.185.1` WebGPURenderer, Node.js test runner, ESLint, pnpm.

## Global Constraints

- Modify only the in-game HUD player preview path.
- Keep the existing HUD frame, preview configuration, camera composition, and player model.
- The game image must remain visible behind the player; do not clear the color attachment.
- Do not change the skin selector, HUD CSS, post-processing effects, or shadow settings.
- Use logical/CSS pixels; Three.js applies device pixel ratio internally.
- Preserve the unrelated deletion of `biome-debug.html` and never include it in commits.

---

### Task 1: WebGPU Lower-Left Preview Rectangle

**Files:**
- Create: `src/js/world/player/player-preview-rendering.js`
- Create: `tests/player-preview-rendering.test.js`

**Interfaces:**
- Consumes: `{ width, height }` logical canvas size and `{ size, margin: { left, bottom } }` preview configuration.
- Produces: `calculatePlayerPreviewRect(sizes, config): { x, y, width, height }` in WebGPU top-left logical pixels.

- [ ] **Step 1: Write failing coordinate tests**

```javascript
import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- Playwright 1.49 runner hangs under the available Node 24 runtime.
import test from 'node:test'

import { calculatePlayerPreviewRect } from '../src/js/world/player/player-preview-rendering.js'

test('converts a lower-left margin to WebGPU top-left coordinates', () => {
  const rect = calculatePlayerPreviewRect(
    { width: 1777, height: 923, pixelRatio: 2 },
    { size: 222, margin: { left: 160, bottom: 18 } },
  )

  assert.deepEqual(rect, { x: 160, y: 683, width: 222, height: 222 })
})

test('clamps an oversized preview inside the logical canvas', () => {
  const rect = calculatePlayerPreviewRect(
    { width: 300, height: 200, pixelRatio: 2 },
    { size: 250, margin: { left: 180, bottom: 20 } },
  )

  assert.deepEqual(rect, { x: 180, y: 60, width: 120, height: 120 })
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/player-preview-rendering.test.js`

Expected: FAIL because `player-preview-rendering.js` does not exist.

- [ ] **Step 3: Implement logical coordinate calculation**

```javascript
export function calculatePlayerPreviewRect(sizes, config) {
  const canvasWidth = Math.max(0, sizes.width)
  const canvasHeight = Math.max(0, sizes.height)
  const x = Math.min(Math.max(0, config.margin.left), canvasWidth)
  const bottom = Math.min(Math.max(0, config.margin.bottom), canvasHeight)
  const size = Math.max(0, Math.min(
    config.size,
    canvasWidth - x,
    canvasHeight - bottom,
  ))

  return {
    x,
    y: canvasHeight - bottom - size,
    width: size,
    height: size,
  }
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/player-preview-rendering.test.js`

Expected: 2 tests pass.

---

### Task 2: Scoped Transparent Preview Render

**Files:**
- Modify: `src/js/world/player/player-preview-rendering.js`
- Modify: `src/js/renderer.js:498-526`
- Modify: `tests/player-preview-rendering.test.js`

**Interfaces:**
- Consumes: renderer, scene, preview camera, logical rectangle, and full logical canvas size.
- Produces: `renderPlayerPreviewFrame({ renderer, scene, camera, rect, canvasSize }): void`.

- [ ] **Step 1: Write failing renderer-state tests**

Update the test import and append the state test:

```javascript
import {
  calculatePlayerPreviewRect,
  renderPlayerPreviewFrame,
} from '../src/js/world/player/player-preview-rendering.js'

test('loads game color, clears preview depth, and restores renderer state', () => {
  const calls = []
  const renderer = {
    autoClear: false,
    autoClearColor: true,
    autoClearDepth: false,
    autoClearStencil: true,
    getScissorTest: () => false,
    setScissorTest: value => calls.push(['scissorTest', value]),
    setScissor: (...args) => calls.push(['scissor', ...args]),
    setViewport: (...args) => calls.push(['viewport', ...args]),
    render: () => {
      calls.push([
        'render',
        renderer.autoClear,
        renderer.autoClearColor,
        renderer.autoClearDepth,
        renderer.autoClearStencil,
      ])
    },
  }
  const background = { name: 'game' }
  const scene = { background }

  renderPlayerPreviewFrame({
    renderer,
    scene,
    camera: {},
    rect: { x: 160, y: 683, width: 222, height: 222 },
    canvasSize: { width: 1777, height: 923 },
  })

  assert.deepEqual(calls, [
    ['scissorTest', true],
    ['scissor', 160, 683, 222, 222],
    ['viewport', 160, 683, 222, 222],
    ['render', true, false, true, false],
    ['scissorTest', false],
    ['viewport', 0, 0, 1777, 923],
  ])
  assert.equal(scene.background, background)
  assert.equal(renderer.autoClear, false)
  assert.equal(renderer.autoClearColor, true)
  assert.equal(renderer.autoClearDepth, false)
  assert.equal(renderer.autoClearStencil, true)
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/player-preview-rendering.test.js`

Expected: FAIL because `renderPlayerPreviewFrame` is not exported.

- [ ] **Step 3: Implement scoped renderer state**

```javascript
export function renderPlayerPreviewFrame({ renderer, scene, camera, rect, canvasSize }) {
  const savedBackground = scene.background
  const savedScissorTest = renderer.getScissorTest()
  const savedAutoClear = renderer.autoClear
  const savedAutoClearColor = renderer.autoClearColor
  const savedAutoClearDepth = renderer.autoClearDepth
  const savedAutoClearStencil = renderer.autoClearStencil

  try {
    scene.background = null
    renderer.autoClear = true
    renderer.autoClearColor = false
    renderer.autoClearDepth = true
    renderer.autoClearStencil = false
    renderer.setScissorTest(true)
    renderer.setScissor(rect.x, rect.y, rect.width, rect.height)
    renderer.setViewport(rect.x, rect.y, rect.width, rect.height)
    renderer.render(scene, camera)
  }
  finally {
    renderer.setScissorTest(savedScissorTest)
    renderer.setViewport(0, 0, canvasSize.width, canvasSize.height)
    renderer.autoClear = savedAutoClear
    renderer.autoClearColor = savedAutoClearColor
    renderer.autoClearDepth = savedAutoClearDepth
    renderer.autoClearStencil = savedAutoClearStencil
    scene.background = savedBackground
  }
}
```

- [ ] **Step 4: Delegate from `Renderer._renderPlayerPreview()`**

Import both helpers and replace manual DPR, clear, scissor, and viewport code with:

```javascript
const rect = calculatePlayerPreviewRect(this.sizes, preview.config)
if (rect.width === 0 || rect.height === 0)
  return

renderPlayerPreviewFrame({
  renderer: this.instance,
  scene: this.scene,
  camera: preview.getCamera(),
  rect,
  canvasSize: this.sizes,
})
```

- [ ] **Step 5: Run focused verification**

Run:

```bash
node --test tests/player-preview-rendering.test.js tests/skin-preview-renderer-init.test.js tests/skin-preview-lifecycle.test.js tests/shadow-quality.test.js
pnpm exec eslint src/js/renderer.js src/js/world/player/player-preview-rendering.js tests/player-preview-rendering.test.js
```

Expected: 10 tests pass and ESLint exits 0.

- [ ] **Step 6: Commit the fix**

```bash
git add src/js/renderer.js src/js/world/player/player-preview-rendering.js tests/player-preview-rendering.test.js
git commit -m "fix(renderer): position WebGPU player preview correctly"
```

---

### Task 3: Manual WebGPU Acceptance

**Files:**
- Modify after user verification: `docs/plans/2026-07-14-webgpu-renderer-migration.md`

**Interfaces:**
- Consumes: user result from a WebGPU-capable browser.
- Produces: accurate Phase 4 verification status.

- [ ] **Step 1: Ask the user to verify the game**

Verify that:

1. The player appears inside the existing lower-left frame.
2. The game scene remains visible behind the player.
3. Player movement and animation leave no trails.
4. Resizing preserves the lower-left placement.
5. Bloom, speed lines, and gaze still render normally.

- [ ] **Step 2: Record the result**

Only after all five checks pass, mark the corner-preview acceptance item complete in the migration plan. If a check fails, capture the observed position/background and return to the debugging workflow before changing code.
