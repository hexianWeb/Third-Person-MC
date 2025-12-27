/**
 * 方块与矿产元数据配置
 * 仅声明 id / 名称 / 纹理键 / 稀有度，不直接持有纹理实例
 * 渲染阶段统一使用共享几何体：new THREE.BoxGeometry(1, 1, 1)
 */
import * as THREE from 'three'
import CustomShaderMaterial from 'three-custom-shader-material/vanilla'

// 导入动画着色器
import windVertexShader from '../../../shaders/blocks/wind.vert.glsl'

// 方块 ID 常量，便于在代码中保持一致引用
export const BLOCK_IDS = {
  EMPTY: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COAL_ORE: 4,
  IRON_ORE: 5,
  // 树（体素）
  TREE_TRUNK: 6,
  TREE_LEAVES: 7,
  // 沙子（水下地表层）
  SAND: 8,
  // 白桦木相关
  BIRCH_TRUNK: 9,
  BIRCH_LEAVES: 10,
  // 樱花树相关
  CHERRY_TRUNK: 11,
  CHERRY_LEAVES: 12,
  // 沙漠相关
  CACTUS: 13,
  // deadBush (ID: 14) 暂不实现（纹理缺失）
  // 恶地相关
  TERRACOTTA: 15,
  RED_SAND: 16,
  // 冻洋相关
  ICE: 17,
  PACKED_ICE: 18,
  SNOW: 19,
  // snowLayer (ID: 20) 暂不实现（纹理缺失）
  // 其他
  GRAVEL: 21,
}

// 植物 ID 常量（使用 200+ 区间与方块区分）
export const PLANT_IDS = {
  DEAD_BUSH: 200,
  SHORT_DRY_GRASS: 201,
  SHORT_GRASS: 202,
  DANDELION: 203,
  POPPY: 204,
  OXEYE_DAISY: 205,
  ALLIUM: 206,
  CACTUS_FLOWER: 207,
  PINK_TULIP: 208,
}

/**
 * 动画类型默认参数
 * 用于配置不同类型的方块动画效果
 */
export const ANIMATION_DEFAULTS = {
  wind: {
    windSpeed: 2.0, // 风速，影响摇摆频率
    swayAmplitude: 0.7, // 摇摆幅度
    phaseScale: 2.0, // 相位缩放，控制不同树的差异程度
  },
  // 预留其他动画类型
  // pulse: { frequency: 1.0, intensity: 0.1 },
  // wave: { speed: 1.0, amplitude: 0.05 },
}

/**
 * 动画着色器映射表
 * 根据 animationType 获取对应的着色器代码
 */
const ANIMATION_SHADERS = {
  wind: windVertexShader,
  // pulse: pulseVertexShader, // 预留
  // wave: waveVertexShader,   // 预留
}

/**
 * 约定各方块使用的纹理键，需与 sources.js 中的资源名称一致
 * - grass_top: grass_block_top_texture
 * - grass_side: grass_block_side_texture
 * - dirt: dirt
 * - stone: stone
 * - coal_ore: coal_ore
 * - iron_ore: iron_ore
 */
