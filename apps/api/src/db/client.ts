import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import type { Config } from '../config/env.ts'
import * as schema from './schema/index.ts'

export type Db = NodePgDatabase<typeof schema>

/** A database handle or the transaction handed out by `db.transaction`. */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

export type DbHandle = {
  db: Db
  pool: Pool
  ping(): Promise<void>
  close(): Promise<void>
}

/** Supabase Postgres over its direct or session-pooler connection string. The pool connects lazily. */
export function createDb(config: Pick<Config, 'databaseUrl' | 'dbPoolMax'>): DbHandle {
  const pool = new Pool({ connectionString: config.databaseUrl, max: config.dbPoolMax })
  // An idle client error would otherwise crash the process as an unhandled 'error' event.
  pool.on('error', () => {})
  // A checked-out client (a transaction in progress) emits 'error' when its backend dies, and without a listener that is an
  // uncaught exception. The query or transaction rejects on its own, so the request still fails with a 500 and rolls back.
  pool.on('connect', (client) => client.on('error', () => {}))
  let closing: Promise<void> | undefined
  return {
    db: drizzle({ client: pool, schema }),
    pool,
    ping: async () => {
      await pool.query('select 1')
    },
    close: () => (closing ??= pool.end()),
  }
}
