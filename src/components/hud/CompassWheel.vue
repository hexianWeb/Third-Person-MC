<script setup>
/**
 * CompassWheel - Horizontal scrolling compass with direction markers
 * Uses absolute positioning for seamless looping
 */
import { computed } from 'vue'
import { useHudStore } from '../../vue/hudStore.js'

const hud = useHudStore()

// Visual Configuration
const PIXELS_PER_DEG = 4 // Scale factor (density)
const TICK_SPACING = 5 // Degrees between ticks

// Direction definitions (Rad -> Deg)
// N = 180 deg (PI) (Assuming standard mapping from player config)
const DIRECTIONS = [
  { label: 'S', deg: 0 },
  { label: 'SW', deg: 45, minor: true },
  { label: 'W', deg: 90 },
  { label: 'NW', deg: 135, minor: true },
  { label: 'N', deg: 180 },
  { label: 'NE', deg: 225, minor: true },
  { label: 'E', deg: 270 },
  { label: 'SE', deg: 315, minor: true },
]

// Normalized Player Heading (0-360)
const currentHeading = computed(() => {
  // Convert radians to degrees
  const deg = (hud.facingAngle * 180) / Math.PI
  // Normalize to 0-360 positive
  // Note: If player angle is reversed (counter-clockwise vs clockwise),
  // we might need to negate deg. Assume standard for now.
  return ((deg % 360) + 360) % 360
})

// Track Offset (Shift the track left by this amount)
const trackOffset = computed(() => {
  return currentHeading.value * PIXELS_PER_DEG
})

// Generate static items for the track
// We render a range that covers enough buffer for smooth wrapping
// Center is 0 (South). We render -180 to 540 to cover full 360 + buffers.
const compassItems = computed(() => {
  const items = []
  const startDeg = -180
  const endDeg = 540

  for (let deg = startDeg; deg <= endDeg; deg += TICK_SPACING) {
    // Determine content based on normalized degree (0-360)
    const normalizedDeg = ((deg % 360) + 360) % 360

    // Check for direction label
    // Use rigid equality for integers, or small epsilon if needed
    const direction = DIRECTIONS.find(d => Math.abs(d.deg - normalizedDeg) < 0.1)

    // Position relative to 0
    const left = deg * PIXELS_PER_DEG

    if (direction) {
      items.push({
        type: 'direction',
        label: direction.label,
        isNorth: direction.label === 'N',
        minor: direction.minor,
        left,
      })
    }
    else {
      // Major tick every 15 deg
      const isMajor = normalizedDeg % 15 === 0
      items.push({
        type: 'tick',
        major: isMajor,
        left,
      })
    }
  }
  return items
})
</script>

<template>
  <div class="compass-container">
    <div class="compass-pointer" />
    <div
      class="compass-track"
      :style="{ transform: `translateX(calc(50% - ${trackOffset}px))` }"
    >
      <template v-for="(item, index) in compassItems" :key="index">
        <!-- Direction Label -->
        <span
          v-if="item.type === 'direction'"
          class="compass-direction absolute-item "
          :class="{ north: item.isNorth, minor: item.minor }"
          :style="{ left: `${item.left}px` }"
        >
          {{ item.label }}
        </span>
        <!-- Tick Mark -->
        <div
          v-else
          class="compass-tick absolute-item"
          :class="{ major: item.major }"
          :style="{ left: `${item.left}px` }"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.compass-track {
  position: relative;
  height: 100%;
  width: 100%;
  will-change: transform;
}

.absolute-item {
  position: absolute;
  font-family: 'MinecraftV2', sans-serif;
  top: 50%;
  transform: translate(-50%, -50%); /* Center on the 'left' coordinate */
}

/* Tick specific vertical alignment */
.compass-tick.absolute-item {
  top: 50%;
  font-family: 'MinecraftV2', sans-serif;
  transform: translate(-50%, -50%);
}

.compass-direction.minor {
  font-size: calc(7px * var(--hud-scale));
  font-family: 'MinecraftV2', sans-serif;
  opacity: 0.6;
}
</style>
