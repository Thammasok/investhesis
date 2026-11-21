import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const run = (...args) => execFileSync('pnpm', args, { cwd: root, stdio: 'inherit' })

run('db:keys')
run('exec', 'supabase', 'start')
