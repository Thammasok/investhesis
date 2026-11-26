import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { apiOf, chainRegion, chainTitles, held, openChains, stockOf, TH, vcA } from './cases-helpers'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

const scopeSelect = () => screen.getByRole('combobox', { name: 'Scope' })
const pickScope = async (name: RegExp) => {
  await userEvent.click(scopeSelect())
  await userEvent.click(await screen.findByRole('option', { name }))
}
/** Opens the Filters sheet, opens a section when it is closed, ticks one box and closes the sheet. */
async function tick(section: string, option: RegExp) {
  await userEvent.click(screen.getByRole('button', { name: /^Filters/ }))
  const dialog = await screen.findByRole('dialog', { name: 'Filters' })
  const trigger = within(dialog).getByRole('button', { name: new RegExp(`^${section}`) })
  if (trigger.getAttribute('aria-expanded') === 'false') await userEvent.click(trigger)
  await userEvent.click(within(dialog).getByRole('checkbox', { name: option }))
  await userEvent.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull())
}
const tickersShown = () =>
  Array.from(document.querySelectorAll('section ul a[href^="/stocks/s-"]'))
    .filter((a) => !a.getAttribute('href')?.endsWith('/edit'))
    .map((a) => a.getAttribute('href')?.replace('/stocks/s-', ''))
const resultLine = () => screen.getAllByRole('status').find((s) => /stocks?$/.test(s.textContent ?? '') && /\d/.test(s.textContent ?? ''))

