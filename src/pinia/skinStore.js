/**
 * Skin Store - 皮肤系统状态管理
 * 管理预设/自定义皮肤选择、预览事务与持久化（localStorage + IndexedDB Blob）
 */
import { defineStore } from 'pinia'
import { computed, reactive, toRef } from 'vue'

import {
  ALL_SKINS,
  CUSTOM_SKIN_ID,
  DEFAULT_SKIN_ID,
  SKIN_LIST,
} from '../js/config/skin-config.js'
import { createCustomSkinStorage } from '../js/utils/storage/custom-skin-storage.js'

// ========================================
// Constants
// ========================================
const STORAGE_KEY = 'mc-player-skin'

/** 懒加载共享 event-bus，避免 Node 单测静态拉入 Vite 调试依赖链 */
let cachedDefaultEmitter = null
let defaultEmitterLoad = null

/**
 * @returns {Promise<{ emit: (type: string, payload?: unknown) => void }>}
 */
async function resolveDefaultEmitter() {
  if (cachedDefaultEmitter)
    return cachedDefaultEmitter
  if (!defaultEmitterLoad) {
    defaultEmitterLoad = import('../js/utils/event/event-bus.js')
      .then((mod) => {
        cachedDefaultEmitter = mod.default
        return cachedDefaultEmitter
      })
      .catch(() => {
        // Node / 无 window 环境：静默 no-op，单测应注入 emitter
        cachedDefaultEmitter = { emit() {} }
        return cachedDefaultEmitter
      })
  }
  return defaultEmitterLoad
}

/**
 * 校验上传皮肤 PNG：类型、可解码、精确 64×64
 * @param {Blob|File} file
 * @param {{ createImageBitmap?: typeof createImageBitmap }} [options]
 * @returns {Promise<{ ok: true } | { ok: false, errorKey: string }>}
 */
export async function validateSkinPng(file, { createImageBitmap: createBitmap } = {}) {
  const createImage = createBitmap ?? globalThis.createImageBitmap

  if (!file || file.type !== 'image/png') {
    return { ok: false, errorKey: 'skin.errorInvalidType' }
  }

  if (typeof createImage !== 'function') {
    return { ok: false, errorKey: 'skin.errorDecode' }
  }

  let bitmap
  try {
    bitmap = await createImage(file)
  }
  catch {
    return { ok: false, errorKey: 'skin.errorDecode' }
  }

  try {
    if (!bitmap || bitmap.width !== 64 || bitmap.height !== 64) {
      return { ok: false, errorKey: 'skin.errorInvalidSize' }
    }
    return { ok: true }
  }
  finally {
    bitmap?.close?.()
  }
}

/**
 * 纯逻辑工厂：便于 Node 单测注入 storage / localStorage / emitter / validate
 * @param {{
 *   storage?: ReturnType<typeof createCustomSkinStorage>,
 *   localStorage?: Storage,
 *   emitter?: { emit: (type: string, payload?: unknown) => void },
 *   validateSkinPng?: typeof validateSkinPng,
 * }} [deps]
 */
