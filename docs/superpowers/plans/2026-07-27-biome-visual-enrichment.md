# 冻洋 / 恶地群系视觉丰富化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让冻洋（纯冰面）和恶地（单色陶瓦）两个群系获得地形塑形、地表斑块、条纹层和装饰物，消除视觉单调。

**Architecture:** 全部机制做成群系配置的可选字段（`terrainParams.shape`、`blocks.surfaceVariants`、`blocks.underwater`、`strata`、植被 `coreBlock`/per-type `allowedSurface`），缺省时行为与现状完全一致，其他群系零影响。纯函数（高度计算、选块）集中在 `biome-terrain-profile.js` / `terrain-biome-field.js`，配最小单测。

**Tech Stack:** Vite + Three.js (WebGPU/TSL)、`node:test` 单元测试、pnpm。

## Global Constraints

- 遵循 AGENTS.md：纯 JS ES modules、显式 `.js` 扩展名、Antfu 风格（两空格缩进、无分号、单引号、多行尾逗号）。
- 使用 pnpm；单元测试运行命令为 `node --test tests/unit/*.unit.js`（当前 124 个全过）。
- 提交信息用 Conventional Commits。
- 贴图来源已验证可用（HTTP 200）：`https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21/assets/minecraft/textures/block/{blue_ice,white_terracotta,orange_terracotta}.png`
- 新方块 ID：`BLUE_ICE: 24`、`RED_TERRACOTTA: 25`、`WHITE_TERRACOTTA: 26`、`ORANGE_TERRACOTTA: 27`。
- 设计文档：`docs/superpowers/specs/2026-07-27-biome-visual-enrichment-design.md`。

---

### Task 1: 贴图抓取与方块注册

**Files:**
- Create: `static/textures/blocks/blue_ice.png`、`white_terracotta.png`、`orange_terracotta.png`
- Modify: `src/js/sources.js`（在 `packedIce_Texture` 条目后追加）
- Modify: `src/js/world/terrain/blocks-config.js`（BLOCK_IDS 与 blocks）

**Interfaces:**
- Produces: `BLOCK_IDS.BLUE_ICE / RED_TERRACOTTA / WHITE_TERRACOTTA / ORANGE_TERRACOTTA`（24-27）；纹理键 `blueIce_Texture`、`whiteTerracotta_Texture`、`orangeTerracotta_Texture`、复用 `terracotta_red`。

- [ ] **Step 1: 抓取三张 16×16 贴图并验证**

```bash
cd static/textures/blocks
curl -sL -o blue_ice.png https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21/assets/minecraft/textures/block/blue_ice.png
curl -sL -o white_terracotta.png https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21/assets/minecraft/textures/block/white_terracotta.png
curl -sL -o orange_terracotta.png https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21/assets/minecraft/textures/block/orange_terracotta.png
python -c "from PIL import Image; [print(f, Image.open('static/textures/blocks/'+f).size) for f in ['blue_ice.png','white_terracotta.png','orange_terracotta.png']]"
```
（第二行在仓库根目录执行）Expected: 三张均为 `(16, 16)`。

- [ ] **Step 2: `sources.js` 在 `packedIce_Texture` 条目（第 193-197 行）后追加**

```js
  // ===== 蓝冰 / 白陶瓦 / 橙陶瓦（体素方块）=====
  {
    name: 'blueIce_Texture',
    type: 'texture',
    path: 'textures/blocks/blue_ice.png',
  },
  {
    name: 'whiteTerracotta_Texture',
    type: 'texture',
    path: 'textures/blocks/white_terracotta.png',
  },
  {
    name: 'orangeTerracotta_Texture',
    type: 'texture',
    path: 'textures/blocks/orange_terracotta.png',
  },
```

- [ ] **Step 3: `blocks-config.js` BLOCK_IDS 在 `CRAFTING_TABLE: 23` 后追加**

```js
  // 群系丰富化新增
  BLUE_ICE: 24,
  RED_TERRACOTTA: 25,
  WHITE_TERRACOTTA: 26,
  ORANGE_TERRACOTTA: 27,
```

- [ ] **Step 4: `blocks-config.js` blocks 在 `craftingTable` 条目后追加**

