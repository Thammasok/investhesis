import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CONCENTRATION_LENSES } from '@investhesis/domain'
import type { Holding, Stock } from '@/features/stocks/types'
import { ApiError } from '@/lib/api-client'
import { renderApp } from '@/test/render-app'
import { makeList, makeStock } from '@/test/stock-fixtures'
import { DEFAULT_SETTINGS, StubApi } from '@/test/stub-api'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

const held = (shares: string | null, cost: string | null, costCurrency: Holding['costCurrency'] = 'USD'): Holding => ({
  shares,
  averageCost: cost,
  costCurrency,
})

/** Dataset HC-A of test-cases.md §5.1. */
function hcA(): Stock[] {
  const th = { market: 'TH', exchange: 'SET', currency: 'THB' } as const
  return [
    makeStock({ ticker: 'NVDA', gicsSector: 'Information Technology', holding: held('10.0000', '100.0000'), listIds: ['core'] }),
    makeStock({ ticker: 'MSFT', gicsSector: 'Information Technology', holding: held('20.0000', '50.0000'), listIds: ['core'] }),
    makeStock({ ticker: 'PTTEP', ...th, gicsSector: 'Energy', holding: held('1000.0000', '20.5000', 'THB'), listIds: ['core'] }),
    makeStock({ ticker: 'KBANK', ...th, gicsSector: 'Financials', holding: held('100.0000', '150.0000', 'THB') }),
    makeStock({ ticker: 'AAPL', gicsSector: 'Information Technology', holding: held(null, null) }),
    makeStock({ ticker: 'JNJ', gicsSector: 'Health Care' }),
    makeStock({ ticker: 'SCB', ...th, gicsSector: 'Financials' }),
    makeStock({ ticker: 'ZZZ' }),
  ]
}

const lists = [makeList('core', 'Core holdings', 3), makeList('empty', 'Empty list', 0)]
const RATE = { ...DEFAULT_SETTINGS, usdThbRate: '36.250000', usdThbRateUpdatedAt: '2026-11-23T10:00:00.000Z' }

function api(stocks: Stock[] = hcA(), settings: unknown = RATE) {
  return new StubApi({ 'GET /stocks': { items: stocks }, 'GET /lists': { items: lists }, 'GET /settings': settings })
}

