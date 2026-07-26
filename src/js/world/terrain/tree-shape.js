/**
 * Vanilla-like small tree shapes: layered leaf disks around a single trunk.
 * Pure placement helpers — no Experience / Three.js dependency.
 */

/** Shared oak-style canopy used by oak and birch. */
const OAK_LEAF_LAYERS = [
  { dy: -2, radius: 2 },
  { dy: -1, radius: 2 },
  { dy: 0, radius: 1 },
  { dy: 1, radius: 1 },
  { dy: 2, radius: 0 },
]

const SHAPE_PROFILES = {
  oak: {
    leafLayers: OAK_LEAF_LAYERS,
    cornerSkipChance: 0.35,
    /** Trunk blocks strictly below the lowest leaf layer. */
    minExposedTrunk: 2,
  },
  birch: {
    leafLayers: OAK_LEAF_LAYERS,
    cornerSkipChance: 0.35,
    minExposedTrunk: 2,
  },
  cherry: {
    leafLayers: [
      { dy: -2, radius: 2 },
      { dy: -1, radius: 2 },
      { dy: 0, radius: 2 },
      { dy: 1, radius: 1 },
      { dy: 2, radius: 0 },
    ],
    cornerSkipChance: 0.3,
    minExposedTrunk: 2,
  },
}

/**
 * @param {[number, number]} range
 * @param {{ random: () => number }} rng
 */
function randomIntInRange(range, rng) {
  const [min, max] = range
  if (max <= min)
    return min
  return Math.floor(rng.random() * (max - min + 1)) + min
}

/**
 * Lowest leaf dy is negative; exposed trunk count is `trunkHeight - 1 + minLeafDy`.
 * @param {object} profile
 * @returns {number}
 */
function minimumTrunkHeight(profile) {
  const minLeafDy = Math.min(...profile.leafLayers.map(layer => layer.dy))
  const minExposed = profile.minExposedTrunk ?? 0
  return Math.max(1, minExposed - minLeafDy + 1)
}

/**
 * @param {object} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} id
 * @param {'trunk' | 'leaves'} kind
 * @param {{ trunkBlocks: number, leavesBlocks: number }} stats
 */
function trySet(ctx, x, y, z, id, kind, stats) {
  const { width, height } = ctx.bounds
  if (x < 0 || x >= width || z < 0 || z >= width || y < 0 || y >= height)
    return false
  if (ctx.getBlockId(x, y, z) !== ctx.emptyId)
    return false
  ctx.setBlockId(x, y, z, id)
  if (kind === 'trunk')
    stats.trunkBlocks++
  else
    stats.leavesBlocks++
  return true
}

/**
 * @param {object} ctx
 * @param {number} trunkHeight
 * @param {{ trunkBlocks: number, leavesBlocks: number }} stats
 */
function placeTrunkColumn(ctx, trunkHeight, stats) {
  for (let i = 0; i < trunkHeight; i++)
    trySet(ctx, ctx.x, ctx.baseY + i, ctx.z, ctx.trunkBlock, 'trunk', stats)
}

/**
 * @param {object} ctx
 * @param {number} topY
 * @param {object} profile
 * @param {{ trunkBlocks: number, leavesBlocks: number }} stats
 */
function placeLeafLayers(ctx, topY, profile, stats) {
  for (const layer of profile.leafLayers) {
    const y = topY + layer.dy
    const radius = layer.radius

    if (radius === 0) {
      trySet(ctx, ctx.x, y, ctx.z, ctx.leavesBlock, 'leaves', stats)
      continue
    }

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const isCorner = Math.abs(dx) === radius && Math.abs(dz) === radius
        if (isCorner && ctx.rng.random() < profile.cornerSkipChance)
          continue
        trySet(ctx, ctx.x + dx, y, ctx.z + dz, ctx.leavesBlock, 'leaves', stats)
      }
    }
  }
}

/**
 * Place a small tree / cactus using a named shape template.
 *
 * @param {'oak' | 'birch' | 'cherry' | 'none'} shape
 * @param {{
 *   setBlockId: (x: number, y: number, z: number, id: number) => void,
 *   getBlockId: (x: number, y: number, z: number) => number,
 *   emptyId: number,
 *   x: number,
 *   baseY: number,
 *   z: number,
 *   trunkBlock: number,
 *   leavesBlock?: number | null,
 *   heightRange: [number, number],
 *   rng: { random: () => number },
 *   bounds: { width: number, height: number },
 * }} ctx
 * @returns {{ trunkBlocks: number, leavesBlocks: number }} placed block counts
 */
export function placeTree(shape, ctx) {
  const stats = { trunkBlocks: 0, leavesBlocks: 0 }
  let trunkHeight = randomIntInRange(ctx.heightRange, ctx.rng)
  if (trunkHeight <= 0)
    return stats

  const profile = shape === 'none' || !ctx.leavesBlock
    ? null
    : SHAPE_PROFILES[shape]

  if (profile)
    trunkHeight = Math.max(trunkHeight, minimumTrunkHeight(profile))

  placeTrunkColumn(ctx, trunkHeight, stats)

  if (!profile)
    return stats

  const topY = ctx.baseY + trunkHeight - 1
  placeLeafLayers(ctx, topY, profile, stats)
  return stats
}
