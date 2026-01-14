<script setup>
/**
 * MainMenu - Main menu with Root and WorldSetup views
 * Includes Advanced panel for WorldGen settings
 */
import { ref } from 'vue'
import { WORLDGEN_PRESET_IDS, WORLDGEN_PRESETS } from '../../js/config/worldgen-presets.js'
import { useUiStore } from '../../vue/uiStore.js'
import McStepSlider from './ui/McStepSlider.vue'

const ui = useUiStore()

// Confirm dialog state
const showConfirmDialog = ref(false)

// Random tagline phrases
const taglines = [
  'Web3D Powered!',
  'Three.js Rocks!',
  'No install required!'
]

// Randomly select a tagline on component mount
const randomTagline = ref(taglines[Math.floor(Math.random() * taglines.length)])

// Handle Create World button
function handleCreate() {
  // Validate seed
  if (!ui.isSeedValidNumeric()) {
    ui.seedError = 'Seed must be numeric only'
    return
  }

  const seed = ui.getOrCreateSeedNumber()

  // Check if need confirmation (overwriting existing world)
  if (ui.pendingNewWorld && ui.world.hasWorld) {
    showConfirmDialog.value = true
  }
  else {
    // Direct create
    ui.createWorld(seed)
  }
}

// Confirm overwrite
function confirmOverwrite() {
  const seed = ui.getOrCreateSeedNumber()
  showConfirmDialog.value = false
  ui.resetWorld(seed)
}

// Cancel overwrite
function cancelOverwrite() {
  showConfirmDialog.value = false
}
</script>

<template>
  <div class="main-menu">
    <!-- Logo Container -->
    <div class="logo-container">
      <img
        src="/textures/hub/logo.png"
        alt="Minecraft"
        class="logo"
      >
      <!-- Random Tagline -->
      <span class="tagline">{{ randomTagline }}</span>
    </div>

    <!-- Root View -->
    <div v-if="ui.mainMenuView === 'root'" class="mc-menu">
      <!-- No world exists -->
      <template v-if="!ui.world.hasWorld">
        <button class="mc-button" @click="ui.enterWorldSetup({ mode: 'create' })">
          <span class="title">Create World</span>
        </button>
        <button class="mc-button" @click="ui.toSettings('mainMenu')">
          <span class="title">Settings</span>
        </button>
        <button class="mc-button disabled">
          <span class="title">How to Play</span>
        </button>
      </template>

      <!-- World exists -->
      <template v-else>
        <button class="mc-button" @click="ui.continueWorld()">
          <span class="title">Continue</span>
        </button>
        <button class="mc-button" @click="ui.enterWorldSetup({ mode: 'newWorld' })">
          <span class="title">New World</span>
        </button>
        <button class="mc-button" @click="ui.toSettings('mainMenu')">
          <span class="title">Settings</span>
        </button>
        <div class="mc-menu double">
          <button class="mc-button half disabled">
            <span class="title">How to Play</span>
          </button>
          <button class="mc-button half disabled">
            <span class="title">Credits</span>
          </button>
        </div>
      </template>
    </div>

    <!-- World Setup View -->
    <div v-else-if="ui.mainMenuView === 'worldSetup'" class="mc-menu world-setup">
      <h2 class="menu-title">
        {{ ui.pendingNewWorld ? 'New World' : 'Create World' }}
      </h2>

      <!-- Seed Input -->
      <div class="seed-input-group">
        <label class="seed-label">World Seed (optional)</label>
        <input
          type="text"
          class="mc-input"
          inputmode="numeric"
          pattern="\d*"
          placeholder="Leave empty for random"
          :value="ui.seedDraft"
          @input="ui.setSeedDraft($event.target.value)"
        >
        <p v-if="ui.seedError" class="seed-error">
          {{ ui.seedError }}
        </p>
      </div>

      <!-- Fixed Notice -->
      <div class="notice-bar">
        <span class="notice-icon  mc-text">🛈</span>
        <span class="  mc-text">Advanced settings only affect new worlds</span>
      </div>

      <!-- Advanced Collapsible -->
      <button class="mc-button advanced-toggle" @click="ui.toggleAdvanced()">
        <span class="title mc-text " style="font-size: 25px;">
          Advanced {{ ui.advancedExpanded ? '▾' : '▸' }}
        </span>
      </button>

      <!-- Advanced Panel -->
      <div v-if="ui.advancedExpanded" class="advanced-panel">
        <!-- Warning -->
        <div class="warning-bar">
          <span class="warning-icon mc-text">⚠</span>
          <span class=" mc-text">Changes here only apply when creating a new world</span>
        </div>

        <!-- World Type Preset -->
        <div class="setting-section">
          <h4 class="section-label">
            World Type
          </h4>
          <div class="preset-row">
            <button
              v-for="presetId in WORLDGEN_PRESET_IDS"
              :key="presetId"
              class="preset-btn"
              :class="{ active: ui.worldGenDraft.presetId === presetId }"
              @click="ui.applyWorldGenPreset(presetId)"
            >
              {{ WORLDGEN_PRESETS[presetId].name }}
            </button>
          </div>
        </div>

        <!-- Terrain Height -->
        <div class="setting-section">
          <h4 class="section-label">
            Terrain
          </h4>
          <McStepSlider
            v-model="ui.worldGenDraft.magnitude"
            :min="0"
            :max="32"
            :step="1"
            :decimals="0"
            label="Height"
          />
        </div>

        <!-- Tree Settings -->
        <div class="setting-section">
          <h4 class="section-label">
            Trees
          </h4>
          <McStepSlider
            v-model="ui.worldGenDraft.treeMinHeight"
            :min="1"
            :max="16"
            :step="1"
            :decimals="0"
            label="Min Height"
          />
          <McStepSlider
            v-model="ui.worldGenDraft.treeMaxHeight"
            :min="1"
            :max="32"
            :step="1"
            :decimals="0"
            label="Max Height"
          />
        </div>
      </div>

      <!-- Buttons -->
      <button class="mc-button" @click="ui.randomizeSeed()">
        <span class="title">Random Seed</span>
      </button>
      <button class="mc-button" @click="handleCreate">
        <span class="title">Create</span>
      </button>
      <button class="mc-button" @click="ui.backToMainRoot()">
        <span class="title">Back</span>
      </button>
    </div>

    <!-- Overwrite Confirmation Dialog -->
    <Teleport to="body">
      <div v-if="showConfirmDialog" class="dialog-overlay" @click.self="cancelOverwrite">
        <div class="mc-panel dialog">
          <h3 class="dialog-title">
            Warning
          </h3>
          <p class="dialog-body">
            Creating a new world will overwrite your current world.
            <br><br>
            New Seed: <strong>{{ ui.seedDraft || 'Random' }}</strong>
            <br>
            World Type: <strong>{{ WORLDGEN_PRESETS[ui.worldGenDraft.presetId]?.name || 'Default' }}</strong>
          </p>
          <div class="mc-menu double">
            <button class="mc-button half" @click="cancelOverwrite">
              <span class="title">Cancel</span>
            </button>
            <button class="mc-button half" @click="confirmOverwrite">
              <span class="title">Confirm</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.main-menu {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
}