```js
  // ===== 群系丰富化新增 =====
  blueIce: {
    id: BLOCK_IDS.BLUE_ICE,
    name: 'blue_ice',
    visible: true,
    textureKeys: {
      all: 'blueIce_Texture',
    },
  },
  redTerracotta: {
    id: BLOCK_IDS.RED_TERRACOTTA,
    name: 'red_terracotta',
    visible: true,
    textureKeys: {
      all: 'terracotta_red', // 已在 sources.js 中加载
    },
  },
  whiteTerracotta: {
    id: BLOCK_IDS.WHITE_TERRACOTTA,
    name: 'white_terracotta',
    visible: true,
    textureKeys: {
      all: 'whiteTerracotta_Texture',
    },
  },
  orangeTerracotta: {
    id: BLOCK_IDS.ORANGE_TERRACOTTA,
    name: 'orange_terracotta',
    visible: true,
    textureKeys: {
      all: 'orangeTerracotta_Texture',
    },
  },
```

- [ ] **Step 5: 验证 + 提交**

```bash
node -e "import('./src/js/world/terrain/blocks-config.js').then(m => console.log(m.BLOCK_IDS.BLUE_ICE, m.blocks.orangeTerracotta.name))"
```
Expected: `24 orange_terracotta`

```bash
git add static/textures/blocks src/js/sources.js src/js/world/terrain/blocks-config.js
git commit -m "feat(biome): register blue ice and terracotta variant blocks"
```

---

### Task 2: 地形塑形（plateau / ridged）

**Files:**
- Modify: `src/js/world/terrain/biome-terrain-profile.js`
- Test: `tests/unit/biome-visual-enrichment.unit.js`（新建，本任务写入第一节）

**Interfaces:**
- Consumes: 群系 `terrainParams.shape`（Task 5 配置，可选：`{ type: 'plateau', levels, amount }` 或 `{ type: 'ridged', gain, amount }`）。
- Produces: `blendBiomeTerrainShape(weights, biomeDefinitions?) → { plateauAmount, plateauLevels, ridgedAmount, ridgedGain }`；`calculateBiomeTerrainHeight({ baseOffset, baseMagnitude, terrainNoise, weights, maxHeight, biomeDefinitions? })`（新增可选末参，透传给两个 blend 函数），行为在无 shape 时与现状完全一致。

- [ ] **Step 1: 写失败测试 `tests/unit/biome-visual-enrichment.unit.js`**

测试使用自带的群系定义（不依赖 Task 5 的配置落地顺序）：

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  blendBiomeTerrainShape,
  calculateBiomeTerrainHeight,
} from '../../src/js/world/terrain/biome-terrain-profile.js'

const SHAPED_BIOMES = {
  FLAT: {
    id: 'flat',
    climate: { temperature: 0.5, humidity: 0.5 },
    terrainParams: { heightOffset: 0, roughness: 0.75 },
  },
  MESA: {
    id: 'mesa',
    climate: { temperature: 0.5, humidity: 0.1 },
    terrainParams: {
      heightOffset: 2,
      roughness: 1.35,
      shape: { type: 'plateau', levels: 4, amount: 1 },
    },
  },
  RIDGE: {
    id: 'ridge',
    climate: { temperature: 0.1, humidity: 0.8 },
    terrainParams: {
      heightOffset: 0,
      roughness: 0.8,
      shape: { type: 'ridged', gain: 1.6, amount: 1 },
    },
  },
}

test('shape blending defaults to zero for shapeless biomes', () => {
  assert.deepEqual(blendBiomeTerrainShape({ flat: 1 }, SHAPED_BIOMES), {
    plateauAmount: 0,
    plateauLevels: 4,
    ridgedAmount: 0,
    ridgedGain: 1.5,
  })
})

test('shape amounts blend with biome weights', () => {
  const shaped = blendBiomeTerrainShape({ mesa: 0.5, flat: 0.5 }, SHAPED_BIOMES)
  assert.equal(shaped.plateauAmount, 0.5)
  assert.equal(shaped.ridgedAmount, 0)

  const full = blendBiomeTerrainShape({ mesa: 1 }, SHAPED_BIOMES)
  assert.equal(full.plateauAmount, 1)
  assert.equal(full.plateauLevels, 4)

  const ridged = blendBiomeTerrainShape({ ridge: 1 }, SHAPED_BIOMES)
  assert.equal(ridged.ridgedAmount, 1)
  assert.ok(ridged.ridgedGain > 1)
})

test('height calculation is unchanged when no biome declares a shape', () => {
  const options = {
    baseOffset: 8,
    baseMagnitude: 6,
    terrainNoise: 0.5,
    weights: { plains: 0.75, desert: 0.25 },
    maxHeight: 31,
  }
  // 与塑形引入前相同的期望：floor(8 + 0.25 + 6 * 0.5 * 0.85) = floor(10.8) = 10
  assert.equal(calculateBiomeTerrainHeight(options), 10)
})

