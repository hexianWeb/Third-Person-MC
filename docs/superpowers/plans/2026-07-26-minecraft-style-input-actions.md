# Minecraft-Style Input Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old `V/Z/X/C` gameplay bindings with Minecraft-style sneak, sprint, mining, and air attacks, including a four-animation sword/axe melee sequence.

**Architecture:** `InputManager` exposes semantic `sneak` and `sprint` state while `BlockMiningController` arbitrates each left mouse-down into either mining or one `input:air_swing` event. A pure attack-animation resolver maps the selected item's configured attack style and sequence index to an animation clip; `Player` owns sequence state, cooldown, animation playback, and damage.

**Tech Stack:** JavaScript ES modules, Three.js `AnimationMixer`, mitt events, Tweakpane, Node.js test runner, pnpm.

## Global Constraints

- `Shift` is sneak/crouch; `Ctrl` is sprint.
- Remove gameplay bindings for `V`, `Z`, `X`, and `C`.
- A left mouse-down with a valid block target mines; without a target it emits one air swing.
- Mining and air swinging are mutually exclusive for the same click.
- Unarmed and non-melee items alternate left/right straight punches.
- Wooden/stone swords and axes cycle `melee_horizontal`, `melee_downward`, `melee_360_high`, then `melee_combo_v3`.
- Changing the selected item resets the attack sequence.
- Sword/axe mining keeps the existing `quick_combo_punch` mining animation.
- Melee clips are `LoopOnce` combat actions with an effective default playback speed of approximately `1.5x`.
- Reuse the existing block-raycaster result; do not perform another raycast.
- Use `pnpm` exclusively and do not add dependencies.
- Do not stage or modify the pre-existing unrelated `src/js/config/chunk-config.js` change.

---

### Task 1: Semantic Sneak and Sprint Input

**Files:**
- Modify: `src/js/utils/input/input.js:9-23,92-143`
- Modify: `src/js/world/player/player.js:62-71`
- Modify: `src/js/world/player/player-movement-controller.js:57-64,101-135,347-357`
- Create: `tests/unit/input-manager.unit.js`
- Create: `tests/unit/player-movement-input.unit.js`

**Interfaces:**
- Produces: `InputManager.keys.sneak: boolean`
- Produces: `InputManager.keys.sprint: boolean`
- Produces: `PlayerMovementController#getSpeedProfile(inputState): LocomotionProfiles`
- Removes: `keys.shift`, `keys.v`, `keys.z`, `keys.x`, `keys.c` and their attack/block events

- [ ] **Step 1: Write failing tests for semantic input state and removed keys**

Create `tests/unit/input-manager.unit.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import emitter from '../../src/js/utils/event/event-bus.js'
import InputManager from '../../src/js/utils/input/input.js'

function installWindowStub() {
  const listeners = new Map()
  globalThis.window = {
    addEventListener(type, handler) {
      listeners.set(type, handler)
    },
    removeEventListener(type) {
      listeners.delete(type)
    },
  }
  return listeners
}

test('Shift maps to sneak and Control maps to sprint', (t) => {
  installWindowStub()
  const input = new InputManager()
  t.after(() => {
    input.destroy()
    delete globalThis.window
  })

  input.updateKey('shift', true)
  input.updateKey('control', true)

  assert.equal(input.keys.sneak, true)
  assert.equal(input.keys.sprint, true)
  assert.equal('shift' in input.keys, false)
  assert.equal('v' in input.keys, false)
})

test('V, Z, X, and C have no gameplay bindings', (t) => {
  installWindowStub()
  const input = new InputManager()
  let punchEvents = 0
  let blockEvents = 0
  const onPunch = () => punchEvents++
  const onBlock = () => blockEvents++
  emitter.on('input:punch_straight', onPunch)
  emitter.on('input:punch_hook', onPunch)
  emitter.on('input:block', onBlock)
  t.after(() => {
    emitter.off('input:punch_straight', onPunch)
    emitter.off('input:punch_hook', onPunch)
    emitter.off('input:block', onBlock)
    input.destroy()
    delete globalThis.window
  })

  for (const key of ['v', 'z', 'x', 'c'])
    input.updateKey(key, true)

  assert.equal(punchEvents, 0)
  assert.equal(blockEvents, 0)
  assert.equal('z' in input.keys, false)
  assert.equal('x' in input.keys, false)
  assert.equal('c' in input.keys, false)
})
```

