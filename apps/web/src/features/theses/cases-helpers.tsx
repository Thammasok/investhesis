import { screen } from '@testing-library/react'
import { makeList, makeStock } from '@/test/stock-fixtures'
import { StubApi } from '@/test/stub-api'

/** Shared fixtures of the TC-C-7xx cases (test-cases.md §5): stocks and the routes a stock page reads. */
export const usd = makeStock({ ticker: 'NVDA', name: 'NVIDIA Corporation', gicsSector: 'Information Technology', listIds: [] })
export const thb = makeStock({
  ticker: 'PTT',
  name: 'PTT PCL',
  market: 'TH',
  exchange: 'SET',
  currency: 'THB',
  gicsSector: 'Energy',
  setIndustryGroup: 'Resources',
  listIds: [],
})

export type Stock = typeof usd

/** The routes of `/stocks/:id`; `theses` is called on every read of the entries. */
export const routes = (stock: Stock, theses: () => unknown): Record<string, unknown> => ({
  'GET /lists': { items: [makeList('core', 'Core')] },
  'GET /stocks': { items: [stock] },
  [`GET /stocks/${stock.id}`]: stock,
  [`GET /stocks/${stock.id}/theses`]: () => ({ items: theses() }),
})

export const apiFor = (stock: Stock, items: unknown[]) => new StubApi(routes(stock, () => items))

export const section = () =>
  screen.getByRole('heading', { level: 2, name: 'Thesis' }).closest('[data-slot="card"]') as HTMLElement
