import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- Playwright 1.49 runner hangs under the available Node 24 runtime.
import test from 'node:test'

import { mountSkinPreview } from '../src/js/components/skin-preview-lifecycle.js'

test('returns the initialized preview while mounted', async () => {
  const preview = { dispose() {} }
  const result = await mountSkinPreview({
    createPreview: async () => preview,
    isUnmounted: () => false,
  })

  assert.equal(result, preview)
})

test('disposes a preview that resolves after unmount', async () => {
  let disposed = 0
  const preview = {
    dispose: () => {
      disposed++
    },
  }
  const result = await mountSkinPreview({
    createPreview: async () => preview,
    isUnmounted: () => true,
  })

  assert.equal(result, null)
  assert.equal(disposed, 1)
})
