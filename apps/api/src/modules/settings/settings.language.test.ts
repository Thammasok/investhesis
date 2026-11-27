import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, newUserId, type TestApp } from '../../../test/db.ts'

let t: TestApp
beforeAll(async () => {
  t = await buildTestApp()
})
afterAll(() => t.cleanup())

const patch = (a: FastifyInstance, payload: object) => a.inject({ method: 'PATCH', url: '/settings', payload })
const rows = async (id: string) =>
  Number((await t.handle.pool.query('select count(*) n from app.user_settings where user_id = $1', [id])).rows[0].n)

describe('PATCH /settings language', () => {
  it('TC-U-1013 an invalid language is a 400 with rule and params and creates no row', async () => {
    const u = newUserId()
    const res = await patch(await t.appFor(u), { language: 'fr' })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({
      code: 'validation_failed',
      errors: [{ path: 'language', message: 'must be one of: en, th', rule: 'oneOf', params: { values: ['en', 'th'] } }],
    })
    expect(await rows(u)).toBe(0)
  })

  it('TC-U-1014 an empty patch still creates no row', async () => {
    const u = newUserId()
    const res = await patch(await t.appFor(u), {})
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null, language: null })
    expect(await rows(u)).toBe(0)
  })

  it('TC-U-1012 a language-only patch creates the row and keeps the defaults', async () => {
    const u = newUserId()
    const res = await patch(await t.appFor(u), { language: 'en' })
    expect(res.json()).toMatchObject({ language: 'en', concentrationThreshold: 40, usdThbRate: null })
    expect(await rows(u)).toBe(1)
  })
})
