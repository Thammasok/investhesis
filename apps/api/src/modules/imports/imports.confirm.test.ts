import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, newUserId, type TestApp } from '../../../test/db.ts'
import { F, HEADERS, csv, manyRows } from '../../../test/fixtures/imports/build.ts'
import { filePart, multipart } from '../../../test/multipart.ts'
import { seedList, seedMembership, seedStock } from '../../../test/seed.ts'
import type { ImportRepo } from './imports.service.ts'

let t: TestApp
let app: FastifyInstance

beforeAll(async () => {
  t = await buildTestApp()
  app = t.app
})
afterAll(() => t.cleanup())

const cols = ['ticker', 'market', 'exchange', 'name']
const rowsOf = (...r: string[][]) => csv(cols, r)

type Opts = Record<string, string>
const confirm = (opts: Opts, file: string | Buffer, name = 'h.csv', a: FastifyInstance = app) =>
  a.inject({ method: 'POST', url: '/imports', ...multipart([...Object.entries(opts).map(([n, value]) => ({ name: n, value })), filePart(file, name)]) })

const count = async (sql: string, args: unknown[] = []) => Number((await t.handle.pool.query(sql, args)).rows[0].n)
const snapshot = async (userIds: string[]) => {
  const q = async (sql: string) => (await t.handle.pool.query(sql, [userIds])).rows
  return {
    stocks: await q('select id, market, ticker, name, lens_sources, updated_at from app.stocks where user_id = any($1) order by id'),
    lists: await q('select id, name from app.lists where user_id = any($1) order by id'),
    members: await q('select list_id, stock_id from app.list_stocks where user_id = any($1) order by list_id, stock_id'),
  }
}
const stockOf = async (userId: string, ticker: string, market = 'US') =>
  (await t.handle.pool.query('select * from app.stocks where user_id = $1 and market = $2 and ticker = $3', [userId, market, ticker])).rows[0]
const members = async (listId: string) => (await t.handle.pool.query('select count(*)::int n from app.list_stocks where list_id = $1', [listId])).rows[0].n as number

async function userWith(extra?: Parameters<typeof buildTestApp>[1]) {
  const u = await buildTestApp(newUserId(), extra)
  return u
}

