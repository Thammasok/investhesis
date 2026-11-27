import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, type TestApp } from '../../../test/db.ts'

let t: TestApp
let app: FastifyInstance
beforeAll(async () => {
  t = await buildTestApp()
  app = t.app
})
afterAll(() => t.cleanup())

const post = (payload: object) => app.inject({ method: 'POST', url: '/stocks', payload })

describe('problem bodies carry rule ids', () => {
  it('TC-U-1017 stock validation errors carry rule and params next to the unchanged message', async () => {
    const res = await post({ market: 'TH', ticker: 'PTT', name: 'PTT', exchange: 'NYSE' })
    expect(res.statusCode).toBe(400)
    expect(res.json().errors).toContainEqual({
      path: 'exchange',
      message: 'must be SET or mai for market TH',
      rule: 'exchangeForMarket',
      params: { market: 'TH', allowed: ['SET', 'mai'] },
    })
  })

  it('TC-U-1018 a Zod error with no domain rule reports rule invalid and no params', async () => {
    // A string where a list belongs has no domain rule (a number ticker is the domain's own `required`).
    const res = await post({ market: 'US', ticker: 'RULE2', name: 'X', exchange: 'NYSE', indexMembership: 'S&P 500' })
    expect(res.statusCode).toBe(400)
    const error = res.json().errors.find((e: { path: string }) => e.path === 'indexMembership')
    expect(error.rule).toBe('invalid')
    expect(error).not.toHaveProperty('params')
  })

  it('TC-U-1017 a service-level patch error carries its rule too', async () => {
    const created = await post({ market: 'US', ticker: 'RULE1', name: 'Rule One', exchange: 'NYSE' })
    const res = await app.inject({ method: 'PATCH', url: `/stocks/${created.json().id}`, payload: { exchange: 'SET' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().errors).toContainEqual(
      expect.objectContaining({ path: 'exchange', rule: 'exchangeForMarket', params: { market: 'US', allowed: expect.any(Array) } }),
    )
  })
})
