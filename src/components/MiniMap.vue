<script setup>
import { Color } from 'three'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import emitter from '../js/utils/event-bus.js'

// ===== 响应式状态 =====
const canvasRef = ref(null)
const dialogCanvasRef = ref(null)
const displayMode = ref('color') // 'grayscale' | 'color' | 'walkable'

// 可行走范围配置
const WALKABLE_MIN = -0.05
const WALKABLE_MAX = 0.3
const showDialog = ref(false)

// 地形数据状态（新容器）
let terrainState = {
  heightMap: null, // 二维数组 [z][x]
  size: { width: 0, height: 0 }, // 容器尺寸
}

// Canvas 尺寸
const MINI_SIZE = 200
const DIALOG_SIZE = 600

// 颜色分段（沿用旧逻辑，基于归一化高度 [-1, 1]）
const COLOR_BANDS = {
  waterDeep: { threshold: -0.75, color: '#003366' },
  waterShallow: { threshold: -0.2, color: '#0077be' },
  wetSand: { threshold: -0.10, color: '#bd6723' },
  drySand: { threshold: 0.00, color: '#ded3a7' },
  lowGrass: { threshold: 0.25, color: '#4c752f' },
  highGrass: { threshold: 0.40, color: '#145a32' },
  rock: { threshold: 0.60, color: '#7f8c8d' },
  snow: { threshold: 0.80, color: '#ecf0f1' },
}

/**
 * 获取当前地形数据（从 Experience 单例暴露的管理器中获取中心 chunk 数据）
 */
function getTerrainState() {
  const exp = window.Experience
  const manager = exp?.terrainDataManager
  if (!manager)
    return null

  // 获取中心 chunk (0,0) 作为预览数据
  const centerChunk = manager.getChunk(0, 0)
  if (!centerChunk || centerChunk.state === 'init')
    return null

  const heightMap = centerChunk.generator?.heightMap
  const container = centerChunk.container

  if (!heightMap || !heightMap.length)
    return null
  const size = container?.getSize?.() || { width: heightMap.length, height: heightMap.length }
  return { heightMap, size }
}

/**
 * 写入地形数据状态
 */
function applyTerrainState(payload) {
  if (payload?.heightMap?.length) {
    terrainState = {
      heightMap: payload.heightMap,
      size: payload.size || terrainState.size,
    }
    return true
  }

  const state = getTerrainState()
  if (state) {
    terrainState = state
    return true
  }
  return false
}

/**
 * 将高度值映射到灰度颜色
 * @param {number} height - 高度值 [-1, 1]
 * @returns {string} CSS 颜色字符串
 */
function heightToGrayscale(height) {
  // 将 [-1, 1] 映射到 [0, 255]
  const gray = Math.floor(((height + 1) / 2) * 255)
  return `rgb(${gray}, ${gray}, ${gray})`
}

/**
 * 将 Three.js Color 转换为 CSS 颜色字符串
 * @param {Color} color - Three.js 颜色对象
 * @returns {string} CSS 颜色字符串
 */
function colorToCSS(color) {
  const r = Math.floor(color.r * 255)
  const g = Math.floor(color.g * 255)
  const b = Math.floor(color.b * 255)
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * 归一化高度到 [-1, 1]，空位（-1）保持为空
 */
function normalizeHeight(rawHeight, maxHeight) {
  if (rawHeight < 0)
    return -1
  const safeMax = Math.max(1, maxHeight)
  const normalized01 = rawHeight / safeMax
  return normalized01 * 2 - 1
}

/**
 * 基于高度获取颜色（复用旧色带）
 */
function getColorForHeight(height) {
  const {
    waterDeep,
    waterShallow,
    wetSand,
    drySand,
    lowGrass,
    highGrass,
    rock,
    snow,
  } = COLOR_BANDS

  let baseColor

  if (height <= waterDeep.threshold) {
    baseColor = new Color(waterDeep.color)
    const depthRatio = (waterDeep.threshold - height) / (waterDeep.threshold + 1)
    const hsl = { h: 0, s: 0, l: 0 }
    baseColor.getHSL(hsl)
    baseColor.setHSL(hsl.h, hsl.s, hsl.l * (1 - depthRatio * 0.4))
  }
  else if (height <= waterShallow.threshold) {
    baseColor = new Color(waterShallow.color)
    const shallowRatio = (waterShallow.threshold - height) / (waterShallow.threshold - waterDeep.threshold)
    const hsl = { h: 0, s: 0, l: 0 }
    baseColor.getHSL(hsl)
    baseColor.setHSL(hsl.h, hsl.s, hsl.l * (1 - shallowRatio * 0.2))
  }
  else if (height <= wetSand.threshold) {
    baseColor = new Color(wetSand.color)
  }
  else if (height <= drySand.threshold) {
    baseColor = new Color(drySand.color)
  }
  else if (height <= lowGrass.threshold) {
    baseColor = new Color(lowGrass.color)
    const grassRatio = (height - drySand.threshold) / (lowGrass.threshold - drySand.threshold)
    const hsl = { h: 0, s: 0, l: 0 }
    baseColor.getHSL(hsl)
    baseColor.setHSL(hsl.h, hsl.s * (1 + grassRatio * 0.1), hsl.l * (1 - grassRatio * 0.1))
  }
  else if (height <= highGrass.threshold) {
    baseColor = new Color(highGrass.color)
  }
  else if (height <= rock.threshold) {
    baseColor = new Color(rock.color)
  }
  else {
    baseColor = new Color(snow.color)
  }

  return baseColor
}

/**
 * 判断高度是否在可行走范围内，返回黑白颜色
 * @param {number} height - 高度值
 * @returns {string} CSS 颜色字符串（白色或黑色）
 */
function heightToWalkable(height) {
  // 可行走范围：-0.05 ~ 0.3，显示白色；其他显示黑色
  const isWalkable = height >= WALKABLE_MIN && height <= WALKABLE_MAX
  return isWalkable ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)'
}

