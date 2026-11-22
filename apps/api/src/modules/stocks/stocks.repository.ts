import { and, eq, getTableColumns, inArray, or, sql, type SQL } from 'drizzle-orm'
import type { DbOrTx } from '../../db/client.ts'
import { stocks, type LensSource } from '../../db/schema/index.ts'

export const STOCK_UNIQUE = 'stocks_user_market_ticker'

export type StockRow = Omit<typeof stocks.$inferSelect, 'userId'> & { listIds: string[] }
export type NewStock = Omit<typeof stocks.$inferInsert, 'userId' | 'createdAt' | 'updatedAt'>
export type StockChanges = Partial<Omit<typeof stocks.$inferInsert, 'id' | 'userId' | 'market' | 'ticker' | 'currency' | 'createdAt'>> & {
  lensSources?: Record<string, LensSource>
}

const listIds = sql<string[]>`coalesce((select array_agg(ls.list_id::text order by ls.list_id) from app.list_stocks ls where ls.stock_id = ${stocks.id} and ls.user_id = ${stocks.userId}), '{}')`

const { userId: _userId, ...stockColumns } = getTableColumns(stocks)
const columns = { ...stockColumns, listIds }

const byTicker = sql`${stocks.ticker} collate "C"`

export async function findOwnedStock(db: DbOrTx, userId: string, id: string): Promise<StockRow | undefined> {
  const [row] = await db.select(columns).from(stocks).where(and(eq(stocks.id, id), eq(stocks.userId, userId)))
  return row
}

export async function listOwnedStocks(db: DbOrTx, userId: string, listId?: string): Promise<StockRow[]> {
  const where: SQL[] = [eq(stocks.userId, userId)]
  if (listId) {
    where.push(
      sql`exists (select 1 from app.list_stocks m where m.stock_id = ${stocks.id} and m.user_id = ${stocks.userId} and m.list_id = ${listId})`,
    )
  }
  const rows = await db.select(columns).from(stocks).where(and(...where)).orderBy(byTicker, stocks.market)
  return rows
}

/** Inserts one stock; a duplicate (market, ticker) surfaces as a pg error on STOCK_UNIQUE. */
export async function insertStock(db: DbOrTx, userId: string, row: NewStock): Promise<void> {
  await db.insert(stocks).values({ ...row, userId })
}

/** Bulk insert for import: pairs the user already has (or repeats within `rows`) are skipped. Returns the new rows. */
export async function insertMany(db: DbOrTx, userId: string, rows: readonly NewStock[]): Promise<StockRow[]> {
  if (rows.length === 0) return []
  const inserted = await db
    .insert(stocks)
    .values(rows.map((r) => ({ ...r, userId })))
    .onConflictDoNothing({ target: [stocks.userId, stocks.market, stocks.ticker] })
    .returning({ id: stocks.id })
  if (inserted.length === 0) return []
  return await db
    .select(columns)
    .from(stocks)
    .where(and(eq(stocks.userId, userId), inArray(stocks.id, inserted.map((r) => r.id))))
}

export async function findByMarketTickers(
  db: DbOrTx,
  userId: string,
  pairs: readonly { market: string; ticker: string }[],
): Promise<StockRow[]> {
  if (pairs.length === 0) return []
  const match = or(...pairs.map((p) => and(eq(stocks.market, p.market), eq(stocks.ticker, p.ticker))))
  return await db.select(columns).from(stocks).where(and(eq(stocks.userId, userId), match))
}

export async function findIdByMarketTicker(db: DbOrTx, userId: string, market: string, ticker: string): Promise<string | undefined> {
  const [row] = await db
    .select({ id: stocks.id })
    .from(stocks)
    .where(and(eq(stocks.userId, userId), eq(stocks.market, market), eq(stocks.ticker, ticker)))
  return row?.id
}

/** Sets `updated_at` itself (no trigger). Returns undefined when the stock is not the user's. */
export async function updateStock(db: DbOrTx, userId: string, id: string, changes: StockChanges): Promise<StockRow | undefined> {
  const rows = await db
    .update(stocks)
    .set({ ...changes, updatedAt: new Date() })
    .where(and(eq(stocks.id, id), eq(stocks.userId, userId)))
    .returning({ id: stocks.id })
  return rows.length === 0 ? undefined : findOwnedStock(db, userId, id)
}

/** Memberships go with the stock (cascade); lists are never touched. */
export async function deleteStock(db: DbOrTx, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(stocks)
    .where(and(eq(stocks.id, id), eq(stocks.userId, userId)))
    .returning({ id: stocks.id })
  return rows.length > 0
}

