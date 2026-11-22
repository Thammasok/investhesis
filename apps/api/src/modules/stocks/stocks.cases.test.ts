import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LENS_VALUES } from '@investhesis/domain'
import { buildTestApp, newUserId, type TestApp } from '../../../test/db.ts'
import { seedList, seedMembership } from '../../../test/seed.ts'

/** Stock Lists T-013: the TC-A cases for the stocks API that the dev-plan cases do not already pin. */
let t: TestApp

beforeAll(async () => {
  t = await buildTestApp()
})
afterAll(() => t.cleanup())

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'
const call = (a: FastifyInstance, method: Method, url: string, payload?: unknown) =>
  a.inject({ method, url, ...(payload !== undefined && { payload: payload as object }) })
/** A fresh user per test, so tickers never collide between cases. */
const fresh = async () => {
  const userId = newUserId()
  return { userId, app: await t.appFor(userId) }
}
const post = (a: FastifyInstance, body: object) => call(a, 'POST', '/stocks', body)
const us = (ticker: string, extra: object = {}) => ({ ticker, market: 'US', exchange: 'NYSE', name: `Name ${ticker}`, ...extra })
const th = (ticker: string, extra: object = {}) => ({ ticker, market: 'TH', exchange: 'SET', name: `ชื่อ ${ticker}`, ...extra })
const n = async (sql: string, args: unknown[] = []) => Number((await t.handle.pool.query(sql, args)).rows[0].n)
const stockCount = (userId: string) => n('select count(*) n from app.stocks where user_id = $1', [userId])
const paths = (res: { json: () => { errors?: { path: string }[] } }) => (res.json().errors ?? []).map((e) => e.path)
const UNKNOWN_ID = '0192f0a0-0000-7000-8000-0000000000fe'

describe('TC-A-107 create a TH stock', () => {
  it('TC-A-107 derives currency and ticker, fills unset lenses and answers a UUIDv7 with Location', async () => {
    const { app } = await fresh()

    const res = await post(app, { ticker: ' pttep ', market: 'TH', exchange: 'mai', name: 'บมจ. ปตท.', indexMembership: ['SET100'] })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body).toMatchObject({
      ticker: 'PTTEP',
      currency: 'THB',
      exchange: 'mai',
      indexMembership: ['SET100'],
      gicsSector: null,
      setIndustryGroup: null,
      size: null,
      customers: [],
      revenueTypes: [],
      themes: [],
      lensSources: {},
      listIds: [],
    })
    expect(body.createdAt).toBe(body.updatedAt)
    expect(body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(res.headers['location']).toBe(`/stocks/${body.id}`)
    expect((await call(app, 'GET', `/stocks/${body.id}`)).json()).toEqual(body)
  })
})

