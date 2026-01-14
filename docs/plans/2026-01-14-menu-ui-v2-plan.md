# Menu UI v2 分步实施计划（轻量重建版）

> 依据：`docs/plans/2026-01-14-menu-ui-v2-design.md`（v2.1）
> 决策：**New World 采用“轻量重建”**——不重建 Player/Camera/Environment，不销毁 World；只对 ChunkManager 执行“全量重新生成/刷新网格”的流程，使 seed/worldgen 生效且成本可控。

---

## 0. 总目标（范围锁定）

- **UI**
  - 菜单整体按方案 C **响应式放大到 1.2x（PC）**，小屏不溢出
  - **按钮文字垂直居中**（修复偏上）
  - 新增 **Minecraft step slider**
- **Settings（运行时）**
  - Camera：FOV（速度感）+ Bobbing（速度震感）+ 预设（Default/Cinematic/Arcade）
  - Visual：SpeedLines + 预设
  - Env：Image/HDR 天空切换 + sun/ambient/fog
- **World Setup（仅新建世界生效）**
  - Advanced 折叠面板：**World Type 预设** + Terrain Height（地形高度，底层字段：`magnitude`）+ tree size（可选 tree density）
- **New World：轻量重建**
  - 仅刷新 ChunkManager：重新生成所有 chunk（3×3），seed/worldgen 生效
  - **不重建** Player/CameraRig/Environment（保持已创建实例）

---

## 1. 关键约束（轻量重建的边界）

### 1.1 什么会变？

- 重新生成地形与树（基于新 seed + worldgen 参数）
- 重新创建 chunk 网格数据与 mesh（全量）

### 1.2 什么不会变？

- Player 实例（位置/速度等状态）默认不销毁
- CameraRig/Environment 不销毁

### 1.3 必须额外定义的行为（避免“玩家悬空/卡进地形”）

轻量重建后地形变化，玩家位置可能不合法。必须选择一条策略：

- **策略 A（推荐）**：重建后把玩家移动到安全出生点（例如 x=0,z=0，y=地表+1）
- **策略 B**：保持玩家原位置，但若贴地检测失败则自动上移直到安全

> v2.0 优先做策略 A（简单可靠）。

---

## 2. 分步实施（Step-by-step）

> 每一步都可以独立验收，尽量把风险控制在局部文件改动里。

### Step 1：UI 响应式放大（方案 C）

- **目标**：PC ≈ 1.2x，小屏不溢出；不使用 transform 缩放。
- **改动文件**
  - `src/scss/global.scss`
  - （可能需要）`src/components/menu/SettingsMenu.vue`（去掉 `min-width: 500px` 的硬限制）
- **实现要点**
  - 引入 `--mc-ui-scale: clamp(...)`
  - `--mc-btn-height/--mc-btn-width/--mc-btn-gap` 由 scale 推导
  - `--mc-btn-width` 使用 `clamp()` 限制最大宽度并保证移动端可用
- **验收**
  - 1380×840：按钮和整体菜单明显更大
  - 收窄窗口：按钮仍在视口内，不横向溢出

### Step 2：按钮文字垂直居中修复

- **目标**：所有 `.mc-button .title` 文字不偏上。
- **改动文件**
  - `src/scss/global.scss`
- **实现要点**
  - 移除/归零 `.title { padding-bottom: ... }`
  - 明确 `align-items:center; line-height:1;`
  - 若仍偏：`.title { transform: translateY(1px); }`（最后手段）
- **验收**
  - Main/Pause/Settings 所有按钮文字垂直居中

### Step 3：新增 Minecraft Step Slider 组件

- **目标**：离散 step、支持键盘，`change` 时才触发“应用到 Three.js”。
- **新增文件**
  - `src/components/menu/ui/McStepSlider.vue`
- **实现要点**
  - `min/max/step` 离散化（拖动与点击轨道都量化到最近 step）
  - `@input`：更新 Pinia（UI 即时反馈）
  - `@change`：触发回调，用于 mitt emit（避免每帧应用）
- **验收**
  - slider 拖动时按 step 跳动，松手触发一次 change
  - 方向键可按 step 调整

