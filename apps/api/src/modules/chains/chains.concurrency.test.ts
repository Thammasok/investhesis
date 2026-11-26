import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { renameVia, seedChain } from '../../../test/chains.ts'
import { buildTestApp, newUserId, type TestApp } from '../../../test/db.ts'

let t: TestApp
beforeAll(async () => {
  t = await buildTestApp()
})
afterAll(() => t.cleanup())

describe('chain rename under concurrent requests', () => {
  it('TC-A-916 two renames of one chain race: one wins with all rows, the other finds no chain', async () => {
    for (let round = 0; round < 20; round++) {
      const userId = newUserId()
      const app = await t.appFor(userId)
      const ids: string[] = []
      for (let i = 0; i < 10; i++) ids.push(await seedChain(t.handle, userId, `R${i}`, 'Alpha'))

      const [a, b] = await Promise.all([renameVia(app, { from: 'Alpha', to: 'Beta' }), renameVia(app, { from: 'Alpha', to: 'Gamma' })])

      const statuses = [a.statusCode, b.statusCode].sort()
      expect(statuses, `round ${round}`).toEqual([200, 404])
      const winner = a.statusCode === 200 ? a : b
      expect(winner.json().changed).toBe(10)
      expect([a, b].find((r) => r.statusCode === 404)?.json().code).toBe('chain_not_found')
      const names = (await t.handle.pool.query('select distinct value_chain from app.stocks where id = any($1)', [ids])).rows.map((r) => r.value_chain)
      expect(names, `round ${round}`).toEqual([winner.json().name])
    }
  }, 60_000)

  it('TC-A-917 opposite merges at the same time never deadlock and leave one name', async () => {
    const failures: string[] = []
    for (let round = 0; round < 30; round++) {
      const userId = newUserId()
      const app = await t.appFor(userId)
      const ids: string[] = []
      for (let i = 0; i < 5; i++) ids.push(await seedChain(t.handle, userId, `L${i}`, 'Left'), await seedChain(t.handle, userId, `H${i}`, 'Right'))
      for (let i = 0; i < 50; i++) await seedChain(t.handle, userId, `X${i}`, i % 2 ? `Other ${i}` : null)

      const [a, b] = await Promise.all([renameVia(app, { from: 'Left', to: 'Right', merge: true }), renameVia(app, { from: 'Right', to: 'Left', merge: true })])

      const bad = [a, b].filter((r) => r.statusCode >= 500 || /deadlock/i.test(r.payload))
      if (bad.length > 0) failures.push(`round ${round}: ${bad.map((r) => r.statusCode).join(',')}`)
      expect([a.statusCode, b.statusCode].every((s) => s === 200 || s === 404), `round ${round}`).toBe(true)
      expect([a, b].some((r) => r.statusCode === 200 && r.json().merged === true), `round ${round}`).toBe(true)
      const names = (await t.handle.pool.query('select distinct value_chain from app.stocks where id = any($1)', [ids])).rows.map((r) => r.value_chain)
      expect(names, `round ${round}`).toHaveLength(1)
    }
    expect(failures).toEqual([])
  }, 60_000)
})
