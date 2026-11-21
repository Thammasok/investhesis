import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.ts'
import { installShutdown } from './shutdown.ts'
import { loadConfig } from '../config/env.ts'
import { baseEnv } from '../../test/env.ts'

let app: FastifyInstance
let proc: EventEmitter
let exit: ReturnType<typeof vi.fn<(code: number) => void>>
let logs: string[]
let realClose: FastifyInstance['close']

beforeEach(async () => {
  logs = []
  app = await buildApp({
    config: loadConfig(baseEnv),
    logStream: { write: (s: string) => void logs.push(s) },
  })
  await app.ready()
  realClose = app.close.bind(app)
  proc = new EventEmitter()
  exit = vi.fn<(code: number) => void>()
})
afterEach(async () => {
  vi.useRealTimers()
  await realClose()
})

describe('installShutdown', () => {
  it('flips readiness, closes the app once and exits 0', async () => {
    const seen: { ready?: number; flag?: boolean } = {}
    const closeSpy = vi.fn<() => Promise<void>>(async () => {
      seen.flag = app.shuttingDown
      seen.ready = (await app.inject('/ready')).statusCode
      return realClose()
    })
    app.close = closeSpy as unknown as typeof app.close
    installShutdown(app, { drainDelayMs: 0, timeoutMs: 1000, exit, proc })
    proc.emit('SIGTERM')
    await vi.waitFor(() => expect(exit).toHaveBeenCalled())
    expect(seen).toEqual({ flag: true, ready: 503 })
    expect(closeSpy).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('force-exits 1 with a fatal log when close hangs', async () => {
    vi.useFakeTimers()
    app.close = (() => new Promise(() => {})) as unknown as typeof app.close
    installShutdown(app, { drainDelayMs: 0, timeoutMs: 50, exit, proc })
    proc.emit('SIGTERM')
    await vi.advanceTimersByTimeAsync(50)
    expect(exit).toHaveBeenCalledWith(1)
    expect(logs.some((l) => l.includes('"level":60'))).toBe(true)
  })

  it('a second signal exits 1 immediately', async () => {
    app.close = (() => new Promise(() => {})) as unknown as typeof app.close
    installShutdown(app, { drainDelayMs: 0, timeoutMs: 60_000, exit, proc })
    proc.emit('SIGTERM')
    proc.emit('SIGINT')
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('treats an uncaught exception as fatal and exits 1', async () => {
    installShutdown(app, { drainDelayMs: 0, timeoutMs: 1000, exit, proc })
    proc.emit('uncaughtException', new Error('boom'))
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1))
  })
})
