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
    climate: {
      temperature: 0.50,
      humidity: 0.45,
    },
    // 地形参数（用于后续生成器）
    terrainParams: {
      heightOffset: 0, // 高度偏移（相对基准）
      roughness: 0.75,
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
          shape: 'oak',
          weight: 1, // 权重（用于随机选择）
          trunkBlock: BLOCK_IDS.TREE_TRUNK,
          leavesBlock: BLOCK_IDS.TREE_LEAVES,
          heightRange: [5, 7], // 至少两格树干露在树冠下
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
    climate: {
      temperature: 0.48,
      humidity: 0.78,
    },
    terrainParams: {
      heightOffset: 0, // 略高
      roughness: 1.10,
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
          shape: 'oak',
          weight: 1,
          trunkBlock: BLOCK_IDS.TREE_TRUNK,
          leavesBlock: BLOCK_IDS.TREE_LEAVES,
          heightRange: [5, 7],
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
    climate: {
      temperature: 0.25,
      humidity: 0.45,
    },
    terrainParams: {
      heightOffset: 0, // 略高
      roughness: 0.95,
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
          shape: 'birch',
          weight: 1,
          trunkBlock: BLOCK_IDS.BIRCH_TRUNK,
          leavesBlock: BLOCK_IDS.BIRCH_LEAVES,
          heightRange: [7, 9], // 白桦树通常更高
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
    climate: {
      temperature: 0.78,
      humidity: 0.72,
    },
    terrainParams: {
      heightOffset: 0, // 基准
      roughness: 1.10,
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
          shape: 'cherry',
          weight: 1,
          trunkBlock: BLOCK_IDS.CHERRY_TRUNK,
          leavesBlock: BLOCK_IDS.CHERRY_LEAVES,
          heightRange: [5, 7],
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
    climate: {
      temperature: 0.88,
      humidity: 0.18,
    },
    terrainParams: {
      heightOffset: 1,
      roughness: 1.15,
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
          shape: 'none',
          weight: 1,
          trunkBlock: BLOCK_IDS.CACTUS,
          leavesBlock: null, // 仙人掌无树叶
          heightRange: [1, 3], // 高度较小
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
    climate: {
      temperature: 0.55,
      humidity: 0.10,
    },
    terrainParams: {
      heightOffset: 2, // 较高
      roughness: 1.35,
      // 平顶山塑形：阶梯量化噪声，形成台地 + 陡崖
      shape: { type: 'plateau', levels: 4, amount: 1 },
    },
    blocks: {
      surface: BLOCK_IDS.TERRACOTTA,
      subsurface: BLOCK_IDS.TERRACOTTA,
      deep: BLOCK_IDS.STONE,
      // 地表变体：陶瓦 + 红沙斑块
      surfaceVariants: [
        { blockId: BLOCK_IDS.TERRACOTTA, weight: 7 },
        { blockId: BLOCK_IDS.RED_SAND, weight: 3 },
      ],
      // 水下与水岸使用红沙
      underwater: {
        surface: BLOCK_IDS.RED_SAND,
        subsurface: BLOCK_IDS.RED_SAND,
      },
    },
    // 陶瓦条纹层：红黄白橙按高度成带，噪声扰动层界
    strata: {
      bands: [
        BLOCK_IDS.RED_TERRACOTTA,
        BLOCK_IDS.ORANGE_TERRACOTTA,
        BLOCK_IDS.TERRACOTTA, // 黄
        BLOCK_IDS.WHITE_TERRACOTTA,
      ],
      bandHeight: 4,
      noiseAmplitude: 6,
    },
    vegetation: {
      enabled: true,
      density: 0.08, // 稀疏枯树与仙人掌
      types: [
        {
          type: 'deadTree',
          shape: 'none',
          weight: 3,
          trunkBlock: BLOCK_IDS.TREE_TRUNK,
          leavesBlock: null, // 枯树无叶
          heightRange: [2, 4],
        },
        {
          type: 'cactus',
          shape: 'none',
          weight: 2,
          trunkBlock: BLOCK_IDS.CACTUS,
          leavesBlock: null,
          heightRange: [1, 3],
          allowedSurface: [BLOCK_IDS.RED_SAND], // 仙人掌仅长在红沙斑块
        },
      ],
      allowedSurface: [
        BLOCK_IDS.TERRACOTTA,
        BLOCK_IDS.RED_TERRACOTTA,
        BLOCK_IDS.ORANGE_TERRACOTTA,
        BLOCK_IDS.WHITE_TERRACOTTA,
        BLOCK_IDS.RED_SAND,
      ],
    },
    // 恶地植物配置（枯草和死灌木）
    flora: {
      enabled: true,
      density: 0.05, // 稀疏
      types: [
        { type: 'deadBush', plantId: PLANT_IDS.DEAD_BUSH, weight: 1 },
        { type: 'shortDryGrass', plantId: PLANT_IDS.SHORT_DRY_GRASS, weight: 2 },
      ],
      allowedSurface: [
        BLOCK_IDS.TERRACOTTA,
        BLOCK_IDS.RED_TERRACOTTA,
        BLOCK_IDS.ORANGE_TERRACOTTA,
        BLOCK_IDS.WHITE_TERRACOTTA,
        BLOCK_IDS.RED_SAND,
      ],
    },
  },

  FROZEN_OCEAN: {
    id: 'frozenOcean',
    name: '冻洋',
    climate: {
      temperature: 0.10,
      humidity: 0.80,
    },
    terrainParams: {
      heightOffset: 0, // 很低，大部分在水下
      roughness: 0.80,
      // 脊状噪声塑形：尖锐冰山基底起伏
      shape: { type: 'ridged', gain: 1.6, amount: 1 },
    },
    blocks: {
      surface: BLOCK_IDS.ICE,
      subsurface: BLOCK_IDS.GRAVEL, // 水下使用沙砾
      deep: BLOCK_IDS.PACKED_ICE,
      // 地表变体：冰 / 浮冰 / 雪盖斑块
      surfaceVariants: [
        { blockId: BLOCK_IDS.ICE, weight: 6 },
        { blockId: BLOCK_IDS.PACKED_ICE, weight: 3 },
        { blockId: BLOCK_IDS.SNOW, weight: 1 },
      ],
      // 水下地表使用沙砾
      underwater: {
        surface: BLOCK_IDS.GRAVEL,
        subsurface: BLOCK_IDS.GRAVEL,
      },
    },
    vegetation: {
      enabled: true,
      density: 0.3, // 冰刺（约每 chunk 个位数）
      types: [
        {
          type: 'iceSpike',
          shape: 'spike', // 底部 3x3 收分至 1x1 尖顶
          weight: 1,
          trunkBlock: BLOCK_IDS.PACKED_ICE,
          coreBlock: BLOCK_IDS.BLUE_ICE, // 核心点缀蓝冰
          coreChance: 0.35,
          leavesBlock: null,
          heightRange: [6, 14],
          allowedSurface: [BLOCK_IDS.ICE, BLOCK_IDS.PACKED_ICE, BLOCK_IDS.SNOW],
        },
      ],
      allowedSurface: [BLOCK_IDS.ICE, BLOCK_IDS.PACKED_ICE, BLOCK_IDS.SNOW],
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
