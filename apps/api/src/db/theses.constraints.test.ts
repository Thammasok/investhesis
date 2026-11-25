import { eq } from 'drizzle-orm'
import type { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { uuidv7 } from '../lib/ids.ts'
import { createDb, type DbHandle } from './client.ts'
import { theses } from './schema/index.ts'
import { deleteUserRows, newUserId, testDatabaseUrl } from '../../test/db.ts'

let handle: DbHandle
let pool: Pool
const U = newUserId()
const V = newUserId()

beforeAll(() => {
  handle = createDb({ databaseUrl: testDatabaseUrl, dbPoolMax: 2 })
  pool = handle.pool
})
afterAll(async () => {
  await deleteUserRows(handle, U, V)
  await handle.close()
})

async function insertStock(user = U): Promise<string> {
  const id = uuidv7()
  await pool.query(
    "insert into app.stocks (id, user_id, market, exchange, currency, ticker, name) values ($1,$2,'US','NASDAQ','USD',$3,'name')",
    [id, user, 'T' + id.slice(-8).toUpperCase()],
  )
  return id
}

type Entry = { type?: string; date?: string; note?: string; target?: string | null; invalidation?: string | null }
const insertThesis = (stock: string, user: string, e: Entry = {}) =>
  pool.query(
    'insert into app.theses (user_id, stock_id, type, entry_date, note, target_price, invalidation) values ($1,$2,$3,$4,$5,$6,$7)',
    [user, stock, e.type ?? 'buy', e.date ?? '2026-11-20', e.note ?? 'a note', e.target ?? null, e.invalidation ?? null],
  )

const failure = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as { code?: string }
  }
  throw new Error('expected the statement to fail')
}

describe('theses schema constraints', () => {
  it('TC-U-720 entries go with their stock', async () => {
    const s = await insertStock()
    await insertThesis(s, U)
    await insertThesis(s, U, { type: 'review' })
    await pool.query('delete from app.stocks where id = $1', [s])
    const { rows } = await pool.query('select count(*)::int as n from app.theses where stock_id = $1', [s])
    expect(rows[0].n).toBe(0)
  })

  it("TC-U-721 an entry cannot point at another user's stock", async () => {
    const s = await insertStock()
    expect((await failure(insertThesis(s, V))).code).toBe('23503')
  })

  it('TC-U-722 database checks guard the fields', async () => {
    const s = await insertStock()
    const bad: Entry[] = [
      { type: 'hold' },
      { note: '' },
      { note: 'a'.repeat(10001) },
      { target: '0' },
      { invalidation: '' },
    ]
    for (const entry of bad) expect((await failure(insertThesis(s, U, entry))).code).toBe('23514')
    await insertThesis(s, U, { note: 'a'.repeat(10000), invalidation: 'b'.repeat(2000), target: '0.0001' })
  })

  it('TC-U-723 date and numeric come back as strings', async () => {
    const s = await insertStock()
    await insertThesis(s, U, { date: '2024-02-29', target: '180.5' })
    const [row] = await handle.db.select().from(theses).where(eq(theses.stockId, s))
    expect(row?.entryDate).toBe('2024-02-29')
    expect(row?.targetPrice).toBe('180.5000')
    expect(row?.invalidation).toBeNull()
  })
})
