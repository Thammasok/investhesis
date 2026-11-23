import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminCreateUser, API, psql, publishableKey, serviceKey, signedIn } from './lib/stack.ts'

/** Holdings and concentration T-010: the new tables are private to the API role, and the migration shape (needs `pnpm db:start`). */
const userId = randomUUID()
const stockId = randomUUID()
const SENTINEL = 'TC-A-427 row that must stay private'

beforeAll(() => {
  psql(`insert into app.stocks (id, user_id, market, exchange, currency, ticker, name) values ('${stockId}', '${userId}', 'US', 'NASDAQ', 'USD', 'TC427', 'TC-A-427 stock');
        insert into app.holdings (stock_id, user_id, shares, average_cost, cost_currency) values ('${stockId}', '${userId}', 7351.2468, 9182.7364, 'USD');
        insert into app.user_settings (user_id, concentration_threshold, usd_thb_rate) values ('${userId}', 25, 36.482917);`)
})
afterAll(() => {
  psql(`delete from app.user_settings where user_id = '${userId}'; delete from app.stocks where id = '${stockId}';`)
})

const call = (method: string, table: string, key: string, token: string | undefined, profile: string | null) =>
  fetch(`${API}/rest/v1/${table}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${token ?? key}`,
      'content-type': 'application/json',
      ...(profile && { 'accept-profile': profile, 'content-profile': profile }),
    },
    ...(method === 'POST' || method === 'PATCH' ? { body: JSON.stringify(method === 'POST' ? { user_id: userId, concentration_threshold: 1 } : { concentration_threshold: 1 }) } : {}),
  })

describe('TC-A-427 the Data API cannot reach the new tables', () => {
  it('TC-A-427: no REST verb on holdings or user_settings answers 200 with rows, for anon, a signed-in user, and either profile', async () => {
    // Arrange
    const user = await adminCreateUser()
    const { session } = await signedIn(user.email)
    const keys = [
      ['anon', publishableKey(), undefined],
      ['user', publishableKey(), session.access_token],
    ] as const

    // Act + Assert
    for (const table of ['holdings', 'user_settings']) {
      for (const [who, key, token] of keys) {
        for (const profile of ['app', null]) {
          for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
            const res = await call(method, table, key, token, profile)
            const text = await res.text()
            // 401/403/404, or 406 when PostgREST refuses the unexposed `app` profile: never a 2xx.
            expect([401, 403, 404, 406], `${who} ${method} ${table} ${profile}: ${res.status}`).toContain(res.status)
            expect(text).not.toContain('7351')
            expect(text).not.toContain(stockId)
            expect(text).not.toContain(SENTINEL)
          }
        }
      }
    }
    const still = psql(`select count(*) from app.holdings where user_id = '${userId}'; select count(*) from app.user_settings where user_id = '${userId}' and concentration_threshold = 25;`)
    expect(still.out.split('\n')).toEqual(['1', '1'])
  })

  it('TC-A-427: the service key does not read them through the app profile either unless exposed (schema app is not exposed)', async () => {
    const res = await call('GET', 'holdings', serviceKey(), undefined, 'app')
    expect(res.status).not.toBe(200)
  })

  it.each([
    ['anon', 'app.holdings'],
    ['authenticated', 'app.holdings'],
    ['anon', 'app.user_settings'],
    ['authenticated', 'app.user_settings'],
  ])('TC-A-427: SET ROLE %s then select from %s fails with permission denied', (role, table) => {
    const r = psql(`\\set ON_ERROR_STOP on\nset role ${role}; select * from ${table};`)

    expect(r.status).not.toBe(0)
    expect(r.err).toContain('permission denied')
  })

  it('TC-A-427: row level security is on, no policy exists, and the API role reads both tables', () => {
    const rls = psql(`select relname || '=' || relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'app' and relname in ('holdings','user_settings') order by 1;`)
    const policies = psql(`select count(*) from pg_policies where schemaname = 'app' and tablename in ('holdings','user_settings');`)
    const owner = psql(`select shares::text, average_cost::text from app.holdings where user_id = '${userId}'; select usd_thb_rate::text from app.user_settings where user_id = '${userId}';`)

    expect(rls.out.split('\n')).toEqual(['holdings=true', 'user_settings=true'])
    expect(policies.out).toBe('0')
    expect(owner.out.split('\n')).toEqual(['7351.2468|9182.7364', '36.482917'])
  })
})

describe('TC-A-428 migration on a populated database, and tables an export can read', () => {
  it('TC-A-428: the columns match design.md', () => {
    const r = psql(
      `select table_name || '.' || column_name || ' ' || data_type || ' ' || coalesce(numeric_precision::text, '-') || ',' || coalesce(numeric_scale::text, '-') || ' ' || is_nullable
         from information_schema.columns where table_schema = 'app' and table_name in ('holdings','user_settings')
          and column_name in ('shares','average_cost','cost_currency','usd_thb_rate','concentration_threshold') order by 1;`,
    )

    expect(r.out.split('\n')).toEqual([
      'holdings.average_cost numeric 18,4 YES',
      'holdings.cost_currency text -,- NO',
      'holdings.shares numeric 18,4 YES',
      'user_settings.concentration_threshold smallint 16,0 NO',
      'user_settings.usd_thb_rate numeric 18,6 YES',
    ])
  })

  it('TC-A-428: a plain SQL join exposes every holding with its ticker and user (the shape an export needs)', () => {
    const r = psql(`select s.ticker, h.shares, h.average_cost, h.cost_currency, s.user_id = h.user_id from app.stocks s join app.holdings h on h.stock_id = s.id and h.user_id = s.user_id where s.id = '${stockId}';`)

    expect(r.out).toBe('TC427|7351.2468|9182.7364|USD|t')
  })

  it('TC-A-428: the migration applies on top of populated stocks and leaves them untouched (replayed in a rolled-back transaction)', () => {
    const migration = readFileSync(new URL('../supabase/migrations/20261123000000_holdings.sql', import.meta.url), 'utf8')
    const before = psql(`select count(*), md5(string_agg(id::text || ticker || name, ',' order by id::text)) from app.stocks;`).out

    const r = psql(
      `\\set ON_ERROR_STOP on\nbegin;\ndrop table app.holdings;\ndrop table app.user_settings;\n${migration}\nselect count(*), md5(string_agg(id::text || ticker || name, ',' order by id::text)) from app.stocks;\nselect count(*) from app.holdings;\nrollback;`,
    )

    expect(r.status, r.err).toBe(0)
    const lines = r.out.split('\n').filter((l) => /^\d+\|[0-9a-f]{32}$/.test(l) || l === '0')
    expect(lines[0]).toBe(before)
    expect(lines.at(-1)).toBe('0')
    // The rollback put the real tables back.
    expect(psql(`select count(*) from app.holdings where user_id = '${userId}';`).out).toBe('1')
  })
})
