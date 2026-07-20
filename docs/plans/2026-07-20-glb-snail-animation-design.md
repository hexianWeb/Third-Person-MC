# GLB 蜗牛动画替换设计

**日期：** 2026-07-20  
**状态：** 已确认  
**背景：** 程序体素蜗牛运行时拼几何 + 每帧 JS 部件动画导致帧率明显下降。改为 Blender 单模型 + NLA 导出 GLB，游戏内用 `AnimationMixer` 播放。

---

## 目标

用一份带骨架与三轨动画的 `snail.glb` **完全替换** `voxel-snail.js` 程序体素实现，保留现有生成、贴地游走、点击缩壳与挖矿左键仲裁行为。

## 决策摘要

| 项 | 选择 |
|----|------|
| 外观 | Blender 还原现有体素蜗牛（腹足 / 头 / 触角 / 壳） |
| 动画轨 | `crawl`（循环）+ `retract`（一次）+ `emerge`（一次） |
| 旧代码 | 完全替换，删除运行时拼几何与 `_updateReferenceVisuals` |
| 实例化 | 共享 GLB 模板 + `SkeletonUtils.clone` + 每只独立 `AnimationMixer` |

---

## 1. Blender 资产规范

**产物：** `public/models/snail.glb`

**造型（1:1 还原 `voxel-snail.js`）**

- 几何与层级严格按 `_buildFromReference` / `_createTentacle`：12 段腹足、头 14 格、触角各 4 格、壳椭球体素填充条件 `d <= 1.05`
- 材质用代码中的基础色近似（body `#cbb38c` / bodyDark `#b99c75` / eye `#171717` / shell `#78431f` / shellDark `#5e341c`）；像素噪点贴图可不烘焙
- 轴向：局部 **+X 为头朝向**（Three.js Y-up）；Blender 内用 `(x, -z, y)` 放置以保证 glTF 导出后与运行时一致
- 立方体边长 1；体素中心与代码一致（底面在局部 y=-0.5）；`snailRefLocalLength` 仍为 14

**建议骨架**

- `root` → `body_00`…`body_11` → `head` → `tentacle_L` / `tentacle_R`
- `shell` 挂在中后腹足

**NLA / clip 名（精确匹配）**

| Clip | 用途 | 循环 |
|------|------|------|
| `crawl` | 爬行蠕动 | LoopRepeat |
| `retract` | 缩入壳内 | LoopOnce + clamp |
| `emerge` | 从壳探出 | LoopOnce + clamp |

时长建议：`retract`≈0.7s、`emerge`≈0.7s、`crawl`≈1–2s 循环。  
`RETRACTED` 不单独做 clip，clamp 在 `retract` 末帧。

**导出：** glTF Binary，Bake Animation，仅保留蜗牛相关物体。

---

## 2. 运行时架构

**资源**

- `sources.js` 增加 `snailModel` → `models/snail.glb`
- 配置增加 `snailResourceName: 'snailModel'`；本地参考长度常量保留用于缩放

**类职责**

| 类 | 职责 |
|----|------|
| `SnailManager` | spawn / update / 点击仲裁 / reset / destroy；持有模板 scene + animations |
| `GlbSnail`（替换并删除 `VoxelSnail`） | clone、位姿、贴地游走、避障、FSM、自有 mixer |
| 动画控制（可内嵌于 `GlbSnail`） | 映射三 clip；fade 切换；`mixer.update(dt)` |

**Spawn**

1. 等 `landmark.isReady()`
2. 从 `resources.items.snailModel` 取 scene + animations（缺失则 warn 并 skip）
3. 确定性 RNG 生成点位（现逻辑不变）
4. 每点创建 `GlbSnail`

**每帧（每只）**

1. FSM 更新 → 状态变化时切 action  
2. `mixer.update(dt)`（不再改部件 transform）  
3. `CRAWLING` 时位移 / 转向 / 贴地；非爬行只贴地

**清理**

- 停 mixer、移出场景；不 dispose Resources 持有的模板几何/材质  
- 实现完成后将 `snailsEnabled` 设回 `true`（或验收后再开）

---

## 3. FSM ↔ 动画与点击

沿用 `SNAIL_STATES` / `createSnailFsm` / `snailFsmOnClick` / `snailFsmUpdate`。

| FSM | Action | 行为 |
|-----|--------|------|
| `CRAWLING` | `crawl` | LoopRepeat |
| `RETRACTING` | `retract` | LoopOnce + clampWhenFinished |
| `RETRACTED` | （保持） | 停在 `retract` 末帧 |
| `EMERGING` | `emerge` | LoopOnce；结束后回 `crawl` |

- 短 fade（约 0.1–0.15s）
- FSM 时长仍用 `retractMs` / `holdMs` / `emergeMs`；与 clip 不一致时用 `timeScale` 或重导时长
- 点击仅 `CRAWLING` 响应
- 缺 clip：`console.warn`，不崩溃

**点击：** 克隆根下所有 Mesh 作为 click meshes，`userData.snailRef`；屏幕中心射线 + `clickDistance` + `event.handled` 仲裁挖矿不变。

**游走：** 贴地、活动环、避底座、低频转向；缩壳期间不位移。

---

## 4. 验收与非目标

**验收**

1. 旱厕周围确定性生成 3–5 只 GLB 蜗牛，贴地游走，长度约 0.7–0.9 格  
2. 默认 `crawl`；6 格内准星左键 → retract → hold → emerge → crawl  
3. 命中消费左键；未命中挖矿不变  
4. 相对旧实现：无运行时拼方块、无逐部件 JS 动画，蜗牛相关帧耗明显下降  
5. reset / destroy 可重建且无泄漏；缺 GLB 时 warn 不崩  
6. 现有纯函数单测通过  

**非目标**

- GPU bone instancing  
- 蜗牛互撞、生命值、捕捉、存档  
- 「旱厕吃蜗牛」玩法扩展  
- Morph / 多套皮肤  

**风险**

| 风险 | 对策 |
|------|------|
| clip 名或轴向不对 | 导出清单 + 运行时按名查找 |
| 时长与 FSM 不一致 | `timeScale` 或重导 |
| 误 dispose 共享资源 | 只移除实例 |

---

## 涉及文件（预期）

- Create: `public/models/snail.glb`（Blender MCP 构建）
- Create: `src/js/world/landmarks/glb-snail.js`（或同等命名）
- Modify: `src/js/sources.js`、`src/js/config/dry-toilet-snails-config.js`、`src/js/world/landmarks/snail-manager.js`、`src/js/world/world.js`
- Delete: `src/js/world/landmarks/voxel-snail.js`（完全替换后）
- Keep: `dry-toilet-math.js` 与相关 unit tests

## Next Steps

按 `writing-plans` 产出实现计划后执行：先 Blender 资产，再运行时接线，最后开启 `snailsEnabled` 验收。
