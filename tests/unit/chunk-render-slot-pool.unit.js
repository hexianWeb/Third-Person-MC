import assert from 'node:assert/strict'
import test from 'node:test'

import { FIXED_INSTANCE_BUFFER_BYTES } from '../../src/js/config/chunk-render-capacity.js'
import ChunkRenderSlotPool from '../../src/js/world/terrain/chunk-render-slot-pool.js'

function createFakeSlot({ id, onMeshCreated }) {
  onMeshCreated?.({ initialFor: id })
  return {
    id,
    state: 'free',
    group: { slotId: id },
    materialEpoch: 0,
    resetCalls: 0,
    disposeCalls: 0,
    finishEpochs: [],
    transactions: [],
    prepareForCompile() {
      this.state = 'compiling'
    },
    finishCompile(epoch) {
      this.finishEpochs.push(epoch)
      this.materialEpoch = epoch
      this.state = 'free'
    },
    reset() {
      this.resetCalls++
      this.state = 'free'
    },
    replaceOverflowMesh(error) {
      const transaction = {
        mesh: { replacementFor: this.id },
        capacity: 2 ** Math.ceil(Math.log2(error.required)),
        commitCalls: 0,
        disposeCalls: 0,
        commit() {
          this.commitCalls++
          onMeshCreated?.(this.mesh)
        },
        dispose() {
          this.disposeCalls++
        },
      }
      this.transactions.push({ error, transaction })
      return transaction
    },
    getRenderObjects() {
      return []
    },
    dispose() {
      this.disposeCalls++
      this.state = 'disposed'
    },
  }
}

function createPool(overrides = {}) {
  return new ChunkRenderSlotPool({
    resources: {},
    renderParams: {},
    waterParams: {},
    slotFactory: createFakeSlot,
    delay: () => Promise.resolve(),
    ...overrides,
  })
}

async function initializePool(pool, renderer = { compileAsync: async () => {} }) {
  await pool.initialize(renderer, {}, {})
  return pool
}

test('prewarms exactly fourteen slots serially with the live compile context', async () => {
  let inFlight = 0
  let maxInFlight = 0
  const scene = {}
  const camera = {}
  const compileCalls = []
  let pool
  const renderer = {
    async compileAsync(group, receivedCamera, receivedScene) {
      assert.equal(pool.slots.length, 14)
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      compileCalls.push({ group, receivedCamera, receivedScene })
      await Promise.resolve()
      inFlight--
    },
  }

  pool = createPool()
  const ready = pool.initialize(renderer, scene, camera)

  assert.equal(pool.whenReady(), ready)
  await ready

  assert.equal(pool.slots.length, 14)
  assert.equal(compileCalls.length, 14)
  assert.equal(maxInFlight, 1)
  assert.ok(compileCalls.every(({ receivedCamera }) => receivedCamera === camera))
  assert.ok(compileCalls.every(({ receivedScene }) => receivedScene === scene))
  assert.ok(pool.slots.every(slot => slot.finishEpochs[0] === 0))
  assert.equal(pool.getDiagnostics().freeSlots, 14)
  assert.equal(pool.getDiagnostics().startupCompileCount, 14)
  assert.equal(pool.getDiagnostics().compileCount, 0)
})

test('retries compilation once and never creates a fifteenth slot', async () => {
  let firstSlotAttempts = 0
  let delayCalls = 0
  const renderer = {
    async compileAsync(group) {
      if (group.slotId !== 0)
        return
      firstSlotAttempts++
      if (firstSlotAttempts === 1)
        throw new Error('transient compile failure')
    },
  }
  const pool = createPool({
    delay: async (milliseconds) => {
      assert.equal(milliseconds, 250)
      delayCalls++
    },
  })

  await pool.initialize(renderer, {}, {})

  assert.equal(firstSlotAttempts, 2)
  assert.equal(delayCalls, 1)
  assert.equal(pool.slots.length, 14)
})

