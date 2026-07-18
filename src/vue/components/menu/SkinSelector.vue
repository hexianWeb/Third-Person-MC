<script setup>
import { useSkinStore } from '@pinia/skinStore.js'
import { useUiStore } from '@pinia/uiStore.js'
import { mountSkinPreview } from '@three/components/skin-preview-lifecycle.js'
import SkinPreviewScene from '@three/components/skin-preview-scene.js'
import {
  ANIMATION_BUTTONS,
  CANONICAL_MODEL_PATH,
  CUSTOM_SKIN_ID,
  SKIN_LIST,
} from '@three/config/skin-config.js'
/**
 * SkinSelector - 皮肤选择界面
 * - 上方: 3D 预览区域（左侧动画按钮组 + 旋转控制）
 * - 下方: 皮肤卡片选择
 * - 底部: 取消/应用按钮
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'

const skinStore = useSkinStore()
const ui = useUiStore()

// 模板引用
const previewCanvas = ref(null)
const previewContainer = ref(null)
const customFileInput = ref(null)

// 预览场景实例
const previewScene = ref(null)

// 当前播放的动画 ID
const currentAnim = ref('idle')
/** 自定义皮肤卡片缩略图 Object URL */
const customThumbUrl = ref(null)
let isUnmounted = false

// ----------------------------------------
// 动画播放
// ----------------------------------------

/**
 * 播放指定动画
 * @param {string} animId - 动画 ID
 */
function playAnimation(animId) {
  currentAnim.value = animId
  const btn = ANIMATION_BUTTONS.find(b => b.id === animId)
  if (btn && previewScene.value) {
    previewScene.value.playAnimation(btn.clip)
  }
}

// ----------------------------------------
// 旋转控制
// ----------------------------------------

function rotateLeft() {
  previewScene.value?.rotate(-Math.PI / 4)
}

function rotateRight() {
  previewScene.value?.rotate(Math.PI / 4)
}

function resetRotation() {
  previewScene.value?.resetRotation()
}

// ----------------------------------------
// 皮肤选择
// ----------------------------------------

/**
 * 选择皮肤（仅更新预览）
 * @param {string} skinId - 皮肤 ID
 */
function selectSkin(skinId) {
  skinStore.setPreviewSkin(skinId)
}

/**
 * 选择自定义皮肤卡片：已有 blob 则预览，否则打开文件选择
 */
function selectCustomSkin() {
  const hasBlob = skinStore.pendingCustomSkin || skinStore.committedCustomSkin
  if (hasBlob) {
    skinStore.setPreviewSkin(CUSTOM_SKIN_ID)
    return
  }
  customFileInput.value?.click()
}

/**
 * 自定义 PNG 上传
 * @param {Event} event
 */
async function onCustomFileChange(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file)
    return
  await skinStore.setPendingCustomSkin(file)
}

/**
 * 按 store 预览状态刷新 3D 贴图（不重载模型）
 */
async function applyPreviewFromStore() {
  const preview = previewScene.value
  if (!preview)
    return

  const id = skinStore.previewSkinId
  if (id === CUSTOM_SKIN_ID) {
    const blob = skinStore.pendingCustomSkin || skinStore.committedCustomSkin
    if (blob)
      await preview.applyCustomBlob(blob)
    return
  }

  const skin = SKIN_LIST.find(s => s.id === id)
  if (skin?.texturePath)
    await preview.applyPresetTextureFromUrl(skin.texturePath)
}

// ----------------------------------------
// 应用 / 取消
// ----------------------------------------

async function apply() {
  const result = await skinStore.applySkin()
  if (result?.ok !== false)
    ui.exitSkinSelector()
}

function cancel() {
  skinStore.cancelPreview()
  ui.exitSkinSelector()
}

// ----------------------------------------
// 尺寸调整
// ----------------------------------------

/**
 * 更新画布尺寸
 */
function updateCanvasSize() {
  if (!previewContainer.value || !previewScene.value)
    return

  const rect = previewContainer.value.getBoundingClientRect()
  previewScene.value.resize(rect.width, rect.height)
}

