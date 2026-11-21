import { redirect, type LoaderFunction, type MiddlewareFunction, type DataRouter } from 'react-router'
import type { AuthClient } from './auth-client'
import { DEFAULT_NEXT } from './safe-next'

export const SIGN_IN_PATH = '/auth/sign-in'

/** Router state the sign-in page reads to explain why the visitor is there. */
export type SignInState = { reason?: 'session_ended' }

export function signInLocation(currentPath: string): string {
  return `${SIGN_IN_PATH}?next=${encodeURIComponent(currentPath)}`
}

/**
 * `requireSession` is route middleware on the `app` route, not its loader: React Router runs
 * matched loaders in parallel, so a parent loader could not stop a child loader from calling the
 * API first (FR-008). `getSession()` refreshes an expired token before pages render.
 */
export function createGuards(authClient: AuthClient) {
  const requireSession: MiddlewareFunction = async ({ request }) => {
    if (authClient.mode === 'mock') return
    if (await authClient.getSession()) return
    const url = new URL(request.url)
    throw redirect(signInLocation(url.pathname + url.search))
  }

  const redirectIfSignedIn: LoaderFunction = async () => {
    if (authClient.mode === 'mock') return null
    if (await authClient.getSession()) throw redirect(DEFAULT_NEXT)
    return null
  }

  return { requireSession, redirectIfSignedIn }
}

/** Sends the visitor to sign-in, remembering the page they were on, with the session-ended notice. */
export function sessionEndedHandler(router: Pick<DataRouter, 'navigate'>) {
  return (currentPath: string) =>
    router.navigate(signInLocation(currentPath), { replace: true, state: { reason: 'session_ended' } satisfies SignInState })
}

/**
 * Follows auth changes made elsewhere (another tab signing out, a failed refresh): a
 * `SIGNED_OUT` on a signed-in page leads to sign-in. Returns the unsubscribe function.
 */
export function watchAuth(router: Pick<DataRouter, 'navigate' | 'state'>, authClient: AuthClient): () => void {
  const endSession = sessionEndedHandler(router)
  return authClient.onChange((event) => {
    if (event !== 'SIGNED_OUT') return
    const { pathname, search } = router.state.location
    if (pathname === '/auth' || pathname.startsWith('/auth/')) return
    void endSession(pathname + search)
  })
}
