import { createBrowserRouter, redirect, type RouteObject } from 'react-router'
import { AppLayout } from '@/components/layout/app-layout'
import { AuthLayout } from '@/components/layout/auth-layout'
import { RouteError } from '@/views/route-error'
import type { RouteHandle } from './route-handle'

/** Route id of the signed-in area. Its loader is where the sign-in guard goes once auth exists. */
export const APP_ROUTE_ID = 'app'

/**
 * The route table. Each page lives in `src/views/` and exports `Component`, so `lazy` makes
 * every page its own chunk. `handle.crumb` labels a route in the header breadcrumb.
 */
export const routes: RouteObject[] = [
  {
    // Sign-in pages, outside the signed-in area so its future guard never applies to them.
    path: '/auth',
    Component: AuthLayout,
    ErrorBoundary: RouteError,
    children: [
      { index: true, loader: () => redirect('/auth/sign-in') },
      { path: 'sign-in', lazy: () => import('@/views/sign-in') },
    ],
  },
  {
    id: APP_ROUTE_ID,
    Component: AppLayout,
    ErrorBoundary: RouteError,
    children: [
      { index: true, loader: () => redirect('/stocks') },
      {
        path: 'stocks',
        handle: { crumb: 'Stocks' } satisfies RouteHandle,
        children: [
          { index: true, lazy: () => import('@/views/stocks') },
          {
            path: ':id',
            handle: { crumb: (params) => params.id ?? '' } satisfies RouteHandle,
            lazy: () => import('@/views/stock-detail'),
          },
        ],
      },
      {
        path: 'concentration',
        handle: { crumb: 'Concentration' } satisfies RouteHandle,
        lazy: () => import('@/views/concentration'),
      },
      {
        path: 'chains',
        handle: { crumb: 'Value chains' } satisfies RouteHandle,
        lazy: () => import('@/views/chains'),
      },
      {
        path: 'lists',
        handle: { crumb: 'Lists' } satisfies RouteHandle,
        lazy: () => import('@/views/lists'),
      },
      {
        path: 'import-export',
        handle: { crumb: 'Import / export' } satisfies RouteHandle,
        lazy: () => import('@/views/import-export'),
      },
      {
        path: '*',
        handle: { crumb: 'Not found' } satisfies RouteHandle,
        lazy: () => import('@/views/not-found'),
      },
    ],
  },
]

export function createAppRouter() {
  return createBrowserRouter(routes)
}
