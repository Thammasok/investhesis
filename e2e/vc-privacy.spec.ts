import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Request } from '@playwright/test'
import { apiAs, newUser, settled, th, us, WEB_ORIGIN } from './lib/sl.ts'
import { chainCard, openChains, renameButton, renameDialog, nameBox, ZONE } from './lib/vc.ts'

test.use({ timezoneId: ZONE })

const SHARES = '98765.4321'
const COST = '12345.6789'
const RATE = '36.123456'
const NAMES = ['SENTINEL-CHAIN-9x', 'SENTINEL-OTHER-9x']

test('TC-E-924: no amount, rate or chain name leaves the investor\'s browser except to rename it, and none reaches a log or a third party', async ({ page, context }) => {
  test.setTimeout(180_000)
  const user = await newUser('e2e-vc-priv')
  const api = await apiAs(user)
  const chain = (name: string, position = 'Upstream') => ({ valueChain: name, valueChainPosition: position })
  await api.stock(us('SECRETA', { name: 'Secret Holdings', ...chain(NAMES[0]!), holding: { shares: SHARES, averageCost: COST, costCurrency: 'USD' } }))
  await api.stock(th('SECRETB', { name: 'Private PCL', ...chain(NAMES[1]!, 'Midstream') }))
  await api.saveSettings({ usdThbRate: RATE })
  const requests: Request[] = []
  const consoleLines: string[] = []
  context.on('request', (r) => requests.push(r))
  page.on('console', (m) => consoleLines.push(m.text()))
  let lastRequestId = ''
  page.on('response', (r) => {
    if (r.url().includes('/api/')) lastRequestId = r.headers()['x-request-id'] ?? lastRequestId
  })

  await openChains(page, user)
  await expect(chainCard(page, NAMES[0]!)).toBeVisible()
  // A rename, a refused merge (409), a merge, and a failure
  await renameButton(page, NAMES[0]!).click()
  await nameBox(page).fill('sentinel-other-9x')
  await renameDialog(page).getByRole('button', { name: 'Rename' }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: /^Merge into/ })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: /^Merge/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.route('**/api/chains/rename', (route) => route.fulfill({ status: 500, contentType: 'application/problem+json', body: JSON.stringify({ type: 'about:blank', title: 'x', status: 500, code: 'internal' }) }))
  await renameButton(page, 'sentinel-other-9x').click()
  await nameBox(page).fill('SENTINEL-FAIL-9x')
  await renameDialog(page).getByRole('button', { name: 'Rename' }).click()
  await expect(renameDialog(page).getByRole('alert')).toBeVisible()
  await page.unroute('**/api/chains/rename')
  await page.keyboard.press('Escape')
  await settled(page)

  // Every request goes to the web origin (the API is reached through its proxy); none to a third party
  const origins = [...new Set(requests.map((r) => new URL(r.url()).origin))]
  expect(origins.filter((o) => o !== WEB_ORIGIN && o !== 'http://127.0.0.1:54321')).toEqual([])
  expect(origins).toContain(WEB_ORIGIN)
  // Amounts and the rate never leave in an address; GET urls carry no stock data
  const urls = requests.map((r) => `${r.url()} ${r.headers()['referer'] ?? ''}`)
  for (const text of urls) for (const s of [SHARES, COST, RATE]) expect(text).not.toContain(s)
  for (const r of requests.filter((r) => r.method() === 'GET' && r.url().includes('/api/'))) expect(decodeURIComponent(r.url())).not.toMatch(/SENTINEL/i)
  // Chain names travel only in the rename body
  for (const r of requests.filter((r) => r.method() !== 'GET' && r.url().includes('/api/'))) {
    const body = r.postData() ?? ''
    for (const s of [SHARES, COST, RATE]) expect(body).not.toContain(s)
    if (/SENTINEL/i.test(body)) expect(r.url()).toMatch(/\/api\/chains\/rename$/)
  }
  expect(consoleLines.join('\n')).not.toMatch(/SENTINEL|98765|12345\.6789|36\.123456/)
  const storage = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]))
  for (const s of [SHARES, COST, RATE, 'SENTINEL']) expect(storage).not.toContain(s)

  // The API log and the dev-server log (without the forwarded browser lines) hold no name and no amount
  const logFile = join(__dirname, '.output/dev-server.log')
  await expect.poll(() => readFileSync(logFile, 'utf8').includes(lastRequestId), { timeout: 10_000 }).toBe(true)
  const log = readFileSync(logFile, 'utf8')
    .split('\n')
    .filter((l) => !l.includes('[vite]'))
    .join('\n')
  for (const s of [...NAMES, 'SENTINEL-FAIL', 'sentinel-other', SHARES, COST, RATE]) expect(log, s).not.toContain(s)

})
