import type { Exchange, Market } from '@investhesis/domain'

/** A holding as the API returns it: decimal strings with 4 places, or `null` when the amount is not entered. */
export type Holding = {
  shares: string | null
  averageCost: string | null
  costCurrency: 'USD' | 'THB'
}

/** A saved stock as `GET /stocks` returns it (design.md §API Contracts). Unset single lenses are `null`, unset multi lenses `[]`. */
export type Stock = {
  id: string
  market: Market
  ticker: string
  exchange: Exchange
  currency: 'USD' | 'THB'
  name: string
  indexMembership: string[]
  gicsSector: string | null
  setIndustryGroup: string | null
  valueChain: string | null
  valueChainPosition: string | null
  size: string | null
  style: string | null
  economicCycle: string | null
  lynchType: string | null
  lifeCycle: string | null
  customers: string[]
  revenueTypes: string[]
  moat: string | null
  themes: string[]
  volatility: string | null
  /** `null` = not held. */
  holding: Holding | null
  lensSources: Partial<Record<string, 'manual' | 'default'>>
  listIds: string[]
  createdAt: string
  updatedAt: string
}

/** A list as `GET /lists` returns it. */
export type ListSummary = {
  id: string
  name: string
  stockCount: number
  createdAt: string
  updatedAt: string
}
