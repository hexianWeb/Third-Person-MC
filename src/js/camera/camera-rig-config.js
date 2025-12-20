import * as THREE from 'three'

export const CAMERA_RIG_CONFIG = {
  // 第三人称相机配置
  follow: {
    // 相机相对于玩家的偏移（玩家在右下角）
    offset: new THREE.Vector3(2, 1.5, 3.0), // x: 右侧, y: 上方, z: 后方
    // 目标点相对于玩家的偏移（看向前方中央）
    targetOffset: new THREE.Vector3(0, 1.5, -5.5), // 看向玩家前方5.5米，高度1.5米
    // 平滑跟随速度 (位置惯性)
    smoothSpeed: 0.1,
    // 视角平滑速度 (LookAt Smoothing)
    lookAtSmoothSpeed: 0.45,
    // PointerLock 模式下的目标点 Y 偏移 (B手感)
    mouseTargetY: {
      enabled: true,
      invertY: true,
      sensitivity: 0.030,
      maxOffset: 4.5, // 最大偏移量 (米)
      returnSpeed: 1.5, // 回中速度
      damping: 3.5, // 速度阻尼
      unlockReset: true, // 鼠标解锁时重置
    },
  },

  // ===== Tracking Shot 配置 =====
  trackingShot: {
    // 动态 FOV 配置
    fov: {
      enabled: true,
      baseFov: 55, // 基础 FOV
      maxFov: 85, // 最大 FOV（高速时）
      speedThreshold: 3.0, // 达到最大 FOV 的速度阈值
      smoothSpeed: 0.05, // FOV 变化平滑度
    },
    // Camera Bobbing (手持/步伐震动) 配置
    bobbing: {
      enabled: true,
      // 垂直震动 (Y轴)
      verticalFrequency: 4.0, // 频率 (Hz)
      verticalAmplitude: 0.025, // 幅度 (米)
      // 水平震动 (X轴)
      horizontalFrequency: 4.0, // 频率 (Hz)
      horizontalAmplitude: 0.015, // 幅度 (米)
      // Roll 倾斜震动 (模拟左右脚步)
      rollFrequency: 4.0, // 频率 (Hz)
      rollAmplitude: 0.005, // 幅度 (弧度)
      // 速度因子
      speedMultiplier: 1.0, // 速度越快震动越明显
      // 静止时的微小呼吸感
      idleBreathing: {
        enabled: true,
        frequency: 0.7, // 呼吸频率
        amplitude: 0.015, // 呼吸幅度
      },
    },
  },
}
