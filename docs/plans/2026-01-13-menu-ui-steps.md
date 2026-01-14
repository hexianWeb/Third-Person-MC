# Menu UI（Main/Loading/Pause/Settings）Step-by-Step Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在保持 Three.js 场景作为动态背景（方案 A）的前提下，实现 MC 风格的菜单系统：Loading、Main Menu（Root/World Setup + seed 纯数字）、ESC Pause Menu、Settings（替代 tweakpane），并与输入/指针锁/暂停/世界重建联动。

**Architecture:** Vue（UI）+ Pinia（状态机）+ mitt（事件）/ Three.js（Experience 单例）。UI 仅通过 mitt/Pinia 驱动 Three.js 行为，不直接操作 Three.js 实例引用。

**Tech Stack:** Vue 3、Pinia、Tailwind、SCSS（全局 mc-button）、mitt、Three.js

---

## 约定（实现前先读一遍）

- **seed 规则**：只允许纯数字字符串（`/^\d+$/`），空值视为随机纯数字（建议范围 `0 ~ 2_000_000_000`）。
- **Main Menu 两层**：`mainMenuView = 'root' | 'worldSetup'`；seed 输入只出现在 `worldSetup`。
- **New World 覆盖确认**：仅在 `world.hasWorld===true && pendingNewWorld===true` 且在 `worldSetup` 点击 Create 时弹。
- **返回主菜单保留世界**：PauseMenu → MainMenu 只切 UI，不 destroy/reset；世界保持暂停。
- **按钮样式**：`.mc-menu/.mc-button` 做成全局 class（放 `src/scss/global.scss`），按钮背景图使用本地资源（你已把 `btn_bg.png` 放到 hub 文件夹下，最终只要统一成一个稳定路径即可）。

---

## Task 0：准备文件与资源路径（2–5 分钟）

**Files:**
- Check: `public/textures/hub/btn_bg.png`（你当前放置路径；若不一致，以你的实际为准）
- Modify: `src/scss/global.scss`

**Step 0.1：确定按钮背景图最终路径**
- 选择一个稳定的公开路径（推荐：`/textures/hub/btn_bg.png`）
- 记下来，后续 `.mc-button` 的 `background: url(...)` 使用它

**Step 0.2：把 mc-button 样式落到全局**
- 在 `src/scss/global.scss` 写入 `.mc-menu/.mc-button` 的全局样式，缺少的数值请根据情况补全

```css
/* Minecraft Style Button */
.mc-button {
	height: var(--btn-size);
	width: calc(var(--btn-size) * 10);
	cursor: pointer;
	overflow: hidden;
	white-space: nowrap;
	user-select: none;

	background: #999 url('/textures/hub/bgbtn.png') center / cover;
	image-rendering: pixelated;
	border: 2px solid #000;
	
	/* Mouse over */
	&:hover .title {
		background-color: rgba(100, 100, 255, .45);
		text-shadow: 2px 2px #202013CC;
		color: #FFFFA0;
	}
	&:active .title {
		box-shadow: inset -2px -4px #0004, inset 2px 2px #FFF5;
	}
	/* Button title */
	.title {
		width: 100%; height: 100%;
		padding-bottom: .3em;
		@include flex-center-hv;
		
		color: #DDD;
		text-shadow: 2px 2px #000A;
		box-shadow: inset -2px -4px #0006, inset 2px 2px #FFF7;
	}
	/* Others */
	&.full { width: 100%; height: 100%; }
	&.lang {
		& img { width: 26px; height: 26px;}
		& .title  { padding-bottom: 0; } }
}
```



**手动验证：**
- 任意页面里临时写一个 `<div class="mc-button"><div class="title">Test</div></div>` 能呈现 MC 按钮视觉

---

## Task 1：新增 UI Store（状态机骨架）（5–15 分钟）

**Files:**
- Create: `src/vue/uiStore.js`

