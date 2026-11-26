import type { FilterKey } from '@investhesis/domain'
import { describe, expect, it } from 'vitest'
import { concentrationHref } from '@/features/concentration/concentration-model'
import { DEFAULT_SETTINGS, StubApi, deferred } from '@/test/stub-api'
import { makeList, makeStock } from '@/test/stock-fixtures'
import { readPortfolio } from './portfolio'
import { readScope } from './scope'

const lists = [makeList('L1', 'Core')]
const NOTE = 'That list no longer exists. Showing all stocks.'

describe('shared scope and portfolio', () => {
  it('TC-U-924: readScope reads all, held and a list, and notes a missing list', () => {
    const read = (search: string) => readScope(new URLSearchParams(search), lists)
    expect(read('scope=held')).toEqual({ scope: 'held', list: null, notes: [] })
    expect(read('scope=L1')).toEqual({ scope: 'L1', list: lists[0], notes: [] })
    expect(read('scope=L9')).toEqual({ scope: 'all', list: null, notes: [NOTE] })
    expect(read('scope=held&scope=all')).toEqual({ scope: 'all', list: null, notes: [NOTE] })
    expect(read('')).toEqual({ scope: 'all', list: null, notes: [] })
  })

  it('TC-U-925: concentrationHref takes a lens', () => {
    const filters = { q: '', picks: new Map<FilterKey, ReadonlySet<string | null>>([['market', new Set(['TH'])]]) }
    expect(concentrationHref('held', filters, 'valueChain')).toBe('/concentration?scope=held&lens=valueChain&measure=count&market=TH')
    expect(concentrationHref('held', filters)).toBe('/concentration?scope=held&lens=gicsSector&measure=count&market=TH')
  })

  it('TC-U-926: readPortfolio reads the three endpoints in parallel', async () => {
    const gates = { stocks: deferred<unknown>(), lists: deferred<unknown>(), settings: deferred<unknown>() }
    const stub = new StubApi({
      'GET /stocks': () => gates.stocks.promise,
      'GET /lists': () => gates.lists.promise,
      'GET /settings': () => gates.settings.promise,
    })
    const pending = readPortfolio(stub.client())
    expect(stub.calls.map((c) => c.path).sort()).toEqual(['/lists', '/settings', '/stocks'])
    const stock = makeStock()
    gates.settings.resolve(DEFAULT_SETTINGS)
    gates.lists.resolve({ items: lists })
    gates.stocks.resolve({ items: [stock] })
    expect(await pending).toEqual({ stocks: [stock], lists, settings: DEFAULT_SETTINGS })
  })
})
