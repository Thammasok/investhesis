import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { BackupV1, EXPORT_COLUMNS } from '../packages/domain/src/index.ts'
import { asRecords, dateIn, openAs, parseCsv, seedFilterDataset, SWING_NAME, tableTickers } from './lib/sfe.ts'
import { apiAs, chooseTarget, h1, importButton, newUser, openSignedIn, pickFile, settled, summaryLine, toast } from './lib/sl.ts'

const ZONE = 'Asia/Bangkok'
test.use({ timezoneId: ZONE })

const BOM = [0xef, 0xbb, 0xbf]
const exportMenu = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'Export' })

async function download(page: import('@playwright/test').Page, trigger: () => Promise<void>) {
  const [file] = await Promise.all([page.waitForEvent('download'), trigger()])
  return { name: file.suggestedFilename(), bytes: readFileSync((await file.path())!) }
}

test.describe('export the shown rows', () => {
  test('TC-E-509: download the filtered, sorted rows as a CSV named by the local date', async ({ page }) => {
    const seed = await seedFilterDataset()
    await openAs(page, seed.user, '/stocks?market=TH&sort=ticker&dir=desc')
    await expect.poll(() => tableTickers(page)).toEqual(['PTTGC', 'PTTEP', 'PTT', 'KBANK', 'CPALL', 'ADVANC'])

    await exportMenu(page).click()
    await expect(page.getByRole('menuitem', { name: /Download CSV/ })).toContainText('(6 stocks)')
    const file = await download(page, () => page.getByRole('menuitem', { name: /Download CSV/ }).click())

    expect(file.name).toBe(`investhesis-stocks-${dateIn(ZONE)}.csv`)
    expect([...file.bytes.subarray(0, 3)]).toEqual(BOM)
    expect(file.bytes.toString('utf8')).toContain('\r\n')
    const rows = parseCsv(file.bytes.toString('utf8'))
    expect(rows[0]).toEqual([...EXPORT_COLUMNS])
    const records = asRecords(rows)
    expect(records.map((r) => r['ticker'])).toEqual(['PTTGC', 'PTTEP', 'PTT', 'KBANK', 'CPALL', 'ADVANC'])
    const ptt = records.find((r) => r['ticker'] === 'PTT')
    expect(ptt).toMatchObject({ market: 'TH', held: 'yes', shares: '1000.0000', average_cost: '34.5000', cost_currency: 'THB', lists: 'Core', sector: 'Resources', gics_sector: 'Energy', themes: 'Dividend' })
    expect(records.find((r) => r['ticker'] === 'PTTEP')?.['name']).toBe('บริษัท ปตท. สำรวจและผลิตปิโตรเลียม จำกัด (มหาชน)')
  })

  test('TC-E-510: from a list page the file is named after the list and holds only its stocks', async ({ page }) => {
    const seed = await seedFilterDataset()
    await openAs(page, seed.user, `/lists/${seed.swing.id}`)
    await expect(h1(page)).toHaveText(SWING_NAME)

    await exportMenu(page).click()
    await expect(page.getByRole('menuitem', { name: /Download CSV/ })).toContainText('(1 stock)')
    const file = await download(page, () => page.getByRole('menuitem', { name: /Download CSV/ }).click())

    expect(file.name).toBe(`investhesis-Core - Swing- 2026-${dateIn(ZONE)}.csv`)
    const records = asRecords(parseCsv(file.bytes.toString('utf8')))
    expect(records.map((r) => r['ticker'])).toEqual(['KO'])
    expect(records[0]).toMatchObject({ held: 'yes', shares: '10.0000', average_cost: '60.0000', cost_currency: 'USD', lists: SWING_NAME })
  })

  test('TC-E-511: the CSV of all stocks imports into a fresh account with no warnings, the same stocks and no holdings', async ({ page }) => {
    const seed = await seedFilterDataset()
    await openAs(page, seed.user)
    await exportMenu(page).click()
    const file = await download(page, () => page.getByRole('menuitem', { name: /Download CSV/ }).click())

    // The fresh account
    const fresh = await newUser('e2e-sfe-b')
    await openSignedIn(page, fresh, '/import-export/import')
    await pickFile(page, file.name, file.bytes, 'text/csv')
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()
    await expect(page.getByText('12 new')).toBeVisible()
    await expect(page.getByText('0 error')).toBeVisible()
    await expect(page.getByText('Lists and holdings columns are not imported: lists, held, shares, average_cost, cost_currency.')).toBeVisible()
    await expect(page.getByText(/Unknown column/)).toHaveCount(0)

    await chooseTarget(page, 'New list…')
    await page.getByLabel('New list name').fill('Imported')
    await importButton(page).click()
    await expect(summaryLine(page)).toContainText('12 created · 0 skipped · 0 updated · 0 failed')

    const keep = ['ticker', 'market', 'exchange', 'name', 'indexMembership', 'gicsSector', 'setIndustryGroup', 'valueChain', 'valueChainPosition', 'size', 'style', 'economicCycle', 'lynchType', 'lifeCycle', 'customers', 'revenueTypes', 'moat', 'themes', 'volatility']
    const view = (xs: Record<string, unknown>[]) => xs.map((s) => Object.fromEntries(keep.map((k) => [k, s[k]]))).sort((a, b) => String(a['ticker']).localeCompare(String(b['ticker'])))
    const before = await (await apiAs(seed.user)).stocks()
    const after = await (await apiAs(fresh)).stocks()
    expect(view(after)).toEqual(view(before))
    expect(after.every((s) => s.holding === null)).toBe(true)
    expect((await (await apiAs(fresh)).lists()).map((l) => l.name)).toEqual(['Imported'])
  })

  test('TC-E-512: copy as a table when the clipboard is allowed, and a clear message when it is refused', async ({ page, context }) => {
    const seed = await seedFilterDataset()
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openAs(page, seed.user)

    await exportMenu(page).click()
    await page.getByRole('menuitem', { name: /Copy as table/ }).click()
    await expect(toast(page, 'Copied 12 rows')).toBeVisible()
    const text = await page.evaluate(() => navigator.clipboard.readText())
    expect(text.startsWith('﻿')).toBe(false)
    const rows = parseCsv(text, '\t')
    expect(rows).toHaveLength(13)
    expect(rows.every((r) => r.length === 24)).toBe(true)
    expect(rows[0]).toEqual([...EXPORT_COLUMNS])

    // Refused: the browser rejects the write
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) } })
    })
    await exportMenu(page).click()
    await page.getByRole('menuitem', { name: /Copy as table/ }).click()
    await expect(toast(page, "Couldn't copy: your browser blocked the clipboard. Use Download CSV instead.")).toBeVisible()
    await expect(toast(page, /^Copied/)).toHaveCount(1) // the first one only
    await exportMenu(page).click() // the menu still works
    await expect(page.getByRole('menuitem', { name: /Download CSV/ })).toBeEnabled()
  })
})

