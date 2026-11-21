import { redirect } from 'react-router'
import type { AuthClient } from '@/features/auth/auth-client'
import { signInLocation } from '@/features/auth/guards'

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(status: number, body: unknown) {
    super(`API request failed with ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export type ApiClientOptions = {
  authClient: AuthClient
  /** Called with the current path when the session is over (a second 401). Navigates to sign-in. */
  onSessionEnded: (currentPath: string) => void | Promise<void>
  baseUrl?: string
  fetch?: typeof fetch
  getCurrentPath?: () => string
}

export type RequestOptions = {
  /** A plain object (sent as JSON), a JSON string or `FormData`. Never a stream: a 401 retry re-sends it. */
  body?: unknown
  headers?: Record<string, string>
}

function encodeBody(body: unknown): { body?: BodyInit; contentType?: string } {
  if (body === undefined) return {}
  if (body instanceof FormData || typeof body === 'string') return { body }
  if (body instanceof ReadableStream) throw new TypeError('api-client request bodies must be re-sendable, not streams')
  return { body: JSON.stringify(body), contentType: 'application/json' }
}

async function parse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Fetch wrapper for the API: adds the bearer token, makes no request without a session (supabase
 * mode), and on a 401 refreshes once and retries; a second 401 signs out and leads to sign-in.
 */
export function createApiClient(options: ApiClientOptions) {
  const { authClient, onSessionEnded } = options
  const baseUrl = options.baseUrl ?? '/api'
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const currentPath = options.getCurrentPath ?? (() => window.location.pathname + window.location.search)

  async function send(method: string, path: string, opts: RequestOptions, token: string | null) {
    const { body, contentType } = encodeBody(opts.body)
    const headers: Record<string, string> = { accept: 'application/json', ...opts.headers }
    if (contentType) headers['content-type'] = contentType
    if (token) headers.authorization = `Bearer ${token}`
    return doFetch(`${baseUrl}${path}`, { method, headers, body })
  }

  async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    let token: string | null = null
    if (authClient.mode === 'supabase') {
      token = await authClient.getAccessToken()
      if (!token) throw redirect(signInLocation(currentPath()))
    }

    let response = await send(method, path, opts, token)
    if (response.status === 401 && authClient.mode === 'supabase') {
      const refreshed = await authClient.refresh()
      if (refreshed) response = await send(method, path, opts, refreshed.accessToken)
      if (!refreshed || response.status === 401) {
        const from = currentPath()
        await authClient.signOut()
        await onSessionEnded(from)
        throw new ApiError(401, await parse(response))
      }
    }

    const data = await parse(response)
    if (!response.ok) throw new ApiError(response.status, data)
    return data as T
  }

  return {
    request,
    get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts),
    post: <T>(path: string, opts?: RequestOptions) => request<T>('POST', path, opts),
    put: <T>(path: string, opts?: RequestOptions) => request<T>('PUT', path, opts),
    patch: <T>(path: string, opts?: RequestOptions) => request<T>('PATCH', path, opts),
    delete: <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, opts),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
