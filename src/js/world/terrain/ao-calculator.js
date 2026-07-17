/**
 * Top-Column AO (Ambient Occlusion) Calculator
 * Simplified AO: each block has ONE AO value based on Y+1 layer occlusion.
 *
 * Algorithm: Axis-first + Corner supplement
 * - Check 4 axis neighbors at Y+1 layer first
 * - If occlusion < 3, check 4 corner neighbors
 * - AO value: 0 (bright) to 3 (darkest)
 */
import { blocks } from './blocks-config.js'

// id -> 方块配置查找表
// 热路径（每个可见方块 8 次邻居检查）中禁止 Object.values().find：
// 每次调用都会分配新数组并线性查找，一个 chunk 累计上百万次
const BLOCK_BY_ID = Object.values(blocks).reduce((map, item) => {
  map[item.id] = item
  return map
}, {})

/**
 * Check if a block at the given position is solid (causes occlusion)
 * @param {object} container - TerrainContainer instance
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} z - Z coordinate
 * @returns {boolean} True if block is solid and causes occlusion
 */
function isSolid(container, x, y, z) {
  const block = container.getBlock(x, y, z)
  // Empty blocks are not solid
  if (block.id === blocks.empty.id)
    return false
  // Transparent blocks (leaves, etc.) don't occlude
  if (BLOCK_BY_ID[block.id]?.transparent)
    return false
  return true
}

/**
 * Compute AO for a single block using Top-Column algorithm
 * @param {object} container - TerrainContainer instance
 * @param {number} x - Block X coordinate
 * @param {number} y - Block Y coordinate
 * @param {number} z - Block Z coordinate
 * @returns {number} AO value (0-3), where 0 = bright, 3 = darkest
 */
export function computeBlockAO(container, x, y, z) {
  let occ = 0
  const oy = y + 1

  // 1. Axis-first: check 4 axis neighbors at Y+1 (highest hit rate)
  if (isSolid(container, x + 1, oy, z))
    occ++
  if (isSolid(container, x - 1, oy, z))
    occ++
  if (isSolid(container, x, oy, z + 1))
    occ++
  if (isSolid(container, x, oy, z - 1))
    occ++

  // 2. Corner supplement: only check diagonals if occlusion < 3
  if (occ < 3) {
    if (isSolid(container, x + 1, oy, z + 1))
      occ++
    if (occ < 3 && isSolid(container, x - 1, oy, z + 1))
      occ++
    if (occ < 3 && isSolid(container, x + 1, oy, z - 1))
      occ++
    if (occ < 3 && isSolid(container, x - 1, oy, z - 1))
      occ++
  }

  return Math.min(3, occ)
}

/**
 * Compute AO for all visible blocks in a container
 * @param {object} container - TerrainContainer instance
 */
export function computeAllBlocksAO(container) {
  container.forEachFilled((block, x, y, z) => {
    // Skip obscured blocks (not visible)
    if (container.isBlockObscured(x, y, z)) {
      block.ao = null
      return
    }

    // Skip transparent blocks (leaves, plants, etc.)
    if (BLOCK_BY_ID[block.id]?.transparent) {
      block.ao = null
      return
    }

    // Compute single AO value (0-3)
    block.ao = computeBlockAO(container, x, y, z)
  })
}
