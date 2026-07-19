/** 旱厕地标与蜗牛相关的纯数学/逻辑辅助函数（无 Three.js 依赖） */

export const SNAIL_STATES = {
  CRAWLING: 'CRAWLING',
  RETRACTING: 'RETRACTING',
  RETRACTED: 'RETRACTED',
  EMERGING: 'EMERGING',
}

/**
 * 校验 AABB 尺寸是否有效（各轴均为有限正数）
 * @param {{ x?: number, y?: number, z?: number }} size
 * @returns {boolean}
 */
export function isValidAabbSize(size) {
  if (!size || typeof size !== 'object')
    return false

  for (const axis of ['x', 'y', 'z']) {
    const value = size[axis]
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0)
      return false
  }

  return true
}

/**
 * 根据未变换 AABB 尺寸计算等比缩放与偏移，使最长 X/Z 边适配 targetBaseSize，
 * X/Z 中心对齐世界原点，缩放后 minY 抬至 0（调用方再叠加 platformTopY）
 * @param {{ x: number, y: number, z: number }} size
 * @param {number} [targetBaseSize]
 * @returns {{ scale: number, offset: { x: number, y: number, z: number } }}
 */
export function computeToiletFitTransform(size, targetBaseSize = 2) {
  const longestXZ = Math.max(size.x, size.z)
  const scale = targetBaseSize / longestXZ
  const scaledY = size.y * scale

  return {
    scale,
    offset: {
      x: 0,
      y: scaledY / 2,
      z: 0,
    },
  }
}

/**
 * 四列地表高度取整数中位值；偶数样本中间两值不同则向下取整平均
 * @param {number[]} heights
 * @returns {number}
 */
export function computePlatformTargetY(heights) {
  const sorted = [...heights].sort((a, b) => a - b)
  const mid = sorted.length / 2

  if (sorted.length % 2 === 1)
    return sorted[Math.floor(mid)]

  return Math.floor((sorted[mid - 1] + sorted[mid]) / 2)
}

/**
 * 生成平台整理计划：削高、填低、清除上方方块，并列出需清植物的列
 * @param {{
 *   columns: Array<{ x: number, z: number, surfaceY: number, surfaceBlockId: number, blocksAbove: Array<{ y: number, id: number }> }>,
 *   targetY: number,
 *   fillBlockId: number,
 * }} params
 * @returns {{ ops: Array<{ type: 'remove'|'add', x: number, y: number, z: number, blockId?: number }>, clearPlantColumns: Array<{ x: number, z: number }> }}
 */
export function buildPlatformPlan({ columns, targetY, fillBlockId }) {
  const ops = []

  for (const column of columns) {
    const { x, z, surfaceY, blocksAbove } = column

    // 地表高于目标：移除 targetY+1 .. surfaceY 的方块
    if (surfaceY > targetY) {
      for (let y = targetY + 1; y <= surfaceY; y++) {
        ops.push({ type: 'remove', x, y, z })
      }
    }

    // 地表低于目标：用 fillBlockId 从 surfaceY+1 填至 targetY
    if (surfaceY < targetY) {
      for (let y = surfaceY + 1; y <= targetY; y++) {
        ops.push({ type: 'add', x, y, z, blockId: fillBlockId })
      }
    }

    // 移除 targetY 以上的上方方块（树/树叶/植物等）
    for (const block of blocksAbove) {
      if (block.y > targetY)
        ops.push({ type: 'remove', x, y: block.y, z })
    }
  }

  const clearPlantColumns = columns.map(({ x, z }) => ({ x, z }))

  return { ops, clearPlantColumns }
}

/**
 * 判断世界坐标 (x, z) 是否落在脚印单元格内
 * @param {number} x
 * @param {number} z
 * @param {Array<{ x: number, z: number }>} footprint
 */
function isInsideFootprint(x, z, footprint) {
  const cellX = Math.floor(x)
  const cellZ = Math.floor(z)
  return footprint.some(p => p.x === cellX && p.z === cellZ)
}