describe('TC-A-108 stock identity validation', () => {
  type Row = [label: string, body: object, status: number, path?: string]
  const rows: Row[] = [
    ['ticker 1 char', us('A'), 201],
    ['ticker 12 chars', us('A'.repeat(12)), 201],
    ['ticker 13 chars', us('A'.repeat(13)), 400, 'ticker'],
    ['ticker empty', us(''), 400, 'ticker'],
    ['ticker with a space', us('A B'), 400, 'ticker'],
    ['ticker starting with a dot', us('.ABC'), 400, 'ticker'],
    ['Cyrillic ticker', us('АВС'), 400, 'ticker'],
    ['name 1 char', us('N1', { name: 'x' }), 201],
    ['name 200 chars', us('N200', { name: 'n'.repeat(200) }), 201],
    ['name 201 chars', us('N201', { name: 'n'.repeat(201) }), 400, 'name'],
    ['name empty', us('NE', { name: '' }), 400, 'name'],
    ['Thai name 200 chars', us('NTH', { name: 'ก'.repeat(200) }), 201],
    ['market JP', us('MJP', { market: 'JP' }), 400, 'market'],
    ['SET with US', us('XSET', { exchange: 'SET' }), 400, 'exchange'],
    ['NASDAQ with TH', th('XNAS', { exchange: 'NASDAQ' }), 400, 'exchange'],
    ['currency in the body', us('CUR', { currency: 'EUR' }), 400, 'currency'],
    ['ticker missing', { market: 'US', exchange: 'NYSE', name: 'x' }, 400, 'ticker'],
    ['market missing', { ticker: 'NOM', exchange: 'NYSE', name: 'x' }, 400, 'market'],
    ['exchange missing', { ticker: 'NOX', market: 'US', name: 'x' }, 400, 'exchange'],
    ['name missing', { ticker: 'NON', market: 'US', exchange: 'NYSE' }, 400, 'name'],
  ]

  it.each(rows.filter((r) => r[2] === 201))('TC-A-108 accepts: %s', async (_label, body) => {
    const { app } = await fresh()

    const res = await post(app, body)

    expect(res.statusCode).toBe(201)
    expect(res.json().currency).toBe('USD')
  })

  it.each(rows.filter((r) => r[2] === 400))('TC-A-108 refuses: %s', async (_label, body, _status, path) => {
    const { app, userId } = await fresh()

    const res = await post(app, body)

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('validation_failed')
    expect(paths(res)).toContain(path)
    expect(await stockCount(userId)).toBe(0)
  })
})

describe('TC-A-109 index membership', () => {
  const rows: [string, object, number][] = [
    ['US indexes', us('IX1', { indexMembership: ['S&P 500', 'Nasdaq-100'] }), 201],
    ['TH indexes', th('IX2', { indexMembership: ['SET50', 'SET100'] }), 201],
    ['no index', us('IX3', { indexMembership: [] }), 201],
    ['TH index on a US stock', us('IX4', { indexMembership: ['SET50'] }), 400],
    ['US index on a TH stock', th('IX5', { indexMembership: ['S&P 500'] }), 400],
    ['unknown index', us('IX6', { indexMembership: ['FTSE'] }), 400],
  ]
  it.each(rows)('TC-A-109 %s', async (_label, body, status) => {
    const { app } = await fresh()

    const res = await post(app, body)

    const wanted = (body as { indexMembership: string[] }).indexMembership
    expect(res.statusCode).toBe(status)
    // Accepted rows keep the order they were sent in; refused rows name the field.
    expect(status === 201 ? res.json().indexMembership : paths(res).map((p) => p.split('.')[0])).toEqual(status === 201 ? wanted : ['indexMembership'])
  })
})

