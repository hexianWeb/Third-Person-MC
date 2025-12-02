<script setup>
import { onMounted, ref } from 'vue'
import Crosshair from './components/Crosshair.vue'
import Experience from './js/experience.js'
import ExamplePanel from './vue/ExamplePanel.vue'

const threeCanvas = ref(null)

onMounted(() => {
  // 初始化 three.js 场景
  const experience = new Experience(threeCanvas.value)
})
</script>

<template>
  <div class="relative w-screen h-screen">
    <!-- three.js 渲染的 canvas -->
    <canvas ref="threeCanvas" class="three-canvas absolute inset-0 z-0" />
    <!-- 示例 UI 组件 -->
    <ExamplePanel class="absolute top-4 right-4 z-10" />
    <!-- 准星（仅在 Pointer Lock 激活时显示） -->
    <Crosshair />
  </div>
</template>

<style scoped>
.three-canvas {
  width: 100vw;
  height: 100vh;
  display: block;
}
</style>
