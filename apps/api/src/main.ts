import { buildApp } from './app.ts'
import { ConfigError, loadConfig } from './config/env.ts'
import { createDb } from './db/client.ts'
import { installShutdown } from './lifecycle/shutdown.ts'

async function main() {
  const config = loadConfig()
  const db = createDb(config)
  const app = await buildApp({ config, db })
  installShutdown(app, {
    drainDelayMs: config.shutdownDrainDelayMs,
    timeoutMs: config.shutdownTimeoutMs,
  })
  if (config.authMode === 'mock') app.log.warn({ userId: config.mockUser?.id }, 'AUTH_MODE=mock: every request runs as the env user')
  await app.listen({ host: '0.0.0.0', port: config.port })
}

main().catch((err: unknown) => {
  if (err instanceof ConfigError) {
    process.stderr.write(`${err.message}\n`)
  } else {
    process.stderr.write(`fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`)
  }
  process.exit(1)
})
