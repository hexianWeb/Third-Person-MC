name: STEP 2 - 群系生成器阶段
overview: 引入真正的"群系生成逻辑"，基于温度/湿度噪声图自动生成群系，并将生成结果注入现有地形修改流程。从 Panel 控制平滑迁移到自动生成。
todos: []

STEP 2：群系生成器阶段（Biome Generator → Terrain Modifier）

一、阶段目标

核心目标：引入真正的"群系生成逻辑"，并把生成结果注入现有地形修改流程。

关键原则：

TerrainGenerator 不判断 biome，它只"消费 biome 数据"

从 Panel 控制平滑迁移到自动生成

保留 panel 强制模式（debug），支持随时切回调试

总体结构变化总结（一句话版）：

STEP 1：不管 biome 怎么来的，我先确保它在我的世界里能正确长出来

STEP 2：现在我只需要解决 biome 从哪里来，而不是它长得对不对

二、完成标准

完成 STEP 2 后，必须满足：

✅ 温度/湿度噪声图能正确生成，跨 chunk 连贯

✅ 根据温度/湿度自动确定群系，结果稳定可复现

✅ 群系边界支持平滑过渡（混合权重）

✅ 自动生成的群系能正确应用到地形（地表、土层、植被）

✅ 保留调试面板强制模式，可随时切换

✅ 性能优化：群系图按 chunk 缓存，避免重复计算

三、实现步骤

STEP 2.1：Biome Generator（纯生成，不改地形）

3.1.1 创建 biome-generator.js

工作内容：

创建 BiomeGenerator 类

实现温度/湿度 2D 噪声生成

实现群系查询逻辑

实现平滑过渡算法（混合权重）

与 TerrainGenerator 解耦

类结构设计：

export default class BiomeGenerator {
  constructor(seed) {
    // 使用独立的 seed 偏移确保温度/湿度独立
    this.tempNoise = new SimplexNoise(seed + 1000)
    this.humidityNoise = new SimplexNoise(seed + 2000)

    // 噪声缩放参数（可配置）
    this.tempScale = 50 // 温度噪声缩放（越大越平滑）
    this.humidityScale = 50 // 湿度噪声缩放

    // 缓存：避免重复计算
    this.biomeCache = new Map() // key: "chunkX,chunkZ"
  }

  /**
   * 生成整个 chunk 的群系图（一次性计算）
   * @param {number} originX - chunk 左下角世界 X 坐标
   * @param {number} originZ - chunk 左下角世界 Z 坐标
   * @param {number} chunkWidth - chunk 宽度
   * @returns {Array<Array<BiomeData>>} 群系图 [x][z]
   */
  generateBiomeMap(originX, originZ, chunkWidth) {
    const cacheKey = `${originX},${originZ}`

    // 检查缓存
    if (this.biomeCache.has(cacheKey)) {
      return this.biomeCache.get(cacheKey)
    }

    const biomeMap = []

    for (let x = 0; x < chunkWidth; x++) {
      biomeMap[x] = []
      for (let z = 0; z < chunkWidth; z++) {
        const wx = originX + x
        const wz = originZ + z

        // 获取温度/湿度（归一化到 0-1）
        const temp = this._getTemperature(wx, wz)
        const humidity = this._getHumidity(wx, wz)

        // 确定群系
        const biomeId = this._getBiome(temp, humidity)

        // 计算混合权重（边界区域）
        const weights = this._getBiomeWeights(temp, humidity)

        biomeMap[x][z] = {
          biome: biomeId,
          temp,
          humidity,
          weights, // null 表示单一群系，否则为 { biomeId: weight, ... }
        }
      }
    }

    // 缓存结果
    this.biomeCache.set(cacheKey, biomeMap)

    return biomeMap
  }

  /**
   * 获取指定位置的温度（0-1）
   */
  _getTemperature(wx, wz) {
    const noise = this.tempNoise.noise(wx / this.tempScale, wz / this.tempScale)
    return noise * 0.5 + 0.5 // 归一化到 [0, 1]
  }

  /**
   * 获取指定位置的湿度（0-1）
   */
  _getHumidity(wx, wz) {
    const noise = this.humidityNoise.noise(wx / this.humidityScale, wz / this.humidityScale)
    return noise * 0.5 + 0.5 // 归一化到 [0, 1]
  }

