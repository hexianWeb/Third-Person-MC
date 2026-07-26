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

test('Shift maps to sprint and Control maps to sneak', (t) => {
  installWindowStub()
  const input = new InputManager()
  t.after(() => {
    input.destroy()
    delete globalThis.window
  })

  input.updateKey('shift', true)
  assert.equal(input.keys.sprint, true)
  assert.equal(input.keys.sneak, false)

  input.updateKey('shift', false)
  input.updateKey('control', true)
  assert.equal(input.keys.sneak, true)
  assert.equal(input.keys.sprint, false)

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
