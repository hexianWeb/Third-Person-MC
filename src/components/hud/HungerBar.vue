<script setup>
/**
 * HungerBar - Minecraft Style Hunger Display
 * 10 drumsticks, each = 2 hunger points (max 20)
 */
import { computed } from 'vue'
import { useHudStore } from '../../vue/hudStore.js'

const hud = useHudStore()

// Calculate food states: 'full', 'half', or 'empty'
const foods = computed(() => {
  const result = []
  const hungerVal = hud.hunger
  for (let i = 0; i < 10; i++) {
    const foodPoints = i * 2
    if (hungerVal >= foodPoints + 2) {
      result.push('full')
    } else if (hungerVal >= foodPoints + 1) {
      result.push('half')
    } else {
      result.push('empty')
    }
  }
  return result
})
</script>

<template>
  <div class="food-bar">
    <div
      v-for="(state, index) in foods"
      :key="index"
      class="unit food"
      :class="state"
    />
  </div>
</template>
