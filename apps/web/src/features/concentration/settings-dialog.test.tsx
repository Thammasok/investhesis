import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { Holding, Stock } from '@/features/stocks/types'
import { ApiError } from '@/lib/api-client'
import { renderApp } from '@/test/render-app'
import { makeStock } from '@/test/stock-fixtures'
import { DEFAULT_SETTINGS, StubApi } from '@/test/stub-api'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

const held = (shares: string, cost: string, costCurrency: Holding['costCurrency']): Holding => ({ shares, averageCost: cost, costCurrency })
const RATE = { concentrationThreshold: 40, usdThbRate: '36.250000', usdThbRateUpdatedAt: '2026-11-23T10:00:00.000Z' }
const NO_RATE_HELP = 'No rate saved. USD holdings are left out of value weights until you add one.'

/** A stub whose PATCH /settings changes what the next GET /settings returns, as the real API does. */
function api(initial: Record<string, unknown> = RATE, stocks: Stock[] = [makeStock({ ticker: 'A', gicsSector: 'Energy' })]) {
  let current = { ...initial }
  const stub = new StubApi({ 'GET /stocks': { items: stocks }, 'GET /lists': { items: [] }, 'GET /settings': () => current })
  stub.on('PATCH /settings', (req: { body?: unknown }) => {
    const patch = req.body as Record<string, unknown>
    current = {
      ...current,
      ...patch,
      ...('usdThbRate' in patch ? { usdThbRateUpdatedAt: patch.usdThbRate === null ? null : '2026-11-24T10:00:00.000Z' } : {}),
    }
    return current
  })
  return stub
}

const open = async (search = '', stub = api()) => {
  const view = renderApp(`/concentration${search}`, stub)
  await screen.findByRole('heading', { level: 1, name: 'Concentration' })
  return { ...view, stub }
}
const openDialog = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Settings' }))
  return screen.findByRole('dialog', { name: 'Concentration settings' })
}
const threshold = () => screen.getByRole('textbox', { name: 'Warning threshold' })
const rate = () => screen.getByRole('textbox', { name: 'Exchange rate, THB per 1 USD' })
const save = () => userEvent.click(screen.getByRole('button', { name: 'Save' }))
const type = async (field: HTMLElement, text: string) => {
  await userEvent.clear(field)
  if (text) await userEvent.type(field, text)
}

beforeEach(() => vi.clearAllMocks())

