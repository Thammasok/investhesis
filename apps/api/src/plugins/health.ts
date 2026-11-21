import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import fp from 'fastify-plugin'
import { z } from 'zod'

export type DbHealth = { ping(): Promise<unknown> }

const PING_TIMEOUT_MS = 1000

async function pingWithTimeout(db: DbHealth): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      db.ping(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('db ping timeout')), PING_TIMEOUT_MS)
      }),
    ])
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export const healthPlugin = fp<{ db?: DbHealth | undefined }>(
  async (app, { db }) => {
    const r = app.withTypeProvider<ZodTypeProvider>()

    r.get(
      '/health',
      {
        schema: {
          tags: ['ops'],
          response: { 200: z.object({ status: z.literal('ok') }) },
        },
      },
      async () => ({ status: 'ok' as const }),
    )

    r.get(
      '/ready',
      {
        schema: {
          tags: ['ops'],
          response: {
            200: z.object({ status: z.literal('ready') }),
            503: z.object({
              status: z.literal('not_ready'),
              reason: z.enum(['db', 'shutting_down']),
            }),
          },
        },
      },
      async (_req, reply) => {
        if (app.shuttingDown) {
          return reply.code(503).send({ status: 'not_ready', reason: 'shutting_down' })
        }
        if (db && !(await pingWithTimeout(db))) {
          return reply.code(503).send({ status: 'not_ready', reason: 'db' })
        }
        return { status: 'ready' as const }
      },
    )
  },
  { name: 'health' },
)
