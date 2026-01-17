# 方块挖掘视觉特效系统实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标：** 实现类似原版 Minecraft 的方块挖掘视觉反馈系统，包括挖掘进度条和方块裂纹效果。

**架构：** 
- 创建 `BlockMiningController` 类负责挖掘逻辑（进度追踪、状态管理）
- 扩展现有 Shader 系统，为方块材质添加裂纹覆盖效果
- 在 `Crosshair.vue` 组件中添加挖掘进度条 UI
- 通过 mitt 事件总线实现 3D 场景与 UI 层的通信

**技术栈：** 
- Three.js (InstancedMesh + CustomShaderMaterial)
- GLSL Shader (裂纹纹理混合)
- Vue 3 (进度条 UI)
- mitt 事件总线

---

## Task 1: 加载破坏纹理资源

**文件：**
- 修改: `src/js/sources.js`

**目标：** 在资源列表中添加 10 张破坏阶段纹理，供后续 Shader 使用。

**步骤 1: 添加破坏纹理资源定义**

在 `src/js/sources.js` 文件末尾，数组最后一个元素后添加：

```js
  // ===== 方块破坏纹理（10 阶段）=====
  {
    name: 'destroy_stage_0',
    type: 'texture',
    path: 'textures/destroy/destroy_stage_0.png',
  },
  {
    name: 'destroy_stage_1',
    type: 'texture',
    path: 'textures/destroy/destroy_stage_1.png',
  },
  {
    name: 'destroy_stage_2',
    type: 'texture',
    path: 'textures/destroy/destroy_stage_2.png',
  },
  {
    name: 'destroy_stage_3',
    type: 'texture',
    path: 'textures/destroy/destroy_stage_3.png',
  },
  {
    name: 'destroy_stage_4',
    type: 'texture',
    path: 'textures/destroy/destroy_stage_4.png',
  },
  {
    name: 'destroy_stage_5',
    type: 'texture',
    path: 'textures/destroy/destroy_stage_5.png',
  },
  {
    name: 'destroy_stage_6',
    type: 'texture',
    path: 'textures/destroy/destroy_stage_6.png',
  },
  {
    name: 'destroy_stage_7',
    type: 'texture',
    path: 'textures/destroy/destroy_stage_7.png',
  },
  {
    name: 'destroy_stage_8',
    type: 'texture',
    path: 'textures/destroy/destroy_stage_8.png',
  },
  {
    name: 'destroy_stage_9',
    type: 'texture',
    path: 'textures/destroy/destroy_stage_9.png',
  },
```

**步骤 2: 验证资源加载**

启动开发服务器，打开浏览器控制台，确认没有资源加载错误。

---

## Task 2: 创建挖掘裂纹 Shader

**文件：**
- 创建: `src/shaders/blocks/mining.frag.glsl`
- 创建: `src/shaders/blocks/mining.vert.glsl`

**目标：** 实现方块表面的裂纹覆盖效果，支持动态切换裂纹阶段。

**步骤 1: 创建顶点着色器**

创建文件 `src/shaders/blocks/mining.vert.glsl`：

```glsl
/**
 * Mining Vertex Shader
 * 传递 UV 坐标和实例 ID 到片段着色器
 */

// 输出到片段着色器
varying vec2 vUv;
varying float vInstanceId;

void main() {
    // 传递 UV 坐标
    vUv = uv;
    
    // 传递实例 ID（通过 gl_InstanceID，但需要转为 float）
    vInstanceId = float(gl_InstanceID);
    
    // 标准 MVP 变换（使用 CSM 的 PositionRaw）
    csm_PositionRaw = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
```

**步骤 2: 创建片段着色器**

创建文件 `src/shaders/blocks/mining.frag.glsl`：

