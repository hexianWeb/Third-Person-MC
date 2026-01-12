/**
 * AO (Ambient Occlusion) Calculator
 * Calculates per-face AO values for voxel terrain blocks
 * Based on 0fps algorithm: https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/
 */
import { blocks } from './blocks-config.js'

/**
 * Face direction indices (matches shader attribute order)
 * [+X, -X, +Y, -Y, +Z, -Z]
 */
export const FACE_INDICES = {
  PX: 0, // +X (right)
  NX: 1, // -X (left)
  PY: 2, // +Y (top)
  NY: 3, // -Y (bottom)
  PZ: 4, // +Z (front)
  NZ: 5, // -Z (back)
}

/**
 * Calculate vertex AO using 0fps algorithm
 * @param {boolean} side1 - Is side neighbor 1 solid?
 * @param {boolean} side2 - Is side neighbor 2 solid?
 * @param {boolean} corner - Is corner neighbor solid?
 * @returns {number} AO value (0=darkest, 3=brightest)
 */
function vertexAO(side1, side2, corner) {
  if (side1 && side2)
    return 0
  return 3 - (side1 + side2 + corner)
}

/**
 * Check if a block is solid (non-empty and non-transparent)
 * @param {object} container - TerrainContainer instance
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} z - Z coordinate
 * @returns {boolean} True if block is solid
 */
function isSolid(container, x, y, z) {
  const block = container.getBlock(x, y, z)
  // Empty blocks are not solid
  if (block.id === blocks.empty.id)
    return false
  // Transparent blocks (leaves, etc.) don't occlude
  const blockConfig = Object.values(blocks).find(b => b.id === block.id)
  if (blockConfig?.transparent)
    return false
  return true
}

/**
 * Calculate AO for a single vertex of a face
 * @param {object} container - TerrainContainer instance
 * @param {number} x - Block X coordinate
 * @param {number} y - Block Y coordinate
 * @param {number} z - Block Z coordinate
 * @param {string} face - Face direction ('px', 'nx', 'py', 'ny', 'pz', 'nz')
 * @param {number} corner - Corner index (0-3)
 * @returns {number} AO value (0-3)
 */
function computeVertexAO(container, x, y, z, face, corner) {
  // Define neighbor offsets for each face and corner
  // For each face, we need to check 3 neighbors: side1, side2, corner
  const offsets = getFaceCornerOffsets(face, corner)

  const side1 = isSolid(container, x + offsets.side1[0], y + offsets.side1[1], z + offsets.side1[2])
  const side2 = isSolid(container, x + offsets.side2[0], y + offsets.side2[1], z + offsets.side2[2])
  const cornerSolid = isSolid(container, x + offsets.corner[0], y + offsets.corner[1], z + offsets.corner[2])

  return vertexAO(side1, side2, cornerSolid)
}

/**
 * Get neighbor offsets for a face corner
 * Each face has 4 corners, each corner needs 3 neighbors (side1, side2, corner)
 * @param {string} face - Face direction
 * @param {number} corner - Corner index (0-3)
 * @returns {{ side1: number[], side2: number[], corner: number[] }}
 */