  /**
   * 根据温度/湿度确定群系
   */
  _getBiome(temp, humidity) {
    // 遍历所有群系，找到匹配的
    for (const [biomeId, config] of Object.entries(BIOMES)) {
      const tempInRange = temp >= config.tempRange[0] && temp <= config.tempRange[1]
      const humidityInRange = humidity >= config.humidityRange[0] && humidity <= config.humidityRange[1]

      if (tempInRange && humidityInRange) {
        return config.id
      }
    }

    // 如果没有匹配的，返回默认群系（平原）
    return 'plains'
  }

  /**
   * 计算群系混合权重（平滑过渡）
   * 返回 null 表示单一群系，否则返回权重对象
   */
  _getBiomeWeights(temp, humidity) {
    const candidates = []
    const threshold = 0.15 // 边界阈值

    // 找出所有"接近"的群系
    for (const [biomeId, config] of Object.entries(BIOMES)) {
      // 计算到群系中心的距离
      const tempCenter = (config.tempRange[0] + config.tempRange[1]) / 2
      const humidityCenter = (config.humidityRange[0] + config.humidityRange[1]) / 2

      const tempDist = Math.abs(temp - tempCenter)
      const humidityDist = Math.abs(humidity - humidityCenter)
      const totalDist = Math.sqrt(tempDist ** 2 + humidityDist ** 2)

      if (totalDist < threshold) {
        candidates.push({ biomeId: config.id, dist: totalDist })
      }
    }

    // 如果只有一个候选，返回 null（单一群系）
    if (candidates.length <= 1) {
      return null
    }

    // 转换为权重（距离越近权重越高）
    const weights = {}
    const totalInvDist = candidates.reduce((sum, c) => sum + 1 / (c.dist + 0.01), 0)

    candidates.forEach((c) => {
      weights[c.biomeId] = (1 / (c.dist + 0.01)) / totalInvDist
    })

    return weights
  }

  /**
   * 清除缓存（chunk 卸载时调用）
   */
  clearCache(chunkX, chunkZ) {
    // 清除指定 chunk 的缓存
    // 实现细节：遍历 biomeCache，删除匹配的 key
  }
}

关键优化：

✅ 按 chunk 批量生成 - 避免逐方块查询

✅ 2D 噪声优先 - 温度/湿度只需 2D，比 3D 快

✅ 预计算权重 - 边界混合权重在生成阶段计算好

✅ 缓存机制 - chunk 级别的缓存，避免重复计算

产出：

biome-generator.js：独立的群系生成器，与地形生成器解耦

3.1.2 在 biome-config.js 中添加温度/湿度范围

工作内容：

为每个群系添加 tempRange 和 humidityRange

确保范围不重叠或合理重叠（用于平滑过渡）

配置示例：

export const BIOMES = {
  PLAINS: {
    id: 'plains',
    tempRange: [0.4, 0.6], // 温度范围
    humidityRange: [0.3, 0.5], // 湿度范围
    // ... 其他配置
  },
  FOREST: {
    id: 'forest',
    tempRange: [0.3, 0.5],
    humidityRange: [0.5, 0.8],
    // ...
  },
  // ... 其他群系
}

7 种群系的温度/湿度范围：

平原: temp [0.4, 0.6], humidity [0.3, 0.5]

森林: temp [0.3, 0.5], humidity [0.5, 0.8]

白桦木林: temp [0.2, 0.4], humidity [0.4, 0.7]

樱花树林: temp [0.5, 0.7], humidity [0.5, 0.8]

沙漠: temp [0.7, 1.0], humidity [0.0, 0.2]

恶地: temp [0.6, 0.9], humidity [0.0, 0.3]

冻洋: temp [0.0, 0.2], humidity [0.6, 1.0]

产出：

biome-config.js：添加温度/湿度范围配置

STEP 2.2：Biome → Terrain Modifier 映射

3.2.1 集成 BiomeGenerator 到 TerrainGenerator

工作内容：

在 TerrainGenerator 构造函数中初始化 BiomeGenerator

在 generateTerrain() 中调用 generateBiomeMap()

将群系数据应用到地形生成

集成代码：

// terrain-generator.js
import BiomeGenerator from './biome-generator.js'

