import { replace, type LoaderFunction } from 'react-router'
import { toast } from 'sonner'
import type { AuthClient } from './auth-client'
import { safeNext } from './safe-next'

export const LINK_EXPIRED_PATH = '/auth/link-expired'

/** Which email the link came from; `unknown` when the URL does not say (or says something else). */
export type LinkType = 'email' | 'recovery' | 'unknown'

export type LinkExpiredState = { type: LinkType }
export type ConfirmFailure = { expired: LinkType }
export type LinkExpiredData = { signedIn: boolean }
export type ResetPasswordData = { email: string | null }

export function readLinkType(raw: unknown): LinkType {
  return raw === 'email' || raw === 'recovery' ? raw : 'unknown'
}

/**
 * Loaders for the pages the emailed links open. `/auth/confirm` verifies in its loader and then
 * redirects with `replace`, so the `token_hash` URL never stays in history and is never rendered
 * (NFR-004). A redirect cannot carry router state, so failures return data and the route's
 * component forwards it to Link expired.
 */
export function createAuthLoaders(authClient: AuthClient) {
  const confirm: LoaderFunction = async ({ request }): Promise<Response | ConfirmFailure> => {
    const params = new URL(request.url).searchParams
    const type = readLinkType(params.get('type'))
    const tokenHash = params.get('token_hash')
    if (!tokenHash || type === 'unknown') return { expired: type }

    const result = await authClient.verifyEmailLink(tokenHash, type)
    if (!result.ok) return { expired: type }

    if (type === 'recovery') return replace('/auth/reset-password')
    toast.success('Email confirmed. Welcome to Investhesis.')
    return replace(safeNext(params.get('next')))
  }

  const linkExpired: LoaderFunction = async (): Promise<LinkExpiredData> => ({
    signedIn: (await authClient.getSession()) !== null,
  })

  const resetPassword: LoaderFunction = async (): Promise<ResetPasswordData> => ({
    email: (await authClient.getSession())?.user.email ?? null,
  })

  return { confirm, linkExpired, resetPassword }
}
