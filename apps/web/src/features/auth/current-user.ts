import { useRouteLoaderData } from 'react-router'
import type { ApiClient } from '@/lib/api-client'
import { APP_ROUTE_ID } from '@/routers/route-ids'
import type { AuthClient } from './auth-client'

/** What the signed-in area knows about the user: the email, shown in the menu and on /account. */
export type CurrentUser = { email: string }
export type AppLoaderData = { user: CurrentUser | null }

type Me = { id: string; email: string; displayName: string | null }

/**
 * Loader of the `app` route: the user from `GET /me`. The menu is cosmetic, so when the API
 * can't answer it falls back to the session's email instead of failing the whole area. A redirect
 * thrown by the api-client (no session) is not swallowed.
 */
export async function loadCurrentUser(apiClient: ApiClient, authClient: AuthClient): Promise<AppLoaderData> {
  try {
    const me = await apiClient.get<Me>('/me')
    if (typeof me?.email === 'string' && me.email) return { user: { email: me.email } }
  } catch (error) {
    if (error instanceof Response) throw error
  }
  const session = await authClient.getSession().catch(() => null)
  return { user: session?.user.email ? { email: session.user.email } : null }
}

export function useCurrentUser(): CurrentUser | null {
  const data = useRouteLoaderData(APP_ROUTE_ID) as AppLoaderData | undefined
  return data?.user ?? null
}
