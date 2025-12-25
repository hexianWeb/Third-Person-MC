/**
 * TerrainPersistence：地形修改持久化管理
 * - 记录玩家对地形的所有修改（增删方块）
 * - 保存到 localStorage/IndexedDB
 * - chunk 生成后自动应用修改
 */
export default class TerrainPersistence {
  constructor(options = {}) {
    this.worldName = options.worldName || 'default'
    this.useIndexedDB = options.useIndexedDB ?? false

    // 每个 chunk 的修改记录：Map<chunkKey, Map<blockKey, blockId>>
    // chunkKey: "x,z"
    // blockKey: "x,y,z" (chunk 局部坐标)
    // blockId: 方块类型 ID (0 表示删除)
    this.modifications = new Map()

    // 加载已保存的修改
    this.load()
  }

  /**
   * 获取 chunk 的存储 key
   */
  _chunkKey(chunkX, chunkZ) {
    return `${chunkX},${chunkZ}`
  }

  /**
   * 获取方块的存储 key（chunk 局部坐标）
   */
  _blockKey(localX, localY, localZ) {
    return `${localX},${localY},${localZ}`
  }

  /**
   * 记录方块修改
   * @param {number} worldX 世界坐标 X
   * @param {number} worldY 世界坐标 Y
   * @param {number} worldZ 世界坐标 Z
   * @param {number} blockId 方块 ID（0 表示删除）
   * @param {number} chunkWidth chunk 宽度
   */
  recordModification(worldX, worldY, worldZ, blockId, chunkWidth) {
    const chunkX = Math.floor(worldX / chunkWidth)
    const chunkZ = Math.floor(worldZ / chunkWidth)
    const localX = Math.floor(worldX - chunkX * chunkWidth)
    const localZ = Math.floor(worldZ - chunkZ * chunkWidth)

    const chunkKey = this._chunkKey(chunkX, chunkZ)
    const blockKey = this._blockKey(localX, worldY, localZ)

    if (!this.modifications.has(chunkKey)) {
      this.modifications.set(chunkKey, new Map())
    }

    this.modifications.get(chunkKey).set(blockKey, blockId)
  }

  /**
   * 获取某个 chunk 的所有修改
   * @returns {Map<string, number>} blockKey -> blockId
   */
  getChunkModifications(chunkX, chunkZ) {
    const key = this._chunkKey(chunkX, chunkZ)
    return this.modifications.get(key) || new Map()
  }

  /**
   * 清除某个 chunk 的修改记录
   */
  clearChunkModifications(chunkX, chunkZ) {
    const key = this._chunkKey(chunkX, chunkZ)
    this.modifications.delete(key)
  }

  /**
   * 序列化为可保存的格式
   */
  serialize() {
    const data = {}
    for (const [chunkKey, blocks] of this.modifications.entries()) {
      data[chunkKey] = Object.fromEntries(blocks)
    }
    return data
  }

  /**
   * 从序列化数据恢复
   */
  deserialize(data) {
    this.modifications.clear()
    for (const [chunkKey, blocks] of Object.entries(data)) {
      const blockMap = new Map(Object.entries(blocks).map(([k, v]) => [k, Number(v)]))
      this.modifications.set(chunkKey, blockMap)
    }
  }

  /**
   * 保存到 localStorage
   */
  save() {
    if (this.useIndexedDB) {
      this._saveToIndexedDB()
    }
    else {
      this._saveToLocalStorage()
    }
  }

  /**
   * 从存储加载
   */
  load() {
    if (this.useIndexedDB) {
      this._loadFromIndexedDB()
    }
    else {
      this._loadFromLocalStorage()
    }
  }

  _saveToLocalStorage() {
    try {
      const data = this.serialize()
      const key = `terrain_mods_${this.worldName}`
      localStorage.setItem(key, JSON.stringify(data))
      console.warn(`[TerrainPersistence] 已保存 ${this.modifications.size} 个 chunk 的修改`)
    }
    catch (error) {
      console.error('[TerrainPersistence] localStorage 保存失败:', error)
    }
  }

  _loadFromLocalStorage() {
    try {
      const key = `terrain_mods_${this.worldName}`
      const json = localStorage.getItem(key)
      if (json) {
        const data = JSON.parse(json)
        this.deserialize(data)
        console.warn(`[TerrainPersistence] 已加载 ${this.modifications.size} 个 chunk 的修改`)
      }
    }
    catch (error) {
      console.error('[TerrainPersistence] localStorage 加载失败:', error)
    }
  }

  // IndexedDB 实现（可选，用于大规模数据）
  async _saveToIndexedDB() {
    // TODO: 实现 IndexedDB 版本（适合大世界）
    console.warn('[TerrainPersistence] IndexedDB 尚未实现，回退到 localStorage')
    this._saveToLocalStorage()
  }

  async _loadFromIndexedDB() {
    console.warn('[TerrainPersistence] IndexedDB 尚未实现，回退到 localStorage')
    this._loadFromLocalStorage()
  }

  /**
   * 获取统计信息
   */
  getStats() {
    let totalModifications = 0
    for (const blocks of this.modifications.values()) {
      totalModifications += blocks.size
    }
    return {
      chunkCount: this.modifications.size,
      totalModifications,
    }
  }
}
