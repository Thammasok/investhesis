import { expect, type Page } from '@playwright/test'
import { F, csv } from '../../apps/api/test/fixtures/imports/build.ts'
import { seedHoldingsDataset, type HcSeed } from './hc.ts'
import { seedChainsDataset, type VcSeed } from './vc.ts'
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

// ---- thesis log (T-009) ----------------------------------------------------------------------

/** One user with NVDA (four entries, one of each type, one edited) and AAPL (no entries). */
export type TlCtx = { user: TestUser; api: Api; nvda: { id: string }; aapl: { id: string } }

export async function seedForTheses(): Promise<TlCtx> {
  const user = await newUser('e2e-tl-a11y')
  const api = await apiAs(user)
  const nvda = await api.stock(us('NVDA', { name: 'NVIDIA Corporation', gicsSector: 'Information Technology' }))
  const aapl = await api.stock(us('AAPL', { name: 'Apple Inc' }))
  await api.addThesis(nvda.id, { type: 'buy', date: '2026-11-20', note: 'Capex keeps rising.\nMargins hold.', targetPrice: '180', invalidation: 'Gross margin below 65%.' })
  await api.addThesis(nvda.id, { type: 'sell', date: '2026-09-01', note: 'Valuation stretched.' })
  const update = await api.addThesis(nvda.id, { type: 'update', date: '2026-06-15', note: 'Quarter beat.' })
  await api.patchThesis(nvda.id, update.id, { note: 'Quarter beat, guidance raised.' })
  await api.addThesis(nvda.id, { type: 'review', date: '2025-12-31', note: 'Year-end review: thesis intact.' })
  return { user, api, nvda, aapl }
}

export type TlState = {
  name: string
  /** A held request never settles, so the page cannot be waited on to be idle. */
  noSettle?: boolean
  run: (page: Page, ctx: TlCtx) => Promise<void>
}

const thesesUrl = (c: TlCtx) => `**/api/stocks/${c.nvda.id}/theses`
const thesisDialog = (page: Page) => page.getByRole('dialog', { name: /thesis entry/ })

export const TL_STATES: TlState[] = [
  { name: 'section-filled', run: async (page, c) => open(`/stocks/${c.nvda.id}`)(page) },
  { name: 'section-empty', run: async (page, c) => open(`/stocks/${c.aapl.id}`)(page) },
  {
    name: 'section-loading',
    noSettle: true,
    run: async (page, c) => {
      await page.route(thesesUrl(c), () => {}) // never answered
      await page.goto(`/stocks/${c.nvda.id}`)
      await expect(page.locator('[aria-busy="true"]')).toBeVisible()
    },
  },
  {
    name: 'section-load-error',
    run: async (page, c) => {
      await page.route(thesesUrl(c), (route) => route.fulfill({ status: 500, contentType: 'application/problem+json', body: JSON.stringify({ code: 'internal', status: 500, title: 'x', type: 'about:blank' }) }))
      await page.goto(`/stocks/${c.nvda.id}`)
      await expect(page.getByRole('alert').filter({ hasText: "Couldn't load the thesis entries." })).toBeVisible()
    },
  },
  {
    name: 'add-dialog-clean',
    run: async (page, c) => {
      await page.goto(`/stocks/${c.aapl.id}`)
      await page.getByRole('button', { name: 'Add first entry' }).click()
      await expect(thesisDialog(page)).toBeVisible()
    },
  },
  {
    name: 'add-dialog-errors',
    run: async (page, c) => {
      await page.goto(`/stocks/${c.aapl.id}`)
      await page.getByRole('button', { name: 'Add first entry' }).click()
      await thesisDialog(page).getByRole('textbox', { name: /^Target price/ }).fill('1.23456')
      await thesisDialog(page).getByRole('button', { name: 'Add entry' }).click()
      await expect(thesisDialog(page).locator('[aria-invalid="true"]').first()).toBeVisible()
    },
  },
  {
    name: 'edit-dialog',
    run: async (page, c) => {
      await page.goto(`/stocks/${c.nvda.id}`)
      await page.getByRole('button', { name: /^Edit Buy entry of 20 Nov 2026/ }).click()
      await expect(thesisDialog(page)).toBeVisible()
    },
  },
  {
    name: 'delete-confirm',
    run: async (page, c) => {
      await page.goto(`/stocks/${c.nvda.id}`)
      await page.getByRole('button', { name: /^Delete Sell entry of 1 Sep 2026/ }).click()
      await expect(page.getByRole('alertdialog', { name: 'Delete this entry?' })).toBeVisible()
    },
  },
  {
    name: 'stock-delete-confirm',
    run: async (page, c) => {
      await page.goto(`/stocks/${c.nvda.id}`)
      await page.getByRole('button', { name: 'More actions' }).click()
      await page.getByRole('menuitem', { name: 'Delete' }).click()
      await expect(page.getByRole('alertdialog', { name: 'Delete NVDA?' })).toContainText('This also deletes its 4 thesis entries.')
    },
  },
  // Last: it deletes an entry (a fresh one, so the states above keep their data) to show the Undo toast.
  {
    name: 'undo-toast-visible',
    run: async (page, c) => {
      const doomed = await c.api.addThesis(c.nvda.id, { type: 'review', date: '2024-01-02', note: 'Short-lived entry' })
      await page.goto(`/stocks/${c.nvda.id}`)
      await page.getByRole('button', { name: /^Delete Review entry of 2 Jan 2024/ }).click()
      await page.getByRole('alertdialog', { name: 'Delete this entry?' }).getByRole('button', { name: 'Delete' }).click()
      await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Entry deleted' })).toBeVisible()
      void doomed
    },
  },
]

