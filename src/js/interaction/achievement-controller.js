import { useAchievementStore } from '../../pinia/achievementStore.js'
import emitter from '../utils/event/event-bus.js'

export default class AchievementController {
  constructor() {
    this.store = useAchievementStore()
    this.playTime = 0
    this.hasUnlockedPlayTime = false
    this.punchCount = 0
    this.cameraSwitchCount = 0
    this.lastCameraSwitchTime = 0
    this.setupListeners()
  }

  setupListeners() {
    emitter.once('game:create_world', () => this.store.unlock('first_world'))
    emitter.once('game:reset_world', () => this.store.unlock('first_world'))
    emitter.once('input:jump', () => this.store.unlock('first_jump'))
    emitter.once('input:air_swing', () => this.store.unlock('first_punch'))
    emitter.once('input:telescope', () => this.store.unlock('first_zoom'))
    emitter.once('input:rear_view', (isPressed) => {
      if (isPressed)
        this.store.unlock('first_rear_view')
    })
    emitter.once('input:cycle_camera_shoulder', () => this.store.unlock('first_perspective'))
    emitter.once('ui:chat-opened', () => this.store.unlock('first_chat'))
    emitter.once('player:block_break', () => this.store.unlock('first_mine'))
    emitter.once('player:block_place', () => this.store.unlock('first_place'))
    emitter.once('player:damage_enemy', () => this.store.unlock('first_damage_enemy'))
    emitter.once('player:take_damage', () => this.store.unlock('first_hurt'))

    // Listen for sprint/run in input update and unbind once achieved
    const onInputUpdate = (keys) => {
      if (keys.sprint && (keys.forward || keys.backward || keys.left || keys.right)) {
        this.store.unlock('first_run')
        emitter.off('input:update', onInputUpdate)
      }
    }
    emitter.on('input:update', onInputUpdate)

    // Hiker: 徒步旅行者 - 到达距离原点 chunk(0,0) 3 个 chunk 以上的区域
    const HIKER_CHUNK_THRESHOLD = 3
    const onChunkBuilt = ({ chunkX, chunkZ }) => {
      if (this.store.unlocked.hiker)
        return
      if (Math.max(Math.abs(chunkX), Math.abs(chunkZ)) >= HIKER_CHUNK_THRESHOLD) {
        this.store.unlock('hiker')
        emitter.off('game:chunk-built', onChunkBuilt)
      }
    }
    emitter.on('game:chunk-built', onChunkBuilt)

    // Rage Quit: 无能狂怒 - 连续挥拳10次不打中任何东西
    const onPunch = () => {
      if (this.store.unlocked.rage_quit)
        return
      this.punchCount++
      if (this.punchCount >= 10) {
        this.store.unlock('rage_quit')
      }
    }
    emitter.on('input:air_swing', onPunch)

    const resetPunch = () => {
      this.punchCount = 0
    }
    emitter.on('player:block_place', resetPunch)
    emitter.on('player:block_break', resetPunch)
    emitter.on('player:damage_enemy', resetPunch)
    emitter.on('player:take_damage', resetPunch)

    // Who Am I: 我是谁我在那 - 1秒内快速切换视角5次
    const onCameraSwitch = () => {
      if (this.store.unlocked.who_am_i)
        return
      const now = performance.now()
      if (now - this.lastCameraSwitchTime < 1000) {
        this.cameraSwitchCount++
        if (this.cameraSwitchCount >= 5) {
          this.store.unlock('who_am_i')
        }
      }
      else {
        this.cameraSwitchCount = 1
      }
      this.lastCameraSwitchTime = now
    }
    emitter.on('input:cycle_camera_shoulder', onCameraSwitch)
  }

  update(_dt) {
    if (!this.hasUnlockedPlayTime) {
      this.playTime += _dt
      if (this.playTime > 5 * 60 * 1000) { // 5 minutes in ms
        this.store.unlock('play_5_mins')
        this.hasUnlockedPlayTime = true
      }
    }
  }
}
