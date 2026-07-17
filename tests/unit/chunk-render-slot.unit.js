import assert from 'node:assert/strict'
import test from 'node:test'

import * as THREE from 'three'

import ChunkRenderSlot from '../../src/js/world/terrain/chunk-render-slot.js'

class FakeRenderLayer {
  constructor({ parent, onMeshCreated }) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 2)
    this.mesh.count = 0
    this.populateCalls = []
    this.resetCalls = 0
    this.disposeCalls = 0
    parent.add(this.mesh)
    onMeshCreated?.(this.mesh)
  }

  populate(data) {
    this.populateCalls.push(data)
    this.mesh.count = 2
  }

  reset() {
    this.resetCalls++
    this.mesh.count = 0
  }

  getMeshes() {
    return [this.mesh]
  }

  dispose() {
    this.disposeCalls++
  }
}

class FakeReplaceableLayer extends FakeRenderLayer {
  constructor(options, { layer, typeId, typeName }) {
    super(options)
    this.layer = layer
    this.mesh.userData[`${layer === 'blocks' ? 'block' : 'plant'}Id`] = typeId
    this.mesh.userData[`${layer === 'blocks' ? 'block' : 'plant'}Name`] = typeName
    if (layer === 'blocks') {
      this.mesh.geometry.setAttribute(
        'aAo',
        new THREE.InstancedBufferAttribute(new Float32Array(this.mesh.instanceMatrix.count), 1),
      )
    }
  }

  replaceMesh(typeId, mesh, capacity) {
    assert.equal(typeId, this.mesh.userData[`${this.layer === 'blocks' ? 'block' : 'plant'}Id`])
    const oldMesh = this.mesh
    oldMesh.parent.remove(oldMesh)
    oldMesh.parent?.remove(oldMesh)
    this.mesh = mesh
    this.mesh.count = 0
    this.mesh.parent?.remove(this.mesh)
    this.parent?.add(this.mesh)
    oldMesh.dispose()
    if (this.layer === 'blocks')
      oldMesh.geometry.dispose()
    this.capacity = capacity
    return { mesh: oldMesh, capacity: oldMesh.instanceMatrix.count }
  }
}

function createSlot(overrides = {}) {
  const scene = new THREE.Scene()
  const sharedWaterGeometry = new THREE.PlaneGeometry(64, 64)
  const sharedWaterMaterial = new THREE.MeshBasicMaterial()
  const layers = []
  const layerFactory = (options) => {
    const layer = new FakeRenderLayer(options)
    layers.push(layer)
    return layer
  }
  const slot = new ChunkRenderSlot({
    id: 4,
    scene,
    resources: {},
    renderParams: { chunkWidth: 64, heightScale: 2, scale: 1 },
    waterParams: { waterOffset: 8 },
    capacities: { blocks: {}, plants: 2 },
    sharedWaterGeometry,
    sharedWaterMaterial,
    onMeshCreated: () => {},
    blockLayerFactory: layerFactory,
    plantLayerFactory: layerFactory,
    ...overrides,
  })

  return {
    layers,
    scene,
    sharedWaterGeometry,
    sharedWaterMaterial,
    slot,
  }
}

function createChunk() {
  return {
    chunkX: 2,
    chunkZ: -1,
    container: { id: 'container' },
    generator: { plantData: [{ id: 'plant' }] },
  }
}

test('slot stays detached until attach and reset preserves identities', () => {
  const { scene, slot } = createSlot()
  const chunk = createChunk()

  slot.populate(chunk)
  assert.equal(slot.state, 'ready')
  assert.equal(scene.children.includes(slot.group), false)
  assert.equal(slot.chunkKey, '2,-1')

  slot.attach(2, -1)
  assert.equal(slot.state, 'active')
  assert.equal(slot.group.position.x, 128)
  assert.equal(slot.group.position.z, -64)

  const uuids = slot.getRenderObjects().map(object => object.uuid)
  slot.reset()
  assert.equal(slot.state, 'free')
  assert.equal(slot.chunkKey, null)
  assert.equal(scene.children.includes(slot.group), false)
  assert.deepEqual(
    slot.getRenderObjects().map(object => object.uuid),
    uuids,
  )
})

test('dummy prewarm state is reversible', () => {
  const { slot } = createSlot()
  const renderObjects = slot.getRenderObjects()
  renderObjects.at(-1).count = 0
  const initialCounts = renderObjects.map(object => object.count)
  const initialCulling = renderObjects.map(object => object.frustumCulled)

  slot.prepareForCompile()

  assert.equal(slot.state, 'compiling')
  assert.ok(renderObjects.every(object => object.count === undefined || object.count === 1))
  assert.ok(renderObjects.every(object => object.frustumCulled === false))
  const matrix = new THREE.Matrix4()
  renderObjects.filter(object => object.isInstancedMesh).forEach((object) => {
    object.getMatrixAt(0, matrix)
    assert.deepEqual(matrix.elements, new THREE.Matrix4().elements)
  })

  slot.finishCompile(3)

  assert.equal(slot.state, 'free')
  assert.equal(slot.materialEpoch, 3)
  assert.deepEqual(renderObjects.map(object => object.count), initialCounts)
  assert.deepEqual(renderObjects.map(object => object.frustumCulled), initialCulling)
})

test('late prewarm completion cannot rewrite a reset slot', () => {
  const { slot } = createSlot()
  const initialCulling = slot.getRenderObjects().map(object => object.frustumCulled)

  slot.prepareForCompile()
  slot.reset()
  const finished = slot.finishCompile(9)

  assert.equal(finished, false)
  assert.equal(slot.state, 'free')
  assert.equal(slot.materialEpoch, 0)
  assert.deepEqual(slot.getRenderObjects().map(object => object.frustumCulled), initialCulling)
})

