/** 旱厕地标与蜗牛交互的稳定配置参数 */
export const DRY_TOILET_SNAILS_CONFIG = {
  resourceName: 'cesuoModel',
  // 地标世界中心（方块格）
  center: { x: 32, z: 32 },
  // 2×2 底座脚印（覆盖 center 与其 -1 邻格）
  footprint: [
    { x: 31, z: 31 },
    { x: 31, z: 32 },
    { x: 32, z: 31 },
    { x: 32, z: 32 },
  ],
  targetBaseSize: 2,
  snailCount: 12,
  activityRadiusMin: 3,
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
