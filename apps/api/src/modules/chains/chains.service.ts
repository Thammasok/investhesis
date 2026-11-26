import { chainKey, MESSAGES } from '@investhesis/domain'
import type { Db } from '../../db/client.ts'
import { AppError } from '../../lib/app-error.ts'
import * as repo from './chains.repository.ts'

/** The repository calls the rename transaction makes; tests replace them to inject failures. */
export type ChainsRepo = { lockChainRows: typeof repo.lockChainRows; renameRows: typeof repo.renameRows }
export const chainsRepo: ChainsRepo = { lockChainRows: repo.lockChainRows, renameRows: repo.renameRows }

export type RenameResult = { name: string; changed: number; merged: boolean }

const earliest = (rows: repo.ChainRow[]) =>
  rows.reduce((a, b) => (b.createdAt < a.createdAt || (+b.createdAt === +a.createdAt && b.id < a.id) ? b : a))

export async function renameChain(
  db: Db,
  userId: string,
  input: { from: string; to: string; merge: boolean },
  r: ChainsRepo = chainsRepo,
): Promise<RenameResult> {
  const { from, to, merge } = input
  return await db.transaction(async (tx) => {
    const rows = await r.lockChainRows(tx, userId)
    const fromKey = chainKey(from)
    const toKey = chainKey(to)
    const members = rows.filter((x) => chainKey(x.valueChain) === fromKey)
    if (members.length === 0) throw new AppError({ status: 404, code: 'chain_not_found', detail: MESSAGES.chainNotFound })
    const others = toKey === fromKey ? [] : rows.filter((x) => chainKey(x.valueChain) === toKey)
    if (others.length > 0 && !merge) {
      const existingName = earliest(others).valueChain
      throw new AppError({
        status: 409,
        code: 'chain_exists',
        detail: MESSAGES.chainExists(existingName, others.length),
        extensions: { existingName, existingCount: others.length },
      })
    }
    const ids = [...members, ...others].filter((x) => x.valueChain !== to).map((x) => x.id)
    await r.renameRows(tx, userId, ids, to)
    return { name: to, changed: ids.length, merged: others.length > 0 }
  })
}
