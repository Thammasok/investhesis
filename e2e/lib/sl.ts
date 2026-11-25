import { expect, type Locator, type Page } from '@playwright/test'
import type { Thesis } from '../../packages/domain/src/index.ts'
import { adminCreateUser, newEmail, openSignedIn, PASSWORD, signedIn } from './kit.ts'

export * from './kit.ts'

/** The API of the supabase-mode pair (what the web proxies `/api` to). */
export const API_ORIGIN = 'http://localhost:3000'
/** The API of the mock-mode pair. */
export const MOCK_API_ORIGIN = 'http://localhost:3100'

export type Seed = Record<string, unknown>
export type SavedHolding = { shares: string | null; averageCost: string | null; costCurrency: 'USD' | 'THB' }
export type SavedStock = { id: string; ticker: string; name: string; market: 'US' | 'TH'; listIds: string[]; holding: SavedHolding | null } & Seed
export type SavedSettings = { concentrationThreshold: number; usdThbRate: string | null; usdThbRateUpdatedAt: string | null }
export type SavedList = { id: string; name: string; stockCount: number }

export type TestUser = { id: string; email: string; password: string }

/** A confirmed `@example.test` user (admin API, no email) with its own prefix. */
export const newUser = (prefix = 'e2e-sl'): Promise<TestUser> => adminCreateUser(newEmail(prefix))

/** Calls the real API as `user` (a fresh token per client), for seeding and for reading back what the UI saved. */
export async function apiAs(user: { email: string; password?: string }, origin = API_ORIGIN) {
  const { session } = await signedIn(user.email, user.password ?? PASSWORD)
  const call = async <T>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> => {
    const res = await fetch(`${origin}${path}`, {
      method,
      headers: { authorization: `Bearer ${session.access_token}`, ...(body !== undefined && { 'content-type': 'application/json' }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })
    const text = await res.text()
    return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T }
  }
  const must = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await call<T>(method, path, body)
    if (res.status >= 300) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(res.body)}`)
    return res.body
  }
  return {
    token: session.access_token,
    call,
    stock: (body: Seed) => must<SavedStock>('POST', '/stocks', body),
    stocks: async () => (await must<{ items: SavedStock[] }>('GET', '/stocks')).items,
    getStock: (id: string) => must<SavedStock>('GET', `/stocks/${id}`),
    /** PATCH a stock; `{ holding: {...} }` sets the holding, `{ holding: null }` clears it. */
    patchStock: (id: string, body: Seed) => must<SavedStock>('PATCH', `/stocks/${id}`, body),
    deleteStock: (id: string) => must<undefined>('DELETE', `/stocks/${id}`),
    deleteList: (id: string) => must<undefined>('DELETE', `/lists/${id}`),
    settings: () => must<SavedSettings>('GET', '/settings'),
    saveSettings: (body: Seed) => must<SavedSettings>('PATCH', '/settings', body),
    list: (name: string) => must<SavedList>('POST', '/lists', { name }),
    lists: async () => (await must<{ items: SavedList[] }>('GET', '/lists')).items,
    addToList: (listId: string, stockId: string) => must('POST', `/lists/${listId}/stocks`, { stockId }),
    /** Thesis log (thesis-log T-009): the entries of a stock, newest first, as the API sorts them. */
    theses: async (stockId: string) => (await must<{ items: Thesis[] }>('GET', `/stocks/${stockId}/theses`)).items,
    addThesis: (stockId: string, body: Seed) => must<Thesis>('POST', `/stocks/${stockId}/theses`, body),
    patchThesis: (stockId: string, id: string, body: Seed) => must<Thesis>('PATCH', `/stocks/${stockId}/theses/${id}`, body),
    deleteThesis: (stockId: string, id: string) => must<Thesis>('DELETE', `/stocks/${stockId}/theses/${id}`),
    restoreThesis: (stockId: string, entry: Thesis) => must<Thesis>('POST', `/stocks/${stockId}/theses/restore`, { entry }),
    /** A full backup as the API sends it, with the headers (no parsing, so a test can check the bytes). */
    backup: async (kind: 'json' | 'csv', query = '') => {
      const res = await fetch(`${origin}/exports/backup.${kind}${query}`, { headers: { authorization: `Bearer ${session.access_token}` } })
      return { status: res.status, headers: res.headers, text: await res.text() }
    },
    /** The JSON backup, parsed (use `backup` for the raw bytes). */
    backupJson: async () => {
      const res = await fetch(`${origin}/exports/backup.json`, { headers: { authorization: `Bearer ${session.access_token}` } })
      return (await res.json()) as { formatVersion: number; stocks: SavedStock[]; theses: Thesis[] }
    },
  }
}
export type Api = Awaited<ReturnType<typeof apiAs>>

export const us = (ticker: string, extra: Seed = {}): Seed => ({ ticker, market: 'US', exchange: 'NASDAQ', name: `${ticker} Inc.`, ...extra })
export const th = (ticker: string, extra: Seed = {}): Seed => ({ ticker, market: 'TH', exchange: 'SET', name: `บริษัท ${ticker}`, ...extra })

/** A new user, signed in on `path`, with an API client for seeding. */
export async function signedInUser(page: Page, path = '/stocks', prefix = 'e2e-sl') {
  const user = await newUser(prefix)
  const api = await apiAs(user)
  if (path) {
    await openSignedIn(page, user, path)
    await page.waitForLoadState('networkidle')
  }
  return { user, api }
}

/** Waits until the page has settled (no request in flight), so a late reload cannot wipe typed input. */
export const settled = (page: Page) => page.waitForLoadState('networkidle')

export const h1 = (page: Page) => page.getByRole('heading', { level: 1 })
/** The total count under the page title. The result line under the toolbar repeats it, so text alone is ambiguous. */
export const headerCount = (page: Page, text: string) =>
  page.locator('header').filter({ has: h1(page) }).getByText(text, { exact: true })

export const toast = (page: Page, text: string | RegExp) => page.locator('[data-sonner-toast]').filter({ hasText: text })

/** Opens a stock-form select by its field id and picks an option. */
export async function choose(page: Page, field: string, option: string) {
  await page.locator(`#stock-${field}`).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

export type FormSpec = {
  market: 'US' | 'TH'
  ticker: string
  exchange: string
  name: string
  indexes?: string[]
  selects?: Record<string, string>
  themes?: string[]
  lists?: string[]
}

/** Fills the Add stock form (does not submit). */
export async function fillStockForm(page: Page, spec: FormSpec) {
  await page.getByRole('radio', { name: spec.market, exact: true }).click()
  await page.locator('#stock-ticker').fill(spec.ticker)
  await choose(page, 'exchange', spec.exchange)
  await page.locator('#stock-name').fill(spec.name)
  for (const index of spec.indexes ?? []) await page.getByRole('checkbox', { name: index, exact: true }).check()
  for (const [field, option] of Object.entries(spec.selects ?? {})) await choose(page, field, option)
  for (const theme of spec.themes ?? []) {
    await page.getByRole('textbox', { name: 'Add theme' }).fill(theme)
    await page.getByRole('textbox', { name: 'Add theme' }).press('Enter')
  }
  for (const list of spec.lists ?? []) await page.getByRole('checkbox', { name: list, exact: true }).check()
}

export const saveStock = (page: Page) => page.getByRole('button', { name: 'Save stock' })

/** The Classification card's value for a lens label, e.g. `lens(page, 'Style')`. */
export const lens = (page: Page, label: string): Locator =>
  page.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]')

