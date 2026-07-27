# 第一人称视角模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有第三人称视角之外，新增可通过 `V` 键切换的第一人称视角（真实俯仰控制 + 隐藏玩家头部）。

**Architecture:** 第一人称作为 `CameraRig` 的一个分支实现：rig 新增 `isFirstPerson` 状态与 `pitch` 俯仰角，进入第一人称时跳过第三人称的锚点/洞内/透明度逻辑，直接由「纯函数数学模块」计算相机位姿。`Camera` 新增 `FIRST_PERSON` 模式负责模式切换与地形自适应跳过；`Player` 监听事件总线，用「Head 骨骼缩放为 0」的方式隐藏头部（蒙皮网格随骨骼塌陷，零新美术资源）。

**Tech Stack:** Three.js (WebGPU)、mitt 事件总线、原生 `node:test` 单元测试、pnpm、Vite。

## Global Constraints

- 包管理器只用 `pnpm`；单元测试运行命令为 `pnpm exec node --test tests/unit/*.unit.js`。
- 纯 JavaScript ES modules，显式 `.js` 扩展名；Antfu 风格：两空格缩进、无分号、单引号、多行尾逗号、箭头函数参数带括号。
- 跨层通信用 mitt 事件总线（`src/js/utils/event/event-bus.js`），不允许 Vue 直接操作 Three.js 对象。
- **测试范围约束（用户明确要求）：全程只新增 1 个测试文件 `tests/unit/first-person-math.unit.js`；不新增 E2E 测试文件，不修改任何现有测试文件。** 其余验证用 `pnpm lint`、`pnpm build` 与手动清单。
- 渲染器为 WebGPU-only，不引入 WebGL 回退。
- 切换键固定为 `V`；事件名固定为 `input:toggle_first_person` 与 `camera:first-person-changed`。
- 不修改与第一人称无关的 UI、资源、依赖或遗留文件；不重构 `camera-rig.js` 中已存在的重复 `cycleShoulderMode` 定义（保留现状，守卫加在 `setShoulderMode` 里）。
- Git 使用 Conventional Commit，例如 `feat(camera): add first-person pose math`。

## 关键背景（实现者必读）

- 玩家脚底位置：`player.getPosition()`（`PlayerMovementController.position`）。
- 朝向约定（`player.js:508` 注释）：世界前向 = `(-sin(facingAngle), 0, -cos(facingAngle))`，即 `facingAngle = 0` 时朝 `-Z`。
- 鼠标转 yaw 已由 `player.js:394` 的 `input:mouse_move`（movementX）处理，第一人称**无需**改动 yaw；只需新增 movementY → pitch。
- `player.glb` 骨骼节点含 `Head`、`Chest`、`Body`、`Arm:Right:Upper/Lower` 等；网格是蒙皮网格（`Cube.001`/`Cube.002`），骨骼 scale 置 0 会让对应几何塌陷隐藏。
- `Camera._applyTerrainAdaptation` 每帧可能抬升相机，第一人称必须跳过（相机在头部，抬升会产生穿模/漂浮感）。
- `CameraRig._updateCameraOffset` 会在洞内把玩家透明度压到 0.1，第一人称必须跳过该逻辑，且进入/退出时把透明度恢复为 1。
- 现有 `input-manager.unit.js` 断言 `'v' in input.keys === false`：只要不主动按 `v` 且不把 `v` 加进初始 `keys` 对象，该断言不受影响（参照 `r` 键的既有写法）。

---

### Task 1: 第一人称位姿纯函数模块（含唯一的单元测试）

**Files:**
- Create: `src/js/camera/first-person-math.js`
- Test: `tests/unit/first-person-math.unit.js`

**Interfaces:**
- Consumes: 无（纯函数 + three）
- Produces:
  - `clampPitch(pitch: number, min?: number, max?: number): number`
  - `computeFirstPersonPose(params: { position: THREE.Vector3, facingAngle: number, pitch: number, eyeHeight: number, forwardOffset: number }): { cameraPos: THREE.Vector3, targetPos: THREE.Vector3 }`
  - 后续 Task 2 的 `CameraRig` 将 import 这两个函数。

- [ ] **Step 1: 创建实现文件 `src/js/camera/first-person-math.js`**

