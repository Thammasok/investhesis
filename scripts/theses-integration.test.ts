import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { psql } from './lib/stack.ts'

/** Thesis log T-002: app.theses is private to the API role and the migration is safe on populated data (needs `pnpm db:start`). */
const userId = randomUUID()
const stockId = randomUUID()

beforeAll(() => {
  psql(`insert into app.stocks (id, user_id, market, exchange, currency, ticker, name) values ('${stockId}', '${userId}', 'US', 'NASDAQ', 'USD', 'TL002', 'TL stock');
        insert into app.theses (user_id, stock_id, type, entry_date, note, target_price) values ('${userId}', '${stockId}', 'buy', '2026-11-20', 'private note', 180.5);`)
})
afterAll(() => {
  psql(`delete from app.stocks where user_id = '${userId}';`)
})

describe('thesis log T-002: the table and its migration', () => {
  it('TC-A-700: row level security is on, no policy exists, and the API role reads the table', () => {
    const rls = psql(`select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'app' and relname = 'theses';`)
    const policies = psql(`select count(*) from pg_policies where schemaname = 'app' and tablename = 'theses';`)
    const owner = psql(`select note, target_price::text, entry_date::text from app.theses where user_id = '${userId}';`)

    expect(rls.out).toBe('t')
    expect(policies.out).toBe('0')
    expect(owner.out).toBe('private note|180.5000|2026-11-20')
  })

  it('TC-A-701: the columns match design.md', () => {
    const r = psql(
      `select column_name || ' ' || data_type || ' ' || coalesce(numeric_precision::text, '-') || ',' || coalesce(numeric_scale::text, '-') || ' ' || is_nullable
         from information_schema.columns where table_schema = 'app' and table_name = 'theses' order by 1;`,
    )
    expect(r.out.split('\n')).toEqual([
      'created_at timestamp with time zone -,- NO',
      'entry_date date -,- NO',
      'id uuid -,- NO',
      'invalidation text -,- YES',
      'note text -,- NO',
      'stock_id uuid -,- NO',
      'target_price numeric 18,4 YES',
      'type text -,- NO',
      'updated_at timestamp with time zone -,- NO',
      'user_id uuid -,- NO',
    ])
  })

  it('TC-A-702: the migration applies on top of populated data and leaves stocks untouched (replayed in a rolled-back transaction)', () => {
    const migration = readFileSync(new URL('../supabase/migrations/20261125000000_theses.sql', import.meta.url), 'utf8')
    const before = psql(`select count(*), md5(string_agg(id::text || ticker || name, ',' order by id::text)) from app.stocks;`).out

    const r = psql(
      `\\set ON_ERROR_STOP on\nbegin;\ndrop table app.theses;\n${migration}\nselect count(*), md5(string_agg(id::text || ticker || name, ',' order by id::text)) from app.stocks;\nselect count(*) from app.theses;\nrollback;`,
    )

    expect(r.status, r.err).toBe(0)
    const lines = r.out.split('\n').filter((l) => /^\d+\|[0-9a-f]{32}$/.test(l) || l === '0')
    expect(lines[0]).toBe(before)
    expect(lines.at(-1)).toBe('0')
    expect(psql(`select count(*) from app.theses where user_id = '${userId}';`).out).toBe('1')
  })
})
