import { z } from 'zod'
import {
  THESIS_TYPES,
  latestThesisDate,
  parseDecimal,
  rule,
  thesisInput,
  thesisPatch,
  type Thesis,
} from '@investhesis/domain'
import type { Db } from '../../db/client.ts'
import { AppError, fieldError, type FieldError } from '../../lib/app-error.ts'
import { uuidv7 } from '../../lib/ids.ts'
import { pgError } from '../lists/lists.repository.ts'
import * as repo from './theses.repository.ts'

type Clock = () => Date

const notFound = () => new AppError({ status: 404, code: 'not_found' })
const invalid = (errors: FieldError[]) => new AppError({ status: 400, code: 'validation_failed', errors })

const issues = (error: z.ZodError, prefix = ''): FieldError[] =>
  error.issues.map((i) => fieldError(prefix + i.path.join('.'), i.message))

/** Postgres text cannot hold NUL; refuse it here so it is a 400, not a 500. */
function nulErrors(value: { note?: string | undefined; invalidation?: string | null | undefined }, prefix = ''): FieldError[] {
  const out: FieldError[] = []
  for (const key of ['note', 'invalidation'] as const) {
    if (value[key]?.includes('\u0000')) out.push(fieldError(prefix + key, 'must not contain a NUL character'))
  }
  return out
}

