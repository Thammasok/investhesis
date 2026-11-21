import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JSONWebKeySet, type JWTVerifyGetKey } from 'jose'
import { baseEnv } from './env.ts'

export const SUPABASE_URL = 'http://127.0.0.1:54321'
export const ISSUER = `${SUPABASE_URL}/auth/v1`
export const USER_U = '6f1c2b9e-0d4a-4c8e-9a51-2f6c0b7d3e11'
export const USER_V = '0b7e4d52-3c1a-4f6e-8d29-7a5c1e9f4b22'

/** Same as `baseEnv` but in supabase mode; the mock user variables are dropped. */
export const supabaseEnv = (() => {
  const { MOCK_USER_ID: _id, MOCK_USER_EMAIL: _email, MOCK_USER_NAME: _name, ...rest } = baseEnv
  return { ...rest, AUTH_MODE: 'supabase', SUPABASE_URL }
})() satisfies Record<string, string>

export type TestKeys = {
  kid: string
  privateKey: CryptoKey
  jwks: JSONWebKeySet
  keys: JWTVerifyGetKey
}

export async function makeKeys(kid = 'test-key'): Promise<TestKeys> {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
  const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid, alg: 'ES256', use: 'sig' }] }
  return { kid, privateKey, jwks, keys: createLocalJWKSet(jwks) }
}

const now = () => Math.floor(Date.now() / 1000)

/** Claims of a healthy Supabase access token. An `undefined` value removes the claim. */
export const validClaims = (over: Record<string, unknown> = {}) => ({
  sub: USER_U,
  email: 'a@x.io',
  role: 'authenticated',
  aud: 'authenticated',
  iss: ISSUER,
  iat: now(),
  exp: now() + 3600,
  ...over,
})

export function signTestToken(
  keys: TestKeys,
  claims: Record<string, unknown> = {},
  opts: { kid?: string | undefined } = {},
): Promise<string> {
  return new SignJWT(validClaims(claims) as Record<string, unknown>)
    .setProtectedHeader({ alg: 'ES256', kid: opts.kid ?? keys.kid })
    .sign(keys.privateKey)
}

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')

export const signUnsecured = (claims: Record<string, unknown> = {}) =>
  `${b64({ alg: 'none', typ: 'JWT' })}.${b64(validClaims(claims))}.`

export const signHmac = (secret: Uint8Array, claims: Record<string, unknown> = {}, kid = 'test-key') =>
  new SignJWT(validClaims(claims) as Record<string, unknown>).setProtectedHeader({ alg: 'HS256', kid }).sign(secret)

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

type LogRecord = { reason?: string; req?: { headers?: { authorization?: string } } }

export function capturingStream() {
  const lines: string[] = []
  return {
    lines,
    stream: { write: (s: string) => void lines.push(s) },
    records: () => lines.map((l) => JSON.parse(l) as LogRecord),
  }
}
