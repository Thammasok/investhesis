import { expect, test } from '@playwright/test'
import { pointerUsed, trackPointer } from './lib/hc.ts'
import { addEntry, deleteConfirm, entryCards, entryDialog, entryWith, openStock, seedStockOnly, thesisHeading, ZONE } from './lib/tl.ts'
import { arrow, toast } from './lib/sl.ts'

test.use({ timezoneId: ZONE, actionTimeout: 15_000 })

test('TC-E-715: add, edit, delete and Undo with the keyboard only, and no pointer event ever fires', async ({ page }) => {
  test.setTimeout(120_000)
  await trackPointer(page)
  const seed = await seedStockOnly()
  await seed.api.addThesis(seed.nvda.id, { type: 'buy', date: '2026-01-10', note: 'Already here' })
  await openStock(page, seed)
  const focusedId = () => page.evaluate(() => document.activeElement?.id ?? '')

  // Add: the opener, the first radio, an arrow to Sell, Tab through the fields (the date box has three segments), Ctrl+Enter
  await addEntry(page).focus()
  await page.keyboard.press('Enter')
  await expect(entryDialog(page)).toBeVisible()
  await expect(entryDialog(page).getByRole('radio', { name: 'Buy' })).toBeFocused()
  await arrow(page, 'ArrowRight')
  await expect(entryDialog(page).getByRole('radio', { name: 'Sell' })).toBeChecked()
  const visited: string[] = []
  for (let i = 0; i < 8 && (await focusedId()) !== 'thesis-note'; i++) {
    await page.keyboard.press('Tab')
    visited.push(await focusedId())
  }
  expect(visited).toContain('thesis-date')
  await expect(entryDialog(page).getByRole('textbox', { name: /^Thesis/ })).toBeFocused()
  await page.keyboard.type('Typed by keyboard')
  await page.keyboard.press('Tab')
  await expect(entryDialog(page).getByRole('textbox', { name: /^Target price/ })).toBeFocused()
  await page.keyboard.type('210')
  await page.keyboard.press('Control+Enter')
  await expect(toast(page, 'Entry added')).toBeVisible()
  await expect(entryDialog(page)).toHaveCount(0)
  await expect(addEntry(page)).toBeFocused()
  expect((await seed.api.theses(seed.nvda.id)).find((e) => e.note === 'Typed by keyboard')).toMatchObject({ type: 'sell', targetPrice: '210.0000' })

  // Edit: Tab from Add entry reaches the newest entry's Edit; Enter opens, Esc closes and focus comes back
  await page.keyboard.press('Tab')
  const edit = page.getByRole('button', { name: /^Edit Sell entry/ })
  await expect(edit).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(entryDialog(page)).toBeVisible()
  await expect(entryDialog(page).getByRole('radio', { name: 'Sell' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(entryDialog(page)).toHaveCount(0)
  await expect(edit).toBeFocused()

  // Delete: Tab to Delete, Enter, the confirm opens on Cancel, Tab to Delete, Enter; focus lands on the heading
  await page.keyboard.press('Tab')
  const del = page.getByRole('button', { name: /^Delete Sell entry/ })
  await expect(del).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(deleteConfirm(page).getByRole('button', { name: 'Cancel' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(deleteConfirm(page).getByRole('button', { name: 'Delete' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(toast(page, 'Entry deleted')).toBeVisible()
  await expect(thesisHeading(page)).toBeFocused()
  await expect(entryWith(page, 'Typed by keyboard')).toHaveCount(0)

  // Undo from the toast: the hotkey moves focus into the toasts, Tab reaches Undo
  await page.keyboard.press('Alt+T')
  for (let i = 0; i < 6; i++) {
    if ((await page.evaluate(() => document.activeElement?.textContent?.trim())) === 'Undo') break
    await page.keyboard.press('Tab')
  }
  await expect(page.getByRole('button', { name: 'Undo' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(toast(page, 'Entry restored')).toBeVisible()
  await expect(entryWith(page, 'Typed by keyboard')).toBeVisible()
  await expect(entryCards(page)).toHaveCount(2)

  expect(await pointerUsed(page)).toBe(false)
})
