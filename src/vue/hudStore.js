/**
 * HUD Store - Minecraft Style HUD State Management
 * Manages health, hunger, experience, hotbar, position, and chat messages
 */
import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import emitter from '../js/utils/event-bus.js'

export const useHudStore = defineStore('hud', () => {
  // ========================================
  // Player Stats (Mock Data)
  // ========================================

  /** Health: 0-20, each heart = 2 HP */
  const health = ref(20)
  const maxHealth = ref(20)

  /** Hunger: 0-20, each drumstick = 2 points */
  const hunger = ref(20)
  const maxHunger = ref(20)

  /** Experience: 0-1 progress ratio */
  const experience = ref(0.37)
  /** Player level */
  const level = ref(7)

  // ========================================
  // Hotbar
  // ========================================

  /** Selected hotbar slot: 0-8 */
  const selectedSlot = ref(0)

  /** Hotbar items (9 slots) - currently empty for mock */
  const hotbarItems = ref([
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ])

  // ========================================
  // Player Position & Facing
  // ========================================

  /** Player world position */
  const position = reactive({ x: 0, y: 0, z: 0 })

  /** Player facing angle in radians (0 = +Z, PI/2 = +X) */
  const facingAngle = ref(0)

  // ========================================
  // Chat Messages
  // ========================================

  /** Chat/system messages */
  const chatMessages = ref([
    { id: 1, type: 'system', text: '[系统] 世界已建立完成', timestamp: Date.now() - 5000 },
    { id: 2, type: 'system', text: '[系统] 玩家物理碰撞已加载', timestamp: Date.now() - 3000 },
    { id: 3, type: 'system', text: '[系统] 相机使用默认参数', timestamp: Date.now() - 1000 },
  ])

  /** Next message ID */
  let nextMessageId = 4

  // ==================== Chat State ====================
  const isChatOpen = ref(false)

  // ==================== Info Panel State ====================
  const gameTime = ref('12:00 PM')
  const gameDay = ref(1)
  const fps = ref(60)
  const playerCount = ref(1)
  const serverName = ref('Local server')

  // ========================================
  // Actions
  // ========================================

  function toggleChat() {
    isChatOpen.value = !isChatOpen.value
    // Emit event for GameHud to handle pointer lock
    if (isChatOpen.value) {
      emitter.emit('ui:chat-opened')
    }
    else {
      emitter.emit('ui:chat-closed')
    }
  }

  function closeChat() {
    isChatOpen.value = false
    emitter.emit('ui:chat-closed')
  }

  function sendMessage(text) {
    if (text.trim()) {
      addMessage(text, 'chat') // Type 'chat' for user messages
    }
    closeChat()
  }

  /**
   * Update player position and facing from Three.js
   * @param {{ position: THREE.Vector3, facingAngle: number }} data
   */
  function updatePlayerInfo(data) {
    if (data.position) {
      position.x = data.position.x
      position.y = data.position.y
      position.z = data.position.z
    }
    if (typeof data.facingAngle === 'number') {
      facingAngle.value = data.facingAngle
    }
    if (typeof data.fps === 'number') {
      fps.value = data.fps
    }
  }

  /**
   * Select hotbar slot
   * @param {number} slot - 0-8
   */
  function selectSlot(slot) {
    if (slot >= 0 && slot <= 8) {
      selectedSlot.value = slot
    }
  }

  /**
   * Cycle hotbar slot (mouse wheel)
   * @param {number} delta - +1 or -1
   */
  function cycleSlot(delta) {
    let newSlot = selectedSlot.value + delta
    if (newSlot < 0)
      newSlot = 8
    if (newSlot > 8)
      newSlot = 0
    selectedSlot.value = newSlot
  }

  /**
   * Add a chat message
   * @param {string} text
   * @param {'system' | 'chat'} type
   */
  function addMessage(text, type = 'system') {
    chatMessages.value.push({
      id: nextMessageId++,
      type,
      text,
      timestamp: Date.now(),
    })
    // Keep only last 50 messages
    if (chatMessages.value.length > 50) {
      chatMessages.value.shift()
    }
  }

  // ========================================
  // Event Listeners Setup
  // ========================================

  function setupListeners() {
    emitter.on('hud:update', updatePlayerInfo)
    emitter.on('hud:select-slot', selectSlot)
    emitter.on('hud:cycle-slot', cycleSlot)
  }

  function cleanupListeners() {
    emitter.off('hud:update', updatePlayerInfo)
    emitter.off('hud:select-slot', selectSlot)
    emitter.off('hud:cycle-slot', cycleSlot)
  }

  // ========================================
  // Return Public API
  // ========================================

  return {
    // Stats
    health,
    maxHealth,
    hunger,
    maxHunger,
    experience,
    level,

    // Hotbar
    selectedSlot,
    hotbarItems,

    // Position & Facing
    position,
    facingAngle,

    // Chat
    chatMessages,
    isChatOpen,

    // Info Panel
    gameTime,
    gameDay,
    fps,
    playerCount,
    serverName,

    // Actions
    updatePlayerInfo,
    selectSlot,
    cycleSlot,
    addMessage,
    toggleChat,
    closeChat,
    sendMessage,

    // Lifecycle
    setupListeners,
    cleanupListeners,
  }
})
