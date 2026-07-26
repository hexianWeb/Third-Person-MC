<script setup>
import emitter from '@three/utils/event/event-bus.js'
/**
 * LoadingScreen - HEXIAN 全屏加载
 * 资源与槽位预热合并为一条 0–100 Loading 进度
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'

/** 资源阶段占前 60%，槽位预热占后 40%（同一条进度条） */
const ASSET_SHARE = 0.6

const progress = ref(0)

const progressStyle = computed(() => ({
  '--progress-value': `${progress.value}%`,
}))

onMounted(() => {
  emitter.on('core:loading-progress', handleProgress)
})

onUnmounted(() => {
  emitter.off('core:loading-progress', handleProgress)
})

function handleProgress({ loaded, total, phase }) {
  const safeTotal = total > 0 ? total : 1
  const ratio = Math.min(1, Math.max(0, loaded / safeTotal))

  if (phase === 'slots') {
    progress.value = Math.round((ASSET_SHARE + ratio * (1 - ASSET_SHARE)) * 100)
    return
  }

  progress.value = Math.round(ratio * ASSET_SHARE * 100)
}
</script>

<template>
  <main
    class="loading-screen"
    data-loading-mode="manual"
    :style="progressStyle"
  >
    <section
      class="brand"
      aria-label="HEXIAN STUDIOS"
    >
      <svg
        class="brand__logo"
        viewBox="0 0 720 130"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="HEXIAN"
      >
        <g fill="#ffffff">
          <!-- H -->
          <path
            d="
            M20 15
            H52
            V56
            H88
            V15
            H120
            V115
            H88
            V79
            H52
            V115
            H20
            Z
          "
          />

          <!-- E -->
          <path
            d="
            M140 15
            H236
            V40
            H172
            V54
            H226
            V77
            H172
            V90
            H236
            V115
            H140
            Z
          "
          />

          <!-- X -->
          <path
            d="
            M248 15
            H285
            L310 48
            L335 15
            H372
            L330 64
            L374 115
            H336
            L310 80
            L284 115
            H246
            L290 64
            Z
          "
          />

          <!-- I -->
          <path
            d="
            M388 15
            H482
            V40
            H451
            V90
            H482
            V115
            H388
            V90
            H419
            V40
            H388
            Z
          "
          />

          <!-- A -->
          <path
            fill-rule="evenodd"
            d="
              M534 15
              H573
              L622 115
              H588
              L580 95
              H527
              L519 115
              H485
              Z

              M537 71
              H570
              L554 36
              Z
            "
          />

          <!-- N -->
          <path
            d="
            M632 15
            H663
            L700 71
            V15
            H732
            V115
            H701
            L664 59
            V115
            H632
            Z
          "
          />
        </g>

        <!-- 几何切口 -->
        <g fill="#f12d3e">
          <rect
            x="20"
            y="15"
            width="12"
            height="18"
          />
          <rect
            x="220"
            y="96"
            width="16"
            height="19"
          />
          <rect
            x="303"
            y="57"
            width="14"
            height="14"
            transform="rotate(45 310 64)"
          />
          <rect
            x="435"
            y="15"
            width="14"
            height="13"
          />
          <rect
            x="589"
            y="15"
            width="18"
            height="17"
          />
          <rect
            x="716"
            y="94"
            width="16"
            height="21"
          />
        </g>
      </svg>

      <div class="brand__subtitle">
        STUDIOS
      </div>
    </section>

    <div
      class="loader"
      role="progressbar"
      aria-label="Loading"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="progress"
    >
      <div class="loader__track">
        <div class="loader__progress" />
      </div>
    </div>
  </main>
</template>

<style scoped>
.loading-screen {
  --loading-bg: #f12d3e;
  --loading-fg: #ffffff;
  --progress-width: min(59vw, 520px);
  --progress-height: 9px;
  --progress-value: 0%;

  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-width: 320px;
  min-height: 230px;
  overflow: hidden;
  background: var(--loading-bg);
  color: var(--loading-fg);
  user-select: none;
  font-family: Arial, Helvetica, sans-serif;
}

.brand {
  position: absolute;
  top: 51%;
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(62vw, 520px);
  transform: translate(-50%, -50%);
}

.brand__logo {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.brand__subtitle {
  margin-top: clamp(12px, 2vw, 18px);
  padding-left: 0.55em;
  color: #fff;
  font-size: clamp(13px, 2.5vw, 20px);
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.55em;
  text-align: center;
}

.loader {
  position: absolute;
  bottom: clamp(18px, 6.5vh, 48px);
  left: 50%;
  width: var(--progress-width);
  height: var(--progress-height);
  transform: translateX(-50%);
}

.loader__track {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.55);
  background: rgba(255, 255, 255, 0.08);
}

.loader__progress {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: var(--progress-value);
  background: #ffffff;
  transition: width 180ms linear;
  will-change: width;
}

.loader__progress::after {
  position: absolute;
  top: 0;
  right: -2px;
  bottom: 0;
  width: 3px;
  content: '';
  background: #ffffff;
  box-shadow: 0 0 7px rgba(255, 255, 255, 0.35);
}

@media (max-width: 600px) {
  .loading-screen {
    --progress-width: 74vw;
    --progress-height: 9px;
  }

  .brand {
    width: 76vw;
  }

  .brand__subtitle {
    letter-spacing: 0.42em;
  }
}

@media (max-height: 360px) {
  .brand {
    top: 48%;
    width: min(56vw, 430px);
  }

  .brand__subtitle {
    margin-top: 9px;
  }

  .loader {
    bottom: 14px;
  }
}
</style>
