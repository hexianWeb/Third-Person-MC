/**
 * 计算玩家预览框在画布上的矩形（WebGPU 左上角原点，逻辑像素）
 * @param {{ width: number, height: number }} sizes - 画布逻辑尺寸
 * @param {{ size: number, margin: { left: number, bottom: number } }} config - 预览配置
 * @returns {{ x: number, y: number, width: number, height: number }} 预览矩形
 */
export function calculatePlayerPreviewRect(sizes, config) {
  const canvasWidth = Math.max(0, sizes.width)
  const canvasHeight = Math.max(0, sizes.height)
  const x = Math.min(Math.max(0, config.margin.left), canvasWidth)
  const bottom = Math.min(Math.max(0, config.margin.bottom), canvasHeight)
  const size = Math.max(0, Math.min(
    config.size,
    canvasWidth - x,
    canvasHeight - bottom,
  ))

  return {
    x,
    y: canvasHeight - bottom - size,
    width: size,
    height: size,
  }
}
