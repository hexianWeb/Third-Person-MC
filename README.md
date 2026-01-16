# Third-Person-MC（网页第三人称 MC / Web3D Demo）

> 用 **Three.js + Vue 3** 搭建的网页 3D 演示：展示 **MC 风格多世界传送门** 与 **魂类锁定战斗** 的预热体验。  
> 目标：把 Web3D 做成“可跑、可玩、可继续迭代”的项目，而不只是一个截图 Demo。

- 在线预览：`https://third-person-mc.vercel.app/`
- Debug 面板：`https://third-person-mc.vercel.app/#debug`
- 产品需求（PRD，早期版本，可能与实现有偏差）：[`docs/PRD.md`](docs/PRD.md)

## 目录

- [视觉预览](#视觉预览)
- [玩法与按键操作](#玩法与按键操作)
- [生态地形与地形生成](#生态地形与地形生成)
- [相机自适应与 HUD](#相机自适应与-hud)
- [项目技术栈](#项目技术栈)
- [项目结构](#项目结构)
- [素材出处](#素材出处)
- [未完成内容 (TODO)](#未完成内容-todo)
- [快速开始](#快速开始)
- [License](#license)

## 视觉预览

### 开始界面展示
![开始界面展示](https://github.com/hexianWeb/picx-images-hosting/raw/master/image.webp)

| 攻击效果预览 | 地形：多生态拼图 |
| :--- | :--- |
| ![攻击效果预览](https://github.com/hexianWeb/picx-images-hosting/raw/master/attack.gif) | ![多生态拼图](https://github.com/hexianWeb/picx-images-hosting/raw/master/多生态拼图.webp) |

## 核心亮点（来自项目与实现现实）

- **运动系统**：第三人称角色移动与姿态切换（走/跑/跳），强调操作反馈与动画衔接
- **生态地形**：基于随机数与噪声的程序化地形（项目内有多生态概念：平原/森林/沙漠/冻洋等）
- **第三人称相机**：针对地形起伏做避障/防穿模的相机跟随思路，提升可玩性与稳定观感

> 备注：仓库里还集成了 HUD/菜单 UI、资源加载、Shader 管线等基础设施，详见下方“项目结构”和 PRD。

## 玩法与按键操作

> 以“读者打开页面 30 秒内就能上手”为标准。

| 操作 | 按键 | 说明 |
| --- | --- | --- |
| **移动** | `W / A / S / D` | 八向位移，包含姿态切换 |
| **普通攻击** | `Z` | 支持连击 Combo |
| **重攻击** | `X` | 强力打击反馈 |
| **锁定目标** | `鼠标中键` | (开发中) 魂类锁定逻辑 |
| **格挡** | `C` | 防御动作 |
| **互动** | `E / F` | (开发中) 采集或开启传送门 |
| **关闭弹窗/菜单** | `ESC` | 退出或暂停 |

## 生态地形与地形生成

项目内地形强调“体素风格 + 程序化生态变化”，并尽量保持稳定帧率。

| 平原地形 | 森林地形 |
| :--- | :--- |
| ![平原](https://github.com/hexianWeb/picx-images-hosting/raw/master/01.2rvmobho84.gif) | ![森林](https://github.com/hexianWeb/picx-images-hosting/raw/master/05.6f16budguw.gif) |

| 白桦林地形 | 樱花林地形 |
| :--- | :--- |
| ![白桦林](https://github.com/hexianWeb/picx-images-hosting/raw/master/06.7lkhkg2dhn.gif) | ![樱花林](https://github.com/hexianWeb/picx-images-hosting/raw/master/08.b9e9easke.gif) |

| 沙漠地形 | 冻洋地形 |
| :--- | :--- |
| ![沙漠](https://github.com/hexianWeb/picx-images-hosting/raw/master/07.9gx2d2et4h.gif) | ![冻洋](https://github.com/hexianWeb/picx-images-hosting/raw/master/冻洋.webp) |

### 地形生成思路 (Noise & FBM)

#### 一个 Seed 一个世界 (PRNG)
![](https://github.com/hexianWeb/picx-images-hosting/raw/master/seed.webp)

| 地形振幅调节 (Noise) | 地面细节调节 (FBM) |
| :--- | :--- |
| ![振幅](https://github.com/hexianWeb/picx-images-hosting/raw/master/地形振幅.gif) | ![FBM](https://github.com/hexianWeb/picx-images-hosting/raw/master/FBM.gif) |

## 相机自适应与 HUD

核心目标：自由旋转视角，相机根据地形自动躲避不穿模。

### HUD 界面总览
![HUD 总览](https://github.com/hexianWeb/picx-images-hosting/raw/master/HUD.webp)

| 相机跟随展示 | 相机越肩调整 |
| :--- | :--- |
| ![相机跟随展示](https://github.com/hexianWeb/picx-images-hosting/raw/master/03.6f16budgsi.gif) | ![相机调整](https://github.com/hexianWeb/picx-images-hosting/raw/master/相机调整.gif) |

## 项目技术栈

### 核心框架
- **Three.js (v0.172+)**: 核心 3D 渲染引擎
- **Vue 3**: UI 层开发框架
- **Vite**: 极速构建工具与开发服务器
- **Pinia**: 响应式状态管理（UI 与 3D 场景同步）

### 渲染与动画
- **GLSL (Custom Shaders)**: 自定义着色器实现传送门、地形渲染与后处理
- **three-custom-shader-material**: 材质增强插件
- **GSAP**: 高性能补间动画库
- **InstancedMesh**: 大规模体素与植被渲染优化

### 工具与工程化
- **mitt**: 全局事件总线，处理 UI 与 3D 层实时通信
- **Tailwind CSS**: 样式工具库
- **Sass/PostCSS**: 预处理器支持
- **Playwright**: 端到端测试覆盖
- **Husky & Commitlint**: 规范化代码提交

## 项目结构

```text
E:\圖形學\Third-Person-MC\
├── public/                 # 静态资源
│   ├── models/             # GLB/GLTF 模型 (角色、方块)
│   ├── textures/           # 材质贴图 (环境、方块、HUD)
│   └── fonts/              # Minecraft 字体
├── src/
│   ├── components/         # Vue UI 组件
│   │   ├── hud/            # 游戏内 HUD (血条、经验、快捷栏等)
│   │   ├── menu/           # 主菜单、设置、加载界面
│   │   └── MiniMap.vue     # 小地图组件
│   ├── js/                 # 核心逻辑
│   │   ├── camera/         # 相机控制器与 Rig
│   │   ├── world/          # 场景元素、玩家逻辑、地形系统
│   │   │   └── terrain/    # 生态生成、区块管理、AO 计算
│   │   ├── interaction/    # 射线拾取、方块交互
│   │   ├── utils/          # 调试、事件、输入解析
│   │   └── experience.js   # 框架单例入口
│   ├── shaders/            # 自定义 GLSL 着色器
│   └── vue/                # Pinia Stores
├── docs/                   # 产品文档与开发计划
└── vite.config.js          # 构建配置
```

## 素材出处
- **模型**: 基于 Minecraft 风格自定义建模 ( character.glb )
- **贴图**: 提取自 Minecraft 游戏资源包，由 [hexianWeb](https://github.com/hexianWeb) 优化。
- **字体**: Minecraftia-Regular.ttf
- **音效**: 计划由 Suno AI 生成 ( 命中、环境音 )

## 未完成内容 (TODO)
- [ ] **一直陪伴玩家的可爱狗**: 实现宠物 AI 逻辑与跟随系统
- [ ] **更好的 Biome**: 优化生态转换平滑度与更多植被种类
- [ ] **背包功能**: 实现完整的物品存放与交互 UI
- [ ] **挖掘特效**: 方块破坏时的粒子效果与动画
- [ ] **换肤功能**: 实时切换玩家模型贴图
- [ ] **敌人锁定特效**: 魂类锁定视觉反馈增强

## 快速开始

### 环境要求

- Node.js（建议 LTS）
- 包管理器：推荐 pnpm（仓库包含 `pnpm-lock.yaml`）

### 安装与运行

```bash
pnpm install
pnpm dev
```

然后打开终端输出的本地地址（Vite 会以 `--host` 启动）。

## 常用命令（与 `package.json` 对齐）

```bash
# 开发
pnpm dev

# 构建/预览
pnpm build
pnpm preview

# 代码检查
pnpm lint
pnpm lint:fix

# E2E（Playwright）
pnpm test:chrome
pnpm test:firefox
pnpm test:safari
```

## 文档与入口

- PRD：[`docs/PRD.md`](docs/PRD.md)
- 规划与设计：[`docs/plans/`](docs/plans/)

## 开发约定（与仓库风格保持一致）

- Three.js 侧以 `src/js/experience.js` 的 **Experience 单例**为核心入口组织代码
- UI（Vue）与 3D 场景（Three.js）解耦：状态优先用 Pinia，同步/即时事件用 mitt
- 新增 3D 组件建议配套 `debugInit` 面板，方便调参和定位问题

（更详细规则请看 `.cursor/rules/` 下的规范文件）

## 贡献

- 行为准则：[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- 仓库启用 Husky + Commitlint，提交信息建议遵循 Conventional Commits

## License

MIT，见 [`LICENSE`](LICENSE)。