describe('POST /imports', () => {
  it('TC-U-060 skip keeps saved stocks and still adds them to the list', async () => {
    const u = await userWith()
    try {
      const listId = await seedList(u.handle, u.userId, 'L')
      await u.app.inject({ method: 'POST', url: '/stocks', payload: { ticker: 'AAPL', market: 'US', exchange: 'NASDAQ', name: 'Apple', style: 'Value' } })
      const res = await confirm(
        { duplicateMode: 'skip', targetListId: listId },
        csv([...cols, 'style'], [['AAPL', 'US', 'NASDAQ', 'Apple', 'Growth'], ['NVDA', 'US', 'NASDAQ', 'NVIDIA', ''], ['XYZ', 'JP', 'NASDAQ', 'Xyz', '']]),
        'h.csv',
        u.app,
      )
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ created: 1, skipped: 1, updated: 0, failed: 1, addedToList: 2, targetList: { id: listId, name: 'L' } })
      expect((await t.handle.pool.query('select style from app.stocks where user_id = $1 and ticker = $2', [u.userId, 'AAPL'])).rows[0].style).toBe('Value')
    } finally {
      await u.cleanup()
    }
  })

  it('TC-U-061 update overwrites only non-empty cells and marks them manual', async () => {
    const u = await userWith()
    try {
      const listId = await seedList(u.handle, u.userId, 'L')
      await u.app.inject({ method: 'POST', url: '/stocks', payload: { ticker: 'AAPL', market: 'US', exchange: 'NASDAQ', name: 'Apple', gicsSector: 'Information Technology', style: 'Value', moat: 'Brand' } })
      const res = await confirm(
        { duplicateMode: 'update', targetListId: listId },
        csv([...cols, 'sector', 'style', 'moat', 'economic_cycle'], [['AAPL', 'US', 'NASDAQ', 'Apple', '', 'Growth', '', 'Defensive']]),
        'h.csv',
        u.app,
      )
      expect(res.json()).toMatchObject({ updated: 1, created: 0 })
      const row = await stockOf(u.userId, 'AAPL')
      expect(row).toMatchObject({ style: 'Growth', moat: 'Brand', economic_cycle: 'Defensive', gics_sector: 'Information Technology' })
      expect(row.lens_sources).toMatchObject({ style: 'manual', economicCycle: 'manual', moat: 'manual', gicsSector: 'manual' })
    } finally {
      await u.cleanup()
    }
  })

  it('TC-A-140 update merge matrix: multi-value replaces, manual cycle survives, default cycle follows sector, unchanged rows keep updated_at', async () => {
    const u = await userWith()
    try {
      const listId = await seedList(u.handle, u.userId, 'L')
      const post = (p: object) => u.app.inject({ method: 'POST', url: '/stocks', payload: p })
      await post({ ticker: 'NVDA', market: 'US', exchange: 'NASDAQ', name: 'NVIDIA', gicsSector: 'Information Technology', style: 'Value', moat: 'Brand', themes: ['AI', 'EV'], customers: ['B2B'] })
      await post({ ticker: 'AAPL', market: 'US', exchange: 'NASDAQ', name: 'Apple', gicsSector: 'Information Technology', economicCycle: 'Cyclical' })
      const opts = { duplicateMode: 'update', targetListId: listId }
      const h = [...cols, 'sector', 'style', 'moat', 'themes', 'customers', 'economic_cycle']
      await confirm(opts, csv(h, [['NVDA', 'US', 'NASDAQ', 'NVIDIA', '', 'Growth', '', 'Cloud', '', 'Defensive']]), 'h.csv', u.app)
      let nvda = await stockOf(u.userId, 'NVDA')
      expect(nvda).toMatchObject({ style: 'Growth', moat: 'Brand', themes: ['Cloud'], customers: ['B2B'], economic_cycle: 'Defensive' })
      expect(nvda.lens_sources.economicCycle).toBe('manual')

      await confirm(opts, csv(h, [['NVDA', 'US', 'NASDAQ', 'NVIDIA', 'Utilities', '', '', '', '', '']]), 'h.csv', u.app)
      nvda = await stockOf(u.userId, 'NVDA')
      expect(nvda).toMatchObject({ gics_sector: 'Utilities', economic_cycle: 'Defensive' })

      const before = await stockOf(u.userId, 'AAPL')
      const res = await confirm(opts, csv(h, [['AAPL', 'US', 'NASDAQ', 'Apple', 'Energy', '', '', '', '', ''], ['AAPL', 'US', 'NASDAQ', '', '', '', '', '', '', '']]), 'h.csv', u.app)
      expect(res.json()).toMatchObject({ updated: 1, failed: 1 })
      const aapl = await stockOf(u.userId, 'AAPL')
      expect(aapl).toMatchObject({ gics_sector: 'Energy', economic_cycle: 'Cyclical', name: 'Apple', market: 'US', currency: 'USD' })

      const same = await stockOf(u.userId, 'AAPL')
      await confirm(opts, csv(h, [['AAPL', 'US', 'NASDAQ', 'Apple', 'Energy', '', '', '', '', '']]), 'h.csv', u.app)
      expect((await stockOf(u.userId, 'AAPL')).updated_at).toEqual(same.updated_at)
      expect(before.updated_at.getTime()).toBeLessThan(aapl.updated_at.getTime())
    } finally {
      await u.cleanup()
    }
  })

  it('TC-U-062 new list is created with the import and refused if the name exists', async () => {
    const u = await userWith()
    try {
      await seedList(u.handle, u.userId, 'Watching')
      const file = rowsOf(['NVDA', 'US', 'NASDAQ', 'NVIDIA'])
      const ok = await confirm({ duplicateMode: 'skip', newListName: 'Swing study' }, file, 'h.csv', u.app)
      expect(ok.statusCode).toBe(200)
      expect(ok.json().targetList.name).toBe('Swing study')
      const before = await snapshot([u.userId])
      const dup = await confirm({ duplicateMode: 'skip', newListName: 'watching' }, rowsOf(['MSFT', 'US', 'NASDAQ', 'Microsoft']), 'h.csv', u.app)
      expect(dup.statusCode).toBe(409)
      expect(dup.json().code).toBe('list_name_taken')
      expect(await snapshot([u.userId])).toEqual(before)
    } finally {
      await u.cleanup()
    }
  })

  it('TC-U-063 / TC-A-143 a stock saved between preview and confirm becomes a duplicate (both modes)', async () => {
    for (const mode of ['skip', 'update'] as const) {
      const u = await userWith()
      try {
        const file = rowsOf(['NVDA', 'US', 'NASDAQ', 'NVIDIA Corp'], ['AMD', 'US', 'NASDAQ', 'AMD'])
        const pre = await u.app.inject({ method: 'POST', url: '/imports/preview', ...multipart([filePart(file, 'h.csv')]) })
        expect(pre.json().counts.new).toBe(2)
        await seedStock(u.handle, u.userId, 'NVDA')
        const res = await confirm({ duplicateMode: mode, newListName: 'L' }, file, 'h.csv', u.app)
        expect(res.statusCode).toBe(200)
        expect(res.json()).toMatchObject(mode === 'skip' ? { created: 1, skipped: 1, updated: 0 } : { created: 1, updated: 1, skipped: 0 })
        expect(res.json().addedToList).toBe(2)
        expect(await count('select count(*)::int n from app.stocks where user_id = $1 and ticker = $2', [u.userId, 'NVDA'])).toBe(1)
      } finally {
        await u.cleanup()
      }
    }
  })

  it('TC-U-064 all rows invalid is 422 nothing_to_import and creates no list', async () => {
    const res = await confirm({ duplicateMode: 'skip', newListName: 'Temp' }, rowsOf(['A', 'JP', 'X', 'a'], ['B', 'US', 'NYSE', ''], ['C', 'US', 'NYSE', '']), 'h.csv')
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('nothing_to_import')
    expect(await count("select count(*)::int n from app.lists where user_id = $1 and name = 'Temp'", [t.userId])).toBe(0)
  })

  it('TC-U-065 stocks already in the target list are not counted twice', async () => {
    const u = await userWith()
    try {
      const listId = await seedList(u.handle, u.userId, 'L')
      await seedMembership(u.handle, u.userId, listId, await seedStock(u.handle, u.userId, 'AAPL'))
      const res = await confirm({ duplicateMode: 'skip', targetListId: listId }, rowsOf(['AAPL', 'US', 'NASDAQ', 'Apple'], ['MSFT', 'US', 'NASDAQ', 'Microsoft']), 'h.csv', u.app)
      expect(res.json()).toMatchObject({ addedToList: 1, created: 1, skipped: 1 })
      expect(await members(listId)).toBe(2)
    } finally {
      await u.cleanup()
    }
  })

  it('TC-U-066 / TC-A-104 another user target list is 404 and nothing is saved; the same file is all new for the other user', async () => {
    const u = await userWith()
    const v = await userWith()
    try {
      const listId = await seedList(u.handle, u.userId, 'L')
      await seedStock(u.handle, u.userId, 'AAPL')
      const before = await snapshot([u.userId, v.userId])
      const res = await confirm({ duplicateMode: 'skip', targetListId: listId }, F.noBom(), 'h.csv', v.app)
      expect(res.statusCode).toBe(404)
      expect(res.json().code).toBe('not_found')
      expect(await snapshot([u.userId, v.userId])).toEqual(before)

      const mine = await confirm({ duplicateMode: 'update', newListName: 'Mine' }, F.noBom(), 'h.csv', v.app)
      expect(mine.json()).toMatchObject({ created: 3, updated: 0 })
      expect((await stockOf(u.userId, 'AAPL')).name).toBe('AAPL')
    } finally {
      await u.cleanup()
      await v.cleanup()
    }
  })

  it('TC-A-141 validates the options before writing anything', async () => {
    const u = await userWith()
    try {
      const file = rowsOf(['A', 'US', 'NYSE', 'A'])
      const listId = await seedList(u.handle, u.userId, 'L')
      const before = await snapshot([u.userId])
      const cases: [Opts, string][] = [
        [{ newListName: 'X' }, 'duplicateMode'],
        [{ duplicateMode: 'merge', newListName: 'X' }, 'duplicateMode'],
        [{ duplicateMode: 'Skip', newListName: 'X' }, 'duplicateMode'],
        [{ duplicateMode: 'skip', targetListId: listId, newListName: 'X' }, 'targetListId'],
        [{ duplicateMode: 'skip' }, 'targetListId'],
        [{ duplicateMode: 'skip', newListName: '' }, 'newListName'],
        [{ duplicateMode: 'skip', newListName: '   ' }, 'newListName'],
        [{ duplicateMode: 'skip', newListName: 'x'.repeat(61) }, 'newListName'],
        [{ duplicateMode: 'skip', targetListId: 'not-uuid' }, 'targetListId'],
      ]
      for (const [opts, path] of cases) {
        const res = await confirm(opts, file, 'h.csv', u.app)
        expect([JSON.stringify(opts), res.statusCode]).toEqual([JSON.stringify(opts), 400])
        expect(res.json().code).toBe('validation_failed')
        expect(res.json().errors.map((e: { path: string }) => e.path)).toContain(path)
      }
      expect((await confirm({ duplicateMode: 'skip', targetListId: '0192f0a0-0000-7000-8000-0000000000ff' }, file, 'h.csv', u.app)).statusCode).toBe(404)
      expect((await confirm({ duplicateMode: 'skip', newListName: 'x'.repeat(60) }, file, 'h.csv', u.app)).statusCode).toBe(200)
      const noFile = await u.app.inject({ method: 'POST', url: '/imports', ...multipart([{ name: 'duplicateMode', value: 'skip' }, { name: 'newListName', value: 'Y' }]) })
      expect(noFile.statusCode).toBe(400)
      expect(noFile.json().code).toBe('file_missing')
      expect(await count("select count(*)::int n from app.lists where user_id = $1 and name = 'Y'", [u.userId])).toBe(0)
      expect((await snapshot([u.userId])).lists).toHaveLength(before.lists.length + 1)
    } finally {
      await u.cleanup()
    }
  })

  it('TC-A-144 file-level errors on confirm write nothing', async () => {
    const before = await snapshot([t.userId])
    const cases: [Buffer, string, number, string][] = [
      [F.rows1001(), 'a.csv', 422, 'file_too_many_rows'],
      [F.ofSize(1_048_577), 'a.csv', 413, 'file_too_large'],
      [F.headerOnly(), 'a.csv', 422, 'file_empty'],
      [F.reportTxt(), 'a.txt', 415, 'file_unsupported'],
      [F.latin1(), 'a.csv', 415, 'file_unsupported'],
      [Buffer.from('ticker\nA\n'), 'a.csv', 422, 'file_missing_headers'],
    ]
    for (const [file, name, status, code] of cases) {
      const res = await confirm({ duplicateMode: 'skip', newListName: 'Temp' }, file, name)
      expect([res.statusCode, res.json().code]).toEqual([status, code])
    }
    expect(await snapshot([t.userId])).toEqual(before)
  })

  it('TC-A-145 errorRows carry the original cells', async () => {
    const u = await userWith()
    try {
      const file = csv([...cols, 'notes'], [
        ['AAPL', 'US', 'NASDAQ', 'Apple', 'x'],
        ['ptt', 'XX', 'SET', 'บมจ. ปตท.', 'y'],
        ['MSFT', 'US', 'NASDAQ', 'Micro, "soft"', 'z'],
        ['BAD', 'US', 'NYSE', '', 'w'],
      ])
      const res = await confirm({ duplicateMode: 'skip', newListName: 'L' }, file, 'h.csv', u.app)
      const body = res.json()
      expect(body).toMatchObject({ created: 2, failed: 2 })
      expect(body.errorRows).toEqual([
        { rowNumber: 3, cells: { ticker: 'ptt', market: 'XX', exchange: 'SET', name: 'บมจ. ปตท.' }, errors: [expect.objectContaining({ path: 'market' })] },
        { rowNumber: 5, cells: { ticker: 'BAD', market: 'US', exchange: 'NYSE', name: '' }, errors: [expect.objectContaining({ path: 'name' })] },
      ])
      expect(body.created + body.updated + body.skipped + body.failed).toBe(4)
    } finally {
      await u.cleanup()
    }
  })

  it('TC-A-139 stores canonical values with manual sources and a default cycle; formulas are stored as read (NFR-009)', async () => {
    const u = await userWith()
    try {
      const file = csv(HEADERS, [{ ticker: 'nvda', market: 'us', exchange: 'NASDAQ', name: 'NVIDIA', sector: 'Information Technology', style: ' growth ', themes: 'a;B ; a', index_membership: 'S&P 500' }, { ticker: 'F1', market: 'US', exchange: 'NYSE', name: '=SUM(1,2)' }])
      const res = await confirm({ duplicateMode: 'skip', newListName: 'Swing study' }, file, 'h.csv', u.app)
      expect(res.json()).toMatchObject({ created: 2, targetList: { name: 'Swing study' } })
      const row = await stockOf(u.userId, 'NVDA')
      expect(row).toMatchObject({ style: 'Growth', themes: ['a', 'B'], currency: 'USD', economic_cycle: 'Sensitive' })
      expect(row.lens_sources).toEqual({ gicsSector: 'manual', style: 'manual', themes: 'manual', economicCycle: 'default' })
      expect((await stockOf(u.userId, 'F1')).name).toBe('=SUM(1,2)')
      const list = (await u.app.inject({ method: 'GET', url: '/stocks' })).json().items as { ticker: string; listIds: string[] }[]
      expect(list.every((s) => s.listIds.length === 1)).toBe(true)
    } finally {
      await u.cleanup()
    }
  })

  it('TC-A-147 replaying the same confirm is safe', async () => {
    const u = await userWith()
    try {
      const file = F.noBom()
      const first = await confirm({ duplicateMode: 'skip', newListName: 'Once' }, file, 'h.csv', u.app)
      expect(first.json()).toMatchObject({ created: 3 })
      const again = await confirm({ duplicateMode: 'skip', newListName: 'Once' }, file, 'h.csv', u.app)
      expect([again.statusCode, again.json().code]).toEqual([409, 'list_name_taken'])
      const third = await confirm({ duplicateMode: 'skip', targetListId: first.json().targetList.id }, file, 'h.csv', u.app)
      expect(third.json()).toMatchObject({ created: 0, skipped: 3, addedToList: 0 })
      expect(await members(first.json().targetList.id)).toBe(3)
    } finally {
      await u.cleanup()
    }
  })

  it('TC-A-105 the owner comes from the token, not the form', async () => {
    const u = await userWith()
    const v = await userWith()
    try {
      const res = await confirm({ userId: v.userId, duplicateMode: 'skip', newListName: 'L' }, rowsOf(['A', 'US', 'NYSE', 'A']), 'h.csv', u.app)
      expect(res.statusCode).toBe(200)
      expect(await count('select count(*)::int n from app.stocks where user_id = $1', [v.userId])).toBe(0)
      expect(await count('select count(*)::int n from app.stocks where user_id = $1', [u.userId])).toBe(1)
    } finally {
      await u.cleanup()
      await v.cleanup()
    }
  })
})