test('plateau shaping quantizes noise into terraces', () => {
  const heightAt = noise => calculateBiomeTerrainHeight({
    baseOffset: 8,
    baseMagnitude: 6,
    terrainNoise: noise,
    weights: { mesa: 1 },
    maxHeight: 63,
    biomeDefinitions: SHAPED_BIOMES,
  })
  // 同一台阶内的噪声值映射到相近高度，跨台阶出现跳变
  const low = heightAt(0.05)
  const mid = heightAt(0.45)
  const high = heightAt(0.55)
  assert.ok(high - low >= 2, `expected a terrace jump, got ${low} -> ${high}`)
  assert.ok(Math.abs(mid - high) <= 2 || high > mid)
  assert.ok(heightAt(1) <= 63 && heightAt(-1) >= 0)
})
```

- [ ] **Step 2: 运行确认失败**

```bash
node --test tests/unit/biome-visual-enrichment.unit.js
```
Expected: FAIL（`blendBiomeTerrainShape is not a function`）

- [ ] **Step 3: 实现 — `biome-terrain-profile.js` 在 `blendBiomeTerrainProfile` 之后追加，并替换 `calculateBiomeTerrainHeight`**

追加：

```js
const SHAPE_DEFAULTS = {
  plateau: { levels: 4 },
  ridged: { gain: 1.5 },
}

function smoothstep(t) {
  return t * t * (3 - 2 * t)
}

/**
 * Quantize a value into smooth-stepped terraces.
 * @param {number} value
 * @param {number} step Terrace height in blocks
 */
function terrace(value, step) {
  const scaled = value / step
  const base = Math.floor(scaled)
  return (base + smoothstep(scaled - base)) * step
}

/**
 * Blend terrain-shape parameters from biome weights.
 * Biomes without terrainParams.shape contribute nothing.
 *
 * @param {Record<string, number>} weights
 * @param {object} [biomeDefinitions]
 * @returns {{ plateauAmount: number, plateauLevels: number, ridgedAmount: number, ridgedGain: number }}
 */
export function blendBiomeTerrainShape(weights, biomeDefinitions = BIOMES) {
  let plateauAmount = 0
  let plateauLevels = 0
  let ridgedAmount = 0
  let ridgedGain = 0

  for (const [biomeId, weight] of Object.entries(weights)) {
    const biome = getBiomeFromDefinitions(biomeId, biomeDefinitions)
    if (!biome)
      throw new RangeError(`Unknown biome "${biomeId}"`)

    const shape = biome.terrainParams?.shape
    if (!shape || weight <= 0)
      continue

    const amount = (shape.amount ?? 1) * weight
    if (shape.type === 'plateau') {
      plateauAmount += amount
      plateauLevels += (shape.levels ?? SHAPE_DEFAULTS.plateau.levels) * amount
    }
    else if (shape.type === 'ridged') {
      ridgedAmount += amount
      ridgedGain += (shape.gain ?? SHAPE_DEFAULTS.ridged.gain) * amount
    }
  }

  return {
    plateauAmount: clamp(plateauAmount, 0, 1),
    plateauLevels: plateauAmount > 0
      ? plateauLevels / plateauAmount
      : SHAPE_DEFAULTS.plateau.levels,
    ridgedAmount: clamp(ridgedAmount, 0, 1),
    ridgedGain: ridgedAmount > 0
      ? ridgedGain / ridgedAmount
      : SHAPE_DEFAULTS.ridged.gain,
  }
}
```

`calculateBiomeTerrainHeight` 的 JSDoc 增加 `@param {object} [options.biomeDefinitions]`，解构增加 `biomeDefinitions = BIOMES`，函数体中 `const profile = ...` 到 `return clamp(...)` 的部分替换为：

```js
  const profile = blendBiomeTerrainProfile(weights, biomeDefinitions)
  const shape = blendBiomeTerrainShape(weights, biomeDefinitions)

  const range = baseMagnitude * profile.roughness
  let value = range * terrainNoise

  // 脊状噪声：1 - |noise| 形成尖锐峰线，按权重混合并放大振幅
  if (shape.ridgedAmount > 0) {
    const ridgedNoise = (1 - Math.abs(terrainNoise)) * 2 - 1
    const ridgedValue = ridgedNoise * range * shape.ridgedGain
    value = value * (1 - shape.ridgedAmount) + ridgedValue * shape.ridgedAmount
  }

  // 平顶山：阶梯量化，台阶之间用 smoothstep 保留可行走的坡面
  if (shape.plateauAmount > 0) {
    const step = Math.max(1, (2 * range) / shape.plateauLevels)
    const terraced = terrace(value, step)
    value = value * (1 - shape.plateauAmount) + terraced * shape.plateauAmount
  }

  const height = Math.floor(
    baseOffset
    + profile.heightOffset
    + value,
  )

  return clamp(height, 0, maxHeight)
