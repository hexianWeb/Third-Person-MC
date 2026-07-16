# WebGPU Migration Phase 4 Design

## Scope

This phase completes Tasks 4.1 and 4.2 from the approved WebGPU migration plan:

- Migrate the independent skin preview renderer from `WebGLRenderer` to `WebGPURenderer`.
- Regress the LOW, MEDIUM, and HIGH shadow quality levels on the WebGPU backend and tune shadow bias only if verification shows artifacts.

The optional Vite alias from `three` to `three/webgpu` is explicitly excluded. Grid, GlassWall, GLSL archival, and dependency cleanup remain outside this phase.

## Skin Preview Architecture

`SkinPreviewScene` will expose an asynchronous factory:

```javascript
const preview = await SkinPreviewScene.create(canvas)
```

The constructor will remain non-public by convention and will only establish synchronous object state. `create()` will initialize a `WebGPURenderer`, await `renderer.init()`, verify that the selected backend is WebGPU, then initialize the scene helpers, input handlers, and render loop. No frame may render before initialization succeeds.

The renderer will be imported from `three/webgpu`. Existing standard materials, lights, GLTF models, canvas textures, animation behavior, drag controls, background, and fake ground shadow will retain their current visible behavior.

Initialization failures will reject `create()` with contextual information. A failed instance must not start a render loop or leave global pointer/touch listeners installed.

## Vue Lifecycle and Concurrency

`SkinSelector.vue` will make its mounted initialization asynchronous. It will await `SkinPreviewScene.create()` before resizing the preview or loading the selected skin.

The component will keep a local disposal flag. If it unmounts while renderer initialization is pending, the resolved preview will be disposed immediately instead of being assigned to Vue state. Initialization errors will be logged with skin-preview context and will not trigger model loading.

The existing watchers and controls will continue to tolerate a null preview instance.

## Resource Cleanup

`SkinPreviewScene.dispose()` will be idempotent. It will cancel animation frames, detach global listeners, dispose models, textures, geometry, materials, and the renderer, then clear references. It will not call `forceContextLoss()`, because that API belongs to the WebGL renderer path.

Disposal before full initialization and repeated disposal calls must both be safe.

## Shadow Quality Regression

The existing shadow contract remains unchanged:

- LOW: player and terrain do not cast shadows.
- MEDIUM: player and configured tree blocks cast shadows.
- HIGH: player and all terrain blocks cast shadows.

The regression will first verify event-driven `castShadow` behavior without changing visual parameters. The existing directional-light values (`bias = -0.0005`, `normalBias = 0.05`) remain the baseline. They will only change if WebGPU runtime inspection demonstrates acne, peter-panning, or unstable moving shadows.

Any required tuning will be limited to `environment.js` and shadow configuration. No unrelated lighting or UI changes are allowed.

## Testing and Verification

Implementation will follow test-first development:

- Verify the async skin-preview factory waits for renderer initialization.
- Verify initialization failure does not start rendering or install persistent handlers.
- Verify unmount-during-initialization disposes the late result.
- Verify repeated disposal is safe.
- Verify LOW, MEDIUM, and HIGH shadow casting rules.

After focused tests pass, run `pnpm lint`, `pnpm build`, and the relevant Chromium tests. Runtime acceptance requires a WebGPU-capable Chromium session and checks that the skin model renders, animates, resizes, rotates, changes skins, and closes without console errors. Shadow acceptance checks all three quality levels near terrain and trees; bias values are changed only when artifacts are observed.

## Success Criteria

- No active `WebGLRenderer` or `forceContextLoss()` remains in the skin preview path.
- Skin preview initialization is explicitly asynchronous and race-safe.
- The preview retains its current UI and behavior.
- All three shadow quality levels preserve their documented casting rules on WebGPU.
- Focused tests, lint, build, and available runtime checks pass, with any environment limitations reported explicitly.
