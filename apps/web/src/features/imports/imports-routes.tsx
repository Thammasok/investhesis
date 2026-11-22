import type { RouteObject } from 'react-router'
import type { ApiClient } from '@/lib/api-client'
import type { RouteHandle } from '@/routers/route-handle'

/** `/import-export`; the view needs the api client for the wizard's own calls, so the route closes over it. */
export function importExportRoute(api: ApiClient): RouteObject {
  return {
    path: 'import-export',
    handle: { crumb: 'Import / export' } satisfies RouteHandle,
    lazy: async () => {
      const [{ createImportLoader }, { createImportExportPage }] = await Promise.all([import('./imports-data'), import('@/views/import-export')])
      return { Component: createImportExportPage(api), loader: createImportLoader(api) }
    },
  }
}