describe('scope, filters and search', () => {
  it('TC-C-913 the Scope select offers All, Held and lists, and each choice regroups the page', async () => {
    const { router } = await openChains('/chains', apiOf(vcA()))

    await userEvent.click(scopeSelect())
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['All stocks (12)', 'Held stocks (7)', 'Core (3)'])
    expect(within(screen.getByRole('listbox')).getByText('Lists')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('option', { name: /^Held stocks/ }))
    await waitFor(() => expect(router.state.location.search).toBe('?scope=held'))
    expect(router.state.historyAction).toBe('REPLACE')
    expect(tickersShown()).not.toContain('AMAT')
    expect(tickersShown()).not.toContain('INTC')
    expect(tickersShown()).not.toContain('BCP')
    expect(chainTitles()).toEqual(['AI & Semis', 'Oil & Gas'])

    await pickScope(/^Core/)
    await waitFor(() => expect(router.state.location.search).toBe('?scope=L-core'))
    expect(tickersShown().sort()).toEqual(['ASML', 'PTTEP', 'TSM'])

    await pickScope(/^All stocks/)
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(tickersShown()).toHaveLength(9)
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('TC-C-913 a list id in the address opens that list, and a repeated scope falls back with one note', async () => {
    const direct = await openChains('/chains?scope=L-core', apiOf(vcA()))
    expect(tickersShown().sort()).toEqual(['ASML', 'PTTEP', 'TSM'])
    direct.unmount()

    const { router } = await openChains('/chains?scope=held&scope=all', apiOf(vcA()))
    expect(screen.getAllByText('That list no longer exists. Showing all stocks.')).toHaveLength(1)
    expect(tickersShown()).toHaveLength(9)
    expect(router.state.location.search).toBe('?scope=held&scope=all')
  })

  it('TC-C-914 position, market with search, Clear all, Not set and a padded search each regroup', async () => {
    const { router } = await openChains('/chains', apiOf(vcA()))

    // (a) Upstream only
    await tick('Value chain position', /^Upstream, /)
    await waitFor(() => expect(tickersShown().sort()).toEqual(['AMAT', 'ASML', 'PTTEP']))
    for (const lane of ['Midstream', 'Downstream']) expect(within(within(chainRegion('AI & Semis')).getByRole('region', { name: lane })).getByText('No stocks')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Clear all' })[0] as HTMLElement)
    await waitFor(() => expect(router.state.location.search).toBe(''))

    // (b) Market TH and the search PTT
    await tick('Market', /^TH, /)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search stocks' }), 'PTT')
    await waitFor(() => expect(tickersShown().sort()).toEqual(['PTT', 'PTTEP']))
    expect(chainTitles()).toEqual(['Oil & Gas'])
    expect(resultLine()).toHaveTextContent('2 of 12 stocks')

    // (c) Clear all restores everything
    await userEvent.click(screen.getAllByRole('button', { name: 'Clear all' })[0] as HTMLElement)
    await waitFor(() => expect(chainTitles()).toEqual(['AI & Semis', 'Oil & Gas']))
    expect(resultLine()).toHaveTextContent(/^12 stocks$/)
    expect(router.state.location.search).toBe('')
  })

  it('TC-C-914 "Not set" position means no position stored, which is a different thing from the value None', async () => {
    const view = await openChains('/chains?valueChainPosition=', apiOf(vcA()))
    // AAPL, KO and JNJ have no position and no chain: no chain has a stock with an empty position.
    expect(screen.getByRole('heading', { name: 'No value chains in this view' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Show the 3 stocks with no chain' })).toBeInTheDocument()
    view.unmount()

    await openChains('/chains?valueChainPosition=None', apiOf(vcA()))
    expect(chainTitles()).toEqual(['Oil & Gas'])
    expect(tickersShown()).toEqual(['BCP'])
    expect(within(chainRegion('Oil & Gas')).getByRole('region', { name: 'No position' })).toBeInTheDocument()
  })

  it('TC-C-914 a search is trimmed for matching and in the address, and the box keeps its spaces', async () => {
    const { router } = await openChains('/chains', apiOf(vcA()))
    const box = screen.getByRole('searchbox', { name: 'Search stocks' })

    await userEvent.type(box, '  asml  ')

    await waitFor(() => expect(tickersShown()).toEqual(['ASML']))
    expect(box).toHaveValue('  asml  ')
    expect(router.state.location.search).toBe('?q=asml')
  })

  it('TC-C-915 no request follows a scope, filter, search, clear or address change', async () => {
    const stub = apiOf(vcA())
    const { router } = await openChains('/chains', stub)
    const baseline = stub.calls.map((c) => `${c.method} ${c.path}`)
    expect(baseline.sort()).toEqual(['GET /lists', 'GET /me', 'GET /settings', 'GET /stocks'])

    await pickScope(/^Held stocks/)
    await pickScope(/^Core/)
    await pickScope(/^All stocks/)
    await tick('Market', /^TH, /)
    await tick('Market', /^US, /)
    await userEvent.click(screen.getAllByRole('button', { name: 'Clear all' })[0] as HTMLElement)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search stocks' }), 'ASML')
    await waitFor(() => expect(tickersShown()).toEqual(['ASML']))
    await userEvent.click(screen.getAllByRole('button', { name: 'Clear all' })[0] as HTMLElement)
    await act(async () => {
      await router.navigate('/chains?scope=held', { replace: true })
    })
    await waitFor(() => expect(tickersShown()).not.toContain('AMAT'))

    expect(stub.calls.map((c) => `${c.method} ${c.path}`).sort()).toEqual(baseline)
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('TC-C-916 a rename re-reads stocks, lists and settings once each, then a query change sends nothing', async () => {
    const stub = apiOf(vcA()).on('POST /chains/rename', { name: 'Energy', changed: 3, merged: false })
    const { router } = await openChains('/chains', stub)
    const before = stub.calls.length

    await userEvent.click(within(chainRegion('Oil & Gas')).getByRole('button', { name: /Rename/ }))
    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByRole('textbox', { name: 'Chain name' })
    await userEvent.clear(input)
    await userEvent.type(input, 'Energy')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    await waitFor(() => expect(stub.callsTo('GET /settings').length).toBe(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    const after = stub.calls.slice(before).map((c) => `${c.method} ${c.path}`)
    // The case asks for nothing but the three reads; the app route also re-reads /me after any form submit (once), as on every other page.
    expect(after.sort()).toEqual(['GET /lists', 'GET /me', 'GET /settings', 'GET /stocks', 'POST /chains/rename'])
    const settled = stub.calls.length
    await act(async () => {
      await router.navigate('/chains?scope=held', { replace: true })
    })
    expect(stub.calls.length).toBe(settled)
  })

  it('TC-C-917 regrouping 200 stocks in 20 chains takes well under 200 ms for a scope, a filter and a search', async () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      stockOf(`V${i}`, {
        ...(i % 2 === 0 ? TH : {}),
        valueChain: `Chain ${String(Math.floor(i / 10) + 1).padStart(2, '0')}`,
        valueChainPosition: ['Upstream', 'Midstream', 'Downstream'][i % 3] as string,
        holding: i % 2 === 0 ? held('10', `${i + 1}.5`) : null,
      }),
    )
    const { router } = await openChains('/chains', apiOf(many))
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number
    const measure = async (address: string, done: () => boolean) => {
      const t0 = performance.now()
      await act(async () => {
        await router.navigate(address, { replace: true })
      })
      while (!done()) await act(async () => {})
      return performance.now() - t0
    }
    const cases: [string, string[], () => boolean][] = [
      ['scope', ['/chains?scope=held', '/chains'], () => document.querySelectorAll('section ul a[href^="/stocks/s-"]').length === 100],
      ['filter', ['/chains?market=TH', '/chains'], () => document.querySelectorAll('section ul a[href^="/stocks/s-"]').length === 100],
      ['search', ['/chains?q=v1', '/chains'], () => document.querySelectorAll('section ul a[href^="/stocks/s-"]').length === 111],
    ]
    const report: string[] = []
    for (const [name, [on, off], done] of cases) {
      const samples: number[] = []
      for (let i = 0; i < 5; i++) {
        samples.push(await measure(on as string, done))
        await measure(off as string, () => document.querySelectorAll('section ul a[href^="/stocks/s-"]').length === 200)
      }
      report.push(`${name} median ${median(samples).toFixed(1)} ms`)
      expect(median(samples), name).toBeLessThan(200)
    }
    console.info(`TC-C-917 regroup (jsdom, 200 stocks): ${report.join(', ')}`)
  })
})
