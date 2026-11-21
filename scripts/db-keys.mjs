import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'signing_keys.json')

if (existsSync(target)) {
  console.log('supabase/signing_keys.json exists, keeping it')
} else {
  // `supabase gen signing-key` fails once config.toml points at a keys file that does not exist yet,
  // so build the same JWK shape it prints (ES256, kid, sign/verify) directly.
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = {
    ...privateKey.export({ format: 'jwk' }),
    kid: randomUUID(),
    use: 'sig',
    key_ops: ['sign', 'verify'],
    alg: 'ES256',
    ext: true,
  }
  writeFileSync(target, JSON.stringify([jwk], null, 2) + '\n', { mode: 0o600 })
  console.log('wrote supabase/signing_keys.json')
}
