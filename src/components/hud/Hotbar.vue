<script setup>
/**
 * Hotbar - Minecraft Style Hotbar (9 slots)
 * Keyboard 1-9 and mouse wheel to select
 */
import { computed, onMounted, onUnmounted } from 'vue'
import emitter from '../../js/utils/event-bus.js'
import { useHudStore } from '../../vue/hudStore.js'

const hud = useHudStore()

// Calculate selector position (20px per slot + 3px offset)
const selectorLeft = computed(() => {
  const slotWidth = 20 // 18px slot + 2px gap
  const offset = -1 // Selector offset
  return `calc(${offset + hud.selectedSlot * slotWidth}px * var(--hud-scale))`
})

// Handle keyboard 1-9 for slot selection
function handleKeyDown(e) {
  if (e.key >= '1' && e.key <= '9') {
    const slot = Number.parseInt(e.key) - 1
    hud.selectSlot(slot)
  }
}

// Handle mouse wheel for slot cycling
function handleWheel(e) {
  if (e.deltaY > 0) {
    hud.cycleSlot(1)
  }
  else if (e.deltaY < 0) {
    hud.cycleSlot(-1)
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  // Only listen wheel when pointer is locked (playing)
  emitter.on('hud:wheel', handleWheel)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  emitter.off('hud:wheel', handleWheel)
})
</script>

<template>
  <div class="hotbar-container">
    <div class="hotbar-selector" :style="{ left: selectorLeft }" />
    <div class="hotbar-slots">
      <div
        v-for="(item, index) in hud.hotbarItems"
        :key="index"
        class="hotbar-slot"
      >
        <img
          v-if="item?.icon"
          :src="item.icon"
          :alt="item.name"
          class="item-icon"
        >
      </div>
    </div>
  </div>
</template>
