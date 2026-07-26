/**
 * Event Bus - 跨层即时事件通信（mitt）
 *
 * 额外提供 once()，供成就等一次性监听使用。
 * API：emit / on / once / off / all
 */

import mitt from 'mitt'

const emitter = mitt()

/**
 * 监听事件一次后自动 off
 * @param {string} type
 * @param {Function} handler
 */
emitter.once = (type, handler) => {
  const wrapper = (payload) => {
    emitter.off(type, wrapper)
    handler(payload)
  }
  wrapper._originalHandler = handler
  emitter.on(type, wrapper)
}

const originalOff = emitter.off.bind(emitter)

/**
 * 移除监听；兼容 once 包装后的 handler 引用
 * @param {string} type
 * @param {Function} [handler]
 */
emitter.off = (type, handler) => {
  if (handler) {
    const handlers = emitter.all.get(type)
    if (handlers) {
      const wrapped = handlers.find(h => h._originalHandler === handler)
      if (wrapped)
        return originalOff(type, wrapped)
    }
  }
  return originalOff(type, handler)
}

export default emitter
