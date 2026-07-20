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
  clickDistance: 4,
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
}
