import emitter from './event-bus.js'
import Experience from '../experience.js'

/**
 * PointerLockManager - 管理浏览器 Pointer Lock API
 *
 * 功能：
 * - 点击 canvas 时锁定鼠标（鼠标消失，如 FPS 游戏）
 * - 监听鼠标相对移动量（movementX/Y）用于控制视角
 * - 按 ESC 退出锁定
 *
 * 发送的事件：
 * - pointer:locked - 鼠标锁定时
 * - pointer:unlocked - 鼠标解锁时
 * - input:mouse_move - 锁定状态下鼠标移动（携带 movementX, movementY）
 */
export default class PointerLockManager {
  constructor() {
    this.experience = new Experience()
    this.canvas = this.experience.canvas

    // 锁定状态
    this.isLocked = false

    // 绑定方法（用于移除监听器）
    this._onPointerLockChange = this.onPointerLockChange.bind(this)
    this._onPointerLockError = this.onPointerLockError.bind(this)
    this._onMouseMove = this.onMouseMove.bind(this)
    this._onClick = this.onClick.bind(this)

    this.init()
  }

  init() {
    // 监听 Pointer Lock 状态变化
    document.addEventListener('pointerlockchange', this._onPointerLockChange)
    document.addEventListener('pointerlockerror', this._onPointerLockError)

    // 监听鼠标移动（在锁定状态下使用 movementX/Y）
    document.addEventListener('mousemove', this._onMouseMove)

    // 点击 canvas 请求锁定
    this.canvas.addEventListener('click', this._onClick)
  }

  /**
   * 点击 canvas 时请求锁定鼠标
   */
  onClick() {
    if (!this.isLocked) {
      this.requestLock()
    }
  }

  /**
   * 请求锁定鼠标
   */
  requestLock() {
    if (this.canvas.requestPointerLock) {
      this.canvas.requestPointerLock()
    }
  }

  /**
   * 退出锁定
   */
  exitLock() {
    if (document.exitPointerLock) {
      document.exitPointerLock()
    }
  }

  /**
   * Pointer Lock 状态变化回调
   */
  onPointerLockChange() {
    const previousState = this.isLocked
    this.isLocked = document.pointerLockElement === this.canvas

    // 状态发生变化时发送事件
    if (this.isLocked && !previousState) {
      console.log('[PointerLock] 鼠标已锁定')
      emitter.emit('pointer:locked')
    }
    else if (!this.isLocked && previousState) {
      console.log('[PointerLock] 鼠标已解锁')
      emitter.emit('pointer:unlocked')
    }
  }

  /**
   * Pointer Lock 错误回调
   */
  onPointerLockError() {
    console.error('[PointerLock] 无法锁定鼠标，可能是权限问题')
  }

  /**
   * 鼠标移动回调
   * 在锁定状态下，发送相对移动量用于控制角色朝向
   */
  onMouseMove(event) {
    if (!this.isLocked)
      return

    // 发送鼠标相对移动量
    emitter.emit('input:mouse_move', {
      movementX: event.movementX || 0,
      movementY: event.movementY || 0,
    })
  }

  /**
   * 清理所有事件监听器
   */
  destroy() {
    document.removeEventListener('pointerlockchange', this._onPointerLockChange)
    document.removeEventListener('pointerlockerror', this._onPointerLockError)
    document.removeEventListener('mousemove', this._onMouseMove)
    this.canvas.removeEventListener('click', this._onClick)

    // 如果当前锁定，退出锁定
    if (this.isLocked) {
      this.exitLock()
    }
  }
}

