<script setup>
import { useSkinStore } from '@pinia/skinStore.js'
import Experience from '@three/experience.js'
import Crosshair from '@ui-components/Crosshair.vue'
import EventMonitorPanel from '@ui-components/debug/EventMonitorPanel.vue'
import GameHud from '@ui-components/hud/GameHud.vue'
import UiRoot from '@ui-components/menu/UiRoot.vue'
import AchievementPopup from '@ui-components/ui/AchievementPopup.vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'

const threeCanvas = ref(null)
let experience = null
onMounted(async () => {
  // 先完成皮肤状态水合，再创建 Experience，避免首帧读到未初始化皮肤
  const skinStore = useSkinStore()
  await skinStore.initialize()
  experience = new Experience(threeCanvas.value)
})

onBeforeUnmount(() => {
  experience?.destroy()
  experience = null
})

// 检查是否为 debug 模式
const isDebugMode = window.location.hash === '#debug'
</script>

<template>
  <!-- 主容器：相对定位 -->
  <div class="relative w-screen h-screen overflow-hidden">
    <!-- Three.js Canvas -->
    <canvas ref="threeCanvas" class="three-canvas absolute inset-0 z-0" />

    <!-- Menu System (Loading/MainMenu/Pause/Settings) -->
    <UiRoot />

    <!-- Minecraft Style HUD (只在 playing 时显示) -->
    <GameHud />

    <!-- 准星（仅在 Pointer Lock 激活时显示） -->
    <Crosshair />

    <!-- Debug 模式：浮动 Event Monitor 面板 -->
    <EventMonitorPanel v-if="isDebugMode" class="event-monitor-overlay overflow-visible" />

    <!-- 成就提示弹窗 (5分钟后提示游玩 MC 原版) -->
    <AchievementPopup />
  </div>
</template>

<style scoped>
.three-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

/* Event Monitor 浮动面板样式 */
.event-monitor-overlay {
  position: absolute;
  top: 0;
  left: 0;
  height: 100vh;
  z-index: 100;
}
</style>
