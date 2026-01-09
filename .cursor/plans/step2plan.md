---

## name: STEP 2 - 群系生成器阶段

overview: 引入真正的"群系生成逻辑"，基于温度/湿度噪声图自动生成群系，并将生成结果注入现有地形修改流程。从 Panel 控制平滑迁移到自动生成。
todos: []

# STEP 2：Cellular + 约束版 Biome 生成器设计文档

> 本文档定义 **STEP 2 群系生成阶段** 的最终实现方案。
> 目标是在不引入 STEP 3（河流 / 大地形 / 特殊地貌）的前提下，
> 使用 **Cellular Noise + 气候约束** 构建一个 **稳定、简洁、可扩展** 的 Biome 系统。

---

## 1. 设计目标

### 核心目标

- 自动生成群系（Biome）
- 群系跨 Chunk 连贯
- 群系边界支持平滑过渡
- 避免不合理的生态相邻（如 冻洋 紧邻 沙漠）
- TerrainGenerator **不参与任何 biome 决策逻辑**

### 非目标（STEP 2 不做）

- ❌ 河流系统
- ❌ 山脉主脊
- ❌ 侵蚀 / 气候模拟
- ❌ 高度影响气候

---

## 2. 总体思路（一句话）

> **Cellular Noise 决定空间分区与边界**
> **低频温度噪声仅用于"生态合法性约束"**

- Cellular：谁在哪、边界在哪
- Temperature：哪些 biome 允许出现
- 不使用温度/湿度来"推导" biome
- 不在 STEP 2 中引入生态因果模型

---

## 3. 系统结构

```
BiomeGenerator
 ├─ CellularNoise   → Biome 分区（主权）
 ├─ TemperatureNoise → 气候区段（约束）
 ├─ BiomeSelector   → Cell → Biome（确定性）
 └─ EdgeBlend       → 平滑过渡权重
```

TerrainGenerator：

> 只消费 BiomeData，不判断、不推理、不混合规则

## 4. Biome 配置（biome-config.js）

```js
export const BIOMES = {
  PLAINS: {
    id: 'plains',
    name: '平原',
    climate: 'temperate', // 新增：气候标签（用于生态约束）

    // 地形参数（高度、振幅等）
    terrainParams: {
      heightOffset: 0, // 高度偏移（相对基准）
      heightMagnitude: 0.5, // 振幅倍数（地形平坦度）
    },

    // 方块映射（地表/土层/深层）
    blocks: {
      surface: BLOCK_IDS.GRASS, // 地表方块
      subsurface: BLOCK_IDS.DIRT, // 土层方块
      deep: BLOCK_IDS.STONE, // 深层方块
    },

    // 植被配置（树木）
    vegetation: {
      enabled: true,
      density: 0.03, // 树木密度
      types: [{
        type: 'oak',
        weight: 1,
        trunkBlock: BLOCK_IDS.TREE_TRUNK,
        leavesBlock: BLOCK_IDS.TREE_LEAVES,
        heightRange: [4, 6],
        canopyRadius: [3, 4],
      }],
      allowedSurface: [BLOCK_IDS.GRASS],
    },

    // 植物配置（草、花等）
    flora: {
      enabled: true,
      density: 0.15, // 植物密度
      types: [
        { type: 'shortGrass', plantId: PLANT_IDS.SHORT_GRASS, weight: 5 },
        { type: 'dandelion', plantId: PLANT_IDS.DANDELION, weight: 1 },
        // ... 其他花朵类型
      ],
      allowedSurface: [BLOCK_IDS.GRASS],
    },
  },

  FOREST: {
    id: 'forest',
    name: '森林',
    climate: 'temperate',

    terrainParams: {
      heightOffset: 2,
      heightMagnitude: 2.0,
    },

    blocks: {
      surface: BLOCK_IDS.GRASS,
      subsurface: BLOCK_IDS.DIRT,
      deep: BLOCK_IDS.STONE,
    },

    vegetation: {
      enabled: true,
      density: 0.15, // 森林树木密度更高
      types: [{
        type: 'oak',
        weight: 1,
        trunkBlock: BLOCK_IDS.TREE_TRUNK,
        leavesBlock: BLOCK_IDS.TREE_LEAVES,
        heightRange: [4, 6],
        canopyRadius: [3, 4],
      }],
      allowedSurface: [BLOCK_IDS.GRASS],
    },

    flora: {
      enabled: true,
      density: 0.20, // 森林植物密度更高
      types: [
        { type: 'shortGrass', plantId: PLANT_IDS.SHORT_GRASS, weight: 6 },
        { type: 'dandelion', plantId: PLANT_IDS.DANDELION, weight: 1 },
        // ... 更多花朵类型
      ],
      allowedSurface: [BLOCK_IDS.GRASS],
    },
  },

  // ... 其他群系配置（DESERT: climate 'hot', FROZEN_OCEAN: climate 'cold'）
}
```

说明：
- **保留所有实际意义的配置项**：terrainParams、blocks、vegetation、flora
- **新增 climate 标签**：仅用于 Cellular + 约束方案的生态合法性检查
- **climate 不是数值模型**：只是简单的字符串标签（'cold', 'temperate', 'hot'）

---

## 5. 气候约束规则（防奇葩生态）

