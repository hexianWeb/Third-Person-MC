import assert from 'node:assert/strict'
import test from 'node:test'

import { RNG } from '../../src/js/tools/rng.js'
import { placeTree } from '../../src/js/world/terrain/tree-shape.js'

const EMPTY = 0
const TRUNK = 1
const LEAVES = 2

function createVolume(width, height) {
  const data = Array.from({ length: width }, () =>
    Array.from({ length: height }, () => Array.from({ length: width }, () => EMPTY)))

  return {
    width,
    height,
    getBlockId(x, y, z) {
      if (x < 0 || x >= width || z < 0 || z >= width || y < 0 || y >= height)
        return EMPTY
      return data[x][y][z]
    },
    setBlockId(x, y, z, id) {
      if (x < 0 || x >= width || z < 0 || z >= width || y < 0 || y >= height)
        return
      data[x][y][z] = id
    },
    collect(id) {
      const cells = []
      for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
          for (let z = 0; z < width; z++) {
            if (data[x][y][z] === id)
              cells.push({ x, y, z })
          }
        }
      }
      return cells
    },
  }
}

function place(shape, options = {}) {
  const width = options.width ?? 32
  const height = options.height ?? 32
  const volume = createVolume(width, height)
  const x = options.x ?? 16
  const z = options.z ?? 16
  const baseY = options.baseY ?? 4
  const rng = new RNG(options.seed ?? 42)
  const stats = placeTree(shape, {
    setBlockId: (px, py, pz, id) => volume.setBlockId(px, py, pz, id),
    getBlockId: (px, py, pz) => volume.getBlockId(px, py, pz),
    emptyId: EMPTY,
    x,
    baseY,
    z,
    trunkBlock: TRUNK,
    leavesBlock: LEAVES,
    heightRange: options.heightRange ?? [4, 6],
    rng,
    bounds: { width, height },
  })
  return { volume, x, z, baseY, stats }
}

function maxChebyshev(cells, originX, originZ) {
  let max = 0
  for (const cell of cells)
    max = Math.max(max, Math.max(Math.abs(cell.x - originX), Math.abs(cell.z - originZ)))
  return max
}

function leafYSpan(leaves) {
  if (leaves.length === 0)
    return 0
  const ys = leaves.map(cell => cell.y)
  return Math.max(...ys) - Math.min(...ys) + 1
}

function exposedTrunkCount(volume, x, z, baseY) {
  const leaves = volume.collect(LEAVES)
  const lowestLeafY = Math.min(...leaves.map(cell => cell.y))
  let exposed = 0
  for (let y = baseY; y < lowestLeafY; y++) {
    if (volume.getBlockId(x, y, z) === TRUNK)
      exposed++
  }
  return exposed
}

test('oak places a contiguous vertical trunk and layered square leaf disks', () => {
  const { volume, x, z, baseY, stats } = place('oak', {
    seed: 7,
    heightRange: [5, 5],
  })

  assert.equal(stats.trunkBlocks, 5)
  for (let y = baseY; y < baseY + 5; y++)
    assert.equal(volume.getBlockId(x, y, z), TRUNK)

  const leaves = volume.collect(LEAVES)
  assert.ok(leaves.length > 0)
  assert.equal(stats.leavesBlocks, leaves.length)

  const leafYs = [...new Set(leaves.map(cell => cell.y))].sort((a, b) => a - b)
  assert.ok(leafYs.length >= 2, 'oak leaves should span multiple layers')

  const footprint = maxChebyshev(leaves, x, z)
  assert.ok(footprint >= 2, 'oak lower disks should reach radius 2')
  assert.ok(leafYSpan(leaves) <= 5, 'oak leaf height should stay layered, not a tall sphere')

  let hasSquareLayer = false
  for (const y of leafYs) {
    const layer = leaves.filter(cell => cell.y === y)
    const radius = maxChebyshev(layer, x, z)
    if (radius < 1)
      continue
    const expectedMin = (2 * radius + 1) ** 2 - 4
    if (layer.length >= expectedMin) {
      hasSquareLayer = true
      break
    }
  }
  assert.ok(hasSquareLayer, 'oak should keep at least one square leaf disk')
})

test('oak keeps at least two trunk blocks below the canopy', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const { volume, x, z, baseY, stats } = place('oak', {
      seed,
      heightRange: [4, 4],
    })
    // Config may ask for 4, but oak clamps so two logs stay under leaves.
    assert.ok(stats.trunkBlocks >= 5)
    assert.ok(exposedTrunkCount(volume, x, z, baseY) >= 2)
  }
})

test('birch uses the same oak-style leaf footprint', () => {
  const oak = place('oak', { seed: 11, heightRange: [6, 6] })
  const birch = place('birch', { seed: 11, heightRange: [7, 7] })

  for (let y = birch.baseY; y < birch.baseY + 7; y++)
    assert.equal(birch.volume.getBlockId(birch.x, y, birch.z), TRUNK)

  const oakRadius = maxChebyshev(oak.volume.collect(LEAVES), oak.x, oak.z)
  const birchRadius = maxChebyshev(birch.volume.collect(LEAVES), birch.x, birch.z)
  assert.equal(birchRadius, oakRadius)
  assert.ok(birchRadius >= 2, 'birch should match oak canopy width')
})

test('leafy trees never place side branches', () => {
  for (const shape of ['oak', 'birch', 'cherry']) {
    for (let seed = 0; seed < 40; seed++) {
      const { volume, x, z } = place(shape, {
        seed,
        heightRange: [5, 5],
      })
      const trunks = volume.collect(TRUNK)
      assert.ok(trunks.every(cell => cell.x === x && cell.z === z))
    }
  }
})

test('none shape writes trunk only', () => {
  const { volume, stats } = place('none', {
    seed: 3,
    heightRange: [2, 2],
  })
  assert.equal(stats.trunkBlocks, 2)
  assert.equal(stats.leavesBlocks, 0)
  assert.equal(volume.collect(LEAVES).length, 0)
  assert.equal(volume.collect(TRUNK).length, 2)
})

test('placement near chunk edge does not write out of bounds or throw', () => {
  assert.doesNotThrow(() => {
    const { volume, stats } = place('oak', {
      seed: 99,
      x: 0,
      z: 0,
      width: 16,
      height: 24,
      heightRange: [5, 5],
    })
    assert.ok(stats.trunkBlocks > 0)
    assert.equal(
      volume.collect(TRUNK).length + volume.collect(LEAVES).length,
      stats.trunkBlocks + stats.leavesBlocks,
    )
  })
})