- [ ] **Step 2: Write a failing movement-priority test**

Create `tests/unit/player-movement-input.unit.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import { LocomotionProfiles } from '../../src/js/world/player/animation-config.js'
import { PlayerMovementController } from '../../src/js/world/player/player-movement-controller.js'

const getSpeedProfile = inputState =>
  PlayerMovementController.prototype.getSpeedProfile(inputState)

test('movement profiles use Minecraft-style sprint and sneak state', () => {
  assert.equal(getSpeedProfile({ sprint: false, sneak: false }), LocomotionProfiles.WALK)
  assert.equal(getSpeedProfile({ sprint: true, sneak: false }), LocomotionProfiles.RUN)
  assert.equal(getSpeedProfile({ sprint: false, sneak: true }), LocomotionProfiles.CROUCH)
})

test('sneak wins when sprint and sneak are both held', () => {
  assert.equal(getSpeedProfile({ sprint: true, sneak: true }), LocomotionProfiles.CROUCH)
})
```

- [ ] **Step 3: Run the tests and confirm the old mapping fails**

Run:

```bash
pnpm exec node --test tests/unit/input-manager.unit.js tests/unit/player-movement-input.unit.js
```

Expected: FAIL because `sneak`/`sprint` do not exist, `V/Z/X/C` still have bindings, and movement still reads `shift`/`v`.

- [ ] **Step 4: Implement the semantic key mapping**

In `src/js/utils/input/input.js`, replace key-named gameplay state with:

```js
this.keys = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  sneak: false,
  sprint: false,
  space: false,
  q: false,
  e: false,
  tab: false,
  backtick: false,
}
```

Replace the old `shift`, `v`, `z`, `x`, and `c` switch cases with:

```js
case 'shift':
  this.keys.sneak = isPressed
  break
case 'control':
  this.keys.sprint = isPressed
  break
```

Update `Player.inputState` in `src/js/world/player/player.js` to contain `sneak` and `sprint` instead of `shift` and `v`.

In `PlayerMovementController`, make `getSpeedProfile` the single source of truth:

```js
getSpeedProfile(inputState) {
  if (inputState.sneak)
    return LocomotionProfiles.CROUCH
  if (inputState.sprint)
    return LocomotionProfiles.RUN
  return LocomotionProfiles.WALK
}
```

Use it in `_updateCustomPhysics`:

```js
const speedProfile = this.getSpeedProfile(inputState)
const profile = speedProfile.id
const currentSpeed = this.config.speed[profile]
const dirScale = this._computeDirectionScale(profile, inputState)
this.worldVelocity.x = worldX * currentSpeed * dirScale
this.worldVelocity.z = worldZ * currentSpeed * dirScale
```

Keep the existing combat-deceleration branch unchanged. Update affected JSDoc input-state shapes to use `sneak` and `sprint`.

- [ ] **Step 5: Run focused tests and lint**

Run:

```bash
pnpm exec node --test tests/unit/input-manager.unit.js tests/unit/player-movement-input.unit.js
pnpm lint
```

Expected: both unit files PASS and ESLint exits successfully.

- [ ] **Step 6: Commit the semantic input change**

```bash
git add src/js/utils/input/input.js src/js/world/player/player.js src/js/world/player/player-movement-controller.js tests/unit/input-manager.unit.js tests/unit/player-movement-input.unit.js
git commit -m "feat(input): adopt Minecraft-style sprint and sneak keys"
```

---

### Task 2: Left-Click Primary Action Arbitration

**Files:**
- Modify: `src/js/interaction/block-mining-controller.js:42-64`
- Modify: `src/js/interaction/achievement-controller.js:15-20,33-39,54-64`
- Create: `tests/unit/block-mining-input.unit.js`

**Interfaces:**
- Consumes: `input:mouse_down` payload `{ button: number }`
- Produces: `input:air_swing` with no payload when left-click has no block target
- Preserves: `game:mining-start` for a valid block target

- [ ] **Step 1: Write failing arbitration tests**

