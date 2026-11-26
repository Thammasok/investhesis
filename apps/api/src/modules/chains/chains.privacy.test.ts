import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../../app.ts'
import { supabaseIdentityResolver } from '../../auth/supabase-identity-resolver.ts'
import { loadConfig } from '../../config/env.ts'
import { createDb, type DbHandle } from '../../db/client.ts'
import { bearer, capturingStream, makeKeys, signTestToken, supabaseEnv, type TestKeys } from '../../../test/auth.ts'
import { seedChain } from '../../../test/chains.ts'
import { testDatabaseUrl } from '../../../test/db.ts'
import * as real from './chains.repository.ts'

const SUB = '0192f0a0-0000-7000-8000-0000000009a1'
let app: FastifyInstance
let handle: DbHandle
let keys: TestKeys
let headers: Record<string, string>
const cap = capturingStream()
const fault = { on: false }

beforeAll(async () => {
  keys = await makeKeys()
  const config = loadConfig({ ...supabaseEnv, DATABASE_URL: testDatabaseUrl, LOG_LEVEL: 'trace' })
  handle = createDb(config)
  app = await buildApp({
    config,
    db: { ping: handle.ping, db: handle.db },
    resolveIdentity: supabaseIdentityResolver({ issuer: config.supabaseAuth?.issuer ?? '', audience: 'authenticated', keys: keys.keys }),
    logStream: cap.stream,
    chainsRepo: {
      renameRows: async (db, userId, ids, to) => {
        await real.renameRows(db, userId, ids, to)
        if (fault.on) throw new Error('forced failure')
      },
    },
  })
  headers = bearer(await signTestToken(keys, { sub: SUB }))
})
afterAll(async () => {
  await handle.pool.query('delete from app.stocks where user_id = $1', [SUB])
  await handle.pool.query('delete from app.user_settings where user_id = $1', [SUB])
  await app.close()
  await handle.close()
})

const AMOUNTS = ['98765.4321', '12345.6789', '36.123456']

async function seedPrivate() {
  await handle.pool.query('delete from app.stocks where user_id = $1', [SUB])
  await seedChain(handle, SUB, 'P1', 'SENTINEL-FROM-9x', { holding: { shares: '98765.4321', cost: '12345.6789' }, position: 'Upstream' })
  await seedChain(handle, SUB, 'P2', 'SENTINEL-TO-9x', { holding: { shares: '98765.4321', cost: '12345.6789' } })
  await seedChain(handle, SUB, 'P3', 'Plain')
  await handle.pool.query('insert into app.user_settings (user_id, usd_thb_rate) values ($1, $2) on conflict (user_id) do update set usd_thb_rate = $2', [SUB, '36.123456'])
}

const post = (payload: unknown, h: Record<string, string> | undefined = headers) =>
  app.inject({ method: 'POST', url: '/chains/rename', ...(h && { headers: h }), payload: payload as object })

/** Every path of the rename once: success, 400, 404, 409, merge, 500 and 401. */
async function runAllPaths() {
  await seedPrivate()
  const out: Record<string, Awaited<ReturnType<typeof post>>> = {}
  out.success = await post({ from: 'Plain', to: 'Renamed' })
  out.badRequest = await post({ from: 'SENTINEL-FROM-9x', to: `SENTINEL-TO-9x${'z'.repeat(61)}` })
  out.notFound = await post({ from: 'SENTINEL-MISSING-9x', to: 'X' })
  out.conflict = await post({ from: 'SENTINEL-FROM-9x', to: 'sentinel-to-9x' })
  out.merge = await post({ from: 'SENTINEL-FROM-9x', to: 'SENTINEL-TO-9x', merge: true })
  fault.on = true
  out.failure = await post({ from: 'Renamed', to: 'SENTINEL-FAULT-9x' })
  fault.on = false
  out.unauthenticated = await post({ from: 'SENTINEL-FROM-9x', to: 'SENTINEL-TO-9x' }, bearer('not.a.jwt'))
  return out
}

describe('chain names and amounts stay out of logs and off the network', () => {
  it('TC-A-921 no log line holds a chain name sentinel or an amount, and a 400 does not echo the input', async () => {
    cap.lines.length = 0

    const out = await runAllPaths()

    expect(Object.values(out).map((r) => r.statusCode)).toEqual([200, 400, 404, 409, 200, 500, 401])
    const text = cap.lines.join('\n')
    expect(cap.lines.filter((l) => l.includes('"statusCode"')).length).toBeGreaterThanOrEqual(7)
    expect(text).not.toMatch(/SENTINEL/i)
    for (const amount of AMOUNTS) expect(text).not.toContain(amount)
    const bad = out.badRequest?.json()
    expect(JSON.stringify([bad.detail, bad.errors])).not.toMatch(/SENTINEL|zzzz/)
    expect(out.failure?.payload).not.toMatch(/SENTINEL|forced/)
  })

  it('TC-A-922 the rename, merge and conflict paths make no outbound call besides the database', async () => {
    await seedPrivate()
    await post({ from: 'Plain', to: 'Warm' }) // warms the pool and the cached key set
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const httpSpies = [vi.spyOn(http, 'request'), vi.spyOn(http, 'get'), vi.spyOn(https, 'request'), vi.spyOn(https, 'get')]
    const connectSpy = vi.spyOn(net, 'connect')
    const socketConnect = vi.spyOn(net.Socket.prototype, 'connect')

    await post({ from: 'Warm', to: 'Renamed' })
    await post({ from: 'SENTINEL-FROM-9x', to: 'sentinel-to-9x' })
    await post({ from: 'SENTINEL-FROM-9x', to: 'SENTINEL-TO-9x', merge: true })

    expect(fetchSpy).not.toHaveBeenCalled()
    for (const spy of httpSpies) expect(spy).not.toHaveBeenCalled()
    const targets = [...connectSpy.mock.calls, ...socketConnect.mock.calls].map((c) => JSON.stringify(c[0]))
    // Any connection the pool opened is to the database port only.
    for (const target of targets) expect(target).toMatch(/54322/)
    vi.restoreAllMocks()
  })

  it('TC-A-923 the answers carry only the documented keys and none of the investor data', async () => {
    await seedPrivate()
    const ok = await post({ from: 'Plain', to: 'Renamed' })
    const bad = await post({ from: 'Renamed', to: '' })
    const missing = await post({ from: 'Nowhere', to: 'X' })
    const conflict = await post({ from: 'Renamed', to: 'sentinel-to-9x' })

    expect(Object.keys(ok.json()).sort()).toEqual(['changed', 'merged', 'name'])
    const allowed = ['type', 'title', 'status', 'code', 'detail', 'errors', 'requestId', 'existingName', 'existingCount']
    for (const res of [bad, missing, conflict]) expect(Object.keys(res.json()).filter((k) => !allowed.includes(k))).toEqual([])
    expect(Object.keys(conflict.json()).filter((k) => k.startsWith('existing')).sort()).toEqual(['existingCount', 'existingName'])
    for (const res of [ok, bad, missing, conflict]) {
      expect(res.payload).not.toMatch(/holding|shares|averageCost|usdThbRate|userId|"id"/)
      for (const amount of AMOUNTS) expect(res.payload).not.toContain(amount)
    }
  })
})
