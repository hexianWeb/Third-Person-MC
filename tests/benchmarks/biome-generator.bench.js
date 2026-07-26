import { performance } from 'node:perf_hooks'

import BiomeGenerator from '../../src/js/world/terrain/biome-generator.js'

const measuredRuns = 30
const warmupRuns = 5
const advisoryMedianMs = 15
const advisoryP95Ms = 25
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

function percentile(fraction) {
  return samples[Math.ceil(samples.length * fraction) - 1]
}

samples.sort((first, second) => first - second)
const result = {
  workload: '3x3 chunks, 64x64 columns each',
  runs: samples.length,
  medianMs: Number(percentile(0.5).toFixed(2)),
  p95Ms: Number(percentile(0.95).toFixed(2)),
  minMs: Number(samples[0].toFixed(2)),
  maxMs: Number(samples.at(-1).toFixed(2)),
  advisoryBudget: {
    medianMs: advisoryMedianMs,
    p95Ms: advisoryP95Ms,
  },
}

console.debug(JSON.stringify(result, null, 2))

if (result.medianMs > advisoryMedianMs || result.p95Ms > advisoryP95Ms)
  console.warn('Biome benchmark exceeded its advisory budget; occasional spikes are allowed.')
