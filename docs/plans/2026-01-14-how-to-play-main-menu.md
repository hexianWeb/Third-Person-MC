# How to Play (Main Menu) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在主菜单（Main Menu）中新增一个 “How to Play” 分页式教学向导（纯英文），包含标题 + 教学图 + 文案 +（可选）按键表，并支持 Next/Back 翻页与页码进度。

**Architecture:** 保持现有 `uiStore.screen === 'mainMenu'` 不变，仅扩展 `uiStore.mainMenuView` 增加 `howToPlay` 子视图。新增一个独立 Vue 组件 `HowToPlay.vue` 负责渲染 5 页数据驱动内容；通过 `UiRoot.vue` 按 `mainMenuView` 分发渲染。

**Tech Stack:** Vue 3 (`<script setup>`), Pinia (`uiStore`), mitt (现有 `ui:escape`)

**Git 约定:** 本计划中所有 `git add/commit/push` 操作均由你手动执行（计划书不再包含任何 git 命令）。

---

## Non-goals（这次不做）

- 不接入 i18n（后续再改成 i18n key 驱动）
- 教学图片不包含任何 UI 文本/字幕/说明标签（由标题/文案承载信息）；**允许少量按键作为画面道具出现**（例如键帽、鼠标按键造型），但不得以“HUD/悬浮标注”的形式呈现
- 不做“训练场/进入游戏内教学”（只做菜单页）

---

## UI 规格（How to Play 页面长什么样）

### Layout（每一页）

- **Header**
  - 左侧：`How to Play`
  - 右侧：页码 `X / 5`
- **Main**
  - 一个 `mc-panel` 风格内容盒子，内部上方为教学图（16:9），下方为 2~4 行短句说明
  - 右侧或底部可放一张简短按键表（Action / Key）
- **Footer**
  - 两个半宽按钮：**Back** / **Next**
  - 第 1 页：Back = `Main Menu`
  - 第 5 页：Next = `Done`

### Keyboard（可选但推荐）

- `ArrowLeft`：上一页
- `ArrowRight`：下一页
- `Escape`：退出 How to Play，回到 Main Menu Root

---

## 图片资源规范（必须在实现前写死路径与 `<img>` 元素）

### 资源目录与命名

把图片放到：

- `public/textures/hub/howto/`

命名建议（5 张）：

1. `howto_01_quickstart.png`
2. `howto_02_movement_camera.png`
3. `howto_03_combat.png`
4. `howto_04_build_edit.png`
5. `howto_05_tips_ui.png`

### 图片尺寸建议（给 nano banana pro 的约束）

- **推荐分辨率**：1280×720（16:9）
- **可接受**：1920×1080（16:9）
- **风格**：像素/方块感强，画面不包含任何语言文字
- **安全区**：四周留 5% 空白，避免在小屏裁切时损失关键信息

### 前端 `<img>` 元素要求（在组件里固定）

- `src`：如 `/textures/hub/howto/howto_01_quickstart.png`
- `alt`：英文（可被 i18n 替换，但本次先写死英文）
- `loading="lazy"`（可选）
- 样式：
  - `width: 100%`
  - `height: auto`
  - `image-rendering: pixelated`
  - `display: block`
  - 容器用 `aspect-ratio: 16 / 9` + `object-fit: cover`（或 `contain`，二选一，推荐 `cover`）

### Alt 文案（纯英文）

- Quick Start：`alt="Quick start illustration"`
- Movement & Camera：`alt="Movement and camera illustration"`
- Combat：`alt="Combat basics illustration"`
- Build / Edit：`alt="Build and edit illustration"`
- Tips & UI：`alt="Tips and UI illustration"`

---

## 教学图内容规格 + nano banana pro 生成提示词（必须遵守：图片不含文字，但允许实体按键图标）

> 目标：图片只表达“场景/动作/关系/氛围”，不出现任何 UI 文本/字幕/说明标签（不出现 HUD、提示框、箭头标注、悬浮说明）。教学信息由页面标题与正文英文文案承载。
>
> **允许例外（为了教学更直观）**：部分页面允许出现**少量实体按键/键帽/鼠标按键**作为“场景道具”（不是 UI），用于暗示操作。尽量避免大段文字；如果必须出现字符，仅限**键帽上**的少量字符（例如 `W/A/S/D`、`Shift`、`Tab`、`V`、`Q`、`C`、`Esc`），且不能像 UI 标注一样悬浮在角色旁边。

