/**
 * Biome Debug Map — Canvas 2D visualization for BiomeGenerator
 *
 * Features:
 * - Bird's-eye biome color map
 * - Temperature / Humidity heatmap modes
 * - Drag to pan, scroll to zoom
 * - Hover tooltip with coords, biome, temp, humidity
 * - Realtime parameter adjustment (seed, scales, transition)
 */
import { BIOMES } from '../js/world/terrain/biome-config.js'
import BiomeGenerator from '../js/world/terrain/biome-generator.js'

// ── Biome color palette ──
const BIOME_COLORS = {
  plains: [124, 189, 82],
  forest: [56, 124, 46],
  birchForest: [166, 199, 98],
  cherryForest: [230, 150, 180],
  desert: [219, 196, 130],
  badlands: [186, 109, 60],
  frozenOcean: [140, 190, 230],
}

// Fallback color for unknown biomes
const FALLBACK_COLOR = [150, 150, 150]

// ── State ──
let generator = null
let seed = 12345
let displayMode = 'biome'
let showSites = true
let showChunks = true

// Camera state (world coords at canvas center)
let camX = 0
let camZ = 0
let zoom = 1 // pixels per world-block

// Canvas references
const canvas = document.getElementById('map-canvas')
const ctx = canvas.getContext('2d')
const tooltip = document.getElementById('tooltip')
const statusBar = document.getElementById('status-bar')

// Offscreen buffer for pixel manipulation
let imgData = null
let needsRedraw = true

// ── Initialize ──
function init() {
  resizeCanvas()
  createGenerator()
  buildLegend()
  bindControls()
  bindInteraction()
  requestAnimationFrame(renderLoop)
}

function readGeneratorOptions() {
  return {
    regionSize: Number(document.getElementById('ctrl-region-size').value),
    transitionWidth: Number(document.getElementById('ctrl-transition-width').value),
    warpStrength: Number(document.getElementById('ctrl-warp-strength').value),
    temperatureScale: Number(document.getElementById('ctrl-temp-scale').value),
    humidityScale: Number(document.getElementById('ctrl-humidity-scale').value),
  }
}

function createGenerator() {
  generator = new BiomeGenerator(seed, readGeneratorOptions())
  needsRedraw = true
}

function resizeCanvas() {
  const area = document.getElementById('canvas-area')
  canvas.width = area.clientWidth
  canvas.height = area.clientHeight
  imgData = ctx.createImageData(canvas.width, canvas.height)
  needsRedraw = true
}

// ── Rendering ──
function renderLoop() {
  if (needsRedraw) {
    drawMap()
    needsRedraw = false
  }
  requestAnimationFrame(renderLoop)
}

