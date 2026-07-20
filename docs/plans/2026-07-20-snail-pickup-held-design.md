# 蜷缩蜗牛拾取到手持设计

**日期：** 2026-07-20  
**状态：** 已确认  

## 目标

再次左键点击 `RETRACTED` 蜗牛 → 进热键栏 + 选中时右手显示蜗牛 GLB。

## 行为

| FSM | 左键 |
|-----|------|
| CRAWLING | 缩壳 |
| RETRACTED | 拾取并移除世界实例 |
| 其他 | 不消费点击 |

## 实现要点

- `BLOCK_IDS.SNAIL = 22`，`placeable: false`
- `hud:add-item` + 尽量选中该格
- `HeldItemAttachment.setHeldObject`；`Player` 听 `hud:selected-block-update`
- 手持为缩壳姿态的 `snail.glb` 克隆

## 非目标

放下/投掷回世界；独立 ITEM_IDS 重构。
