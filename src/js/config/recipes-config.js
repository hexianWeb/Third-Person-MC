/**
 * 合成配方配置与形状容忍匹配引擎
 * 结果 id 字面量：22/23 见 blocks-config.js；300/301 见 items-config.js
 */

import { blocks } from '../world/terrain/blocks-config.js'
import { items } from './items-config.js'

/**
 * 名称 → 数字 id 解析：先查方块再查物品
 * @param {string} name
 * @returns {number | null}
 */
export function resolveItemId(name) {
  if (!name)
    return null
  const block = Object.values(blocks).find(b => b.name === name)
  if (block)
    return block.id
  const item = Object.values(items).find(i => i.name === name)
  if (item)
    return item.id
  return null
}

/**
 * 裁掉 pattern 四周全 null 边，返回紧凑矩阵
 * @param {Array<Array<string | null>>} pattern
 * @returns {Array<Array<string | null>>}
 */
function trimPattern(pattern) {
  if (!pattern || pattern.length === 0)
    return []

  let minR = pattern.length
  let maxR = -1
  let minC = pattern[0].length
  let maxC = -1

  for (let r = 0; r < pattern.length; r++) {
    for (let c = 0; c < pattern[r].length; c++) {
      if (pattern[r][c] != null) {
        minR = Math.min(minR, r)
        maxR = Math.max(maxR, r)
        minC = Math.min(minC, c)
        maxC = Math.max(maxC, c)
      }
    }
  }

  // 全空 pattern
  if (maxR < 0)
    return []

  const trimmed = []
  for (let r = minR; r <= maxR; r++) {
    trimmed.push(pattern[r].slice(minC, maxC + 1))
  }
  return trimmed
}

/**
 * 从网格槽位提取非空格子的最小包围盒名称矩阵
 * @param {Array<{ blockId: number, count: number } | null>} gridSlots
 * @param {number} gridSize
 * @returns {{ matrix: Array<Array<string | null>>, rows: number, cols: number } | null}
 */
function extractNameMatrix(gridSlots, gridSize) {
  const nameById = new Map()
  for (const b of Object.values(blocks))
    nameById.set(b.id, b.name)
  for (const i of Object.values(items))
    nameById.set(i.id, i.name)
  // todo 6 落地前过渡：木板/工作台尚未写入 blocks-config 时仍可按 id 解析名称
  if (!nameById.has(22))
    nameById.set(22, 'oak_planks')
  if (!nameById.has(23))
    nameById.set(23, 'crafting_table')

  let minR = gridSize
  let maxR = -1
  let minC = gridSize
  let maxC = -1

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const slot = gridSlots[r * gridSize + c]
      if (slot && slot.count > 0) {
        minR = Math.min(minR, r)
        maxR = Math.max(maxR, r)
        minC = Math.min(minC, c)
        maxC = Math.max(maxC, c)
      }
    }
  }

  if (maxR < 0)
    return null

  const rows = maxR - minR + 1
  const cols = maxC - minC + 1
  const matrix = []
  for (let r = minR; r <= maxR; r++) {
    const row = []
    for (let c = minC; c <= maxC; c++) {
      const slot = gridSlots[r * gridSize + c]
      if (slot && slot.count > 0)
        row.push(nameById.get(slot.blockId) ?? null)
      else
        row.push(null)
    }
    matrix.push(row)
  }
  return { matrix, rows, cols, minR, minC }
}

/**
 * 配方表（形状容忍：匹配时裁边后精确比对）
 * 结果 id：22=橡木木板，23=工作台，300=木棍，301=木镐
 */
export const recipes = {
  planksFromOak: {
    pattern: [['tree_trunk']],
    result: { id: 22, count: 4 }, // 见 blocks-config.js OAK_PLANKS
  },
  planksFromBirch: {
    pattern: [['birch_trunk']],
    result: { id: 22, count: 4 },
  },
  planksFromCherry: {
    pattern: [['cherry_trunk']],
    result: { id: 22, count: 4 },
  },
  stick: {
    // 1 宽 2 高竖排木板
    pattern: [['oak_planks'], ['oak_planks']],
    result: { id: 300, count: 4 }, // 见 items-config.js STICK
  },
  craftingTable: {
    pattern: [
      ['oak_planks', 'oak_planks'],
      ['oak_planks', 'oak_planks'],
    ],
    result: { id: 23, count: 1 }, // 见 blocks-config.js CRAFTING_TABLE
  },
  woodenPickaxe: {
    pattern: [
      ['oak_planks', 'oak_planks', 'oak_planks'],
      [null, 'stick', null],
      [null, 'stick', null],
    ],
    result: { id: 301, count: 1 }, // 见 items-config.js WOODEN_PICKAXE
    minGrid: 3,
  },
}

/**
 * 形状容忍匹配：裁边后与 pattern 精确比对
 * @param {Array<{ blockId: number, count: number } | null>} gridSlots 长度 gridSize²
 * @param {number} gridSize 2 或 3
 * @returns {{ recipe: object, result: { blockId: number, count: number } } | null}
 */
export function matchRecipe(gridSlots, gridSize) {
  if (!gridSlots || gridSlots.length !== gridSize * gridSize)
    return null

  const extracted = extractNameMatrix(gridSlots, gridSize)
  if (!extracted)
    return null

  const { matrix, rows, cols } = extracted

  for (const recipe of Object.values(recipes)) {
    // 跳过需要更大网格的配方（如木镐仅 3x3）
    if (recipe.minGrid != null && recipe.minGrid > gridSize)
      continue

    const trimmed = trimPattern(recipe.pattern)
    if (trimmed.length === 0)
      continue
    if (trimmed.length !== rows || trimmed[0].length !== cols)
      continue

    let matched = true
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const expected = trimmed[r][c]
        const actual = matrix[r][c]
        // null = 必须空；非 null = 名称精确相等
        if (expected == null) {
          if (actual != null) {
            matched = false
            break
          }
        }
        else if (actual !== expected) {
          matched = false
          break
        }
      }
      if (!matched)
        break
    }

    if (matched) {
      return {
        recipe,
        result: { blockId: recipe.result.id, count: recipe.result.count },
      }
    }
  }

  return null
}

/**
 * 当前网格对某配方最多可合成次数（非空 pattern 格对应 count 的最小值）
 * @param {Array<{ blockId: number, count: number } | null>} gridSlots
 * @param {object} recipe
 * @returns {number}
 */
export function maxCrafts(gridSlots, recipe) {
  if (!gridSlots || !recipe)
    return 0

  const gridSize = Math.sqrt(gridSlots.length)
  if (!Number.isInteger(gridSize))
    return 0

  const extracted = extractNameMatrix(gridSlots, gridSize)
  if (!extracted)
    return 0

  const trimmed = trimPattern(recipe.pattern)
  if (trimmed.length === 0)
    return 0
  if (trimmed.length !== extracted.rows || trimmed[0].length !== extracted.cols)
    return 0

  const { minR, minC } = extracted
  let minCount = Infinity

  for (let r = 0; r < trimmed.length; r++) {
    for (let c = 0; c < trimmed[r].length; c++) {
      if (trimmed[r][c] == null)
        continue
      const slot = gridSlots[(minR + r) * gridSize + (minC + c)]
      if (!slot || slot.count <= 0)
        return 0
      minCount = Math.min(minCount, slot.count)
    }
  }

  if (!Number.isFinite(minCount) || minCount <= 0)
    return 0
  // 与 slot-ops 一致：单次结果堆叠上限 64，批量上限也封顶
  return Math.min(minCount, 64)
}
