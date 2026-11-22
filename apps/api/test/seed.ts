import { uuidv7 } from '../src/lib/ids.ts'
import type { DbHandle } from '../src/db/client.ts'

/** Inserts a US stock straight into the table (no routes), for tests of other modules. */
export async function seedStock(handle: DbHandle, userId: string, ticker: string): Promise<string> {
  const id = uuidv7()
  await handle.pool.query(
    "insert into app.stocks (id, user_id, market, exchange, currency, ticker, name) values ($1,$2,'US','NASDAQ','USD',$3,$3)",
    [id, userId, ticker],
  )
  return id
}

export async function seedList(handle: DbHandle, userId: string, name: string): Promise<string> {
  const id = uuidv7()
  await handle.pool.query('insert into app.lists (id, user_id, name) values ($1,$2,$3)', [id, userId, name])
  return id
}

export async function seedMembership(handle: DbHandle, userId: string, listId: string, stockId: string): Promise<void> {
  await handle.pool.query('insert into app.list_stocks (list_id, stock_id, user_id) values ($1,$2,$3)', [listId, stockId, userId])
}