### Step 4：Settings v2（UI 层）——分组 + 预设按钮

- **目标**：实现 Camera/Visual/Env 分组界面 + Preset（Default/Cinematic/Arcade）一键填充值。
- **改动文件**
  - `src/components/menu/SettingsMenu.vue`
  - （新增可选）`src/components/menu/ui/McPresetRow.vue`（不强制）
- **实现要点**
  - Camera：FOV + Bobbing（使用 step slider）
  - Visual：SpeedLines（使用 step slider）
  - Env：Sky mode（Image/HDR）、sun/ambient/fog（slider）
  - Preset 按钮点击后：把数值写入 store（不要直接操作 Three）
- **验收**
  - 点击 Cinematic/Arcade 后 UI 数值立即变化

### Step 5：Settings v2（Store 层）——持久化 + 事件输出

- **目标**：Settings 全部进入 `settingsStore`，并在 setter/批量应用时通过 mitt 通知 Three.js。
- **改动文件**
  - `src/vue/settingsStore.js`
- **实现要点**
  - 新增 state：`cameraFovPreset/cameraBobbingPreset/speedLinesPreset/envPreset`（可选）
  - 新增 state：FOV/Bobbing/SpeedLines/Env 的具体参数值
  - 新增 action：`applyPreset(presetName)`（一次性写入多项值）
  - 每个 setter 或 applyPreset：
    - `emitter.emit('settings:camera-rig-changed', patch)`
    - `emitter.emit('settings:postprocess-changed', patch)`
    - `emitter.emit('settings:environment-changed', patch)`
  - localStorage 持久化：沿用现有模式（STORAGE_KEY），加入新字段
- **验收**
  - 刷新页面后 settings 能恢复
  - 调节 slider 只在 change 时 emit（或 UI 侧节流）

### Step 6：Three.js 侧应用 Settings（监听 mitt）

- **目标**：Settings 改动立即作用于运行时对象。
- **改动文件（按模块）**
  - `src/js/camera/camera-rig.js`：监听 `settings:camera-rig-changed`，更新 `this.config.trackingShot` 与洞内相关参数
  - `src/js/renderer.js`：监听 `settings:postprocess-changed`，同步 `postProcessConfig.speedLines` 与 shader uniforms
  - `src/js/world/environment.js`：监听 `settings:environment-changed`，调用 `updateBackground/updateAmbientLight/updateFog/updateSunLightIntensity`
  - （可选）`src/js/world/player/player.js`：监听速度线“目标透明度/淡入淡出”并更新自己的 config（不要强改常量 `PLAYER_CONFIG`）
- **验收**
  - FOV/Bobbing/speedlines/env 调整能实时看到差异

### Step 7：World Setup Advanced（Seed）交互落地（仅新建世界生效）

- **目标**：折叠/警告/固定提示/WorldGen preset + 草稿参数。
- **改动文件**
  - `src/components/menu/MainMenu.vue`（worldSetup 视图）
  - `src/vue/uiStore.js`（加入 `worldGenDraft` + preset 填充）
- **实现要点**
  - Seed 输入后固定提示条：`仅新建世界生效：高级参数不会影响当前世界`
  - Advanced 默认折叠：`Advanced...` + `▸/▾`
  - 展开后警告条：强调只在 Create/New World 生效
  - 分组：
    - Terrain：**World Type（preset）** + Terrain Height（地形高度；底层字段：`magnitude`）（普通玩家不暴露 fBm/scale/offset）
    - Trees：min/max height、radius、frequency（可选）
  - WorldGen preset：Default/Flat/Mountains/Forest（填充草稿值）
- **验收**
  - Advanced 默认折叠
  - 改动草稿不会影响当前世界

### Step 8：New World “轻量重建”链路（关键）

#### 8.0 目标（接口级）

- **目标**：当 UI 触发 `Create/Reset` 时，将 `{ seed, terrainParams, treeParams }` 传入 Three.js，并调用 `ChunkManager` 的 **公开方法**执行“全量重新生成所有 chunk”的流程；同时保证重建后玩家不会卡进地形或悬空。

