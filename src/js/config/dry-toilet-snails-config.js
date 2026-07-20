/** 根据中心与边长生成整数脚印列 */
function buildFootprint(center, size) {
  const startX = center.x - size / 2
  const startZ = center.z - size / 2
  const cells = []
  for (let x = startX; x < startX + size; x++) {
    for (let z = startZ; z < startZ + size; z++)
      cells.push({ x, z })
  }
  return cells
}

const CENTER = { x: 32, z: 32 }
const PLATFORM_SIZE = 4

/** 旱厕地标与蜗牛交互配置（蜗牛模型：models/snail.glb） */
export const DRY_TOILET_SNAILS_CONFIG = {
  resourceName: 'cesuoModel',
  snailResourceName: 'snailModel',
  center: CENTER,
  platformSize: PLATFORM_SIZE,
  footprint: buildFootprint(CENTER, PLATFORM_SIZE),
  targetBaseSize: PLATFORM_SIZE,
  // 准星射线交互距离（玩家到蜗牛）
  clickDistance: 6,
  // 不可见点击球半径 = max(min, length * factor)；略大于视觉体便于点中
  clickHitRadiusMin: 0.4,
  clickHitRadiusFactor: 0.75,
  crawlSpeed: 0.12,
  // 数量固定 10（见 getSnailSpawnPoints）
  snailLengthMin: 0.5,
  snailLengthMax: 1.0,
  // 简易转向噪声（目标角 + lerp，规律可见可接受）
  turnNoiseInterval: 1.5,
  turnNoiseRadians: 0.5,
  turnLerpSpeed: 4,
  retractMs: 700,
  holdMs: 1600,
  emergeMs: 700,
  // snail.glb 未缩放本地长度
  snailRefLocalLength: 14,
  // 手持蜗牛模型统一缩放（与世界体长解耦；约 0.12 ≈ 手中清晰可见）
  heldSnailModelScale: 0.05,
}