// ----------------------------------------
// 生命周期
// ----------------------------------------

onMounted(async () => {
  // 初始化皮肤预览状态
  skinStore.initPreview()

  if (!previewCanvas.value)
    return

  try {
    const preview = await mountSkinPreview({
      createPreview: () => SkinPreviewScene.create(previewCanvas.value),
      isUnmounted: () => isUnmounted,
    })
    if (!preview)
      return

    previewScene.value = preview
    updateCanvasSize()
    window.addEventListener('resize', updateCanvasSize)

    // 只加载一次 canonical 模型，再按 store 换贴图
    await preview.loadCanonicalModel(CANONICAL_MODEL_PATH)
    if (isUnmounted)
      return
    await applyPreviewFromStore()
  }
  catch (error) {
    console.error('[SkinSelector] Failed to initialize WebGPU preview:', error)
  }
})

onUnmounted(() => {
  isUnmounted = true

  // 移除窗口事件监听
  window.removeEventListener('resize', updateCanvasSize)

  // 清理预览场景资源
  previewScene.value?.dispose()
  previewScene.value = null

  // 撤销自定义缩略图 URL
  if (customThumbUrl.value) {
    URL.revokeObjectURL(customThumbUrl.value)
    customThumbUrl.value = null
  }
})

// ----------------------------------------
// 监听预览皮肤变化（贴图替换，不重载 GLB）
// ----------------------------------------

watch(
  () => [
    skinStore.previewSkinId,
    skinStore.previewRevision,
    skinStore.pendingCustomSkin,
    skinStore.committedCustomSkin,
  ],
  async () => {
    if (!previewScene.value)
      return
    await applyPreviewFromStore()
    currentAnim.value = 'idle'
  },
)

// 同步自定义卡片缩略图（pending 优先）
watch(
  () => [skinStore.pendingCustomSkin, skinStore.committedCustomSkin],
  ([pending, committed]) => {
    if (customThumbUrl.value) {
      URL.revokeObjectURL(customThumbUrl.value)
      customThumbUrl.value = null
    }
    const blob = pending || committed
    if (blob)
      customThumbUrl.value = URL.createObjectURL(blob)
  },
  { immediate: true },
)
</script>

