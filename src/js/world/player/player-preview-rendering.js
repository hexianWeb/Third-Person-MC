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

export function renderPlayerPreviewFrame({ renderer, scene, camera, rect, canvasSize }) {
  const savedBackground = scene.background
  const savedScissorTest = renderer.getScissorTest()
  const savedAutoClear = renderer.autoClear
  const savedAutoClearColor = renderer.autoClearColor
  const savedAutoClearDepth = renderer.autoClearDepth
  const savedAutoClearStencil = renderer.autoClearStencil

  try {
    scene.background = null
    renderer.autoClear = true
    renderer.autoClearColor = false
    renderer.autoClearDepth = true
    renderer.autoClearStencil = false
    renderer.setScissorTest(true)
    renderer.setScissor(rect.x, rect.y, rect.width, rect.height)
    renderer.setViewport(rect.x, rect.y, rect.width, rect.height)
    renderer.render(scene, camera)
  }
  finally {
    renderer.setScissorTest(savedScissorTest)
    renderer.setViewport(0, 0, canvasSize.width, canvasSize.height)
    renderer.autoClear = savedAutoClear
    renderer.autoClearColor = savedAutoClearColor
    renderer.autoClearDepth = savedAutoClearDepth
    renderer.autoClearStencil = savedAutoClearStencil
    scene.background = savedBackground
  }
}
