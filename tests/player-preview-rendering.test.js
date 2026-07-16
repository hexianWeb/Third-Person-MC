import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- Playwright 1.49 runner hangs under the available Node 24 runtime.
import test from 'node:test'

import {
  calculatePlayerPreviewRect,
  renderPlayerPreviewFrame,
} from '../src/js/world/player/player-preview-rendering.js'

test('converts bottom-left preview config to WebGPU top-left logical coordinates', () => {
  const rect = calculatePlayerPreviewRect(
    { width: 1777, height: 923, pixelRatio: 2 },
    { size: 222, margin: { left: 160, bottom: 18 } },
  )

  assert.deepEqual(rect, {
    x: 160,
    y: 683,
    width: 222,
    height: 222,
  })
})

test('clamps the preview rectangle inside a small canvas', () => {
  const rect = calculatePlayerPreviewRect(
    { width: 300, height: 200, pixelRatio: 2 },
    { size: 250, margin: { left: 180, bottom: 20 } },
  )

  assert.deepEqual(rect, {
    x: 180,
    y: 60,
    width: 120,
    height: 120,
  })
})

test('renders the preview over the existing color and restores renderer state', () => {
  const calls = []
  const background = { name: 'sky' }
  const scene = { background }
  const camera = {}
  const renderer = {
    autoClear: false,
    autoClearColor: true,
    autoClearDepth: false,
    autoClearStencil: true,
    getScissorTest: () => false,
    setScissorTest: enabled => calls.push(['scissorTest', enabled]),
    setScissor: (...values) => calls.push(['scissor', ...values]),
    setViewport: (...values) => calls.push(['viewport', ...values]),
    render: (renderScene, renderCamera) => calls.push([
      'render',
      renderScene === scene,
      renderScene.background,
      renderCamera === camera,
      renderer.autoClear,
      renderer.autoClearColor,
      renderer.autoClearDepth,
      renderer.autoClearStencil,
    ]),
  }

  renderPlayerPreviewFrame({
    renderer,
    scene,
    camera,
    rect: { x: 160, y: 683, width: 222, height: 222 },
    canvasSize: { width: 1777, height: 923 },
  })

  assert.deepEqual(calls, [
    ['scissorTest', true],
    ['scissor', 160, 683, 222, 222],
    ['viewport', 160, 683, 222, 222],
    ['render', true, null, true, true, false, true, false],
    ['scissorTest', false],
    ['viewport', 0, 0, 1777, 923],
  ])
  assert.equal(scene.background, background)
  assert.equal(renderer.autoClear, false)
  assert.equal(renderer.autoClearColor, true)
  assert.equal(renderer.autoClearDepth, false)
  assert.equal(renderer.autoClearStencil, true)
})
