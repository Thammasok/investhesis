import type { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { uuidv7 } from '../lib/ids.ts'
import { createDb, type DbHandle } from './client.ts'
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

type Stock = { user?: string; market?: string; exchange?: string; currency?: string; ticker?: string }
async function insertStock(s: Stock = {}): Promise<string> {
  const id = uuidv7()
  await pool.query(
    'insert into app.stocks (id, user_id, market, exchange, currency, ticker, name) values ($1,$2,$3,$4,$5,$6,$7)',
    [id, s.user ?? U, s.market ?? 'US', s.exchange ?? 'NASDAQ', s.currency ?? 'USD', s.ticker ?? 'T' + id.slice(-8).toUpperCase(), 'name'],
  )
  return id
}
async function insertList(user: string, name: string): Promise<string> {
  const id = uuidv7()
  await pool.query('insert into app.lists (id, user_id, name) values ($1,$2,$3)', [id, user, name])
  return id
}
const member = (list: string, stock: string, user: string) =>
  pool.query('insert into app.list_stocks (list_id, stock_id, user_id) values ($1,$2,$3)', [list, stock, user])

const failure = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as { code?: string; constraint?: string }
  }
  throw new Error('expected the statement to fail')
}
const count = async (sql: string, args: unknown[]) => Number((await pool.query(sql, args)).rows[0].n)

describe('app schema constraints', () => {
  it('TC-U-001 refuses an exchange from the other market', async () => {
    const e = await failure(insertStock({ market: 'TH', exchange: 'NYSE', currency: 'THB', ticker: 'PTT' }))
    expect(e.code).toBe('23514')
    expect(e.constraint).toBe('stocks_exchange_market')
  })

  it('TC-U-002 refuses a repeated market and ticker for one user but not for two users', async () => {
    await insertStock({ ticker: 'AAPL' })
    const e = await failure(insertStock({ ticker: 'AAPL' }))
    expect(e.code).toBe('23505')
    expect(e.constraint).toBe('stocks_user_market_ticker')
    await expect(insertStock({ user: V, ticker: 'AAPL' })).resolves.toBeTypeOf('string')
  })

  it('TC-U-003 compares list names ignoring case', async () => {
    await insertList(U, 'Core holdings')
    const e = await failure(insertList(U, 'core HOLDINGS'))
    expect(e.code).toBe('23505')
    expect(e.constraint).toBe('lists_user_name_ci')
    await expect(insertList(V, 'core HOLDINGS')).resolves.toBeTypeOf('string')
  })

  it("TC-U-004 refuses to join one user's list to another user's stock", async () => {
    const list = await insertList(U, 'Isolation list')
    const stock = await insertStock({ user: V })
    const e = await failure(member(list, stock, U))
    expect(e.code).toBe('23503')
  })

  it('TC-U-005 deleting a stock or a list cascades only memberships', async () => {
    const list = await insertList(U, 'Cascade a')
    const stock = await insertStock()
    await member(list, stock, U)
    await pool.query('delete from app.stocks where id = $1', [stock])
    expect(await count('select count(*) n from app.list_stocks where list_id = $1', [list])).toBe(0)

    const list2 = await insertList(U, 'Cascade b')
    const stock2 = await insertStock()
    await member(list2, stock2, U)
    await pool.query('delete from app.lists where id = $1', [list2])
    expect(await count('select count(*) n from app.list_stocks where stock_id = $1', [stock2])).toBe(0)
    expect(await count('select count(*) n from app.stocks where id = $1', [stock2])).toBe(1)
  })

  it('TC-U-007 anon and authenticated cannot read any app table', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const table of ['stocks', 'lists', 'list_stocks']) {
        const client = await pool.connect()
        try {
          await client.query('begin')
          await client.query(`set local role ${role}`)
          const e = await failure(client.query(`select 1 from app.${table}`))
          expect(e.code, `${role} on ${table}`).toBe('42501')
        } finally {
          await client.query('rollback')
          client.release()
        }
      }
    }
  })
})
