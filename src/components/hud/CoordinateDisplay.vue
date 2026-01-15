<script setup>
/**
 * CoordinateDisplay - Shows player X Y Z world coordinates
 */
import { computed } from 'vue'
import { useHudStore } from '../../vue/hudStore.js'

const hud = useHudStore()

// Format coordinate with fixed decimal places
const formatCoord = (val) => val.toFixed(3)

const coords = computed(() => ({
  x: formatCoord(hud.position.x),
  y: formatCoord(hud.position.y),
  z: formatCoord(hud.position.z),
}))
</script>

<template>
  <div class="coord-display">
    <div class="coord-item">
      <span class="coord-label">X:</span>
      <span class="coord-value">{{ coords.x }}</span>
    </div>
    <div class="coord-item">
      <span class="coord-label">Y:</span>
      <span class="coord-value">{{ coords.y }}</span>
    </div>
    <div class="coord-item">
      <span class="coord-label">Z:</span>
      <span class="coord-value">{{ coords.z }}</span>
    </div>
  </div>
</template>
