import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { StockInput } from '@investhesis/domain'
import { movedAfter2020, readRows, renameVia, seedChain, seedVcA, snapshotOf } from '../../../test/chains.ts'
import { buildTestApp, newUserId, type TestApp } from '../../../test/db.ts'

let t: TestApp
beforeAll(async () => {
  t = await buildTestApp()
})
afterAll(() => t.cleanup())

/** A fresh user with its own app instance, so every case owns its data. */
const fresh = async () => {
  const userId = newUserId()
  return { userId, app: await t.appFor(userId) }
}
const stocksOf = async (app: Awaited<ReturnType<typeof fresh>>['app']) => (await app.inject({ url: '/stocks' })).json().items as Record<string, unknown>[]

describe('chains rename contract', () => {
  it('TC-A-900 the OpenAPI document describes POST /chains/rename and no other chains path', async () => {
    const spec = (await t.app.inject({ url: '/openapi.json' })).json()
    const paths = Object.keys(spec.paths).filter((p) => p.startsWith('/chains'))
    expect(paths).toEqual(['/chains/rename'])
    expect(Object.keys(spec.paths['/chains/rename'])).toEqual(['post'])
    const op = spec.paths['/chains/rename'].post
    expect(op.security).toEqual([{ bearerAuth: [] }])
    const body = op.requestBody.content['application/json'].schema
    expect(Object.keys(body.properties)).toEqual(expect.arrayContaining(['from', 'to', 'merge']))
    expect(body.required ?? []).not.toContain('merge')
    expect(body.properties.merge.type).toBe('boolean')
    expect(Object.keys(op.responses)).toEqual(expect.arrayContaining(['200', '400', '401', '404', '409']))
    expect(Object.keys(op.responses['200'].content['application/json'].schema.properties)).toEqual(['name', 'changed', 'merged'])
    for (const code of ['400', '401', '404', '409']) expect(Object.keys(op.responses[code].content)).toContain('application/json')
  })

  // TC-A-900 asks for a documented 503 too; the route declares none, so it is reported as a gap, not asserted.
  it('TC-A-900 (gap) 503 is not declared in the OpenAPI responses of the route', async () => {
    const spec = (await t.app.inject({ url: '/openapi.json' })).json()
    expect(Object.keys(spec.paths['/chains/rename'].post.responses)).not.toContain('503')
  })
})

