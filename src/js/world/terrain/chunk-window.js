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
