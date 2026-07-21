<script setup>
import { useHudStore } from '@pinia/hudStore.js'
import { useUiStore } from '@pinia/uiStore.js'
import emitter from '@three/utils/event/event-bus.js'
import { getItemIcon } from '@three/utils/inventory/item-icon.js'
/**
 * Hotbar - Minecraft Style Hotbar (9 slots)
 * 方块：CSS 3D；物品：2D 像素图标
 * Keyboard 1-9 and mouse wheel to select
 */
import { computed, onMounted, onUnmounted } from 'vue'

const hud = useHudStore()
const ui = useUiStore()

// Calculate selector position (20px per slot + 3px offset)
const selectorLeft = computed(() => {
  const slotWidth = 20 // 18px slot + 2px gap
  const offset = -1 // Selector offset
  return `calc(${offset + hud.selectedSlot * slotWidth}px * var(--hud-scale))`
})

/**
 * 槽位图标（方块三面 / 物品贴图）
 * @param {{ blockId: number } | null} item
 */
function slotIcon(item) {
  if (!item)
    return null
  return getItemIcon(item.blockId)
}

// Handle keyboard 1-9 for slot selection
function handleKeyDown(e) {
  if (ui.isMenuVisible)
    return
  if (e.key >= '1' && e.key <= '9') {
    const slot = Number.parseInt(e.key) - 1
    hud.selectSlot(slot)
  }
}

// Handle mouse wheel for slot cycling
function handleWheel(e) {
  if (ui.isMenuVisible)
    return
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
        <!-- 方块 CSS 3D -->
        <div v-if="slotIcon(item)?.kind === 'block'" class="slot-block-3d">
          <div
            class="block-face block-top"
            :style="{ backgroundImage: `url(${slotIcon(item).top})` }"
          />
          <div
            class="block-face block-front"
            :style="{ backgroundImage: `url(${slotIcon(item).side})` }"
          />
          <div
            class="block-face block-right"
            :style="{ backgroundImage: `url(${slotIcon(item).side})` }"
          />
        </div>
        <!-- 物品 2D 图标 -->
        <img
          v-else-if="slotIcon(item)?.kind === 'item'"
          class="slot-item-img"
          :src="slotIcon(item).url"
          alt=""
          draggable="false"
        >
        <!-- Item Count Badge -->
        <span v-if="item?.count > 1" class="slot-count">{{ item.count }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.slot-item-img {
  width: 90%;
  height: 90%;
  object-fit: contain;
  image-rendering: pixelated;
  pointer-events: none;
}
</style>
