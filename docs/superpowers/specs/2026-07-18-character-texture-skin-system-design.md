# Character Texture Skin System Design

## Context

The current skin system treats every skin as a separate GLB. `SkinSelector` selects a model path, `skinStore` emits `skin:changed`, and `Player` removes the current model, installs another model, and rebuilds its animation controller. The standalone preview also reloads an entire GLB whenever the selected skin changes.

The character assets share one mesh, UV layout, skeleton, and animation set. Their skin-level difference is the embedded 64 x 64 PNG texture. Re-exporting the same character model for each texture wastes resources and makes user-uploaded skins impossible to represent cleanly.

## Goals

- Use one canonical `playerModel` GLB for every player skin.
- Represent preset skins as external 64 x 64 PNG textures.
- Let the user upload one custom PNG skin from the existing skin selector page.
- Preview all skin changes before committing them.
- Persist the committed custom skin in IndexedDB across page reloads.
- Replace only character material textures at runtime; preserve the model, skeleton, animation controller, collision state, and movement state.
- Keep the existing preset cards, 3D preview, animation controls, Apply button, and Cancel button.

## Non-goals

- Creating, converting, or correcting character models and skin artwork.
- Supporting different character geometry, skeletons, UV layouts, or animation sets per skin.
- Maintaining a named library of multiple uploaded skins.
- Editing or painting a skin inside the application.
- Supporting legacy 64 x 32 Minecraft skin layouts or arbitrary image dimensions.
- Changing unrelated HUD, terrain, character movement, camera, or rendering behavior.

## Selected Approach

The system will use runtime texture replacement. The canonical model is loaded once for the game player and once for the isolated selector preview. Choosing another skin replaces the two body-layer material maps without removing or reloading the model.

Alternatives were rejected for the following reasons:

- Reloading the same GLB for every selection still repeats model parsing, GPU resource creation, and animation setup.
- Generating one GLB per texture preserves the current asset duplication and cannot naturally support a browser-uploaded image.

## Asset Contract

`playerModel` is the only runtime character model. Digital asset preparation remains outside this implementation.

The canonical GLB must preserve this fixed hierarchy and child order:

```text
scene
└─ SimplePlayer.arma
   ├─ SimplePlayer.Body.Layer1
   ├─ SimplePlayer.Body.Layer2
   └─ MAIN
```

The runtime binds the body layers with direct hierarchy access:

```javascript
const characterRoot = model.children[0]
const layer1 = characterRoot.children[0]
const layer2 = characterRoot.children[1]
```

Initialization verifies the three expected names once and throws a contextual asset-contract error if they do not match. It does not traverse arbitrary descendants or support material arrays. Each layer is a Mesh with one material, both layers use the same skin atlas, and their UVs follow the supplied 64 x 64 skin layout.

The outer `Layer2` material retains its existing transparency, blending, depth, and render-order settings. Skin replacement changes only texture references and update flags.

Preset PNGs are declared in `src/js/sources.js`, in accordance with the repository resource rules. `src/js/config/skin-config.js` changes from model descriptors to texture descriptors. A preset entry contains its ID, labels, thumbnail, texture resource name, and public texture path. `custom` is a fixed logical skin ID with no static resource path.

The duplicated Steve and Alex GLBs are no longer preloaded by `sources.js`. Removing old files from `public/models/character` is not required by this feature.

## Components and Responsibilities

### Skin configuration

`src/js/config/skin-config.js` owns:

- the canonical model resource name and preview model path;
- preset skin descriptors;
- the fixed `custom` skin descriptor;
- the default skin ID;
- existing preview animation button configuration.

Model paths are removed from individual preset entries.

### IndexedDB storage adapter

A new storage module under `src/js/utils/storage/` owns the IndexedDB details. It exposes small asynchronous operations to open the database, read the fixed custom record, replace it, and clear it if needed.

The schema has one object store and one stable `custom` key. The stored record contains the PNG Blob and a schema version. The adapter does not import Vue, Pinia, or Three.js, making storage behavior independently testable.

