import emitter from './event-bus.js'

export default class InputManager {
  constructor() {
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      shift: false,
      ctrl: false,
      space: false,
      z: false,
      x: false,
      c: false,
    }

    this.init()
  }

  init() {
    window.addEventListener('keydown', this.onKeyDown.bind(this))
    window.addEventListener('keyup', this.onKeyUp.bind(this))
  }

  onKeyDown(event) {
    const key = event.key.toLowerCase()

    // Prevent default actions for game controls
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(event.key)) {
      // event.preventDefault() // Optionally prevent scrolling
    }

    this.updateKey(key, true)
  }

  onKeyUp(event) {
    const key = event.key.toLowerCase()
    this.updateKey(key, false)
  }

  updateKey(key, isPressed) {
    let action = null

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
      case 'control':
        this.keys.ctrl = isPressed
        break
      case ' ':
        if (isPressed && !this.keys.space) {
          // Trigger jump only on initial press
          emitter.emit('input:jump')
        }
        this.keys.space = isPressed
        break
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
        // Block logic might need continuous state
        emitter.emit('input:block', isPressed)
        break
    }

    // Emit continuous state update
    emitter.emit('input:update', this.keys)
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown.bind(this))
    window.removeEventListener('keyup', this.onKeyUp.bind(this))
  }
}
