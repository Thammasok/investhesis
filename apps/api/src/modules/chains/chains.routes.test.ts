import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, newUserId, type TestApp } from '../../../test/db.ts'
import { seedStock } from '../../../test/seed.ts'

const logs: string[] = []
let t: TestApp
beforeAll(async () => {
  t = await buildTestApp(undefined, { logStream: { write: (line: string) => void logs.push(line) } })
})
afterAll(() => t.cleanup())

type Row = { id: string; value_chain: string | null; value_chain_position: string | null; lens_sources: Record<string, string>; updated_at: Date }

async function seedChain(userId: string, ticker: string, chain: string | null, position: string | null = null, sources: object = { moat: 'manual' }) {
  const id = await seedStock(t.handle, userId, ticker)
  await t.handle.pool.query(
    "update app.stocks set value_chain = $2, value_chain_position = $3, lens_sources = $4, updated_at = '2020-01-01', created_at = now() + ($5 || ' ms')::interval where id = $1",
    [id, chain, position, JSON.stringify(sources), String(Math.floor(Math.random() * 1000))],
  )
  return id
}
const read = async (ids: string[]): Promise<Row[]> =>
  (await t.handle.pool.query<Row>('select id, value_chain, value_chain_position, lens_sources, updated_at from app.stocks where id = any($1) order by ticker', [ids])).rows
const rename = (payload: unknown, app = t.app) => app.inject({ method: 'POST', url: '/chains/rename', payload: payload as object })
const moved = (r: Row | undefined) => (r?.updated_at.getFullYear() ?? 0) > 2020

