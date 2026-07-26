import assert from 'node:assert/strict'
import { register } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { ITEM_IDS } from '../../src/js/config/items-config.js'
import { AnimationClips } from '../../src/js/world/player/animation-config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
register(pathToFileURL(path.join(__dirname, 'vite-alias-loader.js')).href)

let Player

test.before(async () => {
  ({ default: Player } = await import('../../src/js/world/player/player.js'))
})

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
    AnimationClips.MELEE_DOWNWARD,
    AnimationClips.MELEE_360_HIGH,
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

test('attack cooldown applies without an enemy manager', () => {
  const player = {
    attackCooldown: 0,
    ATTACK_COOLDOWN: 0.5,
    experience: {
      world: {},
    },
  }

  Player.prototype.handleAttack.call(player)

  assert.equal(player.attackCooldown, 0.5)
})
