<script setup>
import { useUiStore } from '@pinia/uiStore.js'
import emitter from '@three/utils/event/event-bus.js'
/**
 * UiRoot - Menu System Root Component
 * Manages screen transitions and overlay rendering
 */
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import HowToPlay from './HowToPlay.vue'
import CraftingTableScreen from './inventory/CraftingTableScreen.vue'
import InventoryScreen from './inventory/InventoryScreen.vue'
import LoadingScreen from './LoadingScreen.vue'
import MainMenu from './MainMenu.vue'
import PauseMenu from './PauseMenu.vue'
import SettingsMenu from './SettingsMenu.vue'
import SkinSelector from './SkinSelector.vue'

const ui = useUiStore()
const { locale } = useI18n()

function handleToggleInventory() {
  if (ui.screen === 'playing') {
    ui.toInventory()
    return
  }
  if (ui.screen === 'inventory' || ui.screen === 'craftingTable')
    ui.toPlaying()
}

function handleOpenCraftingTable() {
  if (ui.screen === 'playing')
    ui.toCraftingTable()
}

// 资源 + 渲染槽位池就绪后再离开 loading（core:boot-complete）
onMounted(() => {
  emitter.on('core:boot-complete', handleBootComplete)
  emitter.on('ui:escape', handleEscape)
  emitter.on('input:toggle_inventory', handleToggleInventory)
  emitter.on('ui:open_crafting_table', handleOpenCraftingTable)
  window.addEventListener('blur', handleWindowBlur)
})

onUnmounted(() => {
  emitter.off('core:boot-complete', handleBootComplete)
  emitter.off('ui:escape', handleEscape)
  emitter.off('input:toggle_inventory', handleToggleInventory)
  emitter.off('ui:open_crafting_table', handleOpenCraftingTable)
  window.removeEventListener('blur', handleWindowBlur)
})

function handleBootComplete() {
  ui.screen = 'mainMenu'
  ui.mainMenuView = 'root'
}

function handleEscape() {
  ui.handleEscape()
}

function handleWindowBlur() {
  // 在 debugMode 下禁用 blur 处理
  const isDebugMode = window.location.hash === '#debug'
  if (isDebugMode) {
    return
  }

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
        dark: ui.screen !== 'loading' && ui.screen !== 'inventory' && ui.screen !== 'craftingTable',
        [`lang-${locale}`]: true,
      }"
    >
      <!-- Loading Screen -->
      <LoadingScreen v-if="ui.screen === 'loading'" />

      <!-- Main Menu -->
      <template v-else-if="ui.screen === 'mainMenu'">
        <HowToPlay v-if="ui.mainMenuView === 'howToPlay'" />
        <SkinSelector v-else-if="ui.mainMenuView === 'skinSelector'" />
        <MainMenu v-else />
      </template>

      <!-- Pause Menu -->
      <template v-else-if="ui.screen === 'pauseMenu'">
        <SkinSelector v-if="ui.mainMenuView === 'skinSelector'" />
        <PauseMenu v-else />
      </template>

      <!-- Settings Menu -->
      <SettingsMenu v-else-if="ui.screen === 'settings'" />

      <!-- Inventory / Crafting Table（无 dark 调暗） -->
      <InventoryScreen v-else-if="ui.screen === 'inventory'" />
      <CraftingTableScreen v-else-if="ui.screen === 'craftingTable'" />
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