```js
import * as THREE from 'three'

/** 俯仰角上限（弧度），约 ±89°，防止视线翻转 */
export const PITCH_LIMIT = Math.PI / 2 - 0.02

/**
 * 将俯仰角限制在安全范围内
 * @param {number} pitch - 当前俯仰角（弧度，正值抬头）
 * @param {number} [min] - 下限
 * @param {number} [max] - 上限
 * @returns {number} 限制后的俯仰角
 */
export function clampPitch(pitch, min = -PITCH_LIMIT, max = PITCH_LIMIT) {
  return Math.min(Math.max(pitch, min), max)
}

/**
 * 计算第一人称相机位姿
 * 朝向约定与世界前向一致：(-sin(yaw), 0, -cos(yaw))，pitch 为正值时抬头
 * @param {{ position: THREE.Vector3, facingAngle: number, pitch: number, eyeHeight: number, forwardOffset: number }} params
 *   position 为玩家脚底世界坐标；forwardOffset 让相机沿视线前移，避免近裁剪面切到自身模型
 * @returns {{ cameraPos: THREE.Vector3, targetPos: THREE.Vector3 }} 相机位置与 lookAt 目标点
 */
export function computeFirstPersonPose({ position, facingAngle, pitch, eyeHeight, forwardOffset }) {
  const safePitch = clampPitch(pitch)
  const cosPitch = Math.cos(safePitch)
  const forward = new THREE.Vector3(
    -Math.sin(facingAngle) * cosPitch,
    Math.sin(safePitch),
    -Math.cos(facingAngle) * cosPitch,
  )
  const eye = new THREE.Vector3(position.x, position.y + eyeHeight, position.z)
  const cameraPos = eye.clone().addScaledVector(forward, forwardOffset)
  const targetPos = eye.clone().add(forward)
  return { cameraPos, targetPos }
}
```

- [ ] **Step 2: 创建测试文件 `tests/unit/first-person-math.unit.js`**

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import * as THREE from 'three'

import { clampPitch, computeFirstPersonPose, PITCH_LIMIT } from '../../src/js/camera/first-person-math.js'

test('clampPitch 限制在 ±PITCH_LIMIT 内', () => {
  assert.equal(clampPitch(10), PITCH_LIMIT)
  assert.equal(clampPitch(-10), -PITCH_LIMIT)
  assert.equal(clampPitch(0.3), 0.3)
  assert.equal(clampPitch(2, -1, 1), 1)
})

test('facingAngle = 0 且 pitch = 0 时朝 -Z 水平看', () => {
  const { cameraPos, targetPos } = computeFirstPersonPose({
    position: new THREE.Vector3(10, 64, 20),
    facingAngle: 0,
    pitch: 0,
    eyeHeight: 1.62,
    forwardOffset: 0.15,
  })
  // 视点 = 脚底 + 眼高
  assert.ok(Math.abs(cameraPos.y - 65.62) < 1e-9)
  // 相机沿 -Z 前移 forwardOffset
  assert.ok(Math.abs(cameraPos.x - 10) < 1e-9)
  assert.ok(Math.abs(cameraPos.z - (20 - 0.15)) < 1e-9)
  // 目标点 = 视点 + 单位前向 (0, 0, -1)
  assert.ok(Math.abs(targetPos.z - 19) < 1e-9)
  assert.ok(Math.abs(targetPos.y - 65.62) < 1e-9)
})

test('pitch 为正值时目标点抬升（抬头）', () => {
  const { targetPos } = computeFirstPersonPose({
    position: new THREE.Vector3(0, 0, 0),
    facingAngle: 0,
    pitch: Math.PI / 4,
    eyeHeight: 1.62,
    forwardOffset: 0.15,
  })
  assert.ok(targetPos.y > 1.62)
})

