import type { Exchange, Market } from '@investhesis/domain'

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