```

- [ ] **Step 4: 运行全部单测**

```bash
node --test tests/unit/*.unit.js
```
Expected: 全部 PASS（含原有 124 个，总数 128）。

- [ ] **Step 5: 提交**

```bash
git add src/js/world/terrain/biome-terrain-profile.js tests/unit/biome-visual-enrichment.unit.js
git commit -m "feat(terrain): add blendable plateau and ridged biome terrain shaping"
```

---

### Task 3: 地表变体 / 条纹层 / 水下层

**Files:**
- Modify: `src/js/world/terrain/terrain-biome-field.js`
- Modify: `src/js/world/terrain/terrain-generator.js`（`_fillColumnLayers` 及其调用点）
- Modify: `src/js/world/terrain/biome-terrain-profile.js`（`validateBiomeDefinitions` 扩展）
- Test: `tests/unit/biome-visual-enrichment.unit.js`（追加）

**Interfaces:**
- Consumes: Task 1 的方块 ID；群系 `blocks.surfaceVariants` / `blocks.underwater` / `strata`（Task 5 配置）。
- Produces: `selectSurfaceVariant(variants, noiseValue) → number`；`selectStrataBlock(strata, y, noiseValue) → number`；`getCategoricalBiomeBlocks` 支持 `blocks.underwater` 覆盖。`_fillColumnLayers(x, z, surfaceHeight, biomeData, simplex)` 新增第 5 参。

- [ ] **Step 1: 追加失败测试**

```js
// 文件头部 import 追加：
// import { BLOCK_IDS } from '../../src/js/world/terrain/blocks-config.js'
// import { getCategoricalBiomeBlocks, selectStrataBlock, selectSurfaceVariant } from '../../src/js/world/terrain/terrain-biome-field.js'
// import { validateBiomeDefinitions } from '../../src/js/world/terrain/biome-terrain-profile.js'

test('surface variant buckets noise by cumulative weight', () => {
  const variants = [
    { blockId: BLOCK_IDS.ICE, weight: 3 },
    { blockId: BLOCK_IDS.SNOW, weight: 1 },
  ]
  assert.equal(selectSurfaceVariant(variants, -0.5), BLOCK_IDS.ICE)
  assert.equal(selectSurfaceVariant(variants, 0.9), BLOCK_IDS.SNOW)
  assert.throws(() => selectSurfaceVariant([], 0), RangeError)
  assert.throws(
    () => selectSurfaceVariant([{ blockId: 1, weight: 0 }], 0),
    RangeError,
  )
})

test('strata bands cycle by height with wrap-around', () => {
  const strata = { bands: [10, 11], bandHeight: 2, noiseAmplitude: 0 }
  assert.equal(selectStrataBlock(strata, 0, 0), 10)
  assert.equal(selectStrataBlock(strata, 2, 0), 11)
  assert.equal(selectStrataBlock(strata, 4, 0), 10)
  assert.equal(selectStrataBlock(strata, -1, 0), 11)
  assert.throws(() => selectStrataBlock({ bands: [] }, 0, 0), RangeError)
})

test('underwater blocks use biome override when declared', () => {
  assert.equal(
    getCategoricalBiomeBlocks({ dominantBiome: 'badlands', underwater: true, shore: false }).surface,
    BLOCK_IDS.RED_SAND,
  )
  assert.equal(
    getCategoricalBiomeBlocks({ dominantBiome: 'frozenOcean', underwater: true, shore: false }).surface,
    BLOCK_IDS.GRAVEL,
  )
  assert.equal(
    getCategoricalBiomeBlocks({ dominantBiome: 'desert', underwater: true, shore: false }).surface,
    BLOCK_IDS.SAND,
  )
})

test('biome validation rejects malformed variants and strata', () => {
  const base = {
    id: 'x',
    climate: { temperature: 0.5, humidity: 0.5 },
    terrainParams: { heightOffset: 0, roughness: 1 },
    blocks: { surface: 1, subsurface: 2, deep: 3 },
  }
  assert.throws(() => validateBiomeDefinitions({
    X: { ...base, blocks: { ...base.blocks, surfaceVariants: [] } },
  }), RangeError)
  assert.throws(() => validateBiomeDefinitions({
    X: { ...base, strata: { bands: [], bandHeight: 4 } },
  }), RangeError)
  assert.throws(() => validateBiomeDefinitions({
    X: { ...base, terrainParams: { ...base.terrainParams, shape: { type: 'spiral' } } },
  }), RangeError)
})
```

注意：其中"underwater override"两条断言依赖 Task 5 的群系配置；本任务先把 `desert` 断言跑通即可，badlands/frozenOcean 两条在 Task 5 后转绿（或本任务中先行加上配置里的 `underwater` 字段——推荐本任务直接在 `biome-config.js` 两个群系的 `blocks` 里加 `underwater`，Task 5 再做完整配置）。

- [ ] **Step 2: 运行确认失败**

```bash
node --test tests/unit/biome-visual-enrichment.unit.js
```
Expected: FAIL（selectSurfaceVariant / selectStrataBlock 未定义；underwater 断言失败）

- [ ] **Step 3: `terrain-biome-field.js` — 文件顶部加 clamp，追加两个纯函数，扩展 `getCategoricalBiomeBlocks`**

文件顶部（import 之后）加：

```js
function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}
```

文件末尾追加：

```js
/**
 * Pick one surface block from weighted variants using a low-frequency noise
 * value, so variants form coherent patches instead of per-block scatter.
 *
 * @param {Array<{ blockId: number, weight: number }>} variants
 * @param {number} noiseValue Simplex noise in [-1, 1]
 * @returns {number} Selected block ID
 */
