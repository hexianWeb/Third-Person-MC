<script setup>
/**
 * ExperienceBar - Minecraft Style XP Bar
 * Shows experience progress and level
 */
import { computed } from 'vue'
import { useHudStore } from '../../vue/hudStore.js'

const hud = useHudStore()

// Calculate fill width percentage
const fillWidth = computed(() => {
  return `${Math.floor(hud.experience * 100)}%`
})
</script>

<template>
  <div class="xp-container">
    <div class="xp-bg" />
    <div class="xp-fill" :style="{ width: fillWidth }" />
    <div v-if="hud.level > 0" class="xp-level">
      {{ hud.level }}
    </div>
  </div>
</template>
