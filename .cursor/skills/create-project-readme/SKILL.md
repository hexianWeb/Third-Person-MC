---
name: create-project-readme
description: Create or rewrite this repository's README.md with accurate setup/usage instructions and links. Use when the user asks to write/update README, project introduction, getting started, install/run/test/lint commands, or documentation entrypoints.
---

# Create Project README (Third-Person-MC)

为当前仓库生成/重写 `README.md`，目标是让读者一眼看懂 **“这项目有什么视觉冲击力 / 有哪些玩法 / 怎么操作 / 怎么跑起来”**。

## 适用范围

- 用户提出：创建/更新 `README.md`、补充项目介绍、安装/运行/测试说明、文档入口、贡献方式等。
- 本项目是 Web3D 演示，**允许 README 较长**，用来承载大量截图/动图说明（以凸显视觉表现与玩法）。

## 工作流程（按顺序执行）

1. **快速扫描仓库结构**
   - 优先读取：`package.json`、`docs/PRD.md`、`docs/`、`.cursor/rules/`、`src/` 顶层结构。
   - 仅在需要确认细节时再深入读取具体实现文件。

2. **从事实出发提取可执行命令**
   - 以 `package.json -> scripts` 为准，写入安装、开发、构建、预览、Lint、测试命令。
   - 本项目脚本（以当前仓库为准）通常包含：
     - `pnpm install`
     - `pnpm dev`
     - `pnpm build`
     - `pnpm preview`
     - `pnpm lint` / `pnpm lint:fix`
     - `pnpm test:chrome` / `pnpm test:firefox` / `pnpm test:safari`

3. **把项目“说清楚”**
   - 标题：项目名（可用仓库目录名/PRD 名称），一句话描述。
   - 解释它做什么：参考 `docs/PRD.md` 的“产品定位/核心体验流程/按键速查”等；如果 PRD 已失真，在 README 中明确“以 README/代码为准”。
   - 说明它为何有用：列出 5~8 条“真实特性/卖点”（例如：Vite + Three.js、Vue HUD、Pinia + mitt、GLSL、Playwright、Husky/Commitlint 等）。

4. **写出可复用的 README 结构（建议）**
   - 推荐结构：Overview / Play (gameplay) / Controls / Biomes & Terrain / Adaptive Camera / HUD / Tech / Getting Started / Scripts / Project Structure / Docs / Contributing / License
   - 可以更长，但依然要可扫读：大量用标题 + 列表 + 图文分段。

5. **链接与引用规则**
   - 仓库内文件：一律用**相对路径**，例如 `docs/PRD.md`、`LICENSE`、`CODE_OF_CONDUCT.md`。
   - 外部链接：仅保留必要的（Node、pnpm、Three.js、Vite、Vue、Playwright）。
   - 不要复制粘贴 License 全文；只引用 `LICENSE`。
   - 不要写详细 API 文档；如需详细说明，链接到 `docs/` 下的文档。

6. **自检**
   - 命令是否真实存在？（来自 `package.json`）
   - 相对链接是否都能打开？
   - 是否避免了与本仓库无关的模板内容（例如别的仓库的 Demo/徽章/链接）？
   - README 是否覆盖了：**玩法**、**按键操作**、**生态地形**、**相机地形自适应**、**HUD**（必须都有）
   - 图片是否使用占位符（见下文），并在占位符上下写清楚“需要截什么图/图想表达什么”

## README 输出模板（按需裁剪）

生成 `README.md` 时，优先使用下面结构，并用本仓库信息填充占位符：

```markdown
# Third-Person-MC

> 用 Three.js + Vue 3 构建的网页 3D 演示：MC 风格多世界传送门 + 魂类锁定战斗预热体验。

## 视觉预览（先放图）

![主视觉：第三人称角色 + 方块世界 + HUD]()  
（截图建议：站在地形高点俯瞰，画面里同时包含 HUD 与远景地形）

![战斗/交互瞬间：命中、锁定或采集]()  
（截图建议：让读者一眼看到“这是能玩的”，不是静态展示）

## 玩法概览

- **核心玩法流程**：加载 → 超平坦（选传送门）→ 加载 → 地牢探索/战斗 → 通关 CTA → 返回

## 按键操作

| 操作 | 按键 |
| --- | --- |
| 移动 | W / A / S / D |
| 普通攻击 | 鼠标左键 |
| 重攻击 | 鼠标右键 |
| 锁定目标 | 鼠标中键 |
| 格挡 | C |
| 互动 | E / F |
| 关闭弹窗/菜单 | ESC |

![按键提示 UI（右下角/提示面板）]()  
（截图建议：完整包含“移动/攻击/格挡/锁定”等提示）

## 生态地形

- 平原
- 森林（含白桦林 / 樱花林）
- 沙漠
- 冻洋

![平原地形]()  
![森林地形（InstancedMesh 密集场景）]()  
![白桦林地形]()  
![樱花林地形]()  
![沙漠地形]()  
![冻洋地形]()  

## 相机：地形自适应与防穿模

![相机绕角色旋转、地形起伏下不穿模]()  
（截图建议：在坡地/山体附近旋转相机，强调“避障/不穿模”）

## HUD

![HUD 全量展示：准星、血条/饥饿、快捷栏、经验条、指南针/坐标等]()  
（截图建议：尽量把 HUD 的信息密度一次性拍全）

## 快速开始

### 环境要求

- Node.js（建议使用 LTS 版本）
- 包管理器：推荐 pnpm（仓库包含 `pnpm-lock.yaml`）

### 安装与运行

```bash
pnpm install
pnpm dev --host
```

然后打开终端输出的本地地址。

## 常用脚本

```bash
pnpm build
pnpm preview
pnpm lint
pnpm lint:fix
pnpm test:chrome
```

## 项目结构（节选）

- `src/js/`：Three.js 场景与核心逻辑（Experience 单例等）
- `src/components/`：Vue UI（HUD、菜单等）
- `src/shaders/`：GLSL shader
- `public/`：静态资源（模型、贴图、字体等）
- `docs/`：产品与开发文档

## 文档

- 产品需求：`docs/PRD.md`
- 规划与设计：`docs/plans/`

## 贡献

请先阅读：`CODE_OF_CONDUCT.md`  
提交信息遵循 Conventional Commits（仓库启用 commitlint + husky）。

## License

MIT，见 `LICENSE`。
```

## 徽章（Badges）策略

- **默认不加 GitHub 徽章**（避免 repo/分支未知导致失效）。
- 如果能确认远端仓库信息（例如 `git remote -v` 可用且稳定），再添加：
  - License badge
  - CI 状态（如确有 CI）
  - Release/version（如确有发布流程）

## 不要写进 README 的内容

- 详细 API/类说明（放到 `docs/`）
- 大段 Troubleshooting（除非确实高频，尽量放到 `docs/`）
- License 全文（仅链接）
- 与本仓库无关的模板链接/截图/Demo 地址

## 完成定义（Definition of Done）

- [ ] `README.md` 的命令均与 `package.json` 一致
- [ ] 关键文档入口使用相对链接且可打开
- [ ] 读完 README，开发者能完成：安装依赖 → 启动 dev → 找到 PRD/文档 → 了解如何贡献
