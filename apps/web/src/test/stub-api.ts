import { ApiError, type ApiClient, type RequestOptions } from '@/lib/api-client'

type Request = { method: string; path: string; body: unknown }
type Handler = (request: Request) => unknown | Promise<unknown>

/**
 * A scripted `ApiClient` for page tests. Routes are keyed `"METHOD /path"` (query string ignored when
 * no key includes it). A value that is not a function is returned as is; an unscripted request is a 404
 * so a stray call is visible. Every request is recorded in `calls`.
 */
export class StubApi {
  readonly calls: Request[] = []
  private readonly handlers = new Map<string, Handler>()

  constructor(routes: Record<string, unknown> = {}) {
    this.on('GET /me', { id: 'user-1', email: 'investor@example.com', displayName: null })
    for (const [key, value] of Object.entries(routes)) this.on(key, value)
  }

  on(route: string, handler: unknown): this {
    this.handlers.set(route, typeof handler === 'function' ? (handler as Handler) : () => handler)
    return this
  }

  /** Requests made to `"METHOD /path"`. */
  callsTo(route: string): Request[] {
    return this.calls.filter((c) => `${c.method} ${c.path}` === route)
  }

  private async handle(method: string, path: string, opts?: RequestOptions): Promise<unknown> {
    const request = { method, path, body: opts?.body }
    this.calls.push(request)
    const handler = this.handlers.get(`${method} ${path}`) ?? this.handlers.get(`${method} ${path.split('?')[0]}`)
    if (!handler) throw new ApiError(404, { code: 'not_found', detail: `no stub for ${method} ${path}` })
    return handler(request)
  }

  client(): ApiClient {
    const call = <T>(method: string) => (path: string, opts?: RequestOptions) => this.handle(method, path, opts) as Promise<T>
    return {
      request: <T>(method: string, path: string, opts?: RequestOptions) => this.handle(method, path, opts) as Promise<T>,
      download: async () => {
        throw new Error('StubApi does not download')
      },
      get: call('GET'),
      post: call('POST'),
      put: call('PUT'),
      patch: call('PATCH'),
      delete: call('DELETE'),
    }
  }
}

/** An API where the user has no stocks and no lists: enough for tests that only need a page to land on. */
export function emptyApi(): StubApi {
  return new StubApi({ 'GET /stocks': { items: [] }, 'GET /lists': { items: [] } })
}
