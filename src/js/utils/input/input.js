import emitter from '../event/event-bus.js'

/**
 * InputManager - 统一管理键盘和鼠标输入
 * 负责监听用户输入并通过 mitt 发送事件
 */
export default class InputManager {
  constructor() {
    // 键盘状态
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sneak: false,
      sprint: false,
      space: false,
      q: false,
      e: false,
      tab: false,
      backtick: false,
    }

    // 鼠标按键状态
    this.mouse = {
      left: false,
      right: false,
      middle: false,
    }

    // 绑定方法（用于移除监听器）
    this._onKeyDown = this.onKeyDown.bind(this)
    this._onKeyUp = this.onKeyUp.bind(this)
    this._onMouseDown = this.onMouseDown.bind(this)
    this._onMouseUp = this.onMouseUp.bind(this)
    this._onContextMenu = this.onContextMenu.bind(this)
    this._onWheel = this.onWheel.bind(this)
    this._onGesture = this.onGesture.bind(this)

    this.init()
  }

  init() {
    // 键盘事件
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)

    // 鼠标按键事件
    window.addEventListener('mousedown', this._onMouseDown)
    window.addEventListener('mouseup', this._onMouseUp)
    window.addEventListener('wheel', this._onWheel, { passive: false })

    // 阻止右键菜单（避免影响 PointerLock / 场景交互）
    window.addEventListener('contextmenu', this._onContextMenu)

    // Safari 触控板捏合缩放
    window.addEventListener('gesturestart', this._onGesture, { passive: false })
    window.addEventListener('gesturechange', this._onGesture, { passive: false })
    window.addEventListener('gestureend', this._onGesture, { passive: false })
  }

  // ==================== 键盘事件 ====================

  onKeyDown(event) {
    const key = event.key.toLowerCase()

    // 始终拦截浏览器页面缩放快捷键（Ctrl/Cmd + +/-/0）
    if ((event.ctrlKey || event.metaKey) && ['+', '-', '=', '0', '_'].includes(key)) {
      event.preventDefault()
    }

    // 如果焦点在输入框或文本域，忽略游戏控制逻辑 (允许打字)
    if (['INPUT', 'TEXTAREA'].includes(event.target.tagName)) {
      return
    }

    // 阻止游戏控制键的默认行为（如空格滚动页面）
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(key)) {
      event.preventDefault()
    }

    // ESC key - emit ui:escape for menu system
    if (event.key === 'Escape') {
      emitter.emit('ui:escape')
      return
    }

    this.updateKey(key, true)
  }

  onKeyUp(event) {
    // 如果焦点在输入框，忽略
    if (['INPUT', 'TEXTAREA'].includes(event.target.tagName)) {
      return
    }

    const key = event.key.toLowerCase()
    this.updateKey(key, false)
  }

  updateKey(key, isPressed) {
    switch (key) {
      case 'w':
      case 'arrowup':
        this.keys.forward = isPressed
        break
      case 's':
      case 'arrowdown':
        this.keys.backward = isPressed
        break
      case 'a':
      case 'arrowleft':
        this.keys.left = isPressed
        break
      case 'd':
      case 'arrowright':
        this.keys.right = isPressed
        break
      case 'shift':
        this.keys.sprint = isPressed
        break
      case 'control':
        this.keys.sneak = isPressed
        break
      case ' ':
        if (isPressed && !this.keys.space) {
          // 跳跃：仅在初次按下时触发
          emitter.emit('input:jump')
        }
        this.keys.space = isPressed
        break
      case 'q':
        if (this.keys.q !== isPressed) {
          this.keys.q = isPressed
          // 探头循环：仅在按下瞬间切换
          if (isPressed)
            emitter.emit('input:cycle_camera_shoulder')
        }
        break
      case 'e':
        if (this.keys.e !== isPressed) {
          this.keys.e = isPressed
          // 仅在按下瞬间切换背包
          if (isPressed)
            emitter.emit('input:toggle_inventory')
        }
        break
      case 'r':
        if (isPressed && !this.keys.r) {
          emitter.emit('input:respawn')
        }
        this.keys.r = isPressed
        break
      case '`':
      case '·':
        this.keys.backtick = isPressed
        // 后视镜：持续状态模式（按住生效，松开恢复）
        emitter.emit('input:rear_view', isPressed)
        break
      case 'tab':
        if (this.keys.tab !== isPressed) {
          this.keys.tab = isPressed
          emitter.emit('input:telescope', isPressed)
        }
        break
    }

    // 发送连续状态更新
    emitter.emit('input:update', this.keys)
  }

  // ==================== 鼠标事件 ====================

  /**
   * 鼠标按下事件
   * - 仅记录按键状态，并通过 mitt 广播基础鼠标事件，供后续射线交互模块使用
   */
  onMouseDown(event) {
    switch (event.button) {
      case 0: // 左键
        this.mouse.left = true
        emitter.emit('input:mouse_down', { button: 0 })
        break
      case 2: // 右键
        this.mouse.right = true
        emitter.emit('input:mouse_down', { button: 2 })
        break
      case 1: // 中键（预留）
        this.mouse.middle = true
        emitter.emit('input:mouse_down', { button: 1 })
        break
    }
  }

  /**
   * 鼠标松开事件
   */
  onMouseUp(event) {
    switch (event.button) {
      case 0: // 左键
        this.mouse.left = false
        emitter.emit('input:mouse_up', { button: 0 })
        break
      case 2: // 右键
        this.mouse.right = false
        emitter.emit('input:mouse_up', { button: 2 })
        break
      case 1: // 中键
        this.mouse.middle = false
        emitter.emit('input:mouse_up', { button: 1 })
        break
    }
  }

  /**
   * 阻止右键菜单弹出
   */
  onContextMenu(event) {
    event.preventDefault()
  }

  /**
   * 鼠标滚轮事件
   * - 拦截浏览器页面缩放（Ctrl/Cmd + 滚轮）与默认滚动
   * - 仍向游戏层广播滚轮，供相机高度等使用
   */
  onWheel(event) {
    event.preventDefault()
    emitter.emit('input:wheel', { deltaY: event.deltaY })
  }

  /**
   * 拦截 Safari 等浏览器的触控板捏合缩放手势
   */
  onGesture(event) {
    event.preventDefault()
  }

  // ==================== 清理 ====================

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    window.removeEventListener('mousedown', this._onMouseDown)
    window.removeEventListener('mouseup', this._onMouseUp)
    window.removeEventListener('wheel', this._onWheel)
    window.removeEventListener('contextmenu', this._onContextMenu)
    window.removeEventListener('gesturestart', this._onGesture)
    window.removeEventListener('gesturechange', this._onGesture)
    window.removeEventListener('gestureend', this._onGesture)
  }
}