function drawMap() {
  const w = canvas.width
  const h = canvas.height
  const data = imgData.data

  // Calculate sampling step: when zoomed out far, skip pixels
  const step = Math.max(2, Math.round(1 / zoom))

  // World bounds visible on screen
  const halfW = w / 2
  const halfH = h / 2

  for (let sy = 0; sy < h; sy += step) {
    for (let sx = 0; sx < w; sx += step) {
      // Screen pixel → world coordinate
      const wx = Math.floor(camX + (sx - halfW) / zoom)
      const wz = Math.floor(camZ + (sy - halfH) / zoom)

      const biomeData = generator.getBiomeAt(wx, wz)
      let r, g, b

      if (displayMode === 'biome') {
        const color = BIOME_COLORS[biomeData.biome] || FALLBACK_COLOR
        r = color[0]
        g = color[1]
        b = color[2]
      }
      else if (displayMode === 'temperature') {
        // cold=blue → hot=red
        r = Math.floor(biomeData.temp * 255)
        g = Math.floor((1 - Math.abs(biomeData.temp - 0.5) * 2) * 180)
        b = Math.floor((1 - biomeData.temp) * 255)
      }
      else if (displayMode === 'humidity') {
        // humidity: dry=yellow → wet=blue
        r = Math.floor((1 - biomeData.humidity) * 200)
        g = Math.floor((1 - biomeData.humidity) * 180 + biomeData.humidity * 100)
        b = Math.floor(biomeData.humidity * 255)
      }
      else {
        const maxWeight = Math.max(...Object.values(biomeData.weights))
        const intensity = Math.floor(Math.min(1, (1 - maxWeight) * 2) * 255)
        r = intensity
        g = intensity
        b = intensity
      }

      // Fill step×step block
      for (let dy = 0; dy < step && sy + dy < h; dy++) {
        for (let dx = 0; dx < step && sx + dx < w; dx++) {
          const idx = ((sy + dy) * w + (sx + dx)) * 4
          data[idx] = r
          data[idx + 1] = g
          data[idx + 2] = b
          data[idx + 3] = 255
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0)

  if (showChunks)
    drawChunkGrid()
  if (showSites)
    drawBiomeSites()
  drawCrosshair()

  // Update status bar
  const blocksW = Math.round(w / zoom)
  const blocksH = Math.round(h / zoom)
  statusBar.textContent = `Center: (${Math.round(camX)}, ${Math.round(camZ)}) | Zoom: ${zoom.toFixed(2)}x | View: ${blocksW}×${blocksH} blocks`
}

function getVisibleWorldBounds() {
  return {
    minX: camX - canvas.width / (2 * zoom),
    maxX: camX + canvas.width / (2 * zoom),
    minZ: camZ - canvas.height / (2 * zoom),
    maxZ: camZ + canvas.height / (2 * zoom),
  }
}

function worldToScreen(worldX, worldZ) {
  return {
    x: canvas.width / 2 + (worldX - camX) * zoom,
    y: canvas.height / 2 + (worldZ - camZ) * zoom,
  }
}

function drawChunkGrid() {
  const bounds = getVisibleWorldBounds()
  const firstX = Math.ceil(bounds.minX / 64) * 64
  const firstZ = Math.ceil(bounds.minZ / 64) * 64

  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let worldX = firstX; worldX <= bounds.maxX; worldX += 64) {
    const { x } = worldToScreen(worldX, 0)
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvas.height)
  }
  for (let worldZ = firstZ; worldZ <= bounds.maxZ; worldZ += 64) {
    const { y } = worldToScreen(0, worldZ)
    ctx.moveTo(0, y)
    ctx.lineTo(canvas.width, y)
  }
  ctx.stroke()
  ctx.restore()
}

function drawBiomeSites() {
  const bounds = getVisibleWorldBounds()
  const sites = generator.getSitesInBounds(
    bounds.minX,
    bounds.minZ,
    bounds.maxX,
    bounds.maxZ,
  )

  ctx.save()
  ctx.lineWidth = 1
  ctx.strokeStyle = '#fff'
  for (const site of sites) {
    const screen = worldToScreen(site.x, site.z)
    const color = BIOME_COLORS[site.biome] || FALLBACK_COLOR
    ctx.fillStyle = `rgb(${color.join(',')})`
    ctx.beginPath()
    ctx.arc(screen.x, screen.y, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

function drawCrosshair() {
  const w = canvas.width
  const h = canvas.height
  const halfW = w / 2
  const halfH = h / 2

  // Origin position on screen
  const ox = halfW + (0 - camX) * zoom
  const oz = halfH + (0 - camZ) * zoom

  if (ox < -20 || ox > w + 20 || oz < -20 || oz > h + 20)
    return

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])

  ctx.beginPath()
  ctx.moveTo(ox, 0)
  ctx.lineTo(ox, h)
  ctx.moveTo(0, oz)
  ctx.lineTo(w, oz)
  ctx.stroke()
  ctx.setLineDash([])

  // Origin dot
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(ox, oz, 3, 0, Math.PI * 2)
  ctx.fill()
}

// ── Interaction: Pan & Zoom ──
function bindInteraction() {
  let dragging = false
  let lastX = 0
  let lastY = 0

  canvas.addEventListener('mousedown', (e) => {
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
  })

  window.addEventListener('mousemove', (e) => {
    if (dragging) {
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      camX -= dx / zoom
      camZ -= dy / zoom
      lastX = e.clientX
      lastY = e.clientY
      needsRedraw = true
    }

    // Tooltip
    updateTooltip(e)
  })

  window.addEventListener('mouseup', () => {
    dragging = false
  })

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    const newZoom = Math.min(8, Math.max(0.1, zoom * factor))

    // Zoom towards cursor position
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const halfW = canvas.width / 2
    const halfH = canvas.height / 2

    // World coord under cursor before zoom
    const wxBefore = camX + (mx - halfW) / zoom
    const wzBefore = camZ + (my - halfH) / zoom

    zoom = newZoom

    // Adjust camera so world coord under cursor stays the same
    camX = wxBefore - (mx - halfW) / zoom
    camZ = wzBefore - (my - halfH) / zoom

    needsRedraw = true
  }, { passive: false })

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') {
      camX = 0
      camZ = 0
      zoom = 1
      needsRedraw = true
    }
  })

  // Resize
  window.addEventListener('resize', () => {
    resizeCanvas()
  })
}

