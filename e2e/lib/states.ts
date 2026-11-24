import { expect, type Page } from '@playwright/test'
import { F, csv } from '../../apps/api/test/fixtures/imports/build.ts'
import { seedHoldingsDataset, type HcSeed } from './hc.ts'
import { apiAs, chooseTarget, fillStockForm, newUser, openSignedIn, pickFile, saveStock, settled, th, us, type Api, type TestUser } from './sl.ts'

/** A user with data every screen needs: stocks (one with a sector and no cycle, so a Default badge), lists. */
export async function seedForScreens() {
  const user = await newUser('e2e-sl-a11y')
  const api = await apiAs(user)
  const nvda = await api.stock(us('NVDA', { name: 'NVIDIA Corporation', gicsSector: 'Information Technology', style: 'Growth', size: 'Mega', themes: ['AI'] }))
  const aapl = await api.stock(us('AAPL', { name: 'Apple Inc' }))
  const pttep = await api.stock(th('PTTEP', { name: 'บมจ. ปตท. สำรวจและผลิตปิโตรเลียม', gicsSector: 'Energy', setIndustryGroup: 'Resources' }))
  const core = await api.list('Core holdings')
  await api.list('Watching')
  await api.addToList(core.id, nvda.id)
  await api.addToList(core.id, pttep.id)
  return { user, api, nvda, aapl, pttep, core }
}
export type Seeded = Awaited<ReturnType<typeof seedForScreens>>

export type Ctx = Seeded & { empty: TestUser }

export type State = {
  name: string
  /** Puts the page in the state; signed in as the seeded user unless `empty`. */
  run: (page: Page, ctx: Ctx) => Promise<void>
  empty?: boolean
}

const goto = (path: string) => async (page: Page) => {
  await page.goto(path)
  await settled(page)
}

const mixedFile = () =>
  csv(
    ['ticker', 'market', 'exchange', 'name', 'sektor'],
    [
      ['NEWA', 'US', 'NYSE', 'New A', 'x'],
      ['AAPL', 'US', 'NASDAQ', 'Apple Inc', 'x'],
      ['BAD', 'JP', 'XXX', '', 'x'],
    ],
  )

async function toReview(page: Page) {
  await page.goto('/import-export/import')
  await pickFile(page, 'mixed.csv', mixedFile(), 'text/csv')
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()
}

export const STATES: State[] = [
  { name: 'stocks-data', run: goto('/stocks') },
  { name: 'stocks-empty', empty: true, run: goto('/stocks') },
  { name: 'stock-new-clean', run: goto('/stocks/new') },
  {
    name: 'stock-new-field-errors',
    run: async (page) => {
      await page.goto('/stocks/new')
      await saveStock(page).click()
      await expect(page.locator('#stock-ticker-error')).toBeVisible()
    },
  },
  {
    name: 'stock-new-409-alert',
    run: async (page) => {
      await page.goto('/stocks/new')
      await fillStockForm(page, { market: 'US', ticker: 'AAPL', exchange: 'NASDAQ', name: 'Apple again' })
      await saveStock(page).click()
      await expect(page.getByRole('alert')).toContainText('already saved')
    },
  },
  { name: 'stock-detail-default-badge', run: async (page, c) => goto(`/stocks/${c.nvda.id}`)(page) },
  {
    name: 'stock-delete-dialog',
    run: async (page, c) => {
      await page.goto(`/stocks/${c.nvda.id}`)
      await page.getByRole('button', { name: 'More actions' }).click()
      await page.getByRole('menuitem', { name: 'Delete' }).click()
      await expect(page.getByRole('alertdialog')).toBeVisible()
    },
  },
  { name: 'stock-edit', run: async (page, c) => goto(`/stocks/${c.nvda.id}/edit`)(page) },
  { name: 'lists-data', run: goto('/lists') },
  { name: 'lists-empty', empty: true, run: goto('/lists') },
  {
    name: 'list-create-dialog-409',
    run: async (page) => {
      await page.goto('/lists')
      await page.getByRole('button', { name: 'New list' }).click()
      await page.getByRole('dialog').getByLabel('Name').fill('core holdings')
      await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click()
      await expect(page.getByRole('dialog')).toContainText('already exists')
    },
  },
  {
    name: 'list-delete-dialog',
    run: async (page) => {
      await page.goto('/lists')
      await page.getByRole('button', { name: 'Actions for Watching' }).click()
      await page.getByRole('menuitem', { name: 'Delete…' }).click()
      await expect(page.getByRole('alertdialog')).toBeVisible()
    },
  },
  {
    name: 'list-detail-add-popover',
    run: async (page, c) => {
      await page.goto(`/lists/${c.core.id}`)
      await page.getByRole('button', { name: 'Add stock' }).first().click()
      await expect(page.getByPlaceholder('Search ticker or name')).toBeVisible()
    },
  },
  { name: 'import-export-page', run: goto('/import-export') },
  {
    name: 'import-step1-clean',
    run: goto('/import-export/import'),
  },
  {
    name: 'import-step1-file-error',
    run: async (page) => {
      await page.goto('/import-export/import')
      await pickFile(page, 'report.txt', F.reportTxt())
      await expect(page.getByRole('alert')).toBeVisible()
    },
  },
  {
    name: 'import-step2-all-statuses',
    run: async (page) => {
      await toReview(page)
      await chooseTarget(page, 'New list…')
    },
  },
  {
    name: 'import-step3-summary',
    run: async (page) => {
      await toReview(page)
      await chooseTarget(page, 'New list…')
      await page.getByLabel('New list name').fill(`Axe ${Date.now()}`)
      await page.getByRole('button', { name: /^Import \d/ }).click()
      await expect(page.getByRole('button', { name: 'Download error rows (CSV)' })).toBeVisible()
    },
  },
]

