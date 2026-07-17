/** 固定渲染槽容量不足时抛出的结构化错误。 */
export default class ChunkRenderCapacityError extends Error {
  /**
   * @param {{ layer: string, typeId: string, required: number, capacity: number }} context 溢出上下文
   */
  constructor({ layer, typeId, required, capacity }) {
    super(`${layer}:${typeId} requires ${required} instances; capacity is ${capacity}`)
    this.name = 'ChunkRenderCapacityError'
    this.layer = layer
    this.typeId = typeId
    this.required = required
    this.capacity = capacity
  }
}