test('reports a twice-failed prewarm compile without expanding the fixed slot pool', async () => {
  let attempts = 0
  const failures = []
  const pool = createPool({
    onCompileFailure: ({ context, error }) => {
      failures.push({
        slotId: context.slotId,
        phase: context.phase,
        reason: error.message,
      })
    },
  })

  await assert.rejects(
    pool.initialize({
      async compileAsync(group) {
        if (group.slotId !== 0)
          return
        attempts++
        throw new Error('permanent compile failure')
      },
    }, {}, {}),
    /permanent compile failure/,
  )

  assert.equal(attempts, 2)
  assert.equal(pool.slots.length, 14)
  assert.equal(pool.slots[0].state, 'failed')
  assert.deepEqual(failures, [{
    slotId: 0,
    phase: 'startup',
    reason: 'permanent compile failure',
  }])
  assert.equal(typeof pool.getDiagnostics().lastCompileMs, 'number')
})

test('stops prewarm submissions when the renderer is unavailable', async () => {
  let compileCalls = 0
  const failures = []
  const pool = createPool({
    onCompileFailure: failure => failures.push(failure),
  })

  await assert.rejects(
    pool.initialize({
      async compileAsync() {
        compileCalls++
      },
    }, {}, {}, () => false),
    /Renderer is unavailable/,
  )

  assert.equal(compileCalls, 0)
  assert.equal(pool.slots[0].state, 'free')
  assert.deepEqual(failures, [])
})

test('initialize binds the first renderer, scene, and camera exactly once', async () => {
  let compileCalls = 0
  const pool = createPool()
  const first = pool.initialize({
    async compileAsync() {
      compileCalls++
    },
  }, {}, {})
  const second = pool.initialize({
    async compileAsync() {
      assert.fail('second renderer must not be bound')
    },
  }, {}, {})

  assert.equal(second, first)
  await second
  assert.equal(compileCalls, 14)
})

test('acquire is bounded and release resets a slot without disposing it', async () => {
  const pool = await initializePool(createPool())
  const acquired = Array.from({ length: 14 }, () => pool.acquire())

  assert.ok(acquired.every(Boolean))
  assert.equal(new Set(acquired).size, 14)
  assert.equal(pool.acquire(), null)
  assert.equal(pool.getDiagnostics().stagingSlots, 14)
  assert.equal(pool.getDiagnostics().freeSlots, 0)

  const slot = acquired[0]
  pool.release(slot)

  assert.equal(slot.resetCalls, 1)
  assert.equal(slot.disposeCalls, 0)
  assert.equal(pool.acquire(), slot)
  assert.equal(pool.slots.length, 14)
})

test('diagnostics are fresh frozen snapshots with the fixed memory estimate', async () => {
  const pool = await initializePool(createPool())
  const first = pool.getDiagnostics()
  const second = pool.getDiagnostics()

  assert.notEqual(first, second)
  assert.equal(Object.isFrozen(first), true)
  assert.deepEqual(first, {
    totalSlots: 14,
    activeSlots: 0,
    stagingSlots: 0,
    freeSlots: 14,
    failedSlots: 0,
    meshCreateCount: 0,
    compileCount: 0,
    overflowCount: 0,
    estimatedBufferBytes: FIXED_INSTANCE_BUFFER_BYTES,
    lastTransitionMs: 0,
    lastCompileMs: 0,
    startupCompileCount: 14,
    materialEpoch: 0,
  })
})

test('overflow compiles the actual replacement before evaluating and committing the guard', async () => {
  let finishCompile
  const compileGate = new Promise((resolve) => {
    finishCompile = resolve
  })
  let replacementCompileStarted = false
  let guardCalls = 0
  const renderer = {
    async compileAsync(target) {
      if (!target.replacementFor && target.replacementFor !== 0)
        return
      replacementCompileStarted = true
      await compileGate
    },
  }
  const pool = await initializePool(createPool(), renderer)
  const slot = pool.acquire()
  const error = { layer: 'blocks', typeId: 'grass', required: 5 }
  const pending = pool.ensureCapacity(slot, error, () => {
    guardCalls++
    return true
  })

  await Promise.resolve()
  const { transaction } = slot.transactions[0]
  assert.equal(replacementCompileStarted, true)
  assert.equal(guardCalls, 0)
  assert.equal(transaction.commitCalls, 0)

  finishCompile()
  assert.equal(await pending, true)
  assert.equal(guardCalls, 1)
  assert.equal(transaction.commitCalls, 1)
  assert.equal(transaction.disposeCalls, 0)
  assert.equal(transaction.capacity, 8)
  assert.equal(pool.getDiagnostics().compileCount, 1)
  assert.equal(pool.getDiagnostics().overflowCount, 1)
  assert.equal(pool.getDiagnostics().meshCreateCount, 1)
})

