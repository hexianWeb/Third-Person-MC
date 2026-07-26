import { expect, test } from '@playwright/test'

test('biome debug map exposes macro controls and production display modes', async ({ page }) => {
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error')
      consoleErrors.push(message.text())
  })

  await page.goto('/biome-debug.html')
  await expect(page.locator('#map-canvas')).toBeVisible()
  await expect(page.locator('#ctrl-region-size')).toHaveValue('128')
  await expect(page.locator('#ctrl-transition-width')).toHaveValue('20')
  await expect(page.locator('#ctrl-warp-strength')).toHaveValue('12')
  await expect(page.locator('[data-mode="transition"]')).toBeVisible()
  await expect(page.locator('#ctrl-show-sites')).toBeChecked()
  await expect(page.locator('#ctrl-show-chunks')).toBeChecked()

  await page.locator('[data-mode="transition"]').click()
  await expect(page.locator('[data-mode="transition"]')).toHaveClass(/active/)

  await page.locator('#ctrl-region-size').evaluate((element) => {
    element.value = '160'
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await expect(page.locator('#val-region-size')).toHaveText('160')

  await page.waitForTimeout(250)
  expect(consoleErrors).toEqual([])
})