function updateTooltip(e) {
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top

  // Check if cursor is over the canvas
  if (mx < 0 || mx > canvas.width || my < 0 || my > canvas.height) {
    tooltip.style.display = 'none'
    return
  }

  const halfW = canvas.width / 2
  const halfH = canvas.height / 2
  const wx = Math.floor(camX + (mx - halfW) / zoom)
  const wz = Math.floor(camZ + (my - halfH) / zoom)

  const biomeData = generator.getBiomeAt(wx, wz)
  const biomeConfig = Object.values(BIOMES).find(b => b.id === biomeData.biome)
  const biomeName = biomeConfig ? `${biomeConfig.name} (${biomeData.biome})` : biomeData.biome
  const color = BIOME_COLORS[biomeData.biome] || FALLBACK_COLOR

  tooltip.innerHTML = `
    <div class="tt-biome" style="color: rgb(${color.join(',')})">■ ${biomeName}</div>
    <div>X: ${wx} &nbsp; Z: ${wz}</div>
    <div>Temp: ${biomeData.temp.toFixed(3)} &nbsp; Humidity: ${biomeData.humidity.toFixed(3)}</div>
  `

  // Position tooltip near cursor
  const offsetX = mx + 300 > canvas.width ? -160 : 16
  const offsetY = my + 100 > canvas.height ? -80 : 16
  tooltip.style.left = `${mx + offsetX + 280}px` // 280 = sidebar width
  tooltip.style.top = `${my + offsetY}px`
  tooltip.style.display = 'block'
}

// ── Controls ──
function bindControls() {
  // Seed
  document.getElementById('ctrl-seed').addEventListener('change', (e) => {
    seed = Number(e.target.value)
    createGenerator()
  })

  const sliderBindings = [
    ['ctrl-region-size', 'val-region-size', 'regionSize'],
    ['ctrl-transition-width', 'val-transition-width', 'transitionWidth'],
    ['ctrl-warp-strength', 'val-warp-strength', 'warpStrength'],
    ['ctrl-temp-scale', 'val-temp-scale', 'temperatureScale'],
    ['ctrl-humidity-scale', 'val-humidity-scale', 'humidityScale'],
  ]
  sliderBindings.forEach(([sliderId, valueId, parameter]) => {
    bindSlider(sliderId, valueId, (value) => {
      generator.updateParams({ [parameter]: value })
      needsRedraw = true
    })
  })

  document.getElementById('ctrl-show-sites').addEventListener('change', (event) => {
    showSites = event.target.checked
    needsRedraw = true
  })
  document.getElementById('ctrl-show-chunks').addEventListener('change', (event) => {
    showChunks = event.target.checked
    needsRedraw = true
  })

  // Display mode buttons
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      displayMode = btn.dataset.mode
      needsRedraw = true
    })
  })
}

function bindSlider(sliderId, displayId, onChange, formatFn = String) {
  const slider = document.getElementById(sliderId)
  const display = document.getElementById(displayId)

  const update = () => {
    const v = Number(slider.value)
    display.textContent = formatFn(v)
    onChange(v)
  }

  slider.addEventListener('input', update)
}

// ── Legend ──
function buildLegend() {
  const container = document.getElementById('legend')
  container.innerHTML = ''

  for (const biome of Object.values(BIOMES)) {
    const color = BIOME_COLORS[biome.id] || FALLBACK_COLOR
    const item = document.createElement('div')
    item.className = 'legend-item'
    item.innerHTML = `
      <div class="legend-color" style="background: rgb(${color.join(',')})"></div>
      <span>${biome.name} (${biome.id})</span>
    `
    container.appendChild(item)
  }
}

// ── Start ──
init()
