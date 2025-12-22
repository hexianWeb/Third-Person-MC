<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import emitter from '../js/utils/event-bus.js'

/**
 * Crosshair - Minecraft 风格的十字准星
 *
 * 特点：
 * - 固定在视口正中心
 * - 简洁的十字线设计
 * - 仅在 Pointer Lock 激活时显示
 */

// 是否显示准星（仅在鼠标锁定时显示）
const isVisible = ref(false)

// 监听 Pointer Lock 状态变化
function onPointerLocked() {
  isVisible.value = true
}

function onPointerUnlocked() {
  isVisible.value = false
}

onMounted(() => {
  emitter.on('pointer:locked', onPointerLocked)
  emitter.on('pointer:unlocked', onPointerUnlocked)
})

onUnmounted(() => {
  emitter.off('pointer:locked', onPointerLocked)
  emitter.off('pointer:unlocked', onPointerUnlocked)
})
</script>

<template>
  <Transition name="fade">
    <div v-if="isVisible" class="crosshair">
      <!-- 水平线 -->
      <div class="crosshair-line horizontal" />
      <!-- 垂直线 -->
      <div class="crosshair-line vertical" />
    </div>
  </Transition>
</template>

<style scoped>
.crosshair {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 9999;
}

/* 准星线条 - Minecraft 风格 */
.crosshair-line {
  position: absolute;
  background-color: white;
  /* 添加黑色边框增加对比度 */
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.8),
    0 0 4px rgba(0, 0, 0, 0.5);
}

/* 水平线 */
.crosshair-line.horizontal {
  width: 20px;
  height: 2px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

/* 垂直线 */
.crosshair-line.vertical {
  width: 2px;
  height: 20px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

/* 淡入淡出动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
