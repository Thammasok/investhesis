import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { listStocks, lists } from '../../db/schema/index.ts'

export type ListRow = {
  id: string
  name: string
  stockCount: number
  createdAt: Date
  updatedAt: Date
}

export type Membership = { listId: string; stockId: string; addedAt: Date }

/** Constraints the service maps to 409 (names from the migration). */
export const LIST_NAME_UNIQUE = 'lists_user_name_ci'
export const MEMBERSHIP_PK = 'list_stocks_pkey'

/** The pg error behind a Drizzle query error, if any. */
export function pgError(e: unknown): { code?: string; constraint?: string } | undefined {
  for (let cur = e as { code?: string; cause?: unknown } | undefined, i = 0; cur && i < 3; cur = cur.cause as typeof cur, i++) {
    if (typeof cur.code === 'string') return cur as { code: string; constraint?: string }
  }
  return undefined
}

const stockCount = sql<number>`(select count(*)::int from app.list_stocks ls where ls.list_id = ${lists.id} and ls.user_id = ${lists.userId})`

const columns = {
  id: lists.id,
  name: lists.name,
  stockCount,
  createdAt: lists.createdAt,
  updatedAt: lists.updatedAt,
}

export async function findOwnedList(db: Db, userId: string, id: string): Promise<ListRow | undefined> {
  const [row] = await db.select(columns).from(lists).where(and(eq(lists.id, id), eq(lists.userId, userId)))
  return row
}

export function listLists(db: Db, userId: string): Promise<ListRow[]> {
  return db
    .select(columns)
    .from(lists)
    .where(eq(lists.userId, userId))
    .orderBy(sql`lower(${lists.name})`, lists.name)
}

export async function createList(db: Db, userId: string, id: string, name: string): Promise<void> {
  await db.insert(lists).values({ id, userId, name })
}

export async function renameList(db: Db, userId: string, id: string, name: string): Promise<boolean> {
  const rows = await db
    .update(lists)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(lists.id, id), eq(lists.userId, userId)))
    .returning({ id: lists.id })
  return rows.length > 0
}

/** Memberships go with the list (cascade); stocks are never touched. */
export async function deleteList(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(lists)
    .where(and(eq(lists.id, id), eq(lists.userId, userId)))
    .returning({ id: lists.id })
  return rows.length > 0
}

/** Inserts one membership; a duplicate or a foreign list/stock surfaces as a pg error (23505, 23503). */
export async function addMembership(db: Db, userId: string, listId: string, stockId: string): Promise<Membership> {
  const [row] = await db.insert(listStocks).values({ listId, stockId, userId }).returning({
    listId: listStocks.listId,
    stockId: listStocks.stockId,
    addedAt: listStocks.addedAt,
  })
  if (!row) throw new Error('membership insert returned no row')
  return row
}

/** Bulk add for create and import: existing memberships are skipped. Returns how many were new. */
export async function addMemberships(db: Db, userId: string, listId: string, stockIds: readonly string[]): Promise<number> {
  if (stockIds.length === 0) return 0
  const rows = await db
    .insert(listStocks)
    .values(stockIds.map((stockId) => ({ listId, stockId, userId })))
    .onConflictDoNothing()
    .returning({ stockId: listStocks.stockId })
  return rows.length
}

export async function removeMembership(db: Db, userId: string, listId: string, stockId: string): Promise<boolean> {
  const rows = await db
    .delete(listStocks)
    .where(and(eq(listStocks.listId, listId), eq(listStocks.stockId, stockId), eq(listStocks.userId, userId)))
    .returning({ stockId: listStocks.stockId })
  return rows.length > 0
}
