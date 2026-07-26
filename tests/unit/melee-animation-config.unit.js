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

test('melee clips are one-shot combat animations at about 2.9x default speed', () => {
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
    assert.ok(Math.abs(effective - 2.925) < 0.02)
  }
})