Create `tests/unit/block-mining-input.unit.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import BlockMiningController from '../../src/js/interaction/block-mining-controller.js'
import emitter from '../../src/js/utils/event/event-bus.js'

function makeController(current) {
  const controller = Object.create(BlockMiningController.prototype)
  Object.assign(controller, {
    params: { enabled: true },
    experience: {
      world: {
        blockRaycaster: { current },
      },
    },
    time: { elapsed: 125 },
    isMining: false,
    miningStartTime: 0,
    miningProgress: 0,
    currentTarget: null,
  })
  return controller
}

test('left-click without a block emits one air swing', (t) => {
  const controller = makeController(null)
  let swings = 0
  const onSwing = () => swings++
  emitter.on('input:air_swing', onSwing)
  t.after(() => emitter.off('input:air_swing', onSwing))

  controller._onMouseDown({ button: 0 })

  assert.equal(swings, 1)
  assert.equal(controller.isMining, false)
})

test('left-click with a block starts mining without an air swing', (t) => {
  const target = {
    chunkX: 0,
    chunkZ: 0,
    worldBlock: { x: 1, y: 2, z: 3 },
    instanceId: 4,
    blockId: 5,
  }
  const controller = makeController(target)
  let swings = 0
  let starts = 0
  const onSwing = () => swings++
  const onStart = () => starts++
  emitter.on('input:air_swing', onSwing)
  emitter.on('game:mining-start', onStart)
  t.after(() => {
    emitter.off('input:air_swing', onSwing)
    emitter.off('game:mining-start', onStart)
  })

  controller._onMouseDown({ button: 0 })

  assert.equal(swings, 0)
  assert.equal(starts, 1)
  assert.equal(controller.isMining, true)
  assert.deepEqual(controller.currentTarget.worldBlock, { x: 1, y: 2, z: 3 })
})

test('right and middle clicks do not mine or air swing', (t) => {
  const controller = makeController(null)
  let swings = 0
  const onSwing = () => swings++
  emitter.on('input:air_swing', onSwing)
  t.after(() => emitter.off('input:air_swing', onSwing))

  controller._onMouseDown({ button: 1 })
  controller._onMouseDown({ button: 2 })

  assert.equal(swings, 0)
  assert.equal(controller.isMining, false)
})
```

- [ ] **Step 2: Run the test and confirm air-swing arbitration is absent**

Run:

```bash
pnpm exec node --test tests/unit/block-mining-input.unit.js
```

Expected: the no-target test FAILS because the current controller returns without emitting `input:air_swing`.

- [ ] **Step 3: Emit the semantic air-swing event only when no block is targeted**

Update `BlockMiningController#_onMouseDown`:

```js
_onMouseDown(event) {
  if (!this.params.enabled || event.button !== 0)
    return

  const raycaster = this.experience.world?.blockRaycaster
  if (!raycaster)
    return

  if (!raycaster.current) {
    emitter.emit('input:air_swing')
    return
  }

  this.isMining = true
  this.miningStartTime = this.time.elapsed
  this.miningProgress = 0
  this.currentTarget = this._captureTarget(raycaster.current)

  emitter.emit('game:mining-start', {
    progress: 0,
    target: this.currentTarget,
  })
}
```

This is the only component that decides between mining and air swinging.

- [ ] **Step 4: Migrate achievements to semantic input names**

In `AchievementController`:

```js
emitter.once('input:air_swing', () => this.store.unlock('first_punch'))
```

Replace both rage-quit punch listeners with:

```js
emitter.on('input:air_swing', onPunch)
```

Update the run achievement condition:

```js
if (keys.sprint && (keys.forward || keys.backward || keys.left || keys.right)) {
```

Remove every listener for `input:punch_straight` and `input:punch_hook`.

- [ ] **Step 5: Run focused tests and lint**

Run:

```bash
pnpm exec node --test tests/unit/block-mining-input.unit.js
pnpm lint
```

Expected: all three arbitration tests PASS and ESLint exits successfully.

- [ ] **Step 6: Commit primary-action arbitration**

```bash
git add src/js/interaction/block-mining-controller.js src/js/interaction/achievement-controller.js tests/unit/block-mining-input.unit.js
git commit -m "feat(input): resolve left click into mining or air swing"
```

---

### Task 3: Configurable Attack Styles and Animation Sequences

