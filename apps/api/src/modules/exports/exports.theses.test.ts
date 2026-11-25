import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BackupV2 } from '@investhesis/domain'
import { buildTestApp, newUserId, type TestApp } from '../../../test/db.ts'
import { seedStock } from '../../../test/seed.ts'

let t: TestApp
const U = newUserId()
const V = newUserId()

beforeAll(async () => {
  t = await buildTestApp(U)
})
afterAll(() => t.cleanup())

const entry = (app: { inject: TestApp['app']['inject'] }, stockId: string, date: string, note: string) =>
  app.inject({ method: 'POST', url: `/stocks/${stockId}/theses`, payload: { type: 'review', date, note } })
const backup = async (app: TestApp['app']) => {
  const res = await app.inject({ method: 'GET', url: '/exports/backup.json' })
  expect(res.statusCode).toBe(200)
  return { text: res.payload, body: BackupV2.parse(res.json()) }
}

describe('backup version 2 holds the thesis entries', () => {
  it('TC-U-760 holds every entry, grouped by stock id, newest date first within a stock', async () => {
    const [s1, s2] = [await seedStock(t.handle, U, 'BK1'), await seedStock(t.handle, U, 'BK2')]
    await entry(t.app, s1, '2026-01-01', 'old')
    await entry(t.app, s1, '2026-11-01', 'new')
    await entry(t.app, s2, '2026-05-05', 'other stock')
    const { body } = await backup(t.app)
    expect(body.formatVersion).toBe(2)
    expect(body.theses).toHaveLength(3)
    expect(body.theses.map((e) => e.stockId)).toEqual([...body.theses.map((e) => e.stockId)].sort())
    for (const stockId of [s1, s2]) {
      const dates = body.theses.filter((e) => e.stockId === stockId).map((e) => e.date)
      expect(dates).toEqual([...dates].sort().reverse())
    }
    expect(body.theses.find((e) => e.note === 'new')).toMatchObject({ date: '2026-11-01', targetPrice: null, invalidation: null })
  })

  it("TC-U-761 holds only the caller's entries and no user id key anywhere", async () => {
    const appV = await t.appFor(V)
    const sv = await seedStock(t.handle, V, 'BKV')
    await entry(appV, sv, '2026-02-02', 'v private')
    const mine = await backup(t.app)
    expect(mine.body.theses.map((e) => e.note)).not.toContain('v private')
    expect(mine.text).not.toMatch(/"user_?[iI]d"/)
    expect(mine.text).not.toContain(V)
    const theirs = await backup(appV)
    expect(theirs.body.theses.map((e) => e.note)).toEqual(['v private'])
  })

  it('TC-U-762 a user with stocks and no entries gets an empty list', async () => {
    const lone = newUserId()
    const app = await t.appFor(lone)
    await seedStock(t.handle, lone, 'BKN')
    expect((await backup(app)).body.theses).toEqual([])
  })

  it('TC-U-763 backup.csv is unchanged by entries', async () => {
    const user = newUserId()
    const app = await t.appFor(user)
    const s = await seedStock(t.handle, user, 'BKC')
    const before = (await app.inject({ method: 'GET', url: '/exports/backup.csv' })).payload
    await entry(app, s, '2026-03-03', 'csv must not change')
    const after = (await app.inject({ method: 'GET', url: '/exports/backup.csv' })).payload
    expect(after).toBe(before)
    expect(after).not.toContain('csv must not change')
  })
})
