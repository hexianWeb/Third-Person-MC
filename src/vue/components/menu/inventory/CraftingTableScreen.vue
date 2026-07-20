<script setup>
/**
 * CraftingTableScreen - 3x3 工作台界面 + 主背包 + hotbar
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
  <div class="crafting-table-screen mc-panel">
    <h2 class="ct-title">
      {{ $t('ui.craftingTable.title') }}
    </h2>

    <div class="ct-craft-wrap">
      <CraftingGrid
        :size="3"
        grid-section="craft3"
        result-section="result3"
        @slot-click="onSlotClick"
      />
    </div>

    <div class="ct-main-grid">
      <InventorySlot
        v-for="(slot, i) in inventory.mainSlots"
        :key="`main-${i}`"
        :item="slot"
        section="main"
        :index="i"
        @click="onSlotClick"
      />
    </div>

    <div class="ct-hotbar-row">
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
.crafting-table-screen {
  position: relative;
  min-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ct-title {
  margin: 0;
  font-size: 16px;
  color: #373737;
  text-shadow: 1px 1px 0 #fff;
}

.ct-craft-wrap {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.ct-main-grid {
  display: grid;
  grid-template-columns: repeat(9, 40px);
  gap: 2px;
  justify-content: center;
}

.ct-hotbar-row {
  display: grid;
  grid-template-columns: repeat(9, 40px);
  gap: 2px;
  justify-content: center;
  margin-top: 8px;
}
</style>
