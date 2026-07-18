import assert from 'node:assert/strict'
import test from 'node:test'

import { CUSTOM_SKIN_ID, DEFAULT_SKIN_ID } from '../../src/js/config/skin-config.js'
import {
  createSkinStoreLogic,
  validateSkinPng,
} from '../../src/pinia/skinStore.js'

// Node 18+ provides Blob; polyfill only if missing
if (typeof globalThis.Blob === 'undefined') {
  const { Blob: NodeBlob } = await import('node:buffer')
  globalThis.Blob = NodeBlob
}

const STORAGE_KEY = 'mc-player-skin'

/**
 * 内存假存储：记录 setCustomSkin 调用次数与顺序
 * @param {{ blob: Blob, schemaVersion: number } | null} [initial]
 */
function createFakeStorage(initial = null) {
  let record = initial
  const calls = {
    setCustomSkin: 0,
    getCustomSkin: 0,
    order: /** @type {string[]} */ ([]),
  }

  return {
    calls,
    getCustomSkin: async () => {
      calls.getCustomSkin += 1
      calls.order.push('getCustomSkin')
      return record
    },
    setCustomSkin: async (blob) => {
      calls.setCustomSkin += 1
      calls.order.push('setCustomSkin')
      record = { blob, schemaVersion: 1 }
    },
    clearCustomSkin: async () => {
      calls.order.push('clearCustomSkin')
      record = null
    },
    /** 测试辅助：读取当前内存记录 */
    _getRecord: () => record,
  }
}

/**
 * 简易 localStorage map
 * @param {Record<string, string>} [initial]
 */
function createFakeLocalStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value))
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
}

/** 捕获 mitt 风格 emit */
function createFakeEmitter() {
  /** @type {Array<{ type: string, payload: unknown }>} */
  const events = []
  return {
    events,
    emit: (type, payload) => {
      events.push({ type, payload })
    },
  }
}

function pngFile(name = 'skin.png') {
  return new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })
}

test('validateSkinPng rejects non-png type', async () => {
  const result = await validateSkinPng(
    new Blob(['x'], { type: 'image/jpeg' }),
    { createImageBitmap: async () => ({ width: 64, height: 64, close() {} }) },
  )
  assert.equal(result.ok, false)
  assert.equal(result.errorKey, 'skin.errorInvalidType')
})