describe('TC-A-110 lens values', () => {
  const singles = ['size', 'style', 'economicCycle', 'lynchType', 'lifeCycle', 'moat', 'volatility'] as const
  const invalid: Record<string, string> = { size: 'Huge', style: 'Dividend ', economicCycle: 'growth', lynchType: 'Retail', lifeCycle: 'Old', moat: 'moat', volatility: 'Extreme' }

  it.each(singles)('TC-A-110 %s accepts every canonical value and rejects others', async (field) => {
    const { app, userId } = await fresh()
    const saved = await Promise.all(
      LENS_VALUES[field].map(async (value, i) => {
        const res = await post(app, us(`L${field.slice(0, 3).toUpperCase()}${i}`, { [field]: value }))
        return [res.statusCode, res.json()[field]]
      }),
    )
    expect(saved).toEqual(LENS_VALUES[field].map((value) => [201, value]))
    const before = await stockCount(userId)

    const bad = await post(app, us('LBAD', { [field]: invalid[field] }))

    expect(bad.statusCode).toBe(400)
    expect(paths(bad)).toContain(field)
    expect(await stockCount(userId)).toBe(before)
  })

  it('TC-A-110 customers and revenueTypes take only canonical members', async () => {
    const { app } = await fresh()

    const ok = await post(app, us('LCR', { customers: ['B2B', 'B2C', 'Government'], revenueTypes: ['Subscription', 'Interest'] }))
    const badCustomer = await post(app, us('LCR2', { customers: ['Retail'] }))
    const badRevenue = await post(app, us('LCR3', { revenueTypes: ['product sale'] }))

    expect(ok.statusCode).toBe(201)
    expect(ok.json()).toMatchObject({ customers: ['B2B', 'B2C', 'Government'], revenueTypes: ['Subscription', 'Interest'] })
    expect(paths(badCustomer)).toContain('customers.0')
    expect(paths(badRevenue)).toContain('revenueTypes.0')
  })

  it('TC-A-110 a stock with every lens set round-trips field by field', async () => {
    const { app } = await fresh()
    const body = us('FULLN', {
      market: 'US',
      exchange: 'NASDAQ',
      indexMembership: ['S&P 500', 'Nasdaq-100'],
      gicsSector: 'Information Technology',
      valueChain: 'AI & Semis',
      valueChainPosition: 'Midstream',
      size: 'Mega',
      style: 'Growth',
      economicCycle: 'Sensitive',
      lynchType: 'Fast Grower',
      lifeCycle: 'Growth',
      customers: ['B2B'],
      revenueTypes: ['Product sale'],
      moat: 'Intangibles',
      themes: ['AI', 'Data center'],
      volatility: 'High',
    })

    const res = await post(app, body)

    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject(body)
    expect((await call(app, 'GET', `/stocks/${res.json().id}`)).json()).toMatchObject(body)
  })

  it('TC-A-110 a stock with every lens null or empty saves with no sources', async () => {
    const { app } = await fresh()
    const nulls = Object.fromEntries(singles.map((f) => [f, null]))

    const res = await post(app, us('NONES', { ...nulls, gicsSector: null, valueChain: null, valueChainPosition: null, customers: [], revenueTypes: [], themes: [] }))

    expect(res.statusCode).toBe(201)
    expect(res.json().lensSources).toEqual({})
    for (const f of singles) expect(res.json()[f]).toBeNull()
  })
})

describe('TC-A-111 sector rules per market', () => {
  type Row = [string, object, number, string?]
  const rows: Row[] = [
    ['US IT sector', us('S1', { gicsSector: 'Information Technology' }), 201],
    ['US with a SET group', us('S2', { setIndustryGroup: 'Services' }), 400, 'setIndustryGroup'],
    ['US with a non-GICS sector', us('S3', { gicsSector: 'Technology' }), 400, 'gicsSector'],
    ['TH group and GICS', th('S4', { setIndustryGroup: 'Resources', gicsSector: 'Energy' }), 201],
    ['TH group only', th('S5', { setIndustryGroup: 'Resources' }), 400, 'gicsSector'],
    ['TH GICS only', th('S6', { gicsSector: 'Energy' }), 400, 'setIndustryGroup'],
    ['TH group with a GICS name', th('S7', { setIndustryGroup: 'Information Technology', gicsSector: 'Energy' }), 400, 'setIndustryGroup'],
    ['TH no sector', th('S8'), 201],
    ['TH Agro & Food', th('S9', { setIndustryGroup: 'Agro & Food Industry', gicsSector: 'Consumer Staples' }), 201],
  ]
  it.each(rows)('TC-A-111 %s', async (_label, body, status, path) => {
    const { app } = await fresh()

    const res = await post(app, body)

    expect(res.statusCode).toBe(status)
    expect(status === 400 ? paths(res).includes(path as string) : true).toBe(true)
    expect(status === 201 && (body as { market: string }).market === 'US' ? res.json().setIndustryGroup : null).toBeNull()
  })

  it('TC-A-111 all eight SET industry groups are accepted', async () => {
    const { app } = await fresh()
    const statuses = await Promise.all(
      LENS_VALUES.setIndustryGroup.map(async (group, i) => (await post(app, th(`G${i}`, { setIndustryGroup: group, gicsSector: 'Energy' }))).statusCode),
    )

    expect(statuses).toEqual(LENS_VALUES.setIndustryGroup.map(() => 201))
  })

  it('TC-A-111 a TH patch that sets only one of the two sector fields is refused', async () => {
    const { app } = await fresh()
    const id = (await post(app, th('PAT', { setIndustryGroup: 'Resources', gicsSector: 'Energy' }))).json().id

    const clearOne = await call(app, 'PATCH', `/stocks/${id}`, { gicsSector: null })
    const clearGroup = await call(app, 'PATCH', `/stocks/${id}`, { setIndustryGroup: null })
    const both = await call(app, 'PATCH', `/stocks/${id}`, { setIndustryGroup: 'Services', gicsSector: 'Utilities' })
    const neither = await call(app, 'PATCH', `/stocks/${id}`, { setIndustryGroup: null, gicsSector: null })

    // A patch that would leave exactly one of the two set is refused; changing one valid value keeps the pair (deviation D-3).
    expect(clearOne.statusCode).toBe(400)
    expect(clearGroup.statusCode).toBe(400)
    expect(both.statusCode).toBe(200)
    expect(neither.statusCode).toBe(200)
  })
})