test('facingAngle = PI 时朝 +Z 看', () => {
  const { targetPos } = computeFirstPersonPose({
    position: new THREE.Vector3(0, 0, 0),
    facingAngle: Math.PI,
    pitch: 0,
    eyeHeight: 1.62,
    forwardOffset: 0.15,
  })
  assert.ok(targetPos.z > 0.9)
})
```

- [ ] **Step 3: 运行新测试，确认通过**

Run: `pnpm exec node --test tests/unit/first-person-math.unit.js`
Expected: 4 个测试全部 PASS

- [ ] **Step 4: 提交**

```bash
git add src/js/camera/first-person-math.js tests/unit/first-person-math.unit.js
git commit -m "feat(camera): add first-person pose math module"
```

---

### Task 2: CameraRig 第一人称分支（状态 + 俯仰 + 位姿输出）

**Files:**
- Modify: `src/js/camera/camera-rig-config.js`（在 `rearView` 之后插入 `firstPerson` 配置）
- Modify: `src/js/camera/camera-rig.js`

**Interfaces:**
- Consumes: `clampPitch`、`computeFirstPersonPose`（Task 1）
- Produces:
  - `rig.isFirstPerson: boolean`（Task 3 的 `Camera` 读取，用于跳过地形自适应）
  - `rig.setFirstPerson(active: boolean): void`（Task 3 调用）
  - 事件 `camera:first-person-changed`，payload `{ active: boolean }`（Task 5 的 `Player` 监听）

- [ ] **Step 1: 在 `camera-rig-config.js` 的 `rearView` 配置块之后、`trackingShot` 之前插入第一人称配置**

```js
  // ===== 第一人称配置 =====
  firstPerson: {
    eyeHeight: 1.62, // 视点相对脚底高度（MC 眼高）
    forwardOffset: 0.15, // 相机沿视线前移，避免近裁剪面切到自身模型
    pitchSensitivity: 0.0035, // 鼠标俯仰灵敏度（弧度/像素）
    pitchMin: -Math.PI / 2 + 0.02, // 最大下俯
    pitchMax: Math.PI / 2 - 0.02, // 最大上仰
  },
```

- [ ] **Step 2: `camera-rig.js` 顶部 import 纯函数**

在 `import { CAMERA_RIG_CONFIG } from './camera-rig-config.js'` 之后添加：

```js
import { clampPitch, computeFirstPersonPose } from './first-person-math.js'
```

- [ ] **Step 3: 构造函数添加状态（加在 `this._rearViewFactor = 0` 之后）**

```js
    // 第一人称状态
    this.isFirstPerson = false
    this._pitch = 0
```

- [ ] **Step 4: 改写 `input:mouse_move` 监听器，第一人称时 movementY 驱动俯仰**

将 `_setupEventListeners()` 中现有的整个 `emitter.on('input:mouse_move', ...)` 监听器替换为：

```js
    emitter.on('input:mouse_move', ({ movementY }) => {
      // 望远镜模式下的鼠标灵敏度缩放（两种视角共用）
      const sensitivityMultiplier = (this.isTelescopeActive && this.config.trackingShot.telescope?.enabled)
        ? this.config.trackingShot.telescope.sensitivityMultiplier
        : 1.0

      // 第一人称：鼠标直接驱动俯仰角
      if (this.isFirstPerson) {
        const fp = this.config.firstPerson
        this._pitch = clampPitch(
          this._pitch - movementY * fp.pitchSensitivity * sensitivityMultiplier,
          fp.pitchMin,
          fp.pitchMax,
        )
        return
      }

      const config = this.config.follow.mouseTargetY
      if (!config.enabled) {
        return
      }

      // 目标阻尼模型：直接调整目标值
      const sign = config.invertY ? -1 : 1
      this.mouseYOffsetTarget += movementY * config.sensitivity * sensitivityMultiplier * sign

      // 限制目标值范围
      this.mouseYOffsetTarget = THREE.MathUtils.clamp(
        this.mouseYOffsetTarget,
        -config.maxOffset,
        config.maxOffset * 1.5,
      )
    })
```

- [ ] **Step 5: 添加 `setFirstPerson` 方法（加在 `setRearView` 方法之后）**

```js
  /**
   * 切换第一/第三人称
   * @param {boolean} active - true 进入第一人称
   */
  setFirstPerson(active) {
    if (this.isFirstPerson === active) {
      return
    }
    this.isFirstPerson = active

    if (active) {
      // 进入第一人称：恢复透明度、退出后视镜，避免第三人称残留状态
      this._currentOpacity = 1.0
      if (this.target && typeof this.target.setOpacity === 'function') {
        this.target.setOpacity(1.0)
      }
      this.setRearView(false)
    }
    else {
      // 回到第三人称：俯仰与目标点偏移清零
      this._pitch = 0
      this.mouseYOffset = 0
      this.mouseYOffsetTarget = 0
    }

    emitter.emit('camera:first-person-changed', { active })
  }
```

- [ ] **Step 6: 第三人称专属逻辑的守卫**

在 `setShoulderMode(mode)` 方法体最前面加一行：

```js
    if (this.isFirstPerson) {
      return
    }
