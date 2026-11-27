import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../../app.ts'
import { loadConfig } from '../../config/env.ts'
import { baseEnv } from '../../../test/env.ts'
import { buildTestApp, newUserId, type TestApp } from '../../../test/db.ts'
import * as meRepo from './me.repository.ts'

vi.mock('./me.repository.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('./me.repository.ts')>()
  return { ...original, findLanguage: vi.fn<typeof original.findLanguage>(original.findLanguage) }
})

let t: TestApp
let app: FastifyInstance
const logs: string[] = []

beforeAll(async () => {
  t = await buildTestApp()
  app = t.app
})
afterAll(() => t.cleanup())

const me = (a: FastifyInstance = app) => a.inject({ method: 'GET', url: '/me' })
const patch = (payload: object, a: FastifyInstance = app) => a.inject({ method: 'PATCH', url: '/settings', payload })

describe('GET /me language', () => {
  it('TC-U-1011 returns null language for a user with no settings row', async () => {
    const res = await me(await t.appFor(newUserId()))
    expect(res.statusCode).toBe(200)
    expect(res.json().language).toBeNull()
  })

  it('TC-U-1012 PATCH /settings saves the language and /me and /settings return it', async () => {
    const a = await t.appFor(newUserId())
    const saved = await patch({ language: 'th' }, a)
    expect(saved.statusCode).toBe(200)
    expect(saved.json().language).toBe('th')
    expect((await me(a)).json().language).toBe('th')
    const settings = (await a.inject({ method: 'GET', url: '/settings' })).json()
    expect(settings).toMatchObject({ language: 'th', concentrationThreshold: 40 })
  })

  it('TC-U-1015 the language belongs to one user only', async () => {
    const [a, b] = [await t.appFor(newUserId()), await t.appFor(newUserId())]
    await patch({ language: 'th' }, a)
    expect((await me(b)).json().language).toBeNull()
  })

  it('TC-U-1016 /me survives a settings read failure and logs one warning without the error text', async () => {
    const quiet = await buildApp({
      config: loadConfig({ ...baseEnv, LOG_LEVEL: 'warn' }),
      db: { ping: t.handle.ping, db: t.handle.db },
      logStream: { write: (line: string) => void logs.push(line) },
    })
    vi.mocked(meRepo.findLanguage).mockRejectedValueOnce(new Error('boom'))
    const res = await me(quiet)
    await quiet.close()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ email: 'investor@example.com', language: null })
    expect(typeof res.json().id).toBe('string')
    const warns = logs.map((l) => JSON.parse(l)).filter((l) => l.level === 40)
    expect(warns).toHaveLength(1)
    expect(logs.join('')).not.toContain('boom')
  })
})