### 全局约束（所有图片通用）

- **主角统一**：主角一定是 Steve（Minecraft 经典角色模型）
- **画幅**：16:9（建议 1280×720 或 1920×1080）
- **风格**：Minecraft 方块/像素质感 + 轻魂系氛围（更偏“预热体验”，不要太卡通）
- **视角**：第三人称为主（与本项目 Third-Person 一致）
- **清晰主体**：画面中央主体明确，边缘留 5% 安全区
- **禁止元素（强约束）**：UI 文本、HUD、提示框、字幕、说明标签、logo、水印、标注箭头、悬浮按键提示
- **允许元素（受限）**：实体按键/键帽/鼠标按键作为场景道具；如出现字符，仅限少量键帽字符（不出现段落文字/说明）
- **一致性**：5 张图保持同一套主角、同一套世界材质风格、同一套色彩倾向（建议：冷灰/青蓝为基底，点缀紫色传送门与红色战斗氛围）

### 多个按键的呈现方式：四格漫画（2×2 分镜）

> 当一张图需要同时表达 **多个按键/操作**（例如移动页同时包含 `WASD`、`Shift`、`V`、`Tab`），统一使用 **“2×2 四格漫画”** 的构图，把信息拆开讲清楚。

- **画面结构**
  - 单张图仍是 **16:9**，但在画面内部做 **2×2 分格**（四个小画面）。
  - 分格线建议是 **细边框/黑色描边/暗色分隔条**（像漫画格子），不要做成 UI 面板。
  - 四格之间的镜头语言要统一（同一套材质、同一套光照、同一位 Steve），但每格的动作/构图要明显不同。
- **每一格只表达一件事**
  - 一格 = 一个动作语义 +（可选）一个实体按键道具。
  - 按键道具必须是“物件”（键帽/鼠标按键造型），不要贴在屏幕上当成 HUD。
  - 如必须出现字符，只允许出现在键帽表面（例如 `W`/`Shift`/`V`/`Tab`），不要出现解释性句子。
- **信息密度与可读性**
  - 每格主体清晰，背景不要太花；动作一眼能懂（跑、潜行、切换视角、格挡等）。
  - 键帽道具数量越少越好：每格 **0~1 个**为最佳。

### 图 1：Quick Start（`howto_01_quickstart.png`）

- **画面内容（必须包含）**
  - 超平坦草地（Flatland）+ 传送门阵列（3 个门的感觉，至少可见 1~2 个）
  - 玩家角色（第三人称背影）朝向传送门，具有“将要进入冒险”的引导感
  - 远处暗色地牢入口氛围/雾（暗示进入地牢）
- **画面内容（不要出现）**
  - 任何文字、HUD、提示框
- **nano banana pro 提示词（中文）**
  - `第三人称视角，Minecraft 方块风格的超平坦草地场景，玩家角色站在画面前景中央背对镜头，前方有发光的紫色传送门框架（可见1-2个传送门），远处有雾气与更暗的地牢入口氛围，整体光照偏冷，体积雾，像素质感清晰，电影感构图，16:9，高细节，画面干净无HUD无UI无水印无字幕无说明标签`
- **反向提示词（建议）**
  - `HUD, UI, 字幕, 说明标签, watermark, logo, 标注箭头, 悬浮按键提示`

### 图 2：Movement & Camera（`howto_02_movement_camera.png`）

- **画面内容（必须包含）**
  - 玩家移动的动态感（跑动姿势、轻微运动模糊即可）
  - 构图强调“第三人称跟随相机”（角色占画面 1/3~1/2）
  - 场景元素暗示“左右切换相机侧”的空间（例如左侧有墙/柱子遮挡，右侧更开阔）
- **建议构图（四格漫画，推荐）**
  - 四个img分别表达（每img只做一项）：
    - **img1：Move**（跑动/位移语义）+ 可选 `W` 或 `A/S/D` 单个键帽（不要把四个字母堆在一个格子里）
    - **img2：Sprint**（更快的奔跑/冲刺语义）+ `Shift` 键帽
    - **img3：Sneak**（低姿态/更稳的移动语义）+ `V` 键帽
    - **img4：Switch Camera Side**（镜头左右切换语义，例如从左肩到右肩）+ `Tab` 键帽
