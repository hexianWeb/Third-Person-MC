# Minecraft-Style Input and Primary Action Design

## Goal

Replace the current combat-oriented keyboard bindings with controls closer to
Minecraft Java Edition, while giving future swords, axes, and other held tools
a stable path to dedicated action animations.

## Controls

| Action | Binding |
| --- | --- |
| Move | `W / A / S / D` |
| Sneak / crouch | Hold `Shift` |
| Sprint | Hold `Ctrl` |
| Jump | `Space` |
| Primary action | Left mouse button |

The gameplay bindings for `V`, `Z`, `X`, and `C` are removed:

- `V` no longer controls crouching.
- `Z` and `X` no longer trigger punch animations.
- `C` no longer triggers blocking.

Other existing controls are unchanged.

## Primary Action Behavior

Left mouse button is the only primary-action input:

1. If the block raycaster has a valid block target, holding the button uses the
   existing mining flow.
2. If there is no valid block target, the initial mouse-down triggers one air
   swing.
3. Holding the button in the air does not repeatedly trigger swings.
4. The current attack cooldown still prevents animation spam.

The air-swing animation depends on the held item. Unarmed and non-melee tools
use the existing alternating left/right straight punches. Swords and axes use
the melee sequence defined below. Hook-punch and block actions are no longer
reachable from gameplay input.

## Architecture

`InputManager` remains responsible only for raw input state:

- map `Shift` to `keys.sneak`;
- map `Ctrl` to `keys.sprint`;
- emit the existing mouse-down and mouse-up events;
- remove the gameplay state and events associated with `V`, `Z`, `X`, and `C`.

`BlockMiningController` is the primary-action resolver because it already owns
left-click mining and reads the block-raycaster state:

- valid block target → start the existing mining flow;
- no block target → emit one semantic `input:air_swing` event.

This keeps mining and air swinging mutually exclusive without another raycast
or a second listener independently deciding what the same click means.

Player movement consumes semantic `sneak` and `sprint` fields instead of
key-named `v` and `shift` fields. Sprint has priority only when sneak is not
active; if both keys are held, sneak wins to avoid accidental sprinting while
the player is trying to crouch.

## Held-Item Animation Selection

`Player` stores the selected item ID from the existing
`hud:selected-block-update` event. Item configuration exposes an attack style
instead of embedding animation names in input code:

- wooden and stone swords → `melee`;
- wooden and stone axes → `melee`;
- no item, pickaxes, shovels, hoes, sticks, and items without a configured
  style → `unarmed`.

The `melee` style advances through this fixed sequence on each air swing that
passes the current attack cooldown:

1. `melee_downward`
2. `melee_360_high`
3. `melee_combo_v3`

`melee_horizontal` remains registered as a combat clip but is separated from
the cycle and is not selected by the current melee sequence. After the third
action, the next accepted swing returns to `melee_downward`. Selecting a
different held item resets the sequence so a newly selected sword or axe
always starts with `melee_downward`. The unarmed style continues alternating
the existing left/right straight punches.

The four clips are registered as combat, `LoopOnce` animations in
`animation-config.js` and included in the combat animation list and a dedicated
`melee` time-scale subgroup. Their default effective playback speed is
approximately `2.9x` after applying the existing
`base × global × category × subgroup` formula, matching the unarmed
punch effective rate. A Tweakpane `Melee` speed control exposes the
subgroup multiplier for runtime tuning.

After the current attack cooldown accepts the action, `Player` triggers the
resolved animation and the existing attack hitbox/damage behavior. Mining keeps
its existing `quick_combo_punch` behavior even when a sword or axe is held; the
new melee sequence is only for air swings/attacks. Dedicated tool mining
animations can later use the same attack-style configuration without changing
mouse bindings.

## State and Event Rules

- One physical mouse-down produces at most one air-swing request.
- Mining and air swinging are mutually exclusive for the same mouse-down.
- Mouse-up continues to cancel active mining.
- Punch achievements listen to `input:air_swing` instead of the removed
  `input:punch_straight` and `input:punch_hook` events, preserving their current
  input-counting behavior.
- Input is ignored while a text input or textarea has focus, as it is today.
- Existing pointer-lock and UI behavior remains unchanged.

## Documentation and Cleanup

Update the README controls table to describe Minecraft-style controls and
remove the obsolete normal attack, heavy attack, and block entries.

Remove obsolete comments, key-state fields, and gameplay listeners for `V`,
`Z`, `X`, and `C`. Existing animation clips may remain because they are assets
and can still be used by previews or future mappings.

## Verification

Automated tests should cover:

- `Shift` sets sneak state and `Ctrl` sets sprint state;
- `V`, `Z`, `X`, and `C` no longer trigger gameplay actions;
- left mouse-down with a block target starts mining but does not air-swing;
- left mouse-down without a block target triggers one alternating straight
  punch when unarmed or holding a non-melee item;
- wooden/stone swords and axes cycle through
  `melee_downward` / `melee_360_high` / `melee_combo_v3`;
  `melee_horizontal` is excluded from the cycle;
- switching held items resets the melee sequence;
- sword/axe mining continues using the existing mining animation and does not
  advance the melee sequence;
- melee clips are `LoopOnce`, categorized as combat, and run at approximately
  `2.9x` under the default speed configuration;
- holding or key-repeat does not duplicate an air swing;
- simultaneous sneak and sprint resolves to sneak;
- current attack cooldown still suppresses repeated attacks.

Manual verification should confirm movement speeds and animations, mining
start/cancel behavior, air swings in first- and third-person views, and no
regression to inventory or pointer-lock interaction.
