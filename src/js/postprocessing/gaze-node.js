import {
  convertToTexture,
  dot,
  float,
  Fn,
  fract,
  mix,
  normalize,
  select,
  sin,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'

/**
 * 二维 hash 噪声（与 GLSL gaze 一致）
 * @param {import('three/tsl').Node} p
 */
const hash2 = Fn(([p]) => {
  return fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453))
})

/**
 * 创建凝视恐惧 TSL 后处理节点（色差 + 血色暗角，转译自 shaders/gaze）
 *
 * @param {import('three/tsl').Node} inputNode - 上游颜色（通常为速度线输出）
 * @param {object} [initial] - 初始参数，对齐 postProcessConfig.gaze
 * @returns {{ node: import('three/tsl').Node, uniforms: Record<string, import('three/tsl').UniformNode> }} 节点与可写 uniforms
 */
export function createGazeNode(inputNode, initial = {}) {
  const textureNode = convertToTexture(inputNode)

  const uTime = uniform(0)
  const uIntensity = uniform(initial.intensity ?? 0)
  const uEnabled = uniform(initial.enabled === false ? 0 : 1)

  const node = Fn(() => {
    const uvNode = uv()
    const sceneColor = textureNode.sample(uvNode)
    const effectiveIntensity = uIntensity.mul(uEnabled)

    const centerUv = uvNode.sub(0.5)
    const distSq = dot(centerUv, centerUv)
    const dist = distSq.sqrt()

    // RGB 色差：向边缘偏移，随 intensity 增强
    const splitAmount = effectiveIntensity.mul(0.05).mul(dist)
    const offset = normalize(centerUv).mul(splitAmount)

    const r = textureNode.sample(uvNode.add(offset)).r
    const g = textureNode.sample(uvNode).g
    const b = textureNode.sample(uvNode.sub(offset)).b
    const baseColor = vec3(r, g, b)

    // 脉冲血色暗角
    const pulse = sin(uTime.mul(float(3.0).add(effectiveIntensity.mul(10.0))))
      .mul(0.5)
      .add(0.5)
    const vignette = smoothstep(
      float(0.8).sub(effectiveIntensity.mul(0.5)),
      float(1.2),
      dist.mul(2.0),
    )

    const bloodColor = vec3(0.6, 0.0, 0.0)
    const bloodMix = vignette.mul(effectiveIntensity).mul(float(0.6).add(pulse.mul(0.4)))
    const noise = hash2(uvNode.add(uTime.mul(0.1))).mul(0.1).mul(vignette).mul(effectiveIntensity)

    const finalColor = mix(baseColor, bloodColor, bloodMix).sub(noise)
    const effected = vec4(finalColor, 1.0)

    // 强度极低时跳过（对齐原 ShaderPass early-out）
    return select(effectiveIntensity.lessThan(0.005), sceneColor, effected)
  })()

  return {
    node,
    uniforms: {
      uTime,
      uIntensity,
      uEnabled,
    },
  }
}