test('a stale overflow disposes only the uncommitted replacement', async () => {
  const pool = await initializePool(createPool())
  const slot = pool.acquire()

  const committed = await pool.ensureCapacity(
    slot,
    { layer: 'plants', typeId: 'short_grass', required: 3 },
    () => false,
  )
  const { transaction } = slot.transactions[0]

  assert.equal(committed, false)
  assert.equal(transaction.commitCalls, 0)
  assert.equal(transaction.disposeCalls, 1)
  assert.equal(pool.getDiagnostics().compileCount, 0)
  assert.equal(pool.getDiagnostics().overflowCount, 0)
  assert.equal(pool.getDiagnostics().meshCreateCount, 0)
})

test('a failed overflow retry disposes the replacement without evaluating the guard', async () => {
  let replacementAttempts = 0
  let guardCalls = 0
  const failures = []
  const renderer = {
    async compileAsync(target) {
      if (!target.replacementFor && target.replacementFor !== 0)
        return
      replacementAttempts++
      throw new Error('replacement compile failure')
    },
  }
  const pool = await initializePool(createPool({
    onCompileFailure: ({ context, error }) => failures.push({
      chunkX: context.chunkX,
      chunkZ: context.chunkZ,
      reason: error.message,
    }),
  }), renderer)
  const slot = pool.acquire()

  await assert.rejects(
    pool.ensureCapacity(
      slot,
      { layer: 'blocks', typeId: 'stone', required: 9000 },
      () => {
        guardCalls++
        return true
      },
      { chunkX: 3, chunkZ: -2 },
    ),
    /replacement compile failure/,
  )
  const { transaction } = slot.transactions[0]

  assert.equal(replacementAttempts, 2)
  assert.equal(guardCalls, 0)
  assert.equal(transaction.commitCalls, 0)
  assert.equal(transaction.disposeCalls, 1)
  assert.equal(pool.getDiagnostics().compileCount, 0)
  assert.equal(slot.state, 'failed')
  assert.equal(pool.getDiagnostics().failedSlots, 1)
  assert.deepEqual(failures, [{
    chunkX: 3,
    chunkZ: -2,
    reason: 'replacement compile failure',
  }])
})

test('material invalidation advances the epoch and dispose destroys every slot once', async () => {
  const pool = await initializePool(createPool())

  assert.equal(pool.invalidateMaterialType('grass'), 1)
  assert.equal(pool.invalidateMaterialType('grass'), 2)
  assert.equal(pool.getDiagnostics().materialEpoch, 2)

  pool.dispose()
  pool.dispose()

  assert.ok(pool.slots.every(slot => slot.disposeCalls === 1))
  assert.equal(pool.acquire(), null)
})

test('update advances each shared animated material only once per frame', async () => {
  const animatedMaterial = {
    _isAnimated: true,
    uniforms: { uTime: { value: 0 } },
  }
  const pool = await initializePool(createPool({
    slotFactory: function createAnimatedSlot(options) {
      const slot = createFakeSlot(options)
      slot.getRenderObjects = () => [
        { material: animatedMaterial },
        { material: animatedMaterial },
      ]
      return slot
    },
  }))

  pool.update(12.5)

  assert.equal(animatedMaterial.uniforms.uTime.value, 12.5)
})

