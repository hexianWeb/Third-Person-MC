<script setup>
/**
 * HealthBar - Minecraft Style Health Display
 * 10 hearts, each heart = 2 HP (max 20 HP)
 */
import { computed } from 'vue'
import { useHudStore } from '../../vue/hudStore.js'

const hud = useHudStore()

// Calculate heart states: 'full', 'half', or 'empty'
const hearts = computed(() => {
  const result = []
  const hp = hud.health
  for (let i = 0; i < 10; i++) {
    const heartHp = i * 2
    if (hp >= heartHp + 2) {
      result.push('full')
    } else if (hp >= heartHp + 1) {
      result.push('half')
    } else {
      result.push('empty')
    }
  }
  return result
})
</script>

<template>
  <div class="health-bar">
    <div
      v-for="(state, index) in hearts"
      :key="index"
      class="unit heart"
      :class="state"
    />
  </div>
</template>