describe('concentration settings dialog', () => {
  it('TC-C-428: content, openers, focus and Esc, with a saved rate', async () => {
    await open()
    const dialog = await openDialog()
    expect(within(dialog).getByText('1 USD =')).toBeInTheDocument()
    expect(threshold()).toHaveAttribute('inputmode', 'numeric')
    expect(threshold()).toHaveValue('40')
    expect(threshold().closest('[data-slot=input-group]')).toHaveClass('w-28')
    expect(rate()).toHaveAttribute('inputmode', 'decimal')
    expect(rate()).toHaveValue('36.25')
    expect(within(dialog).getByText('%')).toBeInTheDocument()
    expect(within(dialog).getByText('THB')).toBeInTheDocument()
    expect(within(dialog).getByText('Used to add USD costs to THB values. Saved 23 Nov 2026.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear rate' })).toBeEnabled()
    await waitFor(() => expect(threshold()).toHaveFocus())

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveFocus()
  })

  it('TC-C-428: Set rate focuses the rate field; with no rate the help and a disabled Clear rate', async () => {
    const stocks = [
      makeStock({ ticker: 'A', gicsSector: 'Energy', holding: held('1.0000', '1.0000', 'USD') }),
      makeStock({ ticker: 'B', gicsSector: 'Energy', holding: held('1.0000', '1.0000', 'THB') }),
    ]
    await open('?measure=value', api(DEFAULT_SETTINGS, stocks))
    await userEvent.click(screen.getAllByRole('button', { name: 'Set rate' })[0] as HTMLElement)
    const dialog = await screen.findByRole('dialog', { name: 'Concentration settings' })
    await waitFor(() => expect(rate()).toHaveFocus())
    expect(rate()).toHaveValue('')
    expect(within(dialog).getByText(NO_RATE_HELP)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear rate' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.body).not.toHaveFocus()
  })

  it('TC-U-480: save a rate and USD joins the value', async () => {
    const stocks = [
      makeStock({ ticker: 'A', gicsSector: 'Energy', holding: held('1.0000', '1.0000', 'USD') }),
      makeStock({ ticker: 'B', gicsSector: 'Financials', holding: held('1.0000', '100.0000', 'THB') }),
    ]
    const { stub } = await open('?measure=value', api(DEFAULT_SETTINGS, stocks))
    expect(screen.getByText(/1 USD holding needs a rate/)).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Set rate' })[0] as HTMLElement)
    await screen.findByRole('dialog')
    await type(rate(), '36.25')
    await save()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(stub.callsTo('PATCH /settings').map((c) => c.body)).toEqual([{ usdThbRate: '36.25' }])
    expect(toast.success).toHaveBeenCalledWith('Settings saved')
    await waitFor(() => expect(screen.queryByText(/1 USD holding needs a rate/)).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Show stocks in Energy' })).toBeInTheDocument()
    expect(screen.getByText(/1 USD = 36.25 THB, saved 24 Nov 2026/)).toBeInTheDocument()
  })

  it('TC-U-481: a new threshold changes the flags and sends only the threshold', async () => {
    const stocks = [
      ...[1, 2, 3].map((n) => makeStock({ ticker: `E${n}`, gicsSector: 'Energy' })),
      ...[1, 2, 3, 4, 5, 6].map((n) => makeStock({ ticker: `F${n}`, gicsSector: 'Financials' })),
    ]
    // Energy is 3 of 9 = 33.3 %: not flagged at 40, flagged at 33.
    const { stub } = await open('', api({ ...RATE, concentrationThreshold: 40 }, stocks))
    expect(screen.queryByText('Over 33%')).not.toBeInTheDocument()
    await openDialog()
    await type(threshold(), '33')
    await save()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(stub.callsTo('PATCH /settings').map((c) => c.body)).toEqual([{ concentrationThreshold: 33 }])
    expect((await screen.findAllByText('Over 33%')).length).toBeGreaterThan(0)
  })

  it('TC-U-482: invalid values send nothing, show both errors and focus Threshold', async () => {
    const { stub } = await open()
    await openDialog()
    await type(threshold(), '0')
    await type(rate(), '1.1234567')
    await save()
    expect(stub.callsTo('PATCH /settings')).toHaveLength(0)
    expect(threshold()).toHaveAttribute('aria-invalid', 'true')
    expect(rate()).toHaveAttribute('aria-invalid', 'true')
    expect(threshold()).toHaveAccessibleDescription(/whole number from 1 to 100/)
    expect(rate()).toHaveAccessibleDescription(/up to 6 decimal places/)
    expect(threshold()).toHaveFocus()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('TC-U-483: Clear rate then Save sends null and the help turns into the no-rate text', async () => {
    const { stub } = await open()
    const dialog = await openDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Clear rate' }))
    expect(rate()).toHaveValue('')
    expect(within(dialog).getByText(NO_RATE_HELP)).toBeInTheDocument()
    expect(rate()).toHaveFocus()
    await save()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(stub.callsTo('PATCH /settings').map((c) => c.body)).toEqual([{ usdThbRate: null }])
    expect(await screen.findByText(/No exchange rate saved/)).toBeInTheDocument()
  })

  it.each([
    ['0', '', 'threshold'],
    ['1', '', null],
    ['100', '', null],
    ['101', '', 'threshold'],
    ['40.5', '', 'threshold'],
    ['4e1', '', 'threshold'],
    ['-5', '', 'threshold'],
    [' 35 ', '', null],
    ['', '', 'threshold'],
    ['40', '0', 'rate'],
    ['40', '0.000001', null],
    ['40', '999999999999.999999', null],
    ['40', '1000000000000', 'rate'],
    ['40', '1.1234567', 'rate'],
    ['40', '36,25', 'rate'],
    ['40', 'abc', 'rate'],
  ])('TC-C-429: threshold %j rate %j -> invalid field %s', async (t, r, bad) => {
    const { stub } = await open('', api({ ...RATE, usdThbRate: null, usdThbRateUpdatedAt: null }))
    await openDialog()
    await type(threshold(), t)
    await type(rate(), r)
    await save()
    if (bad) {
      expect(stub.callsTo('PATCH /settings')).toHaveLength(0)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(bad === 'threshold' ? threshold() : rate()).toHaveAttribute('aria-invalid', 'true')
      expect(bad === 'threshold' ? threshold() : rate()).toHaveFocus()
    } else {
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      const body = stub.callsTo('PATCH /settings')[0]?.body as Record<string, unknown> | undefined
      if (r) expect(body?.usdThbRate).toBe(r)
      if (t.trim() !== '40') expect(body?.concentrationThreshold).toBe(Number(t.trim()))
      else expect(body).not.toHaveProperty('concentrationThreshold')
    }
  })

  it('TC-C-429: an error clears when its field is edited', async () => {
    await open()
    await openDialog()
    await type(threshold(), '0')
    await save()
    expect(threshold()).toHaveAttribute('aria-invalid', 'true')
    await userEvent.type(threshold(), '5')
    expect(threshold()).not.toHaveAttribute('aria-invalid')
  })

  it('TC-C-430: nothing changed closes without a request and says so', async () => {
    const { stub } = await open()
    await openDialog()
    await save()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(stub.callsTo('PATCH /settings')).toHaveLength(0)
    expect(toast).toHaveBeenCalledWith('No changes to save')
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveFocus()
  })

  it('TC-C-430: same rate typed with different trailing zeros is no change', async () => {
    const { stub } = await open()
    await openDialog()
    await type(rate(), '36.2500')
    await save()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(stub.callsTo('PATCH /settings')).toHaveLength(0)
  })

  it('TC-C-430: a 400 on the rate shows under the field and keeps the dialog open', async () => {
    const stub = api()
    stub.on('PATCH /settings', () => {
      throw new ApiError(400, { code: 'validation_failed', errors: [{ path: 'usdThbRate', message: 'must be greater than 0' }] })
    })
    await open('', stub)
    await openDialog()
    await type(rate(), '40')
    await save()
    expect(await screen.findByText(/must be greater than 0/)).toBeInTheDocument()
    expect(rate()).toHaveAttribute('aria-invalid', 'true')
    expect(rate()).toHaveFocus()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it.each([
    ['500', () => new ApiError(500, { code: 'internal' })],
    ['network', () => new ApiError(0, { code: 'network_error' })],
  ])('TC-C-430: a %s failure shows an alert and keeps the typed values', async (_n, make) => {
    const stub = api()
    stub.on('PATCH /settings', () => {
      throw make()
    })
    await open('', stub)
    const dialog = await openDialog()
    await type(threshold(), '55')
    await save()
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("Couldn't save the settings. Try again.")
    expect(threshold()).toHaveValue('55')
    expect(threshold()).toBeEnabled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('TC-C-430: double Enter sends one request; controls and the spinner are disabled while saving', async () => {
    const stub = api()
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => {
      release = r
    })
    stub.on('PATCH /settings', async () => {
      await gate
      return { ...RATE, concentrationThreshold: 50 }
    })
    await open('', stub)
    const dialog = await openDialog()
    await type(threshold(), '50')
    await userEvent.keyboard('{Enter}{Enter}')
    await waitFor(() => expect(threshold()).toBeDisabled())
    expect(rate()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear rate' })).toBeDisabled()
    expect(dialog.querySelector('svg.animate-spin')).toHaveClass('motion-reduce:animate-none')
    release()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(stub.callsTo('PATCH /settings')).toHaveLength(1)
  })

  it('TC-C-430: Cancel closes without a request and a reopened dialog starts from the saved values', async () => {
    const { stub } = await open()
    await openDialog()
    await type(threshold(), '77')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await openDialog()
    expect(threshold()).toHaveValue('40')
    expect(stub.callsTo('PATCH /settings')).toHaveLength(0)
  })
})