export function selectSurfaceVariant(variants, noiseValue) {
  if (!Array.isArray(variants) || variants.length === 0)
    throw new RangeError('surfaceVariants must be a non-empty array')

  const totalWeight = variants.reduce((sum, variant) => sum + variant.weight, 0)
  if (totalWeight <= 0)
    throw new RangeError('surfaceVariants weights must sum to a positive value')

  const target = ((clamp(noiseValue, -1, 1) + 1) / 2) * totalWeight
  let cumulative = 0
  for (const variant of variants) {
    cumulative += variant.weight
    if (target < cumulative)
      return variant.blockId
  }
  return variants[variants.length - 1].blockId
}

/**
 * Pick a strata band block for one Y level. Bands cycle with wrap-around and
 * are vertically perturbed by noise so layers look natural.
 *
 * @param {{ bands: number[], bandHeight?: number, noiseAmplitude?: number }} strata
 * @param {number} y Block Y coordinate
 * @param {number} noiseValue Simplex noise in [-1, 1]
 * @returns {number} Band block ID
 */
export function selectStrataBlock(strata, y, noiseValue) {
  const bands = strata?.bands
  if (!Array.isArray(bands) || bands.length === 0)
    throw new RangeError('strata.bands must be a non-empty array')

  const bandHeight = Math.max(1, strata.bandHeight ?? 4)
  const shifted = y + clamp(noiseValue, -1, 1) * (strata.noiseAmplitude ?? 6)
  const band = Math.floor(shifted / bandHeight)
  return bands[((band % bands.length) + bands.length) % bands.length]
}
```

`getCategoricalBiomeBlocks` 的 `if (underwater || shore)` 分支替换为：

```js
  if (underwater || shore) {
    const underwaterBlocks = biome.blocks.underwater
    return {
      surface: underwaterBlocks?.surface ?? BLOCK_IDS.SAND,
      subsurface: underwaterBlocks?.subsurface ?? underwaterBlocks?.surface ?? BLOCK_IDS.SAND,
      deep: biome.blocks.deep || BLOCK_IDS.STONE,
    }
  }
```

- [ ] **Step 4: `terrain-generator.js` — `_fillColumnLayers` 接入变体与条纹层**

文件顶部（class 之前）加常量：

```js
// 地表变体与条纹层使用独立噪声通道：不同尺度 + 大偏移，与地形噪声去相关
const SURFACE_VARIANT_NOISE_SCALE = 18
const SURFACE_VARIANT_NOISE_OFFSET = 4096
const STRATA_NOISE_SCALE = 24
const STRATA_NOISE_OFFSET = 8192
```

import 行更新：

```js
import {
  buildTerrainBiomeField,
  getCategoricalBiomeBlocks,
  selectStrataBlock,
  selectSurfaceVariant,
} from './terrain-biome-field.js'
```

`generateTerrain` 中调用点改为传 simplex：

```js
        this._fillColumnLayers(x, z, columnHeight, biomeData, simplex)
