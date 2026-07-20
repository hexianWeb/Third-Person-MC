/**
 * 背包槽位纯函数操作
 * 无 Vue / Pinia 依赖，slot 形状统一为 { blockId, count } | null
 */

/** 单槽堆叠上限（与 hudStore.MAX_STACK 对齐） */
export const STACK_LIMIT = 64

/**
 * 判断两个槽位是否为同一物品
 * @param {{ blockId: number, count: number } | null} a
 * @param {{ blockId: number, count: number } | null} b
 * @returns {boolean}
 */
export function isSameItem(a, b) {
  if (!a || !b)
    return false
  return a.blockId === b.blockId
}

/**
 * 向单槽合并物品
 * 同 id 且未满 64 时堆叠，返回未能放入的剩余数量
 * @param {{ blockId: number, count: number } | null} slot
 * @param {number} blockId
 * @param {number} amount
 * @returns {number} 剩余数量
 */
export function stackSlot(slot, blockId, amount) {
  if (amount <= 0)
    return 0
  if (!slot)
    return amount
  if (slot.blockId !== blockId)
    return amount
  if (slot.count >= STACK_LIMIT)
    return amount

  const canAdd = Math.min(amount, STACK_LIMIT - slot.count)
  slot.count += canAdd
  return amount - canAdd
}

/**
 * 将物品合并进槽位数组：先填同类未满槽，再填空槽
 * 单槽按 64 封顶；调用方负责对返回的剩余数量续填
 * @param {Array<{ blockId: number, count: number } | null>} slots
 * @param {number} blockId
 * @param {number} amount
 * @returns {number} 未能放入的剩余数量
 */
export function mergeIntoSlots(slots, blockId, amount) {
  if (amount <= 0 || !slots || slots.length === 0)
    return amount

  // 1. 先堆叠到已有同类未满槽
  for (const slot of slots) {
    if (amount <= 0)
      break
    amount = stackSlot(slot, blockId, amount)
  }

  // 2. 再填空槽（每个空槽最多放 STACK_LIMIT）
  for (let i = 0; i < slots.length; i++) {
    if (amount <= 0)
      break
    if (!slots[i]) {
      const added = Math.min(amount, STACK_LIMIT)
      slots[i] = { blockId, count: added }
      amount -= added
    }
  }

  return amount
}

/**
 * 从槽位拿一半（光标拿半：向上取整）
 * @param {{ blockId: number, count: number }} slot
 * @returns {{ taken: number, remaining: number }}
 */
export function takeHalf(slot) {
  if (!slot || slot.count <= 0)
    return { taken: 0, remaining: 0 }

  const taken = Math.ceil(slot.count / 2)
  const remaining = slot.count - taken
  return { taken, remaining }
}