#### 8.1 现有可复用能力（来自当前代码）

- `ChunkManager.setSeed(newSeed)`：已存在，会设置 `this.seed`、`this.biomeGenerator.seed` 并调用私有 `_regenerateAllChunks()`
- `ChunkManager._regenerateAllChunks()`：私有方法，内部会清理群系缓存并对每个 chunk 调用 `chunk.regenerate(params)`
- `ChunkManager.getTopSolidYWorld(worldX, worldZ)`：已存在，可用于寻找“地表安全高度”
- `ChunkManager.updateStreaming(playerPos, force)`：已存在，可用于强制刷新 3×3 网格与生成队列
- `ChunkManager.idleQueue.cancelByPrefix(prefix)`：已存在，可用于取消旧队列任务（卸载时使用）

> 结论：我们不需要发明复杂架构，核心是把“私有 regenerate + streaming 强刷 + 队列取消”包装成一个稳定的 **public API**。

#### 8.2 需要新增/暴露的 public API（ChunkManager 侧）

在 `src/js/world/terrain/chunk-manager.js` 新增（或暴露）以下方法：

- **API 1：应用 WorldGen 草稿（保持对象引用）**
  - **签名**

```js
export default class ChunkManager {
  applyWorldGenParams({ terrain, trees, water, biome } = {}) {}
}
```

  - **行为规范**
    - **不要**用 `this.terrainParams = terrain` 这种整体替换（会破坏共享引用），而是“逐字段写入”：
      - `this.terrainParams.scale = terrain.scale` 等
      - `this.terrainParams.fbm.octaves = terrain.fbm.octaves` 等（来自 **preset 内部映射**，不是玩家直接输入）
      - `this.treeParams.minHeight = trees.minHeight` 等
    - 如果某个子对象不存在（例如 `terrain.fbm`），则跳过该子树更新（避免把参数写成 `undefined`）。

- **API 2：轻量重建入口（唯一对外入口）**
  - **签名**

```js
export default class ChunkManager {
  regenerateAll({
    seed,
    terrain,
    trees,
    water,
    biome,
    // 用于强制刷 3×3 的中心点（通常是重生点/出生点）
    centerPos = { x: this.chunkWidth * 0.5, z: this.chunkWidth * 0.5 },
    // 是否强制同步生成中心 chunk，避免碰撞/贴地查询出现空洞
    forceSyncCenterChunk = true,
  } = {}) {}
}
```

  - **行为规范（按顺序执行）**
    - **(1) 取消旧任务队列**：防止重建过程中旧任务继续写入 mesh
      - `this.idleQueue.cancelByPrefix('')`（如果不支持“全取消”，则遍历 `this.chunks.keys()` 做 cancel）
    - **(2) 更新 seed**：
      - 若传入 `seed !== undefined`：`this.seed = seed; this.biomeGenerator.seed = seed`
    - **(3) 应用 worldgen 参数**：
      - 调用 `applyWorldGenParams({ terrain, trees, water, biome })`
    - **(4) 强制重建所有已存在 chunk**：
      - 调用私有 `_regenerateAllChunks()`（继续保留为私有，但由 `regenerateAll()` 统一调用）
    - **(5) 强制刷新 streaming 网格**：
      - 设置 `this._lastPlayerChunkX = null; this._lastPlayerChunkZ = null`（确保 `force=false` 也会刷新）
      - 调用 `this.updateStreaming(centerPos, true)`（force=true）
    - **(6) 同步生成中心 chunk（可选但推荐）**：
      - 复用 `updateStreaming()` 里的“碰撞保底”逻辑：确保中心 chunk 的 `generateData + buildMesh` 已完成
    - **(7) 返回/事件（可选）**：
      - 可 `return { seed: this.seed }` 或 emit `game:world-regenerate-done`

#### 8.3 `TerrainChunk` 侧无需新增 API（复用已有 regenerate）

当前 `TerrainChunk.regenerate(params)` 已存在（`chunk-manager.js` 内部也在调用）。v2 只要求确保 `ChunkManager` 的 `regenerateAll()` 能驱动它即可。

#### 8.4 World / UI 的事件与 payload（最小改动）

