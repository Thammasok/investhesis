import type { RouteObject } from 'react-router'
import type { ApiClient } from '@/lib/api-client'
import type { RouteHandle } from '@/routers/route-handle'
import { STOCK_ROUTE_ID } from '@/routers/route-ids'
import type { Stock } from './types'

/**
 * The `/stocks` subtree. Views export only components, so the loaders and actions (which need the
 * API client) are attached here; each page is still its own lazy chunk (ADR-008).
 */
export function stocksRoutes(api: ApiClient): RouteObject {
  const data = () => import('./stocks-data')
  return {
    path: 'stocks',
    handle: { crumb: 'Stocks' } satisfies RouteHandle,
    children: [
      {
        // Pathless layout: the Stocks page, with Add stock as a dialog in its outlet.
        lazy: async () => {
          const [{ createStocksLoader }, view] = await Promise.all([data(), import('@/views/stocks')])
          return { Component: view.Component, loader: createStocksLoader(api) }
        },
        children: [
          { index: true },
          {
            path: 'new',
            handle: { crumb: 'New stock' } satisfies RouteHandle,
            lazy: async () => {
              const [{ createStockNewLoader, createStockCreateAction }, view] = await Promise.all([data(), import('@/views/stock-new')])
              return { Component: view.Component, loader: createStockNewLoader(api), action: createStockCreateAction(api) }
            },
          },
        ],
      },
      {
        path: ':id',
        id: STOCK_ROUTE_ID,
        // The ticker, from the loader's stock; the id while there is no data.
        handle: {
          crumb: (params, stock) => (stock as Stock | undefined)?.ticker ?? params.id ?? '',
        } satisfies RouteHandle,
        lazy: async () => ({ loader: (await data()).createStockLoader(api) }),
        children: [
          {
            index: true,
            lazy: async () => {
              const [{ createStockDetailLoader, createStockDetailAction }, view] = await Promise.all([
                data(),
                import('@/views/stock-detail'),
              ])
              return {
                Component: view.Component,
                loader: createStockDetailLoader(api),
                action: createStockDetailAction(api),
              }
            },
          },
          {
            path: 'edit',
            handle: { crumb: 'Edit' } satisfies RouteHandle,
            lazy: async () => {
              const [{ createStockUpdateAction }, view] = await Promise.all([data(), import('@/views/stock-edit')])
              return { Component: view.Component, action: createStockUpdateAction(api) }
            },
          },
        ],
      },
    ],
  }
}
