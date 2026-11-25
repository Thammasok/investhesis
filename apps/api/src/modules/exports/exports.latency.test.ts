import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BackupV2 } from '@investhesis/domain'
import { uuidv7 } from '../../lib/ids.ts'
import { buildTestApp, type TestApp } from '../../../test/db.ts'

let t: TestApp
beforeAll(async () => {
  t = await buildTestApp()
})
afterAll(() => t.cleanup())

const percentile = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.ceil((p / 100) * xs.length) - 1] ?? Infinity

describe('NFR-002 backup latency against local Supabase', () => {
  it('TC-A-510 p95 of the JSON and CSV backup with 1,000 held stocks and 20 lists is within 2 s', async () => {
    // Arrange: bulk rows straight into the tables
    const { pool } = t.handle
    const stockIds: string[] = []
    for (let i = 0; i < 1000; i++) stockIds.push(uuidv7())
    await pool.query(
      `insert into app.stocks (id, user_id, market, exchange, currency, ticker, name, themes)
       select id, $2, case when i % 2 = 0 then 'TH' else 'US' end, case when i % 2 = 0 then 'SET' else 'NASDAQ' end,
              case when i % 2 = 0 then 'THB' else 'USD' end, 'T' || i, 'Stock ' || i, array['a','b','c']
         from unnest($1::uuid[]) with ordinality as s(id, i)`,
      [stockIds, t.userId],
    )
    await pool.query(
      `insert into app.holdings (stock_id, user_id, shares, average_cost, cost_currency)
       select s.id, s.user_id, 10, 20, s.currency from app.stocks s where s.user_id = $1`,
      [t.userId],
    )
    const listIds: string[] = []
    for (let l = 0; l < 20; l++) {
      const id = uuidv7()
      listIds.push(id)
      await pool.query('insert into app.lists (id, user_id, name) values ($1, $2, $3)', [id, t.userId, `List ${l}`])
      await pool.query(
        'insert into app.list_stocks (list_id, stock_id, user_id) select $1, unnest($2::uuid[]), $3',
        [id, stockIds.slice(l * 50, l * 50 + 50), t.userId],
      )
    }

    // Act: check the shape once, then time 20 requests per route after a warm-up
    const first = await t.app.inject({ method: 'GET', url: '/exports/backup.json' })
    const backup = BackupV2.parse(first.json())
    expect(backup.stocks).toHaveLength(1000)
    expect(backup.lists).toHaveLength(20)
    expect(backup.lists[0]?.stockIds).toHaveLength(50)
    const firstCsv = await t.app.inject({ method: 'GET', url: '/exports/backup.csv' })
    expect(firstCsv.payload.split('\r\n').filter(Boolean)).toHaveLength(1001)

    const timings: Record<string, number[]> = { json: [], csv: [] }
    const record = (kind: string, ms: number) => (timings[kind] ??= []).push(ms)
    for (const kind of ['json', 'csv'] as const) {
      for (let i = 0; i < 20; i++) {
        const start = performance.now()
        const res = await t.app.inject({ method: 'GET', url: `/exports/backup.${kind}` })
        record(kind, performance.now() - start)
        expect(res.statusCode).toBe(200)
      }
    }

    // Assert
    for (const [kind, xs] of Object.entries(timings)) {
      console.log(`NFR-002 backup.${kind}: min ${Math.min(...xs).toFixed(1)} ms, median ${percentile(xs, 50).toFixed(1)} ms, p95 ${percentile(xs, 95).toFixed(1)} ms, max ${Math.max(...xs).toFixed(1)} ms`)
      expect(percentile(xs, 95)).toBeLessThan(2000)
    }
  }, 120_000)
})
