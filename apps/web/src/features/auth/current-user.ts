import type { Language } from '@investhesis/domain'
import { useRouteLoaderData } from 'react-router'
import { getLanguage, setLanguage } from '@/i18n/language'
import type { ApiClient } from '@/lib/api-client'
import { APP_ROUTE_ID } from '@/routers/route-ids'
import type { AuthClient } from './auth-client'

/** What the signed-in area knows about the user: the email, shown in the menu and on /account. */
export type CurrentUser = { email: string }
export type AppLoaderData = { user: CurrentUser | null }

type Me = { id: string; email: string; displayName: string | null; language?: Language | null }

/** Remembers for whom the account language was applied, so a re-read of /me never undoes a switch. */
export type AccountLanguageState = { appliedFor?: string }

/**
 * Loader of the `app` route: the user from `GET /me`. The menu is cosmetic, so when the API
 * can't answer it falls back to the session's email instead of failing the whole area. A redirect
 * thrown by the api-client (no session) is not swallowed.
 */
export async function loadCurrentUser(
  apiClient: ApiClient,
  authClient: AuthClient,
  accountLanguage: AccountLanguageState = {},
): Promise<AppLoaderData> {
  try {
    const me = await apiClient.get<Me>('/me')
    // The saved language wins once per user, before the page renders; a null one leaves the browser's choice.
    if ((me?.language === 'en' || me?.language === 'th') && accountLanguage.appliedFor !== me.id) {
      accountLanguage.appliedFor = me.id
      if (me.language !== getLanguage()) await setLanguage(me.language)
    }
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