### Pinia skin store

`src/pinia/skinStore.js` remains the source of truth for UI-visible skin state. It owns:

- `currentSkinId`;
- `previewSkinId`;
- the committed custom Blob loaded from IndexedDB;
- the pending uploaded Blob used only for preview;
- loading and user-facing error state;
- a revision value that distinguishes two different images using the same `custom` ID.

The store exposes an asynchronous `initialize()` operation. `App.vue` waits for it before constructing `Experience`, so a previously equipped custom skin source is available during player initialization. The player remains hidden until its initial texture has either been applied successfully or has fallen back to a valid preset, preventing a wrong default skin from flashing.

The store contains no `THREE.Texture` instances. Blob-to-texture conversion and GPU resource ownership stay in the 3D layer.

### Skin texture utility

A focused Three.js utility loads, configures, applies, and disposes skin textures. It:

- creates a texture from a preset resource or custom Blob;
- sets `colorSpace` to `SRGBColorSpace`;
- sets `flipY` to `false` for the GLTF UV convention;
- applies the agreed pixel-art sampling settings;
- updates both `map` and the existing night-visibility `emissiveMap`;
- sets texture and material update flags;
- tracks whether a texture is globally shared or locally owned.

Preset textures are owned by the global Resources system and are never disposed during a skin switch. Textures created from a custom Blob are owned by the consuming Player or preview scene and are disposed after a replacement succeeds or when the consumer is destroyed.

### Runtime player

`src/js/world/player/player.js` always obtains `resources.items.playerModel`. `setModel()` runs once and preserves the existing shadow, layer, emissive-intensity, rotation, and render-order setup.

The `skin:changed` handler asynchronously prepares the new texture and applies it to the two bound layer materials. It does not:

- remove or replace the model;
- change the movement group;
- dispose or recreate `PlayerAnimationController`;
- reset the current animation or movement state.

A monotonically increasing request revision prevents an older asynchronous texture load from overwriting a newer selection. The previous texture stays active until the new texture is ready.

### Selector preview

`src/js/components/skin-preview-scene.js` loads the canonical preview GLB once per selector mount. Selecting a preset or uploaded candidate replaces only its two material maps. Rotation, the current preview animation, camera, lighting, and WebGPU renderer remain intact.

The preview owns its custom texture instance and temporary Object URL. Superseded loads, selector unmount, and scene disposal all release their locally owned resources.

### Skin selector UI

`src/vue/components/menu/SkinSelector.vue` keeps its current layout and adds one custom-skin card with a PNG file input. The new UI is limited to the requested upload affordance, validation/loading state, and a concise error message.

Vue sends state changes through Pinia and invokes the existing preview class API. It does not directly manipulate the game Player or its Three.js materials.

## Startup and Restoration Flow

1. `App.vue` mounts and awaits `skinStore.initialize()`.
2. The store reads the current skin ID from localStorage.
3. The store opens IndexedDB and restores the committed custom Blob when present.
4. If localStorage selects `custom` but no valid custom record exists, the store falls back to the default preset and repairs localStorage.
5. `Experience` starts after hydration, Resources loads the canonical model and preset textures, and Player applies the resolved current skin.
6. A storage failure does not block application startup. It produces a recoverable store error and uses the default preset.

Existing `steve`, `alex`, and `player` localStorage IDs remain valid after migration because their logical IDs do not change.

## Preview and Upload Flow

1. Opening the selector copies `currentSkinId` into `previewSkinId` and clears stale candidate/error state.
2. Selecting a preset changes only `previewSkinId` and the preview texture.
3. Selecting a file verifies that it is a PNG, decodes successfully, and has exact dimensions of 64 x 64.
4. A valid upload becomes `pendingCustomSkin`, increments the preview revision, selects `custom`, and appears in the 3D preview.
5. IndexedDB, localStorage, and the game Player remain unchanged at this stage.
6. An invalid upload leaves the last valid preview active and exposes a localized error.

