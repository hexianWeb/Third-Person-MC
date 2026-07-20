/**
 * Inventory Store - 主背包 / 合成区 / 光标
 * 拾取路由：hotbar 同类 → main 同类 → hotbar 空槽 → main 空槽
 */
import { matchRecipe, maxCrafts } from '@three/config/recipes-config.js'
import emitter from '@three/utils/event/event-bus.js'
import { isSameItem, mergeIntoSlots, STACK_LIMIT, takeHalf } from '@three/utils/inventory/slot-ops.js'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useHudStore } from './hudStore.js'

export const useInventoryStore = defineStore('inventory', () => {
  /** 27 格主背包 */
  const mainSlots = ref(Array.from({ length: 27 }, () => null))
  /** 2x2 合成区 */
  const craft2 = ref(Array.from({ length: 4 }, () => null))
  /** 3x3 合成区 */
  const craft3 = ref(Array.from({ length: 9 }, () => null))
  /** 鼠标光标持有的物品 */
  const cursor = ref(null)

  /** 2x2 合成结果 */
  const craft2Result = computed(() => {
    const matched = matchRecipe(craft2.value, 2)
    return matched ? matched.result : null
  })

  /** 3x3 合成结果 */
  const craft3Result = computed(() => {
    const matched = matchRecipe(craft3.value, 3)
    return matched ? matched.result : null
  })

  /**
   * 仅向空槽填入物品，返回剩余数量
   * @param {Array} slots
   * @param {number} blockId
   * @param {number} amount
   */
  function fillEmptySlots(slots, blockId, amount) {
    let rem = amount
    for (let i = 0; i < slots.length; i++) {
      if (rem <= 0)
        break
      if (!slots[i]) {
        const added = Math.min(rem, STACK_LIMIT)
        slots[i] = { blockId, count: added }
        rem -= added
      }
    }
    return rem
  }

  /**
   * 仅堆叠到已有同类槽，返回剩余数量
   * @param {Array} slots
   * @param {number} blockId
   * @param {number} amount
   */
  function stackSameSlots(slots, blockId, amount) {
    let rem = amount
    for (const slot of slots) {
      if (rem <= 0)
        break
      if (slot?.blockId === blockId && slot.count < STACK_LIMIT) {
        const canAdd = Math.min(rem, STACK_LIMIT - slot.count)
        slot.count += canAdd
        rem -= canAdd
      }
    }
    return rem
  }

  /**
   * 拾取路由：hotbar 同类 → main 同类 → hotbar 空 → main 空
   * @param {number} blockId
   * @param {number} amount
   * @returns {boolean} 是否全部收下
   */
  function addItem(blockId, amount = 1) {
    if (amount <= 0)
      return true
    const hud = useHudStore()
    let rem = amount
    rem = stackSameSlots(hud.hotbarItems, blockId, rem)
    rem = stackSameSlots(mainSlots.value, blockId, rem)
    rem = fillEmptySlots(hud.hotbarItems, blockId, rem)
    rem = fillEmptySlots(mainSlots.value, blockId, rem)
    return rem === 0
  }

  /**
   * 同 addItem，但返回未能放入的剩余数量（供光标回收入包）
   * @param {number} blockId
   * @param {number} amount
   * @returns {number}
   */
  function addItemRemainder(blockId, amount) {
    if (amount <= 0)
      return 0
    const hud = useHudStore()
    let rem = amount
    rem = stackSameSlots(hud.hotbarItems, blockId, rem)
    rem = stackSameSlots(mainSlots.value, blockId, rem)
    rem = fillEmptySlots(hud.hotbarItems, blockId, rem)
    rem = fillEmptySlots(mainSlots.value, blockId, rem)
    return rem
  }

  /**
   * 获取区域槽位数组（结果格除外）
   * @param {string} section
   */
  function getSlots(section) {
    const hud = useHudStore()
    switch (section) {
      case 'main':
        return mainSlots.value
      case 'hotbar':
        return hud.hotbarItems
      case 'craft2':
        return craft2.value
      case 'craft3':
        return craft3.value
      default:
        return null
    }
  }

  /**
   * 检查是否能完整放入指定数量（干跑，不修改状态）
   */
  function hasSpaceFor(blockId, amount) {
    const hud = useHudStore()
    const hotbar = hud.hotbarItems.map(s => (s ? { ...s } : null))
    const main = mainSlots.value.map(s => (s ? { ...s } : null))
    let rem = amount
    rem = stackSameSlots(hotbar, blockId, rem)
    rem = stackSameSlots(main, blockId, rem)
    rem = fillEmptySlots(hotbar, blockId, rem)
    rem = fillEmptySlots(main, blockId, rem)
    return rem === 0
  }

  /**
   * 合成格每非空格扣 times
   */
  function deductCraftGrid(grid, times) {
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] && grid[i].count > 0) {
        grid[i].count -= times
        if (grid[i].count <= 0)
          grid[i] = null
      }
    }
  }

  /**
   * 点击结果格合成
   * @param {'result2'|'result3'} resultSection
   * @param {boolean} shift 批量
   */
  function craftFromResult(resultSection, shift) {
    const is2 = resultSection === 'result2'
    const grid = is2 ? craft2.value : craft3.value
    const gridSize = is2 ? 2 : 3
    const matched = matchRecipe(grid, gridSize)
    if (!matched)
      return

    const { blockId, count } = matched.result

    if (shift) {
      const max = maxCrafts(grid, matched.recipe)
      let crafted = 0
      for (let i = 0; i < max; i++) {
        if (!hasSpaceFor(blockId, count))
          break
        deductCraftGrid(grid, 1)
        addItem(blockId, count)
        crafted++
      }
      return crafted
    }

    // 单次：光标空或同类可叠才执行
    if (cursor.value) {
      if (cursor.value.blockId !== blockId)
        return
      if (cursor.value.count + count > STACK_LIMIT)
        return
    }

    deductCraftGrid(grid, 1)
    if (!cursor.value)
      cursor.value = { blockId, count }
    else
      cursor.value.count += count
  }

  /**
   * Shift+左键：整组转移到对侧区域
   */
  function shiftMove(section, index) {
    if (section === 'result2' || section === 'result3') {
      craftFromResult(section, true)
      return
    }

    const slots = getSlots(section)
    if (!slots)
      return
    const slot = slots[index]
    if (!slot)
      return

    const hud = useHudStore()
    const { blockId, count } = slot
    let rem = count

    if (section === 'main')
      rem = mergeIntoSlots(hud.hotbarItems, blockId, rem)
    else if (section === 'hotbar')
      rem = mergeIntoSlots(mainSlots.value, blockId, rem)
    else if (section === 'craft2' || section === 'craft3')
      rem = mergeIntoSlots(mainSlots.value, blockId, rem)

    if (rem <= 0)
      slots[index] = null
    else
      slots[index] = { blockId, count: rem }
  }

  /**
   * 普通格左键
   */
  function leftClickSlot(slots, index) {
    const slot = slots[index]
    if (!cursor.value) {
      if (!slot)
        return
      cursor.value = { blockId: slot.blockId, count: slot.count }
      slots[index] = null
      return
    }

    // 光标有物品
    if (!slot) {
      slots[index] = { blockId: cursor.value.blockId, count: cursor.value.count }
      cursor.value = null
      return
    }

    if (isSameItem(slot, cursor.value)) {
      const space = STACK_LIMIT - slot.count
      if (space <= 0)
        return
      const moved = Math.min(space, cursor.value.count)
      slot.count += moved
      cursor.value.count -= moved
      if (cursor.value.count <= 0)
        cursor.value = null
      return
    }

    // 异类交换
    const tmp = { blockId: slot.blockId, count: slot.count }
    slots[index] = { blockId: cursor.value.blockId, count: cursor.value.count }
    cursor.value = tmp
  }

  /**
   * 普通格右键
   */
  function rightClickSlot(slots, index) {
    const slot = slots[index]
    if (!cursor.value) {
      if (!slot)
        return
      const { taken, remaining } = takeHalf(slot)
      cursor.value = { blockId: slot.blockId, count: taken }
      slots[index] = remaining > 0 ? { blockId: slot.blockId, count: remaining } : null
      return
    }

    // 光标有物品：放一个
    if (!slot) {
      slots[index] = { blockId: cursor.value.blockId, count: 1 }
      cursor.value.count--
      if (cursor.value.count <= 0)
        cursor.value = null
      return
    }

    if (isSameItem(slot, cursor.value) && slot.count < STACK_LIMIT) {
      slot.count++
      cursor.value.count--
      if (cursor.value.count <= 0)
        cursor.value = null
    }
  }

  /**
   * MC 槽位点击语义
   * @param {string} section
   * @param {number} index
   * @param {{ button: number, shift: boolean }} opts
   */
  function slotClick(section, index, { button = 0, shift = false } = {}) {
    // 结果格
    if (section === 'result2' || section === 'result3') {
      if (button === 0)
        craftFromResult(section, !!shift)
      return
    }

    const slots = getSlots(section)
    if (!slots || index < 0 || index >= slots.length)
      return

    if (shift && button === 0) {
      shiftMove(section, index)
      return
    }

    if (button === 0)
      leftClickSlot(slots, index)
    else if (button === 2)
      rightClickSlot(slots, index)
  }

  /**
   * 关闭界面时：光标物品走 addItem，剩余留光标
   */
  function returnCursorToInventory() {
    if (!cursor.value)
      return
    const rem = addItemRemainder(cursor.value.blockId, cursor.value.count)
    cursor.value = rem > 0 ? { blockId: cursor.value.blockId, count: rem } : null
  }

  function onAddItem({ blockId, amount }) {
    addItem(blockId, amount ?? 1)
  }

  function setupListeners() {
    emitter.on('hud:add-item', onAddItem)
  }

  function cleanupListeners() {
    emitter.off('hud:add-item', onAddItem)
  }

  return {
    mainSlots,
    craft2,
    craft3,
    cursor,
    craft2Result,
    craft3Result,
    addItem,
    slotClick,
    returnCursorToInventory,
    setupListeners,
    cleanupListeners,
  }
})
