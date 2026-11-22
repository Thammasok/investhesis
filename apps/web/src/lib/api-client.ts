import { redirect } from 'react-router'
import type { AuthClient } from '@/features/auth/auth-client'
import { signInLocation } from '@/features/auth/guards'

export type FieldProblem = { path: string; message: string; code?: string }

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

/**
 * A failed API call. `code`, `detail`, `errors` and `existingStockId` come from an RFC 7807 body;
 * `body` keeps whatever was parsed. A request that never reached the API has status 0 and code
 * `network_error`.
 */
export class ApiError extends Error {
  readonly status: number
  readonly body: unknown
  readonly code: string
  readonly detail: string | undefined
  readonly errors: FieldProblem[]
  readonly existingStockId: string | undefined
  constructor(status: number, body: unknown, code?: string) {
    const b = asRecord(body)
    super(typeof b.detail === 'string' ? b.detail : `API request failed with ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
    this.code = code ?? (typeof b.code === 'string' ? b.code : `http_${status}`)
    this.detail = typeof b.detail === 'string' ? b.detail : undefined
    this.errors = Array.isArray(b.errors) ? (b.errors as FieldProblem[]) : []
    this.existingStockId = typeof b.existingStockId === 'string' ? b.existingStockId : undefined
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
  /** The `accept` header; JSON unless a download asks otherwise. */
  accept?: string
}

export type DownloadedFile = { blob: Blob; filename: string }

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
    const headers: Record<string, string> = { accept: opts.accept ?? 'application/json', ...opts.headers }
    if (contentType) headers['content-type'] = contentType
    if (token) headers.authorization = `Bearer ${token}`
    try {
      return await doFetch(`${baseUrl}${path}`, { method, headers, body })
    } catch {
      throw new ApiError(0, undefined, 'network_error')
    }
  }

  /** Sends with the bearer token and, on a 401, one refresh and retry; returns the raw response. */
  async function exchange(method: string, path: string, opts: RequestOptions): Promise<Response> {
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
    return response
  }

  async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const response = await exchange(method, path, opts)
    if (response.status === 204) return undefined as T
    const data = await parse(response)
    if (!response.ok) throw new ApiError(response.status, data)
    return data as T
  }

  /** Fetches a file with the bearer token (a plain link cannot send it) for saving in the browser. */
  async function download(path: string, opts: RequestOptions = {}): Promise<DownloadedFile> {
    const response = await exchange('GET', path, { ...opts, accept: opts.accept ?? '*/*' })
    if (!response.ok) throw new ApiError(response.status, await parse(response))
    const named = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(response.headers.get('content-disposition') ?? '')
    const filename = named ? decodeURIComponent(named[1]) : (path.split('/').pop() ?? 'download')
    return { blob: await response.blob(), filename }
  }

  return {
    request,
    download,
    get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts),
    post: <T>(path: string, opts?: RequestOptions) => request<T>('POST', path, opts),
    put: <T>(path: string, opts?: RequestOptions) => request<T>('PUT', path, opts),
    patch: <T>(path: string, opts?: RequestOptions) => request<T>('PATCH', path, opts),
    delete: <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, opts),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
