import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render-app'
import { makeList, makeStock } from '@/test/stock-fixtures'
import { StubApi } from '@/test/stub-api'

const aapl = makeStock({ ticker: 'AAPL', name: 'Zeta Apple', listIds: ['core'] })
const msft = makeStock({ ticker: 'MSFT', name: 'Alpha Microsoft', listIds: ['core'] })
const tickers = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent)

const api = () =>
  new StubApi({
    'GET /stocks': { items: [aapl, msft] },
    'GET /lists': { items: [makeList('core', 'Core', 2)] },
    'GET /lists/core': makeList('core', 'Core', 2),
  })
const reads = (stub: StubApi) => stub.calls.filter((c) => c.path !== '/me').length

describe('sort in the address', () => {
  it('TC-U-591 and TC-C-517: sorting writes sort and dir, reload restores it, the default leaves the address bare', async () => {
    const stub = api()
    const { router } = renderApp('/stocks', stub)
    await screen.findByRole('table')
    expect(router.state.location.search).toBe('')

    await userEvent.click(screen.getByRole('button', { name: 'Sort by Name' }))
    await waitFor(() => expect(router.state.location.search).toBe('?sort=name'))
    await waitFor(() => expect(tickers()).toEqual(['MSFT', 'AAPL']))
    await userEvent.click(screen.getByRole('button', { name: 'Sort by Name' }))
    await waitFor(() => expect(router.state.location.search).toBe('?sort=name&dir=desc'))
    await waitFor(() => expect(tickers()).toEqual(['AAPL', 'MSFT']))

    // a "reload": a fresh app at the same address shows the same order
    const search = router.state.location.search
    renderApp(`/stocks${search}`, api())
    await waitFor(() => expect(screen.getAllByRole('table')).toHaveLength(2))
    const second = screen.getAllByRole('table')[1] as HTMLElement
    expect(within(second).getAllByRole('columnheader', { name: /Name/ })[0]).toHaveAttribute('aria-sort', 'descending')

    // Ticker ascending is the default: choosing it leaves the address bare, and flipping it writes dir=desc.
    const ticker = () => screen.getAllByRole('button', { name: 'Sort by Ticker' })[0] as HTMLElement
    await userEvent.click(ticker())
    await waitFor(() => expect(router.state.location.search).toBe(''))
    await userEvent.click(ticker())
    await waitFor(() => expect(router.state.location.search).toBe('?dir=desc'))
    await userEvent.click(ticker())
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('TC-U-592: Held starts descending, and a sort adds no history entry', async () => {
    const { router } = renderApp('/stocks', api())
    await screen.findByRole('table')
    const before = router.state.historyAction
    await userEvent.click(screen.getByRole('button', { name: 'Sort by Held' }))
    await waitFor(() => expect(router.state.location.search).toBe('?sort=held&dir=desc'))
    expect(router.state.historyAction).toBe('REPLACE')
    expect(before).not.toBe('REPLACE')
  })

  it('TC-U-593 and TC-C-501: changing only the query sends no API request on /stocks or /lists/:id', async () => {
    for (const path of ['/stocks', '/lists/core']) {
      const stub = api()
      const { router, unmount } = renderApp(path, stub)
      await screen.findByRole('table')
      const first = reads(stub)
      await userEvent.click(screen.getByRole('button', { name: 'Sort by Name' }))
      await userEvent.click(screen.getByRole('button', { name: 'Sort by Market' }))
      await router.navigate(`${path}?q=zzz&market=TH`, { replace: true })
      await waitFor(() => expect(router.state.location.search).toBe('?q=zzz&market=TH'))
      expect(reads(stub)).toBe(first)
      unmount()
    }
  })

  it('TC-U-594: a bad sort in the address falls back to the default order and is not rewritten', async () => {
    const { router } = renderApp('/stocks?sort=price&utm_source=mail', api())
    await screen.findByRole('table')
    expect(tickers()).toEqual(['AAPL', 'MSFT'])
    expect(router.state.location.search).toBe('?sort=price&utm_source=mail')
  })
})