- **nano banana pro 提示词（中文）**
  - `第三人称跟随相机视角，Minecraft 方块风格，同一个Steve主角与统一材质光照；每格只表达一个动作语义：移动、冲刺、潜行、切换相机侧；每格可在画面前景放一个实体键帽道具（W或A/S/D其一，Shift，V，Tab），键帽是物件不是HUD；场景可为草地通道或地牢入口走廊，冷色光照，像素质感清晰，轻微运动模糊，16:9，画面干净无HUD无UI无水印无字幕无说明标签，无标注箭头无悬浮提示`
- **反向提示词（建议）**
  - `HUD, UI, 字幕, 说明标签, 标注箭头, 悬浮提示, 水印, logo`

### 图 3：Combat Basics（`howto_03_combat.png`）

- **画面内容（必须包含）**
  - 玩家与敌人 1v1 近战交战（空间关系明确）
  - 攻击动作瞬间（挥砍/拳击/重击都可），带少量火花/能量冲击
  - 氛围更暗、对比更强，点缀红色/橙色冲击光
- **建议构图（）**
  - 如果想把多个操作放同一张图里，推荐也用 2×2 四格：
    - **img1：Light Attack**（轻攻击瞬间）+ 鼠标左键造型物件（可选）
    - **img2：Heavy Attack**（重攻击瞬间）+ 鼠标右键造型物件（可选）
    - **img3：Block**（举盾/格挡语义）+ `C` 键帽
    - **img4：Recovery**（拉开距离/准备下一轮）不放按键也可以（保证四格信息不拥挤）
- **nano banana pro 提示词（中文）**
  - `Minecraft 方块风格的地牢走廊，同一个Steve主角与统一材质光照；四格分别表达轻攻击、重攻击、格挡、拉开距离/恢复节奏；可在对应格子前景加入实体鼠标按键造型物件（左键/右键）与C键帽（物件不是HUD）；环境更暗对比更强，少量红色/橙色战斗氛围光，体积雾与粒子，像素质感清晰，16:9，画面干净无HUD无UI无水印无字幕无说明标签，无伤害数字无血条文字，无标注箭头无悬浮提示`
- **反向提示词（建议）**
  - `HUD, UI, 字幕, 说明标签, 血条文字, 伤害数字, 标注箭头, 悬浮提示, 水印`

### 图 4：Build / Edit（`howto_04_build_edit.png`）

- **画面内容（必须包含）**
  - 玩家进行“编辑/建造”的动作语义：正在放置/移除方块的瞬间
  - 画面中能看出被修改的方块区域（小坑洞或凸起结构）
  - 氛围偏明亮（更“调整/创造”）
- **建议构图（**
  - 如果希望“编辑/建造”更直观，也可以做 2×2 四格：
    - **img1：Toggle Edit Mode** + `Q` 键帽（切换编辑模式的语义）
    - **img2：Remove Block**（挖掉一个方块形成小坑）
    - **img3：Place Block**（放置方块形成小台阶/掩体）
    - **img4：Result**（展示编辑后的路径/高低差）
- **nano banana pro 提示词（中文）**
  - `inecraft 方块风格的草地场景，同一个Steve主角与统一材质光照；四格分别表达切换编辑模式、移除方块、放置方块、展示编辑后的路径/高低差；可在切换编辑模式那一格加入实体Q键帽（物件不是HUD）；光照更明亮，像素质感清晰，16:9，画面干净无HUD无UI无水印无字幕无说明标签，无标注箭头无悬浮提示`
- **反向提示词（建议）**
  - `HUD, UI, 字幕, 说明标签, 标注箭头, 悬浮提示, 水印, logo`

### 图 5：Tips & UI（`howto_05_tips_ui.png`）

- **画面内容（必须包含）**
  - 静态总结氛围：玩家站在关键地点（传送门旁或地牢入口前）
  - 轻微暗角/雾，营造“准备就绪/总结提示”的情绪
- **可选增强**
  - Page5 是总结页，
    - **img1：Sprint reposition**（冲刺换位）+ `Shift` 键帽（可选）
    - **img2：Sneak control**（潜行更稳）+ `V` 键帽（可选）
    - **img3：Switch camera side**（切换视角侧）+ `Tab` 键帽（可选）
    - **img4：Exit menu**（随时退出）+ `Esc` 键帽（可选）
