import { errors, jwtVerify, type JWTVerifyGetKey } from 'jose'
import type { FastifyRequest } from 'fastify'
import { AppError } from '../lib/app-error.ts'
import type { Identity, IdentityResolver } from '../plugins/authenticate.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CLOCK_TOLERANCE_S = 30

const unauthenticated = (req: FastifyRequest, reason: string) => {
  req.log.warn({ reason }, 'authentication failed')
  return new AppError({ status: 401, code: 'unauthenticated', headers: { 'WWW-Authenticate': 'Bearer' } })
}

const unavailable = (req: FastifyRequest, cause: unknown) => {
  req.log.error({ reason: 'jwks_unavailable', err: cause }, 'authentication unavailable')
  return new AppError({ status: 503, code: 'auth_unavailable', headers: { 'Retry-After': '5' }, cause })
}

/** Why jose rejected a token; only ever logged, never sent to the client. */
function reasonFor(err: unknown): string | undefined {
  if (err instanceof errors.JWTExpired) return 'expired'
  if (err instanceof errors.JWTClaimValidationFailed) {
    return { iss: 'issuer', aud: 'audience', exp: 'claim_missing', sub: 'claim_missing', nbf: 'not_yet_valid' }[err.claim] ?? 'claim'
  }
  if (err instanceof errors.JOSEAlgNotAllowed) return 'algorithm'
  if (err instanceof errors.JWSSignatureVerificationFailed) return 'signature'
  if (err instanceof errors.JWKSNoMatchingKey) return 'unknown_key'
  if (err instanceof errors.JWKSTimeout || err instanceof errors.JWKSInvalid) return undefined
  if (err instanceof errors.JOSEError) {
    // jose throws a bare JOSEError ("ERR_JOSE_GENERIC") when the JWKS endpoint answers with a non-200.
    return err.code === 'ERR_JOSE_GENERIC' ? undefined : 'malformed'
  }
  return undefined
}

function bearerToken(header: string | undefined): string | undefined {
  const match = /^Bearer +(\S+)$/i.exec(header ?? '')
  return match?.[1]
}

export function supabaseIdentityResolver(opts: {
  issuer: string
  audience: string
  keys: JWTVerifyGetKey
}): IdentityResolver {
  return async (req) => {
    const raw = req.headers.authorization
    if (raw === undefined) throw unauthenticated(req, 'no_token')
    const token = bearerToken(raw)
    if (!token) throw unauthenticated(req, 'bad_scheme')

    let payload
    try {
      ;({ payload } = await jwtVerify(token, opts.keys, {
        algorithms: ['ES256', 'RS256'],
        issuer: opts.issuer,
        audience: opts.audience,
        clockTolerance: CLOCK_TOLERANCE_S,
        requiredClaims: ['exp', 'sub'],
      }))
    } catch (err) {
      const reason = reasonFor(err)
      if (reason === undefined) throw unavailable(req, err)
      throw unauthenticated(req, reason)
    }

    const { sub, email, role, is_anonymous: anonymous } = payload
    if (typeof sub !== 'string' || !UUID.test(sub)) throw unauthenticated(req, 'sub_not_uuid')
    if (role !== 'authenticated') throw unauthenticated(req, 'role')
    if (anonymous === true) throw unauthenticated(req, 'anonymous')

    const identity: Identity = {
      userId: sub.toLowerCase(),
      email: typeof email === 'string' && email !== '' ? email : undefined,
      displayName: undefined,
    }
    return identity
  }
}
