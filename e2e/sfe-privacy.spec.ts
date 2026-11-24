import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page, type Request } from '@playwright/test'
import { openAs, openSheet, closeSheet, pick, searchBox, seedFilterDataset } from './lib/sfe.ts'
import { API_ORIGIN, apiAs, newUser, openSignedIn, settled, th, us, WEB_ORIGIN } from './lib/sl.ts'

/** Dataset SF-G: values no other test uses, to prove they stay out of logs, addresses and other accounts. */
const SHARES = '6543210.9876'
const COST = '0.4321'
const RATE = '35.987654'
const QUERY = 'SENTINEL-SFE-q'

async function downloadOne(page: Page, trigger: () => Promise<void>): Promise<string> {
  const [file] = await Promise.all([page.waitForEvent('download'), trigger()])
  return readFileSync((await file.path())!, 'utf8')
}

test.describe('isolation and privacy of exports', () => {
  test('TC-E-515: one user never sees another user in a backup, and a user id in the query is ignored', async ({ page }) => {
    const a = await seedFilterDataset()
    const b = await newUser('e2e-sfe-b')
    const apiB = await apiAs(b)
    const stockB = await apiB.stock(us('BONLY', { name: 'B-only Corporation' }))
    const listB = await apiB.list('B list')
    await apiB.addToList(listB.id, stockB.id)
    await apiB.saveSettings({ concentrationThreshold: 61 })

    await openAs(page, b, '/import-export')
    const json = await downloadOne(page, () => page.getByRole('button', { name: 'Download JSON' }).click())
    const csv = await downloadOne(page, () => page.getByRole('button', { name: 'Download CSV' }).click())
    const mine = JSON.parse(json) as { stocks: { ticker: string }[]; lists: { name: string }[]; settings: { concentrationThreshold: number } }
    expect(mine.stocks.map((s) => s.ticker)).toEqual(['BONLY'])
    expect(mine.lists.map((l) => l.name)).toEqual(['B list'])
    expect(mine.settings.concentrationThreshold).toBe(61)
    const theirs = [...Object.values(a.stocks).flatMap((s) => [s.id, s.ticker]), a.core.id, a.core.name, a.swing.id, '34.045000', a.user.id]
    for (const text of [json, csv]) for (const value of theirs) expect(text, `B's backup holds ${value}`).not.toContain(value)

    // Asking for someone else's data by id changes nothing
    const viaQuery = await apiB.backup('json', `?userId=${a.user.id}`)
    expect(viaQuery.status).toBe(200)
    expect(viaQuery.text).not.toContain(a.stocks['PTT']?.id as string)
    expect(JSON.parse(viaQuery.text).stocks).toHaveLength(1)
  })

  test('TC-E-516: no amount, rate or search text reaches a third party, an address, a title, storage or the API log', async ({ page, context }) => {
    const user = await newUser('e2e-sfe-priv')
    const api = await apiAs(user)
    await api.stock(us('SECRET', { name: 'Secret Holdings', holding: { shares: SHARES, averageCost: COST } }))
    await api.stock(th('PRIVAT', { name: 'Private PCL' }))
    await api.saveSettings({ usdThbRate: RATE })
    const requests: Request[] = []
    context.on('request', (r) => requests.push(r))
    await openAs(page, user)
    requests.length = 0
    let lastRequestId = ''
    page.on('response', (r) => {
      if (r.url().includes('/api/')) lastRequestId = r.headers()['x-request-id'] ?? lastRequestId
    })
    const seen: string[] = []

    // Search and filter with the sentinel text, then export, copy and back up
    await searchBox(page).pressSequentially(QUERY)
    await searchBox(page).clear()
    await searchBox(page).pressSequentially('secret')
    await openSheet(page)
    await pick(page, 'Market', /^US, /)
    await closeSheet(page)
    seen.push(page.url(), await page.title())
    await page.getByRole('button', { name: 'Export' }).click()
    await downloadOne(page, () => page.getByRole('menuitem', { name: /Download CSV/ }).click())
    await page.goto('/import-export')
    await settled(page)
    await downloadOne(page, () => page.getByRole('button', { name: 'Download JSON' }).click())
    await downloadOne(page, () => page.getByRole('button', { name: 'Download CSV' }).click())
    seen.push(page.url(), await page.title())
    const storage = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]))

    // Every request goes to the web origin; no amount, rate or search text is in an address
    expect([...new Set(requests.map((r) => new URL(r.url()).origin))]).toEqual([WEB_ORIGIN])
    for (const r of requests) for (const s of [SHARES, COST, RATE, QUERY]) expect(`${r.url()} ${r.headers()['referer'] ?? ''}`).not.toContain(s)
    for (const text of [...seen, storage]) for (const s of [SHARES, COST, RATE, QUERY]) expect(text).not.toContain(s)
    expect(requests.some((r) => r.url().includes('/api/exports/backup.json'))).toBe(true)

    // The API log has the backup requests and none of the values
    const logFile = join(__dirname, '.output/dev-server.log')
    await expect.poll(() => readFileSync(logFile, 'utf8').includes(lastRequestId), { timeout: 10_000 }).toBe(true)
    const log = readFileSync(logFile, 'utf8')
    expect(log).toContain('/exports/backup.json')
    for (const s of [SHARES, COST, RATE, QUERY, 'Secret Holdings']) expect(log, s).not.toContain(s)
  })

  test('TC-E-517: the backups need a signed-in user', async ({ page }) => {
    for (const path of ['/exports/backup.json', '/exports/backup.csv']) {
      for (const headers of [{}, { authorization: 'Bearer not-a-token' }, { authorization: 'Basic abc' }] as Record<string, string>[]) {
        const res = await fetch(`${API_ORIGIN}${path}`, { headers })
        expect(res.status, `${path} ${JSON.stringify(headers)}`).toBe(401)
        expect(res.headers.get('www-authenticate')).toBe('Bearer')
        expect(res.headers.get('content-type')).toContain('application/problem+json')
        expect(await res.text()).not.toContain('investhesis-backup')
      }
    }
    await page.goto('/auth/sign-in')
    await page.goto('/import-export')
    await expect(page).toHaveURL(/\/auth\/sign-in/)
    await expect(page.getByRole('button', { name: 'Download JSON' })).toHaveCount(0)
  })

  test('TC-E-518: a failed backup says so and can be tried again, with no file saved', async ({ page, context }) => {
    const user = await newUser('e2e-sfe-fail')
    await openSignedIn(page, user, '/import-export')
    await settled(page)
    const alert = page.getByRole('alert').filter({ hasText: "Couldn't download the backup" })

    await page.route('**/api/exports/backup.csv', (route) => route.fulfill({ status: 503, contentType: 'application/problem+json', body: JSON.stringify({ code: 'db_unavailable', status: 503, title: 'Service Unavailable', type: 'about:blank' }) }))
    const files: string[] = []
    page.on('download', (d) => files.push(d.suggestedFilename()))
    await page.getByRole('button', { name: 'Download CSV' }).click()
    await expect(alert).toHaveText("Couldn't download the backup. Check your connection and try again.")
    await expect(page.getByRole('button', { name: 'Download JSON' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Download CSV' })).toBeEnabled()

    await context.setOffline(true)
    await page.getByRole('button', { name: 'Download JSON' }).click()
    await expect(alert).toBeVisible()
    await context.setOffline(false)

    await page.unroute('**/api/exports/backup.csv')
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download JSON' }).click()])
    expect(file.suggestedFilename()).toMatch(/^investhesis-backup-\d{4}-\d{2}-\d{2}\.json$/)
    await expect(alert).toHaveCount(0)
    expect(files).toHaveLength(1)
  })
})
