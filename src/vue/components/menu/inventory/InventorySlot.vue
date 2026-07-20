<script setup>
/**
 * InventorySlot - MC 斜角槽位（40px）
 * 方块用 CSS3D 立方体；物品用像素图；悬停 tooltip
 */
import { getItemIcon, getItemName } from '@three/utils/inventory/item-icon.js'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  item: { type: Object, default: null },
  section: { type: String, required: true },
  index: { type: Number, required: true },
})

const emit = defineEmits(['click'])

const { t, te } = useI18n()
const hovered = ref(false)

const icon = computed(() => (props.item ? getItemIcon(props.item.blockId) : null))
const itemName = computed(() => (props.item ? getItemName(props.item.blockId) : null))

const tooltipText = computed(() => {
  if (!itemName.value)
    return ''
  const key = `items.${itemName.value}`
  return te(key) ? t(key) : itemName.value
})

function onMouseDown(e) {
  e.preventDefault()
  emit('click', {
    section: props.section,
    index: props.index,
    button: e.button,
    shift: e.shiftKey,
  })
}
</script>

<template>
  <div
    class="inv-slot"
    @mousedown="onMouseDown"
    @contextmenu.prevent
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <!-- 方块 CSS3D -->
    <div v-if="icon?.kind === 'block'" class="inv-block-3d">
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

    <!-- 物品 2D 图标 -->
    <img
      v-else-if="icon?.kind === 'item'"
      class="inv-item-img"
      :src="icon.url"
      alt=""
      draggable="false"
    >

    <span v-if="item?.count > 1" class="inv-slot-count">{{ item.count }}</span>

    <div v-if="hovered && tooltipText" class="inv-tooltip">
      {{ tooltipText }}
    </div>
  </div>
</template>

<style scoped>
.inv-slot {
  position: relative;
  width: 40px;
  height: 40px;
  background: #8b8b8b;
  border: 2px solid;
  border-color: #373737 #fff #fff #373737;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  image-rendering: pixelated;
}

.inv-slot:hover {
  outline: 1px solid #fff;
  outline-offset: -3px;
}

.inv-block-3d {
  width: 32px;
  height: 32px;
  transform-style: preserve-3d;
  transform: rotateX(-30deg) rotateY(45deg) scale(0.55);
  position: relative;
  pointer-events: none;
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
  pointer-events: none;
}

.inv-slot-count {
  position: absolute;
  right: 2px;
  bottom: 1px;
  font-size: 12px;
  font-weight: bold;
  color: #fff;
  text-shadow: 1px 1px 0 #000;
  pointer-events: none;
  z-index: 2;
}

.inv-tooltip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  background: #100010;
  border: 2px solid #25025c;
  color: #fff;
  font-size: 12px;
  padding: 2px 6px;
  white-space: nowrap;
  z-index: 20;
  pointer-events: none;
}
</style>
