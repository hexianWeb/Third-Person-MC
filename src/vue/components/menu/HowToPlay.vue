<script setup>
import { useUiStore } from '@pinia/uiStore.js'
/**
 * HowToPlay - Main Menu paged tutorial
 * - 2x2 四格图，单张合成图用 CSS 拆格显示
 * - 文案与按键表通过 i18n 获取
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const ui = useUiStore()
const { t } = useI18n()

// 页面配置：文案与按键表通过 i18n 获取（howto.pages.{pageKey}）
const pages = [
  { id: 'movement-camera', image: '1.png', bodyCount: 5, keybindCount: 9 },
  { id: 'combat', image: '2.png', bodyCount: 3, keybindCount: 3 },
  { id: 'build-edit', image: '3.png', bodyCount: 3, keybindCount: 2 },
  { id: 'achievements', image: '4.png', bodyCount: 3, keybindCount: 2 },
  { id: 'tips-ui', image: '5.png', bodyCount: 6, keybindCount: 2 },
]

/** 将 page id 转为 i18n key（movement-camera -> movement_camera） */
function pageI18nKey(id) {
  return id.replace(/-/g, '_')
}

const currentIndex = ref(0)
const currentPage = computed(() => pages[currentIndex.value])

const progressLabel = computed(() => `${currentIndex.value + 1} / ${pages.length}`)
const backLabel = computed(() => (currentIndex.value === 0 ? t('howto.mainMenu') : t('howto.prev')))
const nextLabel = computed(() =>
  currentIndex.value === pages.length - 1 ? t('howto.done') : t('howto.next'),
)

function goBack() {
  if (currentIndex.value > 0) {
    currentIndex.value -= 1
    return
  }
  ui.exitHowToPlay()
}

function goNext() {
  if (currentIndex.value < pages.length - 1) {
    currentIndex.value += 1
    return
  }
  ui.exitHowToPlay()
}

function handleKeydown(event) {
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
          {{ $t('howto.title') }}
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
        {{ $t(`howto.pages.${pageI18nKey(currentPage.id)}.title`) }}
      </div>

      <!-- 2x2 四格图：单张合成图用 CSS 拆成四格，hover 有动效 -->
      <div class="howto__illustration">
        <div class="illus illus--comic">
          <div
            v-for="idx in 4"
            :key="idx"
            class="comicCell comicCell--quadrant"
            :style="{ backgroundImage: `url(/img/howToPlayer/${currentPage.image})` }"
          />
        </div>
      </div>

      <!-- 文案（i18n） -->
      <ul class="howto__body">
        <li
          v-for="i in currentPage.bodyCount"
          :key="i"
          class="howto__bodyLine mc-text"
        >
          {{ $t(`howto.pages.${pageI18nKey(currentPage.id)}.body.${i - 1}`) }}
        </li>
      </ul>

      <!-- 按键表（i18n） -->
      <div v-if="currentPage.keybindCount" class="howto__keybinds">
        <div class="howto__keybindsTitle mc-text">
          {{ $t('howto.controls') }}
        </div>
        <div class="howto__keybindGrid">
          <div
            v-for="i in currentPage.keybindCount"
            :key="i"
            class="howto__keybindRow"
          >
            <div class="howto__keybindAction mc-text">
              {{ $t(`howto.pages.${pageI18nKey(currentPage.id)}.keybinds.${i - 1}.action`) }}
            </div>
            <div class="howto__keybindKey mc-text">
              {{ $t(`howto.pages.${pageI18nKey(currentPage.id)}.keybinds.${i - 1}.key`) }}
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
/* 保证上一页/下一页按钮组始终可见 */
.howto {
  width: min(920px, 92vw);
  max-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.howto__header {
  flex-shrink: 0;
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
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
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
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.06);
  overflow: hidden;
  min-height: 0;
  transition:
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.25s ease,
    filter 0.25s ease;
}

.comicCell:hover {
  transform: scale(1.06) rotate(1deg);
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.2),
    0 4px 16px rgba(255, 220, 100, 0.25);
  filter: brightness(1.08);
}

/* 单张 2x2 图拆成四格 */
.comicCell--quadrant {
  background-color: rgba(0, 0, 0, 0.1);
  background-size: 200% 200%;
  background-repeat: no-repeat;
  image-rendering: pixelated;
}

.comicCell--quadrant:nth-child(1) { background-position: 0 0; }
.comicCell--quadrant:nth-child(2) { background-position: 100% 0; }
.comicCell--quadrant:nth-child(3) { background-position: 0 100%; }
.comicCell--quadrant:nth-child(4) { background-position: 100% 100%; }

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
  flex-shrink: 0;
  width: 100%;
}
</style>
