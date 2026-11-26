import type { ListSummary, Stock } from '@/features/stocks/types'
import type { ApiClient } from '@/lib/api-client'

export type Settings = {
  concentrationThreshold: number
  usdThbRate: string | null
  usdThbRateUpdatedAt: string | null
}

export type Portfolio = { stocks: Stock[]; lists: ListSummary[]; settings: Settings }

/** The three reads behind `/concentration` and `/chains`, started together. Any failure rejects (the route error page). */
export async function readPortfolio(api: ApiClient): Promise<Portfolio> {
  const [stocks, lists, settings] = await Promise.all([
    api.get<{ items: Stock[] }>('/stocks'),
    api.get<{ items: ListSummary[] }>('/lists'),
    api.get<Settings>('/settings'),
  ])
  return { stocks: stocks.items, lists: lists.items, settings }
}
