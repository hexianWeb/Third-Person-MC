---
name: 基于高度图的Shader地形实现
overview: 实现基于 FBM 噪声的地形数据生成，确保逻辑尺度一致，并驱动 Shader 进行地形起伏和颜色分层渲染。
todos:
  - id: implement-noise
    content: 实现 noise.js (Simplex Noise + FBM)
    status: pending
  - id: implement-terrain-data
    content: 实现 terrain-data.js 生成高度图 Texture
    status: pending
  - id: update-shaders
    content: 更新 Shader 支持高度位移和颜色分层
    status: pending
  - id: update-terrain
    content: 更新 Terrain 类集成高度图和新 Uniforms
    status: pending
---

# 基于高度图的 Shader 地形实现计划

## 核心目标

1.  创建一个统一的地形数据源（高度图），用于驱动 3D 地形和未来的小地图。
2.  实现 FBM (Fractal Brownian Motion) 噪声算法生成起伏地形。
3.  更新 Shader，根据高度数据进行顶点位移和颜色分层（水、沙、草、雪）。

## 实现步骤

### 1. 实现噪声工具类

新建 `src/js/utils/noise.js`：

- 实现一个标准的 Simplex Noise 算法。
- 实现 `fbm(x, y, octaves, persistence, lacunarity)` 函数，对应用户提供的归一化噪声公式。

### 2. 创建地形数据管理器

新建 `src/js/world/terrain-data.js`：

- 实现 `generateHeightMap(width, height, scale)` 方法。
- 使用 `useSquareSurface` 的逻辑遍历网格点。
- 生成并返回：
    - `data`: Float32Array 高度数据（供逻辑使用）。
    - `texture`: THREE.DataTexture（供 Shader 使用）。

### 3. 更新 Shader

- **`src/shaders/terrain/vertex.glsl`**:
    - 接收 `uniform sampler2D uHeightMap` 和 `uniform float uHeightScale`。
    - 读取纹理红色通道 `r` 作为高度，应用到 `position.y`。
    - 将高度值传递给 Fragment Shader (`vHeight`)。

- **`src/shaders/terrain/fragment.glsl`**:
    - 接收 `vHeight`。
    - 定义颜色 Uniforms: `uWaterColor`, `uSandColor`, `uGrassColor`, `uSnowColor`。
    - 根据 `vHeight` 的值（-1.0 到 1.0）进行颜色混合或分层：
        - < -0.2: 水
        - -0.2 ~ 0.0: 沙
        - 0.0 ~ 0.8: 草
        - > 0.8: 雪

### 4. 更新 Terrain 组件

修改 `src/js/world/terrain.js`：

- 引入 `TerrainData` 生成高度图。
- 将生成的 `DataTexture` 传入 Material 的 `uniforms`。
- 添加新的 Uniforms (`uHeightMap`, `uHeightScale`, 各层颜色)。
- 更新 Debug 面板以调整高度缩放和颜色阈值。

## 文件变更清单

| 文件 | 操作 |
|------|------|
| `src/js/utils/noise.js` | 新建 |
| `src/js/world/terrain-data.js` | 新建 |
| `src/shaders/terrain/vertex.glsl` | 修改 |
| `src/shaders/terrain/fragment.glsl` | 修改 |
| `src/js/world/terrain.js` | 修改 |

## 注意事项

- 噪声生成的数据范围需归一化到 [-1, 1] 以匹配用户的颜色区间需求。
- DataTexture 需要设置 `needsUpdate = true`。
- 顶点位移后的法线计算可能需要重新计算（或在 Shader 中通过邻域采样计算），暂时使用默认法线可能导致光照不正确，但优先实现形状和颜色。