test('dispose during prewarm prevents late completion from mutating disposed slots', async () => {
  let finishCompile
  const compileGate = new Promise((resolve) => {
    finishCompile = resolve
  })
  let compileStarted
  const started = new Promise((resolve) => {
    compileStarted = resolve
  })
  const pool = createPool()
  const ready = pool.initialize({
    async compileAsync() {
      compileStarted()
      await compileGate
    },
  }, {}, {})

  await started
  const firstSlot = pool.slots[0]
  pool.dispose()
  finishCompile()

  await assert.rejects(ready, /disposed during prewarm/)
  assert.equal(firstSlot.disposeCalls, 1)
  assert.equal(firstSlot.finishEpochs.length, 0)
  assert.equal(firstSlot.resetCalls, 0)
  assert.equal(firstSlot.state, 'disposed')
})

function createMaterialSlot({ id, onMeshCreated, initialMaterial = { name: `old-${id}` } }) {
  const slot = createFakeSlot({ id, onMeshCreated })
  slot.renderObject = { material: initialMaterial, installed: true }
  slot.materialTransactions = []
  slot.prepareMaterialReplacement = function (typeId, materialFactory) {
    const material = materialFactory(this.renderObject, typeId)
    const transaction = {
      group: { materialPreviewFor: this.id },
      materials: new Set([material]),
      oldMaterials: new Set([this.renderObject.material]),
      hasReplacements: true,
      commitCalls: 0,
      disposeCalls: 0,
      isCurrent: () => this.renderObject.installed,
      commit: () => {
        assert.equal(transaction.isCurrent(), true)
        transaction.commitCalls++
        this.renderObject.material = material
      },
      dispose: () => {
        transaction.disposeCalls++
      },
    }
    this.materialTransactions.push(transaction)
    return transaction
  }
  const replaceOverflowMesh = slot.replaceOverflowMesh.bind(slot)
  slot.replaceOverflowMesh = function (error) {
    const transaction = replaceOverflowMesh(error)
    const commit = transaction.commit.bind(transaction)
    transaction.commit = () => {
      this.renderObject.installed = false
      return commit()
    }
    return transaction
  }
  return slot
}

function createStagedMaterialGeneration() {
  const stagedMaterial = {
    disposeCalls: 0,
    dispose() {
      this.disposeCalls++
    },
  }
  return {
    stagedMaterial,
    commitCalls: 0,
    disposeCalls: 0,
    materialFactory: () => stagedMaterial,
    commit() {
      this.commitCalls++
    },
    dispose() {
      this.disposeCalls++
      stagedMaterial.dispose()
    },
  }
}

test('failed material generation retains the active generation and disposes staged ownership once', async () => {
  const generation = createStagedMaterialGeneration()
  const pool = await initializePool(createPool({ slotFactory: createMaterialSlot }), {
    async compileAsync(target) {
      if (target.materialPreviewFor !== undefined)
        throw new Error('material compile failed')
    },
  })

  const originalWarn = console.warn
  const warnings = []
  console.warn = (...args) => warnings.push(args)
  let result
  try {
    result = await pool.invalidateMaterialType('grass', generation)
  }
  finally {
    console.warn = originalWarn
  }

  assert.equal(result, false)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0][0], /material generation failed/)
  assert.equal(generation.commitCalls, 0)
  assert.equal(generation.disposeCalls, 1)
  assert.equal(generation.stagedMaterial.disposeCalls, 1)
  assert.ok(pool.slots.every(slot => slot.materialEpoch === 0))
  assert.ok(pool.slots.every(slot => slot.materialTransactions[0].commitCalls === 0))
  assert.ok(pool.slots.every(slot => slot.materialTransactions[0].disposeCalls === 1))
})

test('a committed material generation disposes a shared active material once', async () => {
  const activeMaterial = {
    disposeCalls: 0,
    dispose() {
      this.disposeCalls++
    },
  }
  const generation = createStagedMaterialGeneration()
  function SharedMaterialSlot(options) {
    return createMaterialSlot({ ...options, initialMaterial: activeMaterial })
  }
  const pool = await initializePool(createPool({
    slotFactory: SharedMaterialSlot,
  }))

  assert.equal(await pool.invalidateMaterialType('grass', generation), true)
  assert.equal(generation.commitCalls, 1)
  assert.equal(generation.disposeCalls, 0)
  assert.equal(activeMaterial.disposeCalls, 1)
  assert.equal(generation.stagedMaterial.disposeCalls, 0)
})