```glsl
/**
 * Mining Fragment Shader
 * 在方块表面覆盖挖掘裂纹纹理
 */

// 从顶点着色器接收
varying vec2 vUv;
varying float vInstanceId;

// Uniforms
uniform sampler2D uCrackTextures[10]; // 10 张裂纹纹理
uniform float uMiningProgress;         // 挖掘进度 [0, 1]
uniform float uTargetInstanceId;      // 正在被挖掘的实例 ID
uniform bool uIsBeingMined;           // 是否有方块正在被挖掘

void main() {
    // 仅对目标实例应用裂纹效果
    if (uIsBeingMined && abs(vInstanceId - uTargetInstanceId) < 0.5) {
        // 根据进度选择裂纹纹理（0-9 阶段）
        int stage = int(floor(uMiningProgress * 9.999)); // 9.999 确保 progress=1.0 时不会溢出
        stage = clamp(stage, 0, 9);
        
        // 采样对应阶段的裂纹纹理
        vec4 crackColor;
        
        // GLSL 不支持动态数组索引，需要手动展开
        if (stage == 0) crackColor = texture2D(uCrackTextures[0], vUv);
        else if (stage == 1) crackColor = texture2D(uCrackTextures[1], vUv);
        else if (stage == 2) crackColor = texture2D(uCrackTextures[2], vUv);
        else if (stage == 3) crackColor = texture2D(uCrackTextures[3], vUv);
        else if (stage == 4) crackColor = texture2D(uCrackTextures[4], vUv);
        else if (stage == 5) crackColor = texture2D(uCrackTextures[5], vUv);
        else if (stage == 6) crackColor = texture2D(uCrackTextures[6], vUv);
        else if (stage == 7) crackColor = texture2D(uCrackTextures[7], vUv);
        else if (stage == 8) crackColor = texture2D(uCrackTextures[8], vUv);
        else crackColor = texture2D(uCrackTextures[9], vUv);
        
        // 混合裂纹到原始颜色上（使用 alpha 通道）
        csm_DiffuseColor.rgb = mix(csm_DiffuseColor.rgb, crackColor.rgb, crackColor.a * 0.8);
    }
}
```

**步骤 3: 验证文件创建**

确认两个 Shader 文件已正确创建，无语法错误。

---

## Task 3: 创建方块挖掘控制器

**文件：**
- 创建: `src/js/interaction/block-mining-controller.js`

**目标：** 管理挖掘状态、进度追踪、Shader uniform 更新。

**步骤 1: 创建基础类结构**

创建文件 `src/js/interaction/block-mining-controller.js`：