/** Signs the browser in as the seeded or the empty user for a state. */
export async function enter(page: Page, state: State, ctx: Ctx) {
  await openSignedIn(page, state.empty ? ctx.empty : ctx.user, '/stocks')
  await settled(page)
  await state.run(page, ctx)
  await settled(page)
}

export type { Api }

// ---- holdings and concentration (T-010) ------------------------------------------------------

/** Dataset HC-A, one user who holds nothing, one empty user, and an empty list: every screen of the slice needs one of them. */
export type HcCtx = HcSeed & { empty: TestUser; noHeld: TestUser; emptyList: { id: string; name: string } }

export async function seedForHoldings(): Promise<HcCtx> {
  const seed = await seedHoldingsDataset()
  // Themes on two stocks give the multi-value note something to say.
  await seed.api.patchStock(seed.stocks.NVDA.id, { themes: ['AI', 'EV'] })
  await seed.api.patchStock(seed.stocks.MSFT.id, { themes: ['AI'] })
  const emptyList = await seed.api.list('Empty list')
  const noHeld = await newUser('e2e-hc-noheld')
  const noHeldApi = await apiAs(noHeld)
  await noHeldApi.stock(us('AAPL', { name: 'Apple Inc', gicsSector: 'Information Technology' }))
  await noHeldApi.stock(us('JNJ', { name: 'Johnson & Johnson', gicsSector: 'Health Care' }))
  return { ...seed, empty: await newUser('e2e-hc-empty'), noHeld, emptyList }
}

export type HcState = {
  name: string
  who?: 'empty' | 'noHeld'
  /** Puts the page in the state. */
  run: (page: Page, ctx: HcCtx) => Promise<void>
}

const open = (path: string) => async (page: Page) => {
  await page.goto(path)
  await settled(page)
}
const holdBox = (page: Page) => page.getByRole('checkbox', { name: 'I hold this stock' })
const holdingDialog = (page: Page) => page.getByRole('dialog', { name: /Holding · / })
const settingsDialog = (page: Page) => page.getByRole('dialog', { name: 'Concentration settings' })