<template>
  <div class="skin-selector">
    <h2 class="skin-title mc-text">
      {{ $t('menu.selectSkin') }}
    </h2>

    <!-- 预览区域（上方） -->
    <div class="skin-preview-section">
      <!-- 左侧动画按钮组 -->
      <div class="anim-buttons">
        <button
          v-for="(btn, index) in ANIMATION_BUTTONS"
          :key="btn.id"
          class="anim-btn mc-button-pixel"
          :class="{ active: currentAnim === btn.id }"
          :title="$t(btn.labelKey)"
          @click="playAnimation(btn.id)"
        >
          <div
            class="anim-icon"
            :style="{
              backgroundPositionX: `calc(${index} * 100% / 7)`,
            }"
          />
        </button>
      </div>

      <!-- 3D 预览区域 -->
      <div ref="previewContainer" class="skin-preview">
        <canvas ref="previewCanvas" />
        <div v-if="skinStore.isLoading" class="loading-spinner" />

        <!-- 旋转控制 -->
        <div class="rotate-controls">
          <button class="rotate-btn mc-button-pixel" @click="rotateLeft">
            ◀
          </button>
          <button
            class="rotate-btn mc-button-pixel reset"
            @click="resetRotation"
          >
            🔄
          </button>
          <button class="rotate-btn mc-button-pixel" @click="rotateRight">
            ▶
          </button>
        </div>
      </div>
    </div>

    <!-- 皮肤选择区域（下方） -->
    <div class="skin-list">
      <div
        v-for="skin in SKIN_LIST"
        :key="skin.id"
        class="skin-card"
        :class="{
          selected: skin.id === skinStore.previewSkinId,
          equipped: skin.id === skinStore.currentSkinId,
        }"
        @click="selectSkin(skin.id)"
      >
        <div class="skin-thumb">
          <img
            :src="skin.thumbnail"
            :alt="$t(skin.nameKey)"
            class="skin-thumbnail"
          >
        </div>
        <span class="skin-name mc-text">{{ $t(skin.nameKey) }}</span>
        <span
          v-if="skin.id === skinStore.currentSkinId"
          class="equipped-badge mc-text"
        >
          ✓ {{ $t('skin.equipped') }}
        </span>
      </div>

      <!-- 自定义上传卡片 -->
      <div
        class="skin-card"
        :class="{
          selected: skinStore.previewSkinId === CUSTOM_SKIN_ID,
          equipped: skinStore.currentSkinId === CUSTOM_SKIN_ID,
        }"
        @click="selectCustomSkin"
      >
        <div class="skin-thumb">
          <img
            v-if="customThumbUrl"
            :src="customThumbUrl"
            :alt="$t('skin.custom')"
            class="skin-thumbnail"
          >
          <span v-else class="skin-upload-label mc-text">{{ $t('skin.upload') }}</span>
        </div>
        <span class="skin-name mc-text">{{ $t('skin.custom') }}</span>
        <span class="skin-upload-hint mc-text">{{ $t('skin.uploadHint') }}</span>
        <span
          v-if="skinStore.currentSkinId === CUSTOM_SKIN_ID"
          class="equipped-badge mc-text"
        >
          ✓ {{ $t('skin.equipped') }}
        </span>
        <input
          ref="customFileInput"
          type="file"
          accept="image/png"
          class="skin-file-input"
          @change="onCustomFileChange"
          @click.stop
        >
      </div>
    </div>

    <p v-if="skinStore.errorKey" class="skin-error mc-text">
      {{ $t(skinStore.errorKey) }}
    </p>

    <!-- 操作按钮（最下方） -->
    <div class="mc-menu double skin-actions">
      <button class="mc-button half mc-button-large" @click="cancel">
        <span class="title">{{ $t('common.cancel') }}</span>
      </button>
      <button
        class="mc-button half mc-button-large"
        :disabled="!skinStore.hasPreviewChanges || skinStore.isLoading"
        @click="apply"
      >
        <span class="title">{{ $t('common.apply') }}</span>
      </button>
    </div>

    <!-- 皮肤作者致谢 -->
    <div class="skin-credits">
      <p class="credits-text mc-text">
        {{ $t('skin.credits') }}
      </p>
      <div class="credits-links">
        <a
          href="https://www.planetminecraft.com/member/hibiki_ekko/"
          target="_blank"
          rel="noopener noreferrer"
          class="credit-link mc-text"
        >
          hibiki_ekko
        </a>
        <span class="credits-separator"> & </span>
        <a
          href="https://www.minecraftskins.com/profile/5521971/holland0519"
          target="_blank"
          rel="noopener noreferrer"
          class="credit-link mc-text"
        >
          holland0519
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Minecraft 像素边框 mixin */
.mc-border {
  /* 外层深色边框 */
  box-shadow:
    0 -2px 0 0 rgba(0, 0, 0, 0.55),
    -2px 0 0 0 rgba(0, 0, 0, 0.55),
    /* 顶部和左侧高光 */ 0 -4px 0 0 rgba(255, 255, 255, 0.25) inset,
    -4px 0 0 0 rgba(255, 255, 255, 0.25) inset,
    /* 底部和右侧阴影 */ 0 4px 0 0 rgba(0, 0, 0, 0.4) inset,
    4px 0 0 0 rgba(0, 0, 0, 0.4) inset;
}

.skin-selector {
  width: min(600px, 92vw);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  font-family: 'MinecraftV2', sans-serif;
}

.skin-title {
  color: #fff;
  font-size: 24px;
  text-shadow: 3px 3px 0 #3f3f3f;
  text-align: center;
  margin: 0;
  letter-spacing: 2px;
  font-family: 'MinecraftV2', sans-serif;
}

/* 预览区域 */
.skin-preview-section {
  display: flex;
  gap: 8px;
}