```

在 `setRearView(active)` 方法体最前面加：

```js
    if (this.isFirstPerson && active) {
      return
    }
```

在 `_setupEventListeners()` 的 `emitter.on('input:wheel', ...)` 回调最前面加：

```js
      if (this.isFirstPerson) {
        return
      }
```

- [ ] **Step 7: `update()` 添加第一人称分支**

在 `update()` 中，把现有的第 3～4 步：

```js
    // 3. Update Mouse Y Offset (目标阻尼模型)
    this._updateMouseYOffset(dt)

    // 4. 检测洞内状态并更新相机偏移 (直接驱动 anchor，无中间状态)
    this.isInCave = this._checkBlockAbovePlayer(playerPos)
    this._updateCameraOffset(dt)
```

替换为：

```js
    // 3. 第一人称：跳过第三人称全部锚点/洞内/透明度逻辑，直接输出头部位姿
    if (this.isFirstPerson) {
      this.isInCave = false
      const pose = computeFirstPersonPose({
        position: playerPos,
        facingAngle,
        pitch: this._pitch,
        eyeHeight: this.config.firstPerson.eyeHeight,
        forwardOffset: this.config.firstPerson.forwardOffset,
      })
      this._cameraWorldPos.copy(pose.cameraPos)
      this._smoothedLookAtTarget.copy(pose.targetPos)

      this._updateDynamicFov(speed, dt)
      this._updateBobbing(speed, isMoving)

      return {
        cameraPos: this._cameraWorldPos,
        targetPos: this._smoothedLookAtTarget,
        fov: this._currentFov,
        bobbingOffset: this._bobbingOffset.clone(),
        bobbingRoll: this._bobbingRoll,
      }
    }

    // 4. Update Mouse Y Offset (目标阻尼模型)
    this._updateMouseYOffset(dt)

    // 5. 检测洞内状态并更新相机偏移 (直接驱动 anchor，无中间状态)
    this.isInCave = this._checkBlockAbovePlayer(playerPos)
    this._updateCameraOffset(dt)
```

（原注释编号 5～8 顺延为 6～9 即可，纯注释调整。）

- [ ] **Step 8: `setDebug()` 末尾（`destroy()` 之前）添加第一人称调试面板**

在 `setDebug` 方法的 `// ===== 洞内状态检测 =====` 段落之前插入：

```js
    // ===== 第一人称 =====
    const fpFolder = debugFolder.addFolder({
      title: '第一人称',
      expanded: false,
    })

    fpFolder.addBinding(this, 'isFirstPerson', {
      label: '当前第一人称',
      readonly: true,
    })

    fpFolder.addBinding(this.config.firstPerson, 'eyeHeight', {
      label: '视点高度',
      min: 0.5,
      max: 2.5,
      step: 0.01,
    })

    fpFolder.addBinding(this.config.firstPerson, 'forwardOffset', {
      label: '前移偏移',
      min: 0,
      max: 0.5,
      step: 0.01,
    })

    fpFolder.addBinding(this.config.firstPerson, 'pitchSensitivity', {
      label: '俯仰灵敏度',
      min: 0.001,
      max: 0.01,
      step: 0.0005,
    })

    fpFolder.addBinding(this, '_pitch', {
      label: '当前俯仰角',
      readonly: true,
    })
```

- [ ] **Step 9: 全量单元测试 + lint，确认无回归**

Run: `pnpm exec node --test tests/unit/*.unit.js && pnpm lint`
Expected: 全部测试 PASS；lint 无 error

- [ ] **Step 10: 提交**

```bash
git add src/js/camera/camera-rig.js src/js/camera/camera-rig-config.js
git commit -m "feat(camera): add first-person branch to camera rig"
```

---

### Task 3: Camera 模式集成（FIRST_PERSON 模式 + 切换入口）

**Files:**
- Modify: `src/js/camera/camera.js`

**Interfaces:**
- Consumes: `rig.isFirstPerson`、`rig.setFirstPerson()`（Task 2）；事件 `input:toggle_first_person`（Task 4 提供，本任务先挂监听）
- Produces: `camera.cameraModes.FIRST_PERSON`（值为 `'first-person'`）、`camera.toggleFirstPerson()`

- [ ] **Step 1: `cameraModes` 添加第一人称**

```js
    // 视角模式枚举
    this.cameraModes = {
      THIRD_PERSON: 'third-person',
      FIRST_PERSON: 'first-person',
      BIRD_PERSPECTIVE: 'bird-perspective',
    }
```

