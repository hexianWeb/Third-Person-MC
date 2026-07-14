# WebGPURenderer 迁移 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 Third-Person-MC 主渲染后端从 `WebGLRenderer` + `EffectComposer` 渐进迁移到 `WebGPURenderer` + TSL 节点材质/后处理，并保留可验证的 WebGL 回退路径。

**Architecture:** WebGPU 优先、WebGL 自动回退；先做「渲染器可跑」PoC（无自定义 GLSL），再按风险高低迁移后处理与材质。不一次全量重写。`three-custom-shader-material` 与经典 `ShaderMaterial` 在 WebGPU 路径下必须改为 NodeMaterial/TSL。

**Tech Stack:** Three.js `three/webgpu` + `three/tsl` | Vite 5 + `vite-plugin-glsl`（过渡期保留）| 移除/替换 `three-custom-shader-material`

**相关文档:**
- 既有详细草案（部分 API 已过时，以本文为准）：`docs/plans/2026-03-03-webgpu-renderer-migration.md`
- Speed Lines TSL 专项（若存在/待补）：`docs/plans/2026-06-29-speed-lines-tsl-migration.md` — **并入本计划 Phase 2.2，不单独并行全量改主干**
- Skill：`@webgpu-threejs-tsl`、`@vtj-shader-development`

**现状依赖（2026-07-14 审计）:** `three@^0.183.2` | `vite@^5.4.0` | `vite-plugin-glsl@^1.3.0` | `three-custom-shader-material@^6.4.0`

---

## 0. 需求假设（已确认 2026-07-14）

| # | 假设 | 用户确认 |
|---|---|---|
| A | 后端策略 | **100% WebGPU-only**（非 WebGL 回退；init 后非 WebGPU backend 则 fail） |
| B | 材质策略 | **全面上 TSL/NodeMaterial**（不保留 ShaderMaterial 主路径） |
| C | 范围 | GlassWall / Grid **排除**；后处理与材质全量迁移分后续 PR |
| D | three 版本 | **允许**升到 latest（PoC 已升至 `0.185.1`） |
| E | 交付节奏 | Phase 1 PoC ✅ → **Phase 2 后处理 ✅**（本轮）；Phase 3+ 后续 |

---

## 1. 当前渲染栈摘要（审计）

### 1.1 核心链路

| 职责 | 路径 | 现状 |
|---|---|---|
| 单例编排 | `src/js/experience.js` | 同步构造 `Camera` → `Renderer` → `World`；`core:tick` 驱动 update |
| 主渲染器 | `src/js/renderer.js` | `THREE.WebGLRenderer`；`shadowMap=PCF`；`ACESFilmicToneMapping`；`autoClear=false` |
| 后处理 | 同上 | `EffectComposer`：RenderPass → UnrealBloomPass → SpeedLine ShaderPass → Gaze ShaderPass → OutputPass |
| 相机 | `src/js/camera/camera.js` + `camera-rig.js` | 第三人称 / 鸟瞰；`attachRenderer` / `onCameraSwitched` 更新 RenderPass 相机 |
| 环境光影 | `src/js/world/environment.js` + `config/shadow-config.js` | DirectionalLight 阴影；LOW/MED/HIGH 质量 |
| 地形材质 | `src/js/world/terrain/blocks-config.js` | **CSM** + AO/风动 GLSL（`MeshPhongMaterial` base） |
| 独立渲染器 | `src/js/components/skin-preview-scene.js` | 第二个 `WebGLRenderer` + CanvasTexture |

### 1.2 自定义着色器 / 材质（在用 vs 闲置）