- **nano banana pro 提示词（中文）**
  - `，Minecraft 方块风格，同一个Steve主角与统一材质光照；四格分别表达冲刺换位、潜行控制、切换相机侧、随时退出菜单；可在对应格子前景加入实体键帽道具（Shift，V，Tab，Esc，可选）；整体仍保持总结氛围（轻微暗角与体积雾，冷色光照），像素质感清晰，16:9，画面干净无HUD无UI无水印无字幕无说明标签，无标注箭头无悬浮提示`
- **反向提示词（建议）**
  - `HUD, UI, 字幕, 说明标签, 提示框, 标注箭头, 悬浮提示, 水印, logo`

## 内容模型（纯英文，后续便于 i18n 改造）

建议 5 页（数据驱动 `pages[]`），每页字段：

- `id`：稳定标识
- `title`：英文标题
- `imageSrc`：图片路径（固定到 `/textures/hub/howto/...png`）
- `body`：英文短句数组（2~4 条）
- `keybinds`：`[{ action: string, key: string }]`（动作/按键）
- `illustrationLayout`：固定为 `comic2x2`（所有页面统一 2×2 四格图 / 四格占位符）

> 说明：在图片未就绪的阶段，先用 `div` 做 **2×2 四格占位符**，把 How to Play 的**页面元素与交互**先搭出来；后续再把占位符替换为 2×2 四格图片（或 4 张小图拼成四格）。

### `pages[]` 草案（极简指令风 / 纯英文）

> 目标：每页 2~4 句短指令句，动词开头；信息放在文案里，图片不含文字。

```js
const pages = [
  {
    id: 'quickstart',
    title: 'Quick Start',
    imageSrc: '/textures/hub/howto/howto_01_quickstart.png',
    illustrationLayout: 'comic2x2',
    body: [
      'Pick a portal and step in.',
      'Explore fast, fight smart, and stay moving.',
      'If you get lost, come back and reset your run.',
    ],
    keybinds: [{ action: 'Open Menu', key: 'Esc' }],
  },
  {
    id: 'movement-camera',
    title: 'Move & Camera',
    imageSrc: '/textures/hub/howto/howto_02_movement_camera.png',
    illustrationLayout: 'comic2x2',
    body: [
      'Move with WASD or Arrow Keys.',
      'Hold Shift to sprint.',
      'Hold V to sneak for control.',
      'Press Tab to switch camera side.',
    ],
    keybinds: [
      { action: 'Move', key: 'W/A/S/D (or Arrow Keys)' },
      { action: 'Jump', key: 'Space' },
      { action: 'Sprint', key: 'Shift' },
      { action: 'Sneak', key: 'V' },
      { action: 'Switch Camera Side', key: 'Tab' },
    ],
  },
  {
    id: 'combat',
    title: 'Combat Basics',
    imageSrc: '/textures/hub/howto/howto_03_combat.png',
    illustrationLayout: 'comic2x2',
    body: [
      'Left click for a light attack.',
      'Right click for a heavy attack.',
      'Press C to block and time your defense.',
    ],
    keybinds: [
      { action: 'Light Attack', key: 'Mouse Left' },
      { action: 'Heavy Attack', key: 'Mouse Right' },
      { action: 'Block', key: 'C' },
    ],
  },
  {
    id: 'build-edit',
    title: 'Build / Edit',
    imageSrc: '/textures/hub/howto/howto_04_build_edit.png',
    illustrationLayout: 'comic2x2',
    body: [
      'Press Q to toggle block edit mode.',
      'Place or remove blocks to shape your path.',
      'Use edits to gain height, cover, or escape routes.',
    ],
    keybinds: [{ action: 'Toggle Block Edit Mode', key: 'Q' }],
  },
  {
    id: 'tips-ui',
    title: 'Tips & UI',
    imageSrc: '/textures/hub/howto/howto_05_tips_ui.png',
    illustrationLayout: 'comic2x2',
    body: [
      'Stay calm: move, hit, reset.',
      'Sprint to reposition and commit when it’s safe.',
      'Sneak (V) for tighter control when you need it.',
      'Press Esc anytime to return to the menu.',
    ],
    keybinds: [
      { action: 'Open Menu', key: 'Esc' },
      // Optional page navigation:
      // { action: 'Prev/Next Page', key: 'ArrowLeft / ArrowRight' },
    ],
  },
]
```

