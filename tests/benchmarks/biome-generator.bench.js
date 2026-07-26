import { performance } from 'node:perf_hooks'

import BiomeGenerator from '../../src/js/world/terrain/biome-generator.js'

const measuredRuns = 30
const warmupRuns = 5
const samples = []

for (let iteration = 0; iteration < warmupRuns + measuredRuns; iteration++) {
  const generator = new BiomeGenerator(1337 + iteration)
  const start = performance.now()
  for (let chunkZ = -1; chunkZ <= 1; chunkZ++) {
    for (let chunkX = -1; chunkX <= 1; chunkX++) {
      generator.generateBiomeMap(
        chunkX * 64,
        chunkZ * 64,
        64,
      )
    }
  }
  const elapsed = performance.now() - start
  if (iteration >= warmupRuns)
    samples.push(elapsed)
}

samples.sort((first, second) => first - second)
function percentile(fraction) {
  return samples[Math.floor((samples.length - 1) * fraction)]
}

console.debug(JSON.stringify({
  workload: '3x3 chunks, 64x64 columns each',
  runs: samples.length,
  medianMs: Number(percentile(0.5).toFixed(2)),
  p95Ms: Number(percentile(0.95).toFixed(2)),
  minMs: Number(samples[0].toFixed(2)),
  maxMs: Number(samples.at(-1).toFixed(2)),
}, null, 2))
