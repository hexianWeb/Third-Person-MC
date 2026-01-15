<script setup>
/**
 * InfoPanel - Top Right Info Display
 * Shows Time, Day, FPS, Player Count, Server info like typical MC mods
 */
import { useHudStore } from '../../vue/hudStore.js'

const hud = useHudStore()
</script>

<template>
  <div class="info-panel mc-text">
    <div class="info-line">
      {{ hud.gameTime }}
    </div>
    <div class="info-line">
      Day {{ hud.gameDay }}
    </div>
    <div class="info-line spacer" />
    <div class="info-line">
      {{ hud.fps }} FPS
    </div>
    <div class="info-line">
      {{ hud.playerCount }} player
    </div>
    <div class="info-line">
      {{ hud.serverName }}
    </div>
  </div>
</template>

<style scoped>
.info-panel {
  display: flex;
  flex-direction: column;
  align-items: flex-end; /* Right align text */
  text-align: right;
  gap: calc(1px * var(--hud-scale));
  pointer-events: none;
}

.info-line {
  font-size: calc(8px * var(--hud-scale));
  color: #e0e0e0; /* Light gray/white */
  text-shadow: 1px 1px 0 #3f3f3f;
  line-height: 1.2;
}

.spacer {
  height: calc(4px * var(--hud-scale));
}
</style>