export function createSkinStoreLogic(deps = {}) {
  let storage = deps.storage ?? null
  let localStorageRef = deps.localStorage ?? null
  const injectedEmitter = deps.emitter ?? null
  const validate = deps.validateSkinPng ?? validateSkinPng

  /**
   * @param {{ skinId: string, revision: number }} payload
   */
  async function emitSkinChanged(payload) {
    const emitter = injectedEmitter ?? await resolveDefaultEmitter()
    emitter.emit('skin:changed', payload)
  }

  const store = {
    currentSkinId: DEFAULT_SKIN_ID,
    previewSkinId: null,
    committedCustomSkin: null,
    pendingCustomSkin: null,
    committedRevision: 0,
    previewRevision: 0,
    isLoading: false,
    errorKey: null,
  }

  Object.defineProperties(store, {
    hasPendingCustomSkin: {
      enumerable: true,
      get() {
        return this.pendingCustomSkin != null
      },
    },
    hasPreviewChanges: {
      enumerable: true,
      get() {
        return this.previewSkinId !== this.currentSkinId || this.pendingCustomSkin != null
      },
    },
  })

  /**
   * 将当前皮肤 ID 写入 localStorage
   */
  function saveSkinId(skinId) {
    localStorageRef.setItem(STORAGE_KEY, skinId)
  }

  /**
   * 从 localStorage 读取皮肤 ID（可能无效）
   * @returns {string|null}
   */
  function readSavedSkinId() {
    try {
      return localStorageRef.getItem(STORAGE_KEY)
    }
    catch {
      return null
    }
  }

  /**
   * 异步水合：读取 localStorage + IndexedDB，不抛出、不 emit
   * @param {{ storage?: object, localStorage?: Storage }} [options]
   */
  async function initialize(options = {}) {
    if (options.storage !== undefined)
      storage = options.storage
    if (options.localStorage !== undefined)
      localStorageRef = options.localStorage

    storage = storage ?? createCustomSkinStorage()
    localStorageRef = localStorageRef ?? globalThis.localStorage

    store.isLoading = true
    store.errorKey = null

    try {
      const savedId = readSavedSkinId()

      // 打开/读取自定义皮肤；失败则可恢复错误 + 默认预设
      let customRecord = null
      try {
        if (typeof storage.open === 'function') {
          await storage.open()
        }
        customRecord = await storage.getCustomSkin()
      }
      catch {
        store.errorKey = 'skin.errorLoad'
        store.currentSkinId = DEFAULT_SKIN_ID
        store.previewSkinId = DEFAULT_SKIN_ID
        store.committedCustomSkin = null
        return
      }

      if (customRecord?.blob) {
        store.committedCustomSkin = customRecord.blob
      }
      else {
        store.committedCustomSkin = null
      }

      // custom 已保存但无有效 Blob → 回退默认并修复 localStorage
      if (savedId === CUSTOM_SKIN_ID) {
        if (store.committedCustomSkin) {
          store.currentSkinId = CUSTOM_SKIN_ID
        }
        else {
          store.currentSkinId = DEFAULT_SKIN_ID
          saveSkinId(DEFAULT_SKIN_ID)
        }
      }
      else if (savedId && SKIN_LIST.some(s => s.id === savedId)) {
        store.currentSkinId = savedId
      }
      else {
        store.currentSkinId = DEFAULT_SKIN_ID
      }

      store.previewSkinId = store.currentSkinId
    }
    finally {
      store.isLoading = false
    }
  }

  /**
   * 进入选择器时同步预览态
   */
  function initPreview() {
    store.previewSkinId = store.currentSkinId
    store.pendingCustomSkin = null
    store.errorKey = null
    store.isLoading = false
  }

  /**
   * @param {string} skinId
   */
  function setPreviewSkin(skinId) {
    store.previewSkinId = skinId
  }

  /**
   * 上传候选自定义皮肤（仅预览，不写 IndexedDB）
   * @param {Blob|File} file
   * @returns {Promise<{ ok: boolean, errorKey?: string }>}
   */
  async function setPendingCustomSkin(file) {
    store.isLoading = true
    try {
      const result = await validate(file, {
        createImageBitmap: globalThis.createImageBitmap,
      })

      if (!result.ok) {
        store.errorKey = result.errorKey
        return { ok: false, errorKey: result.errorKey }
      }

      store.pendingCustomSkin = file
      store.previewSkinId = CUSTOM_SKIN_ID
      store.previewRevision += 1
      store.errorKey = null
      return { ok: true }
    }
    finally {
      store.isLoading = false
    }
  }

  /**
   * 提交预览：预设直接写 localStorage；自定义 pending 先写 IndexedDB
   * @returns {Promise<{ ok: boolean, errorKey?: string }>}
   */
  async function applySkin() {
    if (!store.hasPreviewChanges) {
      return { ok: true }
    }

    const targetId = store.previewSkinId
    store.isLoading = true

    try {
      // 自定义 pending：IndexedDB 成功后才提升状态
      if (targetId === CUSTOM_SKIN_ID && store.pendingCustomSkin) {
        try {
          await storage.setCustomSkin(store.pendingCustomSkin)
        }
        catch {
          store.errorKey = 'skin.errorSave'
          return { ok: false, errorKey: 'skin.errorSave' }
        }

        store.committedCustomSkin = store.pendingCustomSkin
        store.pendingCustomSkin = null
        store.currentSkinId = CUSTOM_SKIN_ID
        store.previewSkinId = CUSTOM_SKIN_ID
        saveSkinId(CUSTOM_SKIN_ID)
        store.committedRevision += 1
        store.errorKey = null
        await emitSkinChanged({
          skinId: store.currentSkinId,
          revision: store.committedRevision,
        })
        return { ok: true }
      }

      // 已有 committed custom、无 pending：切回 custom
      if (targetId === CUSTOM_SKIN_ID) {
        if (!store.committedCustomSkin) {
          store.errorKey = 'skin.errorSave'
          return { ok: false, errorKey: 'skin.errorSave' }
        }
        store.pendingCustomSkin = null
        store.currentSkinId = CUSTOM_SKIN_ID
        store.previewSkinId = CUSTOM_SKIN_ID
        saveSkinId(CUSTOM_SKIN_ID)
        store.committedRevision += 1
        store.errorKey = null
        await emitSkinChanged({
          skinId: store.currentSkinId,
          revision: store.committedRevision,
        })
        return { ok: true }
      }

      // 预设路径
      store.pendingCustomSkin = null
      store.currentSkinId = targetId
      store.previewSkinId = targetId
      saveSkinId(targetId)
      store.committedRevision += 1
      store.errorKey = null
      await emitSkinChanged({
        skinId: store.currentSkinId,
        revision: store.committedRevision,
      })
      return { ok: true }
    }
    finally {
      store.isLoading = false
    }
  }

  /**
   * 取消预览：丢弃 pending，不写持久化、不 emit
   */
  function cancelPreview() {
    store.pendingCustomSkin = null
    store.previewSkinId = store.currentSkinId
    store.errorKey = null
    store.isLoading = false
  }

  /**
   * @param {string} skinId
   * @returns {object|undefined}
   */
  function getSkinConfig(skinId) {
    return ALL_SKINS.find(s => s.id === skinId)
  }

  store.initialize = initialize
  store.initPreview = initPreview
  store.setPreviewSkin = setPreviewSkin
  store.setPendingCustomSkin = setPendingCustomSkin
  store.applySkin = applySkin
  store.cancelPreview = cancelPreview
  store.getSkinConfig = getSkinConfig

  return store
}

