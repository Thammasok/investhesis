import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { BackupV2 } from '@investhesis/domain'
import { buildTestApp, newUserId, type TestApp } from '../../../test/db.ts'
import { seedList, seedMembership, seedStock } from '../../../test/seed.ts'

// The membership read is the second one inside the backup's snapshot. This stands in for another request
// that commits a new stock and its membership between the two reads: a consistent snapshot must not show it
// in the lists and leave it out of the stocks.
const midway = vi.hoisted(() => ({ run: undefined as undefined | (() => Promise<void>) }))
vi.mock('../lists/lists.repository.ts', async (original) => {
  const real = await original<typeof import('../lists/lists.repository.ts')>()
  return {
    ...real,
    listMembershipsForUser: async (...args: Parameters<typeof real.listMembershipsForUser>) => {
      await midway.run?.()
      return real.listMembershipsForUser(...args)
    },
  }
})

let t: TestApp
beforeAll(async () => {
  t = await buildTestApp()
})
afterAll(() => t.cleanup())

describe('backup snapshot', () => {
  it('TC-A-508 a stock and membership committed mid-export appear in neither the stocks nor the lists', async () => {
    const user = newUserId()
    const app = await t.appFor(user)
    const a = await seedStock(t.handle, user, 'SNAP1')
    const b = await seedStock(t.handle, user, 'SNAP2')
    const list = await seedList(t.handle, user, 'Snap list')
    await seedMembership(t.handle, user, list, a)
    await seedMembership(t.handle, user, list, b)

    let late = ''
    midway.run = async () => {
      midway.run = undefined // once
      late = await seedStock(t.handle, user, 'LATE')
      await seedMembership(t.handle, user, list, late)
    }
    const res = await app.inject({ method: 'GET', url: '/exports/backup.json' })
    expect(res.statusCode).toBe(200)
    const body = BackupV2.parse(res.json())
    const stockIds = new Set(body.stocks.map((s) => s.id))
    expect(late).not.toBe('')
    for (const l of body.lists) for (const id of l.stockIds) expect(stockIds.has(id), `${id} is in a list but not in the stocks`).toBe(true)
    expect(body.stocks.map((s) => s.ticker).sort()).toEqual(['SNAP1', 'SNAP2'])
    expect(body.lists[0]?.stockIds.sort()).toEqual([a, b].sort())

    // The next export sees it.
    const next = BackupV2.parse((await app.inject({ method: 'GET', url: '/exports/backup.json' })).json())
    expect(next.stocks.map((s) => s.ticker)).toContain('LATE')
  })

  it('TC-A-508 a thesis entry committed mid-export is in the next backup, not this one', async () => {
    const user = newUserId()
    const app = await t.appFor(user)
    const stockId = await seedStock(t.handle, user, 'SNAP3')
    midway.run = async () => {
      midway.run = undefined
      await t.handle.pool.query(
        "insert into app.theses (user_id, stock_id, type, entry_date, note) values ($1, $2, 'buy', '2026-01-10', 'late entry')",
        [user, stockId],
      )
    }
    const body = BackupV2.parse((await app.inject({ method: 'GET', url: '/exports/backup.json' })).json())
    expect(body.theses).toEqual([])
    const next = BackupV2.parse((await app.inject({ method: 'GET', url: '/exports/backup.json' })).json())
    expect(next.theses.map((e) => e.note)).toEqual(['late entry'])
  })
})