/**
 * 从配置与 RNG 解析本次蜗牛数量（含端点）
 * @param {import('../../tools/rng.js').RNG} rng
 * @param {{ snailCountMin: number, snailCountMax: number }} cfg
 * @returns {number}
 */
export function resolveSnailCount(rng, { snailCountMin, snailCountMax }) {
  const min = Math.min(snailCountMin, snailCountMax)
  const max = Math.max(snailCountMin, snailCountMax)
  return min + Math.floor(rng.random() * (max - min + 1))
}

/**
 * 确定性生成蜗牛出生点：环带内、避开脚印
 * @param {import('../../tools/rng.js').RNG} rng
 * @param {{
 *   count: number,
 *   center: { x: number, z: number },
 *   footprint: Array<{ x: number, z: number }>,
 *   radiusMin: number,
 *   radiusMax: number,
 *   lengthMin: number,
 *   lengthMax: number,
 * }} params
 * @returns {Array<{ x: number, z: number, yaw: number, length: number }>}
 */
export function generateSnailSpawnPoints(rng, {
  count,
  center,
  footprint,
  radiusMin,
  radiusMax,
  lengthMin,
  lengthMax,
}) {
  const points = []
  const maxAttempts = count * 200
  let attempts = 0

  while (points.length < count && attempts < maxAttempts) {
    attempts++

    const angle = rng.random() * Math.PI * 2
    const radius = radiusMin + rng.random() * (radiusMax - radiusMin)
    const x = center.x + Math.cos(angle) * radius
    const z = center.z + Math.sin(angle) * radius

    if (isInsideFootprint(x, z, footprint))
      continue

    const yaw = rng.random() * Math.PI * 2
    const length = lengthMin + rng.random() * (lengthMax - lengthMin)

    points.push({ x, z, yaw, length })
  }

  return points
}

/**
 * 创建蜗牛缩壳状态机
 * @param {{ retractMs: number, holdMs: number, emergeMs: number }} params
 */
export function createSnailFsm({ retractMs, holdMs, emergeMs }) {
  return {
    state: SNAIL_STATES.CRAWLING,
    timerMs: 0,
    retractMs,
    holdMs,
    emergeMs,
  }
}

/**
 * 点击蜗牛：仅 CRAWLING 状态下触发缩入
 * @param {{ state: string, timerMs: number }} fsm
 */
export function snailFsmOnClick(fsm) {
  if (fsm.state !== SNAIL_STATES.CRAWLING)
    return

  fsm.state = SNAIL_STATES.RETRACTING
  fsm.timerMs = 0
}

/**
 * 推进蜗牛状态机计时与状态转换
 * @param {{ state: string, timerMs: number, retractMs: number, holdMs: number, emergeMs: number }} fsm
 * @param {number} dtMs
 */
export function snailFsmUpdate(fsm, dtMs) {
  if (fsm.state === SNAIL_STATES.CRAWLING)
    return

  fsm.timerMs += dtMs

  if (fsm.state === SNAIL_STATES.RETRACTING && fsm.timerMs >= fsm.retractMs) {
    fsm.state = SNAIL_STATES.RETRACTED
    fsm.timerMs = 0
    return
  }

  if (fsm.state === SNAIL_STATES.RETRACTED && fsm.timerMs >= fsm.holdMs) {
    fsm.state = SNAIL_STATES.EMERGING
    fsm.timerMs = 0
    return
  }

  if (fsm.state === SNAIL_STATES.EMERGING && fsm.timerMs >= fsm.emergeMs) {
    fsm.state = SNAIL_STATES.CRAWLING
    fsm.timerMs = 0
  }
}

/**
 * 是否应消费本次左键（阻止挖矿）
 * @param {{ hitSnail: boolean, distance: number, maxDistance: number }} params
 * @returns {boolean}
 */
export function shouldConsumeMiningClick({ hitSnail, distance, maxDistance }) {
  return Boolean(hitSnail) && distance <= maxDistance
}
