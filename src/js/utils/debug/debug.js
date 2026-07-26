import * as EssentialsPlugin from '@tweakpane/plugin-essentials'

import { Pane } from 'tweakpane'

/** 高于 `.hud-root`(100)，避免右侧 Info/按键反馈盖住 Tweakpane */
const DEBUG_PANE_Z_INDEX = '1000'

export default class Debug {
  constructor() {
    this.active = window.location.hash === '#debug'

    if (this.active) {
      this.ui = new Pane(EssentialsPlugin)
      const el = this.ui.element
      el.style.zIndex = DEBUG_PANE_Z_INDEX
      el.style.position = 'fixed'
    }
  }

  destroy() {
    if (this.ui) {
      this.ui.dispose()
      this.ui = null
    }
  }
}
