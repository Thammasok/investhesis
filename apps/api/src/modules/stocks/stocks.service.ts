import { StockInput, resolveEconomicCycle, type HoldingInput, type StockPatch } from '@investhesis/domain'
import type { Db } from '../../db/client.ts'
import type { LensSource } from '../../db/schema/index.ts'
import { AppError, fieldError, type FieldError } from '../../lib/app-error.ts'
import { uuidv7 } from '../../lib/ids.ts'
import { addMemberships, findOwnedList, pgError } from '../lists/lists.repository.ts'
import * as repo from './stocks.repository.ts'

type Market = 'US' | 'TH'

const notFound = () => new AppError({ status: 404, code: 'not_found' })

/** The 14 lens fields whose origin lens_sources records (indexMembership is not a lens). */
export const LENS_KEYS = [
  'gicsSector',
  'setIndustryGroup',
  'valueChain',
  'valueChainPosition',
  'size',
  'style',
  'economicCycle',
  'lynchType',
  'lifeCycle',
  'customers',
  'revenueTypes',
  'moat',
  'themes',
  'volatility',
] as const

const isSet = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined)

export type StockView = Omit<repo.StockRow, 'createdAt' | 'updatedAt' | 'lensSources' | 'market' | 'currency' | 'holding'> & {
  holding: repo.HoldingRow | null
  market: Market
  currency: 'USD' | 'THB'
  lensSources: Record<string, LensSource>
  createdAt: string
  updatedAt: string
}

export const view = (r: repo.StockRow): StockView => ({ ...r, market: r.market as Market, currency: r.currency as 'USD' | 'THB', createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })

async function owned(db: Db, userId: string, id: string): Promise<repo.StockRow> {
  const row = await repo.findOwnedStock(db, userId, id)
  if (!row) throw notFound()
  return row
}

type Parsed = ReturnType<typeof StockInput.parse>

export function sourcesFor(input: Parsed, cycleSource: LensSource | null, previous: Record<string, LensSource> = {}, touched?: ReadonlySet<string>): Record<string, LensSource> {
  const out: Record<string, LensSource> = {}
  for (const key of LENS_KEYS) {
    if (!isSet(input[key])) continue
    if (key === 'economicCycle') {
      if (cycleSource) out[key] = cycleSource
    } else if (touched ? touched.has(key) : true) {
      out[key] = 'manual'
    } else if (previous[key]) {
      out[key] = previous[key]
    }
  }
  return out
}

function toInput(row: repo.StockRow): Record<string, unknown> {
  const { id: _id, currency: _currency, lensSources: _sources, listIds: _lists, holding: _holding, createdAt: _c, updatedAt: _u, ...rest } = row
  return rest
}

export async function listStocks(db: Db, userId: string, listId?: string): Promise<StockView[]> {
  if (listId && !(await findOwnedList(db, userId, listId))) throw notFound()
  return (await repo.listOwnedStocks(db, userId, listId)).map(view)
}

export async function getStock(db: Db, userId: string, id: string): Promise<StockView> {
  return view(await owned(db, userId, id))
}

/** A new stock row from validated input: default cycle resolved, every set lens `manual`. */
export function toNewStock(input: Parsed): repo.NewStock {
  const cycle = resolveEconomicCycle({ gicsSector: input.gicsSector, input: input.economicCycle })
  return {
    ...input,
    id: uuidv7(),
    economicCycle: cycle.economicCycle,
    lensSources: sourcesFor({ ...input, economicCycle: cycle.economicCycle }, cycle.source),
  }
}

/** `costCurrency` defaults to the stock's currency here, not in the database (design: Data Model). */
const holdingRow = (h: HoldingInput, currency: 'USD' | 'THB'): repo.HoldingRow => ({
  shares: h.shares ?? null,
  averageCost: h.averageCost ?? null,
  costCurrency: h.costCurrency ?? currency,
})

export async function createStock(db: Db, userId: string, input: Parsed, listIds: readonly string[], holding?: HoldingInput | null): Promise<StockView> {
  const row = toNewStock(input)
  const id = row.id
  const wanted = [...new Set(listIds)]
  try {
    await db.transaction(async (tx) => {
      for (const listId of wanted) if (!(await findOwnedList(tx, userId, listId))) throw notFound()
      await repo.insertStock(tx, userId, row)
      for (const listId of wanted) await addMemberships(tx, userId, listId, [id])
      if (holding) await repo.upsertHolding(tx, userId, id, holdingRow(holding, row.currency as 'USD' | 'THB'))
    })
  } catch (e) {
    if (pgError(e)?.constraint === repo.STOCK_UNIQUE) {
      const existingStockId = await repo.findIdByMarketTicker(db, userId, input.market, input.ticker)
      throw new AppError({ status: 409, code: 'stock_exists', detail: 'You already saved this stock', extensions: { existingStockId } })
    }
    throw e
  }
  return view(await owned(db, userId, id))
}

/** `holding`: undefined = unchanged, null = not held, object = replace. */
export async function updateStock(db: Db, userId: string, id: string, patch: StockPatch, holding?: HoldingInput | null): Promise<StockView> {
  const current = await owned(db, userId, id)
  const touched = new Set(Object.keys(patch).filter((k) => patch[k as keyof StockPatch] !== undefined))

  const merged: Record<string, unknown> = { ...toInput(current) }
  for (const key of touched) merged[key] = patch[key as keyof StockPatch]
  const parsed = StockInput.safeParse(merged)
  if (!parsed.success) {
    const errors: FieldError[] = parsed.error.issues.map((i) => fieldError(i.path.join('.'), i.message))
    throw new AppError({ status: 400, code: 'validation_failed', errors })
  }

  const cycle = resolveEconomicCycle({
    gicsSector: parsed.data.gicsSector,
    input: patch.economicCycle,
    current: { economicCycle: current.economicCycle as never, source: current.lensSources['economicCycle'] },
  })
  const next = { ...parsed.data, economicCycle: cycle.economicCycle }
  const { ticker: _t, market: _m, currency: _c, ...changes } = next
  const saved = await db.transaction(async (tx) => {
    const updated = await repo.updateStock(tx, userId, id, {
      ...changes,
      lensSources: sourcesFor(next, cycle.source, current.lensSources, touched),
    })
    if (!updated || holding === undefined) return updated
    try {
      if (holding === null) await repo.deleteHolding(tx, userId, id)
      else await repo.upsertHolding(tx, userId, id, holdingRow(holding, current.currency as 'USD' | 'THB'))
    } catch (e) {
      if (pgError(e)?.code === '23503') throw notFound()
      throw e
    }
    return repo.findOwnedStock(tx, userId, id)
  })
  if (!saved) throw notFound()
  return view(saved)
}

export async function deleteStock(db: Db, userId: string, id: string): Promise<void> {
  if (!(await repo.deleteStock(db, userId, id))) throw notFound()
}
