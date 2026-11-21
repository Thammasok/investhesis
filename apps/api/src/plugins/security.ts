import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import fp from 'fastify-plugin'
import type { Config } from '../config/env.ts'

export const securityPlugin = fp<{ config: Config }>(
  async (app, { config }) => {
    await app.register(helmet)
    await app.register(cors, {
      origin: [...config.corsOrigins],
      credentials: true,
      exposedHeaders: ['x-request-id', 'retry-after'],
    })
    // Every API response is per-user (holdings, notes), so no shared cache may keep it.
    app.addHook('onSend', async (_req, reply) => {
      if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store')
    })
  },
  { name: 'security' },
)