.logo-container {
  position: relative;
  display: inline-block;
}

.logo {
  max-width: min(720px, 92vw);
  image-rendering: pixelated;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5));
}

.tagline {
  position: absolute;
  top: 0;
  right: 0;
  transform-origin: center;
  transform: translate(10%, -20%) rotate(-15deg);
  font-family: 'MinecraftV2', 'Minecraftia', monospace;
  font-size: clamp(18px, 3vw, 28px);
  color: #ffff00;
  text-shadow: 
    3px 3px 0 #3f3f00,
    -1px -1px 0 #000,
    1px -1px 0 #000,
    -1px 1px 0 #000;
  white-space: nowrap;
  font-weight: 400;
  letter-spacing: 0.5px;
  pointer-events: none;
  z-index: 10;
  animation: tagline-bounce 0.5s ease-in-out infinite alternate;
}

@keyframes tagline-bounce {
  from {
    transform: translate(10%, -20%) rotate(-15deg) scale(0.9);
  }
  to {
    transform: translate(10%, -20%) rotate(-15deg) scale(1.1);
  }
}

.menu-title {
  color: #fff;
  font-size: 24px;
  text-shadow: 2px 2px #000;
  margin-bottom: 8px;
}

.world-setup {
  max-width: min(520px, 92vw);
}

.seed-input-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.seed-label {
  color: #aaa;
  font-size: 12px;
}

.seed-error {
  color: #f55;
  font-size: 12px;
  text-shadow: 1px 1px #000;
}

/* Notice Bar */
.notice-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(100, 150, 255, 0.2);
  border: 1px solid rgba(100, 150, 255, 0.4);
  color: #aaf;
  font-size: 12px;
  margin-bottom: 8px;
  width: 100%;
}

.notice-icon {
  font-size: 14px;
}

/* Advanced Toggle */
.advanced-toggle {
  width: 100%;
}

/* Advanced Panel */
.advanced-panel {
  width: 100%;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid #555;
  padding: 12px;
  margin-bottom: 8px;
}

/* Warning Bar */
.warning-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 180, 0, 0.15);
  border: 1px solid rgba(255, 180, 0, 0.4);
  color: #fa0;
  font-size: 11px;
  margin-bottom: 12px;
}

.warning-icon {
  font-size: 12px;
}

/* Setting Section */
.setting-section {
  margin-bottom: 12px;
}

.setting-section:last-child {
  margin-bottom: 0;
}

.section-label {
  color: #aaa;
  font-size: 12px;
  margin-bottom: 8px;
  border-bottom: 1px solid #444;
  padding-bottom: 4px;
}

/* Preset Row */
.preset-row {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.preset-btn {
  padding: 6px 10px;
  background: #444;
  border: 1px solid #666;
  color: #aaa;
  cursor: pointer;
  font-size: 11px;
}

.preset-btn:hover {
  background: #555;
  color: #fff;
}

.preset-btn.active {
  background: #4a7;
  border-color: #6c9;
  color: #fff;
}

/* Dialog Overlay */
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(0, 0, 0, 0.7);
}

.dialog {
  min-width: 320px;
  max-width: 480px;
  text-align: center;
}

.dialog-title {
  color: #333;
  font-size: 20px;
  margin-bottom: 16px;
}

.dialog-body {
  color: #444;
  font-size: 14px;
  margin-bottom: 24px;
  line-height: 1.5;
}

.dialog-body strong {
  color: #222;
}
</style>