```js
import Experience from '../experience.js'
import emitter from '../utils/event-bus.js'

/**
 * BlockMiningController
 * - 管理方块挖掘逻辑：进度追踪、状态管理、Shader 通信
 * - 监听鼠标按键和射线检测结果
 * - 通过 mitt 广播挖掘进度给 UI 层
 */
export default class BlockMiningController {
  constructor(options = {}) {
    this.experience = new Experience()
    this.time = this.experience.time
    this.debug = this.experience.debug

    // 挖掘参数
    this.params = {
      enabled: options.enabled ?? true,
      miningDuration: options.miningDuration ?? 2000, // 固定挖掘时长（毫秒）
    }

    // 挖掘状态
    this.isMining = false          // 是否正在挖掘
    this.miningStartTime = 0       // 挖掘开始时间
    this.miningProgress = 0        // 当前挖掘进度 [0, 1]
    this.currentTarget = null      // 当前挖掘目标 { chunkX, chunkZ, worldBlock, instanceId, mesh }

    // 绑定事件处理函数
    this._onMouseDown = this._onMouseDown.bind(this)
    this._onMouseUp = this._onMouseUp.bind(this)

    // 监听鼠标事件
    emitter.on('input:mouse_down', this._onMouseDown)
    emitter.on('input:mouse_up', this._onMouseUp)

    if (this.debug.active) {
      this.debugInit()
    }
  }

  /**
   * 鼠标按下事件：开始挖掘
   */
  _onMouseDown(event) {
    if (!this.params.enabled || event.button !== 0) return

    const raycaster = this.experience.world?.blockRaycaster
    if (!raycaster || !raycaster.current) return

    // 开始挖掘
    this.isMining = true
    this.miningStartTime = this.time.elapsed
    this.miningProgress = 0
    this.currentTarget = this._captureTarget(raycaster.current)

    // 广播挖掘开始事件
    emitter.emit('game:mining-start', {
      progress: 0,
      target: this.currentTarget,
    })
  }

  /**
   * 鼠标松开事件：停止挖掘
   */
  _onMouseUp(event) {
    if (event.button !== 0) return

    if (this.isMining) {
      this._resetMining()
      emitter.emit('game:mining-cancel')
    }
  }

  /**
   * 捕获当前挖掘目标信息
   */
  _captureTarget(raycastInfo) {
    return {
      chunkX: raycastInfo.chunkX,
      chunkZ: raycastInfo.chunkZ,
      worldBlock: { ...raycastInfo.worldBlock },
      instanceId: raycastInfo.instanceId,
      blockId: raycastInfo.blockId,
    }
  }

  /**
   * 检查目标是否改变
   */
  _isTargetChanged(newInfo) {
    if (!this.currentTarget || !newInfo) return true

    return (
      this.currentTarget.chunkX !== newInfo.chunkX ||
      this.currentTarget.chunkZ !== newInfo.chunkZ ||
      this.currentTarget.worldBlock.x !== newInfo.worldBlock.x ||
      this.currentTarget.worldBlock.y !== newInfo.worldBlock.y ||
      this.currentTarget.worldBlock.z !== newInfo.worldBlock.z
    )
  }

  /**
   * 重置挖掘状态
   */
  _resetMining() {
    this.isMining = false
    this.miningProgress = 0
    this.currentTarget = null
  }

  /**
   * 完成挖掘：销毁方块
   */
  _completeMining() {
    if (!this.currentTarget) return

    const { worldBlock } = this.currentTarget
    const chunkManager = this.experience.terrainDataManager

    if (chunkManager) {
      chunkManager.removeBlockWorld(worldBlock.x, worldBlock.y, worldBlock.z)
    }

    emitter.emit('game:mining-complete', {
      target: this.currentTarget,
    })

    this._resetMining()
  }

  /**
   * 每帧更新
   */
  update() {
    if (!this.params.enabled || !this.isMining) {
      return
    }

    const raycaster = this.experience.world?.blockRaycaster
    if (!raycaster || !raycaster.current) {
      // 目标丢失，取消挖掘
      this._resetMining()
      emitter.emit('game:mining-cancel')
      return
    }

    // 检查目标是否改变
    if (this._isTargetChanged(raycaster.current)) {
      // 目标切换，重置挖掘
      this._resetMining()
      emitter.emit('game:mining-cancel')
      return
    }

    // 更新挖掘进度
    const elapsed = this.time.elapsed - this.miningStartTime
    this.miningProgress = Math.min(elapsed / this.params.miningDuration, 1)

    // 广播进度更新
    emitter.emit('game:mining-progress', {
      progress: this.miningProgress,
      target: this.currentTarget,
    })

    // 挖掘完成
    if (this.miningProgress >= 1) {
      this._completeMining()
    }
  }

  /**
   * 调试面板
   */
  debugInit() {
    this.debugFolder = this.debug.ui.addFolder({
      title: 'Block Mining Controller',
      expanded: false,
    })

    this.debugFolder.addBinding(this.params, 'enabled', { label: '启用' })

    this.debugFolder.addBinding(this.params, 'miningDuration', {
      label: '挖掘时长 (ms)',
      min: 100,
      max: 5000,
      step: 100,
    })

    const monitor = this.debugFolder.addFolder({ title: '状态监控', expanded: true })

    monitor.addBinding(this, 'isMining', { label: '正在挖掘', readonly: true })
    monitor.addBinding(this, 'miningProgress', {
      label: '挖掘进度',
      readonly: true,
      min: 0,
      max: 1,
    })
  }

  /**
   * 销毁
   */
  destroy() {
    emitter.off('input:mouse_down', this._onMouseDown)
    emitter.off('input:mouse_up', this._onMouseUp)
    this._resetMining()
  }
}
```

**步骤 2: 验证类创建**

检查文件无语法错误，类结构完整。

---

## Task 4: 扩展 TerrainRenderer 集成挖掘 Shader

**文件：**
- 修改: `src/js/world/terrain/terrain-renderer.js`