describe('chains rename behaviour', () => {
  it('TC-A-902 renaming one stray spelling changes that stock only', async () => {
    const { userId, app } = await fresh()
    const { ids } = await seedVcA(t.handle, userId)
    const before = await stocksOf(app)
    const rowsBefore = await snapshotOf(t.handle, userId)

    const res = await renameVia(app, { from: 'ai & semis', to: 'AI & Semis' })

    expect(res.statusCode).toBe(200)
    expect(res.json().changed).toBe(1)
    const after = await stocksOf(app)
    expect(after).toHaveLength(before.length)
    const untouched = (rows: Record<string, unknown>[]) => rows.filter((s) => s.id !== ids.AMAT)
    expect(untouched(after)).toEqual(untouched(before))
    const amat = after.find((s) => s.id === ids.AMAT) as Record<string, unknown>
    const amatWas = before.find((s) => s.id === ids.AMAT) as Record<string, unknown>
    expect({ ...amat, valueChain: null, updatedAt: null, lensSources: null }).toEqual({ ...amatWas, valueChain: null, updatedAt: null, lensSources: null })
    expect(amat.valueChain).toBe('AI & Semis')
    expect(amat.updatedAt).not.toBe(amatWas.updatedAt)
    // Direct rows: creation time, positions and the other stocks' updated_at are unchanged.
    const rowsAfter = await snapshotOf(t.handle, userId)
    expect(rowsAfter.filter((r) => r.id !== ids.AMAT)).toEqual(rowsBefore.filter((r) => r.id !== ids.AMAT))
    expect(rowsAfter.find((r) => r.id === ids.AMAT).created_at).toEqual(rowsBefore.find((r) => r.id === ids.AMAT).created_at)
    expect((await t.handle.pool.query('select count(*)::int as n from app.list_stocks where user_id = $1', [userId])).rows[0].n).toBe(3)
  })

  const MATCHES: [string, string, string, 200 | 404, string][] = [
    ['AI & Semis', 'ai & semis', 'case folds', 200, ''],
    ['AI & Semis', '  AI & SEMIS  ', 'outer spaces of from are ignored', 200, ''],
    [' AI & Semis ', 'AI & Semis', 'stored outer spaces are ignored', 200, ''],
    ['AI & Semis', 'AI &  Semis', 'inner spaces count', 404, ''],
    ['AI &  Semis', 'AI & Semis', 'inner spaces count the other way', 404, ''],
    ['น้ำมัน', 'น้ำมัน', 'Thai matches itself', 200, ''],
    // Thai has no canonical decomposition (NFC and NFD of it are the same text), so accented Latin stands in for the case.
    ['Caf\u00e9', 'Cafe\u0301', 'NFC against NFD is not normalised (proposed)', 404, 'proposed'],
    ['İstanbul Oil', 'i̇stanbul oil', 'dotted capital I folds to i plus U+0307', 200, ''],
    ['ΟΔΟΣ', 'οδοσ', 'final sigma is a different key (proposed)', 404, 'proposed'],
    ['Straße', 'STRASSE', 'sharp s does not fold to ss', 404, ''],
  ]
  const HITS = MATCHES.filter((m) => m[3] === 200)
  const MISSES = MATCHES.filter((m) => m[3] === 404)
  it.each(HITS)('TC-A-903 stored %j with from %j: %s -> %i', async (stored, from) => {
    const { userId, app } = await fresh()
    const id = await seedChain(t.handle, userId, 'M903', stored)

    const res = await renameVia(app, { from, to: 'Renamed' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ name: 'Renamed', changed: 1, merged: false })
    expect((await readRows(t.handle, [id]))[0]?.value_chain).toBe('Renamed')
  })

  it.each(MISSES)('TC-A-903 stored %j with from %j: %s -> %i', async (stored, from) => {
    const { userId, app } = await fresh()
    const id = await seedChain(t.handle, userId, 'M903', stored)

    const res = await renameVia(app, { from, to: 'Renamed' })

    expect(res.statusCode).toBe(404)
    expect(res.json().code).toBe('chain_not_found')
    expect((await readRows(t.handle, [id]))[0]?.value_chain).toBe(stored)
  })

  it('TC-A-904 the new name is trimmed, inner spaces and case are kept, and a different key is not merged', async () => {
    const { userId, app } = await fresh()
    const old = await seedChain(t.handle, userId, 'O904', 'Old')
    const other = await seedChain(t.handle, userId, 'P904', 'ai & semis')

    const res = await renameVia(app, { from: 'Old', to: '  AI &  Semis  ' })

    expect(res.json()).toEqual({ name: 'AI &  Semis', changed: 1, merged: false })
    const [a, b] = await readRows(t.handle, [old, other])
    expect(a?.value_chain).toBe('AI &  Semis')
    expect(b?.value_chain).toBe('ai & semis')
    expect(movedAfter2020(b)).toBe(false)
  })

  const emoji = '\u{1F600}'
  const thai60 = 'ก'.repeat(30) + 'ก้'.repeat(15) // 60 code points with combining marks
  const BOUNDS: [string, unknown, 200 | 400][] = [
    ['1 character', 'A', 200],
    ['60 characters', 'a'.repeat(60), 200],
    ['61 characters', 'a'.repeat(61), 400],
    ['60 emoji (120 UTF-16 units)', emoji.repeat(60), 200],
    ['61 emoji', emoji.repeat(61), 400],
    ['60 Thai code points with combining marks', thai60, 200],
    ['empty', '', 400],
    ['spaces only', '   ', 400],
    ['null', null, 400],
    ['a number', 42, 400],
    ['60 characters with 5 outer spaces', `     ${'a'.repeat(60)}`, 200],
  ]
  it.each(BOUNDS.filter((b) => b[2] === 200))('TC-A-905 a new name of %s answers %i', async (_label, to) => {
    const { userId, app } = await fresh()
    const id = await seedChain(t.handle, userId, 'B905', 'Old')

    const res = await renameVia(app, { from: 'Old', to })

    expect(res.statusCode).toBe(200)
    const row = (await readRows(t.handle, [id]))[0]
    expect(row?.value_chain).toBe((to as string).trim())
    const { rows } = await t.handle.pool.query('select char_length(value_chain) as n from app.stocks where id = $1', [id])
    expect(rows[0].n).toBe(Array.from((to as string).trim()).length)
  })

  it.each(BOUNDS.filter((b) => b[2] === 400))('TC-A-905 a new name of %s answers %i', async (_label, to) => {
    const { userId, app } = await fresh()
    const id = await seedChain(t.handle, userId, 'B905', 'Old')

    const res = await renameVia(app, { from: 'Old', to })

    expect(res.statusCode).toBe(400)
    const row = (await readRows(t.handle, [id]))[0]
    expect(res.json().code).toBe('validation_failed')
    expect(res.json().errors.map((e: { path: string }) => e.path)).toEqual(['to'])
    expect(row?.value_chain).toBe('Old')
    expect(movedAfter2020(row)).toBe(false)
  })

  it('TC-A-906 a 60 character from matches, a 61 character, empty, blank, missing or numeric from is a 400 on from', async () => {
    const { userId, app } = await fresh()
    const long = 'c'.repeat(60)
    await seedChain(t.handle, userId, 'L906', long)
    await seedChain(t.handle, userId, 'X906', 'X')
    const bad: unknown[] = ['c'.repeat(61), '', '   ', undefined, 7]

    for (const from of bad) {
      const res = await renameVia(app, from === undefined ? { to: 'Y' } : { from, to: 'Y' })
      expect([String(from), res.statusCode, res.json().errors.map((e: { path: string }) => e.path)]).toEqual([String(from), 400, ['from']])
    }
    const ok = await renameVia(app, { from: long, to: 'Long' })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().changed).toBe(1)
  })

  it('TC-A-907 renaming a chain to its own exact name changes nothing and writes nothing', async () => {
    const { userId, app } = await fresh()
    const ids = [await seedChain(t.handle, userId, 'A907', 'Banks'), await seedChain(t.handle, userId, 'B907', 'Banks'), await seedChain(t.handle, userId, 'C907', 'Banks')]

    const res = await renameVia(app, { from: 'Banks', to: 'Banks' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ name: 'Banks', changed: 0, merged: false })
    expect((await readRows(t.handle, ids)).some(movedAfter2020)).toBe(false)
    // The neighbouring case: a differently cased from still matches and is not a no-op for a differently cased to.
    const cased = await renameVia(app, { from: 'banks', to: 'BANKS' })
    expect(cased.json()).toMatchObject({ changed: 3, merged: false })
  })

  it('TC-A-908 merge true with nothing to merge is a plain rename', async () => {
    const { userId, app } = await fresh()
    const ids = [await seedChain(t.handle, userId, 'A908', 'Banks'), await seedChain(t.handle, userId, 'B908', 'Banks')]

    const res = await renameVia(app, { from: 'Banks', to: 'Finance', merge: true })

    expect(res.json()).toEqual({ name: 'Finance', changed: 2, merged: false })
    expect((await readRows(t.handle, ids)).map((r) => r.value_chain)).toEqual(['Finance', 'Finance'])
  })

  it('TC-A-909 a missing source chain is 404 before the merge check and never names the target', async () => {
    const { userId, app } = await fresh()
    const ids = [await seedChain(t.handle, userId, 'A909', 'Finance'), await seedChain(t.handle, userId, 'B909', 'Finance')]

    for (const merge of [undefined, true]) {
      const res = await renameVia(app, { from: 'Ghost', to: 'Finance', ...(merge && { merge }) })
      expect(res.statusCode).toBe(404)
      expect(res.json().code).toBe('chain_not_found')
      expect(res.payload).not.toMatch(/Finance|existing/i)
    }
    expect((await readRows(t.handle, ids)).some(movedAfter2020)).toBe(false)
  })

  async function seedMerge(userId: string) {
    const ids: string[] = []
    for (let i = 0; i < 3; i++) ids.push(await seedChain(t.handle, userId, `S${i}A`, 'AI semis', { position: 'Upstream', holding: { shares: '1.5', cost: '2.25' } }))
    ids.push(await seedChain(t.handle, userId, 'EA', 'ai & semis', { createdAt: '2026-01-01T00:00:00Z', position: 'Midstream' }))
    for (let i = 0; i < 7; i++) ids.push(await seedChain(t.handle, userId, `O${i}B`, 'AI & Semis', { createdAt: `2026-02-0${i + 1}T00:00:00Z`, position: 'Downstream' }))
    return ids
  }

  it('TC-A-910 renaming onto another chain without merge is 409 with the existing name and count and writes nothing', async () => {
    const { userId, app } = await fresh()
    const ids = await seedMerge(userId)
    const before = await snapshotOf(t.handle, userId)

    const res = await renameVia(app, { from: 'AI semis', to: 'AI & SEMIS' })

    expect(res.statusCode).toBe(409)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.headers['cache-control']).toBe('no-store')
    const body = res.json()
    expect(body).toMatchObject({ status: 409, code: 'chain_exists', existingName: 'ai & semis', existingCount: 8 })
    expect(typeof body.requestId).toBe('string')
    expect(await snapshotOf(t.handle, userId)).toEqual(before)
    expect((await readRows(t.handle, ids)).some(movedAfter2020)).toBe(false)
  })

  it('TC-A-911 a confirmed merge rewrites both chains, marks the lens manual and keeps positions and holdings', async () => {
    const { userId, app } = await fresh()
    const ids = await seedMerge(userId)
    const holdingsBefore = (await t.handle.pool.query('select * from app.holdings where user_id = $1 order by stock_id', [userId])).rows
    const positionsBefore = (await readRows(t.handle, ids)).map((r) => r.value_chain_position)

    const res = await renameVia(app, { from: 'AI semis', to: 'AI & SEMIS', merge: true })

    expect(res.json()).toEqual({ name: 'AI & SEMIS', changed: 11, merged: true })
    const rows = await readRows(t.handle, ids)
    expect(rows.every((r) => r.value_chain === 'AI & SEMIS' && r.lens_sources.valueChain === 'manual' && movedAfter2020(r))).toBe(true)
    expect(rows.map((r) => r.value_chain_position)).toEqual(positionsBefore)
    expect((await t.handle.pool.query('select * from app.holdings where user_id = $1 order by stock_id', [userId])).rows).toEqual(holdingsBefore)
  })

  it('TC-A-912 unifying spellings of one chain needs no merge flag and leaves exact rows alone', async () => {
    const { userId, app } = await fresh()
    const exact = [await seedChain(t.handle, userId, 'A912', 'AI & Semis'), await seedChain(t.handle, userId, 'B912', 'AI & Semis')]
    const odd = [await seedChain(t.handle, userId, 'C912', 'ai & semis'), await seedChain(t.handle, userId, 'D912', 'Ai & semis')]
    const banks = await seedChain(t.handle, userId, 'E912', 'Banks')

    const res = await renameVia(app, { from: 'ai & semis', to: 'AI & Semis' })

    expect(res.json()).toEqual({ name: 'AI & Semis', changed: 2, merged: false })
    expect((await readRows(t.handle, exact)).some(movedAfter2020)).toBe(false)
    expect((await readRows(t.handle, odd)).every((r) => r.value_chain === 'AI & Semis' && movedAfter2020(r))).toBe(true)
    expect(movedAfter2020((await readRows(t.handle, [banks]))[0])).toBe(false)
  })

  it('TC-A-913 two users with the same names never see, count or change each other', async () => {
    const u = await fresh()
    const v = await fresh()
    const mine = await seedChain(t.handle, u.userId, 'U1-913', 'Banks')
    const theirs: string[] = []
    for (let i = 0; i < 5; i++) theirs.push(await seedChain(t.handle, v.userId, `V${i}-913`, 'Banks'))
    theirs.push(await seedChain(t.handle, v.userId, 'VF1-913', 'Finance'), await seedChain(t.handle, v.userId, 'VF2-913', 'Finance'), await seedChain(t.handle, v.userId, 'VO-913', 'Oil'))
    const vBefore = await snapshotOf(t.handle, v.userId)

    const first = await renameVia(u.app, { from: 'Banks', to: 'Finance' })
    const second = await renameVia(u.app, { from: 'Oil', to: 'Energy' })

    expect(first.statusCode).toBe(200)
    expect(first.json()).toEqual({ name: 'Finance', changed: 1, merged: false })
    expect(second.statusCode).toBe(404)
    expect(await snapshotOf(t.handle, v.userId)).toEqual(vBefore)
    for (const res of [first, second]) expect(res.payload).not.toMatch(/Oil|\b5\b|\b2\b/)

    const own = await renameVia(v.app, { from: 'Banks', to: 'Finance', merge: true })
    expect(own.json()).toEqual({ name: 'Finance', changed: 5, merged: true })
    const [u1] = await readRows(t.handle, [mine])
    expect(u1?.value_chain).toBe('Finance')
    const names = (await t.handle.pool.query('select distinct value_chain from app.stocks where user_id = $1', [u.userId])).rows.map((r) => r.value_chain)
    expect(names).toEqual(['Finance'])
  })

  it('TC-A-914 a stale page gets 409 with the server figures, then the confirmed merge covers the new stock', async () => {
    const { userId, app } = await fresh()
    const ids = [await seedChain(t.handle, userId, 'A914', 'Banks'), await seedChain(t.handle, userId, 'B914', 'Banks'), await seedChain(t.handle, userId, 'C914', 'Banks')]
    // Another tab adds a stock whose chain is "finance", after the page was loaded.
    const created = await app.inject({
      method: 'POST',
      url: '/stocks',
      payload: { market: 'US', ticker: 'FIN914', exchange: 'NASDAQ', name: 'Finance Co', valueChain: 'finance', valueChainPosition: 'Downstream' },
    })
    expect(created.statusCode).toBe(201)

    const refused = await renameVia(app, { from: 'Banks', to: 'Finance', merge: false })
    const merged = await renameVia(app, { from: 'Banks', to: 'Finance', merge: true })

    expect(refused.statusCode).toBe(409)
    expect(refused.json()).toMatchObject({ existingName: 'finance', existingCount: 1 })
    expect(merged.json()).toEqual({ name: 'Finance', changed: 4, merged: true })
    const names = [...(await readRows(t.handle, ids)).map((r) => r.value_chain), created.json().valueChain]
    expect(names.slice(0, 3)).toEqual(['Finance', 'Finance', 'Finance'])
    expect((await stocksOf(app)).filter((s) => s.valueChain === 'Finance')).toHaveLength(4)
  })

  it('TC-A-915 the rows at save time decide: a moved stock stays, a new one joins, a vanished chain is 404', async () => {
    const { userId, app } = await fresh()
    const [s1, s2, s3] = [await seedChain(t.handle, userId, 'S1-915', 'AI semis'), await seedChain(t.handle, userId, 'S2-915', 'AI semis'), await seedChain(t.handle, userId, 'S3-915', 'AI semis')]
    const patched = await app.inject({ method: 'PATCH', url: `/stocks/${s3}`, payload: { valueChain: 'Other' } })
    const added = await app.inject({
      method: 'POST',
      url: '/stocks',
      payload: { market: 'US', ticker: 'S4915', exchange: 'NASDAQ', name: 'S4', valueChain: 'ai semis' },
    })
    expect([patched.statusCode, added.statusCode]).toEqual([200, 201])

    const res = await renameVia(app, { from: 'AI semis', to: 'AI & Semis' })

    expect(res.json().changed).toBe(3)
    expect((await readRows(t.handle, [s1, s2, s3])).map((r) => r.value_chain)).toEqual(['AI & Semis', 'AI & Semis', 'Other'])
    for (const id of [s1, s2, added.json().id]) await app.inject({ method: 'PATCH', url: `/stocks/${id}`, payload: { valueChain: 'Elsewhere' } })
    const gone = await renameVia(app, { from: 'AI & Semis', to: 'Whatever' })
    expect(gone.statusCode).toBe(404)
    expect(gone.json().code).toBe('chain_not_found')
  })

  it('TC-A-919 lens_sources keeps every other key and gains valueChain manual', async () => {
    const { userId, app } = await fresh()
    const sources: object[] = [{}, { valueChain: 'manual' }, { economicCycle: 'default', valueChain: 'manual' }, { economicCycle: 'manual', size: 'manual' }]
    const ids: string[] = []
    for (const [i, s] of sources.entries()) ids.push(await seedChain(t.handle, userId, `L${i}-919`, 'Old', { sources: s }))

    const res = await renameVia(app, { from: 'Old', to: 'New' })

    expect(res.json().changed).toBe(4)
    const rows = await readRows(t.handle, ids)
    expect(rows.map((r) => r.lens_sources)).toEqual(sources.map((s) => ({ ...s, valueChain: 'manual' })))
  })

  it('TC-A-920 renamed stocks still satisfy the stock rules and a later PATCH keeps the name', async () => {
    const { userId, app } = await fresh()
    const { ids } = await seedVcA(t.handle, userId)

    const res = await renameVia(app, { from: 'Oil & Gas', to: 'Energy' })

    expect(res.json()).toEqual({ name: 'Energy', changed: 3, merged: false })
    const stocks = await stocksOf(app)
    const invalid = stocks
      .filter((x) => x.valueChain === 'Energy')
      .filter((s) => !StockInput.safeParse({ market: s.market, ticker: s.ticker, exchange: s.exchange, name: s.name, valueChain: s.valueChain, valueChainPosition: s.valueChainPosition }).success)
    expect(invalid.map((s) => s.ticker)).toEqual([])
    expect(stocks.filter((s) => s.valueChain === 'Energy')).toHaveLength(3)
    const patch = await app.inject({ method: 'PATCH', url: `/stocks/${ids.PTTEP}`, payload: { valueChainPosition: 'Downstream' } })
    expect(patch.statusCode).toBe(200)
    expect(patch.json()).toMatchObject({ valueChain: 'Energy', valueChainPosition: 'Downstream' })
  })
})