| 组件 | 文件 | 类型 | World 接入？ | 迁移优先级 |
|---|---|---|---|---|
| Speed Lines | `renderer.js` + `shaders/speedlines/*` | ShaderPass | 是 | P0（后处理） |
| Gaze | `renderer.js` + `shaders/gaze/*` | ShaderPass | 是 | P0 |
| Bloom | UnrealBloomPass | EffectComposer | 是 | P0 |
| Terrain AO/Wind | `blocks-config.js` + `shaders/blocks/ao.*` `wind.vert.glsl` | CSM | 是 | P0（阻塞地形） |
| SkyDome | `sky-dome.js` + `shaders/sky/*` | ShaderMaterial | 是（DayCycle） | P1 |
| Fireflies | `fireflies.js` + `shaders/fireflies/*` | ShaderMaterial + Points | 是 | P1 |
| Block selection | `block-selection-helper.js` + `shaders/selection/*` | ShaderMaterial | 是 | P1 |
| Skin preview | `skin-preview-scene.js` | 独立 WebGLRenderer | Vue UI | P2 |
| Player corner preview | `renderer._renderPlayerPreview` | scissor/viewport 二次 render | 是 | P1（验证 API） |
| Grid | `grid.js` + `shaders/grid/*` | ShaderMaterial | **未接入 World** | P3 / 跳过 |
| GlassWall | `glass-wall.js` + `shaders/glass/*` | ShaderMaterial + RT | **未接入 World** | P3 / 跳过 |
| Halftone / root glsl | `shaders/halftone/*` `fragment.glsl` `vertex.glsl` | 遗留 | 未用 | 跳过 |
| Mining CSM glsl | `shaders/blocks/mining.*` | 文件存在 | **blocks-config 未 import** | 跳过或随 CSM 清理 |

### 1.3 WebGL-only / 高风险 API

| API / 模式 | 位置 | WebGPU 影响 |
|---|---|---|
| `ShaderMaterial` / `RawShaderMaterial` | 多处 | **官方明确不支持**，必须改 NodeMaterial/TSL |
| `onBeforeCompile` / CSM | `blocks-config.js` | **不支持** |
| `EffectComposer` + jsm passes | `renderer.js` | **不支持**；改 TSL `pass` + `RenderPipeline`/`PostProcessing` + `bloom` |
| `forceContextLoss()` | `renderer.js`, `skin-preview-scene.js` | 无等价；改 `dispose()` |
| `setViewport` / `setScissor` / `setScissorTest` | player preview | 通常可用，需 PoC 验证 |
| `setRenderTarget` + `RenderTarget` | `glass-wall.js`（闲置） | 路径不同，延后 |
| 大量 `InstancedMesh` | terrain / plants | 关注 WebGPU UBO/性能差异 |
| `vite-plugin-legacy` | `vite.config.js` | 与 WebGPU 目标浏览器策略可能冲突，需单独评估 |

### 1.4 官方约束（Three.js manual）

- Custom `ShaderMaterial` / `RawShaderMaterial` / `onBeforeCompile` → **必须** port 到 node materials + TSL  
- 后处理 → TSL 节点组合；**不支持** 传统 EffectComposer  
- 初始化：`await renderer.init()`；推荐 `import * as THREE from 'three/webgpu'`  
- Bloom 示例路径已变为 `three/addons/tsl/display/BloomNode.js` + `RenderPipeline`（r183+ 以官方 example 为准，勿死抄 2026-03 计划中的旧 `THREE.PostProcessing`/`bloom(scenePass)` 签名）

---

## 2. 方案对比与推荐

### 方案 A — 只换 Renderer，尽量保留 ShaderMaterial（不推荐）

- 做法：`WebGPURenderer` + 仍用现有 GLSL/`EffectComposer`
- 优点：改动面看似小  
- 缺点：**官方不支持**；后处理与自定义材质会直接失败或静默异常  
- **否决**

### 方案 B — WebGPU 优先 + WebGL 回退，分阶段 TSL（推荐）

- 做法：主路径 `WebGPURenderer`（自动/可强制 WebGL）；PoC 先标准材质直出；再迁后处理；再迁 CSM/特效  
- 优点：可回退、可分 PR、风险可控；与 Three.js 官方方向一致  
- 缺点：总工期较长；需维护一段时间双语义（GLSL 参考 + TSL 实现）  
- **采用**

### 方案 C — 100% WebGPU-only，一次全量 TSL

- 做法：无 WebGL 回退；全部着色器同期重写  
- 优点：代码最终干净  
- 缺点：Safari/旧设备/调试成本高；失败面大  
- 仅当用户明确要求「无回退」时采用；否则不选

**推荐：方案 B。** 最小可行路径 = Phase 1 PoC（WebGPU 直渲、无后处理、地形可临时降级为无 CSM 的标准材质或 forceWebGL 验证）。

---

## 3. 与 Speed Lines TSL 计划的关系

