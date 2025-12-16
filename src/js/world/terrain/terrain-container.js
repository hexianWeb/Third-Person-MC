/**
 * 地形数据容器（单例）
 * 以三维矩阵存储方块信息：data[x][y][z] = { id, instanceId }
 * 提供查询/写入/遍历/遮挡判断等工具方法
 */
import { blocks } from './blocks-config.js'

let instance = null

export default class TerrainContainer {
  /**
   * @param {{ width: number, height: number }} size 地图尺寸（x/z 方向 width，高度 height）
   * @param {{ useSingleton?: boolean }} options 是否使用单例（默认 true；chunk 私有容器需传 false）
   */
  constructor(size = { width: 32, height: 16 }, options = {}) {
    const useSingleton = options.useSingleton ?? true

    // 默认保持原行为：TerrainContainer 为单例
    // 无限地形（chunk）场景下，需要传 useSingleton:false 来创建多个容器实例
    if (useSingleton) {
      if (instance)
        return instance
      instance = this
    }

    this.size = {
      width: size.width,
      height: size.height,
    }

    this.initialize(this.size)
  }

  /**
   * 初始化空世界，填充为空气块
   * @param {{ width: number, height: number }} size
   */
  initialize(size = this.size) {
    this.size = {
      width: size.width,
      height: size.height,
    }

    this.data = []
    for (let x = 0; x < this.size.width; x++) {
      const slice = []
      for (let y = 0; y < this.size.height; y++) {
        const row = []
        for (let z = 0; z < this.size.width; z++) {
          row.push({
            id: blocks.empty.id,
            instanceId: null,
          })
        }
        slice.push(row)
      }
      this.data.push(slice)
    }
  }

  /**
   * 边界检测
   */
  _inBounds(x, y, z) {
    return x >= 0 && x < this.size.width
      && y >= 0 && y < this.size.height
      && z >= 0 && z < this.size.width
  }

  /**
   * 获取方块，越界时返回空方块数据
   */
  getBlock(x, y, z) {
    if (!this._inBounds(x, y, z)) {
      return {
        id: blocks.empty.id,
        instanceId: null,
      }
    }
    return this.data[x][y][z]
  }

  /**
   * 返回尺寸拷贝，避免外部直接修改
   */
  getSize() {
    return {
      width: this.size.width,
      height: this.size.height,
    }
  }

  /**
   * 按指定高度填充一整列
   * 用于地形生成：0~(height-1) 先填充 bodyId，最顶层替换为 topId
   * @param {number} x
   * @param {number} z
   * @param {number} height 目标高度（包含顶层）
   * @param {{ topId?: number, bodyId?: number }} opts
   */
  fillColumn(x, z, height, opts = {}) {
    if (!this._inBounds(x, 0, z))
      return

    const clampedHeight = Math.min(Math.max(Math.floor(height), -1), this.size.height - 1)
    if (clampedHeight < 0)
      return

    const bodyId = opts.bodyId ?? blocks.dirt.id
    const topId = opts.topId ?? bodyId

    for (let y = 0; y <= clampedHeight; y++) {
      // 顶层填顶面方块，其余填充主体
      const targetId = y === clampedHeight ? topId : bodyId
      this.setBlockId(x, y, z, targetId)
    }
  }

  /**
   * 清空容器，重置为空气
   */
  clear() {
    this.initialize(this.size)
  }

  /**
   * 设置方块 ID（同时清空实例引用）
   */
  setBlockId(x, y, z, id) {
    if (!this._inBounds(x, y, z))
      return
    this.data[x][y][z].id = id
    this.data[x][y][z].instanceId = null
  }

  /**
   * 记录 InstancedMesh 中的实例索引
   */
  setBlockInstanceId(x, y, z, instanceId) {
    if (!this._inBounds(x, y, z))
      return
    this.data[x][y][z].instanceId = instanceId
  }

  /**
   * 遮挡判定：六个方向都非空气则视为被遮挡
   */
  isBlockObscured(x, y, z) {
    const up = this.getBlock(x, y + 1, z)?.id ?? blocks.empty.id
    const down = this.getBlock(x, y - 1, z)?.id ?? blocks.empty.id
    const left = this.getBlock(x + 1, y, z)?.id ?? blocks.empty.id
    const right = this.getBlock(x - 1, y, z)?.id ?? blocks.empty.id
    const forward = this.getBlock(x, y, z + 1)?.id ?? blocks.empty.id
    const back = this.getBlock(x, y, z - 1)?.id ?? blocks.empty.id

    if (
      up === blocks.empty.id
      || down === blocks.empty.id
      || left === blocks.empty.id
      || right === blocks.empty.id
      || forward === blocks.empty.id
      || back === blocks.empty.id
    ) {
      return false
    }
    return true
  }

  /**
   * 遍历所有非空方块
   * @param {(block: {id:number,instanceId:number|null}, x:number, y:number, z:number) => void} fn
   */
  forEachFilled(fn) {
    for (let x = 0; x < this.size.width; x++) {
      for (let y = 0; y < this.size.height; y++) {
        for (let z = 0; z < this.size.width; z++) {
          const block = this.data[x][y][z]
          if (block.id !== blocks.empty.id) {
            fn(block, x, y, z)
          }
        }
      }
    }
  }

  /**
   * 导出高度图：取每个 (x,z) 的最高非空方块高度；若全空返回 -1
   * @returns {number[][]} 二维高度数组 [z][x]
   */
  toHeightMap() {
    const heightMap = []
    for (let z = 0; z < this.size.width; z++) {
      const row = []
      for (let x = 0; x < this.size.width; x++) {
        let top = -1
        for (let y = this.size.height - 1; y >= 0; y--) {
          if (this.getBlock(x, y, z).id !== blocks.empty.id) {
            top = y
            break
          }
        }
        row.push(top)
      }
      heightMap.push(row)
    }
    return heightMap
  }
}
