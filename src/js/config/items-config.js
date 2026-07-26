/**
 * 非方块物品注册表（ID 段 300+）
 * heldMesh：tool.glb 内节点名（镐子资产名为 *_manuscript）
 */

export const ATTACK_STYLES = Object.freeze({
  UNARMED: 'unarmed',
  MELEE: 'melee',
})

export const ITEM_IDS = {
  STICK: 300,
  WOODEN_PICKAXE: 301,
  WOODEN_AXE: 302,
  WOODEN_SHOVEL: 303,
  WOODEN_SWORD: 304,
  WOODEN_HOE: 305,
  STONE_PICKAXE: 306,
  STONE_AXE: 307,
  STONE_SHOVEL: 308,
  STONE_SWORD: 309,
  STONE_HOE: 310,
}

/**
 * 物品配置表
 * icon → sources.js 纹理名；heldMesh → tool.glb 节点（可手持）
 */
export const items = {
  stick: {
    id: ITEM_IDS.STICK,
    name: 'stick',
    icon: 'stick_Texture',
    heldMesh: null,
  },
  woodenPickaxe: {
    id: ITEM_IDS.WOODEN_PICKAXE,
    name: 'wooden_pickaxe',
    icon: 'woodenPickaxe_Texture',
    heldMesh: 'wood_manuscript',
  },
  woodenAxe: {
    id: ITEM_IDS.WOODEN_AXE,
    name: 'wooden_axe',
    icon: 'woodenAxe_Texture',
    heldMesh: 'wood_axe',
    attackStyle: ATTACK_STYLES.MELEE,
  },
  woodenShovel: {
    id: ITEM_IDS.WOODEN_SHOVEL,
    name: 'wooden_shovel',
    icon: 'woodenShovel_Texture',
    heldMesh: 'wood_shovel',
  },
  woodenSword: {
    id: ITEM_IDS.WOODEN_SWORD,
    name: 'wooden_sword',
    icon: 'woodenSword_Texture',
    heldMesh: 'wood_sword',
    attackStyle: ATTACK_STYLES.MELEE,
  },
  woodenHoe: {
    id: ITEM_IDS.WOODEN_HOE,
    name: 'wooden_hoe',
    icon: 'woodenHoe_Texture',
    heldMesh: 'wood_hoe',
  },
  stonePickaxe: {
    id: ITEM_IDS.STONE_PICKAXE,
    name: 'stone_pickaxe',
    icon: 'stonePickaxe_Texture',
    heldMesh: 'stone_manuscript',
  },
  stoneAxe: {
    id: ITEM_IDS.STONE_AXE,
    name: 'stone_axe',
    icon: 'stoneAxe_Texture',
    heldMesh: 'stone_axe',
    attackStyle: ATTACK_STYLES.MELEE,
  },
  stoneShovel: {
    id: ITEM_IDS.STONE_SHOVEL,
    name: 'stone_shovel',
    icon: 'stoneShovel_Texture',
    heldMesh: 'stone_shovel',
  },
  stoneSword: {
    id: ITEM_IDS.STONE_SWORD,
    name: 'stone_sword',
    icon: 'stoneSword_Texture',
    heldMesh: 'stone_sword',
    attackStyle: ATTACK_STYLES.MELEE,
  },
  stoneHoe: {
    id: ITEM_IDS.STONE_HOE,
    name: 'stone_hoe',
    icon: 'stoneHoe_Texture',
    heldMesh: 'stone_hoe',
  },
}

/** id → 配置 反查表 */
export const ITEM_BY_ID = Object.values(items).reduce((map, item) => {
  map[item.id] = item
  return map
}, {})

/**
 * 是否为可手持工具
 * @param {number} id
 * @returns {boolean}
 */
export function isHeldTool(id) {
  return Boolean(ITEM_BY_ID[id]?.heldMesh)
}
