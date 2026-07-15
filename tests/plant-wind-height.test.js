import { expect, test } from '@playwright/test'

import { sharedCrossPlaneGeometry } from '../src/js/world/terrain/blocks-config.js'

test('plant cross-plane geometry exposes rooted wind height weights', () => {
  const position = sharedCrossPlaneGeometry.getAttribute('position')
  const windHeight = sharedCrossPlaneGeometry.getAttribute('aPlantWindHeight')

  expect(windHeight, 'expected aPlantWindHeight attribute on plant geometry').toBeTruthy()
  expect(windHeight.count).toBe(position.count)

  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i)
    const weight = windHeight.getX(i)

    if (y === 0) {
      expect(weight, `root vertex ${i} should not receive wind displacement`).toBe(0)
    }
    else if (y === 1) {
      expect(weight, `tip vertex ${i} should receive full wind displacement`).toBe(1)
    }
    else {
      expect(weight, `middle vertex ${i} should receive partial wind displacement`).toBeGreaterThan(0)
      expect(weight, `middle vertex ${i} should receive partial wind displacement`).toBeLessThan(1)
    }
  }
})