同时把该处注释 `// 视角模式枚举（仅保留第三人称与鸟瞰）` 更新为 `// 视角模式枚举`。

- [ ] **Step 2: 构造函数添加切换事件监听（加在 `input:toggle_camera_side` 监听之后）**

```js
    emitter.on('input:toggle_first_person', () => {
      this.toggleFirstPerson()
    })
```

- [ ] **Step 3: 添加 `toggleFirstPerson` 方法（加在 `toggleSide` 方法之后）**

```js
  /**
   * 第一/第三人称互切（V 键）
   */
  toggleFirstPerson() {
    const next = this.currentMode === this.cameraModes.FIRST_PERSON
      ? this.cameraModes.THIRD_PERSON
      : this.cameraModes.FIRST_PERSON
    this.switchMode(next)
  }
```

- [ ] **Step 4: `switchMode` 中接入第一人称**

把现有的：

```js
    if (mode === this.cameraModes.THIRD_PERSON) {
      // 第三人称跟随：禁用 Orbit，使用自定义逻辑
      this.orbitControls.enabled = false
      this.trackballControls.enabled = false
    }
    else if (mode === this.cameraModes.BIRD_PERSPECTIVE) {
```

替换为：

```js
    if (mode === this.cameraModes.THIRD_PERSON) {
      // 第三人称跟随：禁用 Orbit，使用自定义逻辑
      this.orbitControls.enabled = false
      this.trackballControls.enabled = false
      this.rig?.setFirstPerson(false)
    }
    else if (mode === this.cameraModes.FIRST_PERSON) {
      // 第一人称：禁用 Orbit，由 Rig 输出头部位姿
      this.orbitControls.enabled = false
      this.trackballControls.enabled = false
      this.rig?.setFirstPerson(true)
    }
    else if (mode === this.cameraModes.BIRD_PERSPECTIVE) {
      this.rig?.setFirstPerson(false)
```

- [ ] **Step 5: 第一人称跳过地形自适应**

`_applyTerrainAdaptation` 的早退条件：

```js
    if (!this.terrainAdapt.enabled || (this.rig && this.rig.isInCave)) {
```

改为：

```js
    if (!this.terrainAdapt.enabled || (this.rig && this.rig.isInCave) || this.rig?.isFirstPerson) {
```

- [ ] **Step 6: `_translateMode` 支持三种模式**

```js
  _translateMode(mode) {
    if (mode === this.cameraModes.THIRD_PERSON)
      return '第三人称'
    if (mode === this.cameraModes.FIRST_PERSON)
      return '第一人称'
    return '鸟瞰透视'
  }
```

- [ ] **Step 7: 调试面板添加第一人称按钮（加在 `第三人称` 按钮之后）**

```js
      modeFolder.addButton({
        title: '第一人称',
      }).on('click', () => {
        this.switchMode(this.cameraModes.FIRST_PERSON)
      })
```

- [ ] **Step 8: lint + 提交**

Run: `pnpm lint`
Expected: 无 error

```bash
git add src/js/camera/camera.js
git commit -m "feat(camera): integrate first-person mode into camera"
```

---

### Task 4: 输入系统注册 V 键

**Files:**
- Modify: `src/js/utils/input/input.js`

**Interfaces:**
- Consumes: 无
- Produces: 事件 `input:toggle_first_person`（无 payload，按下瞬间触发一次；Task 3 已监听）

- [ ] **Step 1: `updateKey` 的 `switch` 中添加 `v` 分支**

参照 `r` 键的既有写法（不加入初始 `keys` 对象），在 `case 'r':` 分支之后插入：

```js
      case 'v':
        if (isPressed && !this.keys.v) {
          emitter.emit('input:toggle_first_person')
        }
        this.keys.v = isPressed
        break
```

- [ ] **Step 2: 全量单元测试，确认既有输入测试不受影响**

Run: `pnpm exec node --test tests/unit/*.unit.js`
Expected: 全部 PASS（特别是 `input-manager.unit.js` 中 `'v' in input.keys === false` 断言，不按键时不受影响）

- [ ] **Step 3: 提交**

```bash
git add src/js/utils/input/input.js
git commit -m "feat(input): bind V key to toggle first person"
```

---

### Task 5: Player 隐藏头部（Head 骨骼缩放）