```

`_fillColumnLayers` 签名与"2. 表层与地表"循环替换为：

```js
  _fillColumnLayers(x, z, surfaceHeight, biomeData = null, simplex = null) {
    // 获取群系 ID（兼容旧调用方式）
    const biomeId = biomeData?.biome || this.biomeMap[z][x]
    const biomeConfig = getBiomeConfig(biomeId)

    const soilDepth = Math.max(1, this.params.soilDepth)
    const stoneStart = Math.max(0, surfaceHeight - soilDepth)

    const waterOffset = this.params.water?.waterOffset ?? 8
    const shoreDepth = this.params.water?.shoreDepth ?? 2

    // 判定区域
    const isUnderwater = surfaceHeight <= waterOffset
    const isShore = !isUnderwater && surfaceHeight <= waterOffset + shoreDepth

    const columnBlocks = getCategoricalBiomeBlocks({
      dominantBiome: biomeId,
      underwater: isUnderwater,
      shore: isShore,
    })
    const surfaceBlockId = columnBlocks.surface
    const subsurfaceBlockId = columnBlocks.subsurface
    const deepBlockId = columnBlocks.deep

    // 地表变体与条纹层（仅陆地列，且配置存在时）
    const wx = this.origin.x + x
    const wz = this.origin.z + z
    const surfaceVariants = !isUnderwater && !isShore
      ? biomeConfig?.blocks?.surfaceVariants
      : null
    const strata = !isUnderwater && !isShore
      ? biomeConfig?.strata
      : null

    let variantNoise = 0
    let strataNoise = 0
    if (simplex && (surfaceVariants || strata)) {
      if (surfaceVariants) {
        variantNoise = simplex.noise(
          (wx + SURFACE_VARIANT_NOISE_OFFSET) / SURFACE_VARIANT_NOISE_SCALE,
          (wz + SURFACE_VARIANT_NOISE_OFFSET) / SURFACE_VARIANT_NOISE_SCALE,
        )
      }
      if (strata) {
        strataNoise = simplex.noise(
          (wx + STRATA_NOISE_OFFSET) / STRATA_NOISE_SCALE,
          (wz + STRATA_NOISE_OFFSET) / STRATA_NOISE_SCALE,
        )
      }
    }

    // 1. 深层：统一填充石头（或其他深层块）
    for (let y = 0; y <= stoneStart; y++) {
      this.container.setBlockId(x, y, z, deepBlockId)
    }

    // 2. 表层与地表
    for (let y = stoneStart + 1; y <= surfaceHeight; y++) {
      if (y === surfaceHeight) {
        // 地表方块：变体斑块优先，其次条纹层，最后默认地表
        let topBlockId = surfaceBlockId
        if (surfaceVariants)
          topBlockId = selectSurfaceVariant(surfaceVariants, variantNoise)
        else if (strata)
          topBlockId = selectStrataBlock(strata, y, strataNoise)
        this.container.setBlockId(x, y, z, topBlockId)
      }
      else {
        // 坡面裸岩判定（仅限非水域/沙滩的表层）
        if (!isUnderwater && !isShore && this._isRockExposed(x, y, z, surfaceHeight)) {
          this.container.setBlockId(x, y, z, BLOCK_IDS.STONE)
        }
        else if (strata) {
          this.container.setBlockId(x, y, z, selectStrataBlock(strata, y, strataNoise))
        }
        else {
          this.container.setBlockId(x, y, z, subsurfaceBlockId)
        }
      }
    }
  }
```

- [ ] **Step 5: `biome-terrain-profile.js` — `validateBiomeDefinitions` 循环内追加校验**

在 `if (temperature < 0 || temperature > 1 ...)` 之后追加：

```js
    const surfaceVariants = biome.blocks?.surfaceVariants
    if (surfaceVariants !== undefined) {
      if (!Array.isArray(surfaceVariants) || surfaceVariants.length === 0)
        throw new RangeError(`Biome "${biome.id}" surfaceVariants must be a non-empty array`)
      for (const variant of surfaceVariants) {
        if (!Number.isInteger(variant.blockId))
          throw new TypeError(`Biome "${biome.id}" surfaceVariants blockId must be an integer`)
        if (!Number.isFinite(variant.weight) || variant.weight <= 0)
          throw new RangeError(`Biome "${biome.id}" surfaceVariants weight must be positive`)
      }
    }

    const strata = biome.strata
    if (strata !== undefined) {
      if (!Array.isArray(strata.bands) || strata.bands.length === 0)
        throw new RangeError(`Biome "${biome.id}" strata.bands must be a non-empty array`)
      if (!Number.isInteger(strata.bandHeight) || strata.bandHeight < 1)
        throw new RangeError(`Biome "${biome.id}" strata.bandHeight must be an integer >= 1`)
    }

    const shape = biome.terrainParams?.shape
    if (shape !== undefined && shape.type !== 'plateau' && shape.type !== 'ridged')
      throw new RangeError(`Biome "${biome.id}" terrainParams.shape.type must be "plateau" or "ridged"`)
