import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { BackupV2, EXPORT_COLUMNS } from '../packages/domain/src/index.ts'
import { parseCsv } from './lib/sfe.ts'
import { ADVICE, addEntry, addFirstEntry, addViaUi, countText, dateBox, deleteConfirm, editButton, entryCards, entryDialog, entryWith, fillEntry, localToday, noteBox, openAdd, openStock, sectionCard, seedStockOnly, seedWithEntries, shown, ZONE } from './lib/tl.ts'
import { apiAs, newUser, openSignedIn, settled, th, toast, us } from './lib/sl.ts'

test.use({ timezoneId: ZONE })

const today = () => localToday()
const tomorrow = () => {
  const d = new Date(`${today()}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
const download = async (page: Page, trigger: () => Promise<void>) => {
  const [file] = await Promise.all([page.waitForEvent('download'), trigger()])
  return { name: file.suggestedFilename(), bytes: readFileSync((await file.path())!) }
}
const deleteEntry = async (page: Page, name: RegExp | string) => {
  await editButton(page, name).click()
  await deleteConfirm(page).getByRole('button', { name: 'Delete' }).click()
  await expect(deleteConfirm(page)).toHaveCount(0)
}

test.describe('write, edit, delete and undo', () => {
  test('TC-E-700: add the first entry with every field, see it, reload, and the API holds it with the exact target', async ({ page }) => {
    const seed = await seedStockOnly()
    await openStock(page, seed)

    await expect(sectionCard(page)).toContainText('No thesis yet')
    await addFirstEntry(page).click()
    await fillEntry(page, { type: 'Buy', note: 'Capex up.\nMargins hold.', target: '180', invalidation: 'Gross margin below 65%.' })
    await entryDialog(page).getByRole('button', { name: 'Add entry' }).click()

    await expect(toast(page, 'Entry added')).toBeVisible()
    await expect(countText(page, '1 entry')).toBeVisible()
    const check = async () => {
      const card = entryCards(page).first()
      await expect(card.locator('[data-slot="badge"]')).toHaveText('Buy')
      await expect(card.locator('time')).toHaveText(shown(today()))
      await expect(card.locator('p')).toHaveText('Capex up.\nMargins hold.')
      await expect(card.getByText('$180.00', { exact: true })).toBeVisible()
      await expect(card.getByText('Gross margin below 65%.')).toBeVisible()
    }
    await check()
    await page.reload()
    await check()
    const [saved] = await seed.api.theses(seed.nvda.id)
    expect(saved).toMatchObject({ type: 'buy', date: today(), note: 'Capex up.\nMargins hold.', targetPrice: '180.0000', invalidation: 'Gross margin below 65%.' })
  })

  test('TC-E-701: the newest date and then the newest entry come first; the date defaults to today and the future is refused', async ({ page }) => {
    const seed = await seedStockOnly()
    await openStock(page, seed)

    await openAdd(page)
    await expect(dateBox(page)).toHaveValue(today())
    await expect(dateBox(page)).toHaveAttribute('max', today())
    await fillEntry(page, { type: 'Buy', date: tomorrow(), note: 'from the future' })
    await entryDialog(page).getByRole('button', { name: 'Add entry' }).click()
    await expect(entryDialog(page).getByText("The date can't be in the future.")).toBeVisible()
    expect(await seed.api.theses(seed.nvda.id)).toEqual([])
    await entryDialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(entryDialog(page)).toHaveCount(0)

    await addViaUi(page, { date: '2026-11-20', note: 'A' })
    await addViaUi(page, { date: '2025-03-14', note: 'C' })
    await addViaUi(page, { date: '2026-11-20', note: 'B' })

    await expect.poll(async () => (await entryCards(page).locator('p').allTextContents()).map((t) => t.trim())).toEqual(['B', 'A', 'C'])
    expect((await seed.api.theses(seed.nvda.id)).map((e) => e.note)).toEqual(['B', 'A', 'C'])
  })

  test('TC-E-702: an edit shows Edited; saving again with no change toasts "No changes to save" and writes nothing', async ({ page }) => {
    const seed = await seedStockOnly()
    const entry = await seed.api.addThesis(seed.nvda.id, { type: 'buy', date: '2026-11-20', note: 'First version' })
    await openStock(page, seed)

    await editButton(page, /^Edit Buy entry/).click()
    await noteBox(page).fill('Second version')
    await entryDialog(page).getByRole('button', { name: 'Save' }).click()

    await expect(toast(page, 'Entry updated')).toBeVisible()
    await expect(entryWith(page, 'Second version').getByText(`Edited ${shown(today())}`)).toBeVisible()
    const [after] = await seed.api.theses(seed.nvda.id)
    expect(after?.updatedAt && after.createdAt && Date.parse(after.updatedAt) > Date.parse(after.createdAt)).toBe(true)
    expect(after?.id).toBe(entry.id)

    await expect(editButton(page, /^Edit Buy entry/)).toBeFocused()
    await editButton(page, /^Edit Buy entry/).click()
    await entryDialog(page).getByRole('button', { name: 'Save' }).click()
    await expect(toast(page, 'No changes to save')).toBeVisible()
    await expect(entryDialog(page)).toHaveCount(0)
    await expect(entryWith(page, 'Second version').getByText(`Edited ${shown(today())}`)).toBeVisible()
    expect((await seed.api.theses(seed.nvda.id))[0]?.updatedAt).toBe(after?.updatedAt)
  })

  test('TC-E-703: delete an edited entry and Undo within 5 s brings it back unchanged', async ({ page }) => {
    const seed = await seedStockOnly()
    const entry = await seed.api.addThesis(seed.nvda.id, { type: 'review', date: '2026-10-01', note: 'Original', targetPrice: '42.25', invalidation: 'x' })
    await seed.api.patchThesis(seed.nvda.id, entry.id, { note: 'Rewritten reasoning' })
    const before = (await seed.api.theses(seed.nvda.id))[0]
    await openStock(page, seed)
    await expect(entryWith(page, 'Rewritten reasoning').getByText(/^Edited /)).toBeVisible()

    await deleteEntry(page, /^Delete Review entry of 1 Oct 2026/)
    await expect(toast(page, 'Entry deleted')).toBeVisible()
    await expect(entryCards(page)).toHaveCount(0)
    await toast(page, 'Entry deleted').getByRole('button', { name: 'Undo' }).click()

    await expect(toast(page, 'Entry restored')).toBeVisible()
    await expect(entryWith(page, 'Rewritten reasoning').getByText(/^Edited /)).toBeVisible()
    await page.reload()
    await expect(entryWith(page, 'Rewritten reasoning').getByText(/^Edited /)).toBeVisible()
    expect((await seed.api.theses(seed.nvda.id))[0]).toEqual(before)
  })

  test('TC-E-704: without Undo for 6 s the toast goes and the entry stays deleted', async ({ page }) => {
    const seed = await seedStockOnly()
    await seed.api.addThesis(seed.nvda.id, { type: 'sell', date: '2026-09-09', note: 'Gone for good' })
    await openStock(page, seed)

    await deleteEntry(page, /^Delete Sell entry of 9 Sep 2026/)
    await expect(toast(page, 'Entry deleted')).toBeVisible()
    await page.mouse.move(0, 0)
    await page.waitForTimeout(6000)

    await expect(toast(page, 'Entry deleted')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
    await page.reload()
    await expect(sectionCard(page)).toContainText('No thesis yet')
    expect(await seed.api.theses(seed.nvda.id)).toEqual([])
  })
})

test.describe('the stock and the backup', () => {
  test('TC-E-705: deleting a stock names its entries and removes them, from the API and the backup, leaving other stocks alone', async ({ page }) => {
    const seed = await seedWithEntries()
    const other = await seed.api.stock(us('AAPL', { name: 'Apple Inc' }))
    const keep = await seed.api.addThesis(other.id, { type: 'buy', date: '2026-05-05', note: 'Apple stays' })
    await openStock(page, seed)

    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Delete NVDA?' })
    await expect(dialog).toContainText('This also deletes its 3 thesis entries.')
    await dialog.getByRole('button', { name: 'Delete' }).click()

    await expect(page).toHaveURL(/\/stocks$/)
    expect((await seed.api.call('GET', `/stocks/${seed.nvda.id}/theses`)).status).toBe(404)
    const backup = await seed.api.backupJson()
    const gone = new Set(seed.entries.map((e) => e.id))
    expect(backup.theses.filter((e) => gone.has(e.id))).toEqual([])
    expect(backup.theses).toEqual([keep])
    expect(await seed.api.theses(other.id)).toEqual([keep])
  })

  test('TC-E-706: the downloaded JSON backup is version 2 with the entries and no user id; the CSV is unchanged by entries', async ({ page }) => {
    const seed = await seedStockOnly()
    const aapl = await seed.api.stock(us('AAPL', { name: 'Apple Inc' }))
    const csvBefore = (await seed.api.backup('csv')).text
    await seed.api.addThesis(seed.nvda.id, { type: 'buy', date: '2026-11-20', note: 'One', targetPrice: '180' })
    await seed.api.addThesis(seed.nvda.id, { type: 'update', date: '2026-10-03', note: 'Two' })
    await seed.api.addThesis(aapl.id, { type: 'sell', date: '2026-01-02', note: 'Three', invalidation: 'x' })
    await openSignedIn(page, seed.user, '/import-export')
    await settled(page)

    const json = await download(page, () => page.getByRole('button', { name: 'Download JSON' }).click())
    const csv = await download(page, () => page.getByRole('button', { name: 'Download CSV' }).click())

    const text = json.bytes.toString('utf8')
    const backup = BackupV2.parse(JSON.parse(text))
    expect(backup.formatVersion).toBe(2)
    const stored = [...(await seed.api.theses(seed.nvda.id)), ...(await seed.api.theses(aapl.id))]
    const byStock = [...stored].sort((a, b) => (a.stockId < b.stockId ? -1 : a.stockId > b.stockId ? 1 : 0))
    expect(backup.theses).toEqual(byStock)
    expect(text).not.toMatch(/"user_?[iI]d"/)
    expect(text).not.toContain(seed.user.id)
    const rows = parseCsv(csv.bytes.toString('utf8'))
    expect(rows[0]).toHaveLength(24)
    expect(rows[0]).toEqual([...EXPORT_COLUMNS])
    // fetch().text() drops the BOM the file starts with
    expect(csv.bytes.toString('utf8')).toBe(`\uFEFF${csvBefore}`)
    expect(csv.bytes.toString('utf8')).not.toContain('One')
  })
})

test.describe('states and sizes', () => {
  test('TC-E-717: the empty state, then the first entry and back to empty after deleting it, with no reload', async ({ page }) => {
    const seed = await seedStockOnly()
    await openStock(page, seed)

    await expect(sectionCard(page)).toContainText('No thesis yet')
    await expect(addFirstEntry(page)).toHaveCount(1)
    await expect(addEntry(page)).toHaveCount(0)
    await expect(sectionCard(page).getByText(ADVICE)).toBeVisible()

    await addViaUi(page, { note: 'Only one' })
    await expect(countText(page, '1 entry')).toBeVisible()
    await expect(sectionCard(page).getByText(ADVICE)).toBeVisible()

    await deleteEntry(page, /^Delete Buy entry/)
    await expect(sectionCard(page)).toContainText('No thesis yet')
    await expect(addFirstEntry(page)).toHaveCount(1)
    await expect(sectionCard(page).getByText(ADVICE)).toBeVisible()
  })

  test('TC-E-718: 200 entries of 2,000 characters render within 1 s of arriving; the stock cards come first; a 201st can be added', async ({ page }) => {
    test.setTimeout(180_000)
    const seed = await seedStockOnly()
    const note = 'n'.repeat(2000)
    for (let i = 0; i < 200; i++) {
      const date = new Date(Date.UTC(2026, 10, 20) - i * 86_400_000).toISOString().slice(0, 10)
      await seed.api.addThesis(seed.nvda.id, { type: 'review', date, note })
    }
    await page.addInitScript(() => {
      const w = window as unknown as { __tl200?: number }
      new MutationObserver(() => {
        if (w.__tl200 === undefined && document.querySelectorAll('article').length >= 200) w.__tl200 = performance.now()
      }).observe(document, { childList: true, subtree: true })
    })
    // Hold the entries for a moment so the stock cards can be seen first.
    await page.route(`**/api/stocks/${seed.nvda.id}/theses`, async (route) => {
      const response = await route.fetch()
      await new Promise((resolve) => setTimeout(resolve, 700))
      await route.fulfill({ response })
    })
    await openSignedIn(page, seed.user, `/stocks/${seed.nvda.id}`)

    await expect(page.getByRole('heading', { name: 'Classification' })).toBeVisible()
    await expect(sectionCard(page).locator('[aria-busy="true"]')).toBeVisible()
    await expect(entryCards(page)).toHaveCount(200, { timeout: 15_000 })
    const timings = await page.evaluate(() => ({
      done: (window as unknown as { __tl200?: number }).__tl200 ?? Infinity,
      arrived: (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter((r) => r.name.includes('/theses')).map((r) => r.responseEnd).at(-1) ?? 0,
    }))
    console.log(`NFR-002 section: 200 entries on screen ${Math.round(timings.done - timings.arrived)} ms after the response arrived`)
    expect(timings.done - timings.arrived).toBeLessThan(1000)

    await page.unroute(`**/api/stocks/${seed.nvda.id}/theses`)
    await addViaUi(page, { note: 'The 201st' })
    await expect(countText(page, '201 entries')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  })

  test('TC-E-719: a target price shows in the currency of its own stock, and the market cannot be changed to switch it', async ({ page }) => {
    const seed = await seedStockOnly()
    const ptt = await seed.api.stock(th('PTT', { name: 'PTT PCL', gicsSector: 'Energy', setIndustryGroup: 'Resources' }))
    await seed.api.addThesis(seed.nvda.id, { type: 'buy', date: '2026-11-20', note: 'US', targetPrice: '180' })
    await seed.api.addThesis(ptt.id, { type: 'buy', date: '2026-11-20', note: 'TH', targetPrice: '180' })

    await openStock(page, seed)
    await expect(entryWith(page, 'US').getByText('$180.00', { exact: true })).toBeVisible()
    await openStock(page, seed, ptt)
    await expect(entryWith(page, 'TH').getByText('฿180.00', { exact: true })).toBeVisible()

    // The case's premise (edit the stock to market TH) is not possible: the stock's market is fixed.
    const refused = await seed.api.call<{ code: string; errors: { path: string }[] }>('PATCH', `/stocks/${seed.nvda.id}`, { market: 'TH' })
    expect(refused.status).toBe(400)
    expect(refused.body.errors.map((e) => e.path)).toEqual(['market'])
    expect((await seed.api.theses(seed.nvda.id))[0]?.targetPrice).toBe('180.0000')
  })

  test('TC-E-722: Undo after the stock is gone fails with a message and brings back nothing', async ({ page }) => {
    const seed = await seedStockOnly()
    await seed.api.addThesis(seed.nvda.id, { type: 'buy', date: '2026-11-20', note: 'Doomed' })
    await openStock(page, seed)

    await deleteEntry(page, /^Delete Buy entry/)
    await expect(toast(page, 'Entry deleted')).toBeVisible()
    await seed.api.deleteStock(seed.nvda.id)
    await toast(page, 'Entry deleted').getByRole('button', { name: 'Undo' }).click()

    await expect(toast(page, "Couldn't restore the entry.")).toBeVisible()
    await expect(toast(page, 'Entry restored')).toHaveCount(0)
    expect((await seed.api.call('GET', `/stocks/${seed.nvda.id}/theses`)).status).toBe(404)
    expect((await seed.api.backupJson()).theses).toEqual([])
  })
})
