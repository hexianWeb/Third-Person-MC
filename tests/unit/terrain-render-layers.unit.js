import assert from 'node:assert/strict'
import test from 'node:test'

import * as THREE from 'three'

import { blocks, PLANT_IDS } from '../../src/js/world/terrain/blocks-config.js'
import ChunkRenderCapacityError from '../../src/js/world/terrain/chunk-render-capacity-error.js'
import PlantRenderer from '../../src/js/world/terrain/plant-renderer.js'
import TerrainContainer from '../../src/js/world/terrain/terrain-container.js'
import TerrainRenderer from '../../src/js/world/terrain/terrain-renderer.js'

function createBlockRenderer(capacities = { grass: 2 }) {
  return new TerrainRenderer({
    parent: new THREE.Group(),
    resources: {},
    params: {
      scale: 1,
      heightScale: 1,
      showOresOnly: false,
    },
    capacities,
    materialFactory: () => new THREE.MeshBasicMaterial(),
  })
}

function createPlantRenderer(capacity = 2) {
  return new PlantRenderer({
    parent: new THREE.Group(),
    resources: {},
    params: {
      scale: 1,
      heightScale: 1,
    },
    capacity,
    materialFactory: () => new THREE.MeshBasicMaterial(),
  })
}

function createGrassContainer(positions) {
  const container = new TerrainContainer({ width: 4, height: 2 }, { useSingleton: false })
  positions.forEach(({ x, y = 0, z = 0 }) => {
    container.setBlockId(x, y, z, blocks.grass.id)
  })
  return container
}

test('block renderer reuses mesh identity across populate calls', () => {
  const renderer = createBlockRenderer()
  const firstContainer = createGrassContainer([{ x: 0 }])
  const secondContainer = createGrassContainer([{ x: 1 }])
  const firstUuid = renderer.getMesh(blocks.grass.id).uuid

  renderer.populate(firstContainer)
  renderer.reset(firstContainer)
  renderer.populate(secondContainer)

  assert.equal(renderer.getMesh(blocks.grass.id).uuid, firstUuid)
})

test('block renderer reports overflow before mutating counts', () => {
  const renderer = createBlockRenderer()
  const containerWithThreeGrassBlocks = createGrassContainer([{ x: 0 }, { x: 1 }, { x: 2 }])

  assert.throws(
    () => renderer.populate(containerWithThreeGrassBlocks),
    error =>
      error instanceof ChunkRenderCapacityError
      && error.layer === 'blocks'
      && error.required === 3
      && error.capacity === 2,
  )
  assert.equal(renderer.getMesh(blocks.grass.id).count, 0)
})

test('plant renderer reuses identity and clears old counts', () => {
  const plantRenderer = createPlantRenderer()
  const uuid = plantRenderer.getMeshes()[0].uuid

  plantRenderer.populate([{ x: 0, y: 1, z: 0, plantId: PLANT_IDS.SHORT_GRASS }])
  plantRenderer.reset()
  plantRenderer.populate([])

  assert.equal(plantRenderer.getMeshes()[0].uuid, uuid)
  assert.equal(plantRenderer.getMeshes()[0].count, 0)
})

test('block renderer commits a compiled replacement and retires its old slot resources', () => {
  const parent = new THREE.Group()
  const createdMeshes = []
  const sharedMaterial = new THREE.MeshBasicMaterial()
  const renderer = new TerrainRenderer({
    parent,
    resources: {},
    params: { scale: 1, heightScale: 1, showOresOnly: false },
    capacities: { grass: 2 },
    materialFactory: () => sharedMaterial,
    onMeshCreated: mesh => createdMeshes.push(mesh),
  })
  const oldMesh = renderer.getMesh(blocks.grass.id)
  const replacement = new THREE.InstancedMesh(new THREE.BoxGeometry(), sharedMaterial, 3)
  let oldMeshDisposed = false
  let oldGeometryDisposed = false
  let materialDisposed = false
  oldMesh.addEventListener('dispose', () => {
    oldMeshDisposed = true
  })
  oldMesh.geometry.addEventListener('dispose', () => {
    oldGeometryDisposed = true
  })
  sharedMaterial.addEventListener('dispose', () => {
    materialDisposed = true
  })

  const oldRecord = renderer.replaceMesh(blocks.grass.id, replacement, 3)

  assert.equal(oldRecord.mesh, oldMesh)
  assert.equal(renderer.getMesh(blocks.grass.id), replacement)
  assert.equal(parent.children.includes(oldMesh), false)
  assert.equal(parent.children.includes(replacement), true)
  assert.equal(replacement.count, 0)
  assert.equal(replacement.instanceMatrix.usage, THREE.DynamicDrawUsage)
  assert.deepEqual(replacement.userData.instanceToGrid, [])
  assert.equal(createdMeshes.at(-1), replacement)
  assert.equal(oldMeshDisposed, true)
  assert.equal(oldGeometryDisposed, true)
  assert.equal(materialDisposed, false)
})

test('plant renderer replacement does not dispose shared geometry or materials', () => {
  const parent = new THREE.Group()
  const renderer = new PlantRenderer({
    parent,
    resources: {},
    params: { scale: 1, heightScale: 1 },
    capacity: 2,
    materialFactory: () => new THREE.MeshBasicMaterial(),
  })
  const oldMesh = renderer.getMeshes()[0]
  const geometry = oldMesh.geometry
  const material = oldMesh.material
  const replacement = new THREE.InstancedMesh(geometry, material, 3)
  let oldMeshDisposed = false
  let geometryDisposed = false
  let materialDisposed = false
  oldMesh.addEventListener('dispose', () => {
    oldMeshDisposed = true
  })
  geometry.addEventListener('dispose', () => {
    geometryDisposed = true
  })
  material.addEventListener('dispose', () => {
    materialDisposed = true
  })

  renderer.replaceMesh(oldMesh.userData.plantId, replacement, 3)

  assert.equal(oldMeshDisposed, true)
  assert.equal(geometryDisposed, false)
  assert.equal(materialDisposed, false)
})

test('block renderer rolls back a replacement when its commit callback fails', () => {
  const parent = new THREE.Group()
  let replacement
  const renderer = new TerrainRenderer({
    parent,
    resources: {},
    params: { scale: 1, heightScale: 1, showOresOnly: false },
    capacities: { grass: 2 },
    materialFactory: () => new THREE.MeshBasicMaterial(),
    onMeshCreated: (mesh) => {
      if (mesh === replacement)
        throw new Error('registry rejected replacement')
    },
  })
  const oldMesh = renderer.getMesh(blocks.grass.id)
  replacement = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 2)
  let oldMeshDisposed = false
  oldMesh.addEventListener('dispose', () => {
    oldMeshDisposed = true
  })

  assert.throws(() => renderer.replaceMesh(blocks.grass.id, replacement, 2), /registry rejected replacement/)
  assert.equal(renderer.getMesh(blocks.grass.id), oldMesh)
  assert.equal(parent.children.includes(oldMesh), true)
  assert.equal(parent.children.includes(replacement), false)
  assert.equal(oldMeshDisposed, false)
})