/** Signs the browser in as the seeded user and runs a state (routes of an earlier state are dropped first). */
export async function enterTl(page: Page, state: TlState, ctx: TlCtx) {
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await openSignedIn(page, ctx.user, '/stocks')
  await settled(page)
  await state.run(page, ctx)
  if (!state.noSettle) await settled(page)
}

// ---- value chains (T-008) --------------------------------------------------------------------


/** VC-A with a rate, VC-A with no rate (rate note and left-out lines), a user with stocks but no chain, and an empty user. */
export type VcCtx = VcSeed & { noRate: VcSeed; plain: TestUser; empty: TestUser }

export async function seedForChains(): Promise<VcCtx> {
  const seed = await seedChainsDataset()
  const noRate = await seedChainsDataset({ rate: null })
  const plain = await newUser('e2e-vc-plain')
  const plainApi = await apiAs(plain)
  for (const t of ['PA', 'PB']) await plainApi.stock(us(t, { name: `Plain ${t}` }))
  return { ...seed, noRate, plain, empty: await newUser('e2e-vc-empty') }
}

export type VcState = {
  name: string
  who?: 'noRate' | 'plain' | 'empty'
  /** The state needs a route handler (a held or failing answer), so it is dropped before the next one. */
  run: (page: Page, ctx: VcCtx) => Promise<void>
}

const chainsDialog = (page: Page) => page.getByRole('dialog', { name: 'Rename chain' })
const renameOf = (page: Page, title: string) => page.getByRole('region', { name: title }).first().getByRole('button', { name: 'Rename' })

async function openRenameDialog(page: Page, title = 'Oil & Gas') {
  await page.goto('/chains')
  await settled(page)
  await renameOf(page, title).click()
  await expect(chainsDialog(page)).toBeVisible()
}

export const VC_STATES: VcState[] = [
  { name: 'page-filled', run: async (page) => open('/chains')(page) },
  { name: 'page-rate-and-left-out-notes', who: 'noRate', run: async (page) => open('/chains')(page) },
  { name: 'page-fallback-note', run: async (page) => open('/chains?scope=nope&market=XX')(page) },
  { name: 'page-no-chain-note', run: async (page) => open('/chains?market=US')(page) },
  { name: 'empty-no-stocks', who: 'empty', run: async (page) => open('/chains')(page) },
  { name: 'empty-no-chains-in-view', who: 'plain', run: async (page) => open('/chains')(page) },
  { name: 'filtered-to-none', run: async (page) => open('/chains?q=zzzz')(page) },
  {
    name: 'filters-sheet-open',
    run: async (page) => {
      await open('/chains')(page)
      await page.getByRole('button', { name: /^Filters/ }).click()
      await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible()
    },
  },
  { name: 'rename-dialog-name-step', run: async (page) => openRenameDialog(page) },
  {
    name: 'rename-dialog-merge-step',
    run: async (page) => {
      await openRenameDialog(page, 'AI & Semis')
      await chainsDialog(page).getByRole('textbox', { name: 'Chain name' }).fill('Oil & Gas')
      await chainsDialog(page).getByRole('button', { name: 'Rename' }).click()
      await expect(page.getByRole('dialog').getByRole('heading', { name: /^Merge into/ })).toBeVisible()
    },
  },
  {
    name: 'rename-dialog-field-error',
    run: async (page) => {
      await openRenameDialog(page)
      await chainsDialog(page).getByRole('textbox', { name: 'Chain name' }).fill('')
      await chainsDialog(page).getByRole('button', { name: 'Rename' }).click()
      await expect(chainsDialog(page).locator('[aria-invalid="true"]')).toBeVisible()
    },
  },
  {
    name: 'rename-dialog-gone-alert',
    run: async (page, c) => {
      await openRenameDialog(page, 'Oil & Gas')
      // Another tab renames the chain first; the dialog then meets a 404. Put it back for the states after this one.
      await c.api.renameChain({ from: 'Oil & Gas', to: 'Oil and Gas' })
      await chainsDialog(page).getByRole('textbox', { name: 'Chain name' }).fill('Energy')
      await chainsDialog(page).getByRole('button', { name: 'Rename' }).click()
      await expect(page.getByRole('dialog').getByText('This chain no longer exists.')).toBeVisible()
      await c.api.renameChain({ from: 'Oil and Gas', to: 'Oil & Gas' })
    },
  },
  {
    name: 'rename-dialog-server-error-alert',
    run: async (page) => {
      await openRenameDialog(page)
      await page.route('**/api/chains/rename', (route) => route.fulfill({ status: 500, contentType: 'application/problem+json', body: JSON.stringify({ type: 'about:blank', title: 'x', status: 500, code: 'internal' }) }))
      await chainsDialog(page).getByRole('textbox', { name: 'Chain name' }).fill('Energy')
      await chainsDialog(page).getByRole('button', { name: 'Rename' }).click()
      await expect(chainsDialog(page).getByRole('alert')).toBeVisible()
    },
  },
  { name: 'page-at-md', run: async (page) => { await page.setViewportSize({ width: 768, height: 900 }); await open('/chains')(page) } },
  { name: 'page-at-360', run: async (page) => { await page.setViewportSize({ width: 360, height: 740 }); await open('/chains')(page) } },
]

/** Signs the browser in as the user a state needs and runs it (routes of an earlier state are dropped first). */
export async function enterVc(page: Page, state: VcState, ctx: VcCtx) {
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await page.setViewportSize({ width: 1280, height: 900 })
  const user = state.who === 'noRate' ? ctx.noRate.user : state.who === 'plain' ? ctx.plain : state.who === 'empty' ? ctx.empty : ctx.user
  await openSignedIn(page, user, '/stocks')
  await settled(page)
  await state.run(page, ctx)
  await settled(page)
}
