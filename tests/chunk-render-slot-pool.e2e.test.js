import { expect, test } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

async function attachExperience(page) {
  await page.goto('/')
  await page.evaluate(async () => {
    const { default: Experience } = await import('/src/js/experience.js')
    window.__chunkSlotTestExperience = new Experience()
  })
  await page.waitForFunction(() => window.__chunkSlotTestExperience?.world?.chunkManager)
  await page.evaluate(() => window.__chunkSlotTestExperience.world.chunkManager.whenRenderReady())
}

test('starts with a complete fixed 3x3 render window', async ({ page }) => {
  await attachExperience(page)
  const diagnostics = await page.evaluate(() =>
    window.__chunkSlotTestExperience.world.chunkManager.getRenderDiagnostics(),
  )

  expect(diagnostics.totalSlots).toBe(14)
  expect(diagnostics.activeSlots).toBe(9)
  expect(diagnostics.freeSlots).toBe(5)
  expect(diagnostics.estimatedBufferBytes).toBe(63594496)
})

test('rebuilds the active render window from data-only chunks', async ({ page }) => {
  await attachExperience(page)
  const result = await page.evaluate(() => {
    const chunkManager = window.__chunkSlotTestExperience.world.chunkManager
    const slotIds = Array.from(chunkManager.activeSlots.values(), slot => slot.group.uuid)

    chunkManager._rebuildAllChunks()

    return {
      activeSlots: chunkManager.activeSlots.size,
      beforeSlotIds: slotIds,
      slotIds: Array.from(chunkManager.activeSlots.values(), slot => slot.group.uuid),
    }
  })

  expect(result.activeSlots).toBe(9)
  expect(result.slotIds).toEqual(result.beforeSlotIds)
})