/**
 * 绘制地形到 Canvas
 * @param {HTMLCanvasElement} canvas - 目标 Canvas
 * @param {number} size - Canvas 尺寸
 */
function drawTerrain(canvas, size) {
  if (!canvas || !terrainState.heightMap)
    return

  const ctx = canvas.getContext('2d')
  const heightMapData = terrainState.heightMap
  const resolution = heightMapData.length
  if (!resolution)
    return

  // 计算最大高度（用于归一化）
  const maxHeight = Math.max(1, (terrainState.size?.height ?? resolution) - 1)
  const cellSize = size / resolution

  // 清空画布
  ctx.clearRect(0, 0, size, size)

  // 遍历高度图绘制（z 行，x 列）
  for (let z = 0; z < resolution; z++) {
    for (let x = 0; x < resolution; x++) {
      const rawHeight = heightMapData[z]?.[x] ?? -1
      const normalizedHeight = normalizeHeight(rawHeight, maxHeight)

      let fillColor
      if (displayMode.value === 'grayscale') {
        fillColor = heightToGrayscale(normalizedHeight)
      }
      else if (displayMode.value === 'walkable') {
        fillColor = heightToWalkable(normalizedHeight)
      }
      else {
        const color = getColorForHeight(normalizedHeight)
        fillColor = colorToCSS(color)
      }

      ctx.fillStyle = fillColor
      ctx.fillRect(
        x * cellSize,
        z * cellSize,
        Math.ceil(cellSize),
        Math.ceil(cellSize),
      )
    }
  }
}

/**
 * 更新小地图
 */
function updateMiniMap() {
  if (canvasRef.value) {
    drawTerrain(canvasRef.value, MINI_SIZE)
  }
}

/**
 * 更新对话框中的大地图
 */
function updateDialogMap() {
  if (dialogCanvasRef.value) {
    drawTerrain(dialogCanvasRef.value, DIALOG_SIZE)
  }
}

/**
 * 切换到灰度模式
 */
function setGrayscaleMode() {
  displayMode.value = 'grayscale'
}

/**
 * 切换到彩色模式
 */
function setColorMode() {
  displayMode.value = 'color'
}

/**
 * 切换到可行走范围模式
 */
function setWalkableMode() {
  displayMode.value = 'walkable'
}

/**
 * 打开放大对话框
 */
function openDialog() {
  showDialog.value = true
}

/**
 * 关闭对话框
 */
function closeDialog() {
  showDialog.value = false
}

// 监听显示模式变化，重绘地图
watch(displayMode, () => {
  updateMiniMap()
  if (showDialog.value) {
    updateDialogMap()
  }
})

// 监听对话框显示状态
watch(showDialog, (isOpen) => {
  if (isOpen) {
    // 延迟绘制，等待 DOM 更新
    setTimeout(() => {
      updateDialogMap()
    }, 50)
  }
})

/**
 * 处理地形更新事件
 */
function handleTerrainReady(payload) {
  if (!applyTerrainState(payload))
    return
  updateMiniMap()
  if (showDialog.value) {
    updateDialogMap()
  }
}

// 组件挂载时初始化
onMounted(() => {
  // 监听新地形数据就绪事件
  emitter.on('terrain:data-ready', handleTerrainReady)

  // 等待 Experience 初始化完成
  const checkAndInit = () => {
    if (applyTerrainState()) {
      updateMiniMap()
    }
    else {
      // 如果还没准备好，稍后重试
      setTimeout(checkAndInit, 100)
    }
  }
  checkAndInit()
})

// 组件卸载时清理
onUnmounted(() => {
  // 移除事件监听
  emitter.off('terrain:data-ready', handleTerrainReady)
  terrainState = {
    heightMap: null,
    size: { width: 0, height: 0 },
  }
})

// 暴露方法供外部调用（如地形重新生成时）
defineExpose({
  updateMiniMap,
  updateDialogMap,
})
</script>

