---
name: Terrain Data System
overview: 创建一个统一的地形数据管理系统，基于 FBM 噪声生成高度图，支持 InstancedMesh 渲染和 Vue Canvas2D 小地图显示，通过颜色分段实现水、沙子、草、雪的视觉效果。
todos:
  - id: noise-lib
    content: 创建 noise.js 噪声库（Perlin + FBM）
    status: pending
  - id: terrain-data-manager
    content: 创建 TerrainDataManager 类（方格面生成、高度计算、颜色映射）
    status: pending
    dependencies:
      - noise-lib
  - id: experience-integration
    content: 在 Experience 中集成 TerrainDataManager
    status: pending
    dependencies:
      - terrain-data-manager
  - id: terrain-refactor
    content: 重构 Terrain.js 使用 InstancedMesh 渲染
    status: pending
    dependencies:
      - experience-integration
  - id: minimap-component
    content: 创建 MiniMap.vue 组件（Canvas2D 绘制）
    status: pending
    dependencies:
      - experience-integration
---

# 地形数据系统实现计划

## 核心架构

```
TerrainDataManager (数据源)
       │
       ├── Terrain.js (InstancedMesh 3D渲染)
       │
       └── MiniMap.vue (Canvas2D 小地图)
```

## 实现步骤

### 1. 集成噪声库

将参考项目的 `three-noise.module.ts` 转换为 JS 版本，放置于 [`src/js/tools/noise.js`](src/js/tools/noise.js)。包含 `Perlin` 和 `FBM` 类。

### 2. 创建 TerrainDataManager 类

路径：[`src/js/world/terrain-data-manager.js`](src/js/world/terrain-data-manager.js)

**核心功能：**
- 根据分辨率生成 Vector2 方格面数组
- 使用 FBM 噪声计算每个点的高度（范围 -1 到 1）
- 存储 `dataBlocks` 数组：`{ x, y, z, height, color }`
- 提供颜色映射函数（根据高度返回颜色）

**颜色分段逻辑：**
```javascript
// 高度 -> 颜色映射
height <= -0.2  → 水 (蓝色)
-0.2 < height <= 0  → 沙子 (黄色)
0 < height <= 0.8  → 草 (绿色)
height > 0.8  → 雪 (白色)
```

**关键参数（支持 Debug 面板）：**
- `resolution`: 地形分辨率（方块数量）
- `scale`: 噪声缩放
- `seed`: 随机种子
- `height`: 高度倍数
- 各层颜色和阈值

### 3. 重构 Terrain.js

将 [`src/js/world/terrain.js`](src/js/world/terrain.js) 从 ShaderMaterial 改为 InstancedMesh 渲染：

- 从 `TerrainDataManager` 读取 `dataBlocks`
- 使用 `InstancedMesh` + `BoxGeometry` 渲染方块
- 通过 `setMatrixAt` 设置位置，`setColorAt` 设置颜色
- 水面方块使用统一高度（水位线）

### 4. 修改 Experience.js

在 [`src/js/experience.js`](src/js/experience.js) 中添加 `TerrainDataManager` 实例，确保在 World 之前初始化。

### 5. 创建 MiniMap Vue 组件

路径：[`src/components/MiniMap.vue`](src/components/MiniMap.vue)

- 通过 mitt 事件总线或直接访问 Experience 获取地形数据
- 使用 Canvas2D 绘制俯视图
- 每个格子根据高度填充对应颜色
- 显示玩家位置标记

### 6. 更新着色器（可选）

如果需要更精细的方块渲染效果，可在 [`src/shaders/terrain/`](src/shaders/terrain/) 中添加 InstancedMesh 专用着色器。

## 数据流示意

```
生成阶段:
FBM Noise → 高度值 (-1~1) → 颜色映射 → dataBlocks[]

渲染阶段:
dataBlocks[] → Terrain.js (InstancedMesh)
            → MiniMap.vue (Canvas2D)
```

## 文件清单

| 操作 | 文件路径 |
|------|----------|
| 新建 | `src/js/tools/noise.js` |
| 新建 | `src/js/world/terrain-data-manager.js` |
| 重构 | `src/js/world/terrain.js` |
| 修改 | `src/js/experience.js` |
| 修改 | `src/js/world/world.js` |
| 新建 | `src/components/MiniMap.vue` |
