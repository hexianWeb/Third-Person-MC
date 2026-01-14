# Menu UI v2 Plan（v2.1）——响应式放大 + Minecraft Step Slider + Settings 预设数值表 + Advanced Seed 交互稿

> 本文是对 v1 菜单系统的 **v2.1 计划书**（偏“可执行”），在不推翻现有结构的前提下补齐你要的两项关键细化：
> 1) **预设具体数值表**（Cinematic / Arcade / Default…）
> 2) **Advanced（Seed）面板交互稿**（折叠、警告文案、“仅新建世界生效”提示位置）

---

## 1. 背景 / 现状（v1 已完成）

- **UI 已落地**：`src/components/menu/UiRoot.vue` + `MainMenu/PauseMenu/SettingsMenu/LoadingScreen`
- **MC 样式基座**：`src/scss/global.scss` 定义 `.mc-menu/.mc-button/.mc-input`（按钮背景：`/textures/hub/btn_bg.png`）
- **Three.js 可调参数落点已存在**（目前通过 Debug 面板调参）：
  - **速度线**：`src/js/renderer.js`（`postProcessConfig.speedLines`）
  - **冲刺触发强度**：`src/js/config/player-config.js`（`PLAYER_CONFIG.speedLines`）
  - **速度感 / 镜头震动**：`src/js/camera/camera-rig-config.js`（`trackingShot.fov/bobbing`）
  - **洞内/遮挡适应**：`src/js/camera/camera-rig.js`（洞内检测 + offset 插值）
  - **环境**：`src/js/world/environment.js`（背景 Image/HDR、sun/ambient、fog）
  - **地形/树参数**：`src/js/config/chunk-config.js`（`TERRAIN_PARAMS/TREE_PARAMS`）+ `chunk-manager.js/terrain-generator.js`

---

## 2. v2 目标（逐条对应你的需求）

- **2.1 UI 放大**：菜单整体相对 v1 **放大到 1.2 倍**，但采用 **方案 C（响应式混合）**：PC 1.2x，小屏自动回落，永不溢出。
- **2.2 按钮文字垂直居中**：修复所有 `.mc-button .title` 的“文字偏上”。
- **2.3 Settings 更丰富 + Minecraft Step Slider**
  - **Camera（地形适应 + 速度感 + 速度震感）**：提供 **预设方案 + step 滑动条**。
  - **Env（天空/光照/雾）**：Image（MC 风格背景图）/ HDR（真实天空）切换；可调 sunlight/ambient/fog。
- **2.4 Seed 面板扩展**
  - **不开放 fBm 细项给普通玩家**：改为 **World Type 预设**（内部映射到 fBm/scale/offset）
  - 玩家只可调 **Terrain Height（地形高度）**（底层字段：`magnitude`）
  - **树大小**可调
  - （可选）树密度可调

---

## 3. 约束与原则（减少风险）

- **UI 与 Three 解耦**：Vue 不直接持有 Three 实例；统一 **Pinia 存状态 + mitt 发“应用事件”**。
- **参数生效边界清晰**：
  - **Settings（运行时）**：改动立即生效，可持久化。
  - **WorldGen（生成参数）**：只在 **Create/Reset World** 时生效；改 slider 不会隐式重建世界。

---

## 4. UI 尺寸策略：方案 C（响应式混合放大）

### 4.1 核心做法（推荐：变量驱动，不用 transform）

在 `src/scss/global.scss` 引入统一缩放变量，并让 MC UI 尺寸全部由变量推导：

- `--mc-ui-scale: clamp(1, 0.92 + 0.02vw, 1.2)`（示例：越宽越大，上限 1.2）
- `--mc-btn-height: calc(40px * var(--mc-ui-scale))`
- `--mc-btn-width: clamp(260px, calc(400px * var(--mc-ui-scale)), 520px)`（示例：防溢出）
- `--mc-btn-gap: calc(8px * var(--mc-ui-scale))`

> 这样 PC 视觉接近 1.2 倍，同时移动端不会把按钮撑到屏幕外。

### 4.2 兼容 Logo / 面板

