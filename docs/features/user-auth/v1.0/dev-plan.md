---
version: 1.0
status: active
date: 2026-11-21
requires: design.md
ux-design: ux-design.md
---

# Development Plan: User Auth (email + password)

Builds [requirements.md](requirements.md) per [design.md](design.md) and
[ux-design.md](ux-design.md). Every engineering task follows the test gate (green before, green
after, then human review). The gate's command table in `.claude/rules/test-gate.md` is still
Pacta's; until the owner approves a replacement, the gate for this plan is, from the repo root:
`pnpm db:start` (from [T-001](#t-001--supabase-auth-local-setup) on), `pnpm lint`,
`pnpm typecheck`, `pnpm test`, `pnpm build`, and from [T-008](#t-008--automate-tests--user-auth)
on the auth end-to-end suite.

**Ordering with Stock Lists.** Both plans create `supabase/` (its T-001 / this T-001), a migration
needing schema `app` (its T-001 / this [T-009](#t-009--sign-up-allowlist)),
`apps/web/src/lib/api-client.ts` (its T-007 / this T-003) and Playwright (its T-013 / this T-008).
Whichever task runs second extends the existing files instead of recreating them, and says so in
its review note. Once this T-003 lands, Stock Lists' web tests render routes with a signed-in
`FakeAuthClient`.

## Summary

- **Total tasks** — 9 (7 engineering, 1 test design, 1 test automation)
- **Estimated effort** — about 6.5 days of agent work (S ≈ 0.5 day, M ≈ 0.75 day, L ≈ 1.5 days);
  about 3.5 days elapsed with the API and web lanes in parallel
- **Critical path** — [T-003](#t-003--web-auth-foundation) →
  [T-004](#t-004--sign-in-and-sign-up-screens) →
  [T-005](#t-005--email-links-and-password-reset-screens) →
  [T-008](#t-008--automate-tests--user-auth)
- **Parallel lanes** — [T-001](#t-001--supabase-auth-local-setup) and
  [T-002](#t-002--api-token-verification) (backend) run alongside T-003 (web); T-002 tests sign
  their own tokens, so it does not wait for T-001. [T-009](#t-009--sign-up-allowlist) follows
  T-001. [T-006](#t-006--account-page-and-account-menu)
  runs alongside T-005. [T-007](#t-007--design-test-cases--user-auth) starts at once.

## Tasks

### T-001 — Supabase Auth local setup

```yaml
- title: Configure local Supabase Auth (settings, ES256 signing key, email templates)
- description: >
  If `supabase/` does not exist yet, run `supabase init` at the repo root, add `supabase` as a
  root dev dependency (pinned version) and root scripts `db:start`, `db:stop`, `db:reset`
  (Stock Lists ADR-001). Add `db:keys` → `supabase gen signing-key --algorithm ES256` writing
  `supabase/signing_keys.json` (git-ignored); `db:start` runs `db:keys` first when the file is
  missing, so Stock Lists' gate keeps working from a clean clone. Set the auth settings in `supabase/config.toml` exactly as design.md §Supabase
  project, and add `supabase/templates/confirmation.html` and `recovery.html` whose links are
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email|recovery&next={{ .RedirectTo }}`
  with Supabase's default wording and the app name (ADR-002). Confirm on the pinned CLI the exact
  key for the current-password requirement (ADR-006) and record the result in design.md if it
  differs. Write `supabase/README.md`: local URLs (API 54321, DB 54322, Mailpit 54324), the
  hosted-project checklist (same settings, templates, ES256 key current, custom SMTP per OQ-1)
  and a smoke check. Add a script-level test that proves the settings against the running stack.
- agent: software-engineer-backend
- depends_on: []
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] `pnpm db:start` from a clean clone generates the signing key and starts local Supabase with no errors; a second run keeps the same key; `supabase/signing_keys.json` is git-ignored
- [ ] `GET http://127.0.0.1:54321/auth/v1/.well-known/jwks.json` returns one ES256 public key (`kty: EC`, `crv: P-256`)
- [ ] An access token from local `signInWithPassword` has header `alg: ES256` and claims `iss: http://127.0.0.1:54321/auth/v1`, `aud: authenticated`, `role: authenticated`, `exp - iat = 3600`
- [ ] Sign-up with a 7-character password is rejected by local Auth (`weak_password`); 8 characters is accepted
- [ ] Sign-up sends one email to Mailpit whose link matches `http://localhost:5173/auth/confirm?token_hash=…&type=email`; reset sends a `type=recovery` link
- [ ] Signing in before confirming fails with `email_not_confirmed`
- [ ] `updateUser({ password })` without `current_password` is rejected; with the correct one it succeeds (or the ADR-006 fallback is recorded in design.md)
- [ ] `supabase/README.md` holds the hosted checklist; `CLAUDE.md` lists the new scripts

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-001
    scenario: local JWKS publishes the ES256 key
    given: local stack started after pnpm db:keys
    when: GET /auth/v1/.well-known/jwks.json
    then: one key, kty EC, crv P-256, alg ES256, a kid
    test_data:
      input: "http://127.0.0.1:54321/auth/v1/.well-known/jwks.json"
      expected: { keys: [{ kty: EC, crv: P-256, alg: ES256 }] }
  - id: TC-U-002
    scenario: password minimum enforced by Auth
    given: local stack
    when: signUp with "Abc1234" (7) then "Abc12345" (8) for two new emails
    then: first fails weak_password, second succeeds with an unconfirmed user
    test_data:
      input: ["Abc1234", "Abc12345"]
      expected: ["weak_password", "user.email_confirmed_at = null"]
  - id: TC-U-003
    scenario: confirmation email uses the token_hash template
    given: a new sign-up for a random email
    when: read the newest message for that address from Mailpit's API
    then: body contains a link to /auth/confirm with token_hash and type=email
    test_data:
      input: "GET http://127.0.0.1:54324/api/v1/messages"
      expected: "/^http:\\/\\/localhost:5173\\/auth\\/confirm\\?token_hash=[^&]+&type=email/"
  - id: TC-U-004
    scenario: unconfirmed account cannot sign in
    given: signed-up, unconfirmed account
    when: signInWithPassword with the right password
    then: error code email_not_confirmed
    test_data:
      input: { email: new, password: "Abc12345" }
      expected: email_not_confirmed
  - id: TC-U-005
    scenario: password change requires the current password
    given: confirmed, signed-in account with password "Abc12345"
    when: updateUser({ password "Xyz98765" }) then updateUser({ password "Xyz98765", current_password "Abc12345" })
    then: first rejected, second succeeds
    test_data:
      input: [{ password: Xyz98765 }, { password: Xyz98765, current_password: Abc12345 }]
      expected: [error, ok]
```

**Notes** — These checks talk to the real local stack, so they live in a separate suite (e.g. `scripts/supabase-auth.test.ts`, run by `pnpm test:supabase`) that needs Docker; propose adding it to the gate in the review note. Local Auth has no hourly email limit, so tests can sign up freely; use random `@example.test` emails per test (the domain T-009 allowlists).

### T-002 — API token verification

```yaml
- title: Verify Supabase access tokens in the API (AUTH_MODE=supabase)
- description: >
  Implement design.md §Components (API) and §API Contracts. In `config/env.ts`: AUTH_MODE
  `mock | supabase` defaulting to `supabase`, `SUPABASE_URL` required in supabase mode,
  `Config.supabaseAuth { issuer, jwksUrl, audience }`, mock still refused in production (ADR-008).
  Add `jose` and `src/auth/supabase-identity-resolver.ts` (ADR-001): bearer parsing, jwtVerify
  with algorithms [ES256, RS256], issuer, audience, 30 s tolerance, then sub-is-UUID, role and
  is_anonymous checks. Every failure → AppError 401 `unauthenticated` with `WWW-Authenticate:
  Bearer` and a log `reason` (no token); JWKS fetch failure with no usable cached key → 503
  `auth_unavailable` with `Retry-After: 5` (ADR-007). Wire the branch into `identityResolverFor`,
  declare the `bearerAuth` scheme in the OpenAPI spec for non-public routes, update
  `.env.example` (supabase mode with local URL; mock documented as dev/test only) and CLAUDE.md.
  Tests sign their own tokens with a jose-generated ES256 key and createLocalJWKSet.
- agent: software-engineer-backend
- depends_on: []
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] `GET /me` with a valid token returns `{ id: sub, email, displayName: null }`
- [ ] Every 401 reason in design.md §All non-public routes has a passing test, and all return the same body (only `requestId` differs)
- [ ] `/health`, `/ready`, `/openapi.json` and `OPTIONS` requests need no token in supabase mode
- [ ] JWKS unreachable → 503 `auth_unavailable` with `Retry-After: 5`; the request is not 401
- [ ] Config: supabase mode without `SUPABASE_URL` fails with `ConfigError` naming it; `AUTH_MODE=mock` with `NODE_ENV=production` still fails; unset AUTH_MODE means supabase
- [ ] A log line for a request with a bearer token shows `authorization: "[redacted]"`
- [ ] `/openapi.json` declares `bearerAuth` and applies it to `/me`, not to `/health`
- [ ] p95 of 1,000 verifications against a cached local key set ≤ 5 ms (timed test)
- [ ] Existing mock-mode tests still pass unchanged

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-006
    scenario: valid token resolves the identity
    given: app in supabase mode with a local ES256 key set
    when: GET /me with a token { sub U, email "a@x.io", role authenticated, aud authenticated, iss <issuer>, exp now+3600 }
    then: 200 with id U
    test_data:
      input: { sub: "6f1c2b9e-0d4a-4c8e-9a51-2f6c0b7d3e11", email: "a@x.io" }
      expected: { status: 200, body: { id: "6f1c2b9e-0d4a-4c8e-9a51-2f6c0b7d3e11", email: "a@x.io", displayName: null } }
  - id: TC-U-007
    scenario: rejected tokens all answer the same 401
    given: app in supabase mode
    when: GET /me with each bad input
    then: 401, code unauthenticated, WWW-Authenticate Bearer, identical body shape
    test_data:
      input: [no header, "Basic abc", "Bearer not.a.jwt", wrong signature key, unknown kid, alg HS256 signed with a secret, alg none, iss "https://evil.example/auth/v1", aud "anon", exp now-120, sub "admin", role anon, is_anonymous true]
      expected: { status: 401, code: unauthenticated, header: "WWW-Authenticate: Bearer" }
  - id: TC-U-008
    scenario: clock skew within tolerance is accepted
    given: token with exp now-20s
    when: GET /me
    then: 200
    test_data:
      input: { exp: "now-20s" }
      expected: { status: 200 }
  - id: TC-U-009
    scenario: JWKS outage is not a sign-out
    given: keys function throws JWKSTimeout / fetch error
    when: GET /me with an otherwise valid token
    then: 503 auth_unavailable, Retry-After 5
    test_data:
      input: { keys: "throws JWKSTimeout" }
      expected: { status: 503, code: auth_unavailable, retryAfter: "5" }
  - id: TC-U-010
    scenario: public paths skip auth in supabase mode
    given: app in supabase mode, no token
    when: GET /health, GET /openapi.json, OPTIONS /me
    then: not 401
    test_data:
      input: ["/health", "/openapi.json", "OPTIONS /me"]
      expected: [200, 200, 204]
  - id: TC-U-011
    scenario: config validation for supabase mode
    given: baseEnv with AUTH_MODE supabase
    when: loadConfig without SUPABASE_URL; with "http://127.0.0.1:54321"; AUTH_MODE unset; mock in production
    then: ConfigError(SUPABASE_URL); issuer "http://127.0.0.1:54321/auth/v1"; authMode supabase; ConfigError(AUTH_MODE)
    test_data:
      input: [{ SUPABASE_URL: "" }, { SUPABASE_URL: "http://127.0.0.1:54321" }, { AUTH_MODE: unset }, { AUTH_MODE: mock, NODE_ENV: production }]
      expected: [ConfigError SUPABASE_URL, { issuer: "http://127.0.0.1:54321/auth/v1", jwksUrl: "http://127.0.0.1:54321/auth/v1/.well-known/jwks.json", audience: authenticated }, supabase, ConfigError AUTH_MODE]
  - id: TC-U-012
    scenario: two users see only their own identity
    given: tokens for users U and V
    when: GET /me with each
    then: each response carries its own sub
    test_data:
      input: [U, V]
      expected: [{ id: U }, { id: V }]
  - id: TC-U-013
    scenario: bearer token never reaches the logs
    given: app with a capturing logStream
    when: GET /me with a valid token
    then: captured output has no token text and shows authorization "[redacted]"
    test_data:
      input: "Bearer eyJ…"
      expected: "no 'eyJ' substring in logs"
```

**Notes** — `createRemoteJWKSet` caches keys and refetches on an unknown `kid` (30 s cooldown); keep the defaults. Distinguish jose's `JWKSTimeout` and fetch errors (503) from `JWKSNoMatchingKey` (401). `test/env.ts` keeps `AUTH_MODE: 'mock'`; add a `supabaseEnv` and a `signTestToken(claims)` helper in `test/`.

### T-003 — Web auth foundation

```yaml
- title: AuthClient port, Supabase adapter, guards and authenticated api-client
- description: >
  Implement design.md §Components (Web) except the screens: `src/config.ts` (VITE_AUTH_MODE,
  VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY), the `AuthClient` port, the supabase-js
  adapter (only importer of `@supabase/supabase-js`, enforced with oxlint `no-restricted-imports`),
  the mock adapter, a `FakeAuthClient` for tests under `src/test/`, `auth-errors.ts` mapping per
  design.md §Error mapping, `safe-next.ts`, `guards.ts` (`requireSession` as route middleware on
  the `app` route — not its loader, because matched loaders run in parallel — and
  `redirectIfSignedIn`), and `lib/api-client.ts` with the bearer header, no request without a
  session, and the 401 → refresh once → retry (re-sendable bodies, incl. FormData) → sign out +
  redirect flow. Subscribe to `onChange` at the app root so a
  SIGNED_OUT from another tab sends the user to sign-in with state.reason 'session_ended'. Add
  `apps/web/.env.example`. The existing sign-in page keeps working through the mock adapter until
  T-004 replaces it.
- agent: react-vite-developer
- depends_on: []
- status: review
- size: M
```

#### Acceptance criteria

- [ ] Opening `/lists` with no session redirects to `/auth/sign-in?next=%2Flists`; with a session it renders
- [ ] With no session, no child route loader runs and no API request is made (a spy loader on a child route is never called)
- [ ] `safeNext` passes every case in TC-U-016 below
- [ ] `api-client` sends `Authorization: Bearer <token>` when a session exists and none in mock mode
- [ ] A 401 triggers exactly one `refresh()` and one retry; a second 401 calls `signOut()` and navigates to sign-in with `next` = current path and the session-ended notice
- [ ] Only `features/auth/supabase-auth-client.ts` imports `@supabase/supabase-js` (lint fails otherwise)
- [ ] App startup in supabase mode without `VITE_SUPABASE_URL` throws a clear error naming it
- [ ] `VITE_AUTH_MODE=mock` keeps today's behaviour (no guard redirects, no token)
- [ ] Existing router tests pass (with the fake signed in)

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-014
    scenario: guard redirects a signed-out visitor and keeps the target
    given: FakeAuthClient with no session
    when: navigate to /stocks/abc?tab=lenses
    then: location is /auth/sign-in?next=%2Fstocks%2Fabc%3Ftab%3Dlenses
    test_data:
      input: "/stocks/abc?tab=lenses"
      expected: "/auth/sign-in?next=%2Fstocks%2Fabc%3Ftab%3Dlenses"
  - id: TC-U-014b
    scenario: guard runs before child loaders
    given: FakeAuthClient with no session; a child route under app with a spy loader; fetch spy
    when: navigate to that child route
    then: spy loader not called, fetch not called, location is sign-in
    test_data:
      input: { session: null, route: "/stocks" }
      expected: { childLoaderCalls: 0, fetchCalls: 0 }
  - id: TC-U-015
    scenario: guest page sends a signed-in user to stocks
    given: FakeAuthClient signed in
    when: navigate to /auth/sign-in and /auth/sign-up
    then: location is /stocks for both
    test_data:
      input: ["/auth/sign-in", "/auth/sign-up"]
      expected: ["/stocks", "/stocks"]
  - id: TC-U-016
    scenario: safeNext only allows same-origin app paths
    given: safeNext
    when: called with each input
    then: returns the expected path
    test_data:
      input: ["/lists", "/stocks/1?x=2#y", null, "", "lists", "//evil.example", "/\\evil.example", "https://evil.example/", "javascript:alert(1)", "/auth/sign-in", "%2F%2Fevil.example"]
      expected: ["/lists", "/stocks/1?x=2#y", "/stocks", "/stocks", "/stocks", "/stocks", "/stocks", "/stocks", "/stocks", "/stocks", "/stocks"]
  - id: TC-U-017
    scenario: api-client recovers from one expired token
    given: fetch returns 401 then 200; fake refresh() succeeds with token T2
    when: apiClient.get('/me')
    then: refresh called once, second request carries Bearer T2, result is the 200 body
    test_data:
      input: { responses: [401, 200] }
      expected: { refreshCalls: 1, secondAuth: "Bearer T2" }
  - id: TC-U-018
    scenario: api-client gives up after a second 401
    given: fetch returns 401 twice
    when: apiClient.get('/lists') while on /lists
    then: signOut called; navigation to /auth/sign-in?next=%2Flists with state.reason session_ended; call rejects with ApiError 401
    test_data:
      input: { responses: [401, 401], path: "/lists" }
      expected: { signOutCalls: 1, location: "/auth/sign-in?next=%2Flists", reason: session_ended }
  - id: TC-U-019
    scenario: Supabase errors map to AuthErrorCode
    given: the adapter's mapError
    when: called with SDK errors
    then: maps per design.md §Error mapping
    test_data:
      input: [invalid_credentials, email_not_confirmed, over_email_send_rate_limit, otp_expired, "status 500", "TypeError: Failed to fetch", whatever_new]
      expected: [invalid_credentials, email_not_confirmed, rate_limited, link_invalid, unavailable, unavailable, unknown]
  - id: TC-U-020
    scenario: sign-out in another tab ends this tab's session
    given: signed in on /stocks
    when: fake emits SIGNED_OUT
    then: location /auth/sign-in with state.reason session_ended
    test_data:
      input: { event: SIGNED_OUT }
      expected: { location: "/auth/sign-in" }
```

**Notes** — The `app` middleware awaits `getSession()`, which reads storage and refreshes an expired token first, so pages never render with a stale session. Confirm route middleware is enabled by default on the installed React Router v8 (otherwise turn on its middleware flag in `createBrowserRouter`); a parent loader is not an acceptable fallback. Keep supabase-js's `detectSessionInUrl: false`: `/auth/confirm` verifies links itself (ADR-002).

### T-004 — Sign-in and sign-up screens

```yaml
- title: Real sign-in, sign-up and check-your-email screens
- description: >
  Implement per ux-design.md §Shared patterns, §Sign in, §Sign up, §Check your email and the auth
  hi-fi spec. Add shadcn `alert` (fix the `@/lib/utils` import if needed). Build `PasswordInput`
  and the shared password-rule validator (8–72, confirm must match). Rework `SignInForm` to call
  `authClient.signIn` and navigate to `safeNext(next)`; remove the "not connected yet" text; add
  the Forgot password and Sign up links (carrying `next`); show the session-ended notice from
  router state; handle `email_not_confirmed` with resend. Add `/auth/sign-up` (SignUpForm, with
  the invite-only alert for `signup_not_allowed`, FR-018) and
  `/auth/check-email` (email from router state, field fallback, resend with 60 s cooldown). Treat
  `user_already_exists` as success (FR-003).
- agent: react-vite-developer
- depends_on: [T-003]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] Correct credentials land on `safeNext(next)` with `replace`; wrong ones show "Email or password is incorrect.", clear the password and focus it
- [ ] An unconfirmed account sees the confirm-first alert with Resend; resend leads to Check your email
- [ ] Sign-up client checks show the four password messages from ux-design.md on the right field, and no call is made
- [ ] A registered and an unregistered allowlisted email produce the same Check your email screen
- [ ] A non-allowlisted email shows the invite-only alert and stays on Sign up
- [ ] Resend is disabled for 60 s after each send and shows the countdown
- [ ] No email or password ever appears in the URL (asserted after every flow)
- [ ] Rate-limit and network errors show the destructive alert with the mapped copy
- [ ] Keyboard-only: tab order as ux-design.md; focus on the `h1` after navigation and on the first invalid field after a failed submit

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-021
    scenario: password rules
    given: validateNewPassword(password, confirm)
    when: called with each pair
    then: returns the expected error per field
    test_data:
      input: [["", ""], ["Abc1234", "Abc1234"], ["Abc12345", "Abc12345"], ["a×73 chars", same], ["a×72 chars", same], ["Abc12345", "Abc12346"]]
      expected: [{ password: "Enter a password." }, { password: "Use at least 8 characters." }, {}, { password: "Use 72 characters or fewer." }, {}, { confirm: "Passwords don't match." }]
  - id: TC-U-022
    scenario: successful sign-in returns to next
    given: fake account a@x.io / Abc12345, URL /auth/sign-in?next=%2Flists
    when: type email and password, press Enter
    then: signIn called once with those values; location /lists
    test_data:
      input: { email: "a@x.io", password: "Abc12345", next: "/lists" }
      expected: { location: "/lists" }
  - id: TC-U-023
    scenario: wrong password
    given: fake returns invalid_credentials
    when: submit
    then: alert "Email or password is incorrect.", password empty and focused, email kept
    test_data:
      input: { email: "a@x.io", password: "wrong" }
      expected: { alert: "Email or password is incorrect.", passwordValue: "" }
  - id: TC-U-024
    scenario: unconfirmed account can resend
    given: fake returns email_not_confirmed
    when: submit, then click Resend
    then: resendConfirmation("a@x.io") called; location /auth/check-email with state.email
    test_data:
      input: { email: "a@x.io" }
      expected: { resendCalls: 1, location: "/auth/check-email" }
  - id: TC-U-025
    scenario: sign-up hides whether the email exists
    given: fake returns user_already_exists for taken@x.io and ok for new@x.io
    when: sign up with each
    then: both reach /auth/check-email with the same heading
    test_data:
      input: ["taken@x.io", "new@x.io"]
      expected: ["Check your email", "Check your email"]
  - id: TC-U-025b
    scenario: sign-up outside the allowlist
    given: fake signUp returns signup_not_allowed
    when: sign up with stranger@gmail.com / Abc12345
    then: alert "Sign-up is invite-only. Ask the owner to add this email.", location /auth/sign-up, focus on Email
    test_data:
      input: { email: "stranger@gmail.com" }
      expected: { alert: "Sign-up is invite-only. Ask the owner to add this email.", location: "/auth/sign-up" }
  - id: TC-U-026
    scenario: resend cooldown
    given: check-email with state.email, fake timers
    when: click Resend, advance 59 s, then 1 s more
    then: disabled with "Resend in 1s" at 59 s; enabled at 60 s
    test_data:
      input: { advance: [59000, 1000] }
      expected: ["disabled", "enabled"]
  - id: TC-U-027
    scenario: check-email after reload asks for the email
    given: /auth/check-email with no router state
    when: render
    then: an Email field and a Resend email button are shown
    test_data:
      input: { state: null }
      expected: { emailField: true }
```

**Notes** — Keep the native `required` and `type="email"`; the custom checks run on submit only, never on each keystroke. Sign-in does not apply the 8-character rule (old accounts or Supabase changes must still sign in).

### T-005 — Email links and password reset screens

```yaml
- title: Confirm-link handler, link-expired, forgot-password and set-new-password screens
- description: >
  Implement per ux-design.md §Confirming, §Link expired, §Forgot password, §Set a new password and
  design.md §Routes. `/auth/confirm` loader reads token_hash, type (email | recovery) and next,
  calls `verifyEmailLink`, and redirects (replacing history): email → safeNext(next) with toast
  "Email confirmed. Welcome to Investhesis."; recovery → /auth/reset-password; failure or missing
  params → /auth/link-expired with state.type. Pending UI shows the Confirming screen.
  `/auth/link-expired` offers resend or new reset by type (both when unknown) and the
  already-signed-in variant. `/auth/forgot-password` shows the neutral sent state (FR-011),
  prefilled from sign-in via router state. `/auth/reset-password` requires a session (else
  link-expired), uses `NewPasswordForm`, handles `same_password`, then goes to /stocks with toast.
- agent: react-vite-developer
- depends_on: [T-003, T-004]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] A valid confirmation link signs the user in and lands on `safeNext(next)`; the `token_hash` URL is not left in history (`replace`)
- [ ] A valid recovery link always lands on `/auth/reset-password`, whatever `next` says
- [ ] Expired, used, missing or unknown-type links land on Link expired with the right actions
- [ ] Forgot password shows the same sent message for registered and unregistered emails; only `rate_limited`/`unavailable` show an error
- [ ] Set a new password rejects rule breaks and `same_password` on the field, and succeeds to `/stocks` with the toast
- [ ] Opening `/auth/reset-password` without a session goes to Link expired (type recovery)
- [ ] Copy says links expire in 1 hour

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-028
    scenario: confirm link success
    given: fake verifyEmailLink ok for ("h1", email)
    when: open /auth/confirm?token_hash=h1&type=email&next=%2Flists
    then: location /lists, history length unchanged (replace), toast shown
    test_data:
      input: "/auth/confirm?token_hash=h1&type=email&next=%2Flists"
      expected: { location: "/lists", toast: "Email confirmed. Welcome to Investhesis." }
  - id: TC-U-029
    scenario: recovery link ignores next
    given: fake verifyEmailLink ok for ("h2", recovery)
    when: open /auth/confirm?token_hash=h2&type=recovery&next=%2Flists
    then: location /auth/reset-password
    test_data:
      input: "/auth/confirm?token_hash=h2&type=recovery&next=%2Flists"
      expected: "/auth/reset-password"
  - id: TC-U-030
    scenario: bad links
    given: fake returns link_invalid for h3
    when: open each URL
    then: location /auth/link-expired with state.type
    test_data:
      input: ["?token_hash=h3&type=email", "?type=email", "?token_hash=h4", "?token_hash=h4&type=magiclink", "?token_hash=h3&type=email&next=%2F%2Fevil.example"]
      expected: [email, email, unknown, unknown, email]
  - id: TC-U-031
    scenario: forgot password is neutral
    given: fake requestPasswordReset ok for any email
    when: submit "nobody@x.io"
    then: sent state "If an account exists for nobody@x.io…", focus on its heading
    test_data:
      input: "nobody@x.io"
      expected: "If an account exists for nobody@x.io, we sent a link to reset its password."
  - id: TC-U-032
    scenario: forgot password rate limit
    given: fake returns rate_limited
    when: submit
    then: destructive alert "Too many attempts. Try again in a few minutes."; form stays
    test_data:
      input: { error: rate_limited }
      expected: { alert: "Too many attempts. Try again in a few minutes." }
  - id: TC-U-033
    scenario: set new password
    given: recovery session; fake setNewPassword returns same_password, then ok
    when: submit "Abc12345"/"Abc12345" twice
    then: first shows field error "Choose a password you haven't used here."; second goes to /stocks with toast "Password updated. You're signed in."
    test_data:
      input: ["Abc12345", "Abc12345"]
      expected: ["same_password error", "/stocks"]
  - id: TC-U-034
    scenario: reset page without a session
    given: FakeAuthClient with no session
    when: open /auth/reset-password
    then: location /auth/link-expired, state.type recovery
    test_data:
      input: "/auth/reset-password"
      expected: { location: "/auth/link-expired", type: recovery }
```

**Notes** — `/auth/confirm`, `/auth/link-expired` and `/auth/reset-password` are not guest pages: they must not use `redirectIfSignedIn` (a recovery session is a signed-in session).

### T-006 — Account page and account menu

```yaml
- title: Change-password page and real account menu
- description: >
  Implement per ux-design.md §Account and §Account menu. The `app` route loader also loads
  `GET /me` (through api-client) and passes it to `AppLayout`/`NavUser` (name = email, initials
  from the local part, second line hidden when it repeats). Enable Account → `/account` (crumb
  "Account", add to the route table; not in the main nav). `/account` shows "Signed in as …" and
  a Card with `ChangePasswordForm` (current, new, confirm) calling `changePassword`; success toast
  and clear; `wrong_current_password` / `same_password` / `weak_password` on the right field.
  Sign out becomes a menu action: `signOut()` then navigate to /auth/sign-in (replace).
- agent: react-vite-developer
- depends_on: [T-003, T-004]
- status: backlog
- size: S
```

#### Acceptance criteria

- [ ] The account menu shows the email from `GET /me` instead of the placeholder user
- [ ] Account opens `/account`; the breadcrumb reads "Account"
- [ ] Changing the password with the right current password shows "Password changed." and clears all three fields
- [ ] A wrong current password shows "Current password is incorrect." on that field, clears and focuses it
- [ ] Sign out ends the session (fake has no session afterwards) and lands on `/auth/sign-in`; Back does not re-enter the app without signing in
- [ ] In mock mode the menu shows the mock user's email from `GET /me`

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-035
    scenario: menu shows the signed-in email
    given: GET /me stub returns { id U, email "investor@x.io", displayName null }
    when: render the app at /stocks and open the account menu
    then: "investor@x.io" shown once per summary, initials "IN"
    test_data:
      input: { email: "investor@x.io" }
      expected: { text: "investor@x.io", initials: "IN" }
  - id: TC-U-036
    scenario: change password success
    given: fake changePassword ok
    when: fill current "Abc12345", new "Xyz98765", confirm "Xyz98765", submit
    then: changePassword("Abc12345", "Xyz98765") called; toast "Password changed."; fields empty
    test_data:
      input: { current: Abc12345, next: Xyz98765 }
      expected: { toast: "Password changed.", fieldsEmpty: true }
  - id: TC-U-037
    scenario: wrong current password
    given: fake returns wrong_current_password
    when: submit
    then: error on Current password, that field empty and focused, new fields kept
    test_data:
      input: { current: "nope", next: Xyz98765 }
      expected: { fieldError: "Current password is incorrect." }
  - id: TC-U-038
    scenario: sign out
    given: signed in on /lists
    when: open account menu, choose Sign out, then history back
    then: location /auth/sign-in; after back, guard redirects to sign-in again
    test_data:
      input: { from: "/lists" }
      expected: { location: "/auth/sign-in" }
```

**Notes** — The new-password rules come from T-004's validator; do not duplicate them.

### T-007 — Design test cases — user auth

```yaml
- title: Design test cases — user auth
- description: >
  Using the software-tester-design skill, produce structured TC-xxx test cases covering
  all test levels: unit boundaries, API (happy path + error paths + auth), frontend
  component, and E2E flows. Run Steps 0–4 (SUT definition → business flow → field specs
  → scenarios → test data). Output must be in TC-xxx format for software-tester-automation.
  Inputs: requirements.md, design.md, ux-design.md of this slice. Must cover every FR and NFR,
  the allowlist rules (FR-018), the enumeration-resistance cases (FR-003, FR-005, FR-011), open-redirect inputs for `next`,
  token-tampering cases for the API, the end-to-end flows against local Supabase with Mailpit
  (sign up → confirm → /me; reset → sign in with the new password; change password; sign out;
  expired session recovery), keyboard-only sign-in, and the 360 px layout. Save as
  docs/features/user-auth/v1.0/test-cases.md.
- agent: software-tester-design
- depends_on: []
- status: doing
- size: S
```

#### Acceptance criteria

- [ ] SUT definition documented
- [ ] TC-xxx cases cover happy path, boundaries, error paths, and business rules
- [ ] Each TC includes Level, Input, Expected Output, Preconditions, and Mock needed
- [ ] A traceability table maps every FR-001–FR-018 and NFR-001–NFR-008 to at least one TC

**Notes** — Runs in parallel with engineering tasks; depends only on requirements/design, not on code.

### T-008 — Automate tests — user auth

```yaml
- title: Automate tests — user auth
- description: >
  Using the software-tester-automation skill, convert the TC-xxx cases from T-007 into
  runnable scripts at the appropriate levels (Unit, API, Frontend Component, E2E).
  Run the full suite against the implementation. End-to-end flows run with Playwright against
  `pnpm dev` (web + API in supabase mode) and local Supabase, reading emails from Mailpit's API
  (http://127.0.0.1:54324). Add Playwright if Stock Lists T-013 has not; otherwise extend its
  setup. Includes an axe check of every auth screen in light and dark themes. New suites join
  the test gate with one root command.
- agent: software-tester-automation
- depends_on: [T-001, T-002, T-003, T-004, T-005, T-006, T-007, T-009]
- status: backlog
- size: L
```

#### Acceptance criteria

- [ ] All TC-* from T-007 automated and passing
- [ ] Coverage >= 90% lines for `apps/api/src/auth/` and `apps/web/src/features/auth/`
- [ ] E2E sign-up with a non-allowlisted email fails with the invite-only alert and no Mailpit message
- [ ] Test report produced with pass/fail per TC-id
- [ ] E2E sign up → confirm → `GET /api/me` passes against local Supabase in a clean run
- [ ] The E2E suite runs with one root command documented in CLAUDE.md

**Notes** — Report "T-008 done" with the full test report when all TCs pass. Rate limiting is not tested end to end (local Auth limits differ from hosted); its UI is covered by component tests.

### T-009 — Sign-up allowlist

```yaml
- title: Invite-only sign-up through the Before User Created hook
- description: >
  Implement design.md §Data Model and ADR-009: migration
  `supabase/migrations/<timestamp>_signup_allowlist.sql` (starts with `create schema if not exists
  app` and Stock Lists' revokes, so either slice's migration can run first) creating
  `app.signup_allowlist` and `app.hook_before_user_created(jsonb)` with the grants and revokes
  shown; enable the hook in `supabase/config.toml`; add `@example.test` to `supabase/seed.sql`
  (create or extend). Document in `supabase/README.md` how the owner adds or removes an entry
  with SQL, and add the hosted steps (push the migration, enable the hook in the dashboard,
  insert the owner's address) to the hosted checklist. Tests run against the local stack in the
  same suite as T-001.
- agent: software-engineer-backend
- depends_on: [T-001]
- status: backlog
- size: S
```

#### Acceptance criteria

- [ ] `pnpm db:start && pnpm db:reset` applies the migration and the seed with no errors, before or after Stock Lists' migration
- [ ] Local sign-up with `new@example.test` succeeds; with `stranger@gmail.com` fails with HTTP 403 `signup_not_allowed`, creates no `auth.users` row and sends no Mailpit message
- [ ] `anon` and `authenticated` cannot select `app.signup_allowlist` or execute the hook function
- [ ] The `pattern` check rejects upper-case values and values without `@`
- [ ] `supabase/README.md` explains adding an address and a domain, and lists the hosted steps

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-039
    scenario: hook decisions
    given: allowlist rows 'owner@mail.com' and '@example.test'
    when: select app.hook_before_user_created(event) for each email
    then: '{}' when allowed, the 403 error object otherwise
    test_data:
      input: ["owner@mail.com", "OWNER@Mail.com", "a@example.test", "a@sub.example.test", "other@mail.com", "a@example.test.evil.io"]
      expected: [allow, allow, allow, deny, deny, deny]
  - id: TC-U-040
    scenario: sign-up refused end to end
    given: local stack with the seed
    when: signUp("stranger@gmail.com", "Abc12345")
    then: error status 403, message signup_not_allowed; select count(*) from auth.users where email = 'stranger@gmail.com' is 0
    test_data:
      input: { email: "stranger@gmail.com" }
      expected: { status: 403, message: signup_not_allowed, users: 0 }
  - id: TC-U-041
    scenario: allowlist is not reachable through the Data API roles
    given: local stack
    when: as role anon and as role authenticated, select from app.signup_allowlist and call the hook
    then: permission denied in all four cases
    test_data:
      input: [anon select, anon execute, authenticated select, authenticated execute]
      expected: "SQLSTATE 42501 for all"
  - id: TC-U-042
    scenario: pattern check
    given: migrated database
    when: insert patterns 'Owner@Mail.com', 'mail.com', '@mail.com'
    then: first two fail the check, third succeeds
    test_data:
      input: ["Owner@Mail.com", "mail.com", "@mail.com"]
      expected: ["23514", "23514", "1 row"]
```

**Notes** — Sub-domains do not match a `@domain` entry by design; add them as their own rows. The hook also runs for users created through the Supabase admin API, so add the address first even when creating an account by hand.

## Status Legend

| Status | Changed By | Meaning |
|--------|-----------|---------|
| `backlog` | Orchestrator | Ready, waiting to be picked up |
| `doing` | Orchestrator / Agent | Agent actively working |
| `blocked` | Agent | Stuck, needs human intervention |
| `test` | Agent | Dev done, needs testing |
| `review` | Agent / Tester | Human must review before advancing |
| `done` | Human | Approved and complete |
