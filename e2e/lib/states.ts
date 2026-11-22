import { expect, type Page } from '@playwright/test'
import { F, csv } from '../../apps/api/test/fixtures/imports/build.ts'
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
  await page.goto('/import-export')
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
  {
    name: 'import-step1-clean',
    run: goto('/import-export'),
  },
  {
    name: 'import-step1-file-error',
    run: async (page) => {
      await page.goto('/import-export')
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