- Logo（`/textures/hub/logo.png`）宽度同样用 `clamp()` 控制，避免挤压按钮区。
- `SettingsMenu` 的 `min-width: 500px` 需要改成响应式（例如 `width: min(520px, 92vw)`），否则小屏必溢出。

---

## 5. UI Bugfix：按钮文字垂直居中（v2 必做）

### 5.1 根因

`src/scss/global.scss` 中 `.mc-button .title` 目前有：

- `padding-bottom: 0.3em;`（导致文字视觉偏上）

### 5.2 修复策略（像素风友好）

- 移除 `padding-bottom` 或改为非常小的常量（建议直接移除）
- 明确使用 flex 垂直居中：
  - `display:flex; align-items:center; justify-content:center;`
  - `line-height: 1;`
- 若仍有基线偏移（Minecraftia 的字形基线问题）：允许加极小矫正：
  - `transform: translateY(1px);`（**仅在 .title 内**，且作为最后手段）

---

## 6. Minecraft Step Slider（离散滑动条）规范

### 6.1 组件：`McStepSlider`

建议新增：`src/components/menu/ui/McStepSlider.vue`

- **行为**
  - 拖动时按 `step` 离散跳动（不是连续）。
  - 点击轨道：跳到最近 step。
  - 键盘：`ArrowLeft/ArrowRight` 按 step 移动。
- **显示**
  - 左侧 label，右侧 value（可显示单位：°、%）。
  - 可选 marks（刻度文本，如 Off/Default/High）。

### 6.2 输出策略（避免每一帧都 emit）

- `input`：只更新 Pinia（UI 即时反馈）
- `change`（鼠标松开/键盘确认）：emit mitt 给 Three.js 应用（减少抖动）

---

## 7. Settings v2：分组 + 预设 + 具体数值表

> 下表所有 “Default” 数值以 **当前代码现状** 为基准：
> FOV/Bobbing 来自 `src/js/camera/camera-rig-config.js`；SpeedLines 来自 `src/js/renderer.js`；冲刺透明度来自 `src/js/config/player-config.js`。

### 7.1 Camera / Speed Feeling（动态 FOV）预设表

对应代码：`CameraRig.config.trackingShot.fov`

| Preset | enabled | baseFov | maxFov | speedThreshold | smoothSpeed | 说明 |
|---|---:|---:|---:|---:|---:|---|
| Off | false | 55 | 85 | 3.0 | 0.05 | 关闭速度感（只用固定 FOV） |
| Default | true | 55 | 85 | 3.0 | 0.05 | 当前默认（v1 现状） |
| Cinematic | true | 50 | 95 | 2.5 | 0.035 | 更强速度感但更“电影”平滑 |
| Arcade | true | 60 | 100 | 2.0 | 0.07 | 强烈夸张（更快更猛） |

**Slider step 建议**：
- `baseFov/maxFov`: step = 1
- `speedThreshold`: step = 0.5
- `smoothSpeed`: step = 0.005

### 7.2 Camera / Speed Vibration（Bobbing）预设表

对应代码：`CameraRig.config.trackingShot.bobbing`

| Preset | enabled | vFreq | vAmp | hFreq | hAmp | rollFreq | rollAmp | speedMultiplier | idleBreathing |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Off | false | 4.0 | 0.025 | 4.0 | 0.015 | 4.0 | 0.005 | 1.0 | breathing 可保留或关（建议关） |
| Default | true | 4.0 | 0.025 | 4.0 | 0.015 | 4.0 | 0.005 | 1.0 | enabled=true, freq=0.7, amp=0.015 |
| Cinematic | true | 3.0 | 0.015 | 3.0 | 0.008 | 3.0 | 0.002 | 0.8 | enabled=true, freq=0.6, amp=0.012 |
| Arcade | true | 6.0 | 0.040 | 6.0 | 0.025 | 6.0 | 0.010 | 1.6 | enabled=true, freq=0.9, amp=0.018 |

**Slider step 建议**：
- 频率：step = 0.5
- 幅度：step = 0.001（amp 值都很小，需要细粒度）
- `speedMultiplier`: step = 0.1

### 7.3 Visual / SpeedLines（速度线）预设表