test('populate failure leaves the detached slot resettable', () => {
  const { layers, scene, slot } = createSlot()
  layers[1].populate = () => {
    throw new Error('plant overflow')
  }

  assert.throws(() => slot.populate(createChunk()), /plant overflow/)
  assert.equal(slot.state, 'free')
  assert.equal(slot.chunkKey, null)
  assert.equal(scene.children.includes(slot.group), false)
  assert.deepEqual(layers.map(layer => layer.mesh.count), [0, 0])
})

test('water mesh reuses shared resources and slot disposal does not destroy them', () => {
  const { sharedWaterGeometry, sharedWaterMaterial, slot } = createSlot()
  const waterMesh = slot.waterMesh
  let geometryDisposed = false
  let materialDisposed = false
  sharedWaterGeometry.addEventListener('dispose', () => {
    geometryDisposed = true
  })
  sharedWaterMaterial.addEventListener('dispose', () => {
    materialDisposed = true
  })

  slot.populate(createChunk())

  assert.equal(waterMesh.geometry, sharedWaterGeometry)
  assert.equal(waterMesh.material, sharedWaterMaterial)
  assert.equal(waterMesh.position.y, 18.4)

  slot.dispose()

  assert.equal(geometryDisposed, false)
  assert.equal(materialDisposed, false)
})

test('block overflow replacement commits only after explicit transaction commit', () => {
  let blockLayer
  const blockLayerFactory = (options) => {
    blockLayer = new FakeReplaceableLayer(options, { layer: 'blocks', typeId: 7, typeName: 'grass' })
    blockLayer.parent = options.parent
    return blockLayer
  }
  const { scene, slot } = createSlot({ blockLayerFactory })
  slot.populate(createChunk())
  slot.attach(2, -1)
  const oldMesh = blockLayer.mesh
  const oldGeometry = oldMesh.geometry
  const material = oldMesh.material
  let oldMeshDisposed = false
  let oldGeometryDisposed = false
  oldMesh.addEventListener('dispose', () => {
    oldMeshDisposed = true
  })
  oldGeometry.addEventListener('dispose', () => {
    oldGeometryDisposed = true
  })

  const transaction = slot.replaceOverflowMesh({ layer: 'blocks', typeId: 'grass', required: 3 })

  assert.equal(transaction.capacity, 4)
  assert.equal(transaction.mesh.material, material)
  assert.notEqual(transaction.mesh.geometry, oldGeometry)
  assert.equal(transaction.mesh.geometry.getAttribute('aAo').count, 4)
  assert.equal(transaction.mesh.parent, null)
  assert.equal(blockLayer.mesh, oldMesh)
  assert.equal(slot.state, 'active')
  assert.equal(slot.chunkKey, '2,-1')
  assert.equal(scene.children.includes(slot.group), true)

  const oldRecord = transaction.commit()

  assert.equal(oldRecord.mesh, oldMesh)
  assert.equal(blockLayer.mesh, transaction.mesh)
  assert.equal(transaction.mesh.parent, slot.group)
  assert.equal(oldMeshDisposed, true)
  assert.equal(oldGeometryDisposed, true)
  transaction.dispose()
  assert.throws(() => transaction.commit(), /already committed/)
})

test('stale block overflow transaction disposes only its uninstalled resources', () => {
  let blockLayer
  const blockLayerFactory = (options) => {
    blockLayer = new FakeReplaceableLayer(options, { layer: 'blocks', typeId: 7, typeName: 'grass' })
    blockLayer.parent = options.parent
    return blockLayer
  }
  const { slot } = createSlot({ blockLayerFactory })
  const oldMesh = blockLayer.mesh
  const transaction = slot.replaceOverflowMesh({ layer: 'blocks', typeId: 'grass', required: 5 })
  let replacementDisposed = false
  let replacementGeometryDisposed = false
  let materialDisposed = false
  transaction.mesh.addEventListener('dispose', () => {
    replacementDisposed = true
  })
  transaction.mesh.geometry.addEventListener('dispose', () => {
    replacementGeometryDisposed = true
  })
  transaction.mesh.material.addEventListener('dispose', () => {
    materialDisposed = true
  })

  transaction.dispose()
  transaction.dispose()

  assert.equal(replacementDisposed, true)
  assert.equal(replacementGeometryDisposed, true)
  assert.equal(materialDisposed, false)
  assert.equal(blockLayer.mesh, oldMesh)
  assert.equal(slot.state, 'free')
  assert.equal(slot.chunkKey, null)
})

test('stale plant overflow transaction preserves shared geometry and material', () => {
  let plantLayer
  const plantLayerFactory = (options) => {
    plantLayer = new FakeReplaceableLayer(options, { layer: 'plants', typeId: 11, typeName: 'short_grass' })
    plantLayer.parent = options.parent
    return plantLayer
  }
  const { slot } = createSlot({ plantLayerFactory })
  const sharedGeometry = plantLayer.mesh.geometry
  const sharedMaterial = plantLayer.mesh.material
  const transaction = slot.replaceOverflowMesh({ layer: 'plants', typeId: 'short_grass', required: 3 })
  let geometryDisposed = false
  let materialDisposed = false
  sharedGeometry.addEventListener('dispose', () => {
    geometryDisposed = true
  })
  sharedMaterial.addEventListener('dispose', () => {
    materialDisposed = true
  })

  transaction.dispose()

  assert.equal(transaction.capacity, 4)
  assert.equal(transaction.mesh.geometry, sharedGeometry)
  assert.equal(transaction.mesh.material, sharedMaterial)
  assert.equal(geometryDisposed, false)
  assert.equal(materialDisposed, false)
  assert.equal(plantLayer.mesh.parent, slot.group)
})
