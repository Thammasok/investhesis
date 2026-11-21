import { createContext, useContext } from 'react'
import type { AuthClient } from './auth-client'

export const AuthClientContext = createContext<AuthClient | null>(null)

export function useAuthClient(): AuthClient {
  const client = useContext(AuthClientContext)
  if (!client) throw new Error('useAuthClient needs an AuthClientProvider')
  return client
}