export const blocks = {
  empty: {
    id: BLOCK_IDS.EMPTY,
    name: 'empty',
    visible: false,
  },
  grass: {
    id: BLOCK_IDS.GRASS,
    name: 'grass',
    visible: true,
    textureKeys: {
      top: 'grass',
      bottom: 'dirt',
      side: 'grass_block_side_texture',
    },
  },
  dirt: {
    id: BLOCK_IDS.DIRT,
    name: 'dirt',
    visible: true,
    textureKeys: {
      all: 'dirt',
    },
  },
  stone: {
    id: BLOCK_IDS.STONE,
    name: 'stone',
    visible: true,
    textureKeys: {
      all: 'stone',
    },
    scale: { x: 30, y: 30, z: 30 },
    scarcity: 0.8,
  },
  coalOre: {
    id: BLOCK_IDS.COAL_ORE,
    name: 'coal_ore',
    visible: true,
    textureKeys: {
      all: 'coal_ore',
    },
    scale: { x: 20, y: 20, z: 20 },
    scarcity: 0.8,
  },
  ironOre: {
    id: BLOCK_IDS.IRON_ORE,
    name: 'iron_ore',
    visible: true,
    textureKeys: {
      all: 'iron_ore',
    },
    scale: { x: 40, y: 40, z: 40 },
    scarcity: 0.9,
  },
  // ===== 树（体素方块）=====
  treeTrunk: {
    id: BLOCK_IDS.TREE_TRUNK,
    name: 'tree_trunk',
    visible: true,
    // 树干：六面贴图（侧面/顶面）
    textureKeys: {
      top: 'treeTrunk_TopTexture',
      bottom: 'treeTrunk_TopTexture',
      side: 'treeTrunk_SideTexture',
    },
  },
  treeLeaves: {
    id: BLOCK_IDS.TREE_LEAVES,
    name: 'tree_leaves',
    visible: true,
    // 树叶：使用 alphaTest 构建镂空效果
    textureKeys: {
      all: 'treeLeaves_Texture',
    },
    alphaTest: 0.5,
    transparent: true,
    // 动画配置：风动效果
    animated: true,
    animationType: 'wind',
    animationParams: {}, // 使用 ANIMATION_DEFAULTS.wind 的默认值
  },
  // ===== 沙子（水下地表层）=====
  sand: {
    id: BLOCK_IDS.SAND,
    name: 'sand',
    visible: true,
    textureKeys: {
      all: 'sand', // 对应 sources.js 中的 'sand' 纹理
    },
  },
  // ===== 白桦树（体素方块）=====
  birchTrunk: {
    id: BLOCK_IDS.BIRCH_TRUNK,
    name: 'birch_trunk',
    visible: true,
    textureKeys: {
      top: 'birchTrunk_TopTexture',
      bottom: 'birchTrunk_TopTexture',
      side: 'birchTrunk_SideTexture',
    },
  },
  birchLeaves: {
    id: BLOCK_IDS.BIRCH_LEAVES,
    name: 'birch_leaves',
    visible: true,
    textureKeys: {
      all: 'birchLeaves_Texture',
    },
    alphaTest: 0.5,
    transparent: true,
    // 动画配置：风动效果
    animated: true,
    animationType: 'wind',
    animationParams: {},
  },
  // ===== 樱花树（体素方块）=====
  cherryTrunk: {
    id: BLOCK_IDS.CHERRY_TRUNK,
    name: 'cherry_trunk',
    visible: true,
    textureKeys: {
      top: 'cherryTrunk_TopTexture',
      bottom: 'cherryTrunk_TopTexture',
      side: 'cherryTrunk_SideTexture',
    },
  },
  cherryLeaves: {
    id: BLOCK_IDS.CHERRY_LEAVES,
    name: 'cherry_leaves',
    visible: true,
    textureKeys: {
      all: 'cherryLeaves_Texture',
    },
    alphaTest: 0.5,
    transparent: true,
    // 动画配置：风动效果
    animated: true,
    animationType: 'wind',
    animationParams: {},
  },
  // ===== 仙人掌（体素方块）=====
  cactus: {
    id: BLOCK_IDS.CACTUS,
    name: 'cactus',
    visible: true,
    textureKeys: {
      top: 'cactusTrunk_TopTexture',
      bottom: 'cactusTrunk_TopTexture',
      side: 'cactusTrunk_SideTexture',
    },
  },
  // ===== 恶地相关（体素方块）=====
  terracotta: {
    id: BLOCK_IDS.TERRACOTTA,
    name: 'terracotta',
    visible: true,
    // 使用黄色陶瓦作为默认纹理，后续可根据需要扩展为随机选择
    textureKeys: {
      all: 'terracotta_yellow',
    },
  },
  redSand: {
    id: BLOCK_IDS.RED_SAND,
    name: 'red_sand',
    visible: true,
    textureKeys: {
      all: 'red_sand',
    },
  },
  // ===== 冻洋相关（体素方块）=====
  ice: {
    id: BLOCK_IDS.ICE,
    name: 'ice',
    visible: true,
    textureKeys: {
      all: 'ice_Texture',
    },
  },
  packedIce: {
    id: BLOCK_IDS.PACKED_ICE,
    name: 'packed_ice',
    visible: true,
    textureKeys: {
      all: 'packedIce_Texture',
    },
  },
  snow: {
    id: BLOCK_IDS.SNOW,
    name: 'snow',
    visible: true,
    textureKeys: {
      all: 'snow',
    },
  },
  // ===== 沙砾（体素方块）=====
  gravel: {
    id: BLOCK_IDS.GRAVEL,
    name: 'gravel',
    visible: true,
    textureKeys: {
      all: 'gravel_Texture',
    },
  },
}