The change predicate includes `hasPendingCustomSkin`; comparing IDs alone is insufficient because both the equipped skin and a newly uploaded candidate may have the ID `custom`.

## Apply Transaction

Applying a preset is synchronous after its preview texture is valid:

1. Set `currentSkinId` to the selected preset.
2. Save the ID to localStorage.
3. Emit `skin:changed` with the ID and revision.

Applying a pending custom skin is an asynchronous commit:

1. Keep the current skin and committed custom Blob unchanged.
2. Write the pending Blob to the fixed IndexedDB `custom` record.
3. Only after the transaction succeeds, promote the pending Blob to the committed Blob.
4. Increment the committed revision, set `currentSkinId` to `custom`, and save the ID to localStorage.
5. Emit `skin:changed` with the custom ID and committed revision.
6. Clear the pending candidate after consumers have switched away from its temporary preview resources.

If the IndexedDB transaction fails, the selector stays open, the current equipped skin is unchanged, the prior committed custom record remains authoritative, and the user receives an error. `SkinSelector.apply()` awaits the store result and exits the selector only on success.

## Cancel Transaction

Cancel performs no persistent writes. It:

- discards the pending custom Blob;
- releases its preview texture and Object URL;
- restores `previewSkinId` and the preview revision to the current equipped skin;
- keeps IndexedDB, localStorage, and the game Player unchanged;
- exits through the existing selector navigation flow.

This rule also applies when the currently equipped skin is `custom` and the user has previewed a replacement custom PNG.

## Texture Replacement and Ownership

Both body layers receive the same texture object within one renderer. The utility updates:

- `layer1.material.map` and `layer2.material.map`;
- `layer1.material.emissiveMap` and `layer2.material.emissiveMap` when supported;
- material `needsUpdate` flags.

The replacement sequence is prepare, validate, bind, then dispose the previous locally owned custom texture. A failed prepare or bind leaves the previous valid texture installed.

Temporary Object URLs are revoked after their image has loaded, when a request becomes stale, when the candidate is cancelled, or when the preview unmounts. Global preset textures and other maps referenced by the model are never disposed by the skin switcher.

## Error Handling

- Non-PNG, non-64 x 64, and undecodable files are rejected before preview state changes.
- A preset texture load failure preserves the last valid preview or runtime texture.
- IndexedDB open/read failure falls back safely and records a recoverable error.
- IndexedDB write failure aborts Apply without changing the equipped skin.
- A missing custom record referenced by localStorage falls back to the default preset.
- Stale asynchronous texture results are ignored and their locally owned resources are released.
- An invalid canonical model hierarchy raises an explicit error naming the expected and actual layer node.

Errors shown in `SkinSelector` use i18n keys. Console errors include operation context without logging image contents.

## Testing and Validation

Node unit tests cover pure state and resource behavior with injected storage and texture dependencies:

- initialization restores a valid custom record;
- a missing custom record repairs an invalid `custom` selection;
- upload creates a pending candidate without writing IndexedDB;
- Cancel leaves the committed Blob and current skin unchanged;
- successful Apply commits before changing current state;
- failed Apply preserves the current and previously committed custom skin;
- a new pending image counts as a change when both IDs are `custom`;
- stale request revisions cannot replace the latest texture;
- direct layer binding validates the fixed hierarchy and updates both materials;
- shared preset textures are preserved while owned custom textures are disposed exactly once.

Browser verification covers the real IndexedDB and file-input path:

- select and apply each preset without rebuilding the Player model or animation controller;
- upload a valid 64 x 64 PNG and preview it without changing the game Player;
- cancel a pending custom skin and confirm the old custom record remains;
- apply a custom skin, reload the page, and confirm it is restored;
- upload a second custom skin and confirm it replaces the single custom slot;
- reject invalid type, dimensions, and corrupt image data without losing the current skin.

Implementation verification runs the focused Node tests, targeted ESLint for touched files, `pnpm lint`, and `pnpm build`. Final model hierarchy, UV alignment, transparency, and visual quality are manually accepted using the user-supplied digital assets.
