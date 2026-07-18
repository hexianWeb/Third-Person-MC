/**
 * 皮肤系统配置文件
 * 定义可用皮肤列表、默认皮肤以及动画控制按钮配置
 * 预设皮肤使用统一 canonical 模型 + 独立纹理资源，不再绑定独立 glb
 */

// 统一角色模型资源（所有预设/自定义皮肤共用）
export const CANONICAL_MODEL_RESOURCE = 'playerModel'
export const CANONICAL_MODEL_PATH = 'models/character/player.glb'

// 自定义皮肤 ID（运行时上传，无预加载纹理资源）
export const CUSTOM_SKIN_ID = 'custom'

// 可用皮肤列表（纹理描述符，不含 modelPath）
export const SKIN_LIST = [
  {
    id: 'steve',
    name: 'Steve',
    nameKey: 'skin.steve', // i18n key
    textureResourceName: 'steveSkinTexture',
    texturePath: 'textures/skins/steve.png',
    thumbnail: 'textures/skins/steve-thumb.png',
    // 来源: https://www.planetminecraft.com/member/hibiki_ekko/
  },
  {
    id: 'alex',
    name: 'Alex',
    nameKey: 'skin.alex',
    textureResourceName: 'alexSkinTexture',
    texturePath: 'textures/skins/alex.png',
    thumbnail: 'textures/skins/alex-thumb.png',
    // 来源: https://www.planetminecraft.com/member/hibiki_ekko/
  },
  {
    id: 'player',
    name: 'Classic',
    nameKey: 'skin.player',
    textureResourceName: 'playerSkinTexture',
    texturePath: 'textures/skins/player.png',
    thumbnail: 'textures/skins/player-thumb.png',
    // 来源: https://www.minecraftskins.com/profile/5521971/holland0519
  },
]

// 自定义皮肤描述符（纹理由用户上传，不预声明 textureResourceName）
export const CUSTOM_SKIN = {
  id: CUSTOM_SKIN_ID,
  name: 'Custom',
  nameKey: 'skin.custom',
  thumbnail: null,
}

// 全部皮肤（预设 + 自定义）
export const ALL_SKINS = [...SKIN_LIST, CUSTOM_SKIN]

// 默认皮肤 ID
export const DEFAULT_SKIN_ID = 'steve'

// 动画控制按钮配置（皮肤选择界面左侧按钮组）
export const ANIMATION_BUTTONS = [
  { id: 'idle', icon: '🧍', labelKey: 'anim.idle', clip: 'idle' },
  { id: 'walk', icon: '🚶', labelKey: 'anim.walk', clip: 'forward' },
  { id: 'run', icon: '🏃', labelKey: 'anim.run', clip: 'running_forward' },
  { id: 'tpose', icon: '✋', labelKey: 'anim.tpose', clip: 'tpose' },
  { id: 'mine', icon: '⛏️', labelKey: 'anim.mine', clip: 'quick_combo_punch' },
  { id: 'jump', icon: '🦘', labelKey: 'anim.jump', clip: 'jump' },
  { id: 'attack', icon: '⚔️', labelKey: 'anim.attack', clip: 'straight_punch' },
  { id: 'block', icon: '🛡️', labelKey: 'anim.block', clip: 'block' },
]