export default class TerrainGenerator {
  constructor(options = {}) {
    // ... 现有代码 ...

    // 初始化群系生成器
    this.biomeGenerator = new BiomeGenerator(this.params.seed)

    // 群系数据缓存（chunk 级别）
    this.biomeMap = null
  }

  generateTerrain(simplex) {
    const { width, height } = this.container.getSize()

    // 生成群系图（在高度图之前）
    this.biomeMap = this.biomeGenerator.generateBiomeMap(
      this.origin.x,
      this.origin.z,
      width
    )

    // ... 后续地形生成逻辑 ...
  }
}

产出：

TerrainGenerator 集成 BiomeGenerator，能获取群系数据

3.2.2 修改 _getBiomeAt() 使用生成器

工作内容：

修改 _getBiomeAt(x, z) 方法

当 biomeSource = 'generator' 时，从 biomeMap 获取

当 biomeSource = 'panel' 时，使用强制群系（调试模式）

实现：

/**
 * 获取指定位置的群系 ID
 * @param {number} x - 局部 X 坐标
 * @param {number} z - 局部 Z 坐标
 * @returns {string} 群系 ID
 */
_getBiomeAt(x, z) {
  // 调试模式：从面板获取强制群系
  if (this.params.biomeSource === 'panel' && this.params.forcedBiome) {
    return this.params.forcedBiome
  }

  // 自动生成模式：从 biomeMap 获取
  if (this.params.biomeSource === 'generator' && this.biomeMap) {
    const biomeData = this.biomeMap[x]?.[z]
    if (biomeData) {
      return biomeData.biome
    }
  }

  // 兜底：返回默认群系
  return 'plains'
}

产出：

_getBiomeAt() 方法：支持两种模式切换

3.2.3 应用群系参数到地形高度

工作内容：

在 generateTerrain() 中根据群系调整 offset 和 magnitude

支持混合群系的参数插值

实现：

generateTerrain(simplex) {
  const { width, height } = this.container.getSize()
  const { scale, magnitude: baseMagnitude, offset: baseOffset } = this.params.terrain

  // 生成群系图
  this.biomeMap = this.biomeGenerator.generateBiomeMap(
    this.origin.x,
    this.origin.z,
    width
  )

  this.heightMap = []

  for (let z = 0; z < width; z++) {
    const row = []
    for (let x = 0; x < width; x++) {
      const wx = this.origin.x + x
      const wz = this.origin.z + z
      const biomeData = this.biomeMap[x][z]

      // 根据群系调整地形参数
      let offset = baseOffset
      let magnitude = baseMagnitude

      if (biomeData.weights) {
        // 混合群系：按权重插值参数
        offset = this._blendBiomeParam(biomeData.weights, 'heightOffset')
        magnitude = baseMagnitude * this._blendBiomeParam(biomeData.weights, 'heightMagnitude')
      } else {
        // 单一群系：直接应用参数
        const biomeConfig = BIOMES[biomeData.biome]
        offset = baseOffset + biomeConfig.terrainParams.heightOffset
        magnitude = baseMagnitude * biomeConfig.terrainParams.heightMagnitude
      }

      // 生成高度（使用调整后的参数）
      const normalizedMagnitude = magnitude / 32
      const n = simplex.noise(wx / scale, wz / scale)
      const scaled = (offset / height) + normalizedMagnitude * n
      let columnHeight = Math.floor(height * scaled)
      columnHeight = Math.max(0, Math.min(columnHeight, height - 1))

      row.push(columnHeight)

      // 填充当前列（使用群系数据）
      this._fillColumnLayers(x, z, columnHeight, biomeData)
    }
    this.heightMap.push(row)
  }
}

/**
 * 混合群系参数（按权重插值）
 */
_blendBiomeParam(weights, paramName) {
  let result = 0
  for (const [biomeId, weight] of Object.entries(weights)) {
    const biomeConfig = BIOMES[biomeId]
    result += biomeConfig.terrainParams[paramName] * weight
  }
  return result
}

产出：

generateTerrain() 修改：根据群系调整地形参数

_blendBiomeParam() 方法：支持混合群系的参数插值

3.2.4 应用群系到方块填充（支持混合）

工作内容：

修改 _fillColumnLayers() 支持混合群系

当 biomeData.weights 存在时，按权重随机选择方块

实现：