**Step 1.1：定义 state**
- `screen: 'loading' | 'mainMenu' | 'playing' | 'pauseMenu' | 'settings'`
- `mainMenuView: 'root' | 'worldSetup'`
- `pendingNewWorld: boolean`
- `world: { hasWorld: boolean; seed: string | null }`
- `seedDraft: string`
- `seedError: string | null`（用于 UI 提示）
- `returnTo: null | 'mainMenu' | 'pauseMenu'`
- `isPaused: boolean`

**Step 1.2：定义 actions（先空实现也行）**
- `toMainMenu({ preservePause?: boolean })`
- `toPlaying()`
- `toPauseMenu()`
- `toSettings(from: 'mainMenu' | 'pauseMenu')`
- `setSeedDraft(value: string)`
- `enterWorldSetup({ mode: 'create' | 'newWorld' })`（设置 `mainMenuView/pendingNewWorld`）
- `backToMainRoot()`

**Step 1.3：seed 校验与随机生成 helpers（写在 store 内即可）**
- `normalizeSeedDraft()`：trim
- `isSeedValidNumeric()`：`/^\d+$/`
- `getOrCreateSeedNumber()`：空则随机，非空 parseInt

**手动验证：**
- 在 Vue devtools/console 打印 store，切换 action 不报错
- 输入 seed 非数字时，能产生 `seedError`

---

## Task 2：添加 UiRoot 作为 UI 总入口（10–20 分钟）

**Files:**
- Create: `src/components/menu/UiRoot.vue`
- Modify: `src/App.vue`

**Step 2.1：在 `App.vue` 挂载 UiRoot**

- `UiRoot` 放在 canvas 之上、其他 HUD 之上（高 z-index）

**Step 2.2：UiRoot 做 screen 分发**

- `loading` → `LoadingScreen`
- `mainMenu` → `MainMenu`（内部再分 root/worldSetup）
- `pauseMenu` → `PauseMenu`
- `settings` → `SettingsMenu`

**Step 2.3：统一遮罩层**

- 在 UiRoot 中提供统一的背景遮罩（main/pause/settings 用，loading 用更深）

**手动验证：**

- 切换 `uiStore.screen` 时页面正确切换
- Three.js 画面仍在背后可见（动态背景）

---

## Task 3：实现 LoadingScreen（占位版本）（5–15 分钟）

**Files:**
- Create: `src/components/menu/LoadingScreen.vue`

**Step 3.1：做一个居中的 Loading UI**
- 文案：`Loading...`
- 进度：先用占位（`0%`），后续再接资源事件

**Step 3.2：资源 ready 切 Main Menu（先用现有 mitt）**
- 订阅 `core:ready`（mitt）：收到后 `uiStore.screen='mainMenu'` 且 `mainMenuView='root'`

**手动验证：**
- 首次进入先看到 Loading，资源加载完成自动进入 Main Menu

---

## Task 4：实现 MainMenu（Root + Logo + mc-menu 布局）（20–40 分钟）

**Files:**
- Create: `src/components/menu/MainMenu.vue`
- Ensure asset: `/textures/hub/logo.png`（你已添加的 logo）

**Step 4.1：布局外层（不改 mc-menu grid）**

- 外层：纵向 flex / grid，居中，对 Logo 与按钮区域设置 `gap`
- Logo：`max-width: min(720px, 92vw)`，`image-rendering: pixelated`
- 按钮区域：直接使用 `.mc-menu`

**Step 4.2：Root 视图按钮映射（按 hasWorld）**

- `hasWorld=false`：
  - 1: Create World（进入 worldSetup，mode=create）
  - 2: Settings（toSettings('mainMenu')）
  - 3: How to Play（先占位/弹窗/后续页面）
- `hasWorld=true`：
  - 1: Continue（toPlaying；不改 seed，不 reset）
  - 2: New World（进入 worldSetup，mode=newWorld）
  - 3: Settings
  - 4L/4R：How to Play / Credits（可选占位）

**手动验证：**
- 两种态按钮显示正确（可临时手动改 `hasWorld`）
- Logo 不挤压按钮，按钮仍保持原始 mc-menu 尺寸与居中

