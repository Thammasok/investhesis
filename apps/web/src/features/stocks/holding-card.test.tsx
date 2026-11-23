import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api-client'
import { renderApp } from '@/test/render-app'
import { makeStock } from '@/test/stock-fixtures'
import { StubApi } from '@/test/stub-api'
import type { Holding, Stock } from './types'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

const held = (h: Partial<Holding> = {}): Holding => ({ shares: '120.5000', averageCost: '412.3300', costCurrency: 'USD', ...h })

/** A stub whose PATCH really changes the stock, so the revalidated page shows the result. */
function holdingApi(initial: Stock, patch?: (body: { holding: Holding | null }) => unknown) {
  let stock = initial
  const api = new StubApi({ 'GET /lists': { items: [] }, 'GET /stocks': { items: [] } })
  api.on(`GET /stocks/${initial.id}`, () => stock)
  api.on(`PATCH /stocks/${initial.id}`, (req: { body: unknown }) => {
    const body = req.body as { holding: Holding | null }
    const custom = patch?.(body)
    if (custom) return custom
    stock = { ...stock, holding: body.holding }
    return stock
  })
  return api
}

/** The Undo action of the toast with this message. */
const undoOf = (message: string) => {
  const options = vi.mocked(toast).mock.calls.find(([m]) => m === message)?.[1]
  return { duration: options?.duration, action: options?.action as unknown as { onClick: () => void } }
}

const card = () => screen.getByRole('heading', { level: 2, name: 'Holding', hidden: true }).closest('[data-slot="card"]') as HTMLElement
const open = async (name: string) => {
  const stock = await screen.findByRole('heading', { level: 2, name: 'Holding' })
  void stock
  await userEvent.click(within(card()).getByRole('button', { name }))
  return screen.findByRole('dialog', { name: /Holding · / })
}

