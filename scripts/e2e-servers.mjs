// Starts web + API for the Playwright suite, wired to the local Supabase stack.
//   node scripts/e2e-servers.mjs          supabase mode on :5173 / :3000 (what `pnpm dev` runs)
//   node scripts/e2e-servers.mjs mock     mock mode on :5273 / :3100
// The keys are read from `supabase status` at start; nothing is written to disk but the log.
import { execFileSync, spawn } from 'node:child_process'
import { createWriteStream, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const mode = process.argv[2] === 'mock' ? 'mock' : 'supabase'
// 5173 is where the email links point (site_url). Set E2E_WEB_PORT when another project holds it:
// the suite then rewrites the origin of the links it opens.
const webPort = process.env.E2E_WEB_PORT ?? '5173'
const mockWebPort = process.env.E2E_MOCK_WEB_PORT ?? '5273'

function stackEnv() {
  const out = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], { cwd: root, encoding: 'utf8' })
  const env = {}
  for (const line of out.split('\n')) {
    const eq = line.indexOf('=')
    if (eq > 0) env[line.slice(0, eq)] = line.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return env
}

const stack = stackEnv()
const publishable = stack.PUBLISHABLE_KEY ?? stack.ANON_KEY
if (!stack.API_URL || !publishable) throw new Error('local Supabase is not running; run pnpm db:start first')

mkdirSync(join(root, 'e2e/.output'), { recursive: true })
const log = createWriteStream(join(root, 'e2e/.output', mode === 'mock' ? 'mock-server.log' : 'dev-server.log'))

const base = { ...process.env, NODE_ENV: 'development', LOG_LEVEL: 'info', DATABASE_URL: stack.DB_URL ?? '' }
let commands
if (mode === 'supabase') {
  const env = {
    ...base,
    PORT: '3000',
    PUBLIC_WEB_ORIGIN: `http://localhost:${webPort}`,
    CORS_ORIGINS: `http://localhost:${webPort}`,
    AUTH_MODE: 'supabase',
    SUPABASE_URL: stack.API_URL,
    VITE_AUTH_MODE: 'supabase',
    VITE_SUPABASE_URL: stack.API_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: publishable,
  }
  const web = { ...env }
  const api = { ...env }
  commands = [
    { args: ['--filter', '@investhesis/api', 'dev'], env: api },
    { args: ['--filter', '@investhesis/web', 'exec', 'vite', '--port', webPort, '--strictPort'], env: web },
  ]
} else {
  const api = {
    ...base,
    PORT: '3100',
    AUTH_MODE: 'mock',
    MOCK_USER_ID: '0192f0a0-0000-7000-8000-000000000001',
    MOCK_USER_EMAIL: 'mock@example.test',
    PUBLIC_WEB_ORIGIN: `http://localhost:${mockWebPort}`,
    CORS_ORIGINS: `http://localhost:${mockWebPort}`,
  }
  const web = { ...base, VITE_AUTH_MODE: 'mock', API_PROXY_TARGET: 'http://localhost:3100' }
  commands = [
    { args: ['--filter', '@investhesis/api', 'dev'], env: api },
    { args: ['--filter', '@investhesis/web', 'exec', 'vite', '--port', mockWebPort, '--strictPort'], env: web },
  ]
}

// Not detached: Playwright stops the whole process group, so the children go with this script.
const children = commands.map(({ args, env }) => {
  const child = spawn('pnpm', args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.pipe(log, { end: false })
  child.stderr.pipe(log, { end: false })
  child.stdout.pipe(process.stdout)
  child.stderr.pipe(process.stderr)
  child.on('exit', (code) => {
    if (code) {
      console.error(`e2e server exited with ${code}`)
      stop(1)
    }
  })
  return child
})

function stop(code = 0) {
  for (const child of children) {
    child.kill('SIGTERM')
  }
  setTimeout(() => process.exit(code), 500)
}
process.on('SIGTERM', () => stop())
process.on('SIGINT', () => stop())
