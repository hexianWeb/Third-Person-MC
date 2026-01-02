import emitter from './event-bus.js'

export default class Sizes {
  constructor() {
    // Setup
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.aspect = this.width / this.height
    this.pixelRatio = Math.min(window.devicePixelRatio, 2)

    // Resize event
    window.addEventListener('resize', () => {
      this.width = window.innerWidth
      this.height = window.innerHeight
      this.pixelRatio = Math.min(window.devicePixelRatio, 2)

      emitter.emit('core:resize', {
        width: this.width,
        height: this.height,
        pixelRatio: this.pixelRatio,
      })
    })
  }
}