_fillColumnLayers(x, z, surfaceHeight, biomeData) {
  const soilDepth = Math.max(1, this.params.soilDepth)
  const stoneStart = Math.max(0, surfaceHeight - soilDepth)

  // ... 水下/水岸判断逻辑保持不变 ...

  for (let y = 0; y <= surfaceHeight; y++) {
    let blockId

    if (y === surfaceHeight) {
      // 顶层：根据群系选择地表方块
      blockId = this._selectBiomeBlockWithWeights(biomeData, 'surface')
    } else if (y > stoneStart) {
      // 表层：根据群系选择土层方块
      blockId = this._selectBiomeBlockWithWeights(biomeData, 'subsurface')
    } else {
      // 深层：石头（所有群系相同）
      blockId = BLOCK_IDS.STONE
    }

    this.container.setBlockId(x, y, z, blockId)
  }
}

/**
 * 根据群系数据选择方块（支持混合）
 */
_selectBiomeBlockWithWeights(biomeData, layer) {
  // 如果是单一群系，直接返回
  if (!biomeData.weights) {
    return this._selectBiomeBlock(biomeData.biome, layer)
  }

  // 混合群系：按权重随机选择
  const rand = Math.random()
  let cumWeight = 0

  for (const [biomeId, weight] of Object.entries(biomeData.weights)) {
    cumWeight += weight
    if (rand < cumWeight) {
      return this._selectBiomeBlock(biomeId, layer)
    }
  }

  // 兜底
  return this._selectBiomeBlock(biomeData.biome, layer)
}

产出：

_fillColumnLayers() 修改：支持混合群系的方块选择

_selectBiomeBlockWithWeights() 方法：处理混合群系

3.2.5 应用群系到植被生成

工作内容：

generateTrees() 已经支持群系感知（STEP 1 已完成）

确保从 biomeMap 获取群系数据

验证：

generateTrees() 中调用 _getBiomeAt() 获取群系

群系数据正确传递到植被生成逻辑

产出：

植被生成完全由群系驱动（无需额外修改）

STEP 2.3：从 Panel 控制 → 自动生成的平滑迁移

3.3.1 更新调试面板

工作内容：

在调试面板中添加 biomeSource 切换

支持 'panel' 和 'generator' 两种模式

切换模式时自动重新生成

面板更新：

debugInit() {
  // ... 现有代码 ...

  // 群系调试面板
  const biomeFolder = this.debugFolder.addFolder({
    title: '群系系统',
    expanded: true,
  })

  // 群系来源选择
  biomeFolder.addBinding(this.params, 'biomeSource', {
    label: '群系来源',
    options: {
      '调试面板': 'panel',
      '自动生成': 'generator',
    },
  }).on('change', () => {
    // 切换模式时重新生成
    this.generate()
  })

  // 强制群系（仅在 panel 模式下生效）
  biomeFolder.addBinding(this.params, 'forcedBiome', {
    label: '强制群系',
    options: {
      '平原': 'plains',
      '森林': 'forest',
      '白桦木林': 'birchForest',
      '樱花树林': 'cherryForest',
      '沙漠': 'desert',
      '恶地': 'badlands',
      '冻洋': 'frozenOcean',
    },
  }).on('change', () => {
    if (this.params.biomeSource === 'panel') {
      this.generate()
    }
  })

  // 群系生成器参数（仅在 generator 模式下显示）
  const generatorFolder = biomeFolder.addFolder({
    title: '生成器参数',
    expanded: false,
  })

  generatorFolder.addBinding(this.biomeGenerator, 'tempScale', {
    label: '温度噪声缩放',
    min: 20,
    max: 200,
    step: 5,
  }).on('change', () => {
    if (this.params.biomeSource === 'generator') {
      this.biomeGenerator.biomeCache.clear() // 清除缓存
      this.generate()
    }
  })

  generatorFolder.addBinding(this.biomeGenerator, 'humidityScale', {
    label: '湿度噪声缩放',
    min: 20,
    max: 200,
    step: 5,
  }).on('change', () => {
    if (this.params.biomeSource === 'generator') {
      this.biomeGenerator.biomeCache.clear()
      this.generate()
    }
  })
}

产出：

调试面板：支持两种模式切换，参数可调

3.3.2 确保跨 Chunk 连贯性

工作内容：

