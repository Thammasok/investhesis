import type { Page } from '@playwright/test'
import { apiAs, newUser, openSignedIn, settled, th, us, type Api, type SavedList, type SavedStock, type TestUser } from './sl.ts'

export type HcSeed = {
  user: TestUser
  api: Api
  core: SavedList
  stocks: Record<'NVDA' | 'MSFT' | 'PTTEP' | 'KBANK' | 'AAPL' | 'JNJ' | 'SCB' | 'ZZZ', SavedStock>
}

const held = (shares: string | null, averageCost: string | null, costCurrency?: 'USD' | 'THB') => ({
  holding: { shares, averageCost, ...(costCurrency && { costCurrency }) },
})

/**
 * Dataset HC-A of test-cases.md §5.1 through the real API: eight stocks, five held (one without amounts),
 * list `Core holdings` with NVDA, MSFT and PTTEP, and no settings row (threshold 40, no rate).
 */
export async function seedHoldingsDataset(user?: TestUser): Promise<HcSeed> {
  const owner = user ?? (await newUser('e2e-hc'))
  const api = await apiAs(owner)
  const sector = (gicsSector: string) => ({ gicsSector })
  const stocks = {
    NVDA: await api.stock(us('NVDA', { name: 'NVIDIA Corporation', ...sector('Information Technology'), ...held('10', '100') })),
    MSFT: await api.stock(us('MSFT', { name: 'Microsoft Corporation', ...sector('Information Technology'), ...held('20', '50') })),
    PTTEP: await api.stock(th('PTTEP', { name: 'บมจ. ปตท. สำรวจและผลิตปิโตรเลียม', ...sector('Energy'), setIndustryGroup: 'Resources', ...held('1000', '20.5') })),
    KBANK: await api.stock(th('KBANK', { name: 'ธนาคารกสิกรไทย', ...sector('Financials'), setIndustryGroup: 'Financials', ...held('100', '150') })),
    AAPL: await api.stock(us('AAPL', { name: 'Apple Inc', ...sector('Information Technology'), ...held(null, null) })),
    JNJ: await api.stock(us('JNJ', { name: 'Johnson & Johnson', ...sector('Health Care') })),
    SCB: await api.stock(th('SCB', { name: 'ธนาคารไทยพาณิชย์', ...sector('Financials'), setIndustryGroup: 'Financials' })),
    ZZZ: await api.stock(us('ZZZ', { name: 'No sector Inc' })),
  }
  const core = await api.list('Core holdings')
  for (const t of ['NVDA', 'MSFT', 'PTTEP'] as const) await api.addToList(core.id, stocks[t].id)
  return { user: owner, api, core, stocks }
}

/** Opens `/concentration` (or another path) as the user and waits for the page to settle. */
export async function openAs(page: Page, user: TestUser, path = '/concentration') {
  await openSignedIn(page, user, path)
  await settled(page)
}

/** Value of the Share cell of a group row. */
export const groupRow = (page: Page, label: string) => page.getByRole('row').filter({ has: page.getByRole('button', { name: `Show stocks in ${label}`, exact: true }) })

export const scopeSelect = (page: Page) => page.getByRole('combobox', { name: 'Scope' })
export const lensSelect = (page: Page) => page.getByRole('combobox', { name: 'Group by' })

/** Picks an option of a Radix select on the Concentration page (by combobox name). */
export async function pickOption(page: Page, control: 'Scope' | 'Group by', option: string | RegExp) {
  await page.getByRole('combobox', { name: control }).click()
  await page.getByRole('option', { name: option }).click()
}

export const measureRadio = (page: Page, name: 'Count' | 'Value at cost') => page.getByRole('radio', { name })

/** The Holding card of the stock page. */
export const holdingCard = (page: Page) => page.locator('[data-slot="card"]').filter({ has: page.getByRole('heading', { level: 2, name: 'Holding' }) })

export const DATE_TODAY = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** Records whether any mouse or touch pointer ever went down on the page (keyboard-only journeys must leave it false). */
export async function trackPointer(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __pointer: boolean }
    w.__pointer = false
    for (const type of ['pointerdown', 'mousedown', 'touchstart']) addEventListener(type, () => (w.__pointer = true), true)
  })
}
export const pointerUsed = (page: Page) => page.evaluate(() => (window as unknown as { __pointer?: boolean }).__pointer === true)

/** The Held-column text of a stocks-table row. */
export const stockRow = (page: Page, ticker: string) => page.getByRole('row').filter({ has: page.getByRole('link', { name: ticker, exact: true }) })

export type Scheme = 'light' | 'dark'
export const SCHEMES: Scheme[] = ['light', 'dark']

/** The app has no theme switch yet: dark tokens apply through the `.dark` class, so set it with the media preference. */
export async function applyScheme(page: Page, scheme: Scheme) {
  await page.emulateMedia({ colorScheme: scheme })
  await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), scheme === 'dark')
  // Colour transitions are over once the page's own colours have been the same for ten frames.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let last = ''
        let same = 0
        const tick = () => {
          const now = getComputedStyle(document.body).backgroundColor + getComputedStyle(document.body).color
          same = now === last ? same + 1 : 0
          last = now
          if (same >= 10) resolve()
          else requestAnimationFrame(tick)
        }
        tick()
      }),
  )
}