对应代码：`Renderer.postProcessConfig.speedLines`

| Preset | enabled | color (RGB) | density | speed | thickness | minRadius | maxRadius | randomness | 说明 |
|---|---:|---|---:|---:|---:|---:|---:|---:|---|
| Off | false | 255,255,255 | 66 | 6.0 | 0.24 | 0.40 | 1.30 | 0.50 | 关闭速度线 |
| Default | true | 255,255,255 | 66 | 6.0 | 0.24 | 0.40 | 1.30 | 0.50 | 当前默认（v1 现状） |
| Cinematic | true | 235,245,255 | 48 | 4.0 | 0.18 | 0.45 | 1.15 | 0.35 | 更“轻”，更像电影镜头光效 |
| Arcade | true | 255,255,255 | 90 | 8.0 | 0.30 | 0.35 | 1.50 | 0.70 | 更密更快更乱（冲刺爽感） |

**Slider step 建议**：
- density：step = 1
- speed：step = 0.1
- thickness/minRadius/maxRadius/randomness：step = 0.01

### 7.4 Sprint 触发强度（速度线透明度）预设表

对应代码：`PLAYER_CONFIG.speedLines`

| Preset | targetOpacity | fadeInSpeed | fadeOutSpeed | 说明 |
|---|---:|---:|---:|---|
| Default | 0.8 | 5.0 | 3.0 | 当前默认 |
| Cinematic | 0.55 | 4.0 | 2.5 | 更克制、更柔和 |
| Arcade | 0.95 | 7.0 | 4.0 | 更猛更快、更“冲刺爽” |

> 注：透明度仍由 Player 在冲刺时驱动（`renderer.setSpeedLineOpacity()`），Settings 只改变“目标透明度与淡入淡出速度”。

---

## 8. Env（环境）Settings：参数与提示

对应代码：`src/js/world/environment.js`

- **天空模式**
  - `Image`：使用 `backgroundTexture`（MC 风格背景图）
  - `HDR`：使用 `environmentMapHDRTexture`
- **光照**
  - `sunIntensity`（默认 1.75）
  - `ambientIntensity`（默认 0.75）
- **雾**
  - `fogDensity`（默认 0.01）

**UI 文案建议（中文）**
- 天空切换行右侧加小字提示：`切换天空会立即生效（仅影响渲染）`
- 雾密度行右侧加小字提示：`雾越大能见度越低`

**Slider step 建议**
- `sunIntensity`: step = 0.05（范围 0~5 或 0~10）
- `ambientIntensity`: step = 0.05（范围 0~3 或 0~5）
- `fogDensity`: step = 0.0005（范围 0~0.05 或 0~0.1）

---

## 9. Advanced（Seed）面板：交互稿（World Setup 内）

目标：Seed 页既能满足“快速开始”，又能给进阶玩家调参；同时通过 UI 明确 **“仅新建世界生效”**，避免用户误解。

### 9.1 位置与层级（建议布局）

在 `MainMenu.vue` 的 `worldSetup` 视图中，按钮区之前，按以下顺序排列：

1. 标题：`Create World` / `New World`
2. Seed 输入框（现有）
3. **提示条（固定可见）**：`仅新建世界生效：高级参数不会影响当前世界`
4. **Advanced 折叠区（默认折叠）**
5. Random / Create / Back（现有按钮）

### 9.2 折叠区外观与文案

- 折叠按钮（像 MC 的二级按钮）：
  - 文案：`Advanced...`（折叠时） / `Advanced (Open)`（展开时）
  - 右侧状态：`▸` / `▾`
- 折叠区内部顶端放 **警告条**（展开时可见，强调一次即可）：
  - 标题：`注意`
  - 内容：`以下参数仅在 “Create / New World” 时生效，不会实时改变当前世界。`

### 9.3 Advanced 内部分组（两段）

#### A) Terrain（地形）

参数来源：`src/js/config/chunk-config.js` 的 `TERRAIN_PARAMS`

- `World Type`（Preset）：Default / Flat / Mountains / Forest（**普通玩家只看到预设，不看到 fBm 细项**）
- `Terrain Height` 地形高度（step=1，范围 0~32，底层字段：`magnitude`）

