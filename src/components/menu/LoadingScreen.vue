<script setup>
/**
 * LoadingScreen - Initial loading screen
 * Shows loading progress while resources are being loaded
 */
import { onMounted, onUnmounted, ref } from 'vue'
import emitter from '../../js/utils/event-bus.js'

const progress = ref(0)
const loadingText = ref('Loading...')

// Listen for loading progress events
onMounted(() => {
  emitter.on('core:loading-progress', handleProgress)
})

onUnmounted(() => {
  emitter.off('core:loading-progress', handleProgress)
})

function handleProgress({ loaded, total }) {
  progress.value = Math.round((loaded / total) * 100)
  loadingText.value = `Loading... ${progress.value}%`
}
</script>

<template>
  <div class="loading-screen">
    <!-- Logo -->
    <img
      src="/textures/hub/logo.png"
      alt="Minecraft"
      class="logo"
    >

    <!-- Loading bar container -->
    <div class="loading-bar-container">
      <div class="loading-bar-bg">
        <div
          class="loading-bar-fill"
          :style="{ width: `${progress}%` }"
        />
      </div>
      <p class="loading-text">{{ loadingText }}</p>
    </div>
  </div>
</template>

<style scoped>
.loading-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 48px;
}

.logo {
  max-width: min(720px, 92vw);
  image-rendering: pixelated;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5));
}

.loading-bar-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.loading-bar-bg {
  width: 300px;
  height: 8px;
  background: #222;
  border: 2px solid #555;
}

.loading-bar-fill {
  height: 100%;
  background: linear-gradient(to right, #3a3, #5c5);
  transition: width 0.2s ease;
}

.loading-text {
  color: #aaa;
  font-size: 14px;
  text-shadow: 2px 2px #000;
}
</style>
