import type { ReactNode } from 'react'
import type { AuthClient } from './auth-client'
import { AuthClientContext } from './auth-client-context'

/** Gives the pages under it the app's `AuthClient` (lazy route components take no props). */
export function AuthClientProvider({ client, children }: { client: AuthClient; children: ReactNode }) {
  return <AuthClientContext.Provider value={client}>{children}</AuthClientContext.Provider>
}