> 说明：`scale/offset/fbm.*` 由 World Type 预设在内部决定（便于后续替换生成算法，不绑定 UI 承诺）。

#### B) Trees（树）

参数来源：`TREE_PARAMS`

- `minHeight/maxHeight`（step=1，范围 1~32）
- `minRadius/maxRadius`（step=1，范围 1~12）
- `frequency`（step=0.01，范围 0~1）

### 9.4 Advanced 的“预设按钮”（可选但推荐）

> 你希望有预设方案，这里给出 **WorldGen 预设**（只影响新建世界）。

折叠区顶部加一行：`World Type: [Default] [Flat] [Mountains] [Forest]`

> 下表是 **预设的内部映射**（用于实现与调参，不直接暴露给普通玩家 UI）。

| Preset | TERRAIN scale | magnitude | offset | fbm.octaves | fbm.gain | fbm.lacunarity | TREE minH/maxH | minR/maxR | freq |
|---|---:|---:|---:|---:|---:|---:|---|---|---:|
| Default | 168 | 6 | 8 | 5 | 0.50 | 2.0 | 3/6 | 2/4 | 0.05 |
| Flat | 260 | 2 | 8 | 3 | 0.45 | 2.0 | 3/5 | 2/3 | 0.04 |
| Mountains | 110 | 18 | 10 | 6 | 0.55 | 2.2 | 4/8 | 3/6 | 0.06 |
| Forest | 168 | 6 | 8 | 5 | 0.50 | 2.0 | 5/10 | 3/7 | 0.12 |

### 9.5 Create / New World 时的提示（防误解）

当用户点击 `Create`：

- 若 `Advanced` 展开过且参数非 Default，按钮下方短暂提示（或在确认弹窗内展示摘要）：
  - `WorldGen: Mountains + Forest (custom)` 或 `WorldGen: Custom`
  - 并列出关键值：`terrainHeight=18, treeHeight=4-8`（不展示 fBm 细项；实现仍写入 `magnitude`）

当用户从 Root 点 `New World` 进入 worldSetup 并最终弹覆盖确认弹窗时，在弹窗正文里增加一行：
- `将使用：Seed=xxx，WorldGen=Custom（仅在新世界生效）`

---

## 10. Three.js 接入点（必须修正的关键点）

### 10.1 Seed 不可再硬编码

当前 `src/js/world/world.js` 初始化 `ChunkManager` 时写死：`seed: 1265`。v2 要改为使用 UI 的 seed（来自 `game:create_world/game:reset_world` payload），否则 Seed 面板无意义。

### 10.2 Trees 参数必须传入 ChunkManager

当前 `World` 构造只传了 `terrain`，没有传 `trees`，因此“树大小”即使 UI 有，也无法影响生成。v2 要把 `trees` 传入 `ChunkManager`（其内部已经支持 `options.trees || TREE_PARAMS`）。

---

## 11. 里程碑（建议）

### v2.0（UI 体验正确 + 基础 settings）

- UI 响应式放大（方案 C） + 文本垂直居中修复
- Settings：实现 step slider 基础组件；接入 FOV/bobbing/speedlines/env 的实时应用

### v2.1（你本次要求的完整形态）

- 完整预设表落地（Cinematic/Arcade/Default）
- Advanced(Seed) 交互稿落地（折叠 + 警告 + worldgen preset + 摘要展示）
- Create/Reset payload 扩展：`{ seed, terrainParams, treeParams }`

---

## 12. 验收标准（v2.1）

- **UI**
  - PC：菜单视觉约 1.2x
  - 小屏：不溢出，按钮宽度受控
  - 按钮文字垂直居中
- **Settings**
  - Preset：Default/Cinematic/Arcade 能一键切换，并把对应数值写入（立即生效）
  - Slider：按 step 离散变化，松手时才应用（避免频繁抖动）
- **World Setup**
  - Advanced 默认折叠
  - “仅新建世界生效”提示固定可见
  - 改动 worldgen 参数只影响 Create/Reset，不影响 Continue
  - 用不同 worldgen preset 创建新世界，地形/树差异可见
