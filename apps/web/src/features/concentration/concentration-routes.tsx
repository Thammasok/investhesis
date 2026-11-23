import type { RouteObject } from 'react-router'
import type { ApiClient } from '@/lib/api-client'
import type { RouteHandle } from '@/routers/route-handle'

/** `/concentration`: the loader and action are attached in `lazy`, so the page is its own chunk (ADR-008). */
export function concentrationRoute(api: ApiClient): RouteObject {
  return {
    path: 'concentration',
    handle: { crumb: 'Concentration' } satisfies RouteHandle,
    // Scope, lens and measure live in the address, but regrouping is local (NFR-001): only a save
    // (a form submission) or arriving on the page reads the API again.
    shouldRevalidate: ({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }) =>
      formMethod || currentUrl.pathname !== nextUrl.pathname ? defaultShouldRevalidate : false,
    lazy: async () => {
      const [{ createConcentrationLoader, createConcentrationAction }, view] = await Promise.all([
        import('./concentration-data'),
        import('@/views/concentration'),
      ])
      return { Component: view.Component, loader: createConcentrationLoader(api), action: createConcentrationAction(api) }
    },
  }
}