describe('TC-A-112 value chain', () => {
  const rows: [string, object, number][] = [
    ['name 60 chars with a position', us('V1', { valueChain: 'c'.repeat(60), valueChainPosition: 'Upstream' }), 201],
    ['name 61 chars', us('V2', { valueChain: 'c'.repeat(61), valueChainPosition: 'Upstream' }), 400],
    ['position without a name', us('V3', { valueChainPosition: 'Upstream' }), 400],
    ['position None without a name', us('V4', { valueChainPosition: 'None' }), 201],
    ['name only', us('V5', { valueChain: 'Oil & Gas' }), 201],
    ['unknown position', us('V6', { valueChain: 'Oil & Gas', valueChainPosition: 'Top' }), 400],
  ]
  it.each(rows)('TC-A-112 %s', async (label, body, status) => {
    const { app } = await fresh()

    const res = await post(app, body)

    expect(res.statusCode).toBe(status)
    expect(status === 400 ? paths(res).includes(label === 'unknown position' ? 'valueChainPosition' : 'valueChain') : true).toBe(true)
  })

  it('TC-A-112 name only stores a null position', async () => {
    const { app } = await fresh()

    const res = await post(app, us('V5B', { valueChain: 'Oil & Gas' }))

    expect(res.json()).toMatchObject({ valueChain: 'Oil & Gas', valueChainPosition: null })
  })

  it.each(LENS_VALUES.valueChainPosition)('TC-A-112 position %s is accepted with a name', async (position) => {
    const { app } = await fresh()

    const res = await post(app, us('VP', { valueChain: 'Oil & Gas', valueChainPosition: position }))

    expect(res.statusCode).toBe(201)
  })

  it('TC-A-112 clearing the name needs the position cleared in the same patch', async () => {
    const { app } = await fresh()
    const id = (await post(app, us('VPATCH', { valueChain: 'Oil & Gas', valueChainPosition: 'Upstream' }))).json().id

    const alone = await call(app, 'PATCH', `/stocks/${id}`, { valueChain: null })
    const both = await call(app, 'PATCH', `/stocks/${id}`, { valueChain: null, valueChainPosition: null })

    expect(alone.statusCode).toBe(400)
    expect(both.statusCode).toBe(200)
    expect(both.json()).toMatchObject({ valueChain: null, valueChainPosition: null })
  })
})

