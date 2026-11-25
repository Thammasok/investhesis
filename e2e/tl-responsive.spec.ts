import { expect, test } from '@playwright/test'
import { addEntry, entryCards, entryDialog, openStock, overflowing, sectionCard, seedStockOnly, thesisHeading, ZONE } from './lib/tl.ts'
import { noHorizontalScroll } from './lib/sl.ts'

test.use({ timezoneId: ZONE, viewport: { width: 360, height: 740 }, hasTouch: true })

test('TC-E-714: at 360 px long text wraps, nothing scrolls sideways, Add entry sits beside Thesis, and the dialog scrolls inside', async ({ page }) => {
  const seed = await seedStockOnly()
  const url = `https://example.com/${'a-very-long-path-segment/'.repeat(12)}`.slice(0, 300)
  await seed.api.addThesis(seed.nvda.id, { type: 'buy', date: '2026-11-20', note: `Link: ${url}`, invalidation: 'w'.repeat(1200), targetPrice: '180' })
  await seed.api.addThesis(seed.nvda.id, { type: 'review', date: '2026-10-20', note: 'x'.repeat(5000) })
  await seed.api.addThesis(seed.nvda.id, { type: 'update', date: '2026-09-20', note: Array.from({ length: 12 }, (_, i) => `Line ${i + 1} of a long note`).join('\n') })
  await openStock(page, seed)
  await expect(entryCards(page)).toHaveCount(3)

  // The page: no sideways scroll, nothing past the edge, long words wrap inside their paragraph
  expect(await noHorizontalScroll(page)).toBe(true)
  expect(await overflowing(page)).toEqual([])
  for (const p of await entryCards(page).locator('p, dd').all()) {
    expect(await p.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  }
  // Add entry sits beside the heading, and every action is on screen
  const heading = await thesisHeading(page).boundingBox()
  const add = await addEntry(page).boundingBox()
  expect(Math.abs((heading?.y ?? 0) + (heading?.height ?? 0) / 2 - ((add?.y ?? 0) + (add?.height ?? 0) / 2))).toBeLessThan(24)
  expect((add?.x ?? 0) + (add?.width ?? 0)).toBeLessThanOrEqual(360)
  for (const button of await sectionCard(page).getByRole('button', { name: /^(Edit|Delete) / }).all()) {
    const box = await button.boundingBox()
    expect(box && box.x >= 0 && box.x + box.width <= 360, `${await button.getAttribute('aria-label')} is on screen`).toBe(true)
  }

  // The dialog on a short phone screen: its body scrolls, the page does not move sideways, the last button is reachable
  await page.setViewportSize({ width: 360, height: 500 })
  await addEntry(page).click()
  const content = entryDialog(page)
  await expect(content).toBeVisible()
  const metrics = await content.evaluate((el) => ({ scrolls: el.scrollHeight > el.clientHeight, overflowY: getComputedStyle(el).overflowY, wide: el.scrollWidth > el.clientWidth + 1 }))
  expect(metrics).toEqual({ scrolls: true, overflowY: 'auto', wide: false })
  expect(await noHorizontalScroll(page)).toBe(true)
  const submit = content.getByRole('button', { name: 'Add entry' })
  await submit.scrollIntoViewIfNeeded()
  const box = await submit.boundingBox()
  expect(box && box.y >= 0 && box.y + box.height <= 500).toBe(true)
  await expect(content.getByRole('textbox', { name: /^Thesis/ })).toBeVisible()
})
