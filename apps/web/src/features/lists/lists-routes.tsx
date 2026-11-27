import type { RouteObject } from 'react-router'
import type { ApiClient } from '@/lib/api-client'
import type { RouteHandle } from '@/routers/route-handle'
import { revalidateOnSubmitOrPathChange } from '@/routers/should-revalidate'
import type { ListPageData } from './lists-data'

/** The `/lists` subtree; loaders and actions are attached in `lazy`, so each page is its own chunk (ADR-008). */
export function listsRoutes(api: ApiClient): RouteObject {
  const data = () => import('./lists-data')
  return {
    path: 'lists',
    handle: { crumb: 'nav.lists' } satisfies RouteHandle,
    children: [
      {
        index: true,
        lazy: async () => {
          const [{ createListsLoader, createListsAction }, view] = await Promise.all([data(), import('@/views/lists')])
          return { Component: view.Component, loader: createListsLoader(api), action: createListsAction(api) }
        },
      },
      {
        path: ':id',
        // The list name from the loader; the id while there is no data.
        handle: {
          crumb: (params, page) => (page as ListPageData | undefined)?.list.name ?? params.id ?? '',
        } satisfies RouteHandle,
        // Sort, search and filters are in the query string and applied locally: a query change reads nothing.
        shouldRevalidate: revalidateOnSubmitOrPathChange,
        lazy: async () => {
          const [{ createListLoader, createListAction }, view] = await Promise.all([data(), import('@/views/list-detail')])
          return { Component: view.Component, loader: createListLoader(api), action: createListAction(api) }
        },
      },
    ],
  }
}
