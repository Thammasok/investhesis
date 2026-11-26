import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { movedAfter2020, readRows, renameVia, seedChain, snapshotOf } from '../../../test/chains.ts'
import { buildApp } from '../../app.ts'
import { loadConfig } from '../../config/env.ts'
import { createDb } from '../../db/client.ts'
import { baseEnv } from '../../../test/env.ts'
import { buildTestApp, newUserId, testDatabaseUrl, type TestApp } from '../../../test/db.ts'
import * as real from './chains.repository.ts'

const fault = { mode: 'none' as 'none' | 'after6' }
let t: TestApp
beforeAll(async () => {
  t = await buildTestApp(undefined, {
    chainsRepo: {
      renameRows: async (db, userId, ids, to) => {
        if (fault.mode === 'after6') {
          await real.renameRows(db, userId, ids.slice(0, 6), to)
          throw new Error('boom after the sixth row')
        }
        await real.renameRows(db, userId, ids, to)
      },
    },
  })
})
afterAll(() => t.cleanup())

describe('chain rename is all or nothing', () => {
  it('TC-A-918 a failure after the sixth row leaves every row as it was, and a clean retry succeeds', async () => {
    const userId = newUserId()
    const app = await t.appFor(userId)
    const ids: string[] = []
    for (let i = 0; i < 4; i++) ids.push(await seedChain(t.handle, userId, `F${i}`, 'AI semis', { sources: { moat: 'manual' } }))
    for (let i = 0; i < 7; i++) ids.push(await seedChain(t.handle, userId, `G${i}`, 'AI & Semis', { sources: { moat: 'manual' } }))
    const before = await snapshotOf(t.handle, userId)

    fault.mode = 'after6'
    const failed = await renameVia(app, { from: 'AI semis', to: 'ai & semis', merge: true })
    fault.mode = 'none'

    expect(failed.statusCode).toBe(500)
    expect(failed.json().code).toBe('internal')
    expect(failed.payload).not.toMatch(/AI|semis|boom/i)
    expect(await snapshotOf(t.handle, userId)).toEqual(before)
    const ok = await renameVia(app, { from: 'AI semis', to: 'ai & semis', merge: true })
    expect(ok.json()).toMatchObject({ changed: 11, merged: true })
    expect((await readRows(t.handle, ids)).every(movedAfter2020)).toBe(true)
  })

  it('TC-A-918 a backend killed before the commit leaves every row as it was', async () => {
    const config = loadConfig({ ...baseEnv, DATABASE_URL: testDatabaseUrl })
    const handle = createDb(config)
    const userId = newUserId()
    const app = await buildApp({
      config,
      db: { ping: handle.ping, db: handle.db },
      resolveIdentity: async () => ({ userId, email: undefined, displayName: undefined }),
      logStream: { write() {} },
      chainsRepo: {
        renameRows: async (db, uid, rowIds, to) => {
          await real.renameRows(db, uid, rowIds, to)
          // Kill this transaction's own backend from a second connection, so the commit cannot happen.
          const pid = ((await db.execute(sql`select pg_backend_pid() as pid`)) as unknown as { rows: { pid: number }[] }).rows[0]?.pid
          await t.handle.pool.query('select pg_terminate_backend($1)', [pid])
          await new Promise((r) => setTimeout(r, 100))
        },
      },
    })
    const ids: string[] = []
    for (let i = 0; i < 5; i++) ids.push(await seedChain(t.handle, userId, `K${i}`, 'Banks'))
    const before = await snapshotOf(t.handle, userId)

    const res = await renameVia(app, { from: 'Banks', to: 'Lenders' })

    expect(res.statusCode).toBeGreaterThanOrEqual(500)
    expect(await snapshotOf(t.handle, userId)).toEqual(before)
    await t.handle.pool.query('delete from app.stocks where user_id = $1', [userId])
    await app.close()
    await handle.close()
  })
})
