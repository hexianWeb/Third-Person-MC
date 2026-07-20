<script setup>
/**
 * InventoryScreen - 玩家背包：标题 + 2x2 合成 + 27 主格 + hotbar
 */
import { useHudStore } from '@pinia/hudStore.js'
import { useInventoryStore } from '@pinia/inventoryStore.js'
import CraftingGrid from './CraftingGrid.vue'
import CursorItem from './CursorItem.vue'
import InventorySlot from './InventorySlot.vue'

const inventory = useInventoryStore()
const hud = useHudStore()

function onSlotClick({ section, index, button, shift }) {
  inventory.slotClick(section, index, { button, shift })
}
</script>

<template>
  <div class="inventory-screen mc-panel">
    <div class="inv-header">
      <h2 class="inv-title">
        {{ $t('ui.inventory.title') }}
      </h2>
      <CraftingGrid
        :size="2"
        grid-section="craft2"
        result-section="result2"
        @slot-click="onSlotClick"
      />
    </div>

    <div class="inv-main-grid">
      <InventorySlot
        v-for="(slot, i) in inventory.mainSlots"
        :key="`main-${i}`"
        :item="slot"
        section="main"
        :index="i"
        @click="onSlotClick"
      />
    </div>

    <div class="inv-hotbar-row">
      <InventorySlot
        v-for="(slot, i) in hud.hotbarItems"
        :key="`hotbar-${i}`"
        :item="slot"
        section="hotbar"
        :index="i"
        @click="onSlotClick"
      />
    </div>

    <CursorItem />
  </div>
</template>

<style scoped>
.inventory-screen {
  position: relative;
  min-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.inv-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.inv-title {
  margin: 0;
  font-size: 16px;
  color: #373737;
  text-shadow: 1px 1px 0 #fff;
}

.inv-main-grid {
  display: grid;
  grid-template-columns: repeat(9, 40px);
  gap: 2px;
  justify-content: center;
}

.inv-hotbar-row {
  display: grid;
  grid-template-columns: repeat(9, 40px);
  gap: 2px;
  justify-content: center;
  margin-top: 8px;
}
</style>
