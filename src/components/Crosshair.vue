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

const isVisible = ref(false)
const isPressed = ref(false)

// 监听 Pointer Lock 状态变化
function onPointerLocked() {
  isVisible.value = true
}

function onPointerUnlocked() {
  isVisible.value = false
}

// 监听鼠标按键
function onMouseDown(data) {
  if (data.button === 0) { // 左键按下
    isPressed.value = true
  }
}

function onMouseUp(data) {
  if (data.button === 0) { // 左键松开
    isPressed.value = false
  }
}

onMounted(() => {
  emitter.on('pointer:locked', onPointerLocked)
  emitter.on('pointer:unlocked', onPointerUnlocked)
  emitter.on('input:mouse_down', onMouseDown)
  emitter.on('input:mouse_up', onMouseUp)
})

onUnmounted(() => {
  emitter.off('pointer:locked', onPointerLocked)
  emitter.off('pointer:unlocked', onPointerUnlocked)
  emitter.off('input:mouse_down', onMouseDown)
  emitter.off('input:mouse_up', onMouseUp)
})
</script>

<template>
  <Transition name="fade">
    <div v-if="isVisible" class="crosshair" :class="{ 'is-pressed': isPressed }">
      <!-- 中央十字 - 四个短划线 -->
      <div class="center-dashes">
        <div class="dash top" />
        <div class="dash bottom" />
        <div class="dash left" />
        <div class="dash right" />
      </div>

      <!-- 四个角上的 L 型边框 -->
      <div class="corners">
        <div class="corner top-left" />
        <div class="corner top-right" />
        <div class="corner bottom-left" />
        <div class="corner bottom-right" />
      </div>
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
  width: 40px;
  height: 40px;
  transition: transform 0.1s ease;
}

.crosshair.is-pressed {
  transform: translate(-50%, -50%) scale(0.85);
}

/* 像素风格的基础样式 */
.dash,
.corner {
  position: absolute;
  background-color: #eee;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
  transition: all 0.15s ease-out;
}

/* 中央短划线 */
.center-dashes .dash {
  background-color: #eeeeeeb2;
}

.dash.top,
.dash.bottom {
  width: 2px;
  height: 6px;
  left: 50%;
  transform: translateX(-50%);
}

.dash.top { top: 12px; }
.dash.bottom { bottom: 12px; }

.dash.left,
.dash.right {
  width: 6px;
  height: 2px;
  top: 50%;
  transform: translateY(-50%);
}

.dash.left { left: 12px; }
.dash.right { right: 12px; }

/* 边角 L 型 */
.corner {
  width: 6px;
  height: 6px;
  background: transparent;
  border: 2px solid rgba(255, 255, 255, 0.699);
  box-shadow: none; /* 移除阴影以保持锐利 */
  filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.8));
}

.top-left {
  top: 0;
  left: 0;
  border-right: none;
  border-bottom: none;
}

.top-right {
  top: 0;
  right: 0;
  border-left: none;
  border-bottom: none;
}

.bottom-left {
  bottom: 0;
  left: 0;
  border-right: none;
  border-top: none;
}

.bottom-right {
  bottom: 0;
  right: 0;
  border-left: none;
  border-top: none;
}

/* 按下时的位移效果 */
.is-pressed .dash.top { transform: translate(-50%, 2px); }
.is-pressed .dash.bottom { transform: translate(-50%, -2px); }
.is-pressed .dash.left { transform: translate(2px, -50%); }
.is-pressed .dash.right { transform: translate(-2px, -50%); }

.is-pressed .top-left { transform: translate(3px, 3px); }
.is-pressed .top-right { transform: translate(-3px, 3px); }
.is-pressed .bottom-left { transform: translate(3px, -3px); }
.is-pressed .bottom-right { transform: translate(-3px, -3px); }

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
