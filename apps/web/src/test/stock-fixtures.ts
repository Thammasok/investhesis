import type { ListSummary, Stock } from '@/features/stocks/types'

const stamp = '2026-11-21T10:00:00.000Z'

/** A stock with no lenses set; override what a test needs. */
export function makeStock(overrides: Partial<Stock> = {}): Stock {
  const ticker = overrides.ticker ?? 'AAPL'
  return {
    id: `s-${ticker}`,
    market: 'US',
    ticker,
    exchange: 'NASDAQ',
    currency: 'USD',
    name: `${ticker} Inc.`,
    indexMembership: [],
    gicsSector: null,
    setIndustryGroup: null,
    valueChain: null,
    valueChainPosition: null,
    size: null,
    style: null,
    economicCycle: null,
    lynchType: null,
    lifeCycle: null,
    customers: [],
    revenueTypes: [],
    moat: null,
    themes: [],
    volatility: null,
    holding: null,
    lensSources: {},
    listIds: [],
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  }
}

export function makeList(id: string, name: string, stockCount = 0): ListSummary {
  return { id, name, stockCount, createdAt: stamp, updatedAt: stamp }
}