**Files:**
- Modify: `src/js/config/items-config.js:1-91`
- Modify: `src/js/world/player/animation-config.js:18-45,51-75,121-129,132-180`
- Create: `src/js/world/player/attack-animation-resolver.js`
- Create: `tests/unit/attack-animation-resolver.unit.js`
- Create: `tests/unit/melee-animation-config.unit.js`

**Interfaces:**
- Produces: `ATTACK_STYLES.UNARMED` and `ATTACK_STYLES.MELEE`
- Produces: `resolveAirSwingAnimation(itemId, sequenceIndex): { clip: string, nextIndex: number }`
- Produces: four new `AnimationClips` constants
- Produces: `timeScaleConfig.subGroups.melee`

- [ ] **Step 1: Write failing tests for item styles and fixed sequence order**

Create `tests/unit/attack-animation-resolver.unit.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import { ITEM_IDS } from '../../src/js/config/items-config.js'
import { AnimationClips } from '../../src/js/world/player/animation-config.js'
import { resolveAirSwingAnimation } from '../../src/js/world/player/attack-animation-resolver.js'

test('swords and axes cycle the shared melee sequence', () => {
  for (const itemId of [
    ITEM_IDS.WOODEN_SWORD,
    ITEM_IDS.STONE_SWORD,
    ITEM_IDS.WOODEN_AXE,
    ITEM_IDS.STONE_AXE,
  ]) {
    let index = 0
    const clips = []
    for (let click = 0; click < 5; click++) {
      const result = resolveAirSwingAnimation(itemId, index)
      clips.push(result.clip)
      index = result.nextIndex
    }
    assert.deepEqual(clips, [
      AnimationClips.MELEE_HORIZONTAL,
      AnimationClips.MELEE_DOWNWARD,
      AnimationClips.MELEE_360_HIGH,
      AnimationClips.MELEE_COMBO_V3,
      AnimationClips.MELEE_HORIZONTAL,
    ])
  }
})

test('unarmed and non-melee items alternate straight punches', () => {
  for (const itemId of [null, ITEM_IDS.WOODEN_PICKAXE, ITEM_IDS.STONE_SHOVEL]) {
    let index = 0
    const first = resolveAirSwingAnimation(itemId, index)
    index = first.nextIndex
    const second = resolveAirSwingAnimation(itemId, index)
    assert.equal(first.clip, AnimationClips.STRAIGHT_PUNCH)
    assert.equal(second.clip, AnimationClips.RIGHT_STRAIGHT_PUNCH)
  }
})
```

- [ ] **Step 2: Write a failing test for combat registration and effective speed**

Create `tests/unit/melee-animation-config.unit.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'

import {
  AnimationCategories,
  AnimationClips,
  animationSettings,
  animationSubGroupMap,
  CombatAnimations,
  timeScaleConfig,
} from '../../src/js/world/player/animation-config.js'

const meleeClips = [
  AnimationClips.MELEE_HORIZONTAL,
  AnimationClips.MELEE_DOWNWARD,
  AnimationClips.MELEE_360_HIGH,
  AnimationClips.MELEE_COMBO_V3,
]

test('melee clips are one-shot combat animations at about 1.5x default speed', () => {
  for (const clip of meleeClips) {
    const settings = animationSettings[clip]
    assert.equal(settings.category, AnimationCategories.COMBAT)
    assert.equal(settings.loop, THREE.LoopOnce)
    assert.equal(animationSubGroupMap[clip], 'melee')
    assert.equal(CombatAnimations.includes(clip), true)

    const effective = settings.timeScale
      * timeScaleConfig.global
      * timeScaleConfig.categories[settings.category]
      * timeScaleConfig.subGroups.melee
    assert.ok(Math.abs(effective - 1.5) < 0.02)
  }
})
```

- [ ] **Step 3: Run tests and confirm configuration is missing**

Run:

```bash
pnpm exec node --test tests/unit/attack-animation-resolver.unit.js tests/unit/melee-animation-config.unit.js
```

Expected: FAIL because the resolver, attack styles, melee clip constants, and melee speed group do not exist.

- [ ] **Step 4: Add explicit attack styles to item configuration**

At the top of `items-config.js`, add:

