<script setup>
/**
 * KeyFeedbackPanel - Displays user key presses (WASD, ZXC, V)
 * Highlighting keys based on input:update events
 */
import { onMounted, onUnmounted, reactive } from 'vue'
import emitter from '../../js/utils/event-bus.js'

// Key states
const keys = reactive({
  w: false,
  a: false,
  s: false,
  d: false,
  z: false,
  x: false,
  c: false,
  v: false,
})

/**
 * Handle input update from InputManager
 */
function handleInputUpdate(inputKeys) {
  keys.w = inputKeys.forward
  keys.a = inputKeys.left
  keys.s = inputKeys.backward
  keys.d = inputKeys.right
  keys.z = inputKeys.z || false
  keys.x = inputKeys.x || false
  keys.c = inputKeys.c || false
  keys.v = inputKeys.v || false
}

/**
 * Reset all keys (prevent stuck keys on blur or chat open)
 */
function resetKeys() {
  keys.w = false
  keys.a = false
  keys.s = false
  keys.d = false
  keys.z = false
  keys.x = false
  keys.c = false
  keys.v = false
}

onMounted(() => {
  emitter.on('input:update', handleInputUpdate)
  emitter.on('ui:chat-opened', resetKeys)
  window.addEventListener('blur', resetKeys)
})

onUnmounted(() => {
  emitter.off('input:update', handleInputUpdate)
  emitter.off('ui:chat-opened', resetKeys)
  window.removeEventListener('blur', resetKeys)
})
</script>

<template>
  <div class="key-feedback mc-text">
    <!-- Movement Keys -->
    <div class="key-row">
      <div class="key-cap" :class="{ pressed: keys.w }">
        W
      </div>
    </div>
    <div class="key-row">
      <div class="key-cap" :class="{ pressed: keys.a }">
        A
      </div>
      <div class="key-cap" :class="{ pressed: keys.s }">
        S
      </div>
      <div class="key-cap" :class="{ pressed: keys.d }">
        D
      </div>
    </div>

    <!-- Action/Combat Keys -->
    <div class="key-row spacer-v" />
    <div class="key-row">
      <div class="key-cap" :class="{ pressed: keys.z }">
        Z
      </div>
      <div class="key-cap" :class="{ pressed: keys.x }">
        X
      </div>
      <div class="key-cap" :class="{ pressed: keys.c }">
        C
      </div>
      <div class="key-cap" :class="{ pressed: keys.v }">
        V
      </div>
    </div>
  </div>
</template>

<style scoped>
.key-feedback {
  display: flex;
  flex-direction: column;
  align-items: center; /* Align to the right to match InfoPanel */
  gap: calc(2px * var(--hud-scale));
  padding-top: calc(4px * var(--hud-scale));
  pointer-events: none;
}

.key-row {
  display: flex;
  gap: calc(2px * var(--hud-scale));
  justify-content: flex-end;
}

.spacer-v {
  height: calc(2px * var(--hud-scale));
}

.key-cap {
  width: calc(16px * var(--hud-scale));
  height: calc(16px * var(--hud-scale));
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  border: calc(1px * var(--hud-scale)) solid rgba(255, 255, 255, 0.1);
  color: #e0e0e0;
  font-size: calc(8px * var(--hud-scale));
  text-shadow: 1px 1px 0 #3f3f3f;
  transition: all 0.05s ease;
  border-radius: calc(1px * var(--hud-scale));
}

.key-cap.pressed {
  background: rgba(255, 255, 255, 0.8);
  color: #000;
  text-shadow: none;
  transform: translateY(calc(1px * var(--hud-scale)));
  border-color: #fff;
}
</style>
