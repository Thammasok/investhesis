import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminCreateUser, API, publishableKey, psql, signedIn } from './lib/stack.ts'

/** Stock Lists T-013: the database is reachable only through the API (needs `pnpm db:start`). */
const userId = randomUUID()
const stockId = randomUUID()

beforeAll(() => {
  psql(`insert into app.stocks (id, user_id, market, exchange, currency, ticker, name)
        values ('${stockId}', '${userId}', 'US', 'NASDAQ', 'USD', 'TC106', 'TC-A-106 row that must stay private');`)
})
afterAll(() => {
  psql(`delete from app.stocks where id = '${stockId}';`)
})

const rest = (table: string, key: string, token?: string) =>
  fetch(`${API}/rest/v1/${table}`, { headers: { apikey: key, authorization: `Bearer ${token ?? key}`, 'accept-profile': 'app' } })

describe('TC-A-106: the database is not reachable except through the API', () => {
  it('TC-A-106: the REST API never returns rows of app tables for the publishable key or a signed-in user', async () => {
    // Arrange
    const user = await adminCreateUser()
    const { session } = await signedIn(user.email)

    // Act + Assert: every table, both credentials
    for (const table of ['stocks', 'lists', 'list_stocks', 'holdings', 'user_settings']) {
      for (const res of [await rest(table, publishableKey()), await rest(table, publishableKey(), session.access_token)]) {
        const text = await res.text()
        expect(res.ok, `${table}: ${res.status}`).toBe(false)
        expect(text).not.toContain('TC-A-106')
        expect(text).not.toContain(stockId)
      }
    }
  })

  it.each([
    ['anon', 'app.stocks'],
    ['authenticated', 'app.lists'],
    ['authenticated', 'app.list_stocks'],
    ['anon', 'app.holdings'],
    ['authenticated', 'app.holdings'],
    ['anon', 'app.user_settings'],
    ['authenticated', 'app.user_settings'],
  ])('TC-A-106: SET ROLE %s then select from %s fails with permission denied for schema app', (role, table) => {
    // Act
    const r = psql(`\\set ON_ERROR_STOP on\nset role ${role}; select * from ${table};`)

    // Assert
    expect(r.status).not.toBe(0)
    expect(r.err).toContain('permission denied for schema app')
  })

  it('TC-A-106: user_id is NOT NULL on all three tables and row level security is on', () => {
    // Act
    const nullable = psql(
      `select table_name from information_schema.columns where table_schema = 'app' and column_name = 'user_id' and is_nullable = 'YES';`,
    )
    const columns = psql(`select count(*) from information_schema.columns where table_schema = 'app' and column_name = 'user_id' and table_name in ('stocks','lists','list_stocks');`)
    const rls = psql(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'app' and relname in ('stocks','lists','list_stocks') and relrowsecurity order by 1;`)

    // Assert
    expect(nullable.out).toBe('')
    expect(columns.out).toBe('3')
    expect(rls.out.split('\n')).toEqual(['list_stocks', 'lists', 'stocks'])
  })
})
