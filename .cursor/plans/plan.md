# Voxel Ambient Occlusion 实施计划（InstancedMesh）

## 目标

在现有 **InstancedMesh + CustomShaderMaterial** 的体素引擎架构下， 实现
**Minecraft 风格的 Voxel Ambient Occlusion（AO）**，
不破坏现有区块、几何体与材质共享设计。

------------------------------------------------------------------------

## 一、总体设计结论

-   AO **必须在 CPU / 世界生成阶段计算**
-   AO 数据通过 **InstancedBufferAttribute** 传入 GPU
-   Shader 只负责应用 AO，不负责判断遮挡
-   不使用 aoMap / uv2
-   不拆分几何体、不放弃 InstancedMesh

------------------------------------------------------------------------

## 二、AO 数据结构设计

### Block AO 存储

-   每个方块 6 个面 × 每面 4 个顶点 = **24 个 AO 值**
-   AO 等级使用 `0 ~ 3`（Minecraft 风格）

``` ts
block.ao = new Uint8Array(24)
```

AO 等级含义：

  值   含义
  ---- ------
  0    最暗
  1    较暗
  2    较亮
  3    最亮

------------------------------------------------------------------------

## 三、计算时机

AO 计算应放在 **所有地形 / 资源 / 植被生成完成之后**

``` ts
generateTerrain()
generateResources()

computeVoxelAO() // ← 推荐放这里
generateTrees()
generatePlants()

generateMeshes()
```

------------------------------------------------------------------------

## 四、AO 计算规则（标准体素 AO）

每个"面-顶点"检测 3 个邻居：

-   sideA
-   sideB
-   corner

### AO 公式（不要修改）

``` ts
if (sideA && sideB)
  ao = 0
else ao = 3 - (sideA + sideB + corner)
```

------------------------------------------------------------------------

## 五、邻居方向 Lookup（示例：顶部面 +Y）

  顶点   sideA      sideB      corner
  ------ ---------- ---------- -----------
  左前   (-1,0,0)   (0,0,1)    (-1,0,1)
  右前   (1,0,0)    (0,0,1)    (1,0,1)
  右后   (1,0,0)    (0,0,-1)   (1,0,-1)
  左后   (-1,0,0)   (0,0,-1)   (-1,0,-1)

共需要定义 **6 个面的 lookup 表**。

------------------------------------------------------------------------

## 六、computeVoxelAO 职责

-   遍历所有非空方块
-   跳过完全被遮挡的方块
-   为每个可见方块计算 24 个 AO 值

伪代码：

``` ts
for each block:
  if empty or obscured: continue

  for face in 6:
    for vertex in 4:
      ao = computeFromNeighbors()
      block.ao[index] = ao
```

------------------------------------------------------------------------

## 七、AO 传入 InstancedMesh

### Renderer 阶段

-   为每个 InstancedMesh 添加 `instanceAO` attribute
-   每个实例携带 24 个 AO 值

``` ts
geometry.setAttribute(
  'instanceAO',
  new THREE.InstancedBufferAttribute(aoArray, 1)
)
```

------------------------------------------------------------------------

## 八、Shader 使用方式

### Vertex Shader

``` glsl
attribute float instanceAO;
varying float vAO;

void main() {
  int aoIndex = gl_VertexID % 24;
  vAO = instanceAO[aoIndex] / 3.0;
}
```

### Fragment Shader

``` glsl
diffuseColor.rgb *= mix(0.6, 1.0, vAO);
```

------------------------------------------------------------------------

## 九、动态更新策略

### 第一阶段（推荐）

-   方块变动 → 重新生成 Chunk

### 第二阶段（优化）

-   只更新：
    -   自身
    -   6 个邻居
    -   对应 AO buffer 区段

------------------------------------------------------------------------

## 十、植物与树叶策略

-   第一版：植物不参与 AO
-   树叶 AO 可设为常量（如 0.8）
-   优先保证地形块 AO

------------------------------------------------------------------------

## 十一、实施顺序建议

### Phase 1

-   Container 增加 `block.ao`
-   只实现顶部面 AO

### Phase 2

-   完成 6 面 AO
-   InstancedBufferAttribute 接入
-   Shader 生效

### Phase 3（可选）

-   洞穴 AO 加权
-   天空暴露面 AO 减弱

------------------------------------------------------------------------