describe('POST /chains/rename', () => {
  it('TC-U-913 rewrites every spelling and keeps other fields', async () => {
    const u = newUserId()
    const a = await seedChain(u, 'A913', 'AI semis', 'Upstream')
    const b = await seedChain(u, 'B913', 'ai semis', 'Midstream')
    const c = await seedChain(u, 'C913', 'Banks', 'Downstream')
    const app = await t.appFor(u)
    const res = await rename({ from: 'AI semis', to: 'AI & Semis' }, app)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ name: 'AI & Semis', changed: 2, merged: false })
    const [ra, rb, rc] = await read([a, b, c])
    expect([ra?.value_chain, rb?.value_chain]).toEqual(['AI & Semis', 'AI & Semis'])
    expect([ra?.value_chain_position, rb?.value_chain_position]).toEqual(['Upstream', 'Midstream'])
    expect(ra?.lens_sources).toEqual({ moat: 'manual', valueChain: 'manual' })
    expect(rb?.lens_sources).toEqual({ moat: 'manual', valueChain: 'manual' })
    expect(moved(ra) && moved(rb)).toBe(true)
    expect(rc?.value_chain).toBe('Banks')
    expect(moved(rc)).toBe(false)
  })

  it('TC-U-914 from matches ignoring case and surrounding spaces', async () => {
    const u = newUserId()
    await seedChain(u, 'A914', 'AI semis')
    const res = await rename({ from: ' ai SEMIS ', to: 'AI & Semis' }, await t.appFor(u))
    expect(res.json().changed).toBe(1)
  })

  it('TC-U-915 a case-only rename is not a merge and counts only rows that change', async () => {
    const u = newUserId()
    const a = await seedChain(u, 'A915', 'AI & Semis')
    const b = await seedChain(u, 'B915', 'AI & Semis')
    const c = await seedChain(u, 'C915', 'ai & semis')
    const res = await rename({ from: 'ai & semis', to: 'AI & Semis' }, await t.appFor(u))
    expect(res.json()).toEqual({ name: 'AI & Semis', changed: 1, merged: false })
    const [ra, rb, rc] = await read([a, b, c])
    expect([moved(ra), moved(rb), moved(rc)]).toEqual([false, false, true])
  })

  it('TC-U-916 renaming onto another chain without merge is refused and writes nothing', async () => {
    const u = newUserId()
    const ids: string[] = []
    for (let i = 0; i < 3; i++) ids.push(await seedChain(u, `S${i}-916`, 'AI semis'))
    // The earliest-created stock carries the title spelling.
    const first = await seedChain(u, 'E-916', 'AI & Semis')
    await t.handle.pool.query("update app.stocks set created_at = '2019-01-01' where id = $1", [first])
    for (let i = 0; i < 7; i++) ids.push(await seedChain(u, `O${i}-916`, i % 2 ? 'ai & semis' : 'AI & Semis'))
    ids.push(first)
    const res = await rename({ from: 'AI semis', to: 'ai & semis' }, await t.appFor(u))
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ code: 'chain_exists', existingName: 'AI & Semis', existingCount: 8 })
    expect((await read(ids)).some(moved)).toBe(false)
  })

  it('TC-U-917 a confirmed merge rewrites both chains to the typed name', async () => {
    const u = newUserId()
    const ids: string[] = []
    for (let i = 0; i < 3; i++) ids.push(await seedChain(u, `S${i}-917`, 'AI semis'))
    for (let i = 0; i < 8; i++) ids.push(await seedChain(u, `O${i}-917`, 'AI & Semis'))
    const res = await rename({ from: 'AI semis', to: 'ai & semis', merge: true }, await t.appFor(u))
    expect(res.json()).toEqual({ name: 'ai & semis', changed: 11, merged: true })
    expect((await read(ids)).every((r) => r.value_chain === 'ai & semis')).toBe(true)
  })

  it('TC-U-918 an unknown chain and another user chain are not found', async () => {
    const u = newUserId()
    const v = newUserId()
    const theirs = await seedChain(v, 'A918', 'Oil')
    const res = await rename({ from: 'Oil', to: 'Oil & Gas' }, await t.appFor(u))
    expect(res.statusCode).toBe(404)
    expect(res.json().code).toBe('chain_not_found')
    await t.appFor(v)
    expect((await read([theirs]))[0]?.value_chain).toBe('Oil')
  })

  it('TC-U-919 another user chain of the same name is never merged or counted', async () => {
    const u = newUserId()
    const v = newUserId()
    await seedChain(u, 'A919', 'Banks')
    const theirs = [await seedChain(v, 'B919', 'Banks')]
    for (let i = 0; i < 4; i++) theirs.push(await seedChain(v, `C${i}-919`, 'Banks'))
    theirs.push(await seedChain(v, 'D919', 'Finance'), await seedChain(v, 'E919', 'Finance'))
    await t.appFor(v)
    const res = await rename({ from: 'Banks', to: 'Finance' }, await t.appFor(u))
    expect(res.json()).toEqual({ name: 'Finance', changed: 1, merged: false })
    const after = await read(theirs)
    expect(after.filter((r) => r.value_chain === 'Banks')).toHaveLength(5)
    expect(after.some(moved)).toBe(false)
  })

  it('TC-U-920 validation problems answer 400 with paths', async () => {
    const cases: [object, string][] = [
      [{ from: 'A', to: '' }, 'to'],
      [{ to: 'X' }, 'from'],
      [{ from: 'A', to: 'X', extra: 1 }, 'extra'],
      [{ from: 'A', to: 'X\u0000' }, 'to'],
    ]
    for (const [body, path] of cases) {
      const res = await rename(body)
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('validation_failed')
      expect(res.json().errors.map((e: { path: string }) => e.path)).toEqual([path])
    }
  })

  it('TC-U-921 a missing database is 503 db_unavailable', async () => {
    const { buildApp } = await import('../../app.ts')
    const { loadConfig } = await import('../../config/env.ts')
    const { baseEnv } = await import('../../../test/env.ts')
    const app = await buildApp({ config: loadConfig(baseEnv), logStream: { write() {} } })
    const res = await app.inject({ method: 'POST', url: '/chains/rename', payload: { from: 'A', to: 'B' } })
    expect(res.statusCode).toBe(503)
    expect(res.json().code).toBe('db_unavailable')
    await app.close()
  })

  it('TC-U-923 chain names never reach a log line', async () => {
    const u = newUserId()
    await seedChain(u, 'A923', 'SENTINEL-FROM-9x')
    await seedChain(u, 'B923', 'SENTINEL-TO-9x')
    const app = await t.appFor(u)
    logs.length = 0
    const refused = await rename({ from: 'SENTINEL-FROM-9x', to: 'sentinel-to-9x' }, app)
    const ok = await rename({ from: 'SENTINEL-FROM-9x', to: 'SENTINEL-TO-9x', merge: true }, app)
    expect([refused.statusCode, ok.statusCode]).toEqual([409, 200])
    expect(logs.filter((l) => l.includes('"statusCode"')).length).toBeGreaterThanOrEqual(2)
    expect(logs.join('\n')).not.toMatch(/SENTINEL-(FROM|TO)-9x/i)
  })

  it('TC-U-913 (openapi) the route is documented with bearerAuth', async () => {
    const spec = (await t.app.inject({ url: '/openapi.json' })).json()
    const op = spec.paths['/chains/rename'].post
    expect(op.security).toEqual([{ bearerAuth: [] }])
    expect(Object.keys(op.responses)).toEqual(expect.arrayContaining(['200', '400', '401', '404', '409']))
  })
})
