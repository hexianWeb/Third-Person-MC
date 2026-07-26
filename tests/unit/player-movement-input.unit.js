import assert from 'node:assert/strict'
import { register } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { LocomotionProfiles } from '../../src/js/world/player/animation-config.js'
import { resolveDirectionInput } from '../../src/js/world/player/input-resolver.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
register(pathToFileURL(path.join(__dirname, 'vite-alias-loader.js')).href)

let getSpeedProfile

test.before(async () => {
  const { PlayerMovementController } = await import('../../src/js/world/player/player-movement-controller.js')
  getSpeedProfile = inputState => PlayerMovementController.prototype.getSpeedProfile(inputState)
})

test('movement profiles use Minecraft-style sprint and sneak state', () => {
  assert.equal(getSpeedProfile({ sprint: false, sneak: false }), LocomotionProfiles.WALK)
  assert.equal(getSpeedProfile({ sprint: true, sneak: false }), LocomotionProfiles.RUN)
  assert.equal(getSpeedProfile({ sprint: false, sneak: true }), LocomotionProfiles.CROUCH)
})

test('sneak wins when sprint and sneak are both held', () => {
  assert.equal(getSpeedProfile({ sprint: true, sneak: true }), LocomotionProfiles.CROUCH)
})

test('resolveDirectionInput preserves sneak and sprint', () => {
  const { resolvedInput } = resolveDirectionInput({
    forward: true,
    backward: false,
    left: false,
    right: false,
    sneak: true,
    sprint: true,
    space: false,
  })

  assert.equal(resolvedInput.sneak, true)
  assert.equal(resolvedInput.sprint, true)
})
