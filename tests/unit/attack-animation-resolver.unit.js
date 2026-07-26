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
    for (let click = 0; click < 4; click++) {
      const result = resolveAirSwingAnimation(itemId, index)
      clips.push(result.clip)
      index = result.nextIndex
    }
    assert.deepEqual(clips, [
      AnimationClips.MELEE_DOWNWARD,
      AnimationClips.MELEE_360_HIGH,
      AnimationClips.MELEE_COMBO_V3,
      AnimationClips.MELEE_DOWNWARD,
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
