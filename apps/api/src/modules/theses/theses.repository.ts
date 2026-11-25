import { and, asc, desc, eq } from 'drizzle-orm'
import type { DbOrTx } from '../../db/client.ts'
import { stocks, theses, type ThesisTypeColumn } from '../../db/schema/index.ts'

export const THESIS_PK = 'theses_pkey'

export type ThesisRow = {
  id: string
  stockId: string
  type: ThesisTypeColumn
  entryDate: string
  note: string
  targetPrice: string | null
  invalidation: string | null
  createdAt: Date
  updatedAt: Date
}

export type NewThesis = ThesisRow

export type ThesisChanges = Partial<Pick<ThesisRow, 'type' | 'entryDate' | 'note' | 'targetPrice' | 'invalidation'>> & {
  updatedAt: Date
}

const columns = {
  id: theses.id,
  stockId: theses.stockId,
  type: theses.type,
  entryDate: theses.entryDate,
  note: theses.note,
  targetPrice: theses.targetPrice,
  invalidation: theses.invalidation,
  createdAt: theses.createdAt,
  updatedAt: theses.updatedAt,
}

/** Newest date first, then newest created, then id (ids are time-ordered, so the newest wins a tie). */
const order = [desc(theses.entryDate), desc(theses.createdAt), desc(theses.id)] as const

export async function stockExists(db: DbOrTx, userId: string, stockId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: stocks.id })
    .from(stocks)
    .where(and(eq(stocks.id, stockId), eq(stocks.userId, userId)))
  return row !== undefined
}

export function listTheses(db: DbOrTx, userId: string, stockId: string): Promise<ThesisRow[]> {
  return db
    .select(columns)
    .from(theses)
    .where(and(eq(theses.userId, userId), eq(theses.stockId, stockId)))
    .orderBy(...order)
}

/** Every entry of the user for the backup: by stock id, then the list order. */
export function listThesesForUser(db: DbOrTx, userId: string): Promise<ThesisRow[]> {
  return db
    .select(columns)
    .from(theses)
    .where(eq(theses.userId, userId))
    .orderBy(asc(theses.stockId), ...order)
}

export async function findThesis(db: DbOrTx, userId: string, stockId: string, id: string): Promise<ThesisRow | undefined> {
  const [row] = await db
    .select(columns)
    .from(theses)
    .where(and(eq(theses.userId, userId), eq(theses.stockId, stockId), eq(theses.id, id)))
  return row
}

export async function insertThesis(db: DbOrTx, userId: string, row: NewThesis): Promise<ThesisRow> {
  const [saved] = await db.insert(theses).values({ ...row, userId }).returning(columns)
  if (!saved) throw new Error('thesis insert returned no row')
  return saved
}

export async function updateThesis(
  db: DbOrTx,
  userId: string,
  stockId: string,
  id: string,
  changes: ThesisChanges,
): Promise<ThesisRow | undefined> {
  const [row] = await db
    .update(theses)
    .set(changes)
    .where(and(eq(theses.userId, userId), eq(theses.stockId, stockId), eq(theses.id, id)))
    .returning(columns)
  return row
}

export async function deleteThesis(db: DbOrTx, userId: string, stockId: string, id: string): Promise<ThesisRow | undefined> {
  const [row] = await db
    .delete(theses)
    .where(and(eq(theses.userId, userId), eq(theses.stockId, stockId), eq(theses.id, id)))
    .returning(columns)
  return row
}
