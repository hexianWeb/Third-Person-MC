import RAPIER from '@dimforge/rapier3d-compat'
import Experience from '../experience.js'
import emitter from '../utils/event-bus.js'
import Grid from './grid.js'

export default class Floor {
  constructor(planeSize = 400, planeSubdiv = 1) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.physics = this.experience.physics
    this.debug = this.experience.debug

    this.planeSize = planeSize
    this.planeSubdiv = planeSubdiv

    this.initPhysics()

    // 实例化Grid作为视觉地板
    this.grid = new Grid(this.planeSize, this.planeSubdiv)

    if (this.debug.active) {
      this.debugInit()
    }
  }

  initPhysics() {
    if (this.physics && this.physics.ready) {
      this.createPhysicsBody()
    }
    else {
      emitter.on('physics:ready', () => {
        this.createPhysicsBody()
      })
    }
  }

  createPhysicsBody() {
    // 固定刚体，位置在y=0
    this.rigidBody = this.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(0, -0.1, 0), // Slightly below 0 to align top surface with y=0 if thickness is 0.2
    )

    // cuboid碰撞器，薄地板
    // 200 width, 0.1 height, 200 depth.
    // Center at 0,-0.1,0 -> extends from -0.2 to 0.0 in Y.
    // Wait, cuboid(hx, hy, hz). height = 2*hy.
    // If we want top surface at 0.
    // Let's make it thin. 0.1 half height -> 0.2 thickness.
    // If pos is 0, -0.1, 0.
    // Y range: -0.2 to 0.0. Correct.
    this.collider = this.physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(this.planeSize / 2, 0.1, this.planeSize / 2),
      this.rigidBody,
    )
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