test.describe('the full backup', () => {
  test('TC-E-513: both backups download under the local date, the JSON parses as BackupV1 and the CSV re-imports', async ({ page }) => {
    const seed = await seedFilterDataset()
    await openAs(page, seed.user, '/import-export')

    const json = await download(page, () => page.getByRole('button', { name: 'Download JSON' }).click())
    const csv = await download(page, () => page.getByRole('button', { name: 'Download CSV' }).click())
    expect(json.name).toBe(`investhesis-backup-${dateIn(ZONE)}.json`)
    expect(csv.name).toBe(`investhesis-backup-${dateIn(ZONE)}.csv`)

    const backup = BackupV1.parse(JSON.parse(json.bytes.toString('utf8')))
    expect(backup.stocks.map((s) => s.ticker)).toEqual(['ADVANC', 'CPALL', 'KBANK', 'PTT', 'PTTEP', 'PTTGC', 'AAPL', 'JNJ', 'KO', 'MSFT', 'NVDA', 'XOM']) // TH first, then US, by ticker
    expect(backup.lists.map((l) => l.name).sort()).toEqual(['Core', SWING_NAME].sort())
    const core = backup.lists.find((l) => l.name === 'Core')
    expect(core?.stockIds.sort()).toEqual(['NVDA', 'PTT', 'PTTEP'].map((t) => seed.stocks[t]?.id as string).sort())
    expect(backup.stocks.find((s) => s.ticker === 'PTT')?.holding).toEqual({ shares: '1000.0000', averageCost: '34.5000', costCurrency: 'THB' })
    expect(backup.stocks.find((s) => s.ticker === 'NVDA')?.holding).toEqual({ shares: null, averageCost: null, costCurrency: 'USD' })
    expect(backup.settings).toMatchObject({ concentrationThreshold: 35, usdThbRate: '34.045000' })
    expect(json.bytes.toString('utf8')).not.toContain(seed.user.id)

    const records = asRecords(parseCsv(csv.bytes.toString('utf8')))
    expect(records).toHaveLength(12)
    expect(records.filter((r) => r['held'] === 'yes').map((r) => r['ticker']).sort()).toEqual(['KO', 'NVDA', 'PTT'])
  })

  test('TC-E-514: an account with nothing still downloads valid backups', async ({ page }) => {
    const user = await newUser('e2e-sfe-empty')
    await openAs(page, user, '/import-export')
    const json = await download(page, () => page.getByRole('button', { name: 'Download JSON' }).click())
    const csv = await download(page, () => page.getByRole('button', { name: 'Download CSV' }).click())

    const backup = BackupV1.parse(JSON.parse(json.bytes.toString('utf8')))
    expect(backup.stocks).toEqual([])
    expect(backup.lists).toEqual([])
    expect(backup.settings).toEqual({ concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null })
    expect(csv.bytes.toString('utf8')).toBe(`﻿${EXPORT_COLUMNS.join(',')}\r\n`)

    await page.goto('/stocks')
    await settled(page)
    await expect(page.getByRole('heading', { name: 'No stocks yet' })).toBeVisible()
    await expect(page.getByRole('searchbox', { name: 'Search stocks' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Export' })).toHaveCount(0)
  })
})
