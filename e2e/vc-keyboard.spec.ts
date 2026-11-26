import { expect, test, type Locator, type Page } from '@playwright/test'
import { pointerUsed, trackPointer } from './lib/hc.ts'
import { searchBox, sheet } from './lib/sfe.ts'
import { arrow, openSignedIn, settled, toast } from './lib/sl.ts'
import { chainCard, laneIn, nameBox, renameButton, renameDialog, scopeBox, seedChainsDataset, tickersInView, ZONE } from './lib/vc.ts'

test.use({ timezoneId: ZONE, actionTimeout: 15_000 })

/** Presses Tab until `target` has focus (at most `max` presses), so the test follows the real order. */
async function tabTo(page: Page, target: Locator, label: string, key: 'Tab' | 'Shift+Tab' = 'Tab', max = 80): Promise<number> {
  for (let i = 1; i <= max; i++) {
    await page.keyboard.press(key)
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return i
  }
  throw new Error(`Tab never reached ${label}; focus is on ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120))}`)
}
const focusVisible = (page: Page) => page.evaluate(() => document.activeElement?.matches(':focus-visible') ?? false)

test('TC-E-922: every action of the page and the rename works with the keyboard alone, and no pointer event fires', async ({ page }) => {
  test.setTimeout(180_000)
  await trackPointer(page)
  const seed = await seedChainsDataset()
  await openSignedIn(page, seed.user, '/chains')
  await expect(page.getByRole('heading', { level: 1, name: 'Value chains' })).toBeVisible()
  await settled(page)

  // Scope: Tab to the select, open it, arrow to Held stocks, Enter
  await tabTo(page, scopeBox(page), 'the Scope select')
  expect(await focusVisible(page)).toBe(true)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('option', { name: /^All stocks/ })).toBeVisible()
  await arrow(page, 'ArrowDown')
  await page.keyboard.press('Enter')
  await expect(scopeBox(page)).toContainText('Held stocks')
  await expect.poll(async () => (await tickersInView(page)).includes('AMAT')).toBe(false)

  // Search: Tab to it and type
  await tabTo(page, searchBox(page), 'the search box')
  await page.keyboard.type('ptt')
  await expect.poll(async () => (await tickersInView(page)).sort()).toEqual(['PTT', 'PTTEP'])

  // Filters: Enter opens, Space ticks a box, Escape closes and returns to the button
  const filters = page.getByRole('button', { name: /^Filters/ })
  await tabTo(page, filters, 'Filters')
  await page.keyboard.press('Enter')
  await expect(sheet(page)).toBeVisible()
  await tabTo(page, sheet(page).getByRole('checkbox', { name: /^TH, / }), 'the TH checkbox')
  expect(await focusVisible(page)).toBe(true)
  await page.keyboard.press('Space')
  await expect(sheet(page).getByRole('checkbox', { name: /^TH, / })).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)
  await expect(filters).toBeFocused()

  // Rename "Oil & Gas" into the chain that already exists, confirm the merge
  const rename = renameButton(page, 'Oil & Gas')
  await tabTo(page, rename, 'Rename')
  expect(await focusVisible(page)).toBe(true)
  await page.keyboard.press('Enter')
  await expect(renameDialog(page)).toBeVisible()
  await expect(nameBox(page)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(renameDialog(page)).toHaveCount(0)
  await expect(rename).toBeFocused() // Escape returns to the button
  await page.keyboard.press('Enter')
  await expect(nameBox(page)).toBeFocused()
  await page.keyboard.type('AI & Semis') // the field is selected, so this replaces the title
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: /^Merge into "AI & Semis"\?$/ })).toBeFocused()
  await tabTo(page, dialog.getByRole('button', { name: /^Merge \d+ stocks$/ }), 'the Merge button')
  await page.keyboard.press('Enter')
  await expect(toast(page, /^Merged into AI & Semis/)).toBeVisible()
  await expect(dialog).toHaveCount(0)
  // Focus lands on the merged chain's heading, and the keyboard is not trapped
  await expect(chainCard(page, 'AI & Semis').getByRole('heading', { level: 2 })).toBeFocused()
  expect((await seed.api.stocks()).filter((s) => s.valueChain === 'AI & Semis')).toHaveLength(9)
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') === null)).toBe(true)

  // Clear the view, then Tab to a Set position link and open it
  await tabTo(page, page.getByRole('button', { name: 'Clear all' }).first(), 'Clear all', 'Shift+Tab')
  await page.keyboard.press('Enter')
  await expect(searchBox(page)).toHaveValue('')
  // BCP is not held, so the Held scope hides it: back to the Scope select and choose All stocks
  await tabTo(page, scopeBox(page), 'the Scope select', 'Shift+Tab')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('option', { name: /^All stocks/ })).toBeVisible()
  await arrow(page, 'ArrowUp')
  await page.keyboard.press('Enter')
  await expect(scopeBox(page)).toContainText('All stocks')
  const setPosition = laneIn(chainCard(page, 'AI & Semis'), 'No position').getByRole('link', { name: 'Set position of BCP' })
  await tabTo(page, setPosition, 'Set position')
  expect(await focusVisible(page)).toBe(true)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/stocks/${seed.stocks['BCP']?.id}/edit$`))

  expect(await pointerUsed(page)).toBe(false)
})