describe('POST /imports atomicity and speed', () => {
  const faults: [string, (real: ImportRepo) => Partial<ImportRepo>, string][] = [
    [
      'after 500 inserted stocks',
      (real) => {
        let n = 0
        return {
          insertMany: async (db, userId, rows) => {
            const out = await real.insertMany(db, userId, rows)
            n += out.length
            if (n >= 500) throw new Error('boom: secret detail')
            return out
          },
        }
      },
      'skip',
    ],
    ['in the update loop', () => ({ updateStock: async () => { throw new Error('boom: secret detail') } }), 'update'],
    ['at the membership insert', () => ({ addMemberships: async () => { throw new Error('boom: secret detail') } }), 'skip'],
  ]
  it.each(faults)('TC-A-142 / NFR-006 a failure %s leaves stocks, lists and memberships unchanged', async (_name, fault, mode) => {
    const { importRepo } = await import('./imports.service.ts')
    const u = await userWith({ importRepo: fault(importRepo) })
    const clean = await userWith()
    try {
      const listId = await seedList(u.handle, u.userId, 'Watching')
      for (let i = 0; i < 5; i++) await seedMembership(u.handle, u.userId, listId, await seedStock(u.handle, u.userId, `T000${i + 1}`))
      const before = await snapshot([u.userId])
      const res = await confirm({ duplicateMode: mode, newListName: 'Fresh' }, csv(HEADERS, manyRows(1000)), 'h.csv', u.app)
      expect(res.statusCode).toBe(500)
      expect(res.headers['content-type']).toContain('application/problem+json')
      expect(res.body).not.toContain('secret detail')
      expect(await snapshot([u.userId])).toEqual(before)
      const ok = await confirm({ duplicateMode: mode, newListName: 'Fresh' }, csv(HEADERS, manyRows(5)), 'h.csv', clean.app)
      expect(ok.statusCode).toBe(200)
      await clean.cleanup()
    } finally {
      await u.cleanup()
    }
  })

  it('TC-A-146 / NFR-002 confirming the 1,000-row fixture takes under 5 s', async () => {
    const u = await userWith()
    try {
      const file = F.rows1000()
      for (let i = 0; i < 300; i++) if (i % 100 === 0) await u.handle.pool.query(`insert into app.stocks (id, user_id, market, exchange, currency, ticker, name) select gen_random_uuid(), $1, 'US', 'NASDAQ', 'USD', 'T' || lpad(g::text, 4, '0'), 'old' from generate_series($2::int, $3::int) g`, [u.userId, i + 1, i + 100])
      const start = performance.now()
      const res = await confirm({ duplicateMode: 'update', newListName: 'Big' }, file, 'h.csv', u.app)
      const ms = performance.now() - start
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ created: 700, updated: 300, addedToList: 1000 })
      expect(ms).toBeLessThan(5000)
    } finally {
      await u.cleanup()
    }
  })
})

