# AGENTS.md - Third-Person-MC Development Guide

## Commands

Use `pnpm` exclusively.

```bash
pnpm dev              # Start development server with hot reload
pnpm build            # Build for production
pnpm preview          # Preview production build locally
pnpm lint             # Check code for linting errors
pnpm lint:fix         # Auto-fix linting issues
pnpm test:chrome      # Run tests in Chromium (headed mode)
pnpm test:firefox     # Run tests in Firefox (headed mode)
pnpm test:safari      # Run tests in WebKit/Safari (headed mode)
pnpm clean:dist       # Remove dist directory
pnpm clean:report     # Remove Playwright test reports
```

Run one Playwright test with:

```bash
npx playwright test tests/browsers.test.js --headed --project=chromium
npx playwright test tests/browsers.test.js:10 --headed
```

## JavaScript and formatting

- Write pure JavaScript ES modules. Use explicit `.js` extensions and JSDoc for public or complex APIs.
- Follow the existing Antfu formatting: two-space indentation, no semicolons, single quotes, trailing commas in multiline literals, and parenthesized arrow parameters.
- Keep top-level `<script setup>` and `<style>` content unindented. Make focused edits; do not reformat unrelated code.
- Use aliases instead of deep relative paths: `@`, `@ui`, `@ui-components`, `@pinia`, `@styles`, and `@three`.

## Runtime ownership

- `Experience` is the singleton owner of the scene, camera, renderer, resources, input services, and world. Three.js components obtain only the dependencies they need through `new Experience()`.
- Keep 3D features class-based and expose `update()`, `resize()`, `destroy()`, and `debugInit()` when they apply.
- The renderer is WebGPU-only. Initialize it asynchronously, await its device initialization before constructing render-dependent work, and keep rendering gated until `ready` is true. Do not introduce a WebGL fallback.
- Build rendering and post-processing with TSL nodes and Three.js `NodeMaterial` classes. Prefer existing node-material patterns and writable TSL uniforms; compose passes through the renderer pipeline rather than issuing extra manual renders after it.
- Add Tweakpane controls for adjustable runtime material or pipeline parameters. Bind color controls with `view: 'color'`.

## UI, state, and input boundaries

- Vue owns interface, menus, and user-facing controls. Three.js owns scene rendering, game simulation, physics, and raycasting. Do not manipulate Three.js objects directly from Vue.
- Use Pinia for persistent state shared by UI and 3D systems; use the mitt event bus for transient cross-layer notifications.
- `InputManager`, `IMouse`, and `PointerLockManager` own raw browser input. Reuse their state and emitted events; for raycasting use `this.experience.iMouse.normalizedMouse` rather than recalculating normalized coordinates.

## Resources and disposal

- Declare every model, texture, font, and other loadable asset in `src/js/sources.js`, then access it through `this.experience.resources.items`.
- Reuse shared terrain resources where appropriate. Dispose geometries, materials, textures, renderer resources, listeners, and event subscriptions when their owner is destroyed.
- Keep teardown ordered: stop updates, destroy child systems, dispose scene resources, clear the scene and event bus, then release singleton/global references.

## Verification

- For runtime or UI changes, run the focused test that covers the change; add or update tests when behavior changes. E2E tests live in `tests/`.
- Before handing off a change, run the relevant checks. Use `pnpm lint` for source/style validation and `pnpm build` for production compilation when the affected scope warrants them.
- Preserve existing behavior unless the request explicitly changes it. Do not modify unrelated UI, assets, dependencies, or legacy source files.

## Git

Use Conventional Commit messages, for example `feat(terrain): add biome blending algorithm` or `fix(camera): prevent clipping through terrain`.
