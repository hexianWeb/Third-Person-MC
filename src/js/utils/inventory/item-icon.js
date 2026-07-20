/**
 * 物品/方块图标解析
 * 方块 → CSS3D 顶面+侧面 URL；物品 → 2D 贴图 URL
 */
import { ITEM_BY_ID } from '@three/config/items-config.js'
import sources from '@three/sources.js'
import { blocks as blocksConfig } from '@three/world/terrain/blocks-config.js'

/** sources 纹理名 → URL 映射 */
const texturePathMap = sources.reduce((map, source) => {
  if (source.type === 'texture')
    map[source.name] = `/${source.path}`
  return map
}, {})

/**
 * 按 id 查找方块配置
 * @param {number} id
 * @returns {object | null}
 */
export function getBlockConfigById(id) {
  for (const key of Object.keys(blocksConfig)) {
    if (blocksConfig[key].id === id)
      return blocksConfig[key]
  }
  return null
}

/**
 * 解析方块某一面的纹理 URL
 * @param {object} config
 * @param {string} face
 * @returns {string | null}
 */
function resolveBlockFaceUrl(config, face) {
  if (!config?.textureKeys)
    return null
  const textureKey = config.textureKeys[face]
    || config.textureKeys.side
    || config.textureKeys.all
  if (!textureKey)
    return null
  return texturePathMap[textureKey] || null
}

/**
 * 获取物品/方块图标
 * @param {number} id
 * @returns {{ kind: 'block', top: string, side: string } | { kind: 'item', url: string } | null}
 */
export function getItemIcon(id) {
  if (id == null || id === 0)
    return null

  // 优先物品（300+）
  const item = ITEM_BY_ID[id]
  if (item) {
    const url = texturePathMap[item.icon]
    if (!url)
      return null
    return { kind: 'item', url }
  }

  const config = getBlockConfigById(id)
  if (!config)
    return null

  const top = resolveBlockFaceUrl(config, 'top') || resolveBlockFaceUrl(config, 'all')
  const side = resolveBlockFaceUrl(config, 'side') || resolveBlockFaceUrl(config, 'all')
  if (!top && !side)
    return null

  return {
    kind: 'block',
    top: top || side,
    side: side || top,
  }
}

/**
 * 获取物品/方块 name（供 i18n key：items.{name}）
 * @param {number} id
 * @returns {string | null}
 */
export function getItemName(id) {
  if (id == null)
    return null
  const item = ITEM_BY_ID[id]
  if (item)
    return item.name
  const config = getBlockConfigById(id)
  return config?.name ?? null
}
