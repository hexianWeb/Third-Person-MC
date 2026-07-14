import {
  abs,
  atan,
  clamp,
  float,
  floor,
  Fn,
  fract,
  mix,
  select,
  sin,
  smoothstep,
  step,
  uniform,
  uv,
  vec4,
} from 'three/tsl'
import * as THREE from 'three/webgpu'

/**
 * 伪随机（与 GLSL speedlines 一致）
 * @param {import('three/tsl').Node} seed
 */
const random = Fn(([seed]) => {
  return fract(sin(seed.mul(12.9898)).mul(43758.5453))
})

/**
 * 创建速度线 TSL 后处理节点（由极坐标扇区三角形逻辑转译自 shaders/speedlines）
 *
 * @param {import('three/tsl').Node} inputNode - 上游颜色（通常为 bloom 合成结果）
 * @param {object} [initial] - 初始参数，对齐 postProcessConfig.speedLines
 * @returns {{ node: import('three/tsl').Node, uniforms: Record<string, import('three/tsl').UniformNode> }} 节点与可写 uniforms
 */
export function createSpeedLinesNode(inputNode, initial = {}) {
  const color = initial.color ?? { r: 255, g: 255, b: 255 }

  const uTime = uniform(0)
  const uOpacity = uniform(initial.opacity ?? 0)
  const uEnabled = uniform(initial.enabled === false ? 0 : 1)
  const uColor = uniform(new THREE.Color(color.r / 255, color.g / 255, color.b / 255))
  const uDensity = uniform(initial.density ?? 66.0)
  const uSpeed = uniform(initial.speed ?? 6.0)
  const uThickness = uniform(initial.thickness ?? 0.24)
  const uMinRadius = uniform(initial.minRadius ?? 0.4)
  const uMaxRadius = uniform(initial.maxRadius ?? 1.3)
  const uRandomness = uniform(initial.randomness ?? 0.5)

  const node = Fn(() => {
    const sceneColor = inputNode.toVar()
    const effectiveOpacity = uOpacity.mul(uEnabled)

    const uvNode = uv()
    const centeredUv = uvNode.sub(0.5).mul(2.0)
    const radius = centeredUv.length()
    const angle = atan(centeredUv.y, centeredUv.x)
    const pi = float(3.14159265)
    const normalizedAngle = angle.add(pi).div(pi.mul(2.0))

    const sectorCount = uDensity
    const sectorIndex = floor(normalizedAngle.mul(sectorCount))
    const sectorProgress = fract(normalizedAngle.mul(sectorCount))
    const sectorCenter = float(0.5)

    const sectorSeed = random(sectorIndex.add(0.5))
    const showTriangle = step(0.4, sectorSeed)

    const angleOffset = random(sectorIndex.add(1.5)).sub(0.5).mul(uRandomness).mul(0.3)
    const phase = random(sectorIndex.add(2.5)).mul(6.28318)
    const pulse = sin(uTime.mul(uSpeed).add(phase)).mul(0.5).add(0.5)

    const tipRadius = mix(uMaxRadius, uMinRadius, pulse)
    const baseRadius = uMaxRadius.add(0.2)

    const angleFromCenter = abs(sectorProgress.sub(sectorCenter).add(angleOffset))
    const halfWidth = uThickness.mul(0.5)
    const radiusProgress = clamp(
      radius.sub(tipRadius).div(baseRadius.sub(tipRadius)),
      0.0,
      1.0,
    )
    const allowedWidth = halfWidth.mul(radiusProgress)

    const edgeSoftness = float(0.02)
    const softEdge = float(1.0)
      .sub(smoothstep(allowedWidth.sub(edgeSoftness), allowedWidth, angleFromCenter))
      .mul(smoothstep(tipRadius.sub(edgeSoftness), tipRadius.add(edgeSoftness), radius))
      .mul(float(1.0).sub(smoothstep(baseRadius.sub(edgeSoftness), baseRadius, radius)))
      .mul(showTriangle)

    const triangleAlpha = softEdge.mul(radiusProgress).mul(effectiveOpacity)
    const finalRgb = mix(sceneColor.rgb, uColor, triangleAlpha)
    const effected = vec4(finalRgb, sceneColor.a)

    // 透明度极低时透传（对齐原 ShaderPass early-out）
    return select(effectiveOpacity.lessThanEqual(0.001), sceneColor, effected)
  })()

  return {
    node,
    uniforms: {
      uTime,
      uOpacity,
      uEnabled,
      uColor,
      uDensity,
      uSpeed,
      uThickness,
      uMinRadius,
      uMaxRadius,
      uRandomness,
    },
  }
}