const open = async (search = '', stub = api()) => {
  const view = renderApp(`/concentration${search}`, stub)
  await screen.findByRole('heading', { level: 1, name: 'Concentration' })
  return { ...view, stub }
}
const rowFor = (label: string) => screen.getByRole('button', { name: `Show stocks in ${label}` }).closest('tr') as HTMLElement
const pick = async (control: string, option: string | RegExp) => {
  await userEvent.click(screen.getByRole('combobox', { name: control }))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

describe('concentration page', () => {
  it('TC-U-470: starts on All stocks / Sector / Count and writes the canonical address with replace', async () => {
    const { router } = await open()
    expect(screen.getByRole('combobox', { name: 'Scope' })).toHaveTextContent('All stocks (8)')
    expect(screen.getByRole('combobox', { name: 'Group by' })).toHaveTextContent('Sector (GICS)')
    expect(screen.getByRole('radio', { name: 'Count' })).toBeChecked()
    expect(router.state.location.search).toBe('')
    const before = router.state.location.key

    await pick('Group by', 'Style')
    await userEvent.click(screen.getByRole('radio', { name: 'Value at cost' }))

    expect(router.state.location.search).toBe('?scope=all&lens=style&measure=value')
    expect(router.state.historyAction).toBe('REPLACE')
    expect(router.state.location.key).not.toBe(before)
  })

  it('TC-C-422: restores every control from the address', async () => {
    await open('?scope=held&lens=moat&measure=value')
    expect(screen.getByRole('combobox', { name: 'Scope' })).toHaveTextContent('Held stocks (5)')
    expect(screen.getByRole('combobox', { name: 'Group by' })).toHaveTextContent('Moat')
    expect(screen.getByRole('radio', { name: 'Value at cost' })).toBeChecked()
  })

  it('TC-U-471: flagged summary lists the group and only that row has the badge', async () => {
    await open('?scope=held')
    expect(screen.getByText('1 group at 40% or more of the stocks')).toBeInTheDocument()
    expect(screen.getByText('Information Technology — 60.0%')).toBeInTheDocument()
    expect(within(rowFor('Information Technology')).getByText('Over 40%')).toBeInTheDocument()
    expect(within(rowFor('Energy')).queryByText(/Over/)).not.toBeInTheDocument()
    expect(screen.getByText('Threshold 40% · 1 USD = 36.25 THB, saved 23 Nov 2026')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('TC-C-415: count view columns, order, Not set last, one decimal', async () => {
    await open()
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Group', 'Stocks', 'Share', 'Flag'])
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getByRole('button').textContent)).toEqual([
      'Information Technology', 'Financials', 'Energy', 'Health Care', 'Not set',
    ])
    expect(within(rows[0] as HTMLElement).getByText('37.5%')).toBeInTheDocument()
    expect(screen.getByText('No group at 40% or more of the stocks')).toBeInTheDocument()
    expect(screen.queryByText(/Not in the value/)).not.toBeInTheDocument()
  })

  it('TC-C-416: value view with a rate shows exact THB totals, shares and zero groups last', async () => {
    await open('?measure=value')
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Group', 'Value (THB)', 'Share', 'Stocks'])
    const it = rowFor('Information Technology')
    expect(within(it).getByText('฿72,500.00')).toBeInTheDocument()
    expect(within(it).getByText('67.1%')).toBeInTheDocument()
    expect(within(it).getByText('Over 40%')).toBeInTheDocument()
    expect(within(rowFor('Energy')).getByText('19.0%')).toBeInTheDocument()
    expect(within(rowFor('Financials')).getByText('13.9%')).toBeInTheDocument()
    expect(within(rowFor('Not set')).getByText('฿0.00')).toBeInTheDocument()
    expect(screen.getByText('1 group at 40% or more of value at cost')).toBeInTheDocument()
  })

  it('TC-C-416: without a rate the USD holdings drop out of the value', async () => {
    await open('?measure=value', api(hcA(), DEFAULT_SETTINGS))
    expect(within(rowFor('Energy')).getByText('57.7%')).toBeInTheDocument()
    expect(within(rowFor('Financials')).getByText('42.3%')).toBeInTheDocument()
    expect(screen.getByText('2 groups at 40% or more of value at cost')).toBeInTheDocument()
    expect(screen.getByText('Threshold 40% · No exchange rate saved')).toBeInTheDocument()
  })

  it('TC-U-472: value is disabled with the reason when no held stock has amounts, and count is shown', async () => {
    const stocks = [
      makeStock({ ticker: 'A', gicsSector: 'Energy', holding: held(null, null) }),
      makeStock({ ticker: 'B', gicsSector: 'Energy', holding: held(null, null) }),
    ]
    const { router } = await open('?scope=held&measure=value', api(stocks))
    expect(screen.getByRole('radio', { name: 'Value at cost' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Count' })).toBeChecked()
    expect(screen.getByText('No held stock in this scope has shares and cost.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: "Mark holdings on a stock's page." })).toHaveAttribute('href', '/stocks')
    expect(screen.getAllByRole('columnheader')[1]).toHaveTextContent('Stocks')
    expect(router.state.location.search).toBe('?scope=held&measure=value')
  })

  it('TC-C-420: USD holdings without a rate name the rate and offer Set rate', async () => {
    const stocks = [makeStock({ ticker: 'A', gicsSector: 'Energy', holding: held('1.0000', '1.0000') })]
    await open('?measure=value', api(stocks, DEFAULT_SETTINGS))
    expect(screen.getByRole('radio', { name: 'Value at cost' })).toBeDisabled()
    expect(screen.getByText(/need an exchange rate/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Set rate' }).length).toBeGreaterThan(0)
  })

  it('TC-C-420: a zero total value shows a dash and the note, with no value flag', async () => {
    const stocks = [makeStock({ ticker: 'A', gicsSector: 'Energy', holding: held('5.0000', '0.0000', 'THB') })]
    await open('?measure=value', api(stocks))
    expect(screen.getByText('Every valued stock has a cost of 0, so there are no shares.')).toBeInTheDocument()
    expect(within(rowFor('Energy')).getByText('—')).toBeInTheDocument()
    expect(screen.getByText('No group at 40% or more of value at cost')).toBeInTheDocument()
  })

  it('TC-U-473: a list that is not among the loaded lists falls back to all stocks with a note', async () => {
    await open('?scope=gone')
    expect(screen.getByText('That list no longer exists. Showing all stocks.')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Scope' })).toHaveTextContent('All stocks (8)')
  })

  it.each([
    ['?lens=banana', "That grouping isn't available. Showing Sector (GICS)."],
    ['?lens=STYLE', "That grouping isn't available. Showing Sector (GICS)."],
    ['?lens=', "That grouping isn't available. Showing Sector (GICS)."],
    ['?measure=VALUE', "That measure isn't available. Showing Count."],
    ['?scope=a&scope=b', 'That list no longer exists. Showing all stocks.'],
    ['?scope=ALL', 'That list no longer exists. Showing all stocks.'],
    ['?scope=%3Cscript%3E', 'That list no longer exists. Showing all stocks.'],
  ])('TC-C-422: %s shows its note and renders', async (search, note) => {
    const { stub } = await open(search)
    expect(screen.getByText(note)).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(stub.callsTo('GET /stocks')).toHaveLength(1)
  })

  it('TC-C-422: several bad params give one note each, and the address is not rewritten', async () => {
    const { router } = await open('?scope=x&lens=y&measure=z')
    expect(screen.getAllByRole('status').filter((s) => s.textContent?.includes('Showing'))).toHaveLength(3)
    expect(router.state.location.search).toBe('?scope=x&lens=y&measure=z')
  })

  it('TC-U-474: the left-out note names the stocks, the rate and the not-held count', async () => {
    await open('?measure=value', api(hcA(), DEFAULT_SETTINGS))
    const note = screen.getByText(/Not in the value:/)
    expect(within(note).getByText('1 held stock without shares or cost')).toBeInTheDocument()
    expect(within(note).getByRole('link', { name: 'AAPL' })).toHaveAttribute('href', '/stocks/s-AAPL')
    expect(within(note).getByText('2 USD holdings need a rate')).toBeInTheDocument()
    expect(within(note).getByRole('button', { name: 'Set rate' })).toBeInTheDocument()
    expect(within(note).getByRole('link', { name: '3 stocks not held' })).toHaveAttribute('href', '/stocks')
  })

  it('TC-C-419: with a rate the needs-rate part is gone; the held scope omits not held; singular wording', async () => {
    const { unmount } = await open('?measure=value')
    expect(screen.queryByText(/need a rate/)).not.toBeInTheDocument()
    expect(screen.getByText(/Not in the value:/)).toBeInTheDocument()
    unmount()
    await open('?scope=held&measure=value', api(hcA(), DEFAULT_SETTINGS))
    expect(screen.getByText('2 USD holdings need a rate')).toBeInTheDocument()
    expect(screen.queryByText(/not held/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set rate' })).toBeInTheDocument()
  })

  it('TC-U-475: expanding a group shows its ticker links; several groups can be open', async () => {
    await open('?lens=market')
    const button = screen.getByRole('button', { name: 'Show stocks in US' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    const sub = document.getElementById(button.getAttribute('aria-controls') as string) as HTMLElement
    expect(within(sub).getByRole('link', { name: 'NVDA' })).toHaveAttribute('href', '/stocks/s-NVDA')
    await userEvent.click(screen.getByRole('button', { name: 'Show stocks in TH' }))
    expect(screen.getByRole('link', { name: 'PTTEP' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'NVDA' })).toBeInTheDocument()
    await userEvent.click(button)
    expect(screen.queryByRole('link', { name: 'NVDA' })).not.toBeInTheDocument()
  })

  it('TC-C-424: Not set can be expanded; the chevron respects reduced motion', async () => {
    await open()
    const button = screen.getByRole('button', { name: 'Show stocks in Not set' })
    expect(button.querySelector('svg')).toHaveClass('motion-reduce:transition-none', 'data-[state=open]:rotate-90')
    await userEvent.click(button)
    expect(screen.getByRole('link', { name: 'ZZZ' })).toBeInTheDocument()
  })

  it('TC-U-476: the multi-value note names the lens and shows only for multi lenses', async () => {
    const stocks = [makeStock({ ticker: 'A', themes: ['AI', 'EV'] }), makeStock({ ticker: 'B', themes: ['AI'] }), makeStock({ ticker: 'C' })]
    const { unmount } = await open('?lens=themes', api(stocks))
    expect(
      screen.getByText('A stock with several themes counts in each of them, so the shares add up to more than 100%.'),
    ).toBeInTheDocument()
    expect(within(rowFor('AI')).getByText('66.7%')).toBeInTheDocument()
    unmount()
    await open('?lens=gicsSector', api(stocks))
    expect(screen.queryByText(/counts in each of them/)).not.toBeInTheDocument()
  })

  it('TC-U-477: no stocks at all is an empty card with Add stock and Import and no controls', async () => {
    await open('', api([]))
    expect(screen.getByRole('heading', { name: 'Nothing to group yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add stock' })).toHaveAttribute('href', '/stocks/new')
    expect(screen.getByRole('link', { name: 'Import' })).toHaveAttribute('href', '/import-export')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByText('These groupings and costs are your own classifications, not advice.')).toBeInTheDocument()
  })

  it('TC-C-423: an empty list and a scope with nothing held', async () => {
    const { unmount } = await open('?scope=empty')
    expect(screen.getByText('Empty list has no stocks yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Empty list' })).toHaveAttribute('href', '/lists/empty')
    unmount()
    await open('?scope=held', api([makeStock({ ticker: 'A' })]))
    expect(screen.getByText(/No stock is marked as held yet/)).toBeInTheDocument()
    expect(screen.getByText('These groupings and costs are your own classifications, not advice.')).toHaveClass('text-xs', 'text-muted-foreground')
  })

  it('TC-C-414: the Scope select lists All, Held and a Lists group with counts', async () => {
    await open()
    await userEvent.click(screen.getByRole('combobox', { name: 'Scope' }))
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      'All stocks (8)', 'Held stocks (5)', 'Core holdings (3)', 'Empty list (0)',
    ])
    await userEvent.click(screen.getByRole('option', { name: 'Core holdings (3)' }))
    expect(await screen.findByRole('table', { name: /list Core holdings/ })).toBeInTheDocument()
  })

  it('TC-C-413: Group by lists the sixteen lenses in FR-006 order', async () => {
    await open()
    await userEvent.click(screen.getByRole('combobox', { name: 'Group by' }))
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      'Sector (GICS)', 'SET industry group', 'Value chain position', 'Value chain name', 'Size', 'Style',
      'Economic cycle', 'Lynch type', 'Life cycle', 'Customers', 'Revenue types', 'Moat', 'Themes',
      'Volatility', 'Market', 'Index membership',
    ])
    expect(CONCENTRATION_LENSES).toHaveLength(16)
  })

  it('TC-C-425: table semantics, caption, decorative bar and phone secondary line', async () => {
    await open('?measure=value')
    expect(screen.getByRole('table', { name: 'Stocks grouped by Sector (GICS), by value at cost, all stocks' })).toBeInTheDocument()
    const row = rowFor('Information Technology')
    expect(row.querySelector('[aria-hidden="true"].bg-muted')).not.toBeNull()
    expect(within(row).getByText('฿72,500.00 · 3 stocks')).toHaveClass('text-xs', 'sm:hidden')
    expect(within(row).getByText('฿72,500.00')).toBeInTheDocument()
    expect(within(row).getByText('3')).toHaveClass('hidden', 'sm:table-cell', 'tabular-nums')
  })

  it('TC-C-417: a share below the threshold shows rounded but is not flagged; equal flags', async () => {
    const mk = (a: string, b: string) => [
      makeStock({ ticker: 'X', currency: 'THB', gicsSector: 'Energy', holding: held('1.0000', a, 'THB') }),
      makeStock({ ticker: 'Y', currency: 'THB', gicsSector: 'Utilities', holding: held('1.0000', b, 'THB') }),
    ]
    const { unmount } = await open('?measure=value', api(mk('3996.0000', '6004.0000')))
    expect(within(rowFor('Energy')).getByText('40.0%')).toBeInTheDocument()
    expect(within(rowFor('Energy')).queryByText(/Over/)).not.toBeInTheDocument()
    expect(within(rowFor('Utilities')).getByText('60.0%')).toBeInTheDocument()
    expect(screen.queryByText('Energy — 40.0%')).not.toBeInTheDocument()
    unmount()
    await open('?measure=value', api(mk('4000.0000', '6000.0000')))
    expect(within(rowFor('Energy')).getByText('Over 40%')).toBeInTheDocument()
  })

  it('TC-C-417: Not set is never flagged and the badge follows the threshold', async () => {
    const { unmount } = await open('', api([makeStock({ ticker: 'A' })], { ...DEFAULT_SETTINGS, concentrationThreshold: 35 }))
    expect(within(rowFor('Not set')).getByText('100.0%')).toBeInTheDocument()
    expect(within(rowFor('Not set')).queryByText(/Over/)).not.toBeInTheDocument()
    unmount()
    await open('', api([makeStock({ ticker: 'A', gicsSector: 'Energy' })], { ...DEFAULT_SETTINGS, concentrationThreshold: 35 }))
    expect(within(rowFor('Energy')).getByText('Over 35%')).toBeInTheDocument()
  })

  it('TC-C-418: the summary is a polite status with a text flag', async () => {
    await open('?scope=held')
    const summary = screen.getByText('1 group at 40% or more of the stocks').closest('[role="status"]') as HTMLElement
    expect(summary.querySelector('svg.text-destructive')).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it('TC-C-426: changing a control keeps focus on it', async () => {
    await open()
    await pick('Group by', 'Style')
    expect(screen.getByRole('combobox', { name: 'Group by' })).toHaveFocus()
    await userEvent.click(screen.getByRole('radio', { name: 'Value at cost' }))
    expect(screen.getByRole('radio', { name: 'Value at cost' })).toHaveFocus()
  })

  it('TC-C-427: regrouping 200 stocks takes under 200 ms and sends no request', async () => {
    const lensKeys = ['gicsSector', 'themes', 'market', 'style']
    const many = Array.from({ length: 200 }, (_, i) =>
      makeStock({
        ticker: `T${i}`,
        gicsSector: `Sector ${i % 11}`,
        style: i % 3 === 0 ? 'Growth' : 'Value',
        themes: Array.from({ length: i % 4 }, (_, k) => `Theme ${(i + k) % 9}`),
        holding: i % 2 === 0 ? held('10.0000', `${i + 1}.5000`, i % 5 === 0 ? 'THB' : 'USD') : null,
        listIds: i % 7 === 0 ? ['core'] : [],
      }),
    )
    const { router, stub } = await open('', api(many))
    const samples: number[] = []
    const timed = async (go: () => void | Promise<void>) => {
      const t0 = performance.now()
      await act(async () => {
        await go()
      })
      samples.push(performance.now() - t0)
    }
    for (let i = 0; i < 20; i++) {
      const key = lensKeys[i % lensKeys.length] as string
      const measure = i % 2 === 0 ? 'value' : 'count'
      const scope = ['all', 'held', 'core'][i % 3] as string
      await timed(() => router.navigate(`/concentration?scope=${scope}&lens=${key}&measure=${measure}`, { replace: true }))
    }
    samples.sort((a, b) => a - b)
    const p95 = samples[Math.floor(samples.length * 0.95) - 1] as number
    console.info(`TC-C-427 regroup p95 ${p95.toFixed(1)} ms`)
    expect(p95).toBeLessThan(200)
    expect(stub.callsTo('GET /stocks')).toHaveLength(1)
    expect(stub.callsTo('GET /settings')).toHaveLength(1)
    // The signed-in area's own read (the account menu) must not repeat on a regroup either.
    expect(stub.callsTo('GET /me').length).toBeLessThanOrEqual(1)
  })
})

describe('concentration route', () => {
  it('TC-C-432: any failing read is the route error page and the three reads start together', async () => {
    const stub = new StubApi({
      'GET /stocks': { items: [] },
      'GET /lists': { items: [] },
      'GET /settings': () => {
        throw new ApiError(500, { code: 'internal' })
      },
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderApp('/concentration', stub)
    await waitFor(() => expect(stub.callsTo('GET /settings')).toHaveLength(1))
    expect(stub.calls.filter((c) => c.path !== '/me').map((c) => c.path).sort()).toEqual(['/lists', '/settings', '/stocks'])
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    spy.mockRestore()
  })

  it('TC-C-433: the title, breadcrumb and nav item', async () => {
    await open()
    expect(document.title).toBe('Concentration · Investhesis')
    expect(screen.getByRole('heading', { level: 1, name: 'Concentration' })).toHaveFocus()
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Concentration', current: 'page' })).toBeInTheDocument()
  })

  it('TC-C-433: the action accepts only save-settings and answers anything else without a request', async () => {
    const { createConcentrationAction } = await import('./concentration-data')
    const stub = api()
    const act = createConcentrationAction(stub.client())
    const post = (body: unknown) =>
      act({ request: new Request('http://x/concentration', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), params: {}, context: undefined } as never)
    expect(await post({ intent: 'nope' })).toMatchObject({ ok: false })
    expect(stub.callsTo('PATCH /settings')).toHaveLength(0)

    stub.on('PATCH /settings', {})
    expect(await post({ intent: 'save-settings', patch: { usdThbRate: '36.25' } })).toEqual({ intent: 'save-settings', ok: true })
    expect(stub.callsTo('PATCH /settings')[0]?.body).toEqual({ usdThbRate: '36.25' })

    stub.on('PATCH /settings', () => {
      throw new ApiError(400, { code: 'validation_failed', errors: [{ path: 'usdThbRate', message: 'bad' }] })
    })
    expect(await post({ intent: 'save-settings', patch: { usdThbRate: 'x' } })).toMatchObject({ ok: false, errors: [{ path: 'usdThbRate' }] })
    stub.on('PATCH /settings', () => {
      throw new ApiError(500, { code: 'internal' })
    })
    expect(await post({ intent: 'save-settings', patch: {} })).toMatchObject({ ok: false, message: "Couldn't save the settings. Try again." })
  })

  it('TC-C-434: only scope, lens and measure reach the address', async () => {
    const { router } = await open('?measure=value')
    await pick('Group by', 'Moat')
    expect(router.state.location.search).toBe('?scope=all&lens=moat&measure=value')
    expect(router.state.location.hash).toBe('')
    expect(document.title).toBe('Concentration · Investhesis')
  })
})
