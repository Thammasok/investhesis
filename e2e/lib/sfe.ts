import { expect, type Locator, type Page } from '@playwright/test'
import { apiAs, newUser, openSignedIn, settled, th, us, type Api, type SavedList, type SavedStock, type TestUser } from './sl.ts'

export type SfeSeed = { user: TestUser; api: Api; core: SavedList; swing: SavedList; stocks: Record<string, SavedStock> }

export const SWING_NAME = 'Core / Swing: 2026?'

/**
 * Dataset SF-A of test-cases.md §5: twelve stocks (six TH, six US) with a spread of cycles, value chain
 * positions (`None` on two), themes (one spelled `ai`), three held (one with unknown amounts), two lists and
 * saved settings. Everything goes through the real API.
 */
export async function seedFilterDataset(user?: TestUser): Promise<SfeSeed> {
  const owner = user ?? (await newUser('e2e-sfe'))
  const api = await apiAs(owner)
  const chain = (position: string) => ({ valueChain: 'Chain', valueChainPosition: position })
  const stocks: Record<string, SavedStock> = {}
  const save = async (key: string, body: Record<string, unknown>) => (stocks[key] = await api.stock(body))
  await save('PTT', th('PTT', { name: 'PTT Public Company Limited', gicsSector: 'Energy', setIndustryGroup: 'Resources', economicCycle: 'Cyclical', ...chain('Upstream'), themes: ['Dividend'], holding: { shares: '1000', averageCost: '34.5' } }))
  await save('PTTEP', th('PTTEP', { name: 'บริษัท ปตท. สำรวจและผลิตปิโตรเลียม จำกัด (มหาชน)', gicsSector: 'Energy', setIndustryGroup: 'Resources', economicCycle: 'Cyclical', valueChainPosition: 'None' }))
  await save('PTTGC', th('PTTGC', { name: 'PTT Global Chemical', gicsSector: 'Materials', setIndustryGroup: 'Resources', economicCycle: 'Sensitive' }))
  await save('KBANK', th('KBANK', { name: 'Kasikornbank' }))
  await save('CPALL', th('CPALL', { name: 'CP ALL', gicsSector: 'Consumer Staples', setIndustryGroup: 'Services', economicCycle: 'Defensive', themes: ['Dividend'] }))
  await save('ADVANC', th('ADVANC', { name: 'Advanced Info Service', gicsSector: 'Communication Services', setIndustryGroup: 'Technology', economicCycle: 'Defensive' }))
  await save('NVDA', us('NVDA', { name: 'NVIDIA Corporation', gicsSector: 'Information Technology', economicCycle: 'Sensitive', ...chain('Upstream'), themes: ['AI'], holding: {} }))
  await save('AAPL', us('AAPL', { name: 'Apple Inc', gicsSector: 'Information Technology', themes: ['ai'] }))
  await save('MSFT', us('MSFT', { name: 'Microsoft Corporation', gicsSector: 'Information Technology', themes: ['AI', 'Cloud'] }))
  await save('JNJ', us('JNJ', { name: 'Johnson & Johnson', gicsSector: 'Health Care', economicCycle: 'Defensive' }))
  await save('KO', us('KO', { name: 'Coca-Cola Company', gicsSector: 'Consumer Staples', economicCycle: 'Defensive', themes: ['Dividend'], holding: { shares: '10', averageCost: '60' } }))
  await save('XOM', us('XOM', { name: 'Exxon Mobil', gicsSector: 'Energy', economicCycle: 'Cyclical', valueChainPosition: 'None' }))
  const core = await api.list('Core')
  for (const t of ['PTT', 'PTTEP', 'NVDA']) await api.addToList(core.id, (stocks[t] as SavedStock).id)
  const swing = await api.list(SWING_NAME)
  await api.addToList(swing.id, (stocks['KO'] as SavedStock).id)
  await api.saveSettings({ concentrationThreshold: 35, usdThbRate: '34.045' })
  return { user: owner, api, core, swing, stocks }
}

export async function openAs(page: Page, user: TestUser, path = '/stocks') {
  await openSignedIn(page, user, path)
  await settled(page)
}

/** The tickers in the table, top to bottom. */
export const tableTickers = async (page: Page) => (await page.locator('tbody tr td:first-child').allTextContents()).map((t) => t.trim())

export const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Search stocks' })
export const filtersButton = (page: Page) => page.getByRole('button', { name: /^Filters/ })
export const sheet = (page: Page) => page.getByRole('dialog', { name: 'Filters' })
/** The result line ("3 of 12 stocks") under the toolbar. */
export const resultLine = (page: Page) => page.locator('p[role="status"]').first()

export async function openSheet(page: Page): Promise<Locator> {
  await filtersButton(page).click()
  await expect(sheet(page)).toBeVisible()
  return sheet(page)
}

/** Opens a sheet section when it is closed and returns its fieldset. */
export async function section(page: Page, label: string): Promise<Locator> {
  const dialog = sheet(page)
  const trigger = dialog.getByRole('button', { name: new RegExp(`^${label.replace(/[()]/g, '\\$&')}`) })
  if ((await trigger.getAttribute('aria-expanded')) === 'false') await trigger.click()
  return dialog.getByRole('group', { name: label })
}

/**
 * Ticks `option` (a name or pattern, e.g. /^TH, /) in the section called `label`. A plain click, then the
 * state is asserted: the box follows the address a moment after the click, and Playwright's `check()` reads
 * it in the same tick.
 */
export async function pick(page: Page, label: string, option: string | RegExp) {
  const box = (await section(page, label)).getByRole('checkbox', { name: option })
  await box.click()
  await expect(box).toBeChecked()
}

export async function unpick(page: Page, label: string, option: string | RegExp) {
  const box = (await section(page, label)).getByRole('checkbox', { name: option })
  await box.click()
  await expect(box).not.toBeChecked()
}

export const closeSheet = async (page: Page) => {
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)
}

export const heldOf = (s: SavedStock) => s.holding !== null
/** What the API holds, as plain objects, to compute what a filter must show. */
export const stocksOf = (seed: SfeSeed) => Object.values(seed.stocks)
export const sorted = (xs: string[]) => [...xs].sort((a, b) => a.localeCompare(b, 'en'))

/** The date `now` has in a time zone, as YYYY-MM-DD. */
export function dateIn(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  return parts
}

/** A minimal RFC 4180 reader: quoted fields, doubled quotes, CRLF or LF, and a leading BOM dropped. */
export function parseCsv(text: string, separator = ','): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const input = text.replace(/^﻿/, '')
  for (let i = 0; i < input.length; i++) {
    const c = input[i] as string
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') (field += '"'), i++
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === separator) (row.push(field), (field = ''))
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && input[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length > 0) (row.push(field), rows.push(row))
  return rows
}

/** The cells of a parsed export keyed by header, one object per stock. */
export const asRecords = (rows: string[][]) => {
  const [header = [], ...rest] = rows
  return rest.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}