// 需要通过 3D 噪声生成的矿产列表
export const resources = [
  blocks.stone,
  blocks.coalOre,
  blocks.ironOre,
]

/**
 * 根据方块类型和资源纹理，生成材质（草方块返回 6 面材质数组）
 * @param {object} blockType 方块配置
 * @param {Record<string, THREE.Texture>} textureItems 资源管理器加载的纹理
 * @returns {THREE.Material|THREE.Material[]|null} 生成的材质（或材质数组），缺失纹理时返回 null
 */
export function createMaterials(blockType, textureItems) {
  if (blockType.id === blocks.empty.id)
    return null

  const ensureTexture = (key) => {
    const tex = textureItems[key]
    if (!tex)
      return null
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  /**
   * 构建动画材质的 uniforms 和着色器
   * @param {object} blockType 方块配置
   * @returns {{ uniforms: object, vertexShader: string } | null} 动画配置对象，无动画时返回 null
   */
  const buildAnimationConfig = (blockType) => {
    if (!blockType.animated || !blockType.animationType)
      return null

    const animationType = blockType.animationType
    const shaderCode = ANIMATION_SHADERS[animationType]

    if (!shaderCode) {
      console.warn(`Unknown animation type: ${animationType}`)
      return null
    }

    // 合并默认参数和自定义参数
    const defaults = ANIMATION_DEFAULTS[animationType] || {}
    const params = { ...defaults, ...blockType.animationParams }

    // 构建 uniforms 对象
    const uniforms = {
      uTime: { value: 0 },
    }

    // 根据动画类型添加特定 uniforms
    if (animationType === 'wind') {
      uniforms.uWindSpeed = { value: params.windSpeed }
      uniforms.uSwayAmplitude = { value: params.swayAmplitude }
      uniforms.uPhaseScale = { value: params.phaseScale }
    }
    // 预留其他动画类型的 uniforms 配置
    // else if (animationType === 'pulse') { ... }

    return {
      uniforms,
      vertexShader: shaderCode,
    }
  }

  // 使用 custom shader 包装的标准材质，便于后续扩展
  const makeCustomMaterial = (tex, options = {}) => {
    // 获取动画配置（如果有）
    const animConfig = buildAnimationConfig(blockType)

    const materialConfig = {
      baseMaterial: THREE.MeshPhongMaterial,
      map: tex,
      flatShading: true,
      // 合并额外的材质参数，如 alphaTest, transparent 等
      ...options,
    }

    // 如果有动画配置，注入 uniforms 和着色器
    if (animConfig) {
      materialConfig.uniforms = animConfig.uniforms
      materialConfig.vertexShader = animConfig.vertexShader
      // fragment shader 不需要修改时可以省略
    }
    // 无动画的材质不需要自定义着色器，使用 CSM 默认行为即可

    const material = new CustomShaderMaterial(materialConfig)

    // 标记是否为动画材质，供渲染器追踪
    material._isAnimated = !!animConfig
    material._animationType = blockType.animationType || null

    return material
  }

  // 提取通用的材质参数
  const materialOptions = {}
  if (blockType.alphaTest !== undefined)
    materialOptions.alphaTest = blockType.alphaTest
  if (blockType.transparent !== undefined)
    materialOptions.transparent = blockType.transparent

  // 六面贴图方块：草/树干（右、左、上、下、前、后）
  if (blockType.textureKeys?.side && blockType.textureKeys?.top && blockType.textureKeys?.bottom) {
    const side = ensureTexture(blockType.textureKeys.side)
    const top = ensureTexture(blockType.textureKeys.top)
    const bottom = ensureTexture(blockType.textureKeys.bottom)
    if (!side || !top || !bottom)
      return null

    return [
      makeCustomMaterial(side, materialOptions), // right
      makeCustomMaterial(side, materialOptions), // left
      makeCustomMaterial(top, materialOptions), // top
      makeCustomMaterial(bottom, materialOptions), // bottom
      makeCustomMaterial(side, materialOptions), // front
      makeCustomMaterial(side, materialOptions), // back
    ]
  }

  // 其余方块：单一材质
  const mainTexture = ensureTexture(blockType.textureKeys.all)
  if (!mainTexture)
    return null
  return makeCustomMaterial(mainTexture, materialOptions)
}

/**
 * 共享几何体，避免重复创建
 */
export const sharedGeometry = new THREE.BoxGeometry(1, 1, 1)

/**
 * 植物配置
 * 植物使用 X 形交叉平面几何体渲染
 */
export const plants = {
  deadBush: {
    id: PLANT_IDS.DEAD_BUSH,
    name: 'dead_bush',
    visible: true,
    isPlant: true,
    textureKeys: { all: 'deadBush_plant_Texture' },
    alphaTest: 0.5,
    transparent: true,
    animated: false,
  },
  shortDryGrass: {
    id: PLANT_IDS.SHORT_DRY_GRASS,
    name: 'short_dry_grass',
    visible: true,
    isPlant: true,
    textureKeys: { all: 'shortDryGrass_plant_Texture' },
    alphaTest: 0.5,
    transparent: true,
    animated: true,
    animationType: 'wind',
    animationParams: { swayAmplitude: 0.3 },
  },
  shortGrass: {
    id: PLANT_IDS.SHORT_GRASS,
    name: 'short_grass',
    visible: true,
    isPlant: true,
    textureKeys: { all: 'shortGrass_plant_Texture' },
    alphaTest: 0.5,
    transparent: true,
    animated: true,
    animationType: 'wind',
    animationParams: { swayAmplitude: 0.3 },
    mixColor: 0x5B8731, // grass green color for grayscale texture
  },
  dandelion: {
    id: PLANT_IDS.DANDELION,
    name: 'dandelion',
    visible: true,
    isPlant: true,
    textureKeys: { all: 'dandelion_plant_Texture' },
    alphaTest: 0.5,
    transparent: true,
    animated: true,
    animationType: 'wind',
    animationParams: { swayAmplitude: 0.2 },
  },
  poppy: {
    id: PLANT_IDS.POPPY,
    name: 'poppy',
    visible: true,
    isPlant: true,
    textureKeys: { all: 'poppy_plant_Texture' },
    alphaTest: 0.5,
    transparent: true,
    animated: true,
    animationType: 'wind',
    animationParams: { swayAmplitude: 0.2 },
  },
  oxeyeDaisy: {
    id: PLANT_IDS.OXEYE_DAISY,
    name: 'oxeye_daisy',
    visible: true,
    isPlant: true,
    textureKeys: { all: 'oxeyeDaisy_plant_Texture' },
    alphaTest: 0.5,
    transparent: true,
    animated: true,
    animationType: 'wind',
    animationParams: { swayAmplitude: 0.2 },
  },
  allium: {
    id: PLANT_IDS.ALLIUM,
    name: 'allium',
    visible: true,
    isPlant: true,
    textureKeys: { all: 'allium_plant_Texture' },
    alphaTest: 0.5,
    transparent: true,
    animated: true,
    animationType: 'wind',
    animationParams: { swayAmplitude: 0.2 },
  },
  cactusFlower: {
    id: PLANT_IDS.CACTUS_FLOWER,
    name: 'cactus_flower',
    visible: true,
    isPlant: true,
    textureKeys: { all: 'cactus_flower_Texture' },
    alphaTest: 0.5,
    transparent: true,
    animated: true,
    animationType: 'wind',
    animationParams: { swayAmplitude: 0.2 },
  },
  pinkTulip: {
    id: PLANT_IDS.PINK_TULIP,
    name: 'pink_tulip',
    visible: true,
    isPlant: true,
    textureKeys: { all: 'pink_tulip_Texture' },
    alphaTest: 0.5,
    transparent: true,
    animated: true,
    animationType: 'wind',
    animationParams: { swayAmplitude: 0.2 },
  },
}

// 植物 ID -> 配置映射
export const PLANT_BY_ID = Object.values(plants).reduce((map, item) => {
  map[item.id] = item
  return map
}, {})

/**
 * X 形交叉平面几何体（共享，供植物渲染使用）
 * 两个相互垂直的 1x1 平面，呈 X 形
 */
export const sharedCrossPlaneGeometry = (() => {
  const geometry = new THREE.BufferGeometry()

  // 两个对角交叉的平面 (不需要背面三角形，使用 DoubleSide 材质)
  // prettier-ignore
  const vertices = new Float32Array([
    // 平面1: 沿对角线 (-0.5,-0.5) 到 (0.5,0.5)
    -0.5,
    0,
    -0.5,
    0.5,
    0,
    0.5,
    0.5,
    1,
    0.5,
    -0.5,
    0,
    -0.5,
    0.5,
    1,
    0.5,
    -0.5,
    1,
    -0.5,
    // 平面2: 沿对角线 (-0.5,0.5) 到 (0.5,-0.5)
    -0.5,
    0,
    0.5,
    0.5,
    0,
    -0.5,
    0.5,
    1,
    -0.5,
    -0.5,
    0,
    0.5,
    0.5,
    1,
    -0.5,
    -0.5,
    1,
    0.5,
  ])

  // prettier-ignore
  const uvs = new Float32Array([
    // 平面1
    0,
    0,
    1,
    0,
    1,
    1,
    0,
    0,
    1,
    1,
    0,
    1,
    // 平面2
    0,
    0,
    1,
    0,
    1,
    1,
    0,
    0,
    1,
    1,
    0,
    1,
  ])

  // 使用向上的垂直法线，这样无论从哪个方向看都能正确接收光照
  // 这是 Minecraft 风格植物的常用做法
  // prettier-ignore
  const normals = new Float32Array([
    // 平面1 - 全部使用 (0, 1, 0) 向上法线
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    // 平面2 - 全部使用 (0, 1, 0) 向上法线
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    1,
    0,
  ])

  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))

  return geometry
})()