describe('TC-A-113 themes', () => {
  const rows: [string, string[], number][] = [
    ['0 themes', [], 201],
    ['1 theme', ['AI'], 201],
    ['20 themes', Array.from({ length: 20 }, (_, i) => `t${i}`), 201],
    ['21 themes', Array.from({ length: 21 }, (_, i) => `t${i}`), 400],
    ['40-char tag', ['t'.repeat(40)], 201],
    ['41-char tag', ['t'.repeat(41)], 400],
    ['empty tag', [''], 400],
    ['blank tag', ['   '], 400],
    ['tag with a space', ['Energy security'], 201],
    ['Thai tag', ['พลังงาน'], 201],
  ]
  it.each(rows)('TC-A-113 %s', async (_label, themes, status) => {
    const { app } = await fresh()

    const res = await post(app, us('TH1', { themes }))

    expect(res.statusCode).toBe(status)
    expect(status === 400 ? paths(res).every((p) => p.startsWith('themes')) : true).toBe(true)
    expect(status === 400 ? paths(res).length > 0 : true).toBe(true)
  })

  it('TC-A-113 duplicates ignore case and padding; the first spelling and the order are kept', async () => {
    const { app } = await fresh()

    const res = await post(app, us('TH2', { themes: ['AI', 'ai', ' EV ', 'Zed', 'ev'] }))

    expect(res.json().themes).toEqual(['AI', 'EV', 'Zed'])
  })
})

describe('TC-A-114 default economic cycle', () => {
  const expected: Record<string, string> = {
    Materials: 'Cyclical',
    'Consumer Discretionary': 'Cyclical',
    Financials: 'Cyclical',
    'Real Estate': 'Cyclical',
    'Communication Services': 'Sensitive',
    Energy: 'Sensitive',
    Industrials: 'Sensitive',
    'Information Technology': 'Sensitive',
    'Consumer Staples': 'Defensive',
    'Health Care': 'Defensive',
    Utilities: 'Defensive',
  }
  it.each(Object.entries(expected))('TC-A-114 US %s defaults to %s', async (sector, cycle) => {
    const { app } = await fresh()

    const res = await post(app, us('CY', { gicsSector: sector }))

    expect(res.json()).toMatchObject({ economicCycle: cycle })
    expect(res.json().lensSources.economicCycle).toBe('default')
  })

  it.each([
    ['Resources', 'Energy', 'Sensitive'],
    ['Technology', 'Information Technology', 'Sensitive'],
    ['Services', 'Utilities', 'Defensive'],
  ])('TC-A-114 TH %s with GICS %s follows the mapped value: %s', async (group, sector, cycle) => {
    const { app } = await fresh()

    const res = await post(app, th('CYT', { setIndustryGroup: group, gicsSector: sector }))

    expect(res.json()).toMatchObject({ economicCycle: cycle })
    expect(res.json().lensSources.economicCycle).toBe('default')
  })

  it('TC-A-114 an explicit cycle in the body wins and is manual', async () => {
    const { app } = await fresh()

    const res = await post(app, us('CYM', { gicsSector: 'Utilities', economicCycle: 'Cyclical' }))

    expect(res.json()).toMatchObject({ economicCycle: 'Cyclical' })
    expect(res.json().lensSources.economicCycle).toBe('manual')
  })
})

describe('TC-A-115 lens_sources lifecycle', () => {
  it('TC-A-115 create, patch cycle, patch sector, clear cycle, clear style, clear sector', async () => {
    const { app } = await fresh()
    const created = await post(app, us('LIFE', { gicsSector: 'Information Technology', style: 'Growth' }))
    const id = created.json().id
    const patch = (body: object) => call(app, 'PATCH', `/stocks/${id}`, body)
    const reread = async () => (await call(app, 'GET', `/stocks/${id}`)).json()

    const s1 = created.json()
    const s2 = (await patch({ economicCycle: 'Cyclical' })).json()
    const s3 = (await patch({ gicsSector: 'Utilities' })).json()
    const s4 = (await patch({ economicCycle: null })).json()
    const s5 = (await patch({ style: null })).json()
    const s6 = (await patch({ gicsSector: null })).json()

    expect(s1.lensSources).toEqual({ gicsSector: 'manual', style: 'manual', economicCycle: 'default' })
    expect([s2.economicCycle, s2.lensSources.economicCycle]).toEqual(['Cyclical', 'manual'])
    expect([s3.economicCycle, s3.lensSources.economicCycle]).toEqual(['Cyclical', 'manual'])
    expect([s4.economicCycle, s4.lensSources.economicCycle]).toEqual(['Defensive', 'default'])
    expect(s5.style).toBeNull()
    expect('style' in s5.lensSources).toBe(false)
    expect(s6.gicsSector).toBeNull()
    expect(s6.economicCycle).toBeNull()
    expect('gicsSector' in s6.lensSources || 'economicCycle' in s6.lensSources).toBe(false)
    expect(await reread()).toEqual(s6)
  })
})

