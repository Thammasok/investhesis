import { expect, type Locator, type Page } from '@playwright/test'
import type { Thesis } from '../../packages/domain/src/index.ts'
import { dateIn } from './sfe.ts'
import { apiAs, newUser, openSignedIn, settled, us, type Api, type SavedStock, type TestUser } from './sl.ts'

export const ADVICE = 'Your own reasoning, not advice.'
export const ZONE = 'Asia/Bangkok'

export type TlSeed = { user: TestUser; api: Api; nvda: SavedStock }

/** A fresh user with one US stock (NVDA) and no entries. */
export async function seedStockOnly(prefix = 'e2e-tl'): Promise<TlSeed> {
  const user = await newUser(prefix)
  const api = await apiAs(user)
  const nvda = await api.stock(us('NVDA', { name: 'NVIDIA Corporation', gicsSector: 'Information Technology' }))
  return { user, api, nvda }
}

/** Dataset TL-B of test-cases.md: three entries on NVDA, newest date first as the API lists them. */
export async function seedWithEntries(prefix = 'e2e-tl'): Promise<TlSeed & { entries: Thesis[] }> {
  const seed = await seedStockOnly(prefix)
  const id = seed.nvda.id
  await seed.api.addThesis(id, { type: 'buy', date: '2025-03-14', note: `${'Long note. '.repeat(64)}end` })
  const mid = await seed.api.addThesis(id, { type: 'update', date: '2026-10-03', note: 'Quarter beat.' })
  await seed.api.patchThesis(id, mid.id, { note: 'Quarter beat, guidance raised.' })
  await seed.api.addThesis(id, {
    type: 'buy',
    date: '2026-11-20',
    note: 'Capex keeps rising.\nMargins hold.',
    targetPrice: '180',
    invalidation: 'Gross margin below 65%.',
  })
  return { ...seed, entries: await seed.api.theses(id) }
}

export async function openStock(page: Page, seed: { user: TestUser; nvda: SavedStock }, stock: SavedStock = seed.nvda) {
  await openSignedIn(page, seed.user, `/stocks/${stock.id}`)
  await settled(page)
}

// ---- the Thesis section -----------------------------------------------------------------------

export const sectionCard = (page: Page): Locator =>
  page.locator('[data-slot="card"]').filter({ has: page.getByRole('heading', { level: 2, name: 'Thesis' }) })
export const entryCards = (page: Page) => sectionCard(page).locator('article')
export const entryWith = (page: Page, text: string | RegExp) => entryCards(page).filter({ hasText: text })
/** The header button (shown once there is at least one entry). */
export const addEntry = (page: Page) => sectionCard(page).getByRole('button', { name: 'Add entry', exact: true })
export const addFirstEntry = (page: Page) => sectionCard(page).getByRole('button', { name: 'Add first entry' })
export const countText = (page: Page, text: string) => sectionCard(page).getByText(text, { exact: true })
export const thesisHeading = (page: Page) => page.getByRole('heading', { level: 2, name: 'Thesis' })

// ---- the entry dialog -------------------------------------------------------------------------

export const entryDialog = (page: Page) => page.getByRole('dialog', { name: /thesis entry/ })
export const noteBox = (page: Page) => entryDialog(page).getByRole('textbox', { name: /^Thesis/ })
export const targetBox = (page: Page) => entryDialog(page).getByRole('textbox', { name: /^Target price/ })
export const invalidationBox = (page: Page) => entryDialog(page).getByRole('textbox', { name: /^Invalidation/ })
export const dateBox = (page: Page) => entryDialog(page).locator('#thesis-date')

export type EntrySpec = { type?: 'Buy' | 'Sell' | 'Update' | 'Review'; date?: string; note?: string; target?: string; invalidation?: string }

/** Fills the dialog that is open (does not submit). A field left out is not touched. */
export async function fillEntry(page: Page, spec: EntrySpec) {
  if (spec.type) await entryDialog(page).getByRole('radio', { name: spec.type }).click()
  if (spec.date) await dateBox(page).fill(spec.date)
  if (spec.note !== undefined) await noteBox(page).fill(spec.note)
  if (spec.target !== undefined) await targetBox(page).fill(spec.target)
  if (spec.invalidation !== undefined) await invalidationBox(page).fill(spec.invalidation)
}

/** Opens the add dialog from whichever Add button the section shows. */
export async function openAdd(page: Page) {
  const first = addFirstEntry(page)
  if (await first.isVisible()) await first.click()
  else await addEntry(page).click()
  await expect(entryDialog(page)).toBeVisible()
}

/** Adds an entry through the UI and waits until the dialog has closed. */
export async function addViaUi(page: Page, spec: EntrySpec & { note: string }) {
  await openAdd(page)
  await fillEntry(page, { type: 'Buy', ...spec })
  await entryDialog(page).getByRole('button', { name: 'Add entry' }).click()
  await expect(entryDialog(page)).toHaveCount(0)
}

export const editButton = (page: Page, name: RegExp | string) => sectionCard(page).getByRole('button', { name })
export const deleteConfirm = (page: Page) => page.getByRole('alertdialog', { name: 'Delete this entry?' })

/** The date the browser shows for today in a zone, as YYYY-MM-DD. */
export const localToday = (zone = ZONE, now = new Date()) => dateIn(zone, now)

/** The latest instant at or before `now` whose wall clock in `zone` reads hh:mm, found by stepping back by the minute. */
export function latestInstantAt(zone: string, hour: number, minute: number, now = new Date()): Date {
  const format = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const start = Math.floor(now.getTime() / 60_000) * 60_000
  for (let i = 0; i < 24 * 60; i++) {
    const t = new Date(start - i * 60_000)
    const [h, m] = format.format(t).split(':').map(Number)
    if (h === hour && m === minute) return t
  }
  throw new Error(`no ${hour}:${minute} in ${zone} within a day`)
}

/** "20 Nov 2026" from an ISO date, the way the section prints it. */
export const shown = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][(m as number) - 1]} ${y}`
}

/** Elements whose right edge passes the viewport, outside a table's own scroll container. */
export const overflowing = (page: Page) =>
  page.evaluate(() => {
    const limit = window.innerWidth
    return [...document.querySelectorAll('body *')]
      .filter((el) => {
        if (el.closest('[data-slot="table-container"], [data-sonner-toaster], [aria-hidden="true"]')) return false
        const box = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        return box.width > 0 && box.height > 0 && style.position !== 'fixed' && box.right > limit + 1
      })
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(el.getBoundingClientRect().right)}`)
  })
