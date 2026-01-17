<script setup>
/**
 * UiRoot - Menu System Root Component
 * Manages screen transitions and overlay rendering
 */
import { onMounted, onUnmounted } from 'vue'
import emitter from '../../js/utils/event-bus.js'
import { useUiStore } from '../../vue/uiStore.js'
import HowToPlay from './HowToPlay.vue'
import LoadingScreen from './LoadingScreen.vue'
import MainMenu from './MainMenu.vue'
import PauseMenu from './PauseMenu.vue'
import SettingsMenu from './SettingsMenu.vue'

const ui = useUiStore()

// Listen for core:ready to transition from loading to mainMenu
onMounted(() => {
  emitter.on('core:ready', handleCoreReady)
  emitter.on('ui:escape', handleEscape)
  window.addEventListener('blur', handleWindowBlur)
})

onUnmounted(() => {
  emitter.off('core:ready', handleCoreReady)
  emitter.off('ui:escape', handleEscape)
  window.removeEventListener('blur', handleWindowBlur)
})

function handleCoreReady() {
  ui.screen = 'mainMenu'
  ui.mainMenuView = 'root'
}

function handleEscape() {
  ui.handleEscape()
}

function handleWindowBlur() {
  if (ui.screen === 'playing') {
    ui.toPauseMenu()
  }
}
</script>

<template>
  <!-- Menu Overlay Container -->
  <Transition name="fade">
    <div
      v-if="ui.isMenuVisible"
      class="menu-overlay"
      :class="{
        loading: ui.screen === 'loading',
        dark: ui.screen !== 'loading',
      }"
    >
      <!-- Loading Screen -->
      <LoadingScreen v-if="ui.screen === 'loading'" />

      <!-- Main Menu -->
      <template v-else-if="ui.screen === 'mainMenu'">
        <HowToPlay v-if="ui.mainMenuView === 'howToPlay'" />
        <MainMenu v-else />
      </template>

      <!-- Pause Menu -->
      <PauseMenu v-else-if="ui.screen === 'pauseMenu'" />

      <!-- Settings Menu -->
      <SettingsMenu v-else-if="ui.screen === 'settings'" />
    </div>
  </Transition>
</template>

<style scoped>
/* Fade transition for menu overlay */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