```

- [ ] **Step 6: 运行全部单测 + 提交**

```bash
node --test tests/unit/*.unit.js
```
Expected: PASS（badlands/frozenOcean 的 underwater 两条若仍未配置则先标注跳过，或在 `biome-config.js` 两个群系的 `blocks` 中提前加 `underwater` 字段使其转绿）。

```bash
git add src/js/world/terrain/terrain-biome-field.js src/js/world/terrain/terrain-generator.js src/js/world/terrain/biome-terrain-profile.js tests/unit/biome-visual-enrichment.unit.js
git commit -m "feat(terrain): add surface variants, strata banding, and underwater block overrides"
```

---

### Task 4: 冰刺形状 + 植被扩展（coreBlock / per-type allowedSurface）

**Files:**
- Modify: `src/js/world/terrain/tree-shape.js`
- Modify: `src/js/world/terrain/terrain-generator.js`（`generateTrees` 与 `_generateVegetation`）
- Test: `tests/unit/biome-visual-enrichment.unit.js`（追加）

**Interfaces:**
- Produces: `placeTree('spike', ctx)`，`ctx` 新增可选 `coreBlock: number`、`coreChance: number`（默认 0.35）；植被类型配置新增可选 `coreBlock`、`coreChance`、`allowedSurface`（覆盖群系级）。

- [ ] **Step 1: 追加失败测试**

```js
// 文件头部 import 追加：
// import { RNG } from '../../src/js/tools/rng.js'
// import { placeTree } from '../../src/js/world/terrain/tree-shape.js'

test('spike shape tapers from a 3x3 base to a single tip', () => {
  const width = 16
  const height = 32
  const data = new Map()
  const key = (x, y, z) => `${x},${y},${z}`
  const placed = placeTree('spike', {
    setBlockId: (x, y, z, id) => data.set(key(x, y, z), id),
    getBlockId: (x, y, z) => data.get(key(x, y, z)) ?? 0,
    emptyId: 0,
    x: 8,
    baseY: 4,
    z: 8,
    trunkBlock: 18, // PACKED_ICE
    coreBlock: 24, // BLUE_ICE
    coreChance: 1, // 强制核心，便于断言
    leavesBlock: null,
    heightRange: [8, 8],
    rng: new RNG(7),
    bounds: { width, height },
  })

  // 底部两层为 3x3（高 8 → baseLayers = 2），其上为 1x1
  assert.equal(data.get(key(7, 4, 7)), 18)
  assert.equal(data.get(key(9, 5, 9)), 18)
  assert.equal(data.get(key(8, 4, 8)), 24) // 核心蓝冰
  assert.equal(data.get(key(8, 11, 8)), 24) // 尖顶核心
  assert.equal(data.get(key(7, 6, 8)) ?? 0, 0) // 上部无 3x3
  assert.ok(placed.trunkBlocks >= 8 * 1 + 2 * 8) // 中心柱 + 底部两圈 8 格
  assert.equal(placed.leavesBlocks, 0)
})
```

- [ ] **Step 2: 运行确认失败**

```bash
node --test tests/unit/biome-visual-enrichment.unit.js
```
Expected: FAIL（spike 形状未实现，3x3 基底断言失败）

- [ ] **Step 3: `tree-shape.js` 实现 spike**

在 `placeTree` 之前追加：

```js
/**
 * Place a tapering spike: 3x3 base shrinking to a 1x1 column.
 * When ctx.coreBlock is set, the center column uses it with probability
 * ctx.coreChance (decided once per spike).
 *
 * @param {object} ctx
 * @param {number} trunkHeight
 * @param {{ trunkBlocks: number, leavesBlocks: number }} stats
 */
