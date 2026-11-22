import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.ts'
import { loadConfig } from '../src/config/env.ts'
import { createDb, type DbHandle } from '../src/db/client.ts'
import { baseEnv } from './env.ts'

const quiet = { write() {} }

export const testDatabaseUrl = process.env['DATABASE_URL'] ?? baseEnv.DATABASE_URL

export const newUserId = (): string => randomUUID()

/** Deletes everything the given users own. Lists go first; memberships cascade. */
export async function deleteUserRows(handle: DbHandle, ...userIds: string[]): Promise<void> {
  await handle.pool.query('delete from app.lists where user_id = any($1)', [userIds])
  await handle.pool.query('delete from app.stocks where user_id = any($1)', [userIds])
}

export type TestApp = {
  app: FastifyInstance
  handle: DbHandle
  userId: string
  /** Builds an app on the same pool that acts as another user. */
  appFor(userId: string): Promise<FastifyInstance>
  /** Deletes every user's rows this helper touched, then closes the apps and the pool. */
  cleanup(): Promise<void>
}

/**
 * The API against the local Supabase database, signed in as `userId` (a fresh random user by default).
 * Each test file uses its own user ids, so files can run in parallel without truncating tables.
 */
export async function buildTestApp(userId: string = newUserId()): Promise<TestApp> {
  const config = loadConfig({ ...baseEnv, DATABASE_URL: testDatabaseUrl, MOCK_USER_ID: userId })
  const handle = createDb(config)
  const users = new Set([userId])
  const extra: FastifyInstance[] = []
  const identityFor = (id: string) => async () => ({ userId: id, email: undefined, displayName: undefined })
  // The pool is closed once, by cleanup; apps built here do not own it.
  const build = (id: string) =>
    buildApp({ config, db: { ping: handle.ping, db: handle.db }, resolveIdentity: identityFor(id), logStream: quiet })
  const app = await build(userId)
  return {
    app,
    handle,
    userId,
    appFor: async (id) => {
      users.add(id)
      const other = await build(id)
      extra.push(other)
      return other
    },
    cleanup: async () => {
      await deleteUserRows(handle, ...users)
      await Promise.all([app, ...extra].map((a) => a.close()))
      await handle.close()
    },
  }
}
