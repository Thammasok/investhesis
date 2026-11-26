import { CONCENTRATION_LENSES, groupConcentration } from '@investhesis/domain'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { readFilters } from '@/features/stock-filters/filter-address'
import { makeList } from '@/test/stock-fixtures'
import { apiOf, chainRegion, chainTitles, held, openChains, stockOf, TH, vcA } from './cases-helpers'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

const noRate = { concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null }

describe('links and notes', () => {
  const chained = stockOf('CH', { ...TH, name: 'Oil Chain Co', valueChain: 'Oil X', valueChainPosition: 'Upstream', listIds: ['L1'], holding: held('1', '1') })
  const bare = (n: number) =>
    Array.from({ length: n }, (_, i) => stockOf(`NC${i}`, { ...TH, name: `Oil Co ${i}`, listIds: ['L1'], holding: held('1', '1') }))
  const lists = [makeList('L1', 'Core', 5)]
  const show = () => screen.getByRole('link', { name: 'Show them' })
  const parsed = () => new URL(show().getAttribute('href') as string, 'http://x')

  it('TC-C-918 the no-chain note counts the stocks in view and links to them with the current filters', async () => {
    const stocks = [chained, ...bare(4)]
    const all = await openChains('/chains?market=TH&q=oil', apiOf(stocks, noRate, lists))
    expect(screen.getByText('4 stocks in view have no value chain.')).toBeInTheDocument()
    expect(parsed().pathname).toBe('/stocks')
    expect([...parsed().searchParams.entries()].sort()).toEqual([['market', 'TH'], ['q', 'oil'], ['valueChain', '']])
    all.unmount()

    const inList = await openChains('/chains?scope=L1&market=TH&q=oil', apiOf(stocks, noRate, lists))
    expect(parsed().pathname).toBe('/lists/L1')
    expect(parsed().searchParams.get('market')).toBe('TH')
    inList.unmount()

    const heldScope = await openChains('/chains?scope=held&market=TH&q=oil', apiOf(stocks, noRate, lists))
    expect(parsed().pathname).toBe('/stocks')
    expect(parsed().searchParams.get('held')).toBe('yes')
    expect(parsed().searchParams.get('q')).toBe('oil')
    heldScope.unmount()

    const one = await openChains('/chains?market=TH&q=oil', apiOf([chained, ...bare(1)], noRate, lists))
    expect(screen.getByText('1 stock in view has no value chain.')).toBeInTheDocument()
    one.unmount()

    const none = await openChains('/chains?market=TH&q=oil', apiOf([chained], noRate, lists))
    expect(screen.queryByText(/in view (has|have) no value chain/)).toBeNull()
    none.unmount()

    // A value-chain filter hides the stocks without a chain, so there is nothing to count; the count is of stocks in view only.
    await openChains('/chains?valueChain=Oil%20X', apiOf(stocks, noRate, lists))
    expect(screen.queryByText(/in view (has|have) no value chain/)).toBeNull()
  })

  it('TC-C-919 each Stocks link carries the filters and the title, percent-encoded, and round-trips', async () => {
    const names = ['A&B/C?d=e#f%20+g', 'น้ำมัน', '\u{1F600}'.repeat(60), 'İstanbul Oil', 'AI &  Semis']
    const stocks = names.map((valueChain, i) => stockOf(`LK${i}`, { valueChain, valueChainPosition: 'Upstream', holding: held('1', '1', 'USD'), listIds: ['L1'] }))
    const held_ = await openChains('/chains?scope=held&market=US&valueChain=Old', apiOf(stocks, noRate, lists))
    // The old value-chain pick in the address hides every chain; clear it by reading the page without it.
    expect(chainTitles()).toEqual([])
    held_.unmount()

    await openChains('/chains?scope=held&market=US', apiOf(stocks, noRate, lists))
    for (const title of names) {
      const region = screen.getAllByRole('heading', { level: 2 }).find((h) => h.textContent === title)?.closest('[data-slot="card"]') as HTMLElement
      const link = within(region).getByRole('link', { name: /^Stocks/ })
      const href = link.getAttribute('href') as string
      const url = new URL(href, 'http://x')
      expect(url.pathname).toBe('/stocks')
      expect(url.searchParams.get('held')).toBe('yes')
      expect(url.searchParams.get('market')).toBe('US')
      expect(url.searchParams.getAll('valueChain')).toEqual([title])
      expect([...readFilters(url.searchParams, { sort: false }).state.picks.get('valueChain') ?? []]).toEqual([title])
      // Encoded once: the literal text "%20" of the odd title becomes %2520, never %252520.
      expect(href).not.toContain('%252520')
      if (title.includes('%20')) expect(href).toContain('%2520')
    }
  })

  it('TC-C-919 a list scope links to that list page', async () => {
    await openChains('/chains?scope=L1', apiOf([chained], noRate, lists))
    const href = within(chainRegion('Oil X')).getByRole('link', { name: /^Stocks/ }).getAttribute('href') as string
    expect(new URL(href, 'http://x').pathname).toBe('/lists/L1')
  })

  it('TC-C-920 See concentration keeps the scope and filters and opens the value chain lens', async () => {
    const { router } = await openChains('/chains?scope=held&market=US', apiOf(vcA()))
    const link = screen.getByRole('link', { name: 'See concentration' })
    expect(link).toHaveAttribute('href', '/concentration?scope=held&lens=valueChain&measure=count&market=US')

    await userEvent.click(link)

    await screen.findByRole('heading', { level: 1, name: 'Concentration' })
    expect(router.state.location.pathname).toBe('/concentration')
    expect(screen.getByRole('combobox', { name: 'Group by' })).toHaveTextContent('Value chain name')
    expect(screen.getByRole('combobox', { name: 'Scope' })).toHaveTextContent('Held stocks')
    expect(screen.getByRole('button', { name: 'Remove filter Market: US' })).toBeInTheDocument()
    expect(screen.queryByText(/isn't available/)).toBeNull()
    expect(screen.queryByText(/no longer exists/)).toBeNull()
  })
})

const lists = [makeList('L1', 'Core', 5)]

/** The (label, count) pairs and, for the value measure, the values of the concentration table. */
function groupsOnScreen(measure: 'count' | 'value') {
  return screen.getAllByRole('row').slice(1).map((row) => {
    const cells = within(row).getAllByRole('cell')
    const label = within(row).getByRole('button').textContent?.trim() ?? ''
    return measure === 'count'
      ? { label, count: Number(cells[1]?.textContent), value: '' }
      : { label, count: Number(cells[3]?.textContent), value: cells[1]?.textContent ?? '' }
  })
}
const chainsOnScreen = () =>
  chainTitles().map((title) => {
    const card = screen.getAllByRole('heading', { level: 2 }).find((h) => h.textContent === title)?.closest('[data-slot="card"]') as HTMLElement
    const text = card.querySelector('[data-slot="card-description"]')?.textContent ?? ''
    return { label: title ?? '', count: Number(/^(\d+)/.exec(text)?.[1]), value: /฿[\d,.]+/.exec(text)?.[0] ?? '' }
  })

describe('the chains page and the Value chain lens agree', () => {
  const data = () => [
    ...vcA(),
    stockOf('SP1', { valueChain: ' Banks ', valueChainPosition: 'Upstream' }),
    stockOf('SP2', { valueChain: 'banks', valueChainPosition: 'Downstream' }),
    stockOf('THAI', { valueChain: 'น้ำมัน', valueChainPosition: 'Upstream' }),
  ]

  it.each([
    ['all stocks', ''],
    ['held stocks', 'scope=held'],
    ['Market US', 'market=US'],
  ])('TC-C-921 for %s the groups, counts and values equal the chains', async (_name, query) => {
    const q = query ? `&${query}` : ''
    const page = await openChains(`/chains${query ? `?${query}` : ''}`, apiOf(data(), undefined, lists))
    const chains = chainsOnScreen()
    const noChain = /^(\d+) stocks? in view/.exec(screen.queryByText(/in view (has|have) no value chain/)?.textContent ?? '')?.[1]
    page.unmount()

    const count = await (async () => {
      const view = await openConcentration(`/concentration?lens=valueChain&measure=count${q}`, apiOf(data(), undefined, lists))
      const rows = groupsOnScreen('count')
      view.unmount()
      return rows
    })()
    const notSet = count.find((g) => g.label === 'Not set')
    expect(count.filter((g) => g.label !== 'Not set').map(({ label, count: c }) => [label, c]).sort()).toEqual(chains.map(({ label, count: c }) => [label, c]).sort())
    expect(notSet?.count ?? 0).toBe(Number(noChain ?? 0))

    const view = await openConcentration(`/concentration?lens=valueChain&measure=value${q}`, apiOf(data(), undefined, lists))
    const valued = groupsOnScreen('value').filter((g) => g.label !== 'Not set')
    view.unmount()
    for (const chain of chains.filter((c) => c.value !== '')) expect(valued.find((g) => g.label === chain.label)?.value, chain.label).toBe(chain.value)
  })

  it('TC-C-921 the earliest spelling titles both views and the left-out count is the same', async () => {
    const page = await openChains('/chains', apiOf(data(), undefined, lists))
    expect(chainTitles()).toContain('Banks')
    const leftOnChains = screen.getAllByText(/held stocks? (has|have) no shares or cost/).length
    page.unmount()
    const view = await openConcentration('/concentration?lens=valueChain&measure=value', apiOf(data(), undefined, lists))
    expect(groupsOnScreen('value').map((g) => g.label)).toContain('Banks')
    expect(screen.getByText(/1 held stock without shares or cost/)).toBeInTheDocument()
    expect(leftOnChains).toBe(1)
    view.unmount()
  })

  it('TC-C-922 other lenses keep exact grouping and the value chain lens folds', async () => {
    const stocks = [
      stockOf('T1', { themes: ['AI'], valueChain: 'x' }),
      stockOf('T2', { themes: ['ai'], valueChain: 'X' }),
    ]
    const themes = await openConcentration('/concentration?lens=themes', apiOf(stocks))
    expect(groupsOnScreen('count').map((g) => g.label).sort()).toEqual(['AI', 'ai'])
    themes.unmount()
    await openConcentration('/concentration?lens=valueChain', apiOf(stocks))
    expect(groupsOnScreen('count')).toEqual([{ label: 'x', count: 2, value: '' }])
  })

  it('TC-C-922 every other lens groups by the exact stored value, as it did before the slice', () => {
    const stocks = vcA().map((s, i) => ({ ...s, themes: i % 2 ? ['AI', 'ai'] : ['Ai'], gicsSector: i % 3 ? 'Energy' : null, moat: i % 4 ? 'Wide' : 'wide' }))
    const exact = (lensKey: string) => {
      const lens = CONCENTRATION_LENSES.find((l) => l.key === lensKey)!
      const labels = new Set<string>()
      for (const s of stocks) {
        const picked = lens.get(s)
        for (const v of Array.isArray(picked) ? picked : [picked]) if (typeof v === 'string' && v !== '') labels.add(v)
      }
      return [...labels].sort()
    }
    for (const lens of CONCENTRATION_LENSES.filter((l) => l.key !== 'valueChain')) {
      const result = groupConcentration({ stocks, lens: lens.key, usdThbRate: '36.5', threshold: 40 })
      expect(result.groups.filter((g) => g.label !== 'Not set').map((g) => g.label).sort(), lens.key).toEqual(exact(lens.key))
    }
    expect(CONCENTRATION_LENSES).toHaveLength(16)
  })
})

async function openConcentration(path: string, stub: ReturnType<typeof apiOf>) {
  const { renderApp } = await import('@/test/render-app')
  const view = renderApp(path, stub)
  await screen.findByRole('heading', { level: 1, name: 'Concentration' }, { timeout: 8000 })
  await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1))
  return view
}