function placeSpike(ctx, trunkHeight, stats) {
  const baseLayers = Math.max(1, Math.round(trunkHeight / 4))
  const useCore = ctx.coreBlock != null
    && ctx.rng.random() < (ctx.coreChance ?? 0.35)

  for (let i = 0; i < trunkHeight; i++) {
    const y = ctx.baseY + i

    if (i >= baseLayers) {
      const id = useCore ? ctx.coreBlock : ctx.trunkBlock
      trySet(ctx, ctx.x, y, ctx.z, id, 'trunk', stats)
      continue
    }

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const isCenter = dx === 0 && dz === 0
        const id = isCenter && useCore ? ctx.coreBlock : ctx.trunkBlock
        trySet(ctx, ctx.x + dx, y, ctx.z + dz, id, 'trunk', stats)
      }
    }
  }
}
```

`placeTree` 中 `const profile = ...` 之前插入：

```js
  if (shape === 'spike') {
    placeSpike(ctx, trunkHeight, stats)
    return stats
  }
```

同时把 `placeTree` JSDoc 的 shape 类型改为 `'oak' | 'birch' | 'cherry' | 'spike' | 'none'`，ctx 增加 `@param {number} [ctx.coreBlock]` 与 `@param {number} [ctx.coreChance]`。

- [ ] **Step 4: `terrain-generator.js` 植被扩展**

`_generateVegetation` 中 `placeTree(shape, { ... })` 调用的 ctx 追加两个字段（从 `vegetationType` 解构出 `coreBlock`、`coreChance`）：

```js
  _generateVegetation(x, baseY, z, vegetationType, rng, stats) {
    const { heightRange, trunkBlock, leavesBlock, coreBlock, coreChance } = vegetationType
    ...
    const placed = placeTree(shape, {
      ...
      trunkBlock,
      leavesBlock,
      coreBlock,
      coreChance,
      ...
    })
```

`generateTrees` 中地表检查逻辑（`const surfaceBlock = ...` 起）替换为支持 per-type `allowedSurface`：

```js
        // 检查地表方块是否允许（群系级与类型级 allowedSurface 的并集先粗筛）
        const surfaceHeight = this.heightMap[baseZ]?.[baseX]
        if (surfaceHeight === undefined)
          continue

        const surfaceBlock = this.container.getBlock(baseX, surfaceHeight, baseZ)
        const allowedSurfaces = new Set()
        for (const type of biomeConfig.vegetation.types) {
          const surfaces = type.allowedSurface ?? biomeConfig.vegetation.allowedSurface
          surfaces.forEach(id => allowedSurfaces.add(id))
        }
        if (!allowedSurfaces.has(surfaceBlock.id)) {
          continue
        }
```

并在 `const vegetationType = this._selectVegetationType(...)` 之后追加类型级检查：

```js
        // 类型级 allowedSurface 覆盖（如仙人掌仅长在红沙斑块）
        const typeAllowedSurface = vegetationType.allowedSurface
          ?? biomeConfig.vegetation.allowedSurface
        if (!typeAllowedSurface.includes(surfaceBlock.id)) {
          continue
        }
```

- [ ] **Step 5: 运行全部单测 + 提交**

```bash
node --test tests/unit/*.unit.js
```
Expected: 全部 PASS。

```bash
git add src/js/world/terrain/tree-shape.js src/js/world/terrain/terrain-generator.js tests/unit/biome-visual-enrichment.unit.js
git commit -m "feat(vegetation): add spike shape and per-type surface constraints"
```

---

### Task 5: 群系配置落地 + 全量验证

**Files:**
- Modify: `src/js/world/terrain/biome-config.js`（BADLANDS、FROZEN_OCEAN 整段替换）

**Interfaces:**
- Consumes: 之前所有任务提供的机制。

- [ ] **Step 1: 替换 BADLANDS 配置（`biome-config.js:244-277`）**

```js
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
```

- [ ] **Step 2: 替换 FROZEN_OCEAN 配置（`biome-config.js:279-302`）**

```js
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
```

- [ ] **Step 3: 全量验证**

```bash
node --test tests/unit/*.unit.js
pnpm lint
pnpm build
```
Expected: 单测全过；lint 无错误；build 成功。

- [ ] **Step 4: 目检（手动，开发服务器）**

`pnpm dev` 后用 Tweakpane 调试面板「群系系统 → 强制群系」分别切到 `恶地` / `冻洋`，确认：
- 恶地：平顶台地轮廓、崖壁红黄白橙条纹、地表红沙斑块、红沙上有仙人掌、陶瓦上有枯树枯草。
- 冻洋：冰山起伏、冰/浮冰/雪斑块、冰刺（蓝冰核心）、水下沙砾。
目检后停止 dev server。

- [ ] **Step 5: 提交**

```bash
git add src/js/world/terrain/biome-config.js
git commit -m "feat(biome): enrich badlands and frozen ocean with shaping, variants, and decor"
```
