import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api-client'
import { renderApp } from '@/test/render-app'
import { makeStock } from '@/test/stock-fixtures'
import { StubApi } from '@/test/stub-api'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast).mockClear()
})

type User = ReturnType<typeof userEvent.setup>
const created = makeStock({ ticker: 'NVDA', name: 'NVIDIA Corporation' })
const body = (api: StubApi, route = 'POST /stocks') => api.callsTo(route).at(-1)?.body as Record<string, unknown>
const held = (ticker = 'NVDA') =>
  makeStock({ ticker, name: `${ticker} Co`, holding: { shares: '120.5000', averageCost: '412.3300', costCurrency: 'USD' } })

async function openNew() {
  const user = userEvent.setup()
  const api = new StubApi({ 'GET /lists': { items: [] }, 'GET /stocks': { items: [] }, 'POST /stocks': created, [`GET /stocks/${created.id}`]: created })
  renderApp('/stocks/new', api)
  await screen.findByRole('dialog', { name: 'Add stock' })
  return { user, api }
}
async function fillIdentity(user: User, market = 'US') {
  await user.click(screen.getByRole('radio', { name: market }))
  await user.type(screen.getByRole('textbox', { name: /^Ticker/ }), 'NVDA')
  await user.click(screen.getByRole('combobox', { name: /^Exchange/ }))
  await user.click(await screen.findByRole('option', { name: market === 'US' ? 'NASDAQ' : 'SET' }))
  await user.type(screen.getByRole('textbox', { name: /^Company name/ }), 'NVIDIA Corporation')
}
const save = (user: User) => user.click(screen.getByRole('button', { name: 'Save stock' }))
const tick = (user: User) => user.click(screen.getByRole('checkbox', { name: 'I hold this stock' }))
const shares = () => screen.getByRole('textbox', { name: /^Shares/ })
const cost = () => screen.getByRole('textbox', { name: /^Average cost/ })

async function openEdit(stock = held(), patch: unknown = stock) {
  const user = userEvent.setup()
  const api = new StubApi({ [`GET /stocks/${stock.id}`]: stock, [`PATCH /stocks/${stock.id}`]: patch, 'GET /stocks': { items: [stock] }, 'GET /lists': { items: [] } })
  renderApp(`/stocks/${stock.id}/edit`, api)
  await screen.findByRole('heading', { level: 1, name: `Edit ${stock.ticker}` })
  return { user, api }
}

