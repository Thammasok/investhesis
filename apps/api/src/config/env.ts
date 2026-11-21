import { z } from 'zod'

export class ConfigError extends Error {
  readonly issues: readonly { path: string; message: string }[]

  constructor(issues: readonly { path: string; message: string }[]) {
    super(`Invalid configuration:\n${issues.map((i) => `  - ${i.path}: ${i.message}`).join('\n')}`)
    this.name = 'ConfigError'
    this.issues = issues
  }
}

const int = (fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z
    .string()
    .regex(/^\d+$/, 'must be a non-negative integer')
    .transform(Number)
    .pipe(z.number().min(min).max(max))
    .default(fallback)

const bool = (fallback: boolean) =>
  z
    .enum(['true', 'false'], { error: 'must be "true" or "false"' })
    .transform((v) => v === 'true')
    .default(fallback)

// An empty value in a .env file means "unset".
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional())

const origin = z.url().refine((v) => new URL(v).origin === v, 'must be an origin without a path')

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    PORT: int(3000, 1, 65535),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_URL: z.string().min(1).pipe(z.url({ protocol: /^postgres(ql)?$/ })),
    DB_POOL_MAX: int(10, 1, 200),
    PUBLIC_WEB_ORIGIN: origin,
    CORS_ORIGINS: z.string().optional(),
    AUTH_MODE: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['mock', 'supabase']).default('supabase')),
    SUPABASE_URL: optional(z.url({ protocol: /^https?$/ })),
    MOCK_USER_ID: optional(z.uuid({ error: 'must be a UUID' })),
    MOCK_USER_EMAIL: optional(z.email()),
    MOCK_USER_NAME: optional(z.string().min(1)),
    SHUTDOWN_DRAIN_DELAY_MS: int(0),
    SHUTDOWN_TIMEOUT_MS: int(10_000, 1),
    TRUST_PROXY: bool(false),
  })
  .superRefine((env, ctx) => {
    const need = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
    if (env.AUTH_MODE === 'mock') {
      if (!env.MOCK_USER_ID) need('MOCK_USER_ID', 'is required when AUTH_MODE=mock')
      if (env.NODE_ENV === 'production') need('AUTH_MODE', '"mock" is not allowed in production')
    } else if (!env.SUPABASE_URL) {
      need('SUPABASE_URL', 'is required when AUTH_MODE=supabase')
    }
  })

export type MockUser = Readonly<{ id: string; email: string | undefined; displayName: string | undefined }>

export type SupabaseAuthConfig = Readonly<{ issuer: string; jwksUrl: string; audience: string }>

export type Config = Readonly<{
  env: 'development' | 'test' | 'production'
  port: number
  logLevel: string
  databaseUrl: string
  dbPoolMax: number
  publicWebOrigin: string
  corsOrigins: readonly string[]
  authMode: 'mock' | 'supabase'
  /** Set when authMode is `mock`: every request runs as this user. */
  mockUser: MockUser | undefined
  /** Set when authMode is `supabase`: how access tokens are verified. */
  supabaseAuth: SupabaseAuthConfig | undefined
  shutdownDrainDelayMs: number
  shutdownTimeoutMs: number
  trustProxy: boolean
}>

function supabaseAuthConfig(url: string): SupabaseAuthConfig {
  const issuer = `${url.replace(/\/+$/, '')}/auth/v1`
  return Object.freeze({ issuer, jwksUrl: `${issuer}/.well-known/jwks.json`, audience: 'authenticated' })
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message })),
    )
  }
  const e = parsed.data
  return Object.freeze({
    env: e.NODE_ENV,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    databaseUrl: e.DATABASE_URL,
    dbPoolMax: e.DB_POOL_MAX,
    publicWebOrigin: e.PUBLIC_WEB_ORIGIN,
    corsOrigins: Object.freeze(
      e.CORS_ORIGINS
        ? e.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
        : [e.PUBLIC_WEB_ORIGIN],
    ),
    authMode: e.AUTH_MODE,
    mockUser:
      e.AUTH_MODE === 'mock' && e.MOCK_USER_ID
        ? Object.freeze({ id: e.MOCK_USER_ID.toLowerCase(), email: e.MOCK_USER_EMAIL, displayName: e.MOCK_USER_NAME })
        : undefined,
    supabaseAuth: e.AUTH_MODE === 'supabase' && e.SUPABASE_URL ? supabaseAuthConfig(e.SUPABASE_URL) : undefined,
    shutdownDrainDelayMs: e.SHUTDOWN_DRAIN_DELAY_MS,
    shutdownTimeoutMs: e.SHUTDOWN_TIMEOUT_MS,
    trustProxy: e.TRUST_PROXY,
  })
}