```js
export const ATTACK_STYLES = Object.freeze({
  UNARMED: 'unarmed',
  MELEE: 'melee',
})
```

Add `attackStyle: ATTACK_STYLES.MELEE` to `woodenAxe`, `woodenSword`, `stoneAxe`, and `stoneSword`. Leave other items without this property so the resolver applies the unarmed fallback.

- [ ] **Step 5: Register the four melee clips and their speed group**

Add to `AnimationClips`:

```js
MELEE_HORIZONTAL: 'melee_horizontal',
MELEE_DOWNWARD: 'melee_downward',
MELEE_360_HIGH: 'melee_360_high',
MELEE_COMBO_V3: 'melee_combo_v3',
```

For each new clip, add:

```js
[AnimationClips.MELEE_HORIZONTAL]: {
  timeScale: 1.0,
  category: AnimationCategories.COMBAT,
  loop: THREE.LoopOnce,
},
```

Repeat with the corresponding constant for the other three clips. Add all four to `CombatAnimations`, map each to subgroup `'melee'`, and add:

```js
melee: 1.15,
```

to `timeScaleConfig.subGroups`. With the default combat category multiplier `1.3`, `1.0 × 1.3 × 1.15 = 1.495`, satisfying the approximately `1.5x` requirement.

- [ ] **Step 6: Implement the pure sequence resolver**

Create `src/js/world/player/attack-animation-resolver.js`:

```js
import { ATTACK_STYLES, ITEM_BY_ID } from '../../config/items-config.js'
import { AnimationClips } from './animation-config.js'

const ATTACK_SEQUENCES = Object.freeze({
  [ATTACK_STYLES.UNARMED]: Object.freeze([
    AnimationClips.STRAIGHT_PUNCH,
    AnimationClips.RIGHT_STRAIGHT_PUNCH,
  ]),
  [ATTACK_STYLES.MELEE]: Object.freeze([
    AnimationClips.MELEE_HORIZONTAL,
    AnimationClips.MELEE_DOWNWARD,
    AnimationClips.MELEE_360_HIGH,
    AnimationClips.MELEE_COMBO_V3,
  ]),
})

/**
 * Resolve one accepted air swing and the next sequence index.
 * @param {number | null} itemId
 * @param {number} sequenceIndex
 * @returns {{ clip: string, nextIndex: number }}
 */
export function resolveAirSwingAnimation(itemId, sequenceIndex = 0) {
  const style = ITEM_BY_ID[itemId]?.attackStyle ?? ATTACK_STYLES.UNARMED
  const sequence = ATTACK_SEQUENCES[style] ?? ATTACK_SEQUENCES[ATTACK_STYLES.UNARMED]
  const index = Math.max(0, sequenceIndex) % sequence.length
  return {
    clip: sequence[index],
    nextIndex: (index + 1) % sequence.length,
  }
}
```

- [ ] **Step 7: Run focused tests and lint**

Run:

```bash
pnpm exec node --test tests/unit/attack-animation-resolver.unit.js tests/unit/melee-animation-config.unit.js
pnpm lint
```

Expected: sequence and animation-configuration tests PASS; ESLint exits successfully.

- [ ] **Step 8: Commit attack-style configuration**

```bash
git add src/js/config/items-config.js src/js/world/player/animation-config.js src/js/world/player/attack-animation-resolver.js tests/unit/attack-animation-resolver.unit.js tests/unit/melee-animation-config.unit.js
git commit -m "feat(player): configure sword and axe melee sequences"
```

---

### Task 4: Player Air-Swing Playback and Cooldown

**Files:**
- Modify: `src/js/world/player/player.js:14-25,62-83,149-155,335-382,503-515,763-811,907-919`
- Create: `tests/unit/player-air-swing.unit.js`

**Interfaces:**
- Consumes: `input:air_swing`
- Consumes: `resolveAirSwingAnimation(itemId, sequenceIndex)`
- Maintains: `Player._selectedItemId` and `Player._airSwingSequenceIndex`
- Preserves: `Player#handleAttack()` damage and attack-box behavior

- [ ] **Step 1: Write failing unit tests for player sequence ownership**

