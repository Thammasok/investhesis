import type { FastifyInstance } from 'fastify'
import type { DbHandle } from '../src/db/client.ts'
import { seedStock } from './seed.ts'

export type ChainRow = {
  id: string
  ticker: string
  value_chain: string | null
  value_chain_position: string | null
  lens_sources: Record<string, string>
  updated_at: Date
  created_at: Date
}

export type SeedOptions = {
  position?: string | null
  /** Written as is, so a test can store names the API would trim or fold. */
  sources?: object
  createdAt?: string
  holding?: { shares: string | null; cost: string | null; currency?: 'USD' | 'THB' }
  market?: 'US' | 'TH'
}

let tick = 0

/** A stock with a chain name, `updated_at` pinned to 2020 so a rewrite is visible. Later stocks are created later by default. */
export async function seedChain(handle: DbHandle, userId: string, ticker: string, chain: string | null, o: SeedOptions = {}): Promise<string> {
  const id = await seedStock(handle, userId, ticker)
  const created = o.createdAt ?? new Date(Date.UTC(2026, 0, 1) + ++tick * 1000).toISOString()
  await handle.pool.query(
    "update app.stocks set value_chain = $2, value_chain_position = $3, lens_sources = $4, updated_at = '2020-01-01', created_at = $5 where id = $1",
    [id, chain, o.position ?? null, JSON.stringify(o.sources ?? {}), created],
  )
  if (o.market === 'TH') await handle.pool.query("update app.stocks set market = 'TH', exchange = 'SET', currency = 'THB' where id = $1", [id])
  if (o.holding) {
    await handle.pool.query('insert into app.holdings (stock_id, user_id, shares, average_cost, cost_currency) values ($1,$2,$3,$4,$5)', [
      id,
      userId,
      o.holding.shares,
      o.holding.cost,
      o.holding.currency ?? (o.market === 'TH' ? 'THB' : 'USD'),
    ])
  }
  return id
}

export const readRows = async (handle: DbHandle, ids: string[]): Promise<ChainRow[]> =>
  (
    await handle.pool.query<ChainRow>(
      'select id, ticker, value_chain, value_chain_position, lens_sources, updated_at, created_at from app.stocks where id = any($1) order by ticker',
      [ids],
    )
  ).rows

/** Every row of a user, all columns, to compare before and after. */
export const snapshotOf = async (handle: DbHandle, userId: string) =>
  (await handle.pool.query('select * from app.stocks where user_id = $1 order by id', [userId])).rows

export const renameVia = (app: FastifyInstance, payload: unknown) => app.inject({ method: 'POST', url: '/chains/rename', payload: payload as object })

export const movedAfter2020 = (r: { updated_at: Date } | undefined) => (r?.updated_at.getFullYear() ?? 0) > 2020

export const percentile = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.ceil((p / 100) * xs.length) - 1] ?? Infinity

/** Dataset VC-A of test-cases.md (stocks in creation order) and its list Core = {ASML, TSM, PTTEP}. */
export async function seedVcA(handle: DbHandle, userId: string) {
  const { seedList, seedMembership } = await import('./seed.ts')
  const usd = (shares: string, cost: string) => ({ shares, cost, currency: 'USD' as const })
  const thb = (shares: string | null, cost: string | null) => ({ shares, cost, currency: 'THB' as const })
  const th = { market: 'TH' as const }
  const ids: Record<string, string> = {}
  const add = async (ticker: string, chain: string | null, o: SeedOptions = {}) => (ids[ticker] = await seedChain(handle, userId, ticker, chain, o))
  await add('ASML', 'AI & Semis', { position: 'Upstream', holding: usd('2', '850.00') })
  await add('AMAT', 'ai & semis', { position: 'Upstream' })
  await add('TSM', 'AI & Semis', { position: 'Midstream', holding: usd('10', '100.00') })
  await add('NVDA', 'AI & Semis', { position: 'Midstream', holding: usd('5', '120.00') })
  await add('MSFT', 'AI & Semis', { position: 'Downstream', holding: usd('5', '300.00') })
  await add('INTC', 'AI & Semis', { position: 'Integrated' })
  await add('PTTEP', 'Oil & Gas', { position: 'Upstream', ...th, holding: thb('1000', '100.00') })
  await add('PTT', 'Oil & Gas', { position: 'Midstream', ...th, holding: thb(null, null) })
  await add('BCP', 'Oil & Gas', { position: 'None', ...th })
  await add('AAPL', null)
  await add('KO', null, { holding: usd('10', '60.00') })
  await add('JNJ', null)
  const core = await seedList(handle, userId, 'Core')
  for (const t of ['ASML', 'TSM', 'PTTEP']) await seedMembership(handle, userId, core, ids[t] as string)
  return { ids, core }
}
