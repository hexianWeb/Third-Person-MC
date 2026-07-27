export const CHUNK_RENDER_VIEW_DISTANCE = 1
export const ACTIVE_SLOT_COUNT = 9
export const STAGING_SLOT_COUNT = 5
export const TOTAL_SLOT_COUNT = 14

export const BLOCK_INSTANCE_CAPACITY = Object.freeze({
  grass: 4096,
  dirt: 4096,
  stone: 8192,
  coalOre: 512,
  ironOre: 512,
  treeTrunk: 1024,
  treeLeaves: 4096,
  sand: 4096,
  birchTrunk: 1024,
  birchLeaves: 4096,
  cherryTrunk: 1024,
  cherryLeaves: 4096,
  cactus: 1024,
  terracotta: 4096,
  redSand: 4096,
  ice: 4096,
  packedIce: 4096,
  snow: 4096,
  gravel: 4096,
  // 合成系统：玩家放置方块（容量按树干量级）
  oakPlanks: 1024,
  craftingTable: 1024,
  // 群系丰富化：蓝冰（冰刺核心，少量）与陶瓦变体（恶地条纹层，按地表量级）
  blueIce: 1024,
  redTerracotta: 4096,
  whiteTerracotta: 4096,
  orangeTerracotta: 4096,
})

export const PLANT_INSTANCE_CAPACITY = 512
// 14 slots × (Σ blockCap × 68B + plantCap × 64B + waterMesh 4096 × 64B)
export const FIXED_INSTANCE_BUFFER_BYTES = 78217216

/**
 * 检查区块视距是否符合固定渲染策略。
 * @param {number} value 区块视距
 * @returns {boolean} 是否受支持
 */
export function isSupportedChunkViewDistance(value) {
  return value === CHUNK_RENDER_VIEW_DISTANCE
}