/* 左侧动画按钮组 */
.anim-buttons {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.anim-btn {
  width: 48px;
  height: 48px;
  font-size: 1.5rem;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;

  /* Minecraft 按钮样式 */
  background: linear-gradient(180deg, #c6c6c6 0%, #8b8b8b 100%);
  border: none;
  box-shadow:
    0 -2px 0 0 rgba(0, 0, 0, 0.5),
    -2px 0 0 0 rgba(0, 0, 0, 0.5),
    0 -4px 0 0 rgba(255, 255, 255, 0.3) inset,
    -4px 0 0 0 rgba(255, 255, 255, 0.3) inset,
    0 4px 0 0 rgba(0, 0, 0, 0.35) inset,
    4px 0 0 0 rgba(0, 0, 0, 0.35) inset;
  image-rendering: pixelated;

  display: flex;
  align-items: center;
  justify-content: center;
}

.anim-icon {
  width: 32px;
  height: 32px;
  background-image: url('/textures/btns/buttons.png');
  background-repeat: no-repeat;
  background-size: 900% 100%;
  image-rendering: pixelated;
  pointer-events: none;
}

.anim-btn:hover {
  background: linear-gradient(180deg, #d8d8d8 0%, #9d9d9d 100%);
  filter: brightness(1.15);
}

.anim-btn:active {
  background: linear-gradient(180deg, #8b8b8b 0%, #c6c6c6 100%);
  box-shadow:
    0 2px 0 0 rgba(255, 255, 255, 0.3) inset,
    2px 0 0 0 rgba(255, 255, 255, 0.3) inset,
    0 -2px 0 0 rgba(0, 0, 0, 0.35) inset,
    -2px 0 0 0 rgba(0, 0, 0, 0.35) inset;
  transform: translateY(2px);
}

.anim-btn.active {
  background: linear-gradient(135deg, #85cb3a 0%, #4c8a22 100%);
  box-shadow:
    0 -2px 0 0 rgba(0, 0, 0, 0.5),
    -2px 0 0 0 rgba(0, 0, 0, 0.5),
    0 -4px 0 0 rgba(139, 195, 74, 0.5) inset,
    -4px 0 0 0 rgba(139, 195, 74, 0.5) inset,
    0 4px 0 0 rgba(0, 0, 0, 0.35) inset,
    4px 0 0 0 rgba(0, 0, 0, 0.35) inset;
}

/* 3D 预览区域 */
.skin-preview {
  flex: 1;
  position: relative;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  background: linear-gradient(180deg, #87ceeb 0%, #3a8c3a 100%);

  /* Minecraft 像素边框 */
  box-shadow:
    0 -4px 0 0 rgba(0, 0, 0, 0.5),
    -4px 0 0 0 rgba(0, 0, 0, 0.5),
    0 -6px 0 0 rgba(255, 255, 255, 0.2) inset,
    -6px 0 0 0 rgba(255, 255, 255, 0.2) inset,
    0 6px 0 0 rgba(0, 0, 0, 0.4) inset,
    6px 0 0 0 rgba(0, 0, 0, 0.4) inset;
  image-rendering: pixelated;
}

.skin-preview canvas {
  width: 100%;
  height: 100%;
  display: block;
}

/* 旋转控制 */
.rotate-controls {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
}

.rotate-btn {
  font-family: 'MinecraftV2', sans-serif !important;
  width: 44px;
  height: 44px;
  cursor: pointer;
  font-size: 1.25rem;
  transition: all 0.1s;
  border: none;

  /* Minecraft 按钮样式 */
  background: linear-gradient(180deg, #c6c6c6 0%, #8b8b8b 100%);
  box-shadow:
    0 -2px 0 0 rgba(0, 0, 0, 0.5),
    -2px 0 0 0 rgba(0, 0, 0, 0.5),
    0 -4px 0 0 rgba(255, 255, 255, 0.3) inset,
    -4px 0 0 0 rgba(255, 255, 255, 0.3) inset,
    0 4px 0 0 rgba(0, 0, 0, 0.35) inset,
    4px 0 0 0 rgba(0, 0, 0, 0.35) inset;
}

.rotate-btn:hover {
  background: linear-gradient(180deg, #d8d8d8 0%, #9d9d9d 100%);
  filter: brightness(1.15);
}

.rotate-btn:active {
  background: linear-gradient(180deg, #8b8b8b 0%, #c6c6c6 100%);
  transform: translateY(2px);
}

.rotate-btn.reset {
  background: linear-gradient(180deg, #7cb342 0%, #558b2f 100%);
}

.rotate-btn.reset:hover {
  background: linear-gradient(180deg, #8bc34a 0%, #689f38 100%);
}

/* 皮肤选择卡片列表 */
.skin-list {
  display: flex;
  justify-content: center;
  gap: 8%;
  padding: 16px;

  /* Minecraft 方块背景纹理 */
  background: repeating-linear-gradient(
      0deg,
      rgba(0, 0, 0, 0.1) 0px,
      rgba(0, 0, 0, 0.1) 2px,
      transparent 2px,
      transparent 4px
    ),
    repeating-linear-gradient(
      90deg,
      rgba(0, 0, 0, 0.1) 0px,
      rgba(0, 0, 0, 0.1) 2px,
      transparent 2px,
      transparent 4px
    ),
    linear-gradient(180deg, #4a4a4a 0%, #2a2a2a 100%);

  /* Minecraft 像素边框 */
  box-shadow:
    0 -4px 0 0 rgba(0, 0, 0, 0.5),
    -4px 0 0 0 rgba(0, 0, 0, 0.5),
    0 -6px 0 0 rgba(255, 255, 255, 0.15) inset,
    -6px 0 0 0 rgba(255, 255, 255, 0.15) inset,
    0 6px 0 0 rgba(0, 0, 0, 0.4) inset,
    6px 0 0 0 rgba(0, 0, 0, 0.4) inset;
  image-rendering: pixelated;
}

.skin-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28);
  min-width: 100px;

  /* Minecraft 按钮样式 */
  background: linear-gradient(180deg, #c6c6c6 0%, #8b8b8b 100%);
  border: none;
  box-shadow:
    0 -2px 0 0 rgba(0, 0, 0, 0.5),
    -2px 0 0 0 rgba(0, 0, 0, 0.5),
    0 -4px 0 0 rgba(255, 255, 255, 0.25) inset,
    -4px 0 0 0 rgba(255, 255, 255, 0.25) inset,
    0 4px 0 0 rgba(0, 0, 0, 0.35) inset,
    4px 0 0 0 rgba(0, 0, 0, 0.35) inset;
  image-rendering: pixelated;
  position: relative;
}

.skin-card:hover {
  transform: translateY(-4px) scale(1.02);
  filter: brightness(1.1);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);
}

.skin-card:active {
  transform: translateY(0) scale(0.98);
}

.skin-card.selected {
  background:
    linear-gradient(135deg, #85cb3a 0%, #4c8a22 100%) padding-box,
    linear-gradient(135deg, #fcea2c, #fcb40a) border-box;
  border: 2px solid transparent;
  box-shadow:
    0 0 15px rgba(133, 203, 58, 0.5),
    0 4px 12px rgba(0, 0, 0, 0.4);
}

.skin-card.equipped {
  /* 金色边框效果 */
  box-shadow:
    0 0 0 2px #ffd700,
    0 -2px 0 0 rgba(0, 0, 0, 0.5),
    -2px 0 0 0 rgba(0, 0, 0, 0.5),
    0 -4px 0 0 rgba(255, 255, 255, 0.25) inset,
    -4px 0 0 0 rgba(255, 255, 255, 0.25) inset,
    0 4px 0 0 rgba(0, 0, 0, 0.35) inset,
    4px 0 0 0 rgba(0, 0, 0, 0.35) inset;
}

.skin-thumb {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;

  /* 深色内凹边框 */
  background: rgba(0, 0, 0, 0.3);
  box-shadow:
    0 2px 0 0 rgba(255, 255, 255, 0.2) inset,
    2px 0 0 0 rgba(255, 255, 255, 0.2) inset,
    0 -2px 0 0 rgba(0, 0, 0, 0.5) inset,
    -2px 0 0 0 rgba(0, 0, 0, 0.5) inset;
}

.skin-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
  filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.3));
}

.skin-upload-label {
  font-size: 11px;
  color: #fff;
  text-shadow: 1px 1px 0 #3f3f3f;
  text-align: center;
  padding: 4px;
  font-family: 'MinecraftV2', sans-serif;
}

.skin-upload-hint {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 1px 1px 0 #3f3f3f;
  font-family: 'MinecraftV2', sans-serif;
}

.skin-file-input {
  display: none;
}

.skin-error {
  margin: 0;
  text-align: center;
  color: #ff6b6b;
  font-size: 13px;
  text-shadow: 1px 1px 0 #3f3f3f;
  font-family: 'MinecraftV2', sans-serif;
}

.skin-name {
  font-size: 14px;
  color: #fff;
  text-shadow: 2px 2px 0 #3f3f3f;
  font-weight: bold;
  letter-spacing: 1px;
  font-family: 'MinecraftV2', sans-serif;
}

.equipped-badge {
  font-size: 11px;
  color: #fff;
  background: linear-gradient(180deg, #ffd700 0%, #ffb700 100%);
  padding: 4px 10px;
  text-shadow: 1px 1px 0 #000;
  font-weight: bold;
  letter-spacing: 0.5px;
  font-family: 'MinecraftV2', sans-serif;

  /* Minecraft 像素边框 */
  box-shadow:
    0 -1px 0 0 rgba(0, 0, 0, 0.5),
    -1px 0 0 0 rgba(0, 0, 0, 0.5),
    0 -2px 0 0 rgba(255, 255, 255, 0.3) inset,
    -2px 0 0 0 rgba(255, 255, 255, 0.3) inset,
    0 2px 0 0 rgba(0, 0, 0, 0.3) inset,
    2px 0 0 0 rgba(0, 0, 0, 0.3) inset;
}

/* 操作按钮 */
.skin-actions {
  width: 100%;
}

.mc-button-large {
  height: 48px;
  font-size: 16px;
  letter-spacing: 1px;
}

/* Loading spinner - Minecraft 风格 */
.loading-spinner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 48px;
  height: 48px;

  /* 方块旋转效果 */
  background: linear-gradient(
      45deg,
      transparent 40%,
      #fff 40%,
      #fff 60%,
      transparent 60%
    ),
    linear-gradient(
      -45deg,
      transparent 40%,
      #8b8b8b 40%,
      #8b8b8b 60%,
      transparent 60%
    ),
    #c6c6c6;
  box-shadow:
    0 -2px 0 0 rgba(0, 0, 0, 0.5),
    -2px 0 0 0 rgba(0, 0, 0, 0.5),
    0 2px 0 0 rgba(0, 0, 0, 0.3),
    2px 0 0 0 rgba(0, 0, 0, 0.3);
  animation: spin 1s steps(8) infinite;
  image-rendering: pixelated;
}

@keyframes spin {
  to {
    transform: translate(-50%, -50%) rotate(360deg);
  }
}

/* 按钮文本字体 */
.mc-button .title {
  font-family: 'MinecraftV2', sans-serif;
}

/* 禁用按钮状态 */
.mc-button:disabled {
  background: linear-gradient(180deg, #5a5a5a 0%, #3a3a3a 100%);
  cursor: not-allowed;
  opacity: 0.6;
}

.mc-button:disabled:hover {
  filter: none;
  transform: none;
}

/* 皮肤作者致谢区域 */
.skin-credits {
  text-align: center;
  padding: 12px;
  margin-top: 8px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
}

.credits-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  margin: 0 0 6px 0;
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.5);
}

.credits-links {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.credit-link {
  font-size: 12px;
  color: #4ade80;
  text-decoration: none;
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.5);
  transition: color 0.2s;
}

.credit-link:hover {
  color: #86efac;
  text-decoration: underline;
}

.credits-separator {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.5);
}
</style>
