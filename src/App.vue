<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Crosshair from './components/Crosshair.vue'
import GameHud from './components/hud/GameHud.vue'
import UiRoot from './components/menu/UiRoot.vue'
import MiniMap from './components/MiniMap.vue'
import Experience from './js/experience.js'

const threeCanvas = ref(null)
let experience = null
onMounted(() => {
  // 初始化 three.js 场景
  experience = new Experience(threeCanvas.value)
})

onBeforeUnmount(() => {
  experience?.destroy()
  experience = null
})
</script>

<template>
  <div class="relative w-screen h-screen">
    <!-- three.js 渲染的 canvas -->
    <canvas ref="threeCanvas" class="three-canvas absolute inset-0 z-0" />
    <!-- Menu System (Loading/MainMenu/Pause/Settings) -->
    <UiRoot />
    <!-- Minecraft Style HUD (只在 playing 时显示) -->
    <GameHud />
    <!-- 准星（仅在 Pointer Lock 激活时显示） -->
    <Crosshair />
    <!-- 小地图 -->
    <MiniMap />
  </div>
</template>

<style scoped>
.three-canvas {
  width: 100vw;
  height: 100vh;
  display: block;
}
</style>