**目标：** 为所有方块材质添加挖掘裂纹 Shader，支持动态 uniform 更新。

**步骤 1: 在构造函数中加载裂纹纹理并初始化 uniforms**

在 `TerrainRenderer` 的构造函数中，找到 `this._animatedMaterials = []` 这一行后，添加：

```js
    // 挖掘系统：加载裂纹纹理数组
    this._crackTextures = []
    for (let i = 0; i <= 9; i++) {
      const textureName = `destroy_stage_${i}`
      const texture = this.resources.items[textureName]
      if (texture) {
        texture.minFilter = THREE.NearestFilter
        texture.magFilter = THREE.NearestFilter
        texture.wrapS = THREE.ClampToEdgeWrapping
        texture.wrapT = THREE.ClampToEdgeWrapping
        this._crackTextures.push(texture)
      }
    }

    // 挖掘 Shader 的 uniform（全局共享，所有方块材质共用）
    this._miningUniforms = {
      uCrackTextures: { value: this._crackTextures },
      uMiningProgress: { value: 0.0 },
      uTargetInstanceId: { value: -1.0 },
      uIsBeingMined: { value: false },
    }

    // 监听挖掘事件
    this._handleMiningProgress = this._handleMiningProgress.bind(this)
    this._handleMiningCancel = this._handleMiningCancel.bind(this)
    emitter.on('game:mining-progress', this._handleMiningProgress)
    emitter.on('game:mining-cancel', this._handleMiningCancel)
    emitter.on('game:mining-complete', this._handleMiningCancel)
```

**步骤 2: 添加挖掘事件处理函数**

在 `_handleShadowQuality` 方法后添加：

```js
  /**
   * 处理挖掘进度更新事件
   */
  _handleMiningProgress(payload) {
    const { progress, target } = payload
    if (!target) return

    // 检查目标是否在当前 chunk 中
    const chunkKey = `${target.chunkX},${target.chunkZ}`
    if (this.group?.userData?.chunkKey !== chunkKey) {
      // 不是当前 chunk，忽略
      return
    }

    // 更新 uniform
    this._miningUniforms.uMiningProgress.value = progress
    this._miningUniforms.uTargetInstanceId.value = target.instanceId
    this._miningUniforms.uIsBeingMined.value = true
  }

  /**
   * 处理挖掘取消/完成事件
   */
  _handleMiningCancel() {
    this._miningUniforms.uIsBeingMined.value = false
    this._miningUniforms.uMiningProgress.value = 0
    this._miningUniforms.uTargetInstanceId.value = -1
  }
```

**步骤 3: 修改 `_createInstancedMesh` 方法，为材质添加 Shader**

找到 `_createInstancedMesh` 方法中创建材质的部分（约 200-250 行），在 `customProgramCacheKey` 配置后，添加 Shader 扩展：

找到类似这样的代码：

```js
      customProgramCacheKey: () => {
        return `ao-${aoMode}`
      },
```

在其后添加：

```js
      // 挖掘裂纹 Shader
      vertexShader: miningVertexShader,
      fragmentShader: miningFragmentShader,
      uniforms: this._miningUniforms,
```

同时在文件顶部添加 Shader 导入：

```js
import miningVertexShader from '../../shaders/blocks/mining.vert.glsl'
import miningFragmentShader from '../../shaders/blocks/mining.frag.glsl'
```

**步骤 4: 在 `dispose` 方法中移除事件监听**

找到 `dispose()` 方法，在其中添加：

```js
    emitter.off('game:mining-progress', this._handleMiningProgress)
    emitter.off('game:mining-cancel', this._handleMiningCancel)
    emitter.off('game:mining-complete', this._handleMiningCancel)
```

**步骤 5: 验证修改**

检查文件无语法错误，Shader 导入路径正确。

---

## Task 5: 在 World 中集成 BlockMiningController

**文件：**
- 修改: `src/js/world/world.js`

**目标：** 初始化挖掘控制器并在每帧更新中调用其 `update` 方法。

**步骤 1: 导入 BlockMiningController**

在文件顶部，`import` 语句区域添加：

```js
import BlockMiningController from '../interaction/block-mining-controller.js'
```