确保温度/湿度噪声使用世界坐标

确保相邻 chunk 边界群系连贯

在 ChunkManager 中共享 BiomeGenerator 实例

实现要点：

BiomeGenerator 使用世界坐标 (wx, wz) 采样噪声

多个 chunk 共享同一个 BiomeGenerator 实例（通过 ChunkManager）

确保 seed 一致，保证跨 chunk 连贯

在 ChunkManager 中：

// chunk-manager.js
constructor() {
  // ... 现有代码 ...

  // 共享的群系生成器（所有 chunk 共用）
  this.biomeGenerator = new BiomeGenerator(this.config.seed)
}

// 创建 TerrainChunk 时传递共享生成器
_ensureChunk(chunkX, chunkZ) {
  const chunk = new TerrainChunk({
    // ... 其他参数 ...
    sharedBiomeGenerator: this.biomeGenerator, // 传递共享实例
  })
}

产出：

跨 chunk 群系连贯，无边界突变

四、关键技术点

4.1 平滑过渡算法

实现方式：

使用温度/湿度距离计算群系边界

在边界区域计算多个群系的混合权重

填充时根据权重随机选择不同群系的 blockType

效果：

边界区域混合 2-3 个群系

中心区域单一群系（weights = null）

权重归一化（和为 1.0）

4.2 性能优化

缓存策略：

群系图按 chunk 缓存（biomeCache）

chunk 卸载时清除对应缓存

避免重复计算噪声值

批量生成：

一次性生成整个 chunk 的群系图

避免逐方块查询

4.3 向后兼容

参数控制：

biomeSource 参数控制群系来源

默认 'panel' 模式（调试模式）

可切换到 'generator' 模式（自动生成）

向后兼容：

当 biomeSource = 'panel' 且未设置 forcedBiome 时，使用默认群系

确保现有地形生成逻辑在无群系时仍能正常工作

五、测试验证

5.1 功能测试清单

切换到 'generator' 模式，验证群系自动生成

验证不同温度/湿度区域生成不同群系

验证群系边界平滑过渡（无硬边界）

验证跨 chunk 边界群系连贯

验证地形参数根据群系正确调整（offset, magnitude）

验证地表/土层方块根据群系正确填充

验证植被根据群系正确生成

验证切换回 'panel' 模式仍能正常工作

验证调整噪声参数后群系分布变化

5.2 性能测试

chunk 生成时间增加 < 20%（相比无群系）

群系图缓存生效，重复生成不重新计算

内存占用合理，无内存泄漏

5.3 边界测试

温度/湿度边界区域群系过渡自然

多个群系边界交汇处无异常

极端温度/湿度值（0.0, 1.0）处理正确

六、注意事项

世界坐标一致性: 确保温度/湿度噪声使用世界坐标 (originX + x, originZ + z)，保证跨 chunk 连贯

缓存策略: 群系图生成后缓存到 chunk 级别，chunk 卸载时清除缓存

向后兼容: 添加 biomeSource 参数，默认 'panel'，逐步迁移

调试面板: 支持实时调整温度/湿度噪声参数（scale），立即看到效果

性能影响: 群系系统会增加噪声计算量，需要优化缓存策略

种子一致性: 确保所有 chunk 使用相同的 seed，保证群系分布一致

七、产出文件清单

src/js/world/terrain/biome-generator.js - 群系生成器（新增）

src/js/world/terrain/biome-config.js - 添加温度/湿度范围配置

src/js/world/terrain/terrain-generator.js - 修改：集成群系生成器

src/js/world/terrain/chunk-manager.js - 修改：共享 BiomeGenerator 实例

八、完成标准再确认

完成 STEP 2 后，必须满足：

✅ 温度/湿度噪声图能正确生成，跨 chunk 连贯

✅ 根据温度/湿度自动确定群系，结果稳定可复现

✅ 群系边界支持平滑过渡（混合权重）

✅ 自动生成的群系能正确应用到地形（地表、土层、植被）

✅ 保留调试面板强制模式，可随时切换

✅ 性能优化：群系图按 chunk 缓存，避免重复计算

满足以上条件后，群系系统核心功能完成。后续可进行优化和扩展（如添加新群系、优化过渡算法等）。

我已经完成了 STEP 1 ，现在正在 coding STEP 2
