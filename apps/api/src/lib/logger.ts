import type { FastifyRequest } from 'fastify'
import { stdSerializers, type LoggerOptions } from 'pino'
import type { Config } from '../config/env.ts'

// Holdings are private (brief: shares and cost basis never leave the app), so keep them out of logs too.
const SECRET_KEYS = ['password', 'token', 'accessToken', 'refreshToken', 'shares', 'averageCost', 'usdThbRate', 'holding']

export const REDACT_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  ...SECRET_KEYS.flatMap((k) => [k, `*.${k}`, `*.*.${k}`]),
]

/**
 * A Postgres error's `detail` ("Failing row contains (...)") and Drizzle's wrapper message (which lists the query
 * parameters) carry row values, so a database error is logged as its code, constraint, table and message only.
 */
function serializeError(err: unknown) {
  const pg = [err, (err as { cause?: unknown } | null)?.cause].find((e) => typeof (e as { code?: unknown } | null)?.code === 'string' && typeof (e as { severity?: unknown }).severity === 'string') as
    | { code: string; constraint?: string; table?: string; message: string }
    | undefined
  if (!pg) return stdSerializers.err(err as Error)
  return { type: 'DatabaseError', message: pg.message, code: pg.code, constraint: pg.constraint, table: pg.table }
}

export function loggerOptions(config: Config): LoggerOptions {
  return {
    level: config.logLevel,
    // Fastify's default req serializer drops the headers; keep them so the redaction below is visible and testable.
    serializers: {
      err: serializeError,
      req: (req: FastifyRequest) => ({
        method: req.method,
        url: req.url,
        host: req.host,
        remoteAddress: req.ip,
        headers: req.headers,
      }),
    },
    redact: { paths: [...REDACT_PATHS], censor: '[redacted]' },
    ...(config.env === 'development' && { transport: { target: 'pino-pretty' } }),
  }
}
