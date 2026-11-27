import type { ReactNode } from 'react'
import type { ApiClient } from './api-client'
import { ApiClientContext } from './api-client-context'

/** Gives components outside loaders and actions (the language save) the same client the routes use. */
export function ApiClientProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  return <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>
}
