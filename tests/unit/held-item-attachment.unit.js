import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'

import HeldItemAttachment, {
  BONE_NAME,
  MESH_NAME,
  SOCKET_NAME,
} from '../../src/js/world/player/held-item-attachment.js'

function makeArmModel() {
  const model = new THREE.Group()
  model.name = 'playerRoot'
  const bone = new THREE.Bone()
  bone.name = BONE_NAME
  model.add(bone)
  return { model, bone }
}

test('attach parents HeldItemSocket under Arm:Right:Lower with PlaceholderHandle child', (t) => {
  const { model, bone } = makeArmModel()
  const held = new HeldItemAttachment()
  t.after(() => held.destroy())
  held.attach(model)

  assert.equal(held.bone, bone)
  assert.ok(held.socket)
  assert.equal(held.socket.name, SOCKET_NAME)
  assert.equal(held.socket.parent, bone)
  assert.ok(held.mesh)
  assert.equal(held.mesh.name, MESH_NAME)
  assert.equal(held.mesh.parent, held.socket)
  assert.equal(held.socket.visible, false)
  assert.equal(held.params.enabled, false)
  assert.equal(held.socket.rotation.order, 'XYZ')
})

test('setEnabled syncs params.enabled and socket.visible', (t) => {
  const { model } = makeArmModel()
  const held = new HeldItemAttachment()
  t.after(() => held.destroy())
  held.attach(model)
  held.setEnabled(true)
  assert.equal(held.params.enabled, true)
  assert.equal(held.socket.visible, true)
  held.setEnabled(false)
  assert.equal(held.params.enabled, false)
  assert.equal(held.socket.visible, false)
})

test('attach same live model is a no-op (single socket)', (t) => {
  const { model, bone } = makeArmModel()
  const held = new HeldItemAttachment()
  t.after(() => held.destroy())
  held.attach(model)
  const socketRef = held.socket
  held.attach(model)
  assert.equal(held.socket, socketRef)
  assert.equal(bone.children.filter((c) => c.name === SOCKET_NAME).length, 1)
})

test('attach repairs a detached socket on the same model', (t) => {
  const { model, bone } = makeArmModel()
  const held = new HeldItemAttachment()
  t.after(() => held.destroy())

  held.attach(model)
  held.socket.removeFromParent()
  held.attach(model)

  assert.equal(held.socket.parent, bone)
  assert.equal(held.mesh.parent, held.socket)
})

test('attach different model re-parents socket without duplicating', (t) => {
  const first = makeArmModel()
  const second = makeArmModel()
  const held = new HeldItemAttachment()
  t.after(() => held.destroy())
  held.attach(first.model)
  const socketRef = held.socket
  const meshRef = held.mesh
  held.attach(second.model)

  assert.equal(held.socket, socketRef)
  assert.equal(held.mesh, meshRef)
  assert.equal(held.socket.parent, second.bone)
  assert.equal(first.bone.children.filter((c) => c.name === SOCKET_NAME).length, 0)
  assert.equal(second.bone.children.filter((c) => c.name === SOCKET_NAME).length, 1)
})

test('attach applies pose params to socket while mesh stays local identity', (t) => {
  const { model } = makeArmModel()
  const held = new HeldItemAttachment()
  t.after(() => held.destroy())

  held.params.position = { x: 0.1, y: 0.2, z: -0.3 }
  held.params.rotation = { x: 0.4, y: -0.5, z: 0.6 }
  held.params.scale = 1.5

  held.attach(model)

  assert.deepEqual(held.socket.position.toArray(), [0.1, 0.2, -0.3])
  assert.equal(held.socket.rotation.x, 0.4)
  assert.equal(held.socket.rotation.y, -0.5)
  assert.equal(held.socket.rotation.z, 0.6)
  assert.deepEqual(held.socket.scale.toArray(), [1.5, 1.5, 1.5])

  assert.deepEqual(held.mesh.position.toArray(), [0, 0, 0])
  assert.deepEqual(held.mesh.rotation.toArray().slice(0, 3), [0, 0, 0])
  assert.deepEqual(held.mesh.scale.toArray(), [1, 1, 1])
})

test('socket scale is clamped to a positive minimum', (t) => {
  const { model } = makeArmModel()
  const held = new HeldItemAttachment()
  t.after(() => held.destroy())

  held.params.scale = 0
  held.attach(model)

  assert.equal(held.params.scale, 0.01)
  assert.deepEqual(held.socket.scale.toArray(), [0.01, 0.01, 0.01])
})

test('missing bone skips attach, logs once per model cycle, includes bone names', (t) => {
  const broken = new THREE.Group()
  const otherBone = new THREE.Bone()
  otherBone.name = 'SomeOtherBone'
  broken.add(otherBone)

  const valid = makeArmModel()
  const held = new HeldItemAttachment()
  t.after(() => held.destroy())

  const errors = []
  const original = console.error
  console.error = (...args) => {
    errors.push(args.join(' '))
  }
  try {
    held.attach(broken)
    held.attach(broken) // same failed model — no second log
    held.attach(valid.model) // success clears cycle
    held.attach(broken) // returning to failed model — log again
  }
  finally {
    console.error = original
  }

  assert.equal(errors.length, 2)
  assert.match(errors[0], /Arm:Right:Lower/)
  assert.match(errors[0], /SomeOtherBone/)
  assert.match(errors[1], /Arm:Right:Lower/)
})

test('destroy removes nodes and disposes geometry/material; second destroy is safe', () => {
  const { model } = makeArmModel()
  const held = new HeldItemAttachment()
  held.attach(model)
  const { geometry } = held.mesh
  const { material } = held.mesh
  let geoDisposed = 0
  let matDisposed = 0
  const geoDispose = geometry.dispose.bind(geometry)
  const matDispose = material.dispose.bind(material)
  geometry.dispose = () => {
    geoDisposed++
    geoDispose()
  }
  material.dispose = () => {
    matDisposed++
    matDispose()
  }

  held.destroy()
  assert.equal(held.socket, null)
  assert.equal(held.mesh, null)
  assert.equal(held.bone, null)
  assert.equal(held.model, null)
  assert.equal(geoDisposed, 1)
  assert.equal(matDisposed, 1)

  assert.doesNotThrow(() => held.destroy())
})

test('placeholder uses grip-offset box and standard material flags', (t) => {
  const { model } = makeArmModel()
  const held = new HeldItemAttachment()
  t.after(() => held.destroy())
  held.attach(model)
  assert.ok(held.mesh.geometry)
  // BoxGeometry(0.06, 0.7, 0.06) centered then translate(0, 0.25, 0)
  // → Y bounds roughly [-0.1, 0.6]
  held.mesh.geometry.computeBoundingBox()
  const { min, max } = held.mesh.geometry.boundingBox
  assert.ok(min.y < 0)
  assert.ok(max.y > 0.5)
  assert.equal(held.mesh.material.color.getHex(), 0xff5533)
  assert.equal(held.mesh.material.roughness, 0.65)
  assert.equal(held.mesh.material.metalness, 0)
})
