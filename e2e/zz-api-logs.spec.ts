import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

// Runs last (files run in name order, one worker): the log holds everything the API printed while the
// sign-in, session and API specs above ran (TC-E-010 and TC-E-021 among them).
test('TC-E-023: the API output never contains a token or a password', () => {
  const log = readFileSync(join(__dirname, '.output/dev-server.log'), 'utf8')

  expect(log.length).toBeGreaterThan(0)
  // A JWT is three dot-separated base64url parts starting `eyJ`; a bare `eyJ` can occur by chance in a random
  // multipart boundary, which made this check flaky.
  expect(log).not.toMatch(/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]*/)
  for (const password of ['Abc12345', 'Xyz98765', 'Wrong12345', 'Different1', 'Different123']) {
    expect(log, password).not.toContain(password)
  }
  const authorization = [...log.matchAll(/"?authorization"?\s*[:=]\s*("[^"]*"|\S+)/gi)].map((m) => m[1])
  expect(authorization.length, 'request logs include the header, redacted').toBeGreaterThan(0)
  for (const value of authorization) expect(value?.replace(/,$/, '')).toBe('"[redacted]"')
})