**步骤 2: 在 `core:ready` 回调中初始化控制器**

找到 `this.blockSelectionHelper = new BlockSelectionHelper(...)` 这一行后，添加：

```js
      // 挖掘控制器
      this.blockMiningController = new BlockMiningController({
        enabled: true,
        miningDuration: 2000, // 2 秒固定时长
      })
```

**步骤 3: 移除原有的即时破坏逻辑**

找到这段代码：

```js
      // ===== 交互事件绑定：删除/新增方块 =====
      emitter.on('input:mouse_down', (event) => {
        // 0 为左键
        if (event.button === 0 && this.blockRaycaster?.current) {
          const { worldBlock, face } = this.blockRaycaster.current

          if (this.blockEditMode === 'remove') {
            this.chunkManager.removeBlockWorld(worldBlock.x, worldBlock.y, worldBlock.z)
          }
          // ... 其他逻辑
        }
      })
```

将其中 `remove` 模式的即时破坏逻辑注释或删除（因为现在由 `BlockMiningController` 管理）：

```js
      // ===== 交互事件绑定：删除/新增方块 =====
      emitter.on('input:mouse_down', (event) => {
        // 0 为左键
        if (event.button === 0 && this.blockRaycaster?.current) {
          const { worldBlock, face } = this.blockRaycaster.current

          // remove 模式现在由 BlockMiningController 管理，不再即时破坏
          // if (this.blockEditMode === 'remove') {
          //   this.chunkManager.removeBlockWorld(worldBlock.x, worldBlock.y, worldBlock.z)
          // }

          if (this.blockEditMode === 'add') {
            // 放置方块逻辑保持不变
            if (face && face.normal) {
              const nx = Math.round(face.normal.x)
              const ny = Math.round(face.normal.y)
              const nz = Math.round(face.normal.z)

              const targetX = worldBlock.x + nx
              const targetY = worldBlock.y + ny
              const targetZ = worldBlock.z + nz

              this.chunkManager.addBlockWorld(targetX, targetY, targetZ, blocks.stone.id)
            }
          }
        }
      })
```

**步骤 4: 在 `update` 方法中调用挖掘控制器的更新**

找到 `update()` 方法，在其中添加：

```js
    // 更新挖掘控制器
    this.blockMiningController?.update()
```

**步骤 5: 验证修改**

检查文件无语法错误，确认导入和调用正确。

---

## Task 6: 为 Crosshair 添加挖掘进度条 UI

**文件：**
- 修改: `src/components/Crosshair.vue`

**目标：** 在准星下方显示挖掘进度条，响应挖掘事件。

**步骤 1: 添加响应式状态**

在 `<script setup>` 中，找到 `const isPressed = ref(false)` 后，添加：

```js
// 挖掘进度
const isMining = ref(false)
const miningProgress = ref(0)
```

**步骤 2: 添加挖掘事件监听**

在 `onMounted` 中添加：

```js
  emitter.on('game:mining-start', onMiningStart)
  emitter.on('game:mining-progress', onMiningProgress)
  emitter.on('game:mining-cancel', onMiningCancel)
  emitter.on('game:mining-complete', onMiningComplete)
```

在 `onUnmounted` 中添加：

```js
  emitter.off('game:mining-start', onMiningStart)
  emitter.off('game:mining-progress', onMiningProgress)
  emitter.off('game:mining-cancel', onMiningCancel)
  emitter.off('game:mining-complete', onMiningComplete)
```

**步骤 3: 实现事件处理函数**

在 `onUnmounted` 前添加：

```js
// 挖掘事件处理
function onMiningStart() {
  isMining.value = true
  miningProgress.value = 0
}

function onMiningProgress(data) {
  isMining.value = true
  miningProgress.value = data.progress
}

function onMiningCancel() {
  isMining.value = false
  miningProgress.value = 0
}

function onMiningComplete() {
  isMining.value = false
  miningProgress.value = 0
}
```

**步骤 4: 添加进度条 DOM 结构**

在 `<template>` 中，`.corners` div 后添加：