describe('TC-A-116 PATCH semantics', () => {
  const setup = async () => {
    const { app } = await fresh()
    const stock = (await post(app, th('PTTEP', { setIndustryGroup: 'Resources', gicsSector: 'Energy' }))).json()
    return { app, stock, patch: (body: unknown, id = stock.id) => call(app, 'PATCH', `/stocks/${id}`, body) }
  }

  it('TC-A-116 an exchange of the other market is refused, one of its own market is accepted', async () => {
    const { patch } = await setup()

    expect((await patch({ exchange: 'NASDAQ' })).statusCode).toBe(400)
    expect((await patch({ exchange: 'mai' })).statusCode).toBe(200)
  })

  it('TC-A-116 a name change moves updatedAt only', async () => {
    const { patch, stock } = await setup()
    await new Promise((r) => setTimeout(r, 15))

    const res = await patch({ name: 'New name' })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.updatedAt > stock.updatedAt).toBe(true)
    expect(body).toEqual({ ...stock, name: 'New name', updatedAt: body.updatedAt })
  })

  it('TC-A-116 an empty patch answers 200 and changes nothing but updatedAt (G-12 pinned, deviation D-4)', async () => {
    const { patch, stock } = await setup()

    const res = await patch({})

    expect(res.statusCode).toBe(200)
    expect({ ...res.json(), updatedAt: stock.updatedAt }).toEqual(stock)
  })

  it.each([
    ['null name', { name: null }],
    ['an index of the other market', { indexMembership: ['S&P 500'] }],
    ['an unknown key', { foo: 1 }],
  ])('TC-A-116 %s is a 400', async (_label, body) => {
    const { patch } = await setup()

    expect((await patch(body)).statusCode).toBe(400)
  })

  it('TC-A-116 a malformed id is a 400, a deleted one a 404, a broken body a 400', async () => {
    const { app, patch, stock } = await setup()
    await call(app, 'DELETE', `/stocks/${stock.id}`)

    const bad = await patch({ name: 'x' }, 'not-a-uuid')
    const gone = await patch({ name: 'x' })
    const raw = await app.inject({ method: 'PATCH', url: `/stocks/${UNKNOWN_ID}`, payload: '{nope', headers: { 'content-type': 'application/json' } })

    expect(bad.statusCode).toBe(400)
    expect(gone.statusCode).toBe(404)
    expect(raw.statusCode).toBe(400)
  })
})

describe('TC-A-117 duplicate stock detection', () => {
  it('TC-A-117 same market and ticker is a 409 naming the existing stock, other markets are fine', async () => {
    const { app } = await fresh()
    const a = (await post(app, { ticker: 'AAPL', market: 'US', exchange: 'NASDAQ', name: 'Apple' })).json().id

    const padded = await post(app, us(' aapl '))
    const otherExchange = await post(app, { ticker: 'AAPL', market: 'US', exchange: 'NYSE', name: 'Apple' })
    const otherMarket = await post(app, th('AAPL'))
    const trueUs = await post(app, us('TRUE'))
    const trueTh = await post(app, th('TRUE'))

    for (const dup of [padded, otherExchange]) {
      expect(dup.statusCode).toBe(409)
      expect(dup.json()).toMatchObject({ code: 'stock_exists', existingStockId: a })
      expect(dup.json().detail).toEqual(expect.any(String))
    }
    expect(otherMarket.statusCode).toBe(201)
    expect([trueUs.statusCode, trueTh.statusCode]).toEqual([201, 201])
  })

  it('TC-A-117 a 409 with listIds leaves the list unchanged; validation runs before the duplicate check', async () => {
    const { app, userId } = await fresh()
    await post(app, us('DUPL'))
    const list = await seedList(t.handle, userId, 'LU')

    const dup = await post(app, us('dupl', { listIds: [list] }))
    const invalidDup = await post(app, us('DUPL', { name: '' }))

    expect(dup.statusCode).toBe(409)
    expect(await n('select count(*) n from app.list_stocks where list_id = $1', [list])).toBe(0)
    expect(invalidDup.statusCode).toBe(400)
  })
})