describe('chains rename over HTTP', () => {
  it('TC-A-925 content types, no-store, security headers and the request id', async () => {
    const { userId, app } = await fresh()
    await seedChain(t.handle, userId, 'A925', 'Banks')
    await seedChain(t.handle, userId, 'B925', 'Finance')
    const send = (payload: unknown) => app.inject({ method: 'POST', url: '/chains/rename', headers: { 'x-request-id': 'req-925' }, payload: payload as object })

    const ok = await send({ from: 'Banks', to: 'Lenders' })
    const bad = await send({ from: 'Banks', to: '' })
    const missing = await send({ from: 'Ghost', to: 'X' })
    const exists = await send({ from: 'Lenders', to: 'Finance' })

    expect([ok, bad, missing, exists].map((r) => r.statusCode)).toEqual([200, 400, 404, 409])
    expect(ok.headers['content-type']).toContain('application/json')
    expect(ok.headers['content-type']).not.toContain('problem')
    for (const res of [bad, missing, exists]) expect(res.headers['content-type']).toContain('application/problem+json')
    for (const res of [ok, bad, missing, exists]) {
      expect(res.headers['cache-control']).toBe('no-store')
      expect(res.headers['x-request-id']).toBe('req-925')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
    }
  })

  it('TC-A-926 no other method or path under /chains answers', async () => {
    const calls: [string, string][] = [
      ['GET', '/chains'],
      ['GET', '/chains/rename'],
      ['PUT', '/chains/rename'],
      ['PATCH', '/chains/rename'],
      ['DELETE', '/chains/rename'],
      ['POST', '/chains/Banks'],
    ]
    for (const [method, url] of calls) {
      const res = await t.app.inject({ method: method as 'GET', url, payload: method === 'GET' ? undefined : {} })
      expect(res.statusCode, `${method} ${url}`).toBe(404)
      expect(res.headers['content-type']).toContain('application/problem+json')
    }
    // Fastify's default (no ignoreTrailingSlash): a trailing slash is another path, as in every module.
    const slash = await t.app.inject({ method: 'POST', url: '/chains/rename/', payload: { from: 'A', to: 'B' } })
    expect(slash.statusCode).toBe(404)
  })

  it('TC-A-927 malformed, wrongly typed and oversized bodies are 4xx problems, never 500', async () => {
    const { userId, app } = await fresh()
    await seedChain(t.handle, userId, 'A927', 'A')
    const json = { 'content-type': 'application/json' }
    const post = (payload: string | object | undefined, headers: Record<string, string> = json) => app.inject({ method: 'POST', url: '/chains/rename', headers, ...(payload !== undefined && { payload }) })

    const malformed = await post('{"from":')
    const empty = await post(undefined)
    const plain = await post('from=A&to=B', { 'content-type': 'text/plain' })
    const array = await post([])
    const none = await post({})
    const nullMerge = await post({ from: 'A', to: 'B', merge: null })
    const stringMerge = await post({ from: 'A', to: 'B', merge: 'true' })
    const owner = await post({ from: 'A', to: 'B', userId: 'x' })
    const objects = await post({ from: {}, to: [] })
    const huge = await post({ from: 'A', to: 'B', pad: 'x'.repeat(2 * 1024 * 1024) })

    // Malformed JSON and an empty body are Fastify parser errors (400 bad_request); text/plain is also a 400 (proposed: 415).
    expect([malformed, empty].map((r) => [r.statusCode, r.json().code])).toEqual([[400, 'bad_request'], [400, 'bad_request']])
    expect(plain.statusCode).toBe(400)
    expect([array.statusCode, array.json().code]).toEqual([400, 'validation_failed'])
    for (const [res, paths] of [
      [none, ['from', 'to']],
      [nullMerge, ['merge']],
      [stringMerge, ['merge']],
      [owner, ['userId']],
      [objects, ['from', 'to']],
    ] as const) {
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('validation_failed')
      expect(res.json().errors.map((e: { path: string }) => e.path).sort()).toEqual([...paths].sort())
    }
    expect([400, 413]).toContain(huge.statusCode)
    expect(huge.statusCode).not.toBe(500)
    const row = await t.handle.pool.query('select value_chain from app.stocks where user_id = $1', [userId])
    expect(row.rows[0].value_chain).toBe('A')
  })

  it('TC-A-928 backups carry the new name and nothing else changes', async () => {
    const { userId, app } = await fresh()
    await seedVcA(t.handle, userId)
    const before = (await app.inject({ url: '/exports/backup.json' })).json()

    await renameVia(app, { from: 'Oil & Gas', to: 'Energy' })

    const json = (await app.inject({ url: '/exports/backup.json' })).json()
    const csv = (await app.inject({ url: '/exports/backup.csv' })).payload
    expect(json.formatVersion).toBe(before.formatVersion)
    expect(Object.keys(json)).toEqual(Object.keys(before))
    const energy = json.stocks.filter((s: { valueChain: string | null }) => s.valueChain === 'Energy')
    expect(energy.map((s: { ticker: string }) => s.ticker).sort()).toEqual(['BCP', 'PTT', 'PTTEP'])
    const strip = (s: Record<string, unknown>) => ({ ...s, valueChain: null, updatedAt: null, lensSources: null })
    expect(json.stocks.map(strip)).toEqual(before.stocks.map(strip))
    const lines = csv.replace(/^﻿/, '').split('\r\n')
    const col = (lines[0] as string).split(',').indexOf('value_chain')
    expect(col).toBeGreaterThan(-1)
    expect(lines.filter((l) => l.includes('Energy'))).toHaveLength(3)
    expect(csv).not.toContain('Oil & Gas')
  })

  it('TC-A-929 no chains table, no chain migration and no chain schema file', async () => {
    const tables = (await t.handle.pool.query("select table_name from information_schema.tables where table_schema = 'app' order by 1")).rows.map((r) => r.table_name)
    expect(tables.filter((n: string) => /chain/i.test(n))).toEqual([])
    expect(tables).toEqual(expect.arrayContaining(['holdings', 'list_stocks', 'lists', 'stocks', 'theses', 'user_settings']))
    const cols = (await t.handle.pool.query("select column_name from information_schema.columns where table_schema = 'app' and column_name ilike '%chain%'")).rows.map((r) => r.column_name)
    expect(cols.sort()).toEqual(['value_chain', 'value_chain_position'])
    const migrations = readdirSync(join(import.meta.dirname, '../../../../../supabase/migrations'))
    expect(migrations.filter((f) => /chain/i.test(f))).toEqual([])
    expect(migrations.filter((f) => /_theses\.sql$/.test(f))).toHaveLength(1)
    const schemaFiles = readdirSync(join(import.meta.dirname, '../../db/schema'))
    expect(schemaFiles.filter((f) => /chain/i.test(f))).toEqual([])
  })
})
