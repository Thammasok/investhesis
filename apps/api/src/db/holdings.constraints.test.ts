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

async function insertStock(user = U): Promise<string> {
  const id = uuidv7()
  await pool.query(
    "insert into app.stocks (id, user_id, market, exchange, currency, ticker, name) values ($1,$2,'US','NASDAQ','USD',$3,'name')",
    [id, user, 'T' + id.slice(-8).toUpperCase()],
  )
  return id
}
const insertHolding = (stock: string, user: string, h: { shares?: string | null; cost?: string | null; currency?: string } = {}) =>
  pool.query('insert into app.holdings (stock_id, user_id, shares, average_cost, cost_currency) values ($1,$2,$3,$4,$5)', [
    stock,
    user,
    h.shares === undefined ? '10' : h.shares,
    h.cost === undefined ? '1.5' : h.cost,
    h.currency ?? 'USD',
  ])
const insertSettings = (user: string, t: number | null, rate: string | null) =>
  pool.query('insert into app.user_settings (user_id, concentration_threshold, usd_thb_rate) values ($1, coalesce($2, 40), $3)', [user, t, rate])

const failure = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as { code?: string }
  }
  throw new Error('expected the statement to fail')
}

describe('holdings schema constraints', () => {
  it('TC-U-400 a holding belongs to its stock and goes with it', async () => {
    const s = await insertStock()
    await insertHolding(s, U)
    await pool.query('delete from app.stocks where id = $1', [s])
    const { rows } = await pool.query('select count(*)::int as n from app.holdings where stock_id = $1', [s])
    expect(rows[0].n).toBe(0)
  })

  it('TC-U-401 a holding cannot point at another user\'s stock', async () => {
    const s = await insertStock()
    expect((await failure(insertHolding(s, V))).code).toBe('23503')
  })

  it('TC-U-402 database checks guard the amounts', async () => {
    const codes = [
      (await failure(insertHolding(await insertStock(), U, { shares: '0' }))).code,
      (await failure(insertHolding(await insertStock(), U, { cost: '-1' }))).code,
      (await failure(insertHolding(await insertStock(), U, { currency: 'EUR' }))).code,
    ]
    expect(codes).toEqual(['23514', '23514', '23514'])
  })

  it('TC-U-402 held with unknown amounts is allowed', async () => {
    await expect(insertHolding(await insertStock(), U, { shares: null, cost: null })).resolves.toBeDefined()
  })

  it('TC-U-403 settings bounds', async () => {
    const codes = [
      (await failure(insertSettings(U, 0, null))).code,
      (await failure(insertSettings(U, 101, null))).code,
      (await failure(insertSettings(U, null, '0'))).code,
    ]
    expect(codes).toEqual(['23514', '23514', '23514'])
    await expect(insertSettings(U, 100, '36.250000')).resolves.toBeDefined()
    const { rows } = await pool.query('select concentration_threshold t, usd_thb_rate r from app.user_settings where user_id = $1', [U])
    expect(rows[0]).toEqual({ t: 100, r: '36.250000' })
  })
})
