import type { EventEmitter } from 'node:events'
import type { FastifyInstance } from 'fastify'

type SignalSource = Pick<EventEmitter, 'on'>

export type ShutdownOptions = {
  drainDelayMs: number
  timeoutMs: number
  exit?: (code: number) => void
  proc?: SignalSource
}

export function installShutdown(app: FastifyInstance, opts: ShutdownOptions): void {
  const exit = opts.exit ?? ((code: number) => process.exit(code))
  const proc = opts.proc ?? process
  let started = false

  function shutdown(reason: string, failed: boolean) {
    if (started) {
      app.log.fatal({ reason }, 'second shutdown signal, exiting immediately')
      exit(1)
      return
    }
    started = true
    app.log.info({ reason }, 'shutdown: begin')
    app.shuttingDown = true

    setTimeout(() => {
      app.log.fatal({ timeoutMs: opts.timeoutMs }, 'shutdown: timed out, forcing exit')
      exit(1)
    }, opts.timeoutMs).unref()

    void (async () => {
      try {
        if (opts.drainDelayMs > 0) {
          app.log.info({ drainDelayMs: opts.drainDelayMs }, 'shutdown: draining')
          await new Promise((resolve) => setTimeout(resolve, opts.drainDelayMs))
        }
        app.log.info('shutdown: closing server')
        await app.close()
        app.log.info('shutdown: complete')
        exit(failed ? 1 : 0)
      } catch (err) {
        app.log.fatal({ err }, 'shutdown: close failed')
        exit(1)
      }
    })()
  }

  proc.on('SIGTERM', () => shutdown('SIGTERM', false))
  proc.on('SIGINT', () => shutdown('SIGINT', false))
  proc.on('uncaughtException', (err: Error) => {
    app.log.fatal({ err }, 'uncaught exception')
    shutdown('uncaughtException', true)
  })
  proc.on('unhandledRejection', (err: unknown) => {
    app.log.fatal({ err }, 'unhandled rejection')
    shutdown('unhandledRejection', true)
  })
}