- Speed Lines 是后处理链中的自定义 ShaderPass，**无法**在 WebGPU 上单独「只迁速度线、其余仍用 EffectComposer」。
- 正确依赖顺序：
  1. Phase 1：Renderer 可跑（可无后处理）
  2. Phase 2.1：TSL scene pass + bloom
  3. **Phase 2.2：Speed Lines → TSL `Fn` 节点**（即原 2026-06-29 speed-lines 专项的交付物）
  4. Phase 2.3：Gaze → TSL
- 若仓库中尚无 `2026-06-29-speed-lines-tsl-migration.md`，以本计划 Phase 2.2 为准补齐；不必再开并行主干分支改同一文件。

---

## 4. 兼容 / 回退策略

| 层级 | 策略 |
|---|---|
| 运行时 | `WebGPURenderer` 初始化失败或 `forceWebGL: true` → WebGL2 后端（Three 内建） |
| 功能降级 | WebGPU 路径上未迁完的特效：临时关闭 pass / 用标准材质占位，避免黑屏 |
| 开发开关 | Debug / URL / settings：`rendererBackend: 'auto' \| 'webgpu' \| 'webgl'` |
| 分支 | `feat/webgpu-renderer`；main 保持 WebGL 直至 Phase 1+2 回归通过 |
| 回滚 | 保留 `renderer.js` 的 WebGL 实现直至 Phase 2 完成可用 feature flag 切换；或 revert 分支合并 |

**注意：** WebGL **回退后端**仍走 `WebGPURenderer` 的 WebGL 路径时，材质仍须是 NodeMaterial 才跨后端一致。若要「未迁 GLSL 的完整旧游戏」回退，需保留旧 `WebGLRenderer` 代码路径（双 Renderer 工厂）——这是额外成本，默认**不**做，除非用户要求「旧 ShaderMaterial 全功能 WebGL 兼容」。

本计划默认：**统一 NodeMaterial 后，WebGPU/WebGL 双后端共用同一套材质**（推荐）。

---

## 5. 分阶段交付

```text
Phase 0  环境/分支/升级 three
Phase 1  PoC：WebGPURenderer + 直渲（关后处理）+ ready 门闩
Phase 2  后处理：TSL pipeline + bloom + speed lines + gaze
Phase 3  在用材质：CSM→NodeMaterial、Sky、Fireflies、Selection
Phase 4  边缘：SkinPreview、import alias、阴影调参
Phase 5  清理 GLSL、去 CSM 依赖、E2E/性能对比
```

每阶段可独立 PR / commit；未确认假设前不开始写代码。

---

## Phase 0: 分支与依赖

### Task 0.1: 创建功能分支 — ✅ Done

- 分支：`feat/webgpu-renderer`（自 main）
- Commit：按用户要求本轮 **未** commit

### Task 0.2: 升级 three 并记录 API 基线 — ✅ Done

- `three`：`0.183.2` → **`0.185.1`**
- Phase 2 后处理 API 仍以官方 `webgpu_postprocessing_bloom`（匹配 r185）为准再锁定

---

## Phase 1: PoC — 渲染器可跑（最小可行） — ✅ Done (2026-07-14)

**验证：** `pnpm build` 通过（exit 0，~20s）。运行时需 Chrome + WebGPU；控制台应见 `[Renderer] backend=webgpu`。

**临时妥协（留给后续 PR，非本轮范围）：**
- EffectComposer / Bloom / Speed Lines / Gaze：**关闭**，直渲 `scene + camera`
- 地形 CSM AO/Wind → `MeshPhongMaterial` / 植物 `MeshLambertMaterial`
- SkyDome → `MeshBasicMaterial` 单贴图（无双贴图 mix）
- Fireflies → `PointsMaterial`
- BlockSelection → wireframe `MeshBasicMaterial`
- SkinPreview：**仍**独立 `WebGLRenderer`（TODO Phase 4）
- GlassWall / Grid：**未迁移**（按确认排除）

### Task 1.1: WebGPURenderer 异步初始化（后处理关闭） — ✅

**Files:**
- Modify: `src/js/renderer.js`
- Modify: `src/js/experience.js`（ready 门闩 / 跳过未就绪 update）

**Skills:** @webgpu-threejs-tsl

**Step 1: 写失败断言（手动清单当作验收测试）**

验收用例 `PoC-1`：
- Chrome 开启 WebGPU 时，控制台打印 backend=WebGPU
- 场景可见（允许无 bloom/速度线）
- 刷新无白屏；`ready===false` 时不 render

