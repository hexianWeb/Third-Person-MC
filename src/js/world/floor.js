import Experience from '../experience.js'
import Grid from './grid.js'

export default class Floor {
  constructor(planeSize = 400, planeSubdiv = 1) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.debug = this.experience.debug

    this.planeSize = planeSize
    this.planeSubdiv = planeSubdiv

    // 实例化Grid作为视觉地板
    this.grid = new Grid(this.planeSize, this.planeSubdiv)

    if (this.debug.active) {
      this.debugInit()
    }
  }

  update() {
    if (this.grid) {
      this.grid.update()
    }
  }

  debugInit() {
    this.debugFolder = this.debug.ui.addFolder({
      title: 'Floor',
      expanded: false,
    })

    // 可以添加地板相关参数，如是否启用物理等，但当前固定
    // 例如，添加一个开关来toggle collider active，如果需要
  }
}
