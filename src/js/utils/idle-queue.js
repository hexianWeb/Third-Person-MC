/**
 * IdleQueue：基于 requestIdleCallback 的轻量任务队列（含 fallback）
 * 目标：
 * - 让 chunk 的生成/建网格分帧执行，避免主线程卡顿
 * - 支持 key 去重（同一个任务只保留最新/或只保留一份）
 * - 支持“跳过已失效任务”（比如 chunk 已卸载）
 */

export default class IdleQueue {
  constructor(options = {}) {
    this._tasks = []
    this._taskByKey = new Map()
    this._scheduled = false

    this.timeBudgetMs = options.timeBudgetMs ?? 6
  }

  /**
   * 入队任务
   * @param {string} key 用于去重/取消
   * @param {() => void} fn 任务函数
   * @param {number} priority 数字越小优先级越高
   */
  enqueue(key, fn, priority = 0) {
    // 若已有同 key 任务，先移除旧的（保留最新）
    const old = this._taskByKey.get(key)
    if (old) {
      old.cancelled = true
      this._taskByKey.delete(key)
    }

    const task = { key, fn, priority, cancelled: false }
    this._taskByKey.set(key, task)
    this._tasks.push(task)

    // 延迟排序：在 pump 时按 priority 排序即可
  }

  /**
   * 取消任务（若存在）
   */
  cancel(key) {
    const task = this._taskByKey.get(key)
    if (!task)
      return
    task.cancelled = true
    this._taskByKey.delete(key)
  }

  /**
   * 取消指定前缀的一组任务（常用于 chunk 被卸载）
   */
  cancelByPrefix(prefix) {
    for (const [key, task] of this._taskByKey.entries()) {
      if (key.startsWith(prefix)) {
        task.cancelled = true
        this._taskByKey.delete(key)
      }
    }
  }

  /**
   * 队列长度（用于 debug）
   */
  size() {
    return this._taskByKey.size
  }

  /**
   * 每帧调用一次即可：自动调度 requestIdleCallback
   */
  pump() {
    if (this._scheduled)
      return
    if (this._taskByKey.size === 0)
      return

    this._scheduled = true
    const ric = typeof window !== 'undefined' ? window.requestIdleCallback : null
    if (ric) {
      ric(deadline => this._run(deadline), { timeout: 50 })
    }
    else {
      // fallback：尽快执行，但依然做预算限制
      setTimeout(() => this._run(null), 0)
    }
  }

  _run(deadline) {
    this._scheduled = false

    // 按优先级排序（稳定排序不强求，但尽量让近处 chunk 先完成）
    this._tasks.sort((a, b) => a.priority - b.priority)

    const start = performance.now()

    while (this._tasks.length > 0) {
      const task = this._tasks.shift()
      if (!task || task.cancelled)
        continue

      // key map 中仍指向自己才算有效（被新任务替换则跳过）
      const current = this._taskByKey.get(task.key)
      if (current !== task)
        continue

      // 执行任务
      try {
        task.fn()
      }
      finally {
        // 执行完移除
        this._taskByKey.delete(task.key)
      }

      // 预算判断：优先用 deadline.timeRemaining，其次用 timeBudgetMs
      if (deadline?.timeRemaining) {
        if (deadline.timeRemaining() <= 0)
          break
      }
      else {
        if (performance.now() - start >= this.timeBudgetMs)
          break
      }
    }

    // 若还有任务，继续调度下一次
    if (this._taskByKey.size > 0) {
      this.pump()
    }
  }
}
