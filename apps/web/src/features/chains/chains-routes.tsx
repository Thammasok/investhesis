import type { RouteObject } from 'react-router'
import type { ApiClient } from '@/lib/api-client'
import type { RouteHandle } from '@/routers/route-handle'
import { revalidateOnSubmitOrPathChange } from '@/routers/should-revalidate'

/** `/chains`: the loader and action are attached in `lazy`, so the page is its own chunk (ADR-008). */
export function chainsRoute(api: ApiClient): RouteObject {
  return {
    path: 'chains',
    handle: { crumb: 'nav.valueChains' } satisfies RouteHandle,
    // Scope, search and filters live in the address but regroup locally (NFR-001): only a save or arriving reads the API.
    shouldRevalidate: revalidateOnSubmitOrPathChange,
    lazy: async () => {
      const [{ createChainsLoader, createChainsAction }, view] = await Promise.all([
        import('./chains-data'),
        import('@/views/chains'),
      ])
      return { Component: view.Component, loader: createChainsLoader(api), action: createChainsAction(api) }
    },
  }
}