/** True when the page has no page-level horizontal scroll. */
export async function noHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
}

/** The code points of a string, to compare Thai text without normalisation. */
export const codePoints = (s: string) => [...s].map((c) => c.codePointAt(0))

export { expect }

// ---- import wizard -------------------------------------------------------------------------

/** Chooses a file in the import wizard's hidden input. */
export async function pickFile(page: Page, name: string, body: Buffer | string, mimeType = 'application/octet-stream') {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer: Buffer.isBuffer(body) ? body : Buffer.from(body) })
}

/** Picks the "Add to list" target in step 2 (an existing list or `New list…`). */
export async function chooseTarget(page: Page, option: string) {
  await page.locator('#import-target').click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

export const importButton = (page: Page) => page.getByRole('button', { name: /^Import \d/ })

/** The summary line of step 3, e.g. `4 created · 0 skipped · 0 updated · 0 failed`. */
export const summaryLine = (page: Page) => page.getByRole('status').filter({ hasText: 'created' })

export async function previewCounts(page: Page): Promise<string[]> {
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()
  return page.locator('[data-slot="badge"]').filter({ hasText: /^\d+ (new|duplicate|error)$/ }).allTextContents()
}

/**
 * An arrow key that lasts long enough for Radix's roving focus: it moves focus on a timer after keydown
 * and only checks the radio while the key is still down, which `keyboard.press` (instant keyup) misses.
 */
export async function arrow(page: Page, key: 'ArrowRight' | 'ArrowLeft' | 'ArrowDown' | 'ArrowUp') {
  await page.keyboard.down(key)
  await page.waitForTimeout(60)
  await page.keyboard.up(key)
}