**Files:**
- Modify: `src/js/world/player/player.js`

**Interfaces:**
- Consumes: 事件 `camera:first-person-changed`，payload `{ active: boolean }`（Task 2 发出）
- Produces: `player.setFirstPersonMode(active: boolean): void`

- [ ] **Step 1: 构造函数注册监听（加在 `emitter.on('skin:changed', this._handleSkinChange)` 之后）**

```js
    // 第一人称切换：隐藏/恢复头部
    this._handleFirstPersonChanged = this._handleFirstPersonChanged.bind(this)
    emitter.on('camera:first-person-changed', this._handleFirstPersonChanged)
```

- [ ] **Step 2: 添加处理方法与 `setFirstPersonMode`（加在 `setOpacity` 方法之后）**

```js
  /**
   * 第一人称切换事件处理
   * @param {{ active: boolean }} payload
   */
  _handleFirstPersonChanged({ active }) {
    this.setFirstPersonMode(active)
  }

  /**
   * 第一人称模式：将 Head 骨骼缩放为 0 隐藏头部（蒙皮网格随骨骼塌陷），退出时恢复
   * @param {boolean} active
   */
  setFirstPersonMode(active) {
    if (!this._headBone && !this._headBoneSearched) {
      this._headBoneSearched = true
      this._headBone = this.model.getObjectByName('Head') || null
      if (this._headBone) {
        this._headBoneOriginalScale = this._headBone.scale.clone()
      }
    }
    if (!this._headBone) {
      return
    }

    if (active) {
      this._headBone.scale.set(0, 0, 0)
    }
    else if (this._headBoneOriginalScale) {
      this._headBone.scale.copy(this._headBoneOriginalScale)
      // 兜底：退出第一人称时恢复不透明度（避免洞内半透明残留）
      this.setOpacity(1.0)
    }
  }
```

- [ ] **Step 3: `destroy()` 中移除监听**

在 `destroy()` 方法内、移除 `skin:changed` 监听的代码（`emitter.off('skin:changed', this._handleSkinChange)` 或同类写法）旁边添加：

```js
    emitter.off('camera:first-person-changed', this._handleFirstPersonChanged)
```

（若 `destroy()` 中尚无 `skin:changed` 的 off，则把本行加在 `destroy()` 方法体末尾。）

- [ ] **Step 4: lint + 全量单元测试 + 提交**

Run: `pnpm lint && pnpm exec node --test tests/unit/*.unit.js`
Expected: lint 无 error；全部测试 PASS

```bash
git add src/js/world/player/player.js
git commit -m "feat(player): hide head bone in first-person mode"
```

---

### Task 6: 整体验证（build + 手动验收清单）

**Files:** 无新增/修改

- [ ] **Step 1: 生产构建**

Run: `pnpm build`
Expected: 构建成功，无报错

- [ ] **Step 2: 全量单元测试**

Run: `pnpm exec node --test tests/unit/*.unit.js`
Expected: 全部 PASS

- [ ] **Step 3: 手动验收（`pnpm dev` 启动后逐项确认）**

1. 进入游戏锁定指针后按 `V`：切换到第一人称，视角位于角色头部高度，不再看到角色头部。
2. 鼠标上移 → 视线抬头（接近正上方时停止，约 ±89°）；下移 → 低头，能看到自己的身体/腿部。
3. WASD 移动方向与视线水平朝向一致（yaw 跟随，无需改动即应成立）。
4. 屏幕中心对准方块，挖掘/放置交互正常（`BlockRaycaster` 用屏幕中心射线，天然适配）。
5. 第一人称下按 `Q` / 按住 `` ` `` / 滚动滚轮：不产生第三人称的探头/后视镜/高度变化（已被守卫）。
6. 按住 `Tab` 望远镜在第一人称下仍可缩放 FOV，且鼠标灵敏度降低。
7. 再按 `V` 回到第三人称：头部恢复显示、透明度恢复为 1、肩视角与滚轮高度恢复可用。
8. 走进洞穴（头顶 ≥2 格方块）：第三人称半透明行为保持不变。
9. 打开 debug 面板：Camera → 「第一人称」按钮可切换；rig 的「第一人称」folder 参数实时可调。

- [ ] **Step 4: 如发现穿模/灵敏度问题，只用 Tweakpane 调 `firstPerson` 参数并回写 `camera-rig-config.js` 默认值，不新增代码分支**
