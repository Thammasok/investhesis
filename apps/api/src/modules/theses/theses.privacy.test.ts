import { Writable } from 'node:stream'
import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../../config/env.ts'
import { loggerOptions, REDACT_PATHS } from '../../lib/logger.ts'
import { baseEnv } from '../../../test/env.ts'
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

describe('thesis text in log lines', () => {
  it('TC-A-738 the logger redacts note, invalidation and targetPrice at depths 0 to 2', () => {
    const lines: string[] = []
    const stream = new Writable({ write: (chunk, _enc, done) => (lines.push(String(chunk)), done()) })
    const logger = pino({ ...loggerOptions(loadConfig({ ...baseEnv })), level: 'info' }, stream)
    const secret = 'SENTINEL-738'
    logger.info({ note: secret })
    logger.info({ x: { invalidation: secret } })
    logger.info({ x: { y: { targetPrice: secret } } })
    logger.info({ entry: { note: secret } })
    expect(lines).toHaveLength(4)
    for (const line of lines) {
      expect(line).not.toContain(secret)
      expect(line).toContain('[redacted]')
    }
    for (const key of ['note', 'invalidation', 'targetPrice']) {
      expect(REDACT_PATHS).toEqual(expect.arrayContaining([key, `*.${key}`, `*.*.${key}`]))
    }
  })

  it('TC-A-740 a check violation and a unique violation log the code and constraint only, never the row', async () => {
    const sentinels = ['SENTINEL-NOTE-740', 'SENTINEL-INV-740', '987654.3210']
    const s = await seedStock(t.handle, t.userId, 'P740')
    const body = { type: 'buy', date: '2026-01-10', note: sentinels[0], invalidation: sentinels[1], targetPrice: sentinels[2] }
    const post = (url: string, payload: unknown) => t.app.inject({ method: 'POST', url, payload: payload as object })
    logs.length = 0

    const created = await post(`/stocks/${s}/theses`, body)
    const deleted = await t.app.inject({ method: 'DELETE', url: `/stocks/${s}/theses/${created.json().id}` })
    const restored = await post(`/stocks/${s}/theses/restore`, { entry: deleted.json() })
    const duplicate = await post(`/stocks/${s}/theses/restore`, { entry: deleted.json() })
    force.on = true
    const violated = await post(`/stocks/${s}/theses`, body)
    force.on = false

    expect([restored.statusCode, duplicate.statusCode, violated.statusCode]).toEqual([201, 409, 500])
    expect(duplicate.json().code).toBe('thesis_exists')
    for (const res of [duplicate, violated]) {
      expect(res.payload).not.toMatch(/SENTINEL|987654|Failing row|Key \(/)
    }
    const text = logs.join('\n')
    for (const sentinel of sentinels) expect(text).not.toContain(sentinel)
    expect(text).not.toMatch(/Failing row|Key \(id\)|"where"|"detail":"Failing/)
    const database = logs.map((l) => JSON.parse(l)).find((l) => l.err?.type === 'DatabaseError')
    expect(database?.err).toMatchObject({ code: '23514' })
    expect(typeof database?.err.constraint).toBe('string')
    expect(database?.err).not.toHaveProperty('detail')
    expect(database?.err).not.toHaveProperty('where')
  })
})
