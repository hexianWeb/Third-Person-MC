// Chunk 基础配置参数
export const CHUNK_BASIC_CONFIG = {
  chunkWidth: 64, // Chunk 宽度（方块数），决定每个 chunk 在 X/Z 方向上的大小
  chunkHeight: 32, // Chunk 高度（方块数），决定每个 chunk 在 Y 方向上的大小
  viewDistance: 1, // 加载半径（chunk 数量），玩家周围加载的 chunk 范围，值为 1 表示 3×3 网格
  unloadPadding: 1, // 卸载滞后（chunk 数量），卸载半径 = viewDistance + unloadPadding，用于减少边界抖动
  seed: 1337, // 随机种子，用于地形生成的随机数序列，相同 seed 生成相同地形
  worldName: 'default', // 世界名称，用于持久化存储的标识符
  useIndexedDB: false, // 是否使用 IndexedDB 进行持久化存储，false 使用 localStorage
  autoSaveDelay: 2000, // 自动保存延迟（毫秒），玩家修改地形后的节流保存时间
}

// 地形生成参数（影响噪声采样，变更后需全量重新生成）
export const TERRAIN_PARAMS = {
  scale: 168, // 地形噪声缩放，控制地形的细节程度（范围: 5-120），值越大地形越平滑
  magnitude: 6, // 地形振幅（方块层数），控制地形起伏的高度（范围: 0-32），值越大起伏越明显
  offset: 8, // 高度偏移（方块层数），地形基准高度（范围: 0-chunkHeight），默认放在中间偏下更像平原
  // fBm 参数（分形布朗运动）
  fbm: {
    octaves: 5, // 八度数，叠加的噪声层数（范围: 1-8），值越大细节越丰富
    gain: 0.5, // 振幅衰减系数（persistence，范围: 0.1-1.0），控制每层振幅的衰减速度
    lacunarity: 2.0, // 频率倍增系数（范围: 1.5-3.0），控制每层频率的倍增速度
  },
  rockExpose: {
    maxDepth: 2, // 距离地表多少层内允许裸岩
    slopeThreshold: 2, // 邻居高度差阈值
  },
}

// 树生成参数（影响树木生成，变更后需全量重新生成）
export const TREE_PARAMS = {
  minHeight: 3, // 树干最小高度（方块数，范围: 1-32）
  maxHeight: 6, // 树干最大高度（方块数，范围: 1-32）
  minRadius: 2, // 树叶最小半径（方块数，范围: 1-12）
  maxRadius: 4, // 树叶最大半径（方块数，范围: 1-12）
  frequency: 0.05, // 树密度（0-1），值越大树越多，控制树木生成的频率
}

// 渲染参数（影响视觉效果，可实时调整）
export const RENDER_PARAMS = {
  scale: 1, // 整体缩放倍率（范围: 0.1-3），控制所有 chunk 的整体大小
  heightScale: 1, // 高度缩放倍率（范围: 0.5-5），控制地形高度的拉伸程度
  showOresOnly: false, // 仅显示矿产模式，true 时只渲染矿石类方块，用于调试
}

// 水面参数（影响水面效果）
export const WATER_PARAMS = {
  waterOffset: 3, // 水面层数（方块高度，范围: 0-chunkHeight-1），水面的 Y 坐标位置
  flowSpeedX: 0.5, // 水流 X 方向速度（范围: -0.2-0.2），控制水面纹理在 X 方向的流动速度
  flowSpeedY: 0.00, // 水流 Y 方向速度（范围: -0.2-0.2），控制水面纹理在 Y 方向的流动速度
}