Create `tests/unit/player-air-swing.unit.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import { ITEM_IDS } from '../../src/js/config/items-config.js'
import { AnimationClips } from '../../src/js/world/player/animation-config.js'
import Player from '../../src/js/world/player/player.js'

function makePlayer(itemId, cooldown = 0) {
  const clips = []
  let attacks = 0
  return {
    player: {
      attackCooldown: cooldown,
      _selectedItemId: itemId,
      _airSwingSequenceIndex: 0,
      animation: {
        triggerAttack(clip) {
          clips.push(clip)
        },
      },
      handleAttack() {
        attacks++
      },
    },
    clips,
    get attacks() {
      return attacks
    },
  }
}

test('accepted sword air swings advance the melee sequence', () => {
  const fixture = makePlayer(ITEM_IDS.WOODEN_SWORD)

  Player.prototype._handleAirSwing.call(fixture.player)
  Player.prototype._handleAirSwing.call(fixture.player)

  assert.deepEqual(fixture.clips, [
    AnimationClips.MELEE_HORIZONTAL,
    AnimationClips.MELEE_DOWNWARD,
  ])
  assert.equal(fixture.attacks, 2)
})

test('cooldown blocks playback, damage, and sequence advancement', () => {
  const fixture = makePlayer(ITEM_IDS.WOODEN_AXE, 0.25)

  Player.prototype._handleAirSwing.call(fixture.player)

  assert.deepEqual(fixture.clips, [])
  assert.equal(fixture.attacks, 0)
  assert.equal(fixture.player._airSwingSequenceIndex, 0)
})

test('changing selected item resets the attack sequence', () => {
  const player = {
    _selectedItemId: ITEM_IDS.WOODEN_SWORD,
    _airSwingSequenceIndex: 3,
    heldItemAttachment: {
      setHeldItemId() {},
    },
  }

  Player.prototype._onSelectedBlockUpdate.call(player, {
    blockId: ITEM_IDS.STONE_AXE,
  })

  assert.equal(player._selectedItemId, ITEM_IDS.STONE_AXE)
  assert.equal(player._airSwingSequenceIndex, 0)
})
```

- [ ] **Step 2: Run the test and confirm the player has no generic air-swing handler**

Run:

```bash
pnpm exec node --test tests/unit/player-air-swing.unit.js
```

Expected: FAIL because `_handleAirSwing`, selected-item state, and resolver integration do not exist.

- [ ] **Step 3: Add selected-item and sequence state**

Import the resolver:

```js
import { resolveAirSwingAnimation } from './attack-animation-resolver.js'
```

In the constructor, replace the old straight/hook toggles with:

```js
this._selectedItemId = null
this._airSwingSequenceIndex = 0
this._handleAirSwing = this._handleAirSwing.bind(this)
```

Update the selected-item handler:

```js
_onSelectedBlockUpdate({ blockId }) {
  if (this._selectedItemId !== blockId)
    this._airSwingSequenceIndex = 0
  this._selectedItemId = blockId
  this.heldItemAttachment?.setHeldItemId(blockId)
}
```

- [ ] **Step 4: Replace punch/hook/block listeners with one air-swing handler**

Add:

```js
_handleAirSwing() {
  if (this.attackCooldown > 0)
    return

  const { clip, nextIndex } = resolveAirSwingAnimation(
    this._selectedItemId,
    this._airSwingSequenceIndex,
  )
  this._airSwingSequenceIndex = nextIndex
  this.animation.triggerAttack(clip)
  this.handleAttack()
}
```

In `setupInputListeners`, remove listeners for `input:punch_straight`, `input:punch_hook`, and `input:block`, then add:

```js
emitter.on('input:air_swing', this._handleAirSwing)
```

Keep all three mining listeners unchanged so block mining still triggers `AnimationClips.QUICK_COMBO`.

In `destroy`, add:

```js
emitter.off('input:air_swing', this._handleAirSwing)
```

- [ ] **Step 5: Make cooldown independent of enemy-manager availability**

In `handleAttack`, set cooldown immediately after the existing cooldown guard:

```js
handleAttack() {
  if (this.attackCooldown > 0)
    return

  this.attackCooldown = this.ATTACK_COOLDOWN

  const enemyManager = this.experience.world?.enemyManager
  if (!enemyManager)
    return

  const { width, depth, damage } = this.attackConfig
  // Preserve the existing hit detection and damage code below.
}
```

