import type { Db } from '../../db/client.ts'
import { AppError } from '../../lib/app-error.ts'
import { uuidv7 } from '../../lib/ids.ts'
import * as repo from './lists.repository.ts'

const notFound = () => new AppError({ status: 404, code: 'not_found' })
const nameTaken = () => new AppError({ status: 409, code: 'list_name_taken', detail: 'You already have a list with this name' })

export type ListView = { id: string; name: string; stockCount: number; createdAt: string; updatedAt: string }

const view = (r: repo.ListRow): ListView => ({
  id: r.id,
  name: r.name,
  stockCount: r.stockCount,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
})

async function owned(db: Db, userId: string, id: string): Promise<repo.ListRow> {
  const row = await repo.findOwnedList(db, userId, id)
  if (!row) throw notFound()
  return row
}

export async function listLists(db: Db, userId: string): Promise<ListView[]> {
  return (await repo.listLists(db, userId)).map(view)
}

export async function getList(db: Db, userId: string, id: string): Promise<ListView> {
  return view(await owned(db, userId, id))
}

export async function createList(db: Db, userId: string, name: string): Promise<ListView> {
  const id = uuidv7()
  try {
    await repo.createList(db, userId, id, name)
  } catch (e) {
    if (repo.pgError(e)?.constraint === repo.LIST_NAME_UNIQUE) throw nameTaken()
    throw e
  }
  return view(await owned(db, userId, id))
}

export async function renameList(db: Db, userId: string, id: string, name: string): Promise<ListView> {
  try {
    if (!(await repo.renameList(db, userId, id, name))) throw notFound()
  } catch (e) {
    if (repo.pgError(e)?.constraint === repo.LIST_NAME_UNIQUE) throw nameTaken()
    throw e
  }
  return view(await owned(db, userId, id))
}

export async function deleteList(db: Db, userId: string, id: string): Promise<void> {
  if (!(await repo.deleteList(db, userId, id))) throw notFound()
}

export async function addStock(db: Db, userId: string, listId: string, stockId: string) {
  await owned(db, userId, listId)
  try {
    const m = await repo.addMembership(db, userId, listId, stockId)
    return { listId: m.listId, stockId: m.stockId, addedAt: m.addedAt.toISOString() }
  } catch (e) {
    const pg = repo.pgError(e)
    if (pg?.code === '23505') throw new AppError({ status: 409, code: 'already_in_list', detail: 'The stock is already in this list' })
    // The composite foreign key rejects a stock that is not this user's (or was just deleted).
    if (pg?.code === '23503') throw notFound()
    throw e
  }
}

export async function removeStock(db: Db, userId: string, listId: string, stockId: string): Promise<void> {
  if (!(await repo.removeMembership(db, userId, listId, stockId))) throw notFound()
}
