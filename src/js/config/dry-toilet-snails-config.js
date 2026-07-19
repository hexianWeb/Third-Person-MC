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

/** 旱厕地标与蜗牛交互的稳定配置参数 */
export const DRY_TOILET_SNAILS_CONFIG = {
  resourceName: 'cesuoModel',
  // 地标世界中心（方块格）
  center: CENTER,
  // 底座边长（方块数）与脚印
  platformSize: PLATFORM_SIZE,
  footprint: buildFootprint(CENTER, PLATFORM_SIZE),
  // 模型最长底边缩放到该格数
  targetBaseSize: PLATFORM_SIZE,
  // 蜗牛数量：确定性落在 [min, max]
  snailCountMin: 3,
  snailCountMax: 5,
  activityRadiusMin: 4,
  activityRadiusMax: 10,
  clickDistance: 6,
  snailLengthMin: 0.7,
  snailLengthMax: 0.9,
  snailMaxHeight: 0.45,
  crawlSpeed: 0.35,
  turnNoiseInterval: 1.2,
  turnNoiseRadians: 0.35,
  maxStepHeight: 1,
  rngSalt: 90421,
  retractMs: 700,
  holdMs: 1600,
  emergeMs: 700,
  // 参考体素蜗牛未缩放本地长度（腹足+头部），用于映射到 snailLength*
  snailRefLocalLength: 14,
}
