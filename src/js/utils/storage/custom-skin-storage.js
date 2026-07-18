/**
 * IndexedDB 适配器：持久化用户自定义皮肤 PNG Blob
 * Framework-free so Pinia/tests can inject a fake indexedDB.
 */

export const CUSTOM_SKIN_DB_NAME = 'mc-custom-skin'
export const CUSTOM_SKIN_STORE = 'skins'
export const CUSTOM_SKIN_KEY = 'custom'
export const CUSTOM_SKIN_SCHEMA_VERSION = 1

/** 数据库结构版本（与记录内 schemaVersion 独立） */
const DB_VERSION = 1

/**
 * 将 IDBRequest 包装为 Promise；失败时附带操作上下文，不包含图片字节
 * @param {IDBRequest} request
 * @param {string} operation
 * @returns {Promise<unknown>}
 */
function requestToPromise(request, operation) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      const detail = request.error?.message || 'unknown error'
      reject(new Error(`custom-skin-storage ${operation} failed: ${detail}`))
    }
  })
}

/**
 * 等待事务真正提交；写操作需在 complete 后才保证持久可见
 * @param {IDBTransaction} tx
 * @param {string} operation
 * @returns {Promise<void>}
 */
function transactionToPromise(tx, operation) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => {
      const detail = tx.error?.message || 'aborted'
      reject(new Error(`custom-skin-storage ${operation} failed: ${detail}`))
    }
    tx.onerror = () => {
      const detail = tx.error?.message || 'unknown error'
      reject(new Error(`custom-skin-storage ${operation} failed: ${detail}`))
    }
  })
}

/**
 * @param {{ indexedDB?: IDBFactory }} [options]
 */
export function createCustomSkinStorage({ indexedDB = globalThis.indexedDB } = {}) {
  if (!indexedDB) {
    throw new Error('custom-skin-storage open failed: indexedDB is unavailable')
  }

  let dbPromise = null

  /**
   * 打开（或复用）数据库；首次打开时创建单一 object store
   * @returns {Promise<IDBDatabase>}
   */
  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        let request
        try {
          request = indexedDB.open(CUSTOM_SKIN_DB_NAME, DB_VERSION)
        }
        catch (error) {
          reject(new Error(`custom-skin-storage open failed: ${error?.message || 'unknown error'}`))
          return
        }

        request.onupgradeneeded = () => {
          const db = request.result
          // 仅维护一个 skins store，以 id 作为主键
          if (!db.objectStoreNames.contains(CUSTOM_SKIN_STORE)) {
            db.createObjectStore(CUSTOM_SKIN_STORE, { keyPath: 'id' })
          }
        }

        request.onsuccess = () => resolve(request.result)

        request.onerror = () => {
          dbPromise = null
          const detail = request.error?.message || 'unknown error'
          reject(new Error(`custom-skin-storage open failed: ${detail}`))
        }
      })
    }

    return dbPromise
  }

  /**
   * 写路径：同时等待 request success 与 transaction complete
   * @param {string} operation
   * @param {(store: IDBObjectStore) => IDBRequest} run
   * @returns {Promise<void>}
   */
  async function runWrite(operation, run) {
    const db = await open()
    const tx = db.transaction(CUSTOM_SKIN_STORE, 'readwrite')
    const store = tx.objectStore(CUSTOM_SKIN_STORE)
    // 并行等待 request 与 complete，避免 request 失败后 abort 变成未处理拒绝
    const committed = transactionToPromise(tx, operation)
    const requested = requestToPromise(run(store), operation)
    await Promise.all([requested, committed])
  }

  /**
   * @returns {Promise<{ blob: Blob, schemaVersion: number } | null>}
   */
  async function getCustomSkin() {
    const db = await open()
    const tx = db.transaction(CUSTOM_SKIN_STORE, 'readonly')
    const store = tx.objectStore(CUSTOM_SKIN_STORE)
    const record = await requestToPromise(store.get(CUSTOM_SKIN_KEY), 'get')
    if (!record?.blob) return null
    return {
      blob: record.blob,
      schemaVersion: record.schemaVersion,
    }
  }

  /**
   * 以固定 key upsert 自定义皮肤记录
   * @param {Blob} blob
   * @returns {Promise<void>}
   */
  async function setCustomSkin(blob) {
    const record = {
      id: CUSTOM_SKIN_KEY,
      blob,
      schemaVersion: CUSTOM_SKIN_SCHEMA_VERSION,
    }
    await runWrite('put', (store) => store.put(record))
  }

  /**
   * @returns {Promise<void>}
   */
  async function clearCustomSkin() {
    await runWrite('delete', (store) => store.delete(CUSTOM_SKIN_KEY))
  }

  return {
    open,
    getCustomSkin,
    setCustomSkin,
    clearCustomSkin,
  }
}
