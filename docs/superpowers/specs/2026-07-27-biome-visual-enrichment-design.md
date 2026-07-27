# 冻洋 / 恶地群系视觉丰富化设计

- 日期：2026-07-27
- 状态：已获用户批准
- 范围：新增方块类型 + 开源贴图 + 地形轮廓塑形（方案一：通用机制）

## 背景与问题

- **冻洋**（`src/js/world/terrain/biome-config.js` FROZEN_OCEAN）：地表固定 `ICE`，植被与植物全关，整片纯冰面。
- **恶地**（BADLANDS）：地表/土层固定黄色陶瓦，无植被，flora 仅枯灌木 + 短干草；`allowedSurface` 中的 `RED_SAND` 实际从未生成（水下/水岸被 `getCategoricalBiomeBlocks` 统一覆盖为普通沙）。
- 已加载但未使用的素材：`terracotta_red.png`、`snow.png`、`ice_packed.png`、`red_sand.png`。

## 总体方案

为群系配置引入三个通用/半通用机制（地表变体、条纹层、地形塑形），并复用植被管线添加装饰物。所有机制均为可选配置，缺省时行为与现状完全一致，其他群系零影响。

## 1. 新增方块与贴图

| 方块 | 用途 | 贴图 |
|---|---|---|
| `BLUE_ICE` 蓝冰 | 冻洋斑块 + 冰刺核心 | `blue_ice.png`（开源库抓取） |
| `WHITE_TERRACOTTA` 白陶瓦 | 恶地条纹层 | `white_terracotta.png`（开源库抓取） |
| `ORANGE_TERRACOTTA` 橙陶瓦 | 恶地条纹层 | `orange_terracotta.png`（开源库抓取） |
| `RED_TERRACOTTA` 红陶瓦 | 恶地条纹层 | 复用已加载的 `terracotta_red.png` |

贴图来源：GitHub 开源 Minecraft 资产镜像（如 `InventivetalentDev/minecraft-assets`），16×16 PNG，存入 `static/textures/blocks/` 并在 `src/js/sources.js` 登记。

回退策略：贴图抓取失败 → 跳过对应新方块，条纹层/斑块配置中该方块回退为现有方块（黄陶瓦 / 普通冰），不阻塞构建与运行。

## 2. 地表变体机制（通用）

`blocks` 配置新增可选字段：

```js
surfaceVariants: [
  { blockId: BLOCK_IDS.PACKED_ICE, weight: 3 },
  { blockId: BLOCK_IDS.SNOW,       weight: 1 },
]
```

- 生成时使用独立的低频 2D 噪声通道（与地形噪声不同尺度与相位），按权重选块，保证变体呈成片斑块而非逐格散点。
- 冻洋：冰 60% / 浮冰 30% / 雪 10%。
- 恶地：陶瓦 70% / 红沙 30%。
- 改动点：`terrain-biome-field.js` 的 `getCategoricalBiomeBlocks`（或新增选块函数），无 `surfaceVariants` 的群系走原逻辑。

## 3. 恶地陶瓦条纹层（banding）

恶地专属配置：

```js
strata: {
  bands: [RED_TERRACOTTA, ORANGE_TERRACOTTA, TERRACOTTA, WHITE_TERRACOTTA],
  bandHeight: 4,      // 每层厚度（方块）
  noiseAmplitude: 6,  // 条纹纵向扰动幅度
}
```

- 层索引：`floor((y + noise2D(wx, wz) × noiseAmplitude) / bandHeight) % bands.length`
- 作用于恶地的地表与土层，形成红黄相间的条纹悬崖。
- 红沙斑块（第 2 节）位于最表层时优先级高于条纹层。

## 4. 地形塑形（terrainShape）

`biome-terrain-profile.js` 高度函数以可混合方式加入可选塑形：

- **恶地 `plateau`**：对噪声做阶梯量化（terrace），`plateauAmount ∈ [0,1]` 随群系权重混合。恶地核心为平顶台地 + 陡崖，群系边界平滑过渡回丘陵。
- **冻洋 `ridged`**：脊状噪声（`1 − |noise|`）替换普通 fBm 输出并放大振幅，形成尖锐的冰山基底起伏，同样按权重混合。
- 缺省时高度计算与现状完全一致。

## 5. 装饰物（复用植被管线）

- **冻洋·冰刺**：`tree-shape.js` 新增 `'spike'` 形状——底部 3×3 逐层收分至 1×1 尖顶；柱体 `PACKED_ICE`，核心少量 `BLUE_ICE`；`heightRange: [6, 14]`；密度约 0.3；生成于冰面。
- **冻洋·水下层**：`getCategoricalBiomeBlocks` 支持群系自定义水下地表——冻洋水下用 `GRAVEL`（现有配置未生效的意图），恶地水岸/水下用 `RED_SAND`。
- **恶地·枯树**：复用 `shape: 'none'` 纯树干（`TREE_TRUNK`），`heightRange: [2, 4]`，极低密度。
- **恶地·仙人掌**：仅生成于红沙斑块（`allowedSurface: [RED_SAND]`），形成"红沙区仙人掌、陶瓦区枯树枯草"的分区感。

## 6. 错误处理

- 贴图缺失：第 1 节回退策略；`createMaterials` 现有缺失纹理返回 null 的行为保持不变。
- `validateBiomeDefinitions` 扩展校验新字段（`surfaceVariants` 权重非负、`strata.bands` 非空、`bandHeight ≥ 1`），非法配置在生成前抛错而非产生坏地形。

## 7. 验证

- 调试面板强制群系逐个目检：恶地检查条纹层 + 红沙斑块 + 平顶山轮廓；冻洋检查冰刺 + 冰面混合 + 水下沙砾。
- `calculateBiomeTerrainHeight` 与 `getCategoricalBiomeBlocks` 为纯函数，补充/更新单测覆盖塑形混合与变体选块。
- `pnpm lint`、`pnpm build` 通过；涉及运行时行为变化的部分运行对应 Playwright 测试。
- 性能：新增噪声为每列一次 2D 采样，开销可忽略；装饰物走现有体素放置管线。

## 非目标（YAGNI）

- 不拆分子群系（冰刺冻洋 / 繁茂恶地作为独立 biome）。
- 不引入 WebGL 回退、不改渲染管线。
- 不为其他群系（平原/森林等）添加变体，机制就绪但不在本次配置。
