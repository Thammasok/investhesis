import type { RouteObject } from 'react-router'
import type { ApiClient } from '@/lib/api-client'
import type { RouteHandle } from '@/routers/route-handle'

/**
 * `/import-export` is the page; `/import-export/import` opens the wizard as a dialog over it. The
 * dialog needs the api client for the wizard's own calls, so its route closes over it.
 */
export function importExportRoute(api: ApiClient): RouteObject {
  return {
    path: 'import-export',
    handle: { crumb: 'nav.importExport' } satisfies RouteHandle,
    lazy: async () => ({ Component: (await import('@/views/import-export')).createImportExportPage(api) }),
    children: [
      {
        path: 'import',
        handle: { crumb: 'nav.import' } satisfies RouteHandle,
        lazy: async () => {
          const [{ createImportLoader }, { createImportDialog }] = await Promise.all([import('./imports-data'), import('@/views/import-dialog')])
          return { Component: createImportDialog(api), loader: createImportLoader(api) }
        },
      },
    ],
  }
}