---

## Task 5：实现 WorldSetup（seed 输入 + Random/Create/Back）（20–40 分钟）

> 这一部分可以写在 `MainMenu.vue` 内部（用 `v-if mainMenuView`），或拆成 `WorldSetup.vue`。优先不拆分，减少文件数。

**Files:**
- Modify: `src/components/menu/MainMenu.vue`
- Modify: `src/vue/uiStore.js`

**Step 5.1：seed 输入框（纯数字）**
- 输入框只允许数字（`inputmode="numeric"`、`pattern="\\d*"`），并在 `@input` 时过滤非数字（或保留原样但校验报错）
- 显示 `seedError`（红色像素字）

**Step 5.2：Random Seed 按钮**
- 点击生成一个随机纯数字 seed（范围 `0 ~ 2_000_000_000`），写入 `seedDraft`，清空 `seedError`

**Step 5.3：Back 按钮**
- 返回 Root：`mainMenuView='root'`，并重置 `pendingNewWorld=false`

**Step 5.4：Create 按钮**
- 校验 seed；无效则提示并 return
- 若 `pendingNewWorld=false`：直接发 `game:create_world({ seed })`
- 若 `pendingNewWorld=true`：打开覆盖确认弹窗（下一 Task）

**手动验证：**
- seed 非数字时 Create 被阻止并提示
- seed 为空时 Random 或 Create 能得到一个纯数字 seed

---

## Task 6：实现覆盖确认弹窗（MC Dialog）（20–40 分钟）

**Files:**

- Modify: `src/components/menu/MainMenu.vue`
-（可选）Modify: `src/scss/global.scss`（补充 dialog 面板 class）

**Step 6.1：弹窗结构**
- 全屏遮罩（阻止点击穿透）
- 居中面板：Title + Body（含 Seed 展示）+ 两个按钮（Cancel/Confirm）
- 按钮复用 `.mc-button`，底部并排（可仿 `.double` 布局）

**Step 6.2：交互规则**
- 默认聚焦 Cancel
- 点击遮罩 / ESC → Cancel
- Enter：仅当 Confirm 聚焦时才 Confirm

**Step 6.3：Confirm 行为**
- 发 `game:reset_world({ seed })`
- 关闭弹窗
- `world.seed = seed`（store 更新）
- 进入 `playing`（并在按钮点击链路内请求 pointer lock）

**手动验证：**
- `pendingNewWorld=true` 时 Create 才弹窗；`pendingNewWorld=false` 不弹
- Cancel 不会触发 reset
- Confirm 才触发 reset

---

## Task 7：实现 PauseMenu（ESC 打开、按钮逻辑）（20–40 分钟）

**Files:**
- Create: `src/components/menu/PauseMenu.vue`
- Modify: `src/js/utils/input.js`
- Modify: `src/components/menu/UiRoot.vue` 或 `src/vue/uiStore.js`

**Step 7.1：InputManager 支持 ESC**
- `keydown` 捕获 `Escape`：`emitter.emit('ui:escape')`

**Step 7.2：UI 侧处理 ui:escape（按优先级）**
- `settings`：返回 `returnTo`
- `pauseMenu`：Resume → `playing`
- `playing`：进入 `pauseMenu`
- 其他：忽略

**Step 7.3：PauseMenu 按钮**
- Resume
- Main Menu（保留世界：切到 mainMenuView='root'，`isPaused=true` 保持）
- Settings（from=pauseMenu）

**手动验证：**
- playing 按 ESC 打开 pauseMenu；再按 ESC 关闭回 playing
- pauseMenu 点 Main Menu 回主菜单，Continue 可用，世界未重建

---

## Task 8：指针锁与暂停联动（15–30 分钟）

**Files:**
- Modify: `src/js/utils/pointer-lock.js`（如果需要监听 mitt）
- Modify: `src/js/experience.js` 或 `src/components/menu/*`（UI 发事件）

