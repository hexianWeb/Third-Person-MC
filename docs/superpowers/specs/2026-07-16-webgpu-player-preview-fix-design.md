# WebGPU Player Preview Fix Design

## Problem

After the main renderer migrated to WebGPU, the HUD player preview renders in the upper-left instead of its lower-left frame. Its background is white and historical player poses remain visible as trails.

The preview code still assumes WebGL viewport behavior. WebGPU consumes top-left viewport coordinates, while the current code passes a bottom margin directly as `y`. It also multiplies values by device pixel ratio even though Three.js WebGPU applies the renderer pixel ratio internally. Finally, the standalone `clear(false, true, false)` call creates a separate WebGPU clear pass instead of expressing depth clearing as part of the preview render.

## Scope

- Fix only the in-game HUD player preview rendered by `Renderer._renderPlayerPreview()`.
- Keep the existing lower-left HUD frame, preview size configuration, camera composition, and player model.
- Preserve the current game image behind the preview player.
- Do not modify the skin selector preview, HUD CSS, post-processing effects, or shadow settings.

## Viewport Coordinates

A pure helper will calculate the logical-pixel preview rectangle:

```javascript
y = canvasHeight - margin.bottom - size
```

`x`, `y`, width, and height will be passed to Three.js in CSS/logical pixels. The renderer remains responsible for applying device pixel ratio. The helper will clamp the rectangle to non-negative canvas bounds so small windows cannot generate invalid WebGPU viewport values.

## Transparent Composition

The main render pipeline finishes first. The preview then loads the existing color attachment so the current game image remains visible behind the player, while clearing depth for the preview camera.

During only the preview render, renderer state will be:

- `autoClear = true`
- `autoClearColor = false`
- `autoClearDepth = true`
- `autoClearStencil = false`
- `scene.background = null`

The standalone `renderer.clear(false, true, false)` call will be removed. This avoids a separate WebGPU clear submission and prevents the preview from clearing the main color image.

## State Restoration

The preview render will use `try/finally`. It will restore the scene background, auto-clear flags, scissor-test state, and full logical-pixel viewport even if player rendering throws. This prevents preview state from leaking into the next post-processing frame.

## Testing

Test-first coverage will verify:

- A bottom margin is converted to the correct WebGPU top-left `y` coordinate.
- Values remain in logical pixels and are not multiplied by device pixel ratio.
- Oversized values are clamped inside the canvas.
- The preview render uses color-load/depth-clear state and restores renderer state afterward.

Automated Node tests and targeted ESLint will run locally. Final visual acceptance is manual: the player must appear inside the lower-left frame, the live game scene must remain visible behind it, and movement/animation must not leave trails.