test('validateSkinPng rejects decode failure', async () => {
  const result = await validateSkinPng(pngFile(), {
    createImageBitmap: async () => {
      throw new Error('decode failed')
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.errorKey, 'skin.errorDecode')
})

test('validateSkinPng rejects non-64x64', async () => {
  const result = await validateSkinPng(pngFile(), {
    createImageBitmap: async () => ({ width: 32, height: 32, close() {} }),
  })
  assert.equal(result.ok, false)
  assert.equal(result.errorKey, 'skin.errorInvalidSize')
})

test('1. initialize restores valid custom record and keeps currentSkinId === custom', async () => {
  const blob = pngFile()
  const storage = createFakeStorage({ blob, schemaVersion: 1 })
  const localStorage = createFakeLocalStorage({ [STORAGE_KEY]: CUSTOM_SKIN_ID })
  const emitter = createFakeEmitter()

  const store = createSkinStoreLogic({ storage, localStorage, emitter })
  await store.initialize()

  assert.equal(store.currentSkinId, CUSTOM_SKIN_ID)
  assert.equal(store.committedCustomSkin, blob)
  assert.equal(emitter.events.length, 0)
})

test('2. initialize with custom in localStorage but missing record falls back and repairs', async () => {
  const storage = createFakeStorage(null)
  const localStorage = createFakeLocalStorage({ [STORAGE_KEY]: CUSTOM_SKIN_ID })
  const emitter = createFakeEmitter()

  const store = createSkinStoreLogic({ storage, localStorage, emitter })
  await store.initialize()

  assert.equal(store.currentSkinId, DEFAULT_SKIN_ID)
  assert.equal(localStorage.getItem(STORAGE_KEY), DEFAULT_SKIN_ID)
  assert.equal(store.committedCustomSkin, null)
  assert.equal(emitter.events.length, 0)
})

test('3. upload creates pending candidate without calling storage.setCustomSkin', async () => {
  const storage = createFakeStorage(null)
  const localStorage = createFakeLocalStorage({ [STORAGE_KEY]: 'steve' })
  const emitter = createFakeEmitter()
  const file = pngFile()

  const store = createSkinStoreLogic({
    storage,
    localStorage,
    emitter,
    validateSkinPng: async () => ({ ok: true }),
  })
  await store.initialize()
  store.initPreview()

  const result = await store.setPendingCustomSkin(file)

  assert.equal(result.ok, true)
  assert.equal(store.previewSkinId, CUSTOM_SKIN_ID)
  assert.ok(store.pendingCustomSkin)
  assert.equal(storage.calls.setCustomSkin, 0)
  assert.equal(store.currentSkinId, 'steve')
  assert.ok(store.previewRevision > 0)
})

test('4. cancel leaves committed Blob + currentSkinId unchanged', async () => {
  const committed = pngFile()
  const storage = createFakeStorage({ blob: committed, schemaVersion: 1 })
  const localStorage = createFakeLocalStorage({ [STORAGE_KEY]: CUSTOM_SKIN_ID })
  const emitter = createFakeEmitter()

  const store = createSkinStoreLogic({
    storage,
    localStorage,
    emitter,
    validateSkinPng: async () => ({ ok: true }),
  })
  await store.initialize()
  store.initPreview()
  await store.setPendingCustomSkin(pngFile())
  emitter.events.length = 0

  store.cancelPreview()

  assert.equal(store.currentSkinId, CUSTOM_SKIN_ID)
  assert.equal(store.committedCustomSkin, committed)
  assert.equal(store.pendingCustomSkin, null)
  assert.equal(store.previewSkinId, CUSTOM_SKIN_ID)
  assert.equal(storage.calls.setCustomSkin, 0)
  assert.equal(emitter.events.length, 0)
  assert.equal(localStorage.getItem(STORAGE_KEY), CUSTOM_SKIN_ID)
})

test('5. successful apply commits to storage before mutating current state', async () => {
  const storage = createFakeStorage(null)
  const localStorage = createFakeLocalStorage({ [STORAGE_KEY]: 'steve' })
  const emitter = createFakeEmitter()
  const pending = pngFile()
  /** @type {string[]} */
  const order = []

  const store = createSkinStoreLogic({
    storage: {
      ...storage,
      setCustomSkin: async (blob) => {
        order.push('storage')
        // 写入时 current 仍应为旧预设
        assert.equal(store.currentSkinId, 'steve')
        await storage.setCustomSkin(blob)
      },
      getCustomSkin: storage.getCustomSkin,
      clearCustomSkin: storage.clearCustomSkin,
    },
    localStorage,
    emitter,
    validateSkinPng: async () => ({ ok: true }),
  })
  await store.initialize()
  store.initPreview()
  await store.setPendingCustomSkin(pending)

  const result = await store.applySkin()

  assert.equal(result.ok, true)
  assert.deepEqual(order, ['storage'])
  assert.equal(store.currentSkinId, CUSTOM_SKIN_ID)
  assert.equal(store.committedCustomSkin, pending)
  assert.equal(store.pendingCustomSkin, null)
  assert.equal(localStorage.getItem(STORAGE_KEY), CUSTOM_SKIN_ID)
  assert.equal(emitter.events.length, 1)
  assert.equal(emitter.events[0].type, 'skin:changed')
  assert.equal(emitter.events[0].payload.skinId, CUSTOM_SKIN_ID)
  assert.equal(emitter.events[0].payload.revision, store.committedRevision)
  assert.ok(store.committedRevision > 0)
})

test('6. failed apply preserves current and previously committed custom skin', async () => {
  const committed = pngFile()
  const storage = createFakeStorage({ blob: committed, schemaVersion: 1 })
  const localStorage = createFakeLocalStorage({ [STORAGE_KEY]: CUSTOM_SKIN_ID })
  const emitter = createFakeEmitter()
  const pending = pngFile()

  const store = createSkinStoreLogic({
    storage: {
      getCustomSkin: storage.getCustomSkin,
      clearCustomSkin: storage.clearCustomSkin,
      setCustomSkin: async () => {
        throw new Error('idb write failed')
      },
    },
    localStorage,
    emitter,
    validateSkinPng: async () => ({ ok: true }),
  })
  await store.initialize()
  const revisionBefore = store.committedRevision
  store.initPreview()
  await store.setPendingCustomSkin(pending)
  emitter.events.length = 0

  const result = await store.applySkin()

  assert.equal(result.ok, false)
  assert.equal(result.errorKey, 'skin.errorSave')
  assert.equal(store.errorKey, 'skin.errorSave')
  assert.equal(store.currentSkinId, CUSTOM_SKIN_ID)
  assert.equal(store.committedCustomSkin, committed)
  assert.equal(store.pendingCustomSkin, pending)
  assert.equal(store.committedRevision, revisionBefore)
  assert.equal(localStorage.getItem(STORAGE_KEY), CUSTOM_SKIN_ID)
  assert.equal(emitter.events.length, 0)
})

test('7. pending custom counts as change when both IDs are custom', async () => {
  const committed = pngFile()
  const storage = createFakeStorage({ blob: committed, schemaVersion: 1 })
  const localStorage = createFakeLocalStorage({ [STORAGE_KEY]: CUSTOM_SKIN_ID })
  const emitter = createFakeEmitter()

  const store = createSkinStoreLogic({
    storage,
    localStorage,
    emitter,
    validateSkinPng: async () => ({ ok: true }),
  })
  await store.initialize()
  store.initPreview()

  assert.equal(store.previewSkinId, CUSTOM_SKIN_ID)
  assert.equal(store.currentSkinId, CUSTOM_SKIN_ID)
  assert.equal(store.hasPreviewChanges, false)

  await store.setPendingCustomSkin(pngFile())

  assert.equal(store.previewSkinId, CUSTOM_SKIN_ID)
  assert.equal(store.currentSkinId, CUSTOM_SKIN_ID)
  assert.equal(store.hasPreviewChanges, true)
  assert.equal(store.hasPendingCustomSkin, true)
})

test('8. storage open/get failure does not throw; sets recoverable error and default preset', async () => {
  const localStorage = createFakeLocalStorage({ [STORAGE_KEY]: 'alex' })
  const emitter = createFakeEmitter()
  const storage = {
    getCustomSkin: async () => {
      throw new Error('open failed')
    },
    setCustomSkin: async () => {},
    clearCustomSkin: async () => {},
  }

  const store = createSkinStoreLogic({ storage, localStorage, emitter })
  await assert.doesNotReject(() => store.initialize())

  assert.equal(store.currentSkinId, DEFAULT_SKIN_ID)
  assert.ok(store.errorKey)
  assert.equal(store.committedCustomSkin, null)
  assert.equal(emitter.events.length, 0)
})
