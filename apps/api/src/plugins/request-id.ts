import type { IncomingMessage } from 'node:http'
import fp from 'fastify-plugin'
import { uuidv7 } from '../lib/ids.ts'

const VALID = /^[A-Za-z0-9._-]{1,128}$/

export function genReqId(req: IncomingMessage): string {
  const incoming = req.headers['x-request-id']
  return typeof incoming === 'string' && VALID.test(incoming) ? incoming : uuidv7()
}

export const requestIdPlugin = fp(
  async (app) => {
    app.addHook('onSend', async (req, reply) => {
      reply.header('x-request-id', req.id)
    })
  },
  { name: 'request-id' },
)
