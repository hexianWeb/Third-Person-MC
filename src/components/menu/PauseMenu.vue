<script setup>
/**
 * PauseMenu - ESC menu when game is paused
 */
import { useUiStore } from '../../vue/uiStore.js'

const ui = useUiStore()
</script>

<template>
  <div class="pause-menu">
    <h2 class="menu-title">Game Paused</h2>

    <div class="mc-menu">
      <button class="mc-button" @click="ui.toPlaying()">
        <span class="title">Resume</span>
      </button>
      <button class="mc-button" @click="ui.toMainMenu({ preservePause: true })">
        <span class="title">Main Menu</span>
      </button>
      <button class="mc-button" @click="ui.toSettings('pauseMenu')">
        <span class="title">Settings</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.pause-menu {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.menu-title {
  color: #fff;
  font-size: 28px;
  text-shadow: 2px 2px #000;
}
</style>
