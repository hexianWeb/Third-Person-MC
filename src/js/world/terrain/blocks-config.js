/**
 * 方块与矿产元数据配置
 * 仅声明 id / 名称 / 纹理键 / 稀有度，不直接持有纹理实例
 * 渲染阶段统一使用共享几何体：new THREE.BoxGeometry(1, 1, 1)
 */
import * as THREE from 'three'
import CustomShaderMaterial from 'three-custom-shader-material/vanilla'

// 方块 ID 常量，便于在代码中保持一致引用
export const BLOCK_IDS = {
  EMPTY: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COAL_ORE: 4,
  IRON_ORE: 5,
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
 * @returns {THREE.Material|THREE.Material[]|null}
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

  // 使用 custom shader 包装的标准材质，便于后续扩展
  const makeCustomMaterial = (tex) => {
    // 这里选择 MeshStandardMaterial 作为基底以支持 metalness/roughness
    return new CustomShaderMaterial({
      baseMaterial: THREE.MeshPhongMaterial,
      map: tex,
      flatShading: true,
      // 目前不自定义顶点/片段逻辑，留空挂钩便于后续扩展
      vertexShader: /* glsl */`
        void csm_vertex_main() {
        }
      `,
      fragmentShader: /* glsl */`
        void csm_fragment_main() {
        }
      `,
    })
  }

  // 草方块：六面不同材质
  if (blockType.id === blocks.grass.id) {
    const side = ensureTexture(blockType.textureKeys.side)
    const top = ensureTexture(blockType.textureKeys.top)
    const bottom = ensureTexture(blockType.textureKeys.bottom)

    return [
      makeCustomMaterial(side), // right
      makeCustomMaterial(side), // left
      makeCustomMaterial(top), // top
      makeCustomMaterial(bottom), // bottom
      makeCustomMaterial(side), // front
      makeCustomMaterial(side), // back
    ]
  }

  // 其余方块：单一材质
  const mainTexture = ensureTexture(blockType.textureKeys.all)
  return makeCustomMaterial(mainTexture)
}

/**
 * 共享几何体，避免重复创建
 */
export const sharedGeometry = new THREE.BoxGeometry(1, 1, 1)
