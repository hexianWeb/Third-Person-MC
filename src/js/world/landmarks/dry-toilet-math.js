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
 * 蜗牛活动区硬编码（对齐 center=32,32 / 底座 4×4 / 外扩 4 格）：
 * - 厕所格：[30,33]×[30,33]
 * - 活动外框：[26,37]×[26,37]，不含厕所
 */
const TOILET_MIN = 30
const TOILET_MAX = 33
const AREA_MIN = 26
const AREA_MAX = 37

/**
 * 是否在厕所周边活动带内（4 格环带，不含厕所底座）
 * @param {number} x
 * @param {number} z
 * @returns {boolean}
 */
export function isInSnailZone(x, z) {
  const cx = Math.floor(x)
  const cz = Math.floor(z)
  if (cx < AREA_MIN || cx > AREA_MAX || cz < AREA_MIN || cz > AREA_MAX)
    return false
  if (cx >= TOILET_MIN && cx <= TOILET_MAX && cz >= TOILET_MIN && cz <= TOILET_MAX)
    return false
  return true
}

/**
 * 蜗牛活动环带上的全部列（不含厕所底座）
 * @returns {Array<{ x: number, z: number }>}
 */
export function getSnailActivityColumns() {
  const cols = []
  for (let x = AREA_MIN; x <= AREA_MAX; x++) {
    for (let z = AREA_MIN; z <= AREA_MAX; z++) {
      if (x >= TOILET_MIN && x <= TOILET_MAX && z >= TOILET_MIN && z <= TOILET_MAX)
        continue
      cols.push({ x, z })
    }
  }
  return cols
}

/** 固定 10 只，绕厕所中心等角离散 */
const SNAIL_COUNT = 10
const SPAWN_CENTER_X = 32
const SPAWN_CENTER_Z = 32
/** 中环半径：厕所外缘约 2，外框约 5.5，取中间偏外以拉开间距 */
const SPAWN_RADIUS = 4.2

/**
 * 确定性 0..1（用于体长抖动，无需 RNG）
 * @param {number} i
 */
function spawnHash01(i) {
  const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453
  return v - Math.floor(v)
}

/**
 * 10 只蜗牛绕厕所等角离散分布，体长 [lengthMin, lengthMax]
 * @param {{ lengthMin?: number, lengthMax?: number }} [params]
 * @returns {Array<{ x: number, z: number, yaw: number, length: number }>}
 */
export function getSnailSpawnPoints({
  lengthMin = 0.5,
  lengthMax = 1.0,
} = {}) {
  const points = []

  for (let i = 0; i < SNAIL_COUNT; i++) {
    const angle = (i / SNAIL_COUNT) * Math.PI * 2
    // 奇偶略分内外圈，避免挤在同一圆周上
    const radius = SPAWN_RADIUS + (i % 2 === 0 ? -0.35 : 0.35)
    const x = SPAWN_CENTER_X + Math.cos(angle) * radius
    const z = SPAWN_CENTER_Z + Math.sin(angle) * radius
    points.push({
      x,
      z,
      // 头朝切向，初始沿环爬行
      yaw: angle + Math.PI * 0.5,
      length: lengthMin + spawnHash01(i) * (lengthMax - lengthMin),
    })
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
 * @returns {boolean} 是否成功进入缩壳
 */
export function snailFsmOnClick(fsm) {
  if (fsm.state !== SNAIL_STATES.CRAWLING)
    return false

  fsm.state = SNAIL_STATES.RETRACTING
  fsm.timerMs = 0
  return true
}

/**
 * 是否可拾取（已完全缩入）
 * @param {{ state: string }} fsm
 * @returns {boolean}
 */
export function snailFsmCanPickup(fsm) {
  return fsm.state === SNAIL_STATES.RETRACTED
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
 * 蜗牛点击球半径（略大于视觉体长，便于准星命中）
 * @param {number} length 世界体长
 * @param {{ min?: number, factor?: number }} [opts]
 * @returns {number}
 */
export function resolveSnailClickHitRadius(length, { min = 0.4, factor = 0.75 } = {}) {
  const safeLength = Number.isFinite(length) ? Math.max(0, length) : 0
  const safeMin = Number.isFinite(min) ? Math.max(0, min) : 0
  const safeFactor = Number.isFinite(factor) ? Math.max(0, factor) : 0
  return Math.max(safeMin, safeLength * safeFactor)
}

/**
 * 是否应消费本次左键（阻止挖矿）
 * @param {{ hitSnail: boolean, distance: number, maxDistance: number }} params
 * @returns {boolean}
 */
export function shouldConsumeMiningClick({ hitSnail, distance, maxDistance }) {
  return Boolean(hitSnail) && distance <= maxDistance
}