**Step 2: 实现最小 renderer**

```javascript
import * as THREE from 'three/webgpu'

// setInstance
this.instance = new THREE.WebGPURenderer({
  canvas: this.canvas,
  antialias: false,
  alpha: true,
  // forceWebGL: true, // 调试回退时打开
})
this.instance.toneMapping = THREE.ACESFilmicToneMapping
this.instance.shadowMap.enabled = true
this.instance.shadowMap.type = THREE.PCFShadowMap
// ... setSize / setPixelRatio / setClearColor / autoClear

async _init() {
  await this.instance.init()
  this.backendName = this.instance.backend?.isWebGPUBackend ? 'webgpu' : 'webgl'
  console.info(`[Renderer] backend=${this.backendName}`)
  this.ready = true
  // Phase 1: 不调用 setPostProcess()
}

update() {
  if (!this.ready) return
  this.instance.render(this.scene, this.camera.instance)
  this._renderPlayerPreview()
}

destroy() {
  this.instance?.dispose()
  // 不再调用 forceContextLoss()
}
```

**Step 3: Experience 门闩**

- `renderer.ready` 为 false 时：`update()` 仍可跑逻辑，但 renderer 自行 no-op
- 可选：`await` 完成后再 `new World()`（若出现材质编译竞态再加）

**Step 4: 已知会坏的东西（预期）**

- EffectComposer 链 → 本阶段故意关闭
- CSM / ShaderMaterial 在 **WebGPU backend** 下可能报错或黑块 → 若 PoC 被地形挡住：临时 `forceWebGL: true` 验证管线，或临时把 `makeCustomMaterial` 降级为 `MeshPhongMaterial`（仅 PoC 分支，单独 commit）

**Step 5: 验证**

```bash
pnpm dev
```

Expected: 打印 backend；基础场景可动。Chrome `chrome://gpu` 确认 WebGPU。

**Step 6: Commit**

```bash
git add src/js/renderer.js src/js/experience.js
git commit -m "feat(renderer): PoC WebGPURenderer with async init, postprocess off"
```

---

### Task 1.2: 强制 WebGL 回退冒烟 — ⏭ Skipped

用户确认 **100% WebGPU-only**：不验证 `forceWebGL`；init 后若落到 WebGL backend 则抛错。Debug 仍只读显示 `backendName` / `ready`。

---

## Phase 2: 后处理迁移（阻塞自定义特效） — ✅ Done (2026-07-14)

**验证：** `pnpm build` 通过（exit 0，~22s）。运行时需 Chrome + WebGPU。

**实现摘要：**
- `RenderPipeline` + `pass` + `bloom`（`three/addons/tsl/display/BloomNode.js`，r185）
- Speed Lines / Gaze 为 TSL `Fn` 节点（`src/js/postprocessing/*`），GLSL 文件暂留作参考（Phase 5 再归档）
- 兼容保留：`setSpeedLineOpacity`、`gazePass.uniforms.uIntensity`、`settings:postprocess-changed`、Debug 面板
- `onCameraSwitched`：更新 `scenePass.camera`
- 无 EffectComposer / ShaderPass 残留；SkinPreview 仍独立 WebGL（Phase 4）

**目视确认（`pnpm dev`）：**
1. 控制台 `[Renderer] backend=webgpu`
2. Bloom：抬高 Debug → Post Processing → Bloom 强度，观察亮处辉光
3. 速度线：冲刺（或 Debug 拉 opacity / Settings 视觉预设）
4. 凝视：被怪追，或 Debug → Gaze 强度 > 0.05
5. 第三人称 ↔ 鸟瞰切换后画面仍正确

### Task 2.1: TSL scene pass + bloom — ✅

**Files:**
- Modify: `src/js/renderer.js`

**参考（以当前 three 官方 example 为准，勿死抄旧签名）：**

```javascript
import * as THREE from 'three/webgpu'
import { pass } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'

// 典型模式（r183+ example）：
// renderPipeline = new THREE.RenderPipeline(renderer)
// scenePass = pass(scene, camera)
// scenePassColor = scenePass.getTextureNode('output')
// bloomPass = bloom(scenePassColor)
// renderPipeline.outputNode = scenePassColor.add(bloomPass)
// update: renderPipeline.render()
```

**Step 1:** 删除 Phase 1 的直渲临时逻辑中与 composer 冲突部分；实现 bloom-only pipeline。

