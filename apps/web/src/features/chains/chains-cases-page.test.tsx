import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/render-app'
import { apiOf, chainRegion, chainTitles, entryLink, held, laneOf, openChains, stockOf, TH, vcA } from './cases-helpers'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

const mainNav = () => within(screen.getByRole('navigation', { name: 'Main', hidden: true }))

describe('page structure and content', () => {
  it('TC-C-900 the page opens from the sidebar with its title, breadcrumb, description and concentration link', async () => {
    const view = renderApp('/stocks', apiOf(vcA()))
    await screen.findByRole('heading', { level: 1, name: 'Stocks' })

    await userEvent.click(mainNav().getByRole('link', { name: 'Value chains', hidden: true }))

    const h1 = await screen.findByRole('heading', { level: 1, name: 'Value chains' })
    await waitFor(() => expect(h1).toHaveFocus())
    expect(document.title).toContain('Value chains')
    expect(within(screen.getByRole('navigation', { name: 'breadcrumb', hidden: true })).getByText('Value chains')).toBeInTheDocument()
    expect(mainNav().getByRole('link', { name: 'Value chains', hidden: true })).toHaveAttribute('data-active', 'true')
    expect(screen.getByText('Your stocks along each chain, from upstream to downstream.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See concentration' })).toBeInTheDocument()
    expect(view.router.state.location.pathname).toBe('/chains')
  })

  it('TC-C-901 chains, lanes and notes expose regions, lists and an unbroken heading order', async () => {
    await openChains('/chains', apiOf([...vcA(), stockOf('LOOSE'), stockOf('USDX', { valueChain: 'AI & Semis', valueChainPosition: 'Upstream', holding: held('1', '1', 'USD') })], { concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null }))

    const ai = chainRegion('AI & Semis')
    const lanes = within(ai).getAllByRole('region')
    expect(lanes.map((l) => within(l).getByRole('heading', { level: 3 }).textContent)).toEqual(['Upstream', 'Midstream', 'Downstream', 'Integrated (spans every stage)'])
    for (const lane of lanes) {
      expect(lane).toHaveAccessibleName(within(lane).getByRole('heading', { level: 3 }).textContent as string)
    }
    expect(within(laneOf(ai, 'Upstream')).getByRole('list')).toBeInTheDocument()
    expect(within(laneOf(ai, 'Upstream')).getAllByRole('listitem').length).toBeGreaterThan(0)
    expect(within(chainRegion('Oil & Gas')).getByRole('region', { name: 'No position' })).toBeInTheDocument()
    // The counts line follows the heading inside the same section.
    const upstream = laneOf(ai, 'Upstream')
    const kids = Array.from(upstream.children).map((c) => c.tagName)
    expect(kids.slice(0, 2)).toEqual(['H3', 'P'])
    // Notes are live regions.
    expect(screen.getAllByRole('status').length).toBeGreaterThanOrEqual(2)
    const levels = screen.getAllByRole('heading').map((h) => Number(h.tagName.slice(1)))
    expect(new Set(levels)).toEqual(new Set([1, 2, 3]))
    levels.reduce((previous, level) => {
      expect(level - previous).toBeLessThanOrEqual(1)
      return level
    }, 0)
  })

  it('TC-C-902 counts, held numbers, THB values and shares follow the dataset', async () => {
    await openChains('/chains', apiOf(vcA()))

    const ai = chainRegion('AI & Semis')
    expect(within(ai).getByText('6 stocks · 4 held · ฿175,200.00')).toBeInTheDocument()
    expect(within(laneOf(ai, 'Upstream')).getByText('2 stocks · 1 held · ฿62,050.00 · 35.4%')).toBeInTheDocument()
    expect(within(laneOf(ai, 'Midstream')).getByText('2 stocks · 2 held · ฿58,400.00 · 33.3%')).toBeInTheDocument()
    expect(within(laneOf(ai, 'Downstream')).getByText('1 stock · 1 held · ฿54,750.00 · 31.3%')).toBeInTheDocument()
    expect(within(laneOf(ai, /^Integrated/)).getByText('1 stock · none held')).toBeInTheDocument()
    expect(within(laneOf(ai, 'Upstream')).getByRole('link', { name: /^ASML/ })).toHaveTextContent('฿62,050.00')
    const oil = chainRegion('Oil & Gas')
    expect(within(oil).getByText('3 stocks · 2 held · ฿100,000.00')).toBeInTheDocument()
    expect(within(laneOf(oil, 'Upstream')).getByText('1 stock · 1 held · ฿100,000.00 · 100.0%')).toBeInTheDocument()
  })

  it('TC-C-903 values and shares are exact decimals, never floats', async () => {
    const usd = (shares: string, cost: string) => held(shares, cost, 'USD')
    await openChains(
      '/chains',
      apiOf(
        [
          stockOf('DEC', { ...TH, valueChain: 'Decimals', valueChainPosition: 'Upstream', holding: held('3', '0.1') }),
          stockOf('BIG', { ...TH, valueChain: 'Big', valueChainPosition: 'Upstream', holding: held('9007199254740993', '1') }),
          stockOf('RATE', { valueChain: 'Rate', valueChainPosition: 'Upstream', holding: usd('1', '0.01') }),
          stockOf('ONE', { ...TH, valueChain: 'Split', valueChainPosition: 'Upstream', holding: held('1', '1') }),
          stockOf('FIF', { ...TH, valueChain: 'Split', valueChainPosition: 'Downstream', holding: held('15', '1') }),
        ],
        { concentrationThreshold: 40, usdThbRate: '36.123456', usdThbRateUpdatedAt: null },
      ),
    )

    expect(within(chainRegion('Decimals')).getAllByText(/฿0\.30/).length).toBeGreaterThan(0)
    expect(within(chainRegion('Big')).getAllByText(/฿9,007,199,254,740,993\.00/).length).toBeGreaterThan(0)
    expect(within(chainRegion('Rate')).getAllByText(/฿0\.36/).length).toBeGreaterThan(0)
    expect(within(laneOf(chainRegion('Split'), 'Upstream')).getByText('1 stock · 1 held · ฿1.00 · 6.3%')).toBeInTheDocument()
    expect(within(laneOf(chainRegion('Split'), 'Downstream')).getByText('1 stock · 1 held · ฿15.00 · 93.8%')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/NaN|e\+|0\.30000000000000004/)
  })

  it('TC-C-904 the Held badge is text on exactly the held stocks that have a chain', async () => {
    await openChains('/chains', apiOf(vcA()))

    const heldTickers = ['ASML', 'TSM', 'NVDA', 'MSFT', 'PTTEP', 'PTT']
    const badges = screen.getAllByText('Held')
    expect(badges).toHaveLength(6)
    for (const badge of badges) expect(badge.tagName).not.toBe('svg')
    for (const ticker of [...heldTickers, 'AMAT', 'INTC', 'BCP']) {
      const link = entryLink(ticker)
      if (heldTickers.includes(ticker)) expect(link).toHaveAccessibleName(/Held/)
      else expect(link).not.toHaveAccessibleName(/Held/)
    }
    // KO is held but has no chain, so it is not on the page at all.
    expect(document.querySelector('a[href="/stocks/s-KO"]')).toBeNull()
    // A held stock with unknown amounts is Held and shows no value.
    const ptt = entryLink('PTT')
    expect(ptt).toHaveTextContent('Held')
    expect(ptt).not.toHaveTextContent('฿')
  })

  it('TC-C-905 entries sit in their lanes in value order and link to their stock page', async () => {
    await openChains('/chains', apiOf(vcA()))

    const tickers = (lane: HTMLElement) => within(lane).getAllByRole('listitem').map((li) => li.querySelector('a')?.getAttribute('href')?.replace('/stocks/s-', ''))
    const ai = chainRegion('AI & Semis')
    expect(tickers(laneOf(ai, 'Upstream'))).toEqual(['ASML', 'AMAT'])
    expect(tickers(laneOf(ai, 'Midstream'))).toEqual(['TSM', 'NVDA'])
    expect(entryLink('TSM')).toHaveTextContent('฿36,500.00')
    expect(entryLink('NVDA')).toHaveTextContent('฿21,900.00')
    expect(tickers(laneOf(chainRegion('Oil & Gas'), 'Midstream'))).toEqual(['PTT'])
    const asml = entryLink('ASML')
    expect(asml).toHaveTextContent('ASML Holding · US')
    expect(asml).toHaveAttribute('href', '/stocks/s-ASML')
    // One link per entry: the name is not a second target.
    for (const li of within(laneOf(ai, 'Upstream')).getAllByRole('listitem')) expect(within(li).getAllByRole('link')).toHaveLength(1)
  })

  it('TC-C-906 names are literal text and wrap instead of overflowing', async () => {
    const emoji = '\u{1F600}'.repeat(60)
    const word = 'w'.repeat(60)
    const markup = '<img src=x onerror=alert(1)>'
    const odd = 'A&B/C?d=e#f%20+g'
    const alerted = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const stocks = [emoji, word, markup, odd].map((chain, i) =>
      stockOf(`T${i}`, { name: i === 0 ? 'x'.repeat(120) : word, valueChain: chain, valueChainPosition: 'Upstream' }),
    )
    await openChains('/chains', apiOf(stocks))

    expect(chainTitles()).toEqual(expect.arrayContaining([emoji, word, markup, odd]))
    expect(document.querySelector('main img, section img')).toBeNull()
    expect(alerted).not.toHaveBeenCalled()
    for (const h of screen.getAllByRole('heading', { level: 2 })) expect(h.className).toMatch(/break-words|wrap-anywhere/)
    expect(entryLink('T0').innerHTML).toMatch(/break-words|wrap-anywhere/)
    for (const el of document.querySelectorAll('section h2, section h3, section ul a, section ul a *')) expect(el.className, el.tagName).not.toMatch(/whitespace-nowrap/)
    alerted.mockRestore()
  })

  it('TC-C-907 the left-out line and the rate note depend on rate and amounts', async () => {
    const usd = held('1', '10', 'USD')
    const base = [
      stockOf('N1', { ...TH, valueChain: 'X', valueChainPosition: 'Upstream', holding: held(null, null) }),
      stockOf('N2', { ...TH, valueChain: 'X', valueChainPosition: 'Upstream', holding: held(null, null) }),
      stockOf('U1', { valueChain: 'X', valueChainPosition: 'Upstream', holding: usd }),
      stockOf('T1', { ...TH, valueChain: 'X', valueChainPosition: 'Upstream', holding: held('1', '10') }),
    ]
    const noRate = { concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null }

    const a = await openChains('/chains', apiOf(base, noRate))
    expect(within(chainRegion('X')).getByText('2 held stocks have no shares or cost, 1 needs a rate, and they are left out of the value.')).toBeInTheDocument()
    expect(within(chainRegion('X')).getByText('4 stocks · 4 held · ฿10.00')).toBeInTheDocument()
    const notes = screen.getAllByText('USD holdings are left out of values until you save a rate.')
    expect(notes).toHaveLength(1)
    expect(notes[0]?.closest('[role="status"]')).toBeInTheDocument()
    expect(within(notes[0]?.closest('[role="status"]') as HTMLElement).getByRole('link')).toHaveAttribute('href', '/concentration')
    a.unmount()

    const b = await openChains('/chains', apiOf(base, { concentrationThreshold: 40, usdThbRate: '36.5', usdThbRateUpdatedAt: null }))
    expect(screen.queryByText(/left out of values until you save a rate/)).toBeNull()
    expect(within(chainRegion('X')).getByText('2 held stocks have no shares or cost and are left out of the value.')).toBeInTheDocument()
    expect(within(chainRegion('X')).getByText('4 stocks · 4 held · ฿375.00')).toBeInTheDocument()
    b.unmount()

    await openChains('/chains', apiOf([stockOf('N1', { ...TH, valueChain: 'X', valueChainPosition: 'Upstream', holding: held(null, null) })], noRate))
    expect(screen.queryByText(/left out of values until you save a rate/)).toBeNull()
    expect(within(chainRegion('X')).getByText('1 held stock has no shares or cost and is left out of the value.')).toBeInTheDocument()
  })

  it('TC-C-908 a value and a share are shown only when a held stock is valued', async () => {
    await openChains(
      '/chains',
      apiOf([
        ...['A', 'B', 'C'].map((t) => stockOf(`C1${t}`, { valueChain: 'C1', valueChainPosition: 'Upstream' })),
        ...['A', 'B'].map((t) => stockOf(`C2${t}`, { ...TH, valueChain: 'C2', valueChainPosition: 'Upstream', holding: held(null, null) })),
        stockOf('C3A', { ...TH, valueChain: 'C3', valueChainPosition: 'Upstream', holding: held('1', '10') }),
        stockOf('C3B', { ...TH, valueChain: 'C3', valueChainPosition: 'Upstream' }),
      ]),
    )

    const c1 = chainRegion('C1')
    expect(within(c1).getAllByText('3 stocks · none held')).toHaveLength(2)
    expect(c1.textContent).not.toMatch(/฿|%/)
    const c2 = chainRegion('C2')
    expect(within(c2).getAllByText('2 stocks · 2 held')).toHaveLength(2)
    expect(c2.textContent).not.toMatch(/฿|%/)
    expect(screen.queryByText(/฿0\.00/)).toBeNull()
    expect(within(laneOf(chainRegion('C3'), 'Upstream')).getByText('2 stocks · 1 held · ฿10.00 · 100.0%')).toBeInTheDocument()
  })

  it('TC-C-909 every chain has three lanes; Integrated and No position appear only when used', async () => {
    await openChains(
      '/chains',
      apiOf([
        stockOf('XA', { valueChain: 'X', valueChainPosition: 'Upstream' }),
        stockOf('YA', { valueChain: 'Y', valueChainPosition: 'Integrated' }),
        stockOf('YB', { valueChain: 'Y', valueChainPosition: 'None' }),
        stockOf('YC', { valueChain: 'Y', valueChainPosition: null }),
        stockOf('ZA', { valueChain: 'Z', valueChainPosition: 'Downstream' }),
      ]),
    )

    const headings = (name: string) => within(chainRegion(name)).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings('X')).toEqual(['Upstream', 'Midstream', 'Downstream'])
    expect(headings('Z')).toEqual(['Upstream', 'Midstream', 'Downstream'])
    expect(headings('Y')).toEqual(['Upstream', 'Midstream', 'Downstream', 'Integrated (spans every stage)', 'No position'])
    for (const lane of ['Upstream', 'Midstream']) {
      const empty = within(laneOf(chainRegion('Y'), lane)).getByText('No stocks')
      expect(empty.className).toContain('text-muted-foreground')
    }
    const none = laneOf(chainRegion('Y'), 'No position')
    expect(within(none).getAllByRole('listitem')).toHaveLength(2)
    const setLinks = screen.getAllByRole('link', { name: /Set position/ })
    expect(setLinks).toHaveLength(2)
    for (const link of setLinks) expect(none).toContainElement(link)
    expect(setLinks.map((l) => l.getAttribute('href'))).toEqual(['/stocks/s-YB/edit', '/stocks/s-YC/edit'])
  })

  it('TC-C-910 other spellings are listed once, comma separated, with the earliest as the title', async () => {
    await openChains(
      '/chains',
      apiOf([
        stockOf('ZED', { valueChain: 'Oil', valueChainPosition: 'Upstream' }),
        stockOf('AAA', { valueChain: 'oil', valueChainPosition: 'Upstream' }),
        stockOf('MMM', { valueChain: 'OIL ', valueChainPosition: 'Upstream' }),
        stockOf('TWO1', { valueChain: 'AI & Semis', valueChainPosition: 'Upstream' }),
        stockOf('TWO2', { valueChain: 'ai & semis', valueChainPosition: 'Upstream' }),
        stockOf('ONE', { valueChain: 'Solo', valueChainPosition: 'Upstream' }),
      ]),
    )

    expect(within(chainRegion('Oil')).getByText('Also spelled: oil, OIL')).toBeInTheDocument()
    expect(within(chainRegion('AI & Semis')).getByText('Also spelled: ai & semis')).toBeInTheDocument()
    expect(within(chainRegion('Solo')).queryByText(/Also spelled/)).toBeNull()
  })

  it('TC-C-911 spellings that differ only in case or outer spaces are one chain; the rest stay apart', async () => {
    const nfc = 'Café'
    const nfd = 'Café'
    await openChains(
      '/chains',
      apiOf([
        stockOf('A1', { valueChain: 'AI & Semis', valueChainPosition: 'Upstream' }),
        stockOf('A2', { valueChain: 'ai & semis', valueChainPosition: 'Upstream' }),
        stockOf('A3', { valueChain: ' AI & Semis ', valueChainPosition: 'Upstream' }),
        stockOf('A4', { valueChain: 'AI &  Semis', valueChainPosition: 'Upstream' }),
        stockOf('T1', { valueChain: 'น้ำมัน', valueChainPosition: 'Upstream' }),
        stockOf('T2', { valueChain: 'น้ำมัน', valueChainPosition: 'Upstream' }),
        stockOf('C1', { valueChain: nfc, valueChainPosition: 'Upstream' }),
        stockOf('C2', { valueChain: nfd, valueChainPosition: 'Upstream' }),
        stockOf('G1', { valueChain: 'ΟΔΟΣ', valueChainPosition: 'Upstream' }),
        stockOf('G2', { valueChain: 'οδοσ', valueChainPosition: 'Upstream' }),
      ]),
    )

    const titles = chainTitles()
    // Chains of equal size: one for the three spellings (3 stocks first), then the single chains and the Thai pair.
    expect(titles[0]).toBe('AI & Semis')
    expect(titles).toHaveLength(7)
    expect(titles).toEqual(expect.arrayContaining(['AI &  Semis', 'น้ำมัน', nfc, nfd, 'ΟΔΟΣ', 'οδοσ']))
    // "AI &  Semis" (two spaces) reads as "AI & Semis" in an accessible name, so the two regions are told apart by position.
    const same = screen.getAllByRole('region', { name: 'AI & Semis' })
    expect(same).toHaveLength(2)
    expect(within(same[0] as HTMLElement).getAllByText('3 stocks · none held').length).toBeGreaterThan(0)
    expect(within(same[1] as HTMLElement).getAllByText('1 stock · none held').length).toBeGreaterThan(0)
  })

  it('TC-C-912 chains of equal size follow their names in code unit order, and the order is stable', async () => {
    const names = ['banks', 'Autos', 'Zinc', 'Ünits', 'น้ำมัน']
    const stocks = [
      ...names.flatMap((n, i) => [1, 2].map((k) => stockOf(`E${i}${k}`, { valueChain: n, valueChainPosition: 'Upstream', ...(k === 1 && { market: 'US' as const }) }))),
      ...[1, 2, 3, 4, 5].map((k) => stockOf(`O${k}`, { valueChain: 'Oil', valueChainPosition: 'Upstream' })),
    ]
    await openChains('/chains', apiOf(stocks))

    // Proposed in the case: Autos, banks, Ünits, Zinc, Thai. The code compares code units, so capitals come before lower case.
    const actual = ['Oil', 'Autos', 'Zinc', 'banks', 'Ünits', 'น้ำมัน']
    expect(chainTitles()).toEqual(actual)
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = await screen.findByRole('dialog', { name: 'Filters' })
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^US, / }))
    await userEvent.keyboard('{Escape}')
    await userEvent.click(await screen.findByRole('button', { name: 'Clear all' }))
    await waitFor(() => expect(chainTitles()).toEqual(actual))
  })
})