export const HC_STATES: HcState[] = [
  {
    name: 'stock-new-holding-ticked',
    run: async (page) => {
      await page.goto('/stocks/new')
      await holdBox(page).check()
      await expect(page.locator('#stock-holdingShares')).toBeVisible()
    },
  },
  {
    name: 'stock-new-holding-errors',
    run: async (page) => {
      await page.goto('/stocks/new')
      await holdBox(page).check()
      await page.locator('#stock-holdingShares').fill('0')
      await page.locator('#stock-holdingAverageCost').fill('1.23456')
      await saveStock(page).click()
      await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible()
    },
  },
  { name: 'stock-edit-held', run: async (page, c) => open(`/stocks/${c.stocks.NVDA.id}/edit`)(page) },
  { name: 'stock-card-not-held', run: async (page, c) => open(`/stocks/${c.stocks.JNJ.id}`)(page) },
  { name: 'stock-card-held-unknown', run: async (page, c) => open(`/stocks/${c.stocks.AAPL.id}`)(page) },
  { name: 'stock-card-held-figures', run: async (page, c) => open(`/stocks/${c.stocks.NVDA.id}`)(page) },
  {
    name: 'holding-dialog-edit',
    run: async (page, c) => {
      await page.goto(`/stocks/${c.stocks.NVDA.id}`)
      await page.getByRole('button', { name: 'Edit' }).click()
      await expect(holdingDialog(page)).toBeVisible()
    },
  },
  {
    name: 'holding-dialog-error',
    run: async (page, c) => {
      await page.goto(`/stocks/${c.stocks.JNJ.id}`)
      await page.getByRole('button', { name: 'Mark as held' }).click()
      await holdingDialog(page).getByLabel('Shares (optional)').fill('0')
      await holdingDialog(page).getByRole('button', { name: 'Save' }).click()
      await expect(holdingDialog(page).locator('[aria-invalid="true"]').first()).toBeVisible()
    },
  },
  { name: 'stocks-held-column', run: open('/stocks') },
  { name: 'list-held-column', run: async (page, c) => open(`/lists/${c.core.id}`)(page) },
  { name: 'concentration-count-none-flagged', run: open('/concentration') },
  { name: 'concentration-count-flagged', run: open('/concentration?scope=held') },
  { name: 'concentration-value-flagged-left-out', run: open('/concentration?measure=value') },
  { name: 'concentration-no-stocks', who: 'empty', run: open('/concentration') },
  { name: 'concentration-empty-scope', run: async (page, c) => open(`/concentration?scope=${c.emptyList.id}`)(page) },
  { name: 'concentration-none-held', who: 'noHeld', run: open('/concentration?scope=held&measure=value') },
  {
    name: 'concentration-expanded',
    run: async (page) => {
      await page.goto('/concentration')
      await page.getByRole('button', { name: 'Show stocks in Information Technology' }).click()
      await expect(page.getByRole('link', { name: 'NVDA', exact: true })).toBeVisible()
    },
  },
  { name: 'concentration-multi-note', run: open('/concentration?lens=themes') },
  { name: 'concentration-fallback-note', run: open('/concentration?lens=banana&scope=nope') },
  {
    name: 'settings-dialog-no-rate',
    run: async (page) => {
      await page.goto('/concentration')
      await page.getByRole('button', { name: 'Settings' }).click()
      await expect(settingsDialog(page)).toBeVisible()
    },
  },
  {
    name: 'settings-dialog-errors',
    run: async (page) => {
      await page.goto('/concentration')
      await page.getByRole('button', { name: 'Settings' }).click()
      await settingsDialog(page).getByLabel('Warning threshold').fill('0')
      await settingsDialog(page).getByLabel('Exchange rate, THB per 1 USD').fill('-1')
      await settingsDialog(page).getByRole('button', { name: 'Save' }).click()
      await expect(settingsDialog(page).locator('[aria-invalid="true"]').first()).toBeVisible()
    },
  },
  // Last: it saves the rate, which later states would otherwise start from.
  {
    name: 'settings-dialog-with-rate',
    run: async (page, c) => {
      await c.api.saveSettings({ usdThbRate: '36.25' })
      await page.goto('/concentration?measure=value')
      await page.getByRole('button', { name: 'Settings' }).click()
      await expect(settingsDialog(page).getByLabel('Exchange rate, THB per 1 USD')).toHaveValue('36.25')
    },
  },
]

/** Signs the browser in as the user a state needs and runs it. */
export async function enterHc(page: Page, state: HcState, ctx: HcCtx) {
  const user = state.who === 'empty' ? ctx.empty : state.who === 'noHeld' ? ctx.noHeld : ctx.user
  await openSignedIn(page, user, '/stocks')
  await settled(page)
  await state.run(page, ctx)
  await settled(page)
}
