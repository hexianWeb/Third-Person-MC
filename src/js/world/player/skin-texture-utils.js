import * as THREE from 'three'

/**
 * GLB 角色固定层级名称（Three.js 运行时名称）
 * 资源侧原名为 SimplePlayer.arma / SimplePlayer.Body.Layer1|2；
 * GLTFLoader 经 PropertyBinding.sanitizeNodeName 会去掉 `.` / `:`，故运行时无点号。
 */
export const EXPECTED_LAYER_NAMES = {
  root: 'SimplePlayerarma',
  layer1: 'SimplePlayerBodyLayer1',
  layer2: 'SimplePlayerBodyLayer2',
}

/**
 * 校验图层节点：名称、isMesh、单一 material（拒绝数组）
 * @param {object | undefined} node
 * @param {string} expectedName
 */
function validateLayerMesh(node, expectedName) {
  if (!node || node.name !== expectedName) {
    throw new Error(
      `Expected layer "${expectedName}", got "${node?.name ?? 'undefined'}"`,
    )
  }
  if (!node.isMesh) {
    throw new TypeError(`Expected "${expectedName}" to be a mesh (isMesh)`)
  }
  if (Array.isArray(node.material)) {
    throw new TypeError(
      `Expected "${expectedName}" material to be a single material, got array`,
    )
  }
  if (!node.material) {
    throw new TypeError(`Expected "${expectedName}" to have a material`)
  }
}

/**
 * 绑定角色身体双层 Mesh，校验固定层级名称
 * model.children[0] = root，root.children[0/1] = Layer1 / Layer2
 * @param {object} model
 * @returns {{ characterRoot: object, layer1: object, layer2: object, materials: object[] }} 绑定结果
 */
export function bindCharacterBodyLayers(model) {
  const characterRoot = model?.children?.[0]
  if (!characterRoot || characterRoot.name !== EXPECTED_LAYER_NAMES.root) {
    throw new Error(
      `Expected root "${EXPECTED_LAYER_NAMES.root}", got "${characterRoot?.name ?? 'undefined'}"`,
    )
  }

  const layer1 = characterRoot.children?.[0]
  const layer2 = characterRoot.children?.[1]
  validateLayerMesh(layer1, EXPECTED_LAYER_NAMES.layer1)
  validateLayerMesh(layer2, EXPECTED_LAYER_NAMES.layer2)

  return {
    characterRoot,
    layer1,
    layer2,
    materials: [layer1.material, layer2.material],
  }
}

/**
 * 配置皮肤贴图采样参数，并标记是否由本模块拥有（可 dispose）
 * @param {import('three').Texture} texture
 * @param {{ owned: boolean }} options
 * @param {typeof THREE} [three] THREE 命名空间，默认使用模块内 import
 */
export function configureSkinTexture(texture, { owned }, three = THREE) {
  texture.colorSpace = three.SRGBColorSpace
  texture.flipY = false
  texture.magFilter = three.NearestFilter
  texture.minFilter = three.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  if (!texture.userData)
    texture.userData = {}
  texture.userData.skinOwned = Boolean(owned)
  return texture
}

/**
 * 将皮肤贴图应用到 Layer1 / Layer2 的 map 与 emissiveMap
 * @param {{ materials: object[] }} layers
 * @param {import('three').Texture} texture
 */
export function applySkinTextureToLayers(layers, texture) {
  for (const material of layers.materials) {
    if (!material)
      continue
    if ('map' in material)
      material.map = texture
    if ('emissiveMap' in material)
      material.emissiveMap = texture
    material.needsUpdate = true
  }
}

/**
 * 仅销毁本模块创建的皮肤贴图；共享 Resources 贴图不销毁
 * 销毁后清除 skinOwned，二次调用为 no-op
 * @param {import('three').Texture | null | undefined} texture
 */
export function disposeOwnedSkinTexture(texture) {
  if (texture?.userData?.skinOwned !== true)
    return
  texture.dispose()
  texture.userData.skinOwned = false
}

/**
 * 从 Blob 创建可拥有的皮肤 Texture（Object URL 加载后即 revoke）
 * @param {Blob} blob
 * @param {typeof THREE} three
 * @param {{ createObjectURL: Function, revokeObjectURL: Function }} [urlApi] Object URL API，默认 URL
 * @returns {Promise<{ texture: import('three').Texture, objectUrl: string }>} 贴图与曾用过的 objectUrl
 */
export function createTextureFromBlob(
  blob,
  three,
  { createObjectURL, revokeObjectURL } = URL,
) {
  const objectUrl = createObjectURL(blob)
  const loader = new three.TextureLoader()

  return new Promise((resolve, reject) => {
    loader.load(
      objectUrl,
      (texture) => {
        revokeObjectURL(objectUrl)
        configureSkinTexture(texture, { owned: true }, three)
        resolve({ texture, objectUrl })
      },
      undefined,
      (error) => {
        revokeObjectURL(objectUrl)
        reject(error)
      },
    )
  })
}
