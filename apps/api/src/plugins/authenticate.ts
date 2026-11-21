import type { FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import type { Config } from '../config/env.ts'
import { AppError } from '../lib/app-error.ts'

export type Identity = Readonly<{ userId: string; email: string | undefined; displayName: string | undefined }>

/**
 * Turns a request into the user it acts for. v1 has one implementation, the mock user from env;
 * real auth (e.g. Supabase Auth JWT verification) replaces it without touching routes or services.
 */
export type IdentityResolver = (req: FastifyRequest) => Promise<Identity>

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the authenticate hook on every non-public route. */
    identity: Identity | undefined
  }
}

/** Paths that need no user. Matched on the path alone, so a wrong method still reaches the 404 handler. */
export const PUBLIC_PATHS: ReadonlySet<string> = new Set(['/health', '/ready', '/openapi.json'])

export function mockIdentityResolver(user: NonNullable<Config['mockUser']>): IdentityResolver {
  const identity: Identity = Object.freeze({ userId: user.id, email: user.email, displayName: user.displayName })
  return async () => identity
}

export function identityResolverFor(config: Config): IdentityResolver {
  if (config.authMode === 'mock' && config.mockUser) return mockIdentityResolver(config.mockUser)
  throw new Error(`no identity resolver for AUTH_MODE=${config.authMode}`)
}

/** The current user; throws 401 if the route is reached without one (a public route calling it is a bug). */
export function requireIdentity(req: FastifyRequest): Identity {
  if (!req.identity) throw new AppError({ status: 401, code: 'unauthenticated' })
  return req.identity
}

const pathOf = (req: FastifyRequest) => {
  const url = req.raw.url ?? ''
  const q = url.indexOf('?')
  return q < 0 ? url : url.slice(0, q)
}

export const authenticatePlugin = fp<{ resolve: IdentityResolver }>(
  async (app, { resolve }) => {
    app.decorateRequest('identity', undefined)
    app.addHook('onRequest', async (req) => {
      if (req.method === 'OPTIONS' || PUBLIC_PATHS.has(pathOf(req))) return
      req.identity = await resolve(req)
    })
  },
  { name: 'authenticate' },
)
