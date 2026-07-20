/**
 * 非方块物品注册表（ID 段 300+）
 * Non-block item registry (ID range 300+)
 */

export const ITEM_IDS = {
  STICK: 300,
  WOODEN_PICKAXE: 301,
}

/**
 * 物品配置表
 * icon 对应 sources.js 中的纹理资源名
 */
export const items = {
  stick: {
    id: ITEM_IDS.STICK,
    name: 'stick',
    icon: 'stick_Texture',
  },
  woodenPickaxe: {
    id: ITEM_IDS.WOODEN_PICKAXE,
    name: 'wooden_pickaxe',
    icon: 'pickaxe_Texture',
  },
}

/** id → 配置 反查表 */
export const ITEM_BY_ID = Object.values(items).reduce((map, item) => {
  map[item.id] = item
  return map
}, {})
