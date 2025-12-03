import emitter from './event-bus.js'

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
      shift: false,
      v: false,
      space: false,
      z: false,
      x: false,
      c: false,
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

    this.init()
  }

  init() {
    // 键盘事件
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)

    // 鼠标按键事件
    window.addEventListener('mousedown', this._onMouseDown)
    window.addEventListener('mouseup', this._onMouseUp)

    // 阻止右键菜单（游戏中右键用于攻击）
    window.addEventListener('contextmenu', this._onContextMenu)
  }

  // ==================== 键盘事件 ====================

  onKeyDown(event) {
    const key = event.key.toLowerCase()

    // 阻止游戏控制键的默认行为（如空格滚动页面）
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(key)) {
      event.preventDefault()
    }

    if (key === 'tab') {
      emitter.emit('input:toggle_camera_side')
      return
    }

    this.updateKey(key, true)
  }

  onKeyUp(event) {
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
        this.keys.shift = isPressed
        break
      case 'v':
        this.keys.v = isPressed
        break
      case ' ':
        if (isPressed && !this.keys.space) {
          // 跳跃：仅在初次按下时触发
          emitter.emit('input:jump')
        }
        this.keys.space = isPressed
        break
      // Z/X 键保留作为备用攻击键
      case 'z':
        if (isPressed && !this.keys.z) {
          emitter.emit('input:punch_straight')
        }
        this.keys.z = isPressed
        break
      case 'x':
        if (isPressed && !this.keys.x) {
          emitter.emit('input:punch_hook')
        }
        this.keys.x = isPressed
        break
      case 'c':
        this.keys.c = isPressed
        // 格挡：需要持续状态
        emitter.emit('input:block', isPressed)
        break
    }

    // 发送连续状态更新
    emitter.emit('input:update', this.keys)
  }

  // ==================== 鼠标事件 ====================

  /**
   * 鼠标按下事件
   * - 左键 (button 0): 直拳
   * - 右键 (button 2): 勾拳
   */
  onMouseDown(event) {
    switch (event.button) {
      case 0: // 左键 - 直拳
        if (!this.mouse.left) {
          this.mouse.left = true
          emitter.emit('input:punch_straight')
        }
        break
      case 2: // 右键 - 勾拳
        if (!this.mouse.right) {
          this.mouse.right = true
          emitter.emit('input:punch_hook')
        }
        break
      case 1: // 中键（预留）
        this.mouse.middle = true
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
        break
      case 2: // 右键
        this.mouse.right = false
        break
      case 1: // 中键
        this.mouse.middle = false
        break
    }
  }

  /**
   * 阻止右键菜单弹出
   */
  onContextMenu(event) {
    event.preventDefault()
  }

  // ==================== 清理 ====================

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    window.removeEventListener('mousedown', this._onMouseDown)
    window.removeEventListener('mouseup', this._onMouseUp)
    window.removeEventListener('contextmenu', this._onContextMenu)
  }
}
