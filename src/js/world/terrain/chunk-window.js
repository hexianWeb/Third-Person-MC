import { CHUNK_RENDER_VIEW_DISTANCE } from '../../config/chunk-render-capacity.js'

/**
 * 获取以指定区块为中心的固定渲染窗口。
 * @param {number} centerX 中心区块 X 坐标
 * @param {number} centerZ 中心区块 Z 坐标
 * @returns {Set<string>} 区块键集合
 */
export function getChunkWindow(centerX, centerZ) {
  const keys = new Set()

  for (let chunkX = centerX - CHUNK_RENDER_VIEW_DISTANCE; chunkX <= centerX + CHUNK_RENDER_VIEW_DISTANCE; chunkX++) {
    for (let chunkZ = centerZ - CHUNK_RENDER_VIEW_DISTANCE; chunkZ <= centerZ + CHUNK_RENDER_VIEW_DISTANCE; chunkZ++) {
      keys.add(`${chunkX},${chunkZ}`)
    }
  }

  return keys
}

/**
 * 计算朝最终请求中心前进的一步，确保每次窗口差异最多使用五个 staging 槽位。
 * @param {{ x: number, z: number } | null} committedCenter 已提交窗口中心
 * @param {{ x: number, z: number }} requestedCenter 最终请求中心
 * @returns {{ x: number, z: number }} 下一步完整窗口中心
 */
export function getNextChunkWindowCenter(committedCenter, requestedCenter) {
  if (!committedCenter)
    return { ...requestedCenter }

  return {
    x: committedCenter.x + Math.sign(requestedCenter.x - committedCenter.x),
    z: committedCenter.z + Math.sign(requestedCenter.z - committedCenter.z),
  }
}

/**
 * 在槽位池预热期间保留最后一次 streaming 请求；没有请求时从出生窗口开始。
 * @param {{ x: number, z: number } | null} latestRequestedCenter 预热期间记录的最新中心
 * @returns {{ x: number, z: number }} 初始渲染窗口中心
 */
export function getInitialChunkWindowCenter(latestRequestedCenter) {
  return latestRequestedCenter ? { ...latestRequestedCenter } : { x: 0, z: 0 }
}

/**
 * 检查异步槽位工作是否仍属于当前窗口请求和槽位绑定。
 * @param {object} options 校验上下文
 * @param {number} options.assignmentId 捕获的槽位绑定编号
 * @param {string} options.chunkKey 捕获的区块键
 * @param {number} options.currentTransitionId 管理器当前过渡编号
 * @param {boolean} options.destroyed 管理器是否已销毁
 * @param {{ assignmentId: number }} options.slot 槽位
 * @param {Set<string>} options.targetWindow 当前 step 窗口
 * @param {number} options.transitionId 捕获的过渡编号
 * @returns {boolean} 工作是否仍可提交
 */
export function isCurrentChunkAssignment({
  assignmentId,
  chunkKey,
  currentTransitionId,
  destroyed,
  slot,
  targetWindow,
  transitionId,
}) {
  return !destroyed
    && transitionId === currentTransitionId
    && targetWindow.has(chunkKey)
    && slot.assignmentId === assignmentId
}

/**
 * 计算当前窗口与目标窗口的纯集合差异。
 * @param {Set<string>} activeKeys 当前活动区块键
 * @param {Set<string>} targetKeys 目标区块键
 * @returns {{ overlap: Set<string>, incoming: Set<string>, outgoing: Set<string> }} 窗口差异
 */
export function diffChunkWindows(activeKeys, targetKeys) {
  const overlap = new Set()
  const incoming = new Set()
  const outgoing = new Set()

  for (const key of targetKeys) {
    if (activeKeys.has(key))
      overlap.add(key)
    else
      incoming.add(key)
  }

  for (const key of activeKeys) {
    if (!targetKeys.has(key))
      outgoing.add(key)
  }

  return { overlap, incoming, outgoing }
}
