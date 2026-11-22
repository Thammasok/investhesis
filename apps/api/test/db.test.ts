import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { uuidv7 } from '../src/lib/ids.ts'
import { buildTestApp, newUserId, type TestApp } from './db.ts'

describe('buildTestApp', () => {
  let t: TestApp
  const other = newUserId()
  beforeAll(async () => {
    t = await buildTestApp()
  })
  afterAll(async () => {
    if (t) await t.cleanup()
  })

  it('TC-U-008 acts as the chosen user against the real database and cleans up its rows', async () => {
    expect((await t.app.inject('/me')).json().id).toBe(t.userId)
    expect((await (await t.appFor(other)).inject('/me')).json().id).toBe(other)
    expect((await t.app.inject('/ready')).statusCode).toBe(200)

    await t.handle.pool.query(
      "insert into app.lists (id, user_id, name) values ($1,$2,'A'), ($3,$4,'A')",
      [uuidv7(), t.userId, uuidv7(), other],
    )
    await t.cleanup()
    const probe = (await import('../src/db/client.ts')).createDb({ databaseUrl: (await import('./db.ts')).testDatabaseUrl, dbPoolMax: 1 })
    const { rows } = await probe.pool.query('select count(*) n from app.lists where user_id = any($1)', [[t.userId, other]])
    await probe.close()
    expect(Number(rows[0].n)).toBe(0)
    // afterAll calls cleanup again on a closed pool; neutralise it
    t.cleanup = async () => {}
  })
})