Remove the old later assignment to `this.attackCooldown`. This guarantees rapid air clicks cannot bypass cooldown in worlds without an enemy manager.

- [ ] **Step 6: Expose melee playback speed in Tweakpane**

Beside the existing `Punch` and `Block` subgroup bindings, add:

```js
subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'melee', {
  label: 'Melee',
  min: 0.1,
  max: 3.0,
}).on('change', updateTimeScales)
```

- [ ] **Step 7: Run player and animation tests**

Run:

```bash
pnpm exec node --test tests/unit/player-air-swing.unit.js tests/unit/attack-animation-resolver.unit.js tests/unit/melee-animation-config.unit.js
pnpm lint
```

Expected: all tests PASS and ESLint exits successfully.

- [ ] **Step 8: Commit player integration**

```bash
git add src/js/world/player/player.js tests/unit/player-air-swing.unit.js
git commit -m "feat(player): play held-item air attack animations"
```

---

### Task 5: Controls Documentation and End-to-End Verification

**Files:**
- Modify: `README.md:43-55`
- Include: `docs/superpowers/specs/2026-07-26-minecraft-style-input-actions-design.md`
- Include: `docs/superpowers/plans/2026-07-26-minecraft-style-input-actions.md`

**Interfaces:**
- Documents the final user-facing bindings and attack behavior.
- Adds no runtime interface.

- [ ] **Step 1: Update the README controls table**

Replace obsolete attack/block rows with:

```markdown
| 操作 | 按键 | 说明 |
| --- | --- | --- |
| **移动** | `W / A / S / D` | 八向位移，包含姿态切换 |
| **潜行/蹲下** | `Shift` | 按住进入潜行 |
| **疾跑** | `Ctrl` | 按住疾跑 |
| **跳跃** | `Space` | 跳跃 |
| **攻击/挖掘** | `鼠标左键` | 对准方块时挖掘，未对准方块时挥击 |
| **锁定目标** | `鼠标中键` | (开发中) 魂类锁定逻辑 |
| **互动** | `E / F` | (开发中) 采集或开启传送门 |
| **关闭弹窗/菜单** | `ESC` | 退出或暂停 |
```

- [ ] **Step 2: Run all unit tests**

Run:

```bash
pnpm exec node --test tests/unit/*.unit.js
```

Expected: all unit tests PASS with zero failures.

- [ ] **Step 3: Run source validation and production compilation**

Run:

```bash
pnpm lint
pnpm build
```

Expected: ESLint exits successfully and Vite completes a production build without missing animation constants or module imports.

- [ ] **Step 4: Perform focused runtime verification**

Run:

```bash
pnpm dev
```

Verify in the browser:

1. Hold `Shift` while moving: player uses crouch speed and sneak animation.
2. Hold `Ctrl` while moving: player uses run speed and run animation.
3. Hold both: crouch wins.
4. Press `V`, `Z`, `X`, and `C`: no gameplay action occurs.
5. Left-click and hold on a block: mining starts, uses `quick_combo_punch`, and stops on mouse-up.
6. Left-click empty space unarmed: one alternating straight punch plays per accepted click.
7. Select a wooden or stone sword and click empty space five accepted times: the four melee clips play in specified order and wrap to `melee_horizontal`.
8. Repeat with a wooden or stone axe.
9. Change weapon after advancing the sequence: the next swing is `melee_horizontal`.
10. Mine a block while holding a sword or axe: mining animation remains `quick_combo_punch`.
11. Rapid-click faster than cooldown: blocked clicks neither animate nor advance the sequence.
12. Confirm melee playback is approximately `1.5x`; use the `Melee` Tweakpane binding only if visual tuning is needed.

- [ ] **Step 5: Commit documentation and approved planning artifacts**

```bash
git add README.md docs/superpowers/specs/2026-07-26-minecraft-style-input-actions-design.md docs/superpowers/plans/2026-07-26-minecraft-style-input-actions.md
git commit -m "docs(input): document Minecraft-style controls"
```

- [ ] **Step 6: Confirm only unrelated pre-existing work remains**

Run:

```bash
git status --short
```

Expected: `src/js/config/chunk-config.js` may remain modified; no files from this implementation remain unstaged.
