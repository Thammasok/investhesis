import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.ts'
import { loadConfig } from '../config/env.ts'
import { baseEnv } from '../../test/env.ts'

let app: FastifyInstance
afterEach(() => app.close())

async function get(requestId: string) {
  app = await buildApp({ config: loadConfig(baseEnv), logStream: { write() {} } })
  return app.inject({ method: 'GET', url: '/health', headers: { 'x-request-id': requestId } })
}

describe('request id', () => {
  it('honours a valid incoming id', async () => {
    const res = await get('abc-123')
    expect(res.headers['x-request-id']).toBe('abc-123')
  })

  it('replaces an invalid id with a UUIDv7', async () => {
    const res = await get('<script>')
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/)
  })
})