export function toThesis(row: repo.ThesisRow): Thesis {
  return {
    id: row.id,
    stockId: row.stockId,
    type: row.type,
    date: row.entryDate,
    note: row.note,
    targetPrice: row.targetPrice,
    invalidation: row.invalidation,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function requireStock(db: Db, userId: string, stockId: string): Promise<void> {
  if (!(await repo.stockExists(db, userId, stockId))) throw notFound()
}

export async function list(db: Db, userId: string, stockId: string): Promise<Thesis[]> {
  await requireStock(db, userId, stockId)
  return (await repo.listTheses(db, userId, stockId)).map(toThesis)
}

export async function create(db: Db, now: Clock, userId: string, stockId: string, body: unknown): Promise<Thesis> {
  const parsed = thesisInput({ today: latestThesisDate(now()) }).safeParse(body)
  if (!parsed.success) throw invalid(issues(parsed.error))
  const nul = nulErrors(parsed.data)
  if (nul.length > 0) throw invalid(nul)
  await requireStock(db, userId, stockId)
  const at = now()
  const { date, ...rest } = parsed.data
  try {
    const row = await repo.insertThesis(db, userId, {
      id: uuidv7(),
      stockId,
      type: rest.type,
      entryDate: date,
      note: rest.note,
      targetPrice: rest.targetPrice ?? null,
      invalidation: rest.invalidation ?? null,
      createdAt: at,
      updatedAt: at,
    })
    return toThesis(row)
  } catch (e) {
    if (pgError(e)?.code === '23503') throw notFound()
    throw e
  }
}

const sameDecimal = (a: string | null, b: string | null) =>
  a === null || b === null ? a === b : parseDecimal(a, 4) === parseDecimal(b, 4)

export async function update(
  db: Db,
  now: Clock,
  userId: string,
  stockId: string,
  id: string,
  body: unknown,
): Promise<Thesis> {
  const current = await repo.findThesis(db, userId, stockId, id)
  if (!current) throw notFound()
  const today = latestThesisDate(now())
  const patch = thesisPatch({ today }).safeParse(body)
  if (!patch.success) throw invalid(issues(patch.error))

  const merged: Record<string, unknown> = {
    type: current.type,
    date: current.entryDate,
    note: current.note,
    targetPrice: current.targetPrice,
    invalidation: current.invalidation,
  }
  for (const [key, value] of Object.entries(patch.data)) if (value !== undefined) merged[key] = value
  const parsed = thesisInput({ today }).safeParse(merged)
  if (!parsed.success) throw invalid(issues(parsed.error))
  const nul = nulErrors(parsed.data)
  if (nul.length > 0) throw invalid(nul)

  const next = parsed.data
  const changes: Omit<repo.ThesisChanges, 'updatedAt'> = {
    ...(next.type !== current.type && { type: next.type }),
    ...(next.date !== current.entryDate && { entryDate: next.date }),
    ...(next.note !== current.note && { note: next.note }),
    ...(!sameDecimal(next.targetPrice ?? null, current.targetPrice) && { targetPrice: next.targetPrice ?? null }),
    ...((next.invalidation ?? null) !== current.invalidation && { invalidation: next.invalidation ?? null }),
  }
  if (Object.keys(changes).length === 0) return toThesis(current)

  // The Edited marker is updated_at > created_at, so a real edit always moves it forward.
  const t = now()
  const updatedAt = t > current.createdAt && t > current.updatedAt ? t : new Date(Math.max(current.createdAt.getTime(), current.updatedAt.getTime()) + 1)
  const row = await repo.updateThesis(db, userId, stockId, id, { ...changes, updatedAt })
  if (!row) throw notFound()
  return toThesis(row)
}

export async function remove(db: Db, userId: string, stockId: string, id: string): Promise<Thesis> {
  const row = await repo.deleteThesis(db, userId, stockId, id)
  if (!row) throw notFound()
  return toThesis(row)
}

const RESTORE_KEYS = ['id', 'stockId', 'type', 'date', 'note', 'targetPrice', 'invalidation', 'createdAt', 'updatedAt']
const Stamps = z.object({ id: z.uuid(), stockId: z.string(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() })

/** Puts a whole deleted entry back with its id and times (Undo). */
export async function restore(db: Db, now: Clock, userId: string, stockId: string, body: unknown): Promise<Thesis> {
  const entry = (body as { entry?: unknown } | null)?.entry
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    throw invalid([fieldError('entry', rule('required'))])
  }
  const raw = entry as Record<string, unknown>
  const errors: FieldError[] = Object.keys(raw)
    .filter((k) => !RESTORE_KEYS.includes(k))
    .map((k) => fieldError(`entry.${k}`, rule('unknownField')))

  const stamps = Stamps.safeParse(raw)
  if (!stamps.success) errors.push(...issues(stamps.error, 'entry.'))
  else {
    const { createdAt, updatedAt } = stamps.data
    if (stamps.data.stockId !== stockId) errors.push(fieldError('entry.stockId', 'must match the stock in the address'))
    if (Date.parse(createdAt) > Date.parse(updatedAt)) errors.push(fieldError('entry.updatedAt', 'must not be before createdAt'))
    if (Date.parse(updatedAt) > now().getTime()) errors.push(fieldError('entry.updatedAt', rule('thesisDateFuture')))
  }

  const fields = Object.fromEntries(Object.entries(raw).filter(([k]) => ['type', 'date', 'note', 'targetPrice', 'invalidation'].includes(k)))
  const parsed = thesisInput({ today: latestThesisDate(now()) }).safeParse(fields)
  if (!parsed.success) errors.push(...issues(parsed.error, 'entry.'))
  else errors.push(...nulErrors(parsed.data, 'entry.'))
  if (errors.length > 0 || !parsed.success || !stamps.success) throw invalid(errors)

  await requireStock(db, userId, stockId)
  const { date, ...rest } = parsed.data
  try {
    const row = await repo.insertThesis(db, userId, {
      id: stamps.data.id,
      stockId,
      type: rest.type,
      entryDate: date,
      note: rest.note,
      targetPrice: rest.targetPrice ?? null,
      invalidation: rest.invalidation ?? null,
      createdAt: new Date(stamps.data.createdAt),
      updatedAt: new Date(stamps.data.updatedAt),
    })
    return toThesis(row)
  } catch (e) {
    const pg = pgError(e)
    if (pg?.code === '23505' && pg.constraint === repo.THESIS_PK) {
      throw new AppError({ status: 409, code: 'thesis_exists', detail: 'An entry with this id already exists.' })
    }
    if (pg?.code === '23503') throw notFound()
    throw e
  }
}

export { THESIS_TYPES }