**Step 8.1：Pause 时退出 pointer lock**
- 当进入 `pauseMenu/mainMenu/settings`：发送 `ui:pause-changed(true)`（或直接发 `ui:request_exit_pointer_lock`）
- Three.js 侧收到后调用 `pointerLock.exitLock()`

**Step 8.2：Resume/Continue/Create 时请求 pointer lock**
- 只能由用户手势触发：在按钮点击 handler 内调用 `pointerLock.requestLock()`（或发 `game:request_pointer_lock`，由 Three.js 执行）

**手动验证：**
- 打开菜单后鼠标解锁
- 点击 Resume/Continue 后需要点击 canvas 或按钮触发锁定（按浏览器策略表现即可）

---

## Task 9：暂停门禁（Experience.update 入口）（15–30 分钟）

**Files:**
- Modify: `src/js/experience.js`
-（可选）Create: `src/js/utils/ui-bridge.js`（如果你想把 Pinia 与 Three 的耦合集中）

**Step 9.1：实现轻暂停**
- `isPaused === true` 时跳过 `world.update()` / `camera.update()`（保留 `renderer.update()` 让画面静止但可渲染）

**手动验证：**
- 打开 pauseMenu 后玩家不再移动/不再响应输入（可通过视觉或 console 验证）

---

## Task 10：世界覆盖重建（seed 注入）（30–90 分钟）

**Files:**
- Modify: `src/js/experience.js`（监听 `game:create_world` / `game:reset_world`）
- Modify: `src/js/world/world.js`（增加 `reset({ seed })`）
- Modify: `src/js/world/terrain/chunk-manager.js`（允许构造注入 seed）
- Modify: `src/js/config/chunk-config.js`（如需把 seed 从常量变为可配置来源）

**Step 10.1：Experience 监听事件**
- 监听 `game:create_world`：首次创建/或直接调用 `this.world.reset({ seed })`
- 监听 `game:reset_world`：调用 `this.world.reset({ seed })`

**Step 10.2：World.reset({ seed }) 的最小实现**
- destroy 旧的 player/cameraRig/chunkManager/交互模块（参考现有 `destroy()` 顺序）
- 用新 seed 初始化新的 chunkManager（或让 chunkManager 支持 setSeed+rebuild）
- 触发初始 grid 生成
- 重建 player/cameraRig/environment/interaction

**Step 10.3：确保 seed 真正影响生成**
- chunkManager/terrain 生成器使用传入 seed（而不是写死的 `1265`）

**手动验证：**
- 用不同 seed 创建世界，地形分布应可见差异
- New World 覆盖后世界确实变化，且不会残留旧 chunk

---

## Task 11：SettingsMenu（替代 tweakpane 的最小闭环）（30–90 分钟）

**Files:**
- Create: `src/components/menu/SettingsMenu.vue`
- Modify: `src/js/renderer.js`（监听 settings 事件并应用 bloom 等）
- Modify: `src/js/config/shadow-config.js`（保持现有 `shadow:quality-changed` 事件）
- Modify: `src/vue/uiStore.js`

**Step 11.1：先做 3 个最有价值设置（满足验收）**
- Bloom strength（slider 或 +/-）
- Shadow quality（low/medium/high）
- Mouse sensitivity（slider 或 +/-）

**Step 11.2：存储与应用**
- UI 改 store → store emit `ui:settings-changed`
- Three.js 监听并应用到运行时对象
- localStorage 持久化（仅 settings）

**手动验证：**
- 调节后立刻生效（或返回后生效，按你选择）
- 刷新页面 settings 能恢复（如果你做了持久化）

---

## 最终手动验收（串一次完整流程）

1. 进入页面 → Loading → Main Menu（Root，带 Logo，动态 3D 背景 + 遮罩）
2. Create World → World Setup → seed 空/数字都能创建 → 进入 playing
3. ESC → PauseMenu → Main Menu（保留世界且暂停）→ Continue 回 playing
4. Main Menu → New World → World Setup → Create → 弹覆盖确认 → Confirm → 世界重建
5. Settings 可打开并调节至少 3 个参数