按键信息以当前实现为准（来自 `src/js/utils/input.js`）：

- Move：`W/A/S/D`（also `Arrow Keys`）
- Jump：`Space`
- Sprint / Modifier：`Shift`
- Sneak：`V`
- Switch Camera Side：`Tab`
- Light Attack：`Mouse Left`
- Heavy Attack：`Mouse Right`
- Block：`C`
- Toggle Block Edit Mode：`Q`
- Menu：`Esc`

---

## 子计划 A：先用 div 占位搭出 How to Play 页面元素（图片未就绪也可验收）

**目标：** 在不依赖任何图片资源的情况下，先把 How to Play 的 **Layout / 翻页 / 页码 / 按键表 / 键盘操作** 全部跑通；图片生成完成后再“替换占位符为 `<img>`”，不改交互。

**占位符规则：**

- 所有页面统一显示一个 16:9 的 **2×2 四格**占位（四个 `div` + 分割线），模拟未来“四格漫画图”
- 占位符上可以用纯 CSS 做出简洁层次（渐变/噪点/边框），**不要放任何文字**（保持与最终图一致的“无 UI 文本”原则）

**验收点（不用等图片）：**

- 进入 How to Play 后能看到：Header（标题 + `X/5`）、Main（占位画面 + 文案 + 按键表）、Footer（Back/Next）
- 5 个页面 **全部**显示四格占位
- Next/Back 不越界；第 1 页 Back 回主菜单；第 5 页 Done 回主菜单
- `Esc` 返回主菜单 root；（若做）`←/→` 翻页

---

## Task 1: 添加 How to Play 组件（数据驱动 + 翻页）

**Files:**
- Create: `src/components/menu/HowToPlay.vue`
- (Optional) Create: `src/components/menu/ui/McKeybindTable.vue`（如果不想在 `HowToPlay.vue` 里写表格）

**Step 1: 写一个最小页面骨架（无状态）**

- 先硬编码一个页面（标题 + **div 画面占位符** + 2 行文字 + Footer 按钮），确保样式正确。
- 占位符统一为：16:9 四格占位（2×2）
- 等你用 nano banana pro 生成图片后，再把占位符替换成 `<img>`（或四格图），不改布局与交互。

**Step 2: 加入 `pages[]` 数组（5 页数据）**

- 用纯英文文案（短句），图片路径按“图片资源规范”写死。
- `currentIndex` 初始为 0。

**Step 3: 实现 Next/Back**

- Back:
  - `currentIndex > 0` → `currentIndex--`
  - `currentIndex === 0` → 触发退出（调用 `ui.backToMainRoot()` 或 `ui.exitHowToPlay()`）
- Next:
  - `currentIndex < pages.length - 1` → `currentIndex++`
  - `currentIndex === pages.length - 1` → `Done`（退出）

**Step 4: 实现页码进度**

- Header 右侧显示：`${currentIndex + 1} / ${pages.length}`

**Step 5: 键盘支持（可选但推荐）**

- 监听 `keydown`：
  - `ArrowLeft` → Back
  - `ArrowRight` → Next

**Step 6: 基础可访问性**

- `<img>` 必须有 `alt`
- Next/Back 按钮保持可聚焦

---

## Task 2: 扩展 uiStore 支持 howToPlay 视图 + ESC 统一退出

**Files:**
- Modify: `src/vue/uiStore.js`

**Step 1: 扩展 `mainMenuView` 注释与可选值**

- 从 `'root' | 'worldSetup'` 改为 `'root' | 'worldSetup' | 'howToPlay'`

**Step 2: 新增 action：进入/退出 How to Play**

- `toHowToPlay()`：`mainMenuView = 'howToPlay'`
  - 同时建议重置 `howToPlayPageIndex`（如果页码状态放 store 里）或留给组件内部处理
- `exitHowToPlay()`：回到 `root`

（实现取舍：页码可以放组件本地 state；这样 store 更干净。）

**Step 3: 更新 `handleEscape()`**

- 当 `screen === 'mainMenu'` 且 `mainMenuView !== 'root'` 时：
  - 统一回到 `root`
  - 这样 `worldSetup` 与 `howToPlay` 都能按 ESC 退出

**Step 4: Run lint（可选）**

