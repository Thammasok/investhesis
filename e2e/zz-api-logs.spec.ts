import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

// Runs last (files run in name order, one worker): the log holds everything the API printed while the
// sign-up, session and API specs above ran (TC-E-001, TC-E-010, TC-E-021 among them).
test('TC-E-023: the API output never contains a token or a password', () => {
  const log = readFileSync(join(__dirname, '.output/dev-server.log'), 'utf8')

  expect(log.length).toBeGreaterThan(0)
  expect(log).not.toContain('eyJ')
  for (const password of ['Abc12345', 'Xyz98765', 'Wrong12345', 'Different1', 'Different123']) {
    expect(log, password).not.toContain(password)
  }
  const authorization = [...log.matchAll(/"?authorization"?\s*[:=]\s*("[^"]*"|\S+)/gi)].map((m) => m[1])
  expect(authorization.length, 'request logs include the header, redacted').toBeGreaterThan(0)
  for (const value of authorization) expect(value?.replace(/,$/, '')).toBe('"[redacted]"')
})