- **UI 侧（`src/vue/uiStore.js`）**：扩展 payload（只在 Create/Reset 触发）
  - UI 层只暴露：`worldTypePresetId + overrides(magnitude, trees...)`
  - 发送前由 UI/store **把 preset 映射展开**为完整的 `terrain/trees`（这样 Three.js 侧无需理解 preset）

```js
// uiStore 内部：
// const base = WORLD_TYPE_PRESETS[presetId]  // 内部映射（含 scale/offset/fbm...）
// const terrain = { ...base.terrain, magnitude: overrides.magnitude }
// const trees = { ...base.trees, ...overrides.trees }
emitter.emit('game:create_world', { seed, terrain, trees })
emitter.emit('game:reset_world', { seed, terrain, trees })
```

- **World 侧（`src/js/world/world.js`）**：监听并调用轻量重建入口

```js
emitter.on('game:reset_world', ({ seed, terrain, trees }) => {
  // 1) chunk 全量重建（轻量重建：不重建 player/camera/env）
  this.chunkManager.regenerateAll({
    seed,
    terrain,
    trees,
    centerPos: { x: this.chunkManager.chunkWidth * 0.5, z: this.chunkManager.chunkWidth * 0.5 },
  })

  // 2) 玩家安全放置（策略 A：重生到中心地表）
  const y = this.chunkManager.getTopSolidYWorld(0, 0)
  // 若 y 为 null，兜底放到一个安全高度（例如 chunkHeight-1）
  this.player?.setPosition?.({ x: 0, y: (y ?? (this.chunkManager.chunkHeight - 2)) + 1, z: 0 })
})
```

> 注意：如果当前 `Player` 没有 `setPosition`，则在 Step 8 的子任务里补一个最小方法（只改 Player 自身，不动 UI）。

#### 8.5 Step 8 子任务拆分（可执行）

- **8A：新增 `ChunkManager.applyWorldGenParams()`**（纯数据写入，低风险）
- **8B：新增 `ChunkManager.regenerateAll()`**（封装队列取消 + seed + regenerate + 强刷 streaming）
- **8C：UI 扩展 payload**（`uiStore` 增加 terrain/trees 草稿并在 Create/Reset 发出）
- **8D：World 监听 reset/create**（调用 `regenerateAll()`）
- **8E：玩家安全重生策略 A**（用 `getTopSolidYWorld()` 计算地表并放置）

#### 8.6 验收（Step 8 专属）

- **地形差异**：切换不同 seed / worldgen preset，New World 后地形与树大小明显变化
- **无重建副作用**：Player/CameraRig/Environment 对象仍是同一实例（无额外初始化抖动）
- **安全性**：重建后玩家不会卡进方块或无限下落（出生点落在地表上方）

### Step 9：回归测试（最小冒烟）

- **目标**：防止未来改动把 UI 缩放/对齐/Advanced 逻辑打坏。
- **改动文件**
  - `tests/` 下新增 Playwright 冒烟（可选）
- **验收**
  - 至少覆盖：菜单可见、切换到 Settings、Advanced 展开、点击 preset 不报错

---

## 3. 验收清单（最终 v2.1）

- **UI**
  - PC 约 1.2x；小屏不溢出
  - 按钮文字垂直居中
- **Settings**
  - Default/Cinematic/Arcade 一键切换 + slider step 生效
  - Env：Image/HDR + sun/ambient/fog 即时生效
  - 刷新后参数保留
- **World Setup**
  - Advanced 默认折叠，提示“仅新建世界生效”固定可见
  - WorldGen preset 能填充值
- **轻量重建**
  - New World 不重建 World 子系统，只重建 chunks
  - 玩家重建后位置安全（不会卡进地形/掉落）

---

## 4. 风险与回滚

- **风险：小屏溢出**
  - 回滚点：只回退 `--mc-btn-width` 的 clamp 参数
- **风险：频繁 emit 导致抖动/卡顿**
  - 规避：slider 的 `change` 才 emit；或在 store 内做节流
- **风险：轻量重建后玩家卡住**
  - 规避：重建后强制 respawn 到安全点（策略 A）