function getFaceCornerOffsets(face, corner) {
  // Neighbor offset tables for each face
  // Corners are numbered 0-3 going around the face
  const tables = {
    // +X face: check neighbors at x+1
    px: [
      { side1: [1, 0, 1], side2: [1, 1, 0], corner: [1, 1, 1] }, // corner 0
      { side1: [1, 0, -1], side2: [1, 1, 0], corner: [1, 1, -1] }, // corner 1
      { side1: [1, 0, -1], side2: [1, -1, 0], corner: [1, -1, -1] }, // corner 2
      { side1: [1, 0, 1], side2: [1, -1, 0], corner: [1, -1, 1] }, // corner 3
    ],
    // -X face: check neighbors at x-1
    nx: [
      { side1: [-1, 0, -1], side2: [-1, 1, 0], corner: [-1, 1, -1] },
      { side1: [-1, 0, 1], side2: [-1, 1, 0], corner: [-1, 1, 1] },
      { side1: [-1, 0, 1], side2: [-1, -1, 0], corner: [-1, -1, 1] },
      { side1: [-1, 0, -1], side2: [-1, -1, 0], corner: [-1, -1, -1] },
    ],
    // +Y face: check neighbors at y+1
    py: [
      { side1: [0, 1, 1], side2: [1, 1, 0], corner: [1, 1, 1] },
      { side1: [0, 1, 1], side2: [-1, 1, 0], corner: [-1, 1, 1] },
      { side1: [0, 1, -1], side2: [-1, 1, 0], corner: [-1, 1, -1] },
      { side1: [0, 1, -1], side2: [1, 1, 0], corner: [1, 1, -1] },
    ],
    // -Y face: check neighbors at y-1
    ny: [
      { side1: [0, -1, -1], side2: [1, -1, 0], corner: [1, -1, -1] },
      { side1: [0, -1, -1], side2: [-1, -1, 0], corner: [-1, -1, -1] },
      { side1: [0, -1, 1], side2: [-1, -1, 0], corner: [-1, -1, 1] },
      { side1: [0, -1, 1], side2: [1, -1, 0], corner: [1, -1, 1] },
    ],
    // +Z face: check neighbors at z+1
    pz: [
      { side1: [-1, 0, 1], side2: [0, 1, 1], corner: [-1, 1, 1] },
      { side1: [1, 0, 1], side2: [0, 1, 1], corner: [1, 1, 1] },
      { side1: [1, 0, 1], side2: [0, -1, 1], corner: [1, -1, 1] },
      { side1: [-1, 0, 1], side2: [0, -1, 1], corner: [-1, -1, 1] },
    ],
    // -Z face: check neighbors at z-1
    nz: [
      { side1: [1, 0, -1], side2: [0, 1, -1], corner: [1, 1, -1] },
      { side1: [-1, 0, -1], side2: [0, 1, -1], corner: [-1, 1, -1] },
      { side1: [-1, 0, -1], side2: [0, -1, -1], corner: [-1, -1, -1] },
      { side1: [1, 0, -1], side2: [0, -1, -1], corner: [1, -1, -1] },
    ],
  }

  return tables[face][corner]
}

/**
 * Compute average face AO from 4 vertex AO values
 * @param {object} container - TerrainContainer instance
 * @param {number} x - Block X coordinate
 * @param {number} y - Block Y coordinate
 * @param {number} z - Block Z coordinate
 * @param {string} face - Face direction
 * @returns {number} Average AO value (0-3)
 */
function computeFaceAO(container, x, y, z, face) {
  let sum = 0
  for (let corner = 0; corner < 4; corner++) {
    sum += computeVertexAO(container, x, y, z, face, corner)
  }
  return sum / 4
}

/**
 * Compute AO for all 6 faces of a block
 * @param {object} container - TerrainContainer instance
 * @param {number} x - Block X coordinate
 * @param {number} y - Block Y coordinate
 * @param {number} z - Block Z coordinate
 * @returns {Uint8Array} AO values for 6 faces [+X, -X, +Y, -Y, +Z, -Z]
 */
export function computeBlockAO(container, x, y, z) {
  const ao = new Uint8Array(6)

  const faces = ['px', 'nx', 'py', 'ny', 'pz', 'nz']
  faces.forEach((face, index) => {
    // Multiply by 85 to map 0-3 to 0-255 range (85 * 3 = 255)
    // This gives us better precision when stored as Uint8
    ao[index] = Math.round(computeFaceAO(container, x, y, z, face) * 85)
  })

  return ao
}

/**
 * Compute AO for all visible blocks in a container
 * @param {object} container - TerrainContainer instance
 */
export function computeAllBlocksAO(container) {
  container.forEachFilled((block, x, y, z) => {
    // Skip obscured blocks
    if (container.isBlockObscured(x, y, z)) {
      block.ao = null
      return
    }

    // Skip transparent blocks (leaves, plants, etc.)
    const blockConfig = Object.values(blocks).find(b => b.id === block.id)
    if (blockConfig?.transparent) {
      block.ao = null
      return
    }

    block.ao = computeBlockAO(container, x, y, z)
  })
}
