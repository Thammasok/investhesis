import type { InjectOptions } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, type TestApp } from '../../../test/db.ts'
import { seedStock } from '../../../test/seed.ts'

let t: TestApp
beforeAll(async () => {
  t = await buildTestApp()
})
afterAll(() => t.cleanup())

const percentile = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.ceil((p / 100) * xs.length) - 1] ?? Infinity

describe('NFR-001 thesis latency against local Supabase', () => {
  it('TC-U-749 p95 of POST, PATCH, DELETE and GET (200 entries of 2,000 chars) is under 500 ms', async () => {
    const s = await seedStock(t.handle, t.userId, 'TLLAT')
    const note = 'n'.repeat(2000)
    const times: Record<string, number[]> = { POST: [], PATCH: [], DELETE: [], GET: [] }
    const record = (kind: string, ms: number) => (times[kind] ??= []).push(ms)
    const run = async (kind: string, req: InjectOptions) => {
      const start = performance.now()
      const res = await t.app.inject(req)
      record(kind, performance.now() - start)
      expect(res.statusCode).toBeLessThan(400)
      return res
    }
    const ids: string[] = []
    for (let i = 0; i < 200; i++) {
      const res = await run('POST', { method: 'POST', url: `/stocks/${s}/theses`, payload: { type: 'review', date: '2026-01-10', note, invalidation: note } })
      ids.push(res.json().id)
    }
    for (let i = 0; i < 50; i++) await run('PATCH', { method: 'PATCH', url: `/stocks/${s}/theses/${ids[i]}`, payload: { note: `${i}${note}` } })
    for (let i = 0; i < 50; i++) await run('GET', { method: 'GET', url: `/stocks/${s}/theses` })
    for (let i = 0; i < 50; i++) await run('DELETE', { method: 'DELETE', url: `/stocks/${s}/theses/${ids[i]}` })
    for (const [label, xs] of Object.entries(times)) {
      console.log(`NFR-001 thesis ${label}: median ${percentile(xs, 50).toFixed(1)} ms, p95 ${percentile(xs, 95).toFixed(1)} ms, max ${Math.max(...xs).toFixed(1)} ms`)
      expect(percentile(xs, 95)).toBeLessThan(500)
    }
  })
})
