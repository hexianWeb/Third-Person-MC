<script setup>
/**
 * McStepSlider - Minecraft-style discrete step slider
 * 
 * Features:
 * - Discrete steps (not continuous)
 * - Keyboard support (Arrow keys)
 * - @input: fires during drag (for UI preview)
 * - @change: fires on release (for apply to Three.js)
 */
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Number, required: true },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  step: { type: Number, default: 1 },
  label: { type: String, default: '' },
  unit: { type: String, default: '' },
  // Optional marks for display (e.g., ['Off', 'Low', 'High'])
  marks: { type: Array, default: () => [] },
  // Decimal places for value display
  decimals: { type: Number, default: 0 },
})

const emit = defineEmits(['update:modelValue', 'input', 'change'])

// Local value for immediate UI feedback
const localValue = ref(props.modelValue)

// Sync with prop changes
watch(() => props.modelValue, (newVal) => {
  localValue.value = newVal
})

// Calculate total steps
const totalSteps = computed(() => Math.round((props.max - props.min) / props.step))

// Current step index
const currentStepIndex = computed(() => 
  Math.round((localValue.value - props.min) / props.step)
)

// Progress percentage for slider fill
const progressPercent = computed(() => 
  ((localValue.value - props.min) / (props.max - props.min)) * 100
)

// Format display value
const displayValue = computed(() => {
  if (props.marks.length > 0 && props.marks[currentStepIndex.value]) {
    return props.marks[currentStepIndex.value]
  }
  return localValue.value.toFixed(props.decimals) + props.unit
})

// Quantize value to nearest step
function quantize(value) {
  const steps = Math.round((value - props.min) / props.step)
  return Math.max(props.min, Math.min(props.max, props.min + steps * props.step))
}

// Handle slider input (during drag)
function handleInput(event) {
  const raw = parseFloat(event.target.value)
  localValue.value = quantize(raw)
  emit('update:modelValue', localValue.value)
  emit('input', localValue.value)
}

// Handle change (on release)
function handleChange() {
  emit('change', localValue.value)
}

// Keyboard step adjustment
function stepBy(delta) {
  const newValue = quantize(localValue.value + delta * props.step)
  if (newValue !== localValue.value) {
    localValue.value = newValue
    emit('update:modelValue', localValue.value)
    emit('input', localValue.value)
    emit('change', localValue.value)
  }
}

function handleKeyDown(event) {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
    event.preventDefault()
    stepBy(-1)
  } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
    event.preventDefault()
    stepBy(1)
  }
}
</script>

<template>
  <div class="mc-step-slider">
    <span v-if="label" class="slider-label">{{ label }}</span>
    <div class="slider-track-container">
      <div class="slider-track">
        <div class="slider-fill" :style="{ width: progressPercent + '%' }"></div>
      </div>
      <input
        type="range"
        class="slider-input"
        :value="localValue"
        :min="min"
        :max="max"
        :step="step"
        @input="handleInput"
        @change="handleChange"
        @keydown="handleKeyDown"
      />
    </div>
    <span class="slider-value">{{ displayValue }}</span>
  </div>
</template>

<style scoped>
.mc-step-slider {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.slider-label {
  color: #ddd;
  font-size: 12px;
  min-width: 100px;
  flex-shrink: 0;
}

.slider-track-container {
  position: relative;
  flex: 1;
  height: 20px;
}

.slider-track {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  transform: translateY(-50%);
  height: 8px;
  background: #333;
  border: 1px solid #555;
}

.slider-fill {
  height: 100%;
  background: linear-gradient(to right, #4a7c4d, #6ab04c);
  transition: width 0.05s ease-out;
}

.slider-input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

/* Custom thumb styling (for browsers that support it) */
.slider-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 20px;
  background: #888;
  border: 2px solid #aaa;
  cursor: pointer;
}

.slider-input::-moz-range-thumb {
  width: 16px;
  height: 20px;
  background: #888;
  border: 2px solid #aaa;
  cursor: pointer;
}

.slider-value {
  color: #fff;
  font-size: 12px;
  min-width: 60px;
  text-align: right;
  flex-shrink: 0;
}

/* Focus state */
.slider-input:focus + .slider-track,
.slider-track-container:focus-within .slider-track {
  border-color: #7af;
}
</style>