describe('TC-A-118 create with listIds', () => {
  it('TC-A-118 rows: two lists, none, repeated, foreign, malformed, unknown', async () => {
    const { app, userId } = await fresh()
    const v = newUserId()
    const l1 = await seedList(t.handle, userId, 'L1')
    const l2 = await seedList(t.handle, userId, 'L2')
    const lv = await seedList(t.handle, v, 'LV')

    const two = await post(app, us('LI1', { listIds: [l1, l2] }))
    const none = await post(app, us('LI2', { listIds: [] }))
    const repeated = await post(app, us('LI3', { listIds: [l1, l1] }))
    const before = await stockCount(userId)
    const foreign = await post(app, us('LI4', { listIds: [l1, lv] }))
    const malformed = await post(app, us('LI5', { listIds: ['nope'] }))
    const unknown = await post(app, us('LI6', { listIds: [UNKNOWN_ID] }))

    expect(two.statusCode).toBe(201)
    expect([...two.json().listIds].sort()).toEqual([l1, l2].sort())
    expect(none.json().listIds).toEqual([])
    expect(repeated.statusCode).toBe(201)
    expect(repeated.json().listIds).toEqual([l1])
    expect(await n('select count(*) n from app.list_stocks where list_id = $1', [l1])).toBe(2)
    expect(foreign.statusCode).toBe(404)
    expect(malformed.statusCode).toBe(400)
    expect(unknown.statusCode).toBe(404)
    expect(await stockCount(userId)).toBe(before)
    await t.handle.pool.query('delete from app.lists where user_id = $1', [v])
  })
})

describe('TC-A-118 (fault) a failure after the stock insert leaves neither stock nor memberships', () => {
  it('TC-A-118 a failing membership insert rolls the stock back', async () => {
    const { app, userId } = await fresh()
    const list = await seedList(t.handle, userId, 'Faulty')
    const suffix = userId.replaceAll('-', '')
    // RepoFault: a trigger that fails the membership insert of this user only, dropped afterwards.
    await t.handle.pool.query(`create function app.fault_${suffix}() returns trigger language plpgsql as $$ begin
      if new.user_id = '${userId}' then raise exception 'injected fault'; end if; return new; end $$`)
    await t.handle.pool.query(`create trigger fault_${suffix} before insert on app.list_stocks for each row execute function app.fault_${suffix}()`)
    try {
      const res = await post(app, us('FAULT', { listIds: [list] }))

      expect(res.statusCode).toBe(500)
      expect(res.json().code).toBeTruthy()
      expect(res.body).not.toContain('injected fault')
      expect(await stockCount(userId)).toBe(0)
      expect(await n('select count(*) n from app.list_stocks where list_id = $1', [list])).toBe(0)
    } finally {
      await t.handle.pool.query(`drop trigger fault_${suffix} on app.list_stocks`)
      await t.handle.pool.query(`drop function app.fault_${suffix}()`)
    }
  })
})

