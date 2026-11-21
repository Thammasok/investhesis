import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.ts'
import { loadConfig } from '../config/env.ts'
import { baseEnv } from '../../test/env.ts'

let app: FastifyInstance
afterEach(() => app.close())

const quiet = { write() {} }

describe('health, ready and openapi', () => {
  it('GET /health is ok', async () => {
    app = await buildApp({ config: loadConfig(baseEnv), logStream: quiet })
    const res = await app.inject('/health')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })

  it('GET /ready is ready when the db answers', async () => {
    app = await buildApp({
      config: loadConfig(baseEnv),
      db: { ping: async () => {} },
      logStream: quiet,
    })
    const res = await app.inject('/ready')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ready' })
  })

  it('readiness reports DB failure', async () => {
    app = await buildApp({
      config: loadConfig(baseEnv),
      db: { ping: () => Promise.reject(new Error('down')) },
      logStream: quiet,
    })
    const res = await app.inject('/ready')
    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({ status: 'not_ready', reason: 'db' })
  })

  it('GET /openapi.json is an OpenAPI 3.1 document', async () => {
    app = await buildApp({ config: loadConfig(baseEnv), logStream: quiet })
    const res = await app.inject('/openapi.json')
    expect(res.statusCode).toBe(200)
    const doc = res.json()
    expect(doc.openapi).toMatch(/^3\.1/)
    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(['/health', '/ready']))
  })
})
