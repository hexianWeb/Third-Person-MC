/**
 * 群系配置定义
 * 纯配置数据，不包含生成算法
 * biome 不负责"怎么生成"，只负责"长什么样"
 */
import { BLOCK_IDS, PLANT_IDS } from './blocks-config.js'

/**
 * 群系配置结构
 * - id: 群系唯一标识符
 * - name: 群系显示名称
 * - terrainParams: 地形参数（用于后续生成器）
 * - blocks: 方块映射（地表/土层/深层）
 * - vegetation: 植被配置
 */
export const BIOMES = {
  PLAINS: {
    id: 'plains',
    name: '平原',
    // Climate parameters (for biome generator)
    // Adjusting ranges to be more specific, utilizing the fallback mechanism for gaps
    tempRange: [0.4, 0.6],
    humidityRange: [0.35, 0.55], // Slightly narrower humidity to allow overlap handling
    // 地形参数（用于后续生成器）
    terrainParams: {
      heightOffset: 0, // 高度偏移（相对基准）
      heightMagnitude: 0.5, // 振幅倍数（0.5 = 较小，地形平坦）
    },
    // 方块映射（地表/土层/深层）
    blocks: {
      surface: BLOCK_IDS.GRASS, // 地表方块
      subsurface: BLOCK_IDS.DIRT, // 土层方块
      deep: BLOCK_IDS.STONE, // 深层方块（所有群系相同）
    },
    // 植被配置
    vegetation: {
      enabled: true, // 是否生成植被
      density: 0.03, // 基础密度（0-1），极少量树
      types: [
        {
          type: 'oak', // 植被类型标识
          weight: 1, // 权重（用于随机选择）
          trunkBlock: BLOCK_IDS.TREE_TRUNK,
          leavesBlock: BLOCK_IDS.TREE_LEAVES,
          heightRange: [4, 6], // 高度范围
          canopyRadius: [3, 4], // 树冠大
        },
      ],
      allowedSurface: [BLOCK_IDS.GRASS], // 允许生成的地表方块类型
    },
    // 植物配置（草、花等）
    flora: {
      enabled: true,
      density: 0.15,
      types: [
        { type: 'shortGrass', plantId: PLANT_IDS.SHORT_GRASS, weight: 5 },
        { type: 'dandelion', plantId: PLANT_IDS.DANDELION, weight: 1 },
        { type: 'poppy', plantId: PLANT_IDS.POPPY, weight: 1 },
        { type: 'oxeyeDaisy', plantId: PLANT_IDS.OXEYE_DAISY, weight: 1 },
      ],
      allowedSurface: [BLOCK_IDS.GRASS],
    },
  },

  FOREST: {
    id: 'forest',
    name: '森林',
    // Climate parameters
    tempRange: [0.3, 0.7], // Broaden temp range
    humidityRange: [0.55, 0.95], // High humidity, lower floor to catch more area
    terrainParams: {
      heightOffset: 0, // 略高
      heightMagnitude: 3.0, // 正常振幅
    },
    blocks: {
      surface: BLOCK_IDS.GRASS,
      subsurface: BLOCK_IDS.DIRT,
      deep: BLOCK_IDS.STONE,
    },
    vegetation: {
      enabled: true,
      density: 0.15, // 密度高
      types: [
        {
          type: 'oak',
          weight: 1,
          trunkBlock: BLOCK_IDS.TREE_TRUNK,
          leavesBlock: BLOCK_IDS.TREE_LEAVES,
          heightRange: [4, 6],
          canopyRadius: [3, 4], // 树冠大
        },
      ],
      allowedSurface: [BLOCK_IDS.GRASS],
    },
    // 植物配置
    flora: {
      enabled: true,
      density: 0.20, // 森林植物密度更高
      types: [
        { type: 'shortGrass', plantId: PLANT_IDS.SHORT_GRASS, weight: 6 },
        { type: 'dandelion', plantId: PLANT_IDS.DANDELION, weight: 1 },
        { type: 'poppy', plantId: PLANT_IDS.POPPY, weight: 1 },
        { type: 'oxeyeDaisy', plantId: PLANT_IDS.OXEYE_DAISY, weight: 1 },
        { type: 'allium', plantId: PLANT_IDS.ALLIUM, weight: 1 },
        { type: 'pinkTulip', plantId: PLANT_IDS.PINK_TULIP, weight: 1 },
      ],
      allowedSurface: [BLOCK_IDS.GRASS],
    },
  },

  BIRCH_FOREST: {
    id: 'birchForest',
    name: '白桦木林',
    // Climate parameters
    tempRange: [0.1, 0.45], // Extend deeper into cold and slightly towards medium
    humidityRange: [0.3, 0.7], // Moderate humidity
    terrainParams: {
      heightOffset: 0, // 略高
      heightMagnitude: 1.5, // 中等偏小
    },
    blocks: {
      surface: BLOCK_IDS.GRASS,
      subsurface: BLOCK_IDS.DIRT,
      deep: BLOCK_IDS.STONE,
    },
    vegetation: {
      enabled: true,
      density: 0.10,
      types: [
        {
          type: 'birch',
          weight: 1,
          trunkBlock: BLOCK_IDS.BIRCH_TRUNK,
          leavesBlock: BLOCK_IDS.BIRCH_LEAVES,
          heightRange: [7, 9], // 白桦树通常更高
          canopyRadius: [4, 6],
        },
      ],
      allowedSurface: [BLOCK_IDS.GRASS],
    },
    // 植物配置
    flora: {
      enabled: true,
      density: 0.15,
      types: [
        { type: 'shortGrass', plantId: PLANT_IDS.SHORT_GRASS, weight: 5 },
        { type: 'dandelion', plantId: PLANT_IDS.DANDELION, weight: 1 },
        { type: 'poppy', plantId: PLANT_IDS.POPPY, weight: 1 },
        { type: 'oxeyeDaisy', plantId: PLANT_IDS.OXEYE_DAISY, weight: 1 },
      ],
      allowedSurface: [BLOCK_IDS.GRASS],
    },
  },

  CHERRY_FOREST: {
    id: 'cherryForest',
    name: '樱花树林',
    // Climate parameters
    tempRange: [0.5, 0.75],
    humidityRange: [0.5, 0.85],
    terrainParams: {
      heightOffset: 0, // 基准
      heightMagnitude: 3.0, // 中等
    },
    blocks: {
      surface: BLOCK_IDS.GRASS,
      subsurface: BLOCK_IDS.DIRT,
      deep: BLOCK_IDS.STONE,
    },
    vegetation: {
      enabled: true,
      density: 0.06,
      types: [
        {
          type: 'cherry',
          weight: 1,
          trunkBlock: BLOCK_IDS.CHERRY_TRUNK,
          leavesBlock: BLOCK_IDS.CHERRY_LEAVES,
          heightRange: [4, 6],
          canopyRadius: [4, 6],
        },
      ],
      allowedSurface: [BLOCK_IDS.GRASS],
    },
    // 植物配置（樱花林以粉色花朵为主）
    flora: {
      enabled: true,
      density: 0.18, // 增加密度以凸显樱花林的粉色花海效果
      types: [
        { type: 'shortGrass', plantId: PLANT_IDS.SHORT_GRASS, weight: 3 },
        { type: 'cactusFlower', plantId: PLANT_IDS.CACTUS_FLOWER, weight: 6 }, // 粉色花朵大量出现
        { type: 'pinkTulip', plantId: PLANT_IDS.PINK_TULIP, weight: 3 }, // 粉色郁金香配合
        { type: 'allium', plantId: PLANT_IDS.ALLIUM, weight: 1 },
      ],
      allowedSurface: [BLOCK_IDS.GRASS],
    },
  },

  DESERT: {
    id: 'desert',
    name: '沙漠',
    // Climate parameters
    tempRange: [0.6, 1.0], // Start closer to center (0.6) to appear more often
    humidityRange: [0.0, 0.45], // Allow a bit more humidity
    terrainParams: {
      heightOffset: 0, // 基准或略低
      heightMagnitude: 3.0, // 较大，沙丘起伏
    },
    blocks: {
      surface: BLOCK_IDS.SAND, // 地表是沙子
      subsurface: BLOCK_IDS.SAND, // 土层也是沙子
      deep: BLOCK_IDS.STONE,
    },
    vegetation: {
      enabled: true,
      density: 0.15,
      types: [
        {
          type: 'cactus',
          weight: 1,
          trunkBlock: BLOCK_IDS.CACTUS,
          leavesBlock: null, // 仙人掌无树叶
          heightRange: [1, 3], // 高度较小
          canopyRadius: [0, 0], // 无树冠
        },
      ],
      allowedSurface: [BLOCK_IDS.SAND],
    },
    flora: {
      enabled: true,
      density: 0.03, // 稀疏
      types: [
        { type: 'deadBush', plantId: PLANT_IDS.DEAD_BUSH, weight: 1 },
        { type: 'shortDryGrass', plantId: PLANT_IDS.SHORT_DRY_GRASS, weight: 2 },
      ],
      allowedSurface: [BLOCK_IDS.SAND],
    },
  },

  BADLANDS: {
    id: 'badlands',
    name: '恶地',
    // Climate parameters
    tempRange: [0.55, 0.9], // Overlaps with Desert but distinct band
    humidityRange: [0.0, 0.25],
    terrainParams: {
      heightOffset: 0, // 较高
      heightMagnitude: 5,
    },
    blocks: {
      // 恶地使用陶瓦或红沙（随机选择，这里先使用陶瓦，后续可扩展）
      surface: BLOCK_IDS.TERRACOTTA,
      subsurface: BLOCK_IDS.TERRACOTTA,
      deep: BLOCK_IDS.STONE,
    },
    vegetation: {
      enabled: false, // 无植被
      density: 0,
      types: [],
      allowedSurface: [],
    },
    // 恶地植物配置（枯草和死灌木）
    flora: {
      enabled: true,
      density: 0.05, // 稀疏
      types: [
        { type: 'deadBush', plantId: PLANT_IDS.DEAD_BUSH, weight: 1 },
        { type: 'shortDryGrass', plantId: PLANT_IDS.SHORT_DRY_GRASS, weight: 2 },
      ],
      allowedSurface: [BLOCK_IDS.TERRACOTTA, BLOCK_IDS.RED_SAND],
    },
  },

  FROZEN_OCEAN: {
    id: 'frozenOcean',
    name: '冻洋',
    // Climate parameters
    tempRange: [0.0, 0.25], // Raise ceiling slightly
    humidityRange: [0.5, 1.0],
    terrainParams: {
      heightOffset: 0, // 很低，大部分在水下
      heightMagnitude: 4, // 很小，海底较平坦
    },
    blocks: {
      // 冻洋使用冰或压缩冰（随机选择，这里先使用冰）
      surface: BLOCK_IDS.ICE,
      subsurface: BLOCK_IDS.GRAVEL, // 水下使用沙砾
      deep: BLOCK_IDS.PACKED_ICE,
    },
    vegetation: {
      enabled: false, // 无树
      density: 0,
      types: [],
      allowedSurface: [],
    },
  },
}

/**
 * 根据群系 ID 获取群系配置
 * @param {string} biomeId - 群系 ID
 * @returns {object|null} 群系配置，不存在返回 null
 */
export function getBiomeConfig(biomeId) {
  for (const biome of Object.values(BIOMES)) {
    if (biome.id === biomeId) {
      return biome
    }
  }
  return null
}

/**
 * 获取所有群系 ID 列表
 * @returns {string[]} 群系 ID 数组
 */
export function getAllBiomeIds() {
  return Object.values(BIOMES).map(biome => biome.id)
}