describe('stock form: holding (create)', () => {
  it('TC-C-401: the card shows only the checkbox until ticked; focus stays; Tab order', async () => {
    const { user } = await openNew()
    expect(screen.getByRole('heading', { level: 2, name: 'Holding' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /^Shares/ })).not.toBeInTheDocument()
    const box = screen.getByRole('checkbox', { name: 'I hold this stock' })
    box.focus()
    await user.keyboard(' ')
    expect(box).toBeChecked()
    expect(box).toHaveFocus()
    await user.tab()
    expect(shares()).toHaveFocus()
    await user.tab()
    expect(cost()).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('radio', { name: 'USD' })).toHaveFocus()
    await tick(user)
    expect(screen.queryByRole('textbox', { name: /^Shares/ })).not.toBeInTheDocument()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['Add stock', 'Identity', 'Classification', 'Holding', 'Lists'])
  })

  it('TC-U-450: unticked sends no holding; ticked sends strings', async () => {
    const { user, api } = await openNew()
    await fillIdentity(user)
    await save(user)
    await waitFor(() => expect(api.callsTo('POST /stocks')).toHaveLength(1))
    expect(body(api)).not.toHaveProperty('holding')
  })

  it('TC-U-450: ticked with amounts sends them as typed strings with the currency', async () => {
    const { user, api } = await openNew()
    await fillIdentity(user)
    await tick(user)
    await user.type(shares(), '120.5')
    await user.type(cost(), '412.33')
    await save(user)
    await waitFor(() => expect(api.callsTo('POST /stocks')).toHaveLength(1))
    expect(body(api).holding).toEqual({ shares: '120.5', averageCost: '412.33', costCurrency: 'USD' })
  })

  it('TC-C-402: inputs are decimal text fields; trims; empty means held, amount unknown', async () => {
    const { user, api } = await openNew()
    await fillIdentity(user)
    await tick(user)
    for (const input of [shares(), cost()]) {
      expect(input).toHaveAttribute('type', 'text')
      expect(input).toHaveAttribute('inputmode', 'decimal')
      expect(input).toHaveAttribute('autocomplete', 'off')
      expect(input).toHaveClass('tabular-nums')
    }
    await user.type(shares(), ' 12 ')
    await save(user)
    await waitFor(() => expect(api.callsTo('POST /stocks')).toHaveLength(1))
    expect(body(api).holding).toEqual({ shares: '12', averageCost: null, costCurrency: 'USD' })
  })

  it('TC-C-402: both empty sends held with unknown amounts', async () => {
    const { user, api } = await openNew()
    await fillIdentity(user)
    await tick(user)
    await save(user)
    await waitFor(() => expect(api.callsTo('POST /stocks')).toHaveLength(1))
    expect(body(api).holding).toEqual({ shares: null, averageCost: null, costCurrency: 'USD' })
  })

  it.each([
    ['0', '', 'holdingShares'],
    ['1.23456', '', 'holdingShares'],
    ['1,5', '', 'holdingShares'],
    ['1e3', '', 'holdingShares'],
    ['abc', '', 'holdingShares'],
    ['-1', '', 'holdingShares'],
    ['100000000000000', '', 'holdingShares'],
    ['', '-0.5', 'holdingAverageCost'],
    ['', '1.23456', 'holdingAverageCost'],
  ])('TC-C-402: shares %j cost %j is blocked on the client', async (s, c, field) => {
    const { user, api } = await openNew()
    await fillIdentity(user)
    await tick(user)
    if (s) await user.type(shares(), s)
    if (c) await user.type(cost(), c)
    await save(user)
    expect(api.callsTo('POST /stocks')).toHaveLength(0)
    const input = document.querySelector<HTMLElement>(`[data-field="${field}"]`)
    expect(input).toHaveFocus()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input?.getAttribute('aria-describedby')).toBeTruthy()
  })

  it('TC-U-452: errors under both fields and focus on Shares', async () => {
    const { user, api } = await openNew()
    await fillIdentity(user)
    await tick(user)
    await user.type(shares(), '0')
    await user.type(cost(), '1.23456')
    await save(user)
    expect(api.callsTo('POST /stocks')).toHaveLength(0)
    expect(shares()).toHaveFocus()
    expect(screen.getByText(/^Shares must be greater than 0/)).toBeInTheDocument()
    expect(screen.getByText(/^Average cost must be 0 or more/)).toBeInTheDocument()
    expect(cost()).toHaveAttribute('aria-invalid', 'true')
  })

  it('TC-U-451 and TC-C-403: the currency follows the market until chosen, and the prefix follows the currency', async () => {
    const { user } = await openNew()
    await tick(user)
    const usd = () => screen.getByRole('radio', { name: 'USD' })
    const thb = () => screen.getByRole('radio', { name: 'THB' })
    expect(usd()).toBeChecked()
    expect(screen.getByText('$')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'TH' }))
    expect(thb()).toBeChecked()
    expect(screen.getByText('฿')).toBeInTheDocument()
    await user.click(usd())
    expect(usd()).toBeChecked()
    expect(screen.getByText('$')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'US' }))
    await user.click(screen.getByRole('radio', { name: 'TH' }))
    expect(usd()).toBeChecked()
    expect(screen.getByRole('radiogroup', { name: 'Cost currency' })).toBeInTheDocument()
  })

  it('TC-U-453: a server path lands on its field', async () => {
    const { user, api } = await openNew()
    api.on('POST /stocks', () => {
      throw new ApiError(400, { code: 'validation_failed', errors: [{ path: 'holding.averageCost', message: 'must have up to 4 decimal places' }] })
    })
    await fillIdentity(user)
    await tick(user)
    await user.type(cost(), '5')
    await save(user)
    expect(await screen.findByText(/must have up to 4 decimal places/)).toBeInTheDocument()
    await waitFor(() => expect(cost()).toHaveAttribute('aria-invalid', 'true'))
    expect(cost()).toHaveFocus()
  })

  it('TC-C-405: holding fields are disabled while saving; one request for a double submit', async () => {
    const { user, api } = await openNew()
    let release: (v: unknown) => void = () => {}
    api.on('POST /stocks', () => new Promise((resolve) => (release = resolve)))
    await fillIdentity(user)
    await tick(user)
    await save(user)
    await waitFor(() => expect(shares()).toBeDisabled())
    expect(cost()).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'USD' })).toBeDisabled()
    expect(document.querySelector('.animate-spin')).toHaveClass('motion-reduce:animate-none')
    await user.type(cost(), '{Enter}')
    expect(api.callsTo('POST /stocks')).toHaveLength(1)
    release(created)
  })
})

