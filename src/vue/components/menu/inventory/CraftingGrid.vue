<script setup>
/**
 * CraftingGrid - size×size 合成矩阵 + 箭头 + 结果格
 */
import { useInventoryStore } from '@pinia/inventoryStore.js'
import { computed } from 'vue'
import InventorySlot from './InventorySlot.vue'

const props = defineProps({
  size: { type: Number, required: true },
  gridSection: { type: String, required: true },
  resultSection: { type: String, required: true },
})

const emit = defineEmits(['slotClick'])

const inventory = useInventoryStore()

const gridSlots = computed(() => {
  return props.gridSection === 'craft2' ? inventory.craft2 : inventory.craft3
})

const resultItem = computed(() => {
  return props.gridSection === 'craft2' ? inventory.craft2Result : inventory.craft3Result
})

function onSlotClick(payload) {
  emit('slotClick', payload)
}
</script>

<template>
  <div class="crafting-grid" :class="`size-${size}`">
    <div
      class="craft-matrix"
      :style="{ gridTemplateColumns: `repeat(${size}, 40px)` }"
    >
      <InventorySlot
        v-for="(slot, i) in gridSlots"
        :key="i"
        :item="slot"
        :section="gridSection"
        :index="i"
        @click="onSlotClick"
      />
    </div>

    <div class="craft-arrow" aria-hidden="true">
      →
    </div>

    <InventorySlot
      :item="resultItem"
      :section="resultSection"
      :index="0"
      @click="onSlotClick"
    />
  </div>
</template>

<style scoped>
.crafting-grid {
  display: flex;
  align-items: center;
  gap: 8px;
}

.craft-matrix {
  display: grid;
  gap: 2px;
}

.craft-arrow {
  width: 40px;
  text-align: center;
  font-size: 24px;
  color: #373737;
  font-weight: bold;
  user-select: none;
}
</style>
