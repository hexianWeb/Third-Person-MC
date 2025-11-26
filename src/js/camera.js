import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js'

import Experience from './experience.js'

export default class Camera {
  constructor(orthographic = false) {
    this.experience = new Experience()
    this.sizes = this.experience.sizes
    this.scene = this.experience.scene
    this.canvas = this.experience.canvas
    this.orthographic = orthographic
    this.debug = this.experience.debug
    this.debugActive = this.experience.debug.active

    this.position = new THREE.Vector3(0, 0, 0)
    this.target = new THREE.Vector3(0, 0, 0)

    // 第三人称相机配置
    this.followConfig = {
      // 相机相对于玩家的偏移（玩家在右下角）
      offset: new THREE.Vector3(2, 1.5, 4.0), // x: 右侧, y: 上方, z: 后方
      // 目标点相对于玩家的偏移（看向前方中央）
      targetOffset: new THREE.Vector3(0, 2, -20), // 看向玩家前方10米，高度1.5米
      // 平滑跟随速度
      smoothSpeed: 0.1,
    }

    this.setInstance()
    this.setControls()
    this.setDebug()
  }

  setInstance() {
    if (this.orthographic) {
      const aspect = this.sizes.aspect
      this.frustumSize = 1

      this.instance = new THREE.OrthographicCamera(
        -this.frustumSize * aspect,
        this.frustumSize * aspect,
        this.frustumSize,
        -this.frustumSize,
        -1,
        1000,
      )
    }
    else {
      this.instance = new THREE.PerspectiveCamera(
        45, // 增大FOV以获得更好的视野
        this.sizes.width / this.sizes.height,
        0.1,
        100,
      )
    }
    this.instance.position.copy(this.position)
    this.instance.lookAt(this.target)
    this.scene.add(this.instance)
  }

  setControls() {
    // OrbitControls 设置（可选，用于调试）
    this.orbitControls = new OrbitControls(this.instance, this.canvas)
    this.orbitControls.enableDamping = true
    this.orbitControls.enableZoom = true
    this.orbitControls.enablePan = false
    this.orbitControls.enabled = false // 默认禁用，使用自定义跟随
    this.orbitControls.target.copy(this.target)

    // Constraints for Third Person Follow
    this.orbitControls.maxPolarAngle = Math.PI / 2 - 0.1
    this.orbitControls.minDistance = 5

    // TrackballControls 设置
    this.trackballControls = new TrackballControls(this.instance, this.canvas)
    this.trackballControls.noRotate = true
    this.trackballControls.noPan = true
    this.trackballControls.noZoom = false
    this.trackballControls.zoomSpeed = 1
    this.trackballControls.enabled = false // 默认禁用

    // 同步两个控制器的目标点
    this.trackballControls.target.copy(this.target)
  }

  setDebug() {
    if (this.debugActive) {
      const cameraFolder = this.debug.ui.addFolder({
        title: 'Camera',
        expanded: true,
      })

      // 相机偏移设置
      cameraFolder.addBinding(this.followConfig, 'offset', {
        label: 'Camera Offset',
        x: { min: -20, max: 20, step: 0.5 },
        y: { min: 0, max: 30, step: 0.5 },
        z: { min: -20, max: 20, step: 0.5 },
      })

      // 目标点偏移设置
      cameraFolder.addBinding(this.followConfig, 'targetOffset', {
        label: 'Target Offset',
        x: { min: -20, max: 20, step: 0.5 },
        y: { min: -5, max: 10, step: 0.5 },
        z: { min: -30, max: 10, step: 0.5 },
      })

      // 平滑速度
      cameraFolder.addBinding(this.followConfig, 'smoothSpeed', {
        label: 'Smooth Speed',
        min: 0.01,
        max: 1,
        step: 0.01,
      })

      // 切换控制器
      const controlsToggle = {
        useOrbitControls: false,
      }
      cameraFolder.addBinding(controlsToggle, 'useOrbitControls', {
        label: 'Use Orbit Controls',
      }).on('change', (ev) => {
        this.orbitControls.enabled = ev.value
        this.trackballControls.enabled = false
      })
    }
  }

  updateCamera() {
    this.instance.position.copy(this.position)
    this.instance.lookAt(this.target)
    this.orbitControls.target.copy(this.target)
    this.trackballControls.target.copy(this.target)
    this.orbitControls.update()
    this.trackballControls.update()
  }

  resize() {
    if (this.orthographic) {
      const aspect = this.sizes.width / this.sizes.height

      this.instance.left = (-this.frustumSize * aspect) / 2
      this.instance.right = (this.frustumSize * aspect) / 2
      this.instance.top = this.frustumSize / 2
      this.instance.bottom = -this.frustumSize / 2

      this.instance.updateProjectionMatrix()
    }
    else {
      this.instance.aspect = this.sizes.width / this.sizes.height
      this.instance.updateProjectionMatrix()
    }
    this.trackballControls.handleResize()
  }

  update() {
    // 如果启用了OrbitControls，使用OrbitControls更新
    if (this.orbitControls.enabled) {
      this.orbitControls.update()
      return
    }

    // 第三人称跟随逻辑
    if (this.experience.world?.player?.model) {
      const player = this.experience.world.player
      const playerMesh = player.model

      // 获取玩家位置
      const playerPos = new THREE.Vector3()
      playerMesh.getWorldPosition(playerPos)

      // 计算目标相机位置（玩家位置 + 偏移）
      const desiredCameraPos = new THREE.Vector3()
        .copy(playerPos)
        .add(this.followConfig.offset)

      // 计算目标观察点（玩家位置 + 目标偏移）
      const desiredTargetPos = new THREE.Vector3()
        .copy(playerPos)
        .add(this.followConfig.targetOffset)

      // 平滑插值相机位置
      this.instance.position.lerp(
        desiredCameraPos,
        this.followConfig.smoothSpeed,
      )

      // 平滑插值目标点
      const currentTarget = new THREE.Vector3()
      this.instance.getWorldDirection(currentTarget)
      currentTarget.multiplyScalar(10).add(this.instance.position)

      const smoothTarget = new THREE.Vector3().lerpVectors(
        currentTarget,
        desiredTargetPos,
        this.followConfig.smoothSpeed,
      )

      // 更新相机朝向
      this.instance.lookAt(desiredTargetPos)

      // 更新控制器目标（如果需要切换到OrbitControls）
      this.orbitControls.target.copy(desiredTargetPos)
      this.trackballControls.target.copy(desiredTargetPos)
    }

    // 更新TrackballControls（即使禁用也要更新以保持同步）
    this.trackballControls.update()
  }
}
