import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, type TestApp } from '../../../test/db.ts'
import { seedStock } from '../../../test/seed.ts'
import * as real from './chains.repository.ts'

let t: TestApp
beforeAll(async () => {
  t = await buildTestApp(undefined, {
    chainsRepo: {
      renameRows: async (db, userId, ids, to) => {
        await real.renameRows(db, userId, ids.slice(0, 1), to)
        throw new Error('boom after the first row')
      },
    },
  })
})
afterAll(() => t.cleanup())

describe('chain rename atomicity', () => {
  it('TC-U-922 a failure during the update rolls everything back', async () => {
    const ids: string[] = []
    for (const tk of ['A922', 'B922', 'C922']) {
      const id = await seedStock(t.handle, t.userId, tk)
      await t.handle.pool.query("update app.stocks set value_chain = 'AI semis', updated_at = '2020-01-01' where id = $1", [id])
      ids.push(id)
    }
    const res = await t.app.inject({ method: 'POST', url: '/chains/rename', payload: { from: 'AI semis', to: 'AI & Semis' } })
    expect(res.statusCode).toBe(500)
    const { rows } = await t.handle.pool.query('select value_chain, updated_at from app.stocks where id = any($1)', [ids])
    expect(rows.map((r) => r.value_chain)).toEqual(['AI semis', 'AI semis', 'AI semis'])
    expect(rows.every((r) => r.updated_at.getFullYear() === 2020)).toBe(true)
  })
})