**Step 2:** 绑定现有 `postProcessConfig.bloom` 与 settings/debug。

**Step 3:** 更新 `onCameraSwitched`：重建 scenePass 或更新 pass 相机引用（以实际 API 测为准）。

**Step 4:** `pnpm dev` — bloom 可见；无速度线/凝视可接受。

**Step 5: Commit** — ⏭ 用户要求本轮不 commit

---

### Task 2.2: Speed Lines → TSL（原 speed-lines 专项） — ✅

**Files:**
- Create: `src/js/postprocessing/speed-lines-node.js`
- Modify: `src/js/renderer.js`
- Reference: `src/shaders/speedlines/fragment.glsl`（逻辑源）

**Step 1:** 将 GLSL 极坐标扇区三角形逻辑转译为 `Fn()` + `uniform()`。

**Step 2:** 接入 pipeline：`bloomResult → speedLines → …`

**Step 3:** 保持 `setSpeedLineOpacity` / `settings:postprocess-changed` / Player 冲刺驱动行为不变。

**Step 4:** 冲刺时视觉对比 WebGL 旧效果（截图）。

**Step 5: Commit** — ⏭ 用户要求本轮不 commit

---

### Task 2.3: Gaze → TSL — ✅

**Files:**
- Create: `src/js/postprocessing/gaze-node.js`
- Modify: `src/js/renderer.js`
- Reference: `src/shaders/gaze/fragment.glsl`

**Step 1–5:** 同 Speed Lines；保留低强度 skip 逻辑。

**Step Commit** — ⏭ 用户要求本轮不 commit

---

### Task 2.4: 移除 EffectComposer 残留 — ✅

**Files:** `src/js/renderer.js`

删除 jsm postprocessing imports、composer dispose、GLSL speedlines/gaze imports（GLSL 源文件保留至 Phase 5 归档）。

**Step Commit** — ⏭ 用户要求本轮不 commit

---

## Phase 3: 在用材质迁移

### Task 3.1: 地形 CSM → MeshStandard/Phong NodeMaterial + TSL AO/Wind

**Files:**
- Modify: `src/js/world/terrain/blocks-config.js`
- Reference: `src/shaders/blocks/ao.*.glsl`, `wind.vert.glsl`

**阻塞说明：** 这是全量 WebGPU 路径最大风险点；建议独立 PR。

**Step 1:** 先迁移无风动的不透明方块 AO（`colorNode` 乘 AO attribute）。

**Step 2:** 再迁透明叶子风动（`positionNode`）。

**Step 3:** 验证 InstancedMesh + 多材质草方块六面。

**Step 4:** 确认 `plant-renderer` 材质路径一并覆盖。

```bash
git commit -m "feat(terrain): replace CSM with NodeMaterial TSL AO/wind"
```

---

### Task 3.2: SkyDome → MeshBasicNodeMaterial

**Files:** `src/js/world/sky-dome.js`

日夜双贴图 `mix(textureA, textureB, factor)`。

```bash
git commit -m "feat(sky): migrate SkyDome to TSL node material"
```

---

### Task 3.3: Fireflies → PointsNodeMaterial

**Files:** `src/js/world/effects/fireflies.js`

```bash
git commit -m "feat(fireflies): migrate to PointsNodeMaterial + TSL"
```

---

### Task 3.4: BlockSelectionHelper → NodeMaterial

**Files:** `src/js/interaction/block-selection-helper.js`

边框高亮 shader → TSL；保持 depthTest / opacity API。

```bash
git commit -m "feat(selection): migrate block highlight shader to TSL"
```

---

## Phase 4: 边缘与阴影

### Task 4.1: SkinPreviewScene → WebGPURenderer

**Files:**
- Modify: `src/js/components/skin-preview-scene.js`
- Modify: 调用方 Vue（`SkinSelector` 等）改为 async `create()`

```bash
git commit -m "feat(skin-preview): migrate secondary renderer to WebGPU"
```

---

### Task 4.2: 阴影三级质量回归

**Files:** `src/js/world/environment.js`, `shadow-config.js`（仅必要时调 bias）

在 WebGPU 下测 LOW/MED/HIGH；必要时调 `bias` / `normalBias`。

```bash
git commit -m "fix(shadow): tune bias for WebGPU if needed"
```

---

### Task 4.3:（可选）vite alias `three` → `three/webgpu`