describe('stock form: holding (edit)', () => {
  it('TC-C-404: prefills trimmed values and sends nothing when unchanged', async () => {
    const { user, api } = await openEdit()
    expect(screen.getByRole('checkbox', { name: 'I hold this stock' })).toBeChecked()
    expect(shares()).toHaveValue('120.5')
    expect(cost()).toHaveValue('412.33')
    expect(screen.getByRole('radio', { name: 'USD' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(api.callsTo('PATCH /stocks/s-NVDA')).toHaveLength(0)
    expect(toast).toHaveBeenCalledWith('No changes to save')
  })

  it('TC-U-454: only a changed holding is sent, whole; null when unticked', async () => {
    const { user, api } = await openEdit()
    const route = 'PATCH /stocks/s-NVDA'
    const name = screen.getByRole('textbox', { name: /^Company name/ })
    await user.type(name, 'X')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.callsTo(route)).toHaveLength(1))
    expect(body(api, route)).toEqual({ name: 'NVDA CoX' })
  })

  it('TC-U-454: changing shares sends the whole holding', async () => {
    const { user, api } = await openEdit()
    const route = 'PATCH /stocks/s-NVDA'
    await user.clear(shares())
    await user.type(shares(), '130')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.callsTo(route)).toHaveLength(1))
    expect(body(api, route)).toEqual({ holding: { shares: '130', averageCost: '412.33', costCurrency: 'USD' } })
  })

  it('TC-U-454: unticking sends holding null only', async () => {
    const { user, api } = await openEdit()
    const route = 'PATCH /stocks/s-NVDA'
    await tick(user)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.callsTo(route)).toHaveLength(1))
    expect(body(api, route)).toEqual({ holding: null })
  })

  it('TC-C-404: held with unknown amounts shows ticked and empty; tick-then-untick on a not-held stock sends nothing', async () => {
    const ptt = makeStock({ ticker: 'PTTEP', market: 'TH', exchange: 'SET', currency: 'THB', holding: { shares: null, averageCost: null, costCurrency: 'THB' } })
    const first = await openEdit(ptt)
    expect(screen.getByRole('checkbox', { name: 'I hold this stock' })).toBeChecked()
    expect(shares()).toHaveValue('')
    expect(screen.getByRole('radio', { name: 'THB' })).toBeChecked()
    await first.user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(first.api.callsTo('PATCH /stocks/s-PTTEP')).toHaveLength(0)
  })

  it('TC-C-404: ticking a not-held stock sends the new holding with the stock currency; tick-untick sends nothing', async () => {
    const plain = makeStock({ ticker: 'AAPL' })
    const { user, api } = await openEdit(plain)
    await tick(user)
    await tick(user)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(api.callsTo('PATCH /stocks/s-AAPL')).toHaveLength(0)
    await tick(user)
    await user.type(shares(), '3')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.callsTo('PATCH /stocks/s-AAPL')).toHaveLength(1))
    expect(body(api, 'PATCH /stocks/s-AAPL')).toEqual({ holding: { shares: '3', averageCost: null, costCurrency: 'USD' } })
  })
})