```vue
      <!-- 挖掘进度条 -->
      <Transition name="progress-fade">
        <div v-if="isMining" class="mining-progress-container">
          <div class="mining-progress-bar">
            <div class="mining-progress-fill" :style="{ width: `${miningProgress * 100}%` }" />
          </div>
        </div>
      </Transition>
```

**步骤 5: 添加进度条样式**

在 `<style scoped>` 的末尾添加：

```css
/* 挖掘进度条 */
.mining-progress-container {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: 120px;
  pointer-events: none;
}

.mining-progress-bar {
  width: 100%;
  height: 6px;
  background-color: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.mining-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4ade80 0%, #22c55e 100%);
  transition: width 0.05s linear;
  box-shadow: 0 0 8px rgba(74, 222, 128, 0.6);
}

/* 进度条淡入淡出动画 */
.progress-fade-enter-active,
.progress-fade-leave-active {
  transition: opacity 0.2s ease;
}

.progress-fade-enter-from,
.progress-fade-leave-to {
  opacity: 0;
}
```

**步骤 6: 验证修改**

检查 Vue 文件语法正确，样式和逻辑完整。

---

## Task 7: 集成测试与调优

**文件：**
- 无新增文件，仅测试和调整

**目标：** 验证完整功能流程，调整参数和视觉效果。

**步骤 1: 启动开发服务器**

运行：`npm run dev`

**步骤 2: 测试基础挖掘流程**

1. 进入游戏，激活 PointerLock
2. 将准星对准方块，按住左键
3. 观察：
   - 准星下方出现绿色进度条
   - 方块表面逐渐出现裂纹（0-9 阶段）
   - 2 秒后方块消失
4. 测试中途松开鼠标：进度条和裂纹应立即消失

**步骤 3: 测试目标切换**

1. 按住左键开始挖掘方块 A
2. 移动视角切换到方块 B
3. 观察：进度应重置，裂纹应从方块 A 移除

**步骤 4: 调试面板检查**

打开 Debug UI，检查 "Block Mining Controller" 面板：
- 挖掘状态显示正确
- 进度值实时更新
- 可调整挖掘时长测试不同速度

**步骤 5: 视觉效果调优**

根据实际效果调整：

1. **裂纹透明度**：在 `mining.frag.glsl` 中调整混合系数（当前为 0.8）
2. **进度条颜色**：在 `Crosshair.vue` 中修改渐变色
3. **挖掘时长**：在 `world.js` 中修改 `miningDuration` 参数

**步骤 6: 性能检查**

打开浏览器性能分析工具，确认：
- FPS 稳定在 60 左右
- 无内存泄漏
- Shader 编译无警告

**步骤 7: 边界情况测试**

1. 快速连续点击多个方块
2. 在挖掘过程中切换编辑模式（Q 键）
3. 挖掘过程中暂停游戏（ESC）
4. 挖掘水方块、树叶等特殊方块

---

## 完成标准

- ✅ 所有 10 张破坏纹理正确加载
- ✅ 挖掘进度条在准星下方正确显示
- ✅ 方块表面裂纹随进度平滑推进（10 阶段）
- ✅ 持续按住左键完成挖掘，松开则取消
- ✅ 切换目标方块时进度正确重置
- ✅ 无控制台错误或警告
- ✅ 60 FPS 稳定运行
- ✅ Debug 面板可正常调整参数

---

## 注意事项

1. **Shader 数组索引限制**：GLSL 不支持动态数组索引，已使用 if-else 展开
2. **实例 ID 匹配**：通过 `gl_InstanceID` 实现精确方块裂纹定位
3. **Chunk 隔离**：每个 chunk 的 renderer 独立处理挖掘事件，避免跨 chunk 干扰
4. **事件清理**：所有 mitt 事件监听器在组件销毁时正确移除，防止内存泄漏
5. **编辑模式兼容**：当前仅在 `remove` 模式下启用挖掘，`add` 模式保持即时放置

---

## 后续扩展建议

- 为不同方块类型添加硬度配置（Task 2 的基础上扩展）
- 添加挖掘音效和粒子特效
- 实现工具类型加速系统（镐子挖石头更快）
- 添加方块破碎后的掉落物品动画