**Files:** `vite.config.js`

仅在 Phase 3 完成后尝试；若副作用大则只改触及 NodeMaterial 的文件 import。

---

## Phase 5: 清理与验证

### Task 5.1: 移除 `three-custom-shader-material`

```bash
pnpm remove three-custom-shader-material
rg "three-custom-shader-material|CustomShaderMaterial" src/
```

Expected: 无引用。

---

### Task 5.2: GLSL 归档

将已无引用的 `speedlines/` `gaze/` `sky/` `fireflies/` `selection/` `blocks/ao|wind` 移至 `src/shaders/_deprecated/`（先移后删）。

闲置 `glass/` `grid/` `halftone/` `mining.*` 可保留或同样归档。

---

### Task 5.3: 回归清单

| 项 | 验证方式 |
|---|---|
| 基础场景 | `pnpm dev` 进游戏 |
| 后端 | Debug 显示 webgpu / force webgl |
| Bloom | 亮处辉光 |
| 速度线 | 冲刺 |
| 凝视 | 被怪追（或 debug 拉 intensity） |
| 地形 AO/风动 | 近距离观察树叶与墙角 |
| 天空过渡 | 加速日夜 |
| 萤火虫 | 夜间 |
| 选中框 | 准星指向方块 |
| 阴影三级 | Settings |
| 皮肤预览 | 主菜单 |
| 角标预览 | 左下角 scissor |
| 相机切换 | 第三人称 ↔ 鸟瞰 |
| E2E | `pnpm test:chrome` |

### Task 5.4: 性能对比

同一场景记录 FPS：空地 / 树林+阴影 / 冲刺+后处理 / 夜间粒子；WebGPU vs `forceWebGL`。

---

## 6. 风险表（更新）

| 风险 | 级别 | 缓解 |
|---|---|---|
| ShaderMaterial/CSM 在 WebGPU 不可用 | 高 | Phase 3 必修；PoC 可临时降级材质或 forceWebGL |
| EffectComposer 不可用 | 高 | Phase 2 整链替换 |
| TSL API 随 three 小版本变化 | 中 | Phase 0 锁定 example；避免抄过期计划签名 |
| InstancedMesh 性能回退 | 中 | 基准测试；可回退 WebGL 后端 |
| 阴影 acne / 移动端 | 中 | bias 调参；质量降级 |
| 异步 init 竞态 | 中 | `ready` 门闩；必要时延迟 World |
| legacy plugin 与现代浏览器目标冲突 | 低 | 评估是否对 WebGPU 入口禁用 legacy |
| 双 Renderer 工厂（真·旧 GLSL 回退）成本 | 高 | 默认不做，除非用户要 |

---

## 7. 预估工时（方案 B）

| Phase | 预估 |
|---|---|
| 0 环境 | 0.5–1h |
| 1 PoC | 2–4h |
| 2 后处理 | 6–10h（含 Speed Lines + Gaze） |
| 3 材质 | 8–14h（CSM 最重） |
| 4 边缘+阴影 | 3–5h |
| 5 清理测试 | 2–4h |
| **合计** | **~22–38h** |

---

## 8. 实施前必须确认的问题

1. **后端策略：** WebGPU 优先 + WebGL 回退（推荐）？还是 100% WebGPU-only？
2. **材质策略：** 接受全面引入 TSL/NodeMaterial（推荐）？还是希望额外维护「旧 WebGLRenderer + ShaderMaterial」双栈以兼容未迁移特效？
3. **范围：** 本次是否包含后处理 + 阴影 + 全部**在用**自定义特效？GlassWall/Grid 等未接入组件是否明确排除？
4. **three 版本：** 是否允许 `pnpm update three@latest`？
5. **节奏：** 是否先合并 Phase 1 PoC PR，再开后处理/材质 PR？

---

## 9. 执行选项（计划批准后）

Plan complete and saved to `docs/plans/2026-07-14-webgpu-renderer-migration.md`. Two execution options:

1. **Subagent-Driven（本会话）** — 每 Task 新子代理，Task 间人工 review  
2. **Parallel Session（独立会话）** — 新开会话用 executing-plans，按检查点批量执行  

**第 8 节已确认；Phase 1+2 已实现（见上文勾选）。下一切入点：Phase 3.1 地形 CSM → NodeMaterial TSL AO/Wind。**