```js
const CLIMATE_RULES = [
  { temp: [0.0, 0.3], climates: ['cold'] },
  { temp: [0.3, 0.7], climates: ['temperate'] },
  { temp: [0.7, 1.0], climates: ['hot'] },
]
```

作用：

- 冻区不会生成沙漠
- 热区不会生成冻洋
- 不参与边界与混合计算

## 6. BiomeGenerator 实现要点

> **BiomeGenerator 只负责生成 biome ID**，具体的 biome 配置（terrainParams、blocks、vegetation、flora）仍然存储在 `biome-config.js` 中，由 TerrainGenerator 通过 `getBiomeConfig(biomeId)` 获取。

### 6.1 构造函数

```js
class BiomeGenerator {
  constructor(seed) {
    this.seed = seed
    this.cellScale = 256
    this.edgeBlendWidth = 0.15

    this.cellNoise = new WorleyNoise(seed)
    this.tempNoise = new SimplexNoise(seed + 999)
  }
}
```

---

### 6.2 温度采样（仅用于约束）

```js
_getTemperature(wx, wz) {
  const n = this.tempNoise.noise(wx / 800, wz / 800)
  return n * 0.5 + 0.5
}
```

- 低频
- 大尺度
- 不参与平滑与权重

---

### 6.3 获取允许的 Biome 集合

```js
_getAllowedBiomes(temp) {
  const rule = CLIMATE_RULES.find(
    r => temp >= r.temp[0] && temp < r.temp[1]
  )

  return Object.values(BIOMES)
    .filter(b => rule.climates.includes(b.climate))
    .map(b => b.id)
}
```

---

### 6.4 Cell → Biome（确定性）

```js
_selectBiomeForCell(cellId, allowedBiomes) {
  const hash = hash1D(cellId + this.seed)
  const index = Math.floor(hash * allowedBiomes.length)
  return allowedBiomes[index]
}
```

保证：

- 同一个 cell 永远是同一个 biome
- seed 改变 → 世界整体改变

---

### 6.5 生成 BiomeData（核心）

```js
getBiomeData(wx, wz) {
  const { F1, F2, cellId1, cellId2 } =
    this.cellNoise.sample(wx / this.cellScale, wz / this.cellScale)

  const temp = this._getTemperature(wx, wz)
  const allowed = this._getAllowedBiomes(temp)

  const biome1 = this._selectBiomeForCell(cellId1, allowed)
  const biome2 = this._selectBiomeForCell(cellId2, allowed)

  const edge = Math.min(1, (F2 - F1) / this.edgeBlendWidth)

  if (edge < 1) {
    return {
      primary: biome1,
      weights: {
        [biome1]: 1 - edge,
        [biome2]: edge,
      },
      temp,
    }
  }

  return {
    primary: biome1,
    weights: null,
    temp,
  }
}
```

**BiomeData 输出格式**：
```js
{
  primary: 'plains',  // biome ID 字符串
  weights: {          // 边界混合权重（可选）
    'plains': 0.7,
    'forest': 0.3,
  },
  temp: 0.6,          // 温度值（可选，用于调试）
}
```

**重要说明**：
- BiomeGenerator **只返回 biome ID**，不包含具体的 biome 配置
- 具体的 terrainParams、blocks、vegetation、flora 配置仍然在 `biome-config.js` 中
- TerrainGenerator 通过 `getBiomeConfig(biomeData.primary)` 获取完整配置

---

## 7. Chunk 级群系图生成

```js
generateBiomeMap(originX, originZ, chunkSize) {
  const map = []

  for (let x = 0; x < chunkSize; x++) {
    map[x] = []
    for (let z = 0; z < chunkSize; z++) {
      const wx = originX + x
      const wz = originZ + z
      map[x][z] = this.getBiomeData(wx, wz)
    }
  }

  return map
}
```

满足以上条件后，群系系统核心功能完成。后续可进行优化和扩展（如添加新群系、优化过渡算法等）。

---

## 8. TerrainGenerator 的使用方式

```js
const biomeData = biomeMap[x][z]

if (biomeData.weights) {
  offset = blend(biomeData.weights, 'heightOffset')
} else {
  offset = BIOMES[biomeData.primary].terrain.heightOffset
}
```

TerrainGenerator：

- 不关心 Cellular
- 不关心 Temperature
- 不关心规则来源

---

## 9. STEP 2 完成验收标准

STEP 2 被认为完成，必须满足：

1. 同一 seed → biome 分布完全一致
2. chunk 边界 biome 连贯
3. 冻区不会生成沙漠
4. biome 边界平滑、无硬切
5. TerrainGenerator 不包含 biome 判定逻辑

---

## 10. 结论

该方案在 STEP 2 阶段实现了：

- **职责清晰分离**：BiomeGenerator 只生成 biome ID，biome-config.js 保留所有具体配置
- **稳定的 biome 空间分区**：Cellular Noise 确保跨 chunk 连贯性
- **简洁可控的生态约束**：温度噪声 + climate 标签防奇葩生态
- **保留实际意义配置**：terrainParams、blocks、vegetation、flora 等都有实际作用
- **最低的认知与维护成本**：不引入复杂的生态因果模型
- **为后续 STEP 3 留出充分扩展空间**（但不提前引入）

**STEP 2 至此闭环完成。**