/**
 * 创建植物材质
 * @param {object} plantType 植物配置
 * @param {Record<string, THREE.Texture>} textureItems 资源管理器加载的纹理
 * @returns {THREE.Material|null} 生成的材质，缺失纹理时返回 null
 */
export function createPlantMaterials(plantType, textureItems) {
  if (!plantType.visible)
    return null

  const tex = textureItems[plantType.textureKeys.all]
  if (!tex)
    return null

  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.colorSpace = THREE.SRGBColorSpace

  const materialConfig = {
    baseMaterial: THREE.MeshLambertMaterial,
    map: tex,
    flatShading: true,
    alphaTest: plantType.alphaTest ?? 0.5,
    transparent: plantType.transparent ?? true,
    side: THREE.DoubleSide,
    // 草类使用绿色自发光，其余使用白色
    emissive: new THREE.Color(plantType.mixColor !== undefined ? '#83CE54' : '#FFFFFF'),
    emissiveMap: tex,
    emissiveIntensity: 0.6,
    // 草类使用指定的混色，其余使用白色
    color: new THREE.Color(plantType.mixColor !== undefined ? plantType.mixColor : '#FFFFFF'),
  }

  // 动画配置
  if (plantType.animated && plantType.animationType) {
    const defaults = ANIMATION_DEFAULTS[plantType.animationType] || {}
    const params = { ...defaults, ...plantType.animationParams }

    materialConfig.uniforms = {
      uTime: { value: 0 },
      uWindSpeed: { value: params.windSpeed ?? 2.0 },
      uSwayAmplitude: { value: params.swayAmplitude ?? 0.3 },
      uPhaseScale: { value: params.phaseScale ?? 2.0 },
    }
    materialConfig.vertexShader = windVertexShader
  }

  const material = new CustomShaderMaterial(materialConfig)
  material._isAnimated = !!plantType.animated
  material._animationType = plantType.animationType || null

  return material
}