<template>
  <div class="minimap-container">
    <!-- 小地图 Canvas -->
    <canvas
      ref="canvasRef"
      :width="MINI_SIZE"
      :height="MINI_SIZE"
      class="minimap-canvas"
      title="点击放大"
      @click="openDialog"
    />

    <!-- 按钮组 -->
    <div class="minimap-buttons">
      <button
        :class="{ active: displayMode === 'grayscale' }"
        title="显示高度灰度图"
        @click="setGrayscaleMode"
      >
        灰度
      </button>
      <button
        :class="{ active: displayMode === 'color' }"
        title="显示地形颜色图"
        @click="setColorMode"
      >
        彩色
      </button>
      <button
        :class="{ active: displayMode === 'walkable' }"
        title="显示可行走范围（高度 -0.05 ~ 0.3）"
        @click="setWalkableMode"
      >
        可行走
      </button>
    </div>

    <!-- 放大对话框 -->
    <Teleport to="body">
      <div
        v-if="showDialog"
        class="minimap-dialog-overlay"
        @click.self="closeDialog"
      >
        <div class="minimap-dialog">
          <div class="dialog-header">
            <h3>地形预览</h3>
            <button class="close-btn" @click="closeDialog">
              ✕
            </button>
          </div>
          <canvas
            ref="dialogCanvasRef"
            :width="DIALOG_SIZE"
            :height="DIALOG_SIZE"
            class="dialog-canvas"
          />
          <!-- 彩色模式图例 -->
          <div v-if="displayMode === 'color'" class="dialog-legend">
            <div class="legend-item">
              <span class="color-box water-deep" />
              <span>深海</span>
            </div>
            <div class="legend-item">
              <span class="color-box water-shallow" />
              <span>浅水</span>
            </div>
            <div class="legend-item">
              <span class="color-box wet-sand" />
              <span>湿沙</span>
            </div>
            <div class="legend-item">
              <span class="color-box dry-sand" />
              <span>海滩</span>
            </div>
            <div class="legend-item">
              <span class="color-box low-grass" />
              <span>草地</span>
            </div>
            <div class="legend-item">
              <span class="color-box high-grass" />
              <span>森林</span>
            </div>
            <div class="legend-item">
              <span class="color-box rock" />
              <span>裸岩</span>
            </div>
            <div class="legend-item">
              <span class="color-box snow" />
              <span>积雪</span>
            </div>
          </div>
          <!-- 可行走模式图例 -->
          <div v-else-if="displayMode === 'walkable'" class="dialog-legend">
            <div class="legend-item">
              <span class="color-box walkable-yes" />
              <span>可行走区域 (高度: -0.05 ~ 0.3)</span>
            </div>
            <div class="legend-item">
              <span class="color-box walkable-no" />
              <span>不可行走区域</span>
            </div>
          </div>
          <!-- 灰度模式图例 -->
          <div v-else class="dialog-legend">
            <div class="legend-item">
              <span class="color-box grayscale-low" />
              <span>低处 (深色)</span>
            </div>
            <div class="legend-item">
              <span class="color-box grayscale-high" />
              <span>高处 (浅色)</span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.minimap-container {
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.minimap-canvas {
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s, transform 0.2s;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.minimap-canvas:hover {
  border-color: rgba(255, 255, 255, 0.6);
  transform: scale(1.02);
}

.minimap-buttons {
  display: flex;
  gap: 4px;
}

.minimap-buttons button {
  flex: 1;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  color: #fff;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  transition: all 0.2s;
}

.minimap-buttons button:hover {
  background: rgba(0, 0, 0, 0.8);
  border-color: rgba(255, 255, 255, 0.4);
}

.minimap-buttons button.active {
  color: #000;
  background: rgba(255, 255, 255, 0.9);
  border-color: #fff;
}

/* 对话框样式 */
.minimap-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(4px);
}

.minimap-dialog {
  padding: 20px;
  background: #1a1a2e;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}

.close-btn {
  width: 32px;
  height: 32px;
  font-size: 16px;
  color: #888;
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 50%;
  transition: all 0.2s;
}

.close-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.dialog-canvas {
  display: block;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}

.dialog-legend {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-top: 16px;
}

.legend-item {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 13px;
  color: #ccc;
}

.color-box {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 3px;
}

.color-box.water-deep {
  background: #003366;
}

.color-box.water-shallow {
  background: #0077be;
}

.color-box.wet-sand {
  background: #d9a066;
}

.color-box.dry-sand {
  background: #f4d03f;
}

.color-box.low-grass {
  background: #27ae60;
}

.color-box.high-grass {
  background: #145a32;
}

.color-box.rock {
  background: #7f8c8d;
}

.color-box.snow {
  background: #ecf0f1;
}

/* 可行走模式图例 */
.color-box.walkable-yes {
  background: #fff;
  border: 1px solid #333;
}

.color-box.walkable-no {
  background: #000;
  border: 1px solid #333;
}

/* 灰度模式图例 */
.color-box.grayscale-low {
  background: linear-gradient(to right, #000, #666);
}

.color-box.grayscale-high {
  background: linear-gradient(to right, #999, #fff);
}
</style>
