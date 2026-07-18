import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createCustomSkinStorage,
  CUSTOM_SKIN_KEY,
} from '../../src/js/utils/storage/custom-skin-storage.js'

// Node 18+ provides Blob; polyfill only if missing so unit tests stay runnable.
if (typeof globalThis.Blob === 'undefined') {
  const { Blob: NodeBlob } = await import('node:buffer')
  globalThis.Blob = NodeBlob
}

/**
 * 最小内存 IndexedDB：仅覆盖 adapter 用到的 open / transaction / get / put / delete
 * 写操作在 macrotask（setTimeout 0）的 transaction complete 时才落库，
 * 用于捕获“仅等 request success”的回归
 */
function createMemoryIndexedDB() {
  /** @type {Map<string, { version: number, stores: Map<string, Map<unknown, unknown>> }>} */
  const databases = new Map()

  function createRequest(run, afterSuccess) {
    const request = {
      result: undefined,
      error: null,
      onsuccess: null,
      onerror: null,
    }

    queueMicrotask(() => {
      try {
        request.result = run()
        if (typeof request.onsuccess === 'function') request.onsuccess({ target: request })
        // 用宏任务提交：仅 await request 的写路径会在 await 边界后立刻继续，读到未提交数据
        if (typeof afterSuccess === 'function') {
          setTimeout(afterSuccess, 0)
        }
      }
      catch (error) {
        request.error = error instanceof Error ? error : new Error(String(error))
        if (typeof request.onerror === 'function') request.onerror({ target: request })
      }
    })

    return request
  }

  return {
    open(name, version = 1) {
      const openRequest = {
        result: undefined,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      }

      queueMicrotask(() => {
        try {
          let entry = databases.get(name)
          const needsUpgrade = !entry || entry.version < version

          if (!entry) {
            entry = { version, stores: new Map() }
            databases.set(name, entry)
          }

          const db = {
            name,
            objectStoreNames: {
              contains(storeName) {
                return entry.stores.has(storeName)
              },
            },
            createObjectStore(storeName, options = {}) {
              if (entry.stores.has(storeName)) {
                throw new Error(`object store already exists: ${storeName}`)
              }
              const storeData = new Map()
              entry.stores.set(storeName, storeData)
              return {
                keyPath: options.keyPath ?? null,
              }
            },
            transaction(storeNames, mode = 'readonly') {
              const storeName = Array.isArray(storeNames) ? storeNames[0] : storeNames
              const storeData = entry.stores.get(storeName)
              if (!storeData) throw new Error(`object store not found: ${storeName}`)

              /** @type {Array<() => void>} */
              const pendingMutations = []
              let settled = false

              const tx = {
                mode,
                error: null,
                oncomplete: null,
                onabort: null,
                onerror: null,
                objectStore() {
                  return objectStore
                },
              }

              function commit() {
                if (settled) return
                settled = true
                for (const mutate of pendingMutations) mutate()
                pendingMutations.length = 0
                if (typeof tx.oncomplete === 'function') tx.oncomplete()
              }

              const objectStore = {
                get(key) {
                  // 读路径：直接读已提交数据；不触发写提交边界
                  return createRequest(() => storeData.get(key))
                },
                put(value) {
                  return createRequest(
                    () => {
                      const key = value?.id
                      // 仅排队，complete 时才写入 store
                      pendingMutations.push(() => storeData.set(key, value))
                      return key
                    },
                    commit,
                  )
                },
                delete(key) {
                  return createRequest(
                    () => {
                      pendingMutations.push(() => storeData.delete(key))
                      return undefined
                    },
                    commit,
                  )
                },
              }

              return tx
            },
          }

          openRequest.result = db

          if (needsUpgrade) {
            entry.version = version
            if (typeof openRequest.onupgradeneeded === 'function') {
              openRequest.onupgradeneeded({ target: openRequest })
            }
          }

          if (typeof openRequest.onsuccess === 'function') {
            openRequest.onsuccess({ target: openRequest })
          }
        }
        catch (error) {
          openRequest.error = error instanceof Error ? error : new Error(String(error))
          if (typeof openRequest.onerror === 'function') {
            openRequest.onerror({ target: openRequest })
          }
        }
      })

      return openRequest
    },
  }
}

test('reads null when no custom skin exists', async () => {
  const storage = createCustomSkinStorage({ indexedDB: createMemoryIndexedDB() })
  assert.equal(await storage.getCustomSkin(), null)
})

test('writes and reads the fixed custom record', async () => {
  const storage = createCustomSkinStorage({ indexedDB: createMemoryIndexedDB() })
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
  await storage.setCustomSkin(blob)
  const record = await storage.getCustomSkin()
  assert.equal(record.schemaVersion, 1)
  assert.equal(record.blob.type, 'image/png')
  assert.equal(await record.blob.arrayBuffer().then(b => new Uint8Array(b)[0]), 1)
  assert.equal(CUSTOM_SKIN_KEY, 'custom')
})

test('clear removes the custom record', async () => {
  const storage = createCustomSkinStorage({ indexedDB: createMemoryIndexedDB() })
  await storage.setCustomSkin(new Blob(['x'], { type: 'image/png' }))
  await storage.clearCustomSkin()
  assert.equal(await storage.getCustomSkin(), null)
})