beforeEach(() => {
  vi.mocked(toast).mockClear()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

describe('holding card', () => {
  it('TC-C-406: not held shows the text and Mark as held only', async () => {
    renderApp('/stocks/s-AAPL', holdingApi(makeStock({ ticker: 'AAPL' })))
    await screen.findByRole('heading', { level: 2, name: 'Holding' })
    const c = within(card())
    expect(c.getByText('Not held')).toBeInTheDocument()
    expect(c.getByRole('button', { name: 'Mark as held' })).toBeInTheDocument()
    expect(c.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(c.queryByRole('term')).not.toBeInTheDocument()
  })

  it('TC-C-406: held without amounts says so', async () => {
    renderApp('/stocks/s-PTTEP', holdingApi(makeStock({ ticker: 'PTTEP', holding: { shares: null, averageCost: null, costCurrency: 'THB' } })))
    await screen.findByRole('heading', { level: 2, name: 'Holding' })
    const c = within(card())
    expect(c.getByText('Held')).toBeInTheDocument()
    expect(c.getByText('Amount not entered.')).toBeInTheDocument()
    expect(c.getByText(/Add shares and cost to include it in value weights\./)).toBeInTheDocument()
    expect(c.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('TC-U-461: the card shows shares, average cost and cost', async () => {
    renderApp('/stocks/s-NVDA', holdingApi(makeStock({ ticker: 'NVDA', holding: held() })))
    await screen.findByRole('heading', { level: 2, name: 'Holding' })
    const c = within(card())
    expect(c.getByText('Shares').nextElementSibling).toHaveTextContent('120.5')
    expect(c.getByText('Average cost').nextElementSibling).toHaveTextContent('$412.33')
    expect(c.getByText('Cost').nextElementSibling).toHaveTextContent('$49,685.77')
    expect(c.queryByText(/Add shares and cost/)).not.toBeInTheDocument()
  })

  it.each([
    ['shares only', { averageCost: null }, 'Shares', 'Cost'],
    ['cost only', { shares: null }, 'Average cost', 'Cost'],
  ])('TC-C-406: %s shows its row, no Cost row and the hint', async (_n, partial, row, missing) => {
    renderApp('/stocks/s-NVDA', holdingApi(makeStock({ ticker: 'NVDA', holding: held(partial) })))
    await screen.findByRole('heading', { level: 2, name: 'Holding' })
    const c = within(card())
    expect(c.getByText(row)).toBeInTheDocument()
    expect(c.queryByText(missing, { selector: 'dt' })).not.toBeInTheDocument()
    expect(c.getByText(/Add shares and cost/)).toBeInTheDocument()
    expect(c.queryByText('Amount not entered.')).not.toBeInTheDocument()
  })

  it('TC-C-406: a THB cost on a TH stock and a USD cost keep their own symbol', async () => {
    renderApp('/stocks/s-KBANK', holdingApi(makeStock({ ticker: 'KBANK', market: 'TH', currency: 'THB', holding: held({ shares: '1000.0000', averageCost: '20.5000', costCurrency: 'THB' }) })))
    await screen.findByRole('heading', { level: 2, name: 'Holding' })
    expect(within(card()).getByText('Cost').nextElementSibling).toHaveTextContent('฿20,500.00')
  })

  it.each([
    ['1.0000', '1.0050', 'USD', '$1.01'],
    ['0.0001', '0.0001', 'USD', '$0.00'],
    ['99999999999999.9999', '99999999999999.9999', 'THB', '฿9,999,999,999,999,999,980,000,000,000.00'],
  ] as const)('TC-C-407: cost of %s x %s is exact', async (shares, averageCost, costCurrency, expected) => {
    renderApp('/stocks/s-X', holdingApi(makeStock({ ticker: 'X', holding: { shares, averageCost, costCurrency } })))
    await screen.findByRole('heading', { level: 2, name: 'Holding' })
    expect(within(card()).getByText('Cost').nextElementSibling).toHaveTextContent(expected)
  })
})

describe('holding dialog', () => {
  it('TC-U-460: marks as held with no amounts', async () => {
    const api = holdingApi(makeStock({ ticker: 'AAPL' }))
    renderApp('/stocks/s-AAPL', api)
    const dialog = await open('Mark as held')
    expect(within(dialog).getByLabelText('Shares (optional)')).toHaveFocus()
    expect(within(dialog).queryByRole('button', { name: 'Stop holding' })).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo('PATCH /stocks/s-AAPL')[0]?.body).toEqual({ holding: { shares: null, averageCost: null, costCurrency: 'USD' } })
    expect(toast.success).toHaveBeenCalledWith('AAPL marked as held')
    expect(await within(card()).findByText('Amount not entered.')).toBeInTheDocument()
    expect(within(card()).getByRole('button', { name: 'Edit' })).toHaveFocus()
  })

  it('TC-C-408: a TH stock starts on THB, the prefix follows the currency, Cancel discards', async () => {
    renderApp('/stocks/s-PTTEP', holdingApi(makeStock({ ticker: 'PTTEP', market: 'TH', currency: 'THB' })))
    const dialog = await open('Mark as held')
    expect(within(dialog).getByRole('radio', { name: 'THB' })).toBeChecked()
    expect(within(dialog).getByText('฿')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('radio', { name: 'USD' }))
    expect(within(dialog).getByText('$')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText('Shares (optional)'), '5')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(within(card()).getByRole('button', { name: 'Mark as held' })).toHaveFocus()
    const again = await open('Mark as held')
    expect(within(again).getByLabelText('Shares (optional)')).toHaveValue('')
  })

  it('TC-C-408: Esc closes and focus returns to Edit; Stop holding sits first and is not destructive', async () => {
    renderApp('/stocks/s-NVDA', holdingApi(makeStock({ ticker: 'NVDA', holding: held() })))
    const dialog = await open('Edit')
    expect(within(dialog).getByLabelText('Shares (optional)')).toHaveValue('120.5')
    expect(within(dialog).getByLabelText('Average cost per share (optional)')).toHaveValue('412.33')
    const stop = within(dialog).getByRole('button', { name: 'Stop holding' })
    expect(stop).toHaveAttribute('data-variant', 'ghost')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(within(card()).getByRole('button', { name: 'Edit' })).toHaveFocus()
  })

  it('TC-C-406: invalid numbers show under the field and send nothing', async () => {
    const api = holdingApi(makeStock({ ticker: 'AAPL' }))
    renderApp('/stocks/s-AAPL', api)
    const dialog = await open('Mark as held')
    await userEvent.type(within(dialog).getByLabelText('Shares (optional)'), '1e3')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    const shares = within(dialog).getByLabelText('Shares (optional)')
    expect(shares).toHaveAttribute('aria-invalid', 'true')
    expect(shares).toHaveFocus()
    expect(api.callsTo('PATCH /stocks/s-AAPL')).toHaveLength(0)
  })

  it('TC-U-462: stop holding, focus Mark as held, Undo restores the old holding', async () => {
    const api = holdingApi(makeStock({ ticker: 'NVDA', holding: held() }))
    renderApp('/stocks/s-NVDA', api)
    const dialog = await open('Edit')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop holding' }))
    await waitFor(() => expect(within(card()).getByRole('button', { name: 'Mark as held' })).toHaveFocus())
    expect(api.callsTo('PATCH /stocks/s-NVDA')[0]?.body).toEqual({ holding: null })
    const undo = undoOf('NVDA no longer held')
    expect(undo.duration).toBe(5000)
    undo.action.onClick()
    await waitFor(() => expect(within(card()).getByText('Cost').nextElementSibling).toHaveTextContent('$49,685.77'))
    expect(api.callsTo('PATCH /stocks/s-NVDA')[1]?.body).toEqual({ holding: { shares: '120.5000', averageCost: '412.3300', costCurrency: 'USD' } })
  })

  it('TC-C-409: Undo of a held-without-amounts stock restores it; a failed Undo says so', async () => {
    let failUndo = false
    const api = holdingApi(makeStock({ ticker: 'PTTEP', market: 'TH', currency: 'THB', holding: { shares: null, averageCost: null, costCurrency: 'THB' } }), (body) => {
      if (failUndo && body.holding) throw new ApiError(500, { code: 'internal', detail: 'x' })
    })
    renderApp('/stocks/s-PTTEP', api)
    const dialog = await open('Edit')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop holding' }))
    await within(card()).findByText('Not held')
    const undo = undoOf('PTTEP no longer held')
    failUndo = true
    undo.action.onClick()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't restore the holding. Mark it as held again."))
    expect(within(card()).getByText('Not held')).toBeInTheDocument()
    expect(api.callsTo('PATCH /stocks/s-PTTEP')[1]?.body).toEqual({ holding: { shares: null, averageCost: null, costCurrency: 'THB' } })
  })

  it.each([
    ['500', new ApiError(500, { code: 'internal', detail: 'boom' }), "Couldn't save the holding. Try again."],
    ['network', new ApiError(0, { code: 'network_error', detail: '' }), "Couldn't save the holding. Try again."],
    ['404', new ApiError(404, { code: 'not_found', detail: '' }), 'This stock no longer exists.'],
  ])('TC-U-463: a %s failure keeps the dialog and values', async (_n, error, message) => {
    const api = holdingApi(makeStock({ ticker: 'AAPL' }), () => {
      throw error
    })
    renderApp('/stocks/s-AAPL', api)
    const dialog = await open('Mark as held')
    await userEvent.type(within(dialog).getByLabelText('Shares (optional)'), '10')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText(message)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Shares (optional)')).toHaveValue('10')
    expect(within(card()).getByText('Not held')).toBeInTheDocument()
  })

  it('TC-C-410: a 400 on holding.shares shows under Shares with focus', async () => {
    const api = holdingApi(makeStock({ ticker: 'AAPL' }), () => {
      throw new ApiError(400, { code: 'validation_failed', detail: 'x', errors: [{ path: 'holding.shares', message: 'must be positive' }] })
    })
    renderApp('/stocks/s-AAPL', api)
    const dialog = await open('Mark as held')
    await userEvent.type(within(dialog).getByLabelText('Shares (optional)'), '10')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText('Shares must be positive')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Shares (optional)')).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(within(dialog).getByLabelText('Shares (optional)')).toHaveFocus())
  })

  it('TC-C-410: a failed Stop holding shows the alert; Save is busy with a reduced-motion spinner and Enter sends once', async () => {
    let release: (v: unknown) => void = () => {}
    const api = holdingApi(makeStock({ ticker: 'AAPL' }), () => new Promise((r) => (release = r)))
    renderApp('/stocks/s-AAPL', api)
    const dialog = await open('Mark as held')
    await userEvent.type(within(dialog).getByLabelText('Shares (optional)'), '10{Enter}{Enter}')
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled())
    expect(dialog.querySelector('svg.motion-reduce\\:animate-none')).not.toBeNull()
    release(makeStock({ ticker: 'AAPL', holding: held() }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo('PATCH /stocks/s-AAPL')).toHaveLength(1)
  })
})
