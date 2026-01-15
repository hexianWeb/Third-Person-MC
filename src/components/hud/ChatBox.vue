<script setup>
/**
 * ChatBox - System/chat message display & Input
 * Shows messages in bottom-left corner with fade effect
 * Handles user input with 'T' key
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useHudStore } from '../../vue/hudStore.js'

const hud = useHudStore()

// Message fade timeout (ms)
const FADE_TIMEOUT = 5000

// Track which messages are fading
const fadingMessages = ref(new Set())
const chatInput = ref(null) // Template ref
const inputValue = ref('')

// Check if message should be fading
function isMessageFading(msg) {
  // If chat is OPEN, show all messages fully opaque
  if (hud.isChatOpen)
    return false
  return Date.now() - msg.timestamp > FADE_TIMEOUT
}

// Get visible messages (last 10 when open, last 5 when closed)
const visibleMessages = computed(() => {
  const count = hud.isChatOpen ? 10 : 5
  // If open, we might want to scroll? For now just show more recent ones
  return hud.chatMessages.slice(-count)
})

// Auto-focus input when chat opens
watch(() => hud.isChatOpen, (isOpen) => {
  if (isOpen) {
    inputValue.value = ''
    nextTick(() => {
      chatInput.value?.focus()
    })
  }
})

function handleSend() {
  hud.sendMessage(inputValue.value)
}

function handleClose() {
  hud.closeChat()
}

// Update fading state periodically
let fadeInterval = null
onMounted(() => {
  fadeInterval = setInterval(() => {
    // If chat is open, don't update fading (all visible)
    if (hud.isChatOpen) {
      fadingMessages.value = new Set()
      return
    }
    const newFading = new Set()
    hud.chatMessages.forEach((msg) => {
      if (isMessageFading(msg)) {
        newFading.add(msg.id)
      }
    })
    fadingMessages.value = newFading
  }, 500)
})

onUnmounted(() => {
  if (fadeInterval) {
    clearInterval(fadeInterval)
  }
})
</script>

<template>
  <div class="chat-container">
    <!-- Message History -->
    <div class="chat-history" :class="{ open: hud.isChatOpen }">
      <div
        v-for="msg in visibleMessages"
        :key="msg.id"
        class="chat-message mc-text"
        :class="[msg.type, { fading: fadingMessages.has(msg.id) }]"
      >
        <span v-if="msg.type === 'chat'" class="chat-prefix mc-text">&lt;Player&gt; </span>
        {{ msg.text }}
      </div>
    </div>

    <!-- Input Box -->
    <div v-if="hud.isChatOpen" class="chat-input-wrapper mc-text">
      <input
        ref="chatInput"
        v-model="inputValue"
        type="text"
        class="chat-input mc-text"
        maxlength="100"
        @keydown.enter="handleSend"
        @keydown.esc="handleClose"
        @blur="handleClose"
      >
    </div>
  </div>
</template>

<style scoped>
.chat-container {
  position: absolute;
  bottom: calc(40px * var(--hud-scale));
  left: calc(10px * var(--hud-scale));
  width: calc(200px * var(--hud-scale));
  display: flex;
  flex-direction: column;
  gap: calc(2px * var(--hud-scale));
}

.chat-history {
  display: flex;
  flex-direction: column;
  gap: calc(1px * var(--hud-scale));
  /* Gradient background when open */
  background: v-bind('hud.isChatOpen ? "rgba(0,0,0,0.5)" : "transparent"');
  padding: calc(2px * var(--hud-scale));
  border-radius: calc(1px * var(--hud-scale));
}

.chat-message {
  font-size: calc(6px * var(--hud-scale));
  color: var(--chat-text-color);
  text-shadow: 1px 1px 0 var(--chat-text-shadow);
  opacity: 1;
  transition: opacity 0.5s ease-out;
  line-height: 1.2;
}

.chat-message.fading {
  opacity: 0; /* Fully fade out instead of 0.3 */
}

.chat-message.system {
  color: #ffff55;
}

.chat-input-wrapper {
  background: rgba(0, 0, 0, 0.7);
  padding: calc(1px * var(--hud-scale));
  border: 1px solid #a0a0a0;
}

.chat-input {
  width: 100%;
  background: transparent;
  border: none;
  font-family: inherit;
  font-size: calc(6px * var(--hud-scale));
  color: white;
  outline: none;
  padding: 0;
}
</style>
