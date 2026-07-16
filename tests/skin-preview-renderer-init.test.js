import assert from 'node:assert/strict'
import test from 'node:test'

import { initializeSkinPreviewRenderer } from '../src/js/components/skin-preview-scene.js'

test('waits for WebGPU renderer initialization', async () => {
  let finishInit
  const renderer = {
    backend: { isWebGPUBackend: true },
    init: () => new Promise((resolve) => {
      finishInit = resolve
    }),
  }

  let settled = false
  const initializing = initializeSkinPreviewRenderer(renderer).then(() => {
    settled = true
  })
  await Promise.resolve()
  assert.equal(settled, false)

  finishInit()
  await initializing
  assert.equal(settled, true)
})

test('rejects a non-WebGPU backend', async () => {
  const renderer = {
    backend: { isWebGPUBackend: false },
    init: async () => {},
  }

  await assert.rejects(
    initializeSkinPreviewRenderer(renderer),
    /WebGPU backend unavailable/,
  )
})
