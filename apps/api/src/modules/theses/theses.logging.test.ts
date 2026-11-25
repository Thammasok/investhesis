import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildTestApp, type TestApp } from '../../../test/db.ts'
import { seedStock } from '../../../test/seed.ts'

// The one place a check violation can be forced: the repository writes a type the table refuses.
const force = vi.hoisted(() => ({ on: false }))
vi.mock('./theses.repository.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('./theses.repository.ts')>()
  return { ...real, insertThesis: (db: never, userId: string, row: Record<string, unknown>) => real.insertThesis(db, userId, force.on ? ({ ...row, type: 'hold' } as never) : (row as never)) }
})

const logs: string[] = []
let t: TestApp
beforeAll(async () => {
  t = await buildTestApp(undefined, { logStream: { write: (line: string) => void logs.push(line) } })
})
afterAll(() => t.cleanup())

describe('thesis privacy in logs', () => {
  it('TC-U-748 no private text reaches a log line', async () => {
    const sentinels = ['SENTINEL-NOTE', 'SENTINEL-INV', '987654.3210']
    const s = await seedStock(t.handle, t.userId, 'TL748')
    const body = { type: 'buy', date: '2026-01-10', note: sentinels[0], invalidation: sentinels[1], targetPrice: sentinels[2] }
    const call = (method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
      t.app.inject({ method, url, ...(payload !== undefined && { payload: payload as object }) })
    logs.length = 0

    const created = await call('POST', `/stocks/${s}/theses`, body)
    const patched = await call('PATCH', `/stocks/${s}/theses/${created.json().id}`, { note: `${sentinels[0]} edited` })
    const deleted = await call('DELETE', `/stocks/${s}/theses/${created.json().id}`)
    const restored = await call('POST', `/stocks/${s}/theses/restore`, { entry: deleted.json() })
    const refused = await call('POST', `/stocks/${s}/theses`, { ...body, targetPrice: '1.23456' })
    force.on = true
    const violated = await call('POST', `/stocks/${s}/theses`, body)
    force.on = false

    expect([created, patched, deleted, restored, refused, violated].map((r) => r.statusCode)).toEqual([201, 200, 200, 201, 400, 500])
    const text = logs.join('\n')
    for (const sentinel of sentinels) expect(text).not.toContain(sentinel)
    expect(violated.payload).not.toMatch(/SENTINEL|987654/)
    expect(logs.filter((l) => l.includes('"statusCode"')).length).toBeGreaterThanOrEqual(6)
    expect(text).toContain('23514')
  })
})
