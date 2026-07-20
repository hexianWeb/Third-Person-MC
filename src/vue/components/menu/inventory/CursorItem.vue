<script setup>
/**
 * CursorItem - 跟随鼠标的光标物品（pointer-events: none）
 */
import { useInventoryStore } from '@pinia/inventoryStore.js'
import { getItemIcon } from '@three/utils/inventory/item-icon.js'
import { computed, onMounted, onUnmounted, ref } from 'vue'

const inventory = useInventoryStore()
const pos = ref({ x: 0, y: 0 })

const icon = computed(() => {
  if (!inventory.cursor)
    return null
  return getItemIcon(inventory.cursor.blockId)
})

function onPointerMove(e) {
  pos.value = { x: e.clientX - 20, y: e.clientY - 20 }
}

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove)
})

onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMove)
})
</script>

<template>
  <div
    v-if="inventory.cursor && icon"
    class="cursor-item"
    :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
  >
    <div v-if="icon.kind === 'block'" class="inv-block-3d">
      <div
        class="inv-block-face inv-block-top"
        :style="{ backgroundImage: `url(${icon.top})` }"
      />
      <div
        class="inv-block-face inv-block-front"
        :style="{ backgroundImage: `url(${icon.side})` }"
      />
      <div
        class="inv-block-face inv-block-right"
        :style="{ backgroundImage: `url(${icon.side})` }"
      />
    </div>
    <img
      v-else
      class="inv-item-img"
      :src="icon.url"
      alt=""
      draggable="false"
    >
    <span v-if="inventory.cursor.count > 1" class="inv-slot-count">
      {{ inventory.cursor.count }}
    </span>
  </div>
</template>

<style scoped>
.cursor-item {
  position: fixed;
  width: 40px;
  height: 40px;
  pointer-events: none;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  image-rendering: pixelated;
}

.inv-block-3d {
  width: 32px;
  height: 32px;
  transform-style: preserve-3d;
  transform: rotateX(-30deg) rotateY(45deg) scale(0.55);
  position: relative;
}

.inv-block-face {
  position: absolute;
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  image-rendering: pixelated;
  backface-visibility: hidden;
}

.inv-block-top {
  transform: rotateX(90deg) translateZ(16px);
}

.inv-block-front {
  transform: translateZ(16px);
}

.inv-block-right {
  transform: rotateY(-90deg) translateZ(16px);
}

.inv-item-img {
  width: 80%;
  height: 80%;
  object-fit: contain;
  image-rendering: pixelated;
}

.inv-slot-count {
  position: absolute;
  right: 2px;
  bottom: 1px;
  font-size: 12px;
  font-weight: bold;
  color: #fff;
  text-shadow: 1px 1px 0 #000;
}
</style>
