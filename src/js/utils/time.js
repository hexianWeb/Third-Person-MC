import emitter from './event-bus.js'

export default class Time {
  constructor() {
    // Setup
    this.start = Date.now()
    this.current = this.start
    this.elapsed = 0
    this.delta = 16

    // RAF ID for cleanup
    this.rafId = null

    this.rafId = window.requestAnimationFrame(() => {
      this.tick()
    })
  }

  tick() {
    const currentTime = Date.now()
    this.delta = currentTime - this.current
    this.current = currentTime
    this.elapsed = this.current - this.start

    emitter.emit('core:tick', {
      delta: this.delta,
      elapsed: this.elapsed,
    })

    this.rafId = window.requestAnimationFrame(() => {
      this.tick()
    })
  }

  destroy() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }
}
