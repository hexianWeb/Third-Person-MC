<script setup>
/**
 * HowToPlay - Main Menu paged tutorial (placeholder-first)
 * - 先用 div 画面占位符把页面结构与交互跑通
 * - 后续图片生成完成后，再替换占位符为 <img>
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useUiStore } from '../../vue/uiStore.js'

const ui = useUiStore()

// 说明：此处文案与键位来自计划书（极简指令风 / 纯英文）
const pages = [
  {
    id: 'quickstart',
    title: 'Quick Start',
    illustrationLayout: 'comic2x2',
    images: ['1-1.png', '1-2.png', '1-3.png', '1-4.png'],
    body: [
      'Pick a portal and step in.',
      'Explore fast, fight smart, and stay moving.',
      'If you get lost, come back and reset your run.',
    ],
    keybinds: [{ action: 'Open Menu', key: 'Esc' }],
  },
  {
    id: 'movement-camera',
    title: 'Move & Camera',
    illustrationLayout: 'comic2x2',
    images: ['2-1.png', '2-2.png', '2-3.png', '2-4.png'],
    body: [
      'Move with WASD or Arrow Keys.',
      'Hold Shift to sprint.',
      'Hold V to sneak for control.',
      'Press Tab to switch camera side.',
    ],
    keybinds: [
      { action: 'Move', key: 'W/A/S/D (or Arrow Keys)' },
      { action: 'Jump', key: 'Space' },
      { action: 'Sprint', key: 'Shift' },
      { action: 'Sneak', key: 'V' },
      { action: 'Switch Camera Side', key: 'Tab' },
    ],
  },
  {
    id: 'combat',
    title: 'Combat Basics',
    illustrationLayout: 'comic2x2',
    images: ['3-1.png', '3-2.png', '3-3.png', '3-4.png'],
    body: [
      'Left click for a light attack.',
      'Right click for a heavy attack.',
      'Press C to block and time your defense.',
    ],
    keybinds: [
      { action: 'Light Attack', key: 'Mouse Left' },
      { action: 'Heavy Attack', key: 'Mouse Right' },
      { action: 'Block', key: 'C' },
    ],
  },
  {
    id: 'build-edit',
    title: 'Build / Edit',
    illustrationLayout: 'comic2x2',
    images: ['4-1.png', '4-2.png', '4-3.png', '4-4.png'],
    body: [
      'Press Q to toggle block edit mode.',
      'Place or remove blocks to shape your path.',
      'Use edits to gain height, cover, or escape routes.',
    ],
    keybinds: [{ action: 'Toggle Block Edit Mode', key: 'Q' }],
  },
  {
    id: 'tips-ui',
    title: 'Tips & UI',
    illustrationLayout: 'comic2x2',
    images: ['5-1.png', '5-2.png', '5-3.png', '5-4.png'],
    body: [
      'Stay calm: move, hit, reset.',
      'Sprint to reposition and commit when it’s safe.',
      'Sneak (V) for tighter control when you need it.',
      'Press Esc anytime to return to the menu.',
    ],
    keybinds: [
      { action: 'Open Menu', key: 'Esc' },
      // Optional page navigation:
      // { action: 'Prev/Next Page', key: 'ArrowLeft / ArrowRight' },
    ],
  },
]

const currentIndex = ref(0)
const currentPage = computed(() => pages[currentIndex.value])

const progressLabel = computed(() => `${currentIndex.value + 1} / ${pages.length}`)
const backLabel = computed(() => (currentIndex.value === 0 ? 'Main Menu' : 'Back'))
const nextLabel = computed(() =>
  currentIndex.value === pages.length - 1 ? 'Done' : 'Next',
)

function goBack() {
  if (currentIndex.value > 0) {
    currentIndex.value -= 1
    return
  }
  // 第 1 页返回主菜单 root
  ui.exitHowToPlay()
}

function goNext() {
  if (currentIndex.value < pages.length - 1) {
    currentIndex.value += 1
    return
  }
  // 第 5 页 Done 返回主菜单 root
  ui.exitHowToPlay()
}

function handleKeydown(event) {
  // 注意：ESC 由 UiRoot 的 ui:escape 统一处理（store 会回到 root）
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    goBack()
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    goNext()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="howto">
    <header class="howto__header">
      <div class="howto__headerLeft">
        <div class="howto__title mc-text">
          How to Play
        </div>
      </div>
      <div class="howto__headerRight">
        <div class="howto__progress mc-text">
          {{ progressLabel }}
        </div>
      </div>
    </header>

    <main class="mc-panel howto__panel">
      <div class="howto__panelTitle mc-text">
        {{ currentPage.title }}
      </div>

      <!-- 画面占位符（后续替换为图片） -->
      <div class="howto__illustration">
        <div class="illus illus--comic">
          <div v-for="imgName in currentPage.images" :key="imgName" class="comicCell">
            <img
              :src="`/img/howToPlayer/${imgName}`"
              :alt="imgName"
              class="comicImg"
              loading="lazy"
            >
          </div>
        </div>
      </div>

      <!-- 文案 -->
      <ul class="howto__body">
        <li v-for="line in currentPage.body" :key="line" class="howto__bodyLine mc-text">
          {{ line }}
        </li>
      </ul>

      <!-- 按键表（可选但推荐） -->
      <div v-if="currentPage.keybinds?.length" class="howto__keybinds">
        <div class="howto__keybindsTitle mc-text">
          Controls
        </div>
        <div class="howto__keybindGrid">
          <div
            v-for="item in currentPage.keybinds"
            :key="`${item.action}:${item.key}`"
            class="howto__keybindRow"
          >
            <div class="howto__keybindAction mc-text">
              {{ item.action }}
            </div>
            <div class="howto__keybindKey mc-text">
              {{ item.key }}
            </div>
          </div>
        </div>
      </div>
    </main>

    <footer class="mc-menu double howto__footer">
      <button class="mc-button half" @click="goBack">
        <span class="title">{{ backLabel }}</span>
      </button>
      <button class="mc-button half" @click="goNext">
        <span class="title">{{ nextLabel }}</span>
      </button>
    </footer>
  </div>
</template>

<style scoped>
.howto {
  width: min(920px, 92vw);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.howto__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 2px;
}

.howto__title {
  color: #fff;
  font-size: 22px;
  text-shadow: 2px 2px #000;
}

.howto__progress {
  color: #aaa;
  font-size: 14px;
  text-shadow: 1px 1px #000;
}

.howto__panel {
  width: 100%;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.howto__panelTitle {
  color: #222;
  font-size: 18px;
}

.howto__illustration {
  width: 100%;
}

.illus {
  width: 100%;
  aspect-ratio: 16 / 9;
  border: 2px solid rgba(0, 0, 0, 0.25);
  background:
    radial-gradient(120% 120% at 20% 10%, rgba(120, 200, 255, 0.28), rgba(0, 0, 0, 0) 60%),
    radial-gradient(120% 120% at 80% 80%, rgba(255, 120, 120, 0.18), rgba(0, 0, 0, 0) 55%),
    linear-gradient(135deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.02));
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.06);
}

.illus--comic {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 6px;
  padding: 6px;
  background:
    linear-gradient(0deg, rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.01));
}

.comicCell {
  border: 2px solid rgba(0, 0, 0, 0.18);
  background:
    linear-gradient(135deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.02)),
    radial-gradient(100% 100% at 30% 20%, rgba(140, 220, 255, 0.22), rgba(0, 0, 0, 0) 60%),
    radial-gradient(100% 100% at 70% 80%, rgba(255, 170, 120, 0.18), rgba(0, 0, 0, 0) 55%);
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.06);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.comicImg {
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated;
  display: block;
}

.howto__body {
  margin: 0;
  padding: 0 0 0 18px;
  display: grid;
  gap: 6px;
}

.howto__bodyLine {
  color: #333;
  font-size: 14px;
  line-height: 1.35;
}

.howto__keybinds {
  border-top: 1px solid rgba(0, 0, 0, 0.12);
  padding-top: 10px;
}

.howto__keybindsTitle {
  color: #333;
  font-size: 14px;
  margin-bottom: 8px;
}

.howto__keybindGrid {
  display: grid;
  gap: 6px;
}

.howto__keybindRow {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: center;
}

.howto__keybindAction {
  color: #444;
  font-size: 13px;
}

.howto__keybindKey {
  color: #111;
  font-size: 13px;
  padding: 2px 8px;
  border: 1px solid rgba(0, 0, 0, 0.22);
  background: rgba(255, 255, 255, 0.45);
}

.howto__footer {
  width: 100%;
}
</style>
