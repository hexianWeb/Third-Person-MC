<script setup>
import { useHudStore } from '@pinia/hudStore.js'
import { useUiStore } from '@pinia/uiStore.js'
import sources from '@three/sources.js'
import emitter from '@three/utils/event/event-bus.js'
import { blocks as blocksConfig } from '@three/world/terrain/blocks-config.js'
/**
 * Hotbar - Minecraft Style Hotbar (9 slots)
 * Displays CSS 3D block icons with count badges
 * Keyboard 1-9 and mouse wheel to select
 */
import { computed, onMounted, onUnmounted } from 'vue'

const hud = useHudStore()
const ui = useUiStore()

// Build texture name -> path mapping from sources.js
const texturePathMap = sources.reduce((map, source) => {
  if (source.type === 'texture') {
    map[source.name] = `/${source.path}`
  }
  return map
}, {})

// Calculate selector position (20px per slot + 3px offset)
const selectorLeft = computed(() => {
  const slotWidth = 20 // 18px slot + 2px gap
  const offset = -1 // Selector offset
  return `calc(${offset + hud.selectedSlot * slotWidth}px * var(--hud-scale))`
})

/**
 * Get block config by ID
 */
function getBlockConfigById(blockId) {
  for (const key of Object.keys(blocksConfig)) {
    if (blocksConfig[key].id === blockId) {
      return blocksConfig[key]
    }
  }
  return null
}

/**
 * Get texture URL for a block face
 * Uses sources.js path mapping to get correct URL
 */
function getBlockTexture(blockId, face = 'side') {
  const config = getBlockConfigById(blockId)
  if (!config?.textureKeys)
    return null

  // Get texture key from block config
  const textureKey = config.textureKeys[face]
    || config.textureKeys.side
    || config.textureKeys.all
  if (!textureKey)
    return null

  // Map texture key to actual path from sources.js
  return texturePathMap[textureKey] || null
}

/**
 * Get top texture URL for a block
 */
function getBlockTopTexture(blockId) {
  const config = getBlockConfigById(blockId)
  if (!config?.textureKeys)
    return null

  const textureKey = config.textureKeys.top || config.textureKeys.all
  if (!textureKey)
    return null

  return texturePathMap[textureKey] || null
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
        <!-- CSS 3D Block Icon -->
        <div v-if="item" class="slot-block-3d">
          <div
            class="block-face block-top"
            :style="{ backgroundImage: `url(${getBlockTopTexture(item.blockId)})` }"
          />
          <div
            class="block-face block-front"
            :style="{ backgroundImage: `url(${getBlockTexture(item.blockId, 'side')})` }"
          />
          <div
            class="block-face block-right"
            :style="{ backgroundImage: `url(${getBlockTexture(item.blockId, 'side')})` }"
          />
        </div>
        <!-- Item Count Badge -->
        <span v-if="item?.count > 1" class="slot-count">{{ item.count }}</span>
      </div>
    </div>
  </div>
</template>
