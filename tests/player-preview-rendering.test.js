import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- Playwright 1.49 runner hangs under the available Node 24 runtime.
import test from 'node:test'

import { calculatePlayerPreviewRect } from '../src/js/world/player/player-preview-rendering.js'

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

test('collapses to a zero-size rectangle when the canvas has no room', () => {
  const rect = calculatePlayerPreviewRect(
    { width: 100, height: 10, pixelRatio: 1 },
    { size: 250, margin: { left: 180, bottom: 20 } },
  )

  assert.equal(rect.width, 0)
  assert.equal(rect.height, 0)
})
