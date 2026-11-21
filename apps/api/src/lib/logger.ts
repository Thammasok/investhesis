import type { FastifyRequest } from 'fastify'
import type { LoggerOptions } from 'pino'
import type { Config } from '../config/env.ts'

// Holdings are private (brief: shares and cost basis never leave the app), so keep them out of logs too.
const SECRET_KEYS = ['password', 'token', 'accessToken', 'refreshToken', 'shares', 'costBasis']

export const REDACT_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  ...SECRET_KEYS.flatMap((k) => [k, `*.${k}`, `*.*.${k}`]),
]

export function loggerOptions(config: Config): LoggerOptions {
  return {
    level: config.logLevel,
    // Fastify's default req serializer drops the headers; keep them so the redaction below is visible and testable.
    serializers: {
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
