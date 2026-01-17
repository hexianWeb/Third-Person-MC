<script setup>
/**
 * SettingsMenu - Full settings panel with Camera, Visual, Environment controls
 * Supports preset switching and step sliders
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../../vue/settingsStore.js'
import { useUiStore } from '../../vue/uiStore.js'
import McStepSlider from './ui/McStepSlider.vue'

const ui = useUiStore()
const settings = useSettingsStore()
const { locale } = useI18n()

// Toggle language
function toggleLanguage() {
  locale.value = locale.value === 'en' ? 'zh' : 'en'
}

// Shadow quality options
const shadowOptions = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

// Preset options for Camera/Visual
const presetOptions = [
  { value: 'off', label: 'Off' },
  { value: 'default', label: 'Default' },
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'arcade', label: 'Arcade' },
]

// Sky mode options
const skyModeOptions = [
  { value: 'Image', label: 'Image' },
  { value: 'HDR', label: 'HDR' },
]

// Sensitivity display (percentage)
const sensitivityPercent = computed(() => {
  return Math.round(settings.mouseSensitivity * 1000)
})

function adjustSensitivity(delta) {
  const newValue = Math.max(0.01, Math.min(0.1, settings.mouseSensitivity + delta))
  settings.setMouseSensitivity(newValue)
}
</script>

<template>
  <div class="settings-menu">
    <h2 class="menu-title">
      {{ $t('settings.title') }}
      <button class="lang-switch-btn" @click="toggleLanguage">
        {{ locale.toUpperCase() }}
      </button>
    </h2>

    <div class="settings-content">
      <!-- Camera Section -->
      <div class="settings-section">
        <h3 class="section-title">
          {{ $t('settings.camera') }}
        </h3>

        <!-- Camera Preset -->
        <div class="setting-row">
          <span class="setting-label">{{ $t('settings.cameraStyle') }}</span>
          <div class="setting-control">
            <button
              v-for="opt in presetOptions"
              :key="opt.value"
              class="option-btn"
              :class="{ active: settings.cameraPreset === opt.value }"
              @click="settings.applyCameraPreset(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- World Section -->
      <div class="settings-section">
        <h3 class="section-title">
          {{ $t('settings.world') }}
        </h3>

        <!-- View Distance -->
        <McStepSlider
          :model-value="settings.chunkViewDistance"
          :min="1"
          :max="8"
          :step="1"
          :decimals="0"
          :label="$t('settings.viewDistance')"
          @change="settings.setChunkViewDistance($event)"
        />

        <!-- Unload Padding -->
        <McStepSlider
          :model-value="settings.chunkUnloadPadding"
          :min="0"
          :max="4"
          :step="1"
          :decimals="0"
          :label="$t('settings.unloadPadding')"
          @change="settings.setChunkUnloadPadding($event)"
        />
      </div>

      <!-- Visual Section -->
      <div class="settings-section">
        <h3 class="section-title">
          {{ $t('settings.visual') }}
        </h3>

        <!-- SpeedLines Preset -->
        <div class="setting-row">
          <span class="setting-label">{{ $t('settings.speedLines') }}</span>
          <div class="setting-control">
            <button
              v-for="opt in presetOptions"
              :key="opt.value"
              class="option-btn"
              :class="{ active: settings.visualPreset === opt.value }"
              @click="settings.applyVisualPreset(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- Environment Section -->
      <div class="settings-section">
        <h3 class="section-title">
          {{ $t('settings.environment') }}
        </h3>

        <!-- Sky Mode -->
        <div class="setting-row">
          <span class="setting-label">{{ $t('settings.sky') }}</span>
          <div class="setting-control">
            <button
              v-for="opt in skyModeOptions"
              :key="opt.value"
              class="option-btn"
              :class="{ active: settings.envSkyMode === opt.value }"
              @click="settings.setEnvSkyMode(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <!-- Sun Intensity -->
        <McStepSlider
          :model-value="settings.envSunIntensity"
          :min="0"
          :max="5"
          :step="0.25"
          :decimals="2"
          :label="$t('settings.sun')"
          @change="settings.setEnvSunIntensity($event)"
        />

        <!-- Ambient Intensity -->
        <McStepSlider
          :model-value="settings.envAmbientIntensity"
          :min="0"
          :max="3"
          :step="0.25"
          :decimals="2"
          :label="$t('settings.ambient')"
          @change="settings.setEnvAmbientIntensity($event)"
        />

        <!-- Fog Density -->
        <McStepSlider
          :model-value="settings.envFogDensity"
          :min="0"
          :max="0.05"
          :step="0.005"
          :decimals="3"
          :label="$t('settings.fog')"
          @change="settings.setEnvFogDensity($event)"
        />
      </div>

      <!-- Graphics Section -->
      <div class="settings-section">
        <h3 class="section-title">
          {{ $t('settings.graphics') }}
        </h3>

        <!-- Shadow Quality -->
        <div class="setting-row">
          <span class="setting-label">{{ $t('settings.shadowQuality') }}</span>
          <div class="setting-control">
            <button
              v-for="opt in shadowOptions"
              :key="opt.value"
              class="option-btn"
              :class="{ active: settings.shadowQuality === opt.value }"
              @click="settings.setShadowQuality(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- Controls Section -->
      <div class="settings-section">
        <h3 class="section-title">
          {{ $t('settings.controls') }}
        </h3>

        <!-- Mouse Sensitivity -->
        <div class="setting-row">
          <span class="setting-label">{{ $t('settings.sensitivity') }}</span>
          <div class="setting-control slider-control">
            <button class="adjust-btn" @click="adjustSensitivity(-0.005)">
              -
            </button>
            <span class="value-display">{{ sensitivityPercent }}%</span>
            <button class="adjust-btn" @click="adjustSensitivity(0.005)">
              +
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Buttons -->
    <div class="mc-menu">
      <button class="mc-button" @click="settings.resetToDefaults()">
        <span class="title">{{ $t('settings.reset') }}</span>
      </button>
      <button class="mc-button" @click="ui.exitSettings()">
        <span class="title">{{ $t('settings.done') }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.settings-menu {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  width: min(560px, 92vw);
}

.menu-title {
  color: #fff;
  font-size: 28px;
  text-shadow: 2px 2px #000;
  display: flex;
  align-items: center;
  gap: 12px;
}

.lang-switch-btn {
  background: none;
  border: 2px solid #aaa;
  color: #aaa;
  font-size: 12px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}

.lang-switch-btn:hover {
  border-color: #fff;
  color: #fff;
}

.settings-content {
  background: rgba(0, 0, 0, 0.6);
  border: 2px solid #555;
  padding: 20px;
  width: 100%;
  max-height: 450px;
  overflow-y: auto;
}

.settings-section {
  margin-bottom: 20px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.section-title {
  color: #aaa;
  font-size: 16px;
  margin-bottom: 12px;
  border-bottom: 1px solid #444;
  padding-bottom: 4px;
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.setting-label {
  color: #ddd;
  font-size: 14px;
}

.setting-control {
  display: flex;
  gap: 4px;
}

.option-btn {
  padding: 6px 10px;
  background: #444;
  border: 1px solid #666;
  color: #aaa;
  cursor: pointer;
  font-size: 12px;
}

.option-btn:hover {
  background: #555;
  color: #fff;
}

.option-btn.active {
  background: #4a7;
  border-color: #6c9;
  color: #fff;
}

.slider-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.adjust-btn {
  width: 32px;
  height: 32px;
  background: #444;
  border: 1px solid #666;
  color: #fff;
  font-size: 18px;
  cursor: pointer;
}

.adjust-btn:hover {
  background: #555;
}

.adjust-btn:active {
  background: #333;
}

.value-display {
  color: #fff;
  font-size: var(--mc-btn-font-size);
  min-width: 50px;
  text-align: center;
}

.placeholder-text {
  color: #666;
  font-size: 12px;
  font-style: italic;
}
</style>