// ========================================
// Pinia Store（薄包装，状态与动作委托纯逻辑）
// ========================================
export const useSkinStore = defineStore('skin', () => {
  // emitter 默认懒加载共享 event-bus（见 resolveDefaultEmitter）
  const logic = reactive(createSkinStoreLogic({}))

  return {
    currentSkinId: toRef(logic, 'currentSkinId'),
    previewSkinId: toRef(logic, 'previewSkinId'),
    committedCustomSkin: toRef(logic, 'committedCustomSkin'),
    pendingCustomSkin: toRef(logic, 'pendingCustomSkin'),
    committedRevision: toRef(logic, 'committedRevision'),
    previewRevision: toRef(logic, 'previewRevision'),
    isLoading: toRef(logic, 'isLoading'),
    errorKey: toRef(logic, 'errorKey'),
    hasPendingCustomSkin: computed(() => logic.pendingCustomSkin != null),
    hasPreviewChanges: computed(
      () => logic.previewSkinId !== logic.currentSkinId || logic.pendingCustomSkin != null,
    ),

    initialize: options => logic.initialize(options),
    initPreview: () => logic.initPreview(),
    setPreviewSkin: skinId => logic.setPreviewSkin(skinId),
    setPendingCustomSkin: file => logic.setPendingCustomSkin(file),
    applySkin: () => logic.applySkin(),
    cancelPreview: () => logic.cancelPreview(),
    getSkinConfig: skinId => logic.getSkinConfig(skinId),

    // 兼容旧调用方（Tasks 5/8 前仍可能引用）
    loadSkin: () => {},
    saveSkin: () => {
      if (typeof globalThis.localStorage !== 'undefined') {
        globalThis.localStorage.setItem(STORAGE_KEY, logic.currentSkinId)
      }
    },
  }
})

// 供 UI / 3D 层复用的常量再导出
export { ALL_SKINS, CUSTOM_SKIN_ID, DEFAULT_SKIN_ID, SKIN_LIST, STORAGE_KEY }