Run:
```
pnpm lint
```

---

## Task 3: 接入渲染分发（UiRoot）+ 启用 MainMenu 按钮

**Files:**
- Modify: `src/components/menu/UiRoot.vue`
- Modify: `src/components/menu/MainMenu.vue`

**Step 1: 在 UiRoot 引入并渲染 HowToPlay**

- `import HowToPlay from './HowToPlay.vue'`
- 当 `ui.screen === 'mainMenu'`：
  - `ui.mainMenuView === 'howToPlay'` → 渲染 `HowToPlay`
  - 其它情况保持现状（`MainMenu` 负责 root/worldSetup 也可以，但建议 `UiRoot` 负责分发更清晰）

**Step 2: MainMenu 启用 “How to Play”**

- 把 Root 页里的 `How to Play` 按钮从 `disabled` 改为可点击
- 点击调用：`ui.toHowToPlay()`
- World exists / World not exists 两种布局里都要处理（当前两个地方都写了 disabled）

**Step 3: 目测回归**

- 启动 `pnpm dev`，进入主菜单：
  - 点击 How to Play → 进入分页
  - Next/Back 正常
  - ESC 返回主菜单 root

---

## Task 4: 样式与主题（每页主题风格的最小实现）

**Files:**
- Modify: `src/components/menu/HowToPlay.vue`（scoped 样式）
- (Optional) Modify: `src/scss/global.scss`（如果需要共用的 `.mc-panel` 变体）

**Step 1: 主题字段**

- 给 `pages[]` 加 `theme`：例如 `grass | camera | combat | build | ui`

**Step 2: 每页主题风格（最小可行）**

- 用容器 class：`howto theme--combat` 之类
- 只改：边框色 / 背景透明度 / 标题色（不要大改现有 UI 基座）

**Step 3: 图片容器样式（16:9）**

- 做一个 `figure` 容器：
  - `aspect-ratio: 16 / 9`
  - `overflow: hidden`
  - `border: 2px solid #555`
  - `background: #111`
- `<img>`：
  - `width: 100%`
  - `height: 100%`
  - `object-fit: cover`
  - `image-rendering: pixelated`

---

## Task 5: 图片资源落地（你用 nano banana pro 输出后替换）

**Files:**
- Add (binary): `public/textures/hub/howto/howto_01_quickstart.png`
- Add (binary): `public/textures/hub/howto/howto_02_movement_camera.png`
- Add (binary): `public/textures/hub/howto/howto_03_combat.png`
- Add (binary): `public/textures/hub/howto/howto_04_build_edit.png`
- Add (binary): `public/textures/hub/howto/howto_05_tips_ui.png`

**Step 1: 放入图片文件**

- 确保图片不含文字
- 确保 16:9

**Step 2: 目测确认**

- 在 How to Play 每页确认：
  - 图片不糊、不拉伸
  - 小屏也能看清主体（安全区生效）

---

## Task 6: 手动验收（个人项目，不写 Playwright）

**Step 1: 本地运行**

Run:
```
pnpm dev
```

**Step 2: 走一遍核心流程**

- 进入主菜单 root（无 world / 有 world 两种布局都要覆盖）：
  - 点击 **How to Play** 可以进入向导
- How to Play 向导内：
  - 页码显示正确：`1/5` → `5/5`
  - **Next** / **Back** 不越界
  - 第 1 页 **Back** 返回主菜单 root
  - 第 5 页 **Done** 返回主菜单 root
  - 按 **ESC** 直接返回主菜单 root
  - （若实现）方向键 `←/→` 翻页正常

---

## Manual QA Checklist（合并前）

- [ ] Main Menu Root 能点击 **How to Play**（无 world / 有 world 两种布局都可点击）
- [ ] How to Play：页码显示正确（`1/5`…`5/5`）
- [ ] Next/Back 翻页不会越界
- [ ] 第 1 页 Back 返回主菜单 root
- [ ] 第 5 页 Done 返回主菜单 root
- [ ] `ESC` 从 How to Play 返回主菜单 root
- [ ] ArrowLeft/ArrowRight（若做了）可翻页

---

## Plan complete — execution handoff

计划已写入：`docs/plans/2026-01-14-how-to-play-main-menu.md`

后续执行时：你负责 git 操作（add/commit/push 等），我负责按任务逐步实现与自检。