test('stale material generation disposes staged ownership without changing the active generation', async () => {
  let finishCompile
  const compileGate = new Promise((resolve) => {
    finishCompile = resolve
  })
  const generation = createStagedMaterialGeneration()
  const pool = await initializePool(createPool({ slotFactory: createMaterialSlot }), {
    async compileAsync(target) {
      if (target.materialPreviewFor !== undefined)
        await compileGate
    },
  })

  const pending = pool.invalidateMaterialType('grass', generation)
  await Promise.resolve()
  pool.invalidateMaterialType('stone')
  finishCompile()

  assert.equal(await pending, false)
  assert.equal(generation.commitCalls, 0)
  assert.equal(generation.disposeCalls, 1)
  assert.equal(generation.stagedMaterial.disposeCalls, 1)
  assert.ok(pool.slots.every(slot => slot.materialEpoch === 0))
})

test('destroy and overflow both invalidate a pending material generation before it can commit', async () => {
  let finishCompile
  const compileGate = new Promise((resolve) => {
    finishCompile = resolve
  })
  let materialCompileStarted
  const materialStarted = new Promise((resolve) => {
    materialCompileStarted = resolve
  })
  const generation = createStagedMaterialGeneration()
  const pool = await initializePool(createPool({ slotFactory: createMaterialSlot }), {
    async compileAsync(target) {
      if (target.materialPreviewFor !== undefined) {
        materialCompileStarted()
        await compileGate
      }
    },
  })

  const pending = pool.invalidateMaterialType('grass', generation)
  await materialStarted
  const slot = pool.acquire()
  assert.equal(await pool.ensureCapacity(slot, { layer: 'blocks', typeId: 'grass', required: 5 }, () => true), true)
  finishCompile()

  assert.equal(await pending, false)
  assert.equal(generation.commitCalls, 0)
  assert.equal(generation.disposeCalls, 1)
  assert.equal(generation.stagedMaterial.disposeCalls, 1)
  assert.equal(slot.materialEpoch, 0)

  const destroyingGeneration = createStagedMaterialGeneration()
  const destroyingPending = pool.invalidateMaterialType('stone', destroyingGeneration)
  pool.dispose()
  assert.equal(await destroyingPending, false)
  assert.equal(destroyingGeneration.commitCalls, 0)
  assert.equal(destroyingGeneration.disposeCalls, 1)
  assert.equal(destroyingGeneration.stagedMaterial.disposeCalls, 1)
})

test('a material generation started during overflow cannot commit onto the outgoing mesh', async () => {
  let releaseOverflowCompile
  const overflowCompileGate = new Promise((resolve) => {
    releaseOverflowCompile = resolve
  })
  let overflowCompileStarted
  const overflowStarted = new Promise((resolve) => {
    overflowCompileStarted = resolve
  })
  const pool = await initializePool(createPool({ slotFactory: createMaterialSlot }), {
    async compileAsync(target) {
      if (target.replacementFor !== undefined) {
        overflowCompileStarted()
        await overflowCompileGate
      }
    },
  })
  const slot = pool.acquire()
  const overflow = pool.ensureCapacity(slot, { layer: 'blocks', typeId: 'grass', required: 5 }, () => true)

  await overflowStarted
  const generation = createStagedMaterialGeneration()
  const pending = pool.invalidateMaterialType('grass', generation)
  await new Promise(resolve => setImmediate(resolve))
  releaseOverflowCompile()

  assert.equal(await overflow, true)
  assert.equal(await pending, false)
  assert.equal(generation.commitCalls, 0)
  assert.equal(generation.disposeCalls, 1)
  assert.equal(generation.stagedMaterial.disposeCalls, 1)
  assert.equal(slot.materialEpoch, 0)
})
