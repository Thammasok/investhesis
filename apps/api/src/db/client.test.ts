import { afterAll, describe, expect, it } from 'vitest'
import { loadConfig } from '../config/env.ts'
import { baseEnv } from '../../test/env.ts'
import { testDatabaseUrl } from '../../test/db.ts'
import { createDb } from './client.ts'

describe('createDb', () => {
  const handle = createDb(loadConfig({ ...baseEnv, DATABASE_URL: testDatabaseUrl }))
  const killer = createDb(loadConfig({ ...baseEnv, DATABASE_URL: testDatabaseUrl }))
  afterAll(async () => {
    await handle.close()
    await killer.close()
  })

  it('TC-A-930: a backend killed under a checked-out client fails its query and does not crash the process', async () => {
    const uncaught: unknown[] = []
    const onUncaught = (error: unknown) => uncaught.push(error)
    process.on('uncaughtException', onUncaught)
    try {
      const client = await handle.pool.connect()
      const pid = (await client.query('select pg_backend_pid() as pid')).rows[0].pid as number
      await killer.pool.query('select pg_terminate_backend($1)', [pid])
      await expect(client.query('select 1')).rejects.toThrow(/terminating connection/)
      client.release(true)
      // pg emits 'error' on the client when the socket drops; give the event loop a turn to deliver it.
      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(uncaught).toEqual([])
    } finally {
      process.off('uncaughtException', onUncaught)
    }
  })
})
