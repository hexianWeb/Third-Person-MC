<script setup>
/**
 * TopInfoBar - Container for coordinate display and compass
 */
import CompassWheel from './CompassWheel.vue'
import CoordinateDisplay from './CoordinateDisplay.vue'
</script>

<template>
  <div class="top-info-bar">
    <CoordinateDisplay />
    <CompassWheel />
  </div>
</template>