describe('TC-A-119 GET /stocks shape, order and filter', () => {
  it('TC-A-119 orders by ticker, filters by list, rejects bad list ids and hides other users', async () => {
    const { app, userId } = await fresh()
    const other = await fresh()
    for (const s of [us('MSFT'), us('brk.b'), us('AAPL'), th('PTTEP'), th('XYZMAI', { exchange: 'mai' })]) await post(app, s)
    await post(other.app, us('ZZZ'))
    const list = await seedList(t.handle, userId, 'L')
    const empty = await seedList(t.handle, userId, 'Empty')
    const ids = Object.fromEntries((await call(app, 'GET', '/stocks')).json().items.map((s: { ticker: string; id: string }) => [s.ticker, s.id]))
    await seedMembership(t.handle, userId, list, ids['PTTEP'])
    await seedMembership(t.handle, userId, list, ids['AAPL'])

    const all = await call(app, 'GET', '/stocks')
    const inList = await call(app, 'GET', `/stocks?listId=${list}`)
    const inEmpty = await call(app, 'GET', `/stocks?listId=${empty}`)
    const bad = await call(app, 'GET', '/stocks?listId=bad')
    const unknown = await call(app, 'GET', `/stocks?listId=${UNKNOWN_ID}`)
    const none = await call(other.app, 'GET', `/stocks?listId=${(await seedList(t.handle, other.userId, 'o'))}`)

    expect(all.json().items.map((s: { ticker: string }) => s.ticker)).toEqual(['AAPL', 'BRK.B', 'MSFT', 'PTTEP', 'XYZMAI'])
    expect(all.json().items.find((s: { ticker: string }) => s.ticker === 'AAPL')).toMatchObject({ listIds: [list], lensSources: {}, themes: [] })
    expect(inList.json().items.map((s: { ticker: string }) => s.ticker)).toEqual(['AAPL', 'PTTEP'])
    expect(inEmpty.json()).toEqual({ items: [] })
    expect(bad.statusCode).toBe(400)
    expect(unknown.statusCode).toBe(404)
    expect(none.json()).toEqual({ items: [] })
    expect(JSON.stringify(all.json())).not.toContain('ZZZ')
  })
})

describe('TC-A-126 Unicode and unsafe text', () => {
  it('TC-A-126 keeps code points and bytes through the API and the database, no HTML escaping', async () => {
    const { app, userId } = await fresh()
    const name = 'ก็ ก่ ก้ a‍b 😀'.concat('😀'.repeat(10), ' "quoted" <img src=x onerror=alert(1)>')
    const theme = 'ก็<b>😀'
    const chain = 'ห่วงโซ่ ก้ <img src=x onerror=alert(1)>'

    const res = await post(app, us('UNI', { name, themes: [theme], valueChain: chain, valueChainPosition: 'Upstream' }))
    const list = await call(app, 'POST', '/lists', { name: `รายการ ก็ ${name}`.slice(0, 60) })
    const stocks = await call(app, 'GET', '/stocks')
    const lists = await call(app, 'GET', '/lists')

    expect(res.statusCode).toBe(201)
    expect(res.headers['content-type']).toContain('charset=utf-8')
    for (const got of [res.json(), stocks.json().items[0]]) {
      expect(Buffer.from(got.name).equals(Buffer.from(name))).toBe(true)
      expect(got.themes).toEqual([theme])
      expect(got.valueChain).toBe(chain)
    }
    expect(lists.json().items[0].name).toBe(list.json().name)
    const row = (await t.handle.pool.query('select name, themes, value_chain from app.stocks where user_id = $1', [userId])).rows[0]
    expect(Buffer.from(row.name).equals(Buffer.from(name))).toBe(true)
    expect(row.themes).toEqual([theme])
    expect(row.value_chain).toBe(chain)
  })

  it('TC-A-126 a NUL byte in any text field is a 400', async () => {
    const { app } = await fresh()

    const results = await Promise.all([
      post(app, us('NUL', { name: 'a\u0000b' })),
      post(app, us('NUL', { valueChain: 'a\u0000b' })),
      post(app, us('NUL', { themes: ['a\u0000b'] })),
      call(app, 'POST', '/lists', { name: 'a\u0000b' }),
    ])

    for (const r of results) {
      expect(r.statusCode).toBe(400)
      expect(r.json().code).toBe('validation_failed')
    }
  })
})
