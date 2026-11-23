import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core'
import { afterAll, describe, expect, it } from 'vitest'
import { createDb } from './client.ts'
import * as schema from './schema/index.ts'
import { testDatabaseUrl } from '../../test/db.ts'

const handle = createDb({ databaseUrl: testDatabaseUrl, dbPoolMax: 1 })
afterAll(() => handle.close())

type Col = { type: string; nullable: boolean }

const drizzleColumns = (): Map<string, Col> => {
  const out = new Map<string, Col>()
  const tables: PgTable[] = [schema.stocks, schema.lists, schema.listStocks, schema.holdings, schema.userSettings]
  for (const table of tables) {
    const cfg = getTableConfig(table)
    for (const c of cfg.columns) out.set(`${cfg.schema}.${cfg.name}.${c.name}`, { type: c.getSQLType().replace(/\(.*\)/, ''), nullable: !c.notNull })
  }
  return out
}

async function databaseColumns(): Promise<Map<string, Col>> {
  const { rows } = await handle.pool.query(
    `select table_name, column_name, data_type, udt_name, is_nullable
       from information_schema.columns
      where table_schema = 'app' and table_name in ('stocks', 'lists', 'list_stocks', 'holdings', 'user_settings')`,
  )
  return new Map(
    rows.map((r) => [
      `app.${r.table_name}.${r.column_name}`,
      { type: r.data_type === 'ARRAY' ? `${String(r.udt_name).slice(1)}[]` : (r.data_type as string), nullable: r.is_nullable === 'YES' },
    ]),
  )
}

describe('Drizzle typings', () => {
  it('TC-U-006 match the migrated database in name, type and nullability', async () => {
    const [mine, theirs] = [drizzleColumns(), await databaseColumns()]
    expect(mine.size).toBeGreaterThan(0)
    expect(Object.fromEntries([...mine].sort())).toEqual(Object.fromEntries([...theirs].sort()))
  })
})
