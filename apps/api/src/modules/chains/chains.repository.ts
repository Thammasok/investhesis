import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { DbOrTx } from '../../db/client.ts'
import { stocks } from '../../db/schema/index.ts'

export type ChainRow = { id: string; valueChain: string; createdAt: Date }

/** Locks every chain-named row of the user, in id order so two opposite merges cannot deadlock. */
export async function lockChainRows(db: DbOrTx, userId: string): Promise<ChainRow[]> {
  const rows = await db
    .select({ id: stocks.id, valueChain: stocks.valueChain, createdAt: stocks.createdAt })
    .from(stocks)
    .where(and(eq(stocks.userId, userId), isNotNull(stocks.valueChain)))
    .orderBy(asc(stocks.id))
    .for('update')
  return rows.flatMap((r) => (r.valueChain === null ? [] : [{ ...r, valueChain: r.valueChain }]))
}

export async function renameRows(db: DbOrTx, userId: string, ids: readonly string[], to: string): Promise<void> {
  if (ids.length === 0) return
  await db
    .update(stocks)
    .set({
      valueChain: to,
      lensSources: sql`${stocks.lensSources} || '{"valueChain":"manual"}'::jsonb`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(stocks.userId, userId), inArray(stocks.id, [...ids])))
}
