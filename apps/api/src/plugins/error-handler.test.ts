import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { buildApp } from '../app.ts'
import { AppError } from '../lib/app-error.ts'
import { loadConfig } from '../config/env.ts'
import { baseEnv } from '../../test/env.ts'

let app: FastifyInstance
afterEach(() => app.close())

async function appWithRoutes() {
  app = await buildApp({ config: loadConfig(baseEnv), logStream: { write() {} } })
  app.get('/boom', () => {
    throw new Error('db exploded')
  })
  app.get('/teapot', () => {
    throw new AppError({ status: 409, code: 'email_taken', detail: 'taken' })
  })
  app.withTypeProvider<ZodTypeProvider>().post(
    '/echo',
    { schema: { body: z.object({ email: z.email() }) } },
    (req) => req.body,
  )
  await app.ready()
  return app
}

describe('error handler', () => {
  it('unknown error becomes problem+json internal', async () => {
    const res = await (await appWithRoutes()).inject('/boom')
    expect(res.statusCode).toBe(500)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json().code).toBe('internal')
    expect(res.body).not.toContain('db exploded')
  })

  it('validation error lists fields', async () => {
    const res = await (await appWithRoutes()).inject({
      method: 'POST',
      url: '/echo',
      payload: { email: 'nope' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.headers['content-type']).toContain('application/problem+json')
    const body = res.json()
    expect(body.code).toBe('validation_failed')
    expect(body.errors[0].path).toBe('email')
  })

  it('maps AppError to its status and code', async () => {
    const res = await (await appWithRoutes()).inject('/teapot')
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ status: 409, code: 'email_taken', detail: 'taken' })
  })

  it('answers unknown routes with problem+json not_found', async () => {
    const res = await (await appWithRoutes()).inject('/nope')
    expect(res.statusCode).toBe(404)
    expect(res.json().code).toBe('not_found')
  })
})
