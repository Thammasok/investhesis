---
version: 1.0
status: draft
date: 2026-11-21
requires: requirements.md, design.md, ux-design.md, dev-plan.md
task: T-007
---

# Test Cases: User Auth (email + password)

Test design for [requirements.md](requirements.md), [design.md](design.md) and
[ux-design.md](ux-design.md). It keeps the 44 `TC-U-xxx` cases already written into tasks T-001 to
T-006 and T-009 of [dev-plan.md](dev-plan.md) (same IDs, none renumbered) and adds `TC-A-xxx` (API
and Supabase-level), `TC-C-xxx` (web component and static) and `TC-E-xxx` (end-to-end) cases.
`software-tester-automation` (T-008) turns every case into a test whose title starts with its ID.

## 1. System under test

### 1.1 Scope

| Part | Unit under test | Where |
|---|---|---|
| API verifier | `supabaseIdentityResolver`, `identityResolverFor`, `loadConfig` (`AUTH_MODE`, `SUPABASE_URL`), `authenticate` hook, `GET /me`, OpenAPI `bearerAuth`, log redaction | `apps/api` |
| Supabase project | `config.toml` auth settings, ES256 signing key and JWKS, email templates, `app.signup_allowlist` and `app.hook_before_user_created` | `supabase/` |
| Web foundation | `AuthClient` port, supabase adapter, mock adapter, `FakeAuthClient`, `mapError`, `safeNext`, `requireSession` middleware, `redirectIfSignedIn`, `api-client`, `config.ts`, app-root `onChange` subscription | `apps/web/src/features/auth`, `lib`, `config.ts` |
| Web screens | sign-in, sign-up, check-email, confirm, link-expired, forgot-password, reset-password, account, account menu | `apps/web/src/views`, `features/auth/components`, `components/layout/sidebar` |
| Whole flow | web + API in `supabase` mode, local Supabase (`pnpm db:start`), Mailpit API `http://127.0.0.1:54324/api/v1/messages` | Playwright |

Not under test: Supabase Auth's own internals (we assert the behaviour our settings produce), hosted
project settings and rate limits (manual checklist in `supabase/README.md`), production SMTP (OQ-1).

### 1.2 Inputs

| Input | Type and boundaries |
|---|---|
| Email | string; native `type="email"`; allowlist compare is case-insensitive on exact address or `@domain`; sub-domains do not match a domain entry |
| Password (new) | 8 to 72 characters (NFR-002); empty, 7, 8, 72, 73 are the boundaries; confirm must equal it |
| Password (sign-in) | any non-empty string, no length rule |
| Current password | any non-empty string, checked by Supabase |
| `next` query value | string; allowed only if it starts with `/`, not `//` or `/\`, has no scheme, is not under `/auth`; else `/stocks` |
| `token_hash`, `type` (`email`, `recovery`), `next` on `/auth/confirm` | missing, unknown type, used, tampered, expired |
| `Authorization` header | absent, wrong scheme, malformed JWT, tampered, wrong `alg`, `iss`, `aud`, `exp`, `sub`, `role`, `is_anonymous` |
| Router state | `email`, `type`, `reason: 'session_ended'`; never the URL |
| Env | API: `AUTH_MODE` (`mock`, `supabase`, unset), `SUPABASE_URL`, `NODE_ENV`; web: `VITE_AUTH_MODE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |

### 1.3 Outputs

- API: `200 {id, email, displayName: null}`; `401` problem+json `code: unauthenticated` with `WWW-Authenticate: Bearer`; `503` `code: auth_unavailable` with `Retry-After: 5`; log lines with `reason` and `[redacted]` secrets; OpenAPI security scheme.
- Web: route location (with `replace` or push), router state, focus target, alert and field-error copy (exact strings in ux-design.md and design.md §Error mapping), toasts, `AuthClient` calls (arguments and counts), `fetch` calls (headers, count), `document.title`.
- Supabase: `auth.users` rows, emails in Mailpit, token claims, HTTP status and error codes.

### 1.4 Invariants

1. A request on a non-public path never runs a route handler without a verified identity in `supabase` mode (FR-014).
2. The user id always comes from the verified `sub`, never from a body, query or header (FR-015, NFR-001).
3. The 401 body is identical for every rejection reason; only the log differs.
4. Sign-up, sign-in and reset screens reveal allowlist membership only, never whether an account exists (FR-003, FR-005, FR-011, FR-018).
5. No password, token or email link appears in a URL kept in history, a log line, or an error body (NFR-004).
6. `next` can never send the user to another origin (FR-008).
7. With no session in `supabase` mode, no child loader and no API request runs before the redirect (FR-008).
8. `AUTH_MODE=mock` never runs in production (FR-017).

## 2. Business flows

| Flow | Path |
|---|---|
| Sign up (happy) | `/auth/sign-up` → client checks → `signUp` → hook allows → email → `/auth/check-email` → link → `/auth/confirm` → `/stocks` signed in (UC-001, UC-002) |
| Sign up (alt) | already registered → same check-email screen; non-allowlisted → invite-only alert; weak password; mismatch; rate limited; service down |
| Confirm (exceptions) | used, expired, tampered, missing params, unknown type, already signed in elsewhere → link-expired |
| Sign in | email + password → `safeNext(next)` (UC-003); wrong credentials; unconfirmed → resend; rate limited; unavailable |
| Session | reload, restart, silent refresh, 401 → refresh → retry, second 401 → sign out with notice, other-tab sign-out, refresh impossible |
| Guard | signed-out deep link → sign-in with `next`; signed-in on guest page → `/stocks` (UC-007) |
| Sign out | menu → `signOut` → sign-in; Back re-enters guard (UC-004) |
| Forgot / reset | request (neutral) → email → `/auth/confirm?type=recovery` → `/auth/reset-password` → `/stocks` signed in (UC-005); same password; expired link; no session |
| Change password | `/account` → current + new + confirm → toast; wrong current; same; weak (UC-006) |
| API identity | bearer token → verify → `/me`; every rejection class; JWKS outage; two users |

## 3. Techniques and conventions

| Technique | Applied to |
|---|---|
| BVA + EP | password length (7, 8, 72, 73), clock tolerance (-29 s, -31 s), `next` partitions, resend cooldown (59 s, 60 s), initials from short local parts |
| Decision table | sign-up outcome by (allowlisted, registered, password valid, service state); `/auth/confirm` outcome by (`token_hash`, `type`, validity); link-expired variant by (type, signed in) |
| State transition | session: none → signed in → refreshed → expired → signed out; account: unconfirmed → confirmed |
| Error guessing | token tampering, alg confusion, hostile `next`, double submit, StrictMode double call, FormData retry, offline JWKS |
| Use case | E2E journeys UC-001 to UC-007 |

**Test data.** Emails use `@example.test` (allowlisted by the seed); E2E makes each unique:
`e2e-<timestamp>-<n>@example.test`. Fixed values: password `Abc12345`, new password `Xyz98765`,
user `U = 6f1c2b9e-0d4a-4c8e-9a51-2f6c0b7d3e11`, user `V = b3a7d1f0-5e2c-4a96-8b14-7c9e0d2f6a58`,
issuer `http://127.0.0.1:54321/auth/v1`, audience `authenticated`, hostile hosts `evil.example`.
Tests are independent: each makes its own users, tokens and router.

**Mock legend** (column "Mock needed").

| Name | Meaning |
|---|---|
| none | no test double (real local stack) |
| LocalJWKS | jose ES256 key pair + `createLocalJWKSet`; `signTestToken(claims)` helper |
| ThrowingKeys | `keys` function throwing jose `JWKSTimeout` or a fetch error |
| LogCapture | `buildApp` with a capturing `logStream` |
| FakeAuth | `FakeAuthClient` (in-memory accounts, scripted errors, emitted events) |
| FetchStub | stubbed `fetch` with scripted statuses |
| FakeTimers | Vitest fake timers |
| MockAdapter | `mock-auth-client` (`VITE_AUTH_MODE=mock`) |
| Supabase+Mailpit | local stack from `pnpm db:start`, emails read from Mailpit's API |
| AdminAPI | GoTrue admin API (service role key from `supabase status`) to create confirmed or unconfirmed users without email |
| PwRoute | Playwright `page.route` / `page.clock` interception |

Priority: P1 smoke, P2 regression, P3 edge.

---

## 4. Cases from the dev plan (IDs kept)

### Supabase local setup (T-001, integration against the real local stack, `pnpm test:supabase`)

### TC-U-001
**Local JWKS publishes the ES256 key** | Level: Integration | P1 | EP
- **Preconditions:** `pnpm db:keys` then `pnpm db:start` done.
- **Input:** `GET http://127.0.0.1:54321/auth/v1/.well-known/jwks.json`
- **Expected:** 200; exactly one key with `kty: EC`, `crv: P-256`, `alg: ES256` and a `kid`.
- **Mock needed:** none. **Covers:** FR-014, NFR-001, NFR-007.

### TC-U-002
**Password minimum enforced by Auth** | Level: Integration | P1 | BVA
- **Preconditions:** local stack; two fresh `@example.test` emails.
- **Input:** `signUp` with `Abc1234` (7) and `Abc12345` (8).
- **Expected:** first fails `weak_password`; second succeeds with `email_confirmed_at = null`.
- **Mock needed:** none. **Covers:** FR-001, NFR-002.

### TC-U-003
**Confirmation email uses the token_hash template** | Level: Integration | P1 | EP
- **Preconditions:** local stack, Mailpit empty for the address.
- **Input:** sign up a fresh email; `GET http://127.0.0.1:54324/api/v1/messages`.
- **Expected:** exactly one message to that address whose body matches `/^http:\/\/localhost:5173\/auth\/confirm\?token_hash=[^&]+&type=email/` for its link; no `#access_token` fragment.
- **Mock needed:** Supabase+Mailpit. **Covers:** FR-002, NFR-004.

### TC-U-004
**Unconfirmed account cannot sign in** | Level: Integration | P1 | State transition
- **Preconditions:** signed-up, unconfirmed account.
- **Input:** `signInWithPassword({ email, password: "Abc12345" })`.
- **Expected:** error code `email_not_confirmed`; no session.
- **Mock needed:** none. **Covers:** FR-002, FR-014 (Auth never issues a token to an unconfirmed user).

### TC-U-005
**Password change requires the current password** | Level: Integration | P1 | EP
- **Preconditions:** confirmed, signed-in account with `Abc12345`.
- **Input:** `updateUser({ password: "Xyz98765" })`, then `updateUser({ password: "Xyz98765", current_password: "Abc12345" })`.
- **Expected:** first rejected; second succeeds; signing in with `Xyz98765` works afterwards. (If ADR-006's fallback is recorded in design.md, the same outcome is asserted through the fallback path.)
- **Mock needed:** AdminAPI (to create the confirmed user). **Covers:** FR-013.

### API token verification (T-002, in-process `app.inject`)

### TC-U-006
**Valid token resolves the identity** | Level: API | P1 | EP
- **Preconditions:** app in `supabase` mode with a local ES256 key set.
- **Input:** `GET /me` with token `{ sub: U, email: "a@x.io", role: authenticated, aud: authenticated, iss: <issuer>, exp: now+3600 }`.
- **Expected:** 200, body `{ id: U, email: "a@x.io", displayName: null }`.
- **Mock needed:** LocalJWKS. **Covers:** FR-014, FR-015, FR-016, NFR-001.

### TC-U-007
**Rejected tokens all answer the same 401** | Level: API | P1 | EP, error guessing (table-driven, 13 rows)
- **Preconditions:** app in `supabase` mode.
- **Input rows:** no header; `Basic abc`; `Bearer not.a.jwt`; signed by a different key; unknown `kid`; `alg HS256` signed with a secret; `alg none`; `iss https://evil.example/auth/v1`; `aud anon`; `exp now-120`; `sub "admin"`; `role anon`; `is_anonymous true`.
- **Expected:** every row 401, `code: unauthenticated`, `WWW-Authenticate: Bearer`, `content-type: application/problem+json`, body equal after removing `requestId`.
- **Mock needed:** LocalJWKS. **Covers:** FR-014, NFR-001.

### TC-U-008
**Clock skew within tolerance is accepted** | Level: API | P2 | BVA
- **Input:** token with `exp = now-20 s`.
- **Expected:** 200.
- **Mock needed:** LocalJWKS. **Covers:** FR-014.

### TC-U-009
**JWKS outage is not a sign-out** | Level: API | P1 | Error guessing
- **Preconditions:** `keys` throws `JWKSTimeout` (and, second row, a fetch `TypeError`).
- **Input:** `GET /me` with an otherwise valid token.
- **Expected:** 503, `code: auth_unavailable`, header `Retry-After: 5`, not 401.
- **Mock needed:** ThrowingKeys. **Covers:** FR-014 (ADR-007).

### TC-U-010
**Public paths skip auth in supabase mode** | Level: API | P1 | EP
- **Input:** `GET /health`, `GET /openapi.json`, `OPTIONS /me` (with CORS preflight headers), no token.
- **Expected:** 200, 200, 204; none 401.
- **Mock needed:** LocalJWKS. **Covers:** FR-014.

### TC-U-011
**Config validation for supabase mode** | Level: Unit | P1 | EP
- **Preconditions:** `baseEnv`.
- **Input rows:** `SUPABASE_URL ""`; `SUPABASE_URL http://127.0.0.1:54321`; `AUTH_MODE` unset; `AUTH_MODE=mock` with `NODE_ENV=production`.
- **Expected:** `ConfigError` naming `SUPABASE_URL`; `supabaseAuth = { issuer: "http://127.0.0.1:54321/auth/v1", jwksUrl: "http://127.0.0.1:54321/auth/v1/.well-known/jwks.json", audience: "authenticated" }`; `authMode: supabase`; `ConfigError` naming `AUTH_MODE`.
- **Mock needed:** none. **Covers:** FR-017.

### TC-U-012
**Two users see only their own identity** | Level: API | P1 | EP
- **Input:** `GET /me` with tokens for U and V.
- **Expected:** `{ id: U }` and `{ id: V }`.
- **Mock needed:** LocalJWKS. **Covers:** FR-015.

### TC-U-013
**Bearer token never reaches the logs** | Level: API | P1 | EP
- **Preconditions:** capturing `logStream`.
- **Input:** `GET /me` with a valid token `eyJ…`.
- **Expected:** captured output has no `eyJ` substring and shows `authorization: "[redacted]"`.
- **Mock needed:** LocalJWKS, LogCapture. **Covers:** NFR-004.

### Web foundation (T-003)

### TC-U-014
**Guard redirects a signed-out visitor and keeps the target** | Level: Component | P1 | EP
- **Preconditions:** `FakeAuthClient` with no session.
- **Input:** navigate to `/stocks/abc?tab=lenses`.
- **Expected:** location `/auth/sign-in?next=%2Fstocks%2Fabc%3Ftab%3Dlenses`.
- **Mock needed:** FakeAuth. **Covers:** FR-008.

### TC-U-014b
**Guard runs before child loaders** | Level: Component | P1 | Error guessing
- **Preconditions:** no session; child route under `app` with a spy loader; `fetch` spy.
- **Input:** navigate to `/stocks`.
- **Expected:** spy loader calls 0; `fetch` calls 0; location is sign-in.
- **Mock needed:** FakeAuth, FetchStub. **Covers:** FR-008.

### TC-U-015
**Guest page sends a signed-in user to stocks** | Level: Component | P1 | EP
- **Preconditions:** `FakeAuthClient` signed in.
- **Input:** `/auth/sign-in` and `/auth/sign-up`.
- **Expected:** location `/stocks` for both.
- **Mock needed:** FakeAuth. **Covers:** FR-009.

### TC-U-016
**safeNext only allows same-origin app paths** | Level: Unit | P1 | EP (11 inputs)
- **Input → Expected:** `/lists`→`/lists`; `/stocks/1?x=2#y`→same; `null`, `""`, `lists`, `//evil.example`, `/\evil.example`, `https://evil.example/`, `javascript:alert(1)`, `/auth/sign-in`, `%2F%2Fevil.example` → `/stocks`.
- **Mock needed:** none. **Covers:** FR-008.

### TC-U-017
**api-client recovers from one expired token** | Level: Component | P1 | State transition
- **Preconditions:** `fetch` returns 401 then 200; fake `refresh()` yields token T2.
- **Input:** `apiClient.get('/me')`.
- **Expected:** `refresh` called once; second request has `Authorization: Bearer T2`; result is the 200 body.
- **Mock needed:** FakeAuth, FetchStub. **Covers:** FR-010, FR-006.

### TC-U-018
**api-client gives up after a second 401** | Level: Component | P1 | State transition
- **Preconditions:** `fetch` returns 401 twice; current path `/lists`.
- **Input:** `apiClient.get('/lists')`.
- **Expected:** `signOut` called once; navigation to `/auth/sign-in?next=%2Flists` with `state.reason = session_ended`; promise rejects with `ApiError` 401.
- **Mock needed:** FakeAuth, FetchStub. **Covers:** FR-010.

### TC-U-019
**Supabase errors map to AuthErrorCode** | Level: Unit | P1 | EP (7 inputs)
- **Input → Expected:** `invalid_credentials`→`invalid_credentials`; `email_not_confirmed`→same; `over_email_send_rate_limit`→`rate_limited`; `otp_expired`→`link_invalid`; status 500→`unavailable`; `TypeError: Failed to fetch`→`unavailable`; `whatever_new`→`unknown`.
- **Mock needed:** none. **Covers:** FR-005, NFR-003.

### TC-U-020
**Sign-out in another tab ends this tab's session** | Level: Component | P2 | State transition
- **Preconditions:** signed in on `/stocks`.
- **Input:** fake emits `SIGNED_OUT`.
- **Expected:** location `/auth/sign-in`, `state.reason = session_ended`.
- **Mock needed:** FakeAuth. **Covers:** FR-007, FR-010.

### Sign-in and sign-up screens (T-004)

### TC-U-021
**Password rules** | Level: Unit | P1 | BVA, EP
- **Input → Expected:** `["",""]`→`{password:"Enter a password."}`; `Abc1234` ×2→`{password:"Use at least 8 characters."}`; `Abc12345` ×2→`{}`; 73×`a` ×2→`{password:"Use 72 characters or fewer."}`; 72×`a` ×2→`{}`; `Abc12345`/`Abc12346`→`{confirm:"Passwords don't match."}`.
- **Mock needed:** none. **Covers:** FR-001, FR-012, FR-013, NFR-002.

### TC-U-022
**Successful sign-in returns to next** | Level: Component | P1 | Use case
- **Preconditions:** fake account `a@x.io` / `Abc12345`; URL `/auth/sign-in?next=%2Flists`.
- **Input:** type email and password, press Enter.
- **Expected:** `signIn` called once with those values; location `/lists`, entry replaced.
- **Mock needed:** FakeAuth. **Covers:** FR-005, FR-008.

### TC-U-023
**Wrong password** | Level: Component | P1 | EP
- **Preconditions:** fake returns `invalid_credentials`.
- **Input:** submit `a@x.io` / `wrong`.
- **Expected:** `role="alert"` "Email or password is incorrect."; password empty and focused; email kept.
- **Mock needed:** FakeAuth. **Covers:** FR-005.

### TC-U-024
**Unconfirmed account can resend** | Level: Component | P1 | State transition
- **Preconditions:** fake returns `email_not_confirmed`.
- **Input:** submit, then click Resend.
- **Expected:** `resendConfirmation("a@x.io")` once; location `/auth/check-email`, `state.email = "a@x.io"`.
- **Mock needed:** FakeAuth. **Covers:** FR-002.

### TC-U-025
**Sign-up hides whether the email exists** | Level: Component | P1 | Decision table
- **Preconditions:** fake returns `user_already_exists` for `taken@x.io`, ok for `new@x.io`.
- **Input:** sign up with each, password `Abc12345` twice.
- **Expected:** both reach `/auth/check-email` with heading "Check your email" and the same body text apart from the address.
- **Mock needed:** FakeAuth. **Covers:** FR-003.

### TC-U-025b
**Sign-up outside the allowlist** | Level: Component | P1 | EP
- **Preconditions:** fake `signUp` returns `signup_not_allowed`.
- **Input:** `stranger@gmail.com` / `Abc12345`.
- **Expected:** alert "Sign-up is invite-only. Ask the owner to add this email."; location `/auth/sign-up`; focus on Email.
- **Mock needed:** FakeAuth. **Covers:** FR-018.

### TC-U-026
**Resend cooldown** | Level: Component | P2 | BVA
- **Preconditions:** `/auth/check-email` with `state.email`.
- **Input:** click Resend; advance 59 s; advance 1 s.
- **Expected:** at 59 s disabled, label "Resend in 1s"; at 60 s enabled.
- **Mock needed:** FakeAuth, FakeTimers. **Covers:** FR-002, NFR-003.

### TC-U-027
**Check-email after reload asks for the email** | Level: Component | P2 | EP
- **Preconditions:** `/auth/check-email`, no router state.
- **Input:** render.
- **Expected:** Email field and "Resend email" button shown; no address in the URL.
- **Mock needed:** FakeAuth. **Covers:** FR-002, NFR-004.

### Email links and reset (T-005)

### TC-U-028
**Confirm link success** | Level: Component | P1 | Use case
- **Preconditions:** fake `verifyEmailLink` ok for `("h1","email")`.
- **Input:** open `/auth/confirm?token_hash=h1&type=email&next=%2Flists`.
- **Expected:** location `/lists`; history length unchanged (replace); toast "Email confirmed. Welcome to Investhesis."
- **Mock needed:** FakeAuth. **Covers:** FR-004, NFR-004.

### TC-U-029
**Recovery link ignores next** | Level: Component | P1 | EP
- **Preconditions:** fake ok for `("h2","recovery")`.
- **Input:** `/auth/confirm?token_hash=h2&type=recovery&next=%2Flists`.
- **Expected:** location `/auth/reset-password`.
- **Mock needed:** FakeAuth. **Covers:** FR-012.

### TC-U-030
**Bad links** | Level: Component | P1 | Decision table (5 rows)
- **Preconditions:** fake returns `link_invalid` for `h3`.
- **Input → Expected `state.type`:** `?token_hash=h3&type=email`→email; `?type=email`→email; `?token_hash=h4`→unknown; `?token_hash=h4&type=magiclink`→unknown; `?token_hash=h3&type=email&next=%2F%2Fevil.example`→email. All land on `/auth/link-expired`.
- **Mock needed:** FakeAuth. **Covers:** FR-004, FR-008.

### TC-U-031
**Forgot password is neutral** | Level: Component | P1 | EP
- **Preconditions:** fake `requestPasswordReset` ok for any email.
- **Input:** submit `nobody@x.io`.
- **Expected:** "If an account exists for nobody@x.io, we sent a link to reset its password."; focus on the sent-state `h1`.
- **Mock needed:** FakeAuth. **Covers:** FR-011.

### TC-U-032
**Forgot password rate limit** | Level: Component | P2 | EP
- **Preconditions:** fake returns `rate_limited`.
- **Input:** submit.
- **Expected:** destructive alert "Too many attempts. Try again in a few minutes."; form stays.
- **Mock needed:** FakeAuth. **Covers:** FR-011, NFR-003.

### TC-U-033
**Set new password** | Level: Component | P1 | State transition
- **Preconditions:** recovery session; fake `setNewPassword` returns `same_password`, then ok.
- **Input:** submit `Abc12345` / `Abc12345` twice.
- **Expected:** first: field error "Choose a password you haven't used here."; second: location `/stocks`, toast "Password updated. You're signed in."
- **Mock needed:** FakeAuth. **Covers:** FR-012.

### TC-U-034
**Reset page without a session** | Level: Component | P1 | EP
- **Preconditions:** no session.
- **Input:** open `/auth/reset-password`.
- **Expected:** location `/auth/link-expired`, `state.type = recovery`.
- **Mock needed:** FakeAuth. **Covers:** FR-012.

### Account and menu (T-006)

### TC-U-035
**Menu shows the signed-in email** | Level: Component | P1 | EP
- **Preconditions:** `GET /me` stub returns `{ id: U, email: "investor@x.io", displayName: null }`.
- **Input:** render app at `/stocks`, open the account menu.
- **Expected:** "investor@x.io" shown once per summary; initials "IN".
- **Mock needed:** FakeAuth, FetchStub. **Covers:** FR-016.

### TC-U-036
**Change password success** | Level: Component | P1 | Use case
- **Preconditions:** fake `changePassword` ok.
- **Input:** current `Abc12345`, new `Xyz98765`, confirm `Xyz98765`, submit.
- **Expected:** `changePassword("Abc12345","Xyz98765")` once; toast "Password changed."; all fields empty; focus on Current password.
- **Mock needed:** FakeAuth. **Covers:** FR-013.

### TC-U-037
**Wrong current password** | Level: Component | P1 | EP
- **Preconditions:** fake returns `wrong_current_password`.
- **Input:** current `nope`, new `Xyz98765` twice.
- **Expected:** "Current password is incorrect." on that field; field empty and focused; new fields kept.
- **Mock needed:** FakeAuth. **Covers:** FR-013.

### TC-U-038
**Sign out** | Level: Component | P1 | State transition
- **Preconditions:** signed in on `/lists`.
- **Input:** account menu → Sign out; then history back.
- **Expected:** fake has no session; location `/auth/sign-in` (replace); after Back the guard redirects to sign-in again.
- **Mock needed:** FakeAuth. **Covers:** FR-007.

### Allowlist (T-009, integration against local Postgres and Auth)

### TC-U-039
**Hook decisions** | Level: Integration | P1 | EP (6 rows)
- **Preconditions:** rows `owner@mail.com` and `@example.test`.
- **Input → Expected:** `owner@mail.com` allow; `OWNER@Mail.com` allow; `a@example.test` allow; `a@sub.example.test` deny; `other@mail.com` deny; `a@example.test.evil.io` deny. Allow is `{}`, deny is the 403 `signup_not_allowed` object.
- **Mock needed:** none. **Covers:** FR-018.

### TC-U-040
**Sign-up refused end to end** | Level: Integration | P1 | EP
- **Preconditions:** local stack with seed; Mailpit cleared.
- **Input:** `signUp("stranger@gmail.com","Abc12345")`.
- **Expected:** status 403, message `signup_not_allowed`; `select count(*) from auth.users where email='stranger@gmail.com'` is 0; no Mailpit message for that address.
- **Mock needed:** Supabase+Mailpit. **Covers:** FR-018.

### TC-U-041
**Allowlist not reachable through Data API roles** | Level: Integration | P1 | EP
- **Input:** as `anon` and as `authenticated`: `select` from `app.signup_allowlist`; execute the hook.
- **Expected:** SQLSTATE 42501 in all four cases.
- **Mock needed:** none. **Covers:** FR-018, NFR-001.

### TC-U-042
**Pattern check** | Level: Integration | P2 | EP
- **Input:** insert `Owner@Mail.com`, `mail.com`, `@mail.com`.
- **Expected:** first two fail with 23514; third inserts 1 row.
- **Mock needed:** none. **Covers:** FR-018.

---

## 5. New API and Supabase cases (TC-A)

### TC-A-001
**Mock mode ignores the header and serves the mock user** | Level: API | P1 | EP
- **Preconditions:** `AUTH_MODE=mock`, `MOCK_USER_ID=U`, `MOCK_USER_EMAIL=mock@x.io`.
- **Input:** `GET /me` with no header; again with `Authorization: Bearer garbage`.
- **Expected:** both 200 `{ id: U, email: "mock@x.io" }`.
- **Mock needed:** none. **Covers:** FR-017.

### TC-A-002
**Mock mode is refused in production, allowed in development and test** | Level: Unit | P1 | Decision table
- **Input:** `loadConfig` with (`mock`, `development`), (`mock`, `test`), (`mock`, `production`), (`supabase`, `production` with `SUPABASE_URL`).
- **Expected:** ok, ok, `ConfigError(AUTH_MODE)`, ok.
- **Mock needed:** none. **Covers:** FR-017.

### TC-A-003
**Malformed SUPABASE_URL and trailing slash** | Level: Unit | P2 | EP
- **Input:** `SUPABASE_URL` = `not a url`; `http://127.0.0.1:54321/`.
- **Expected:** `ConfigError(SUPABASE_URL)`; issuer `http://127.0.0.1:54321/auth/v1` (no double slash).
- **Mock needed:** none. **Covers:** FR-017.

### TC-A-004
**Tampered payload keeps the old signature** | Level: API | P1 | Error guessing
- **Preconditions:** valid token for U; its payload re-encoded with `sub: V`, signature unchanged.
- **Input:** `GET /me`.
- **Expected:** 401 `unauthenticated`; response never contains V.
- **Mock needed:** LocalJWKS. **Covers:** FR-014, FR-015, NFR-001.

### TC-A-005
**Tampered header and truncated signature** | Level: API | P2 | Error guessing
- **Input:** (a) valid token with the `kid` header changed to an unknown value; (b) valid token with the last 10 signature characters removed; (c) valid token plus `.extra` segment.
- **Expected:** all 401, same body shape as TC-U-007. For (a) the key set is asked for the unknown `kid` at most once, then 401 (not 503).
- **Mock needed:** LocalJWKS. **Covers:** FR-014, NFR-001.

### TC-A-006
**Algorithm confusion with the public key as HMAC secret** | Level: API | P1 | Error guessing
- **Preconditions:** attacker signs `alg: HS256` using the published public key bytes as the secret, with a valid claim set for U.
- **Input:** `GET /me`.
- **Expected:** 401 `unauthenticated`.
- **Mock needed:** LocalJWKS. **Covers:** NFR-001, FR-014.

### TC-A-007
**Identity is never taken from body, query or custom header** | Level: API | P1 | Error guessing
- **Preconditions:** valid token for U.
- **Input:** `GET /me?userId=V&user_id=V` with headers `x-user-id: V`, `x-forwarded-user: V`.
- **Expected:** 200 with `id: U`.
- **Mock needed:** LocalJWKS. **Covers:** FR-015, NFR-001.

### TC-A-008
**Expiry tolerance boundary** | Level: API | P2 | BVA
- **Preconditions:** clock pinned.
- **Input:** tokens with `exp = now-29 s` and `exp = now-31 s`.
- **Expected:** 200 and 401.
- **Mock needed:** LocalJWKS, FakeTimers. **Covers:** FR-014.

### TC-A-009
**Not-yet-valid and claim-less tokens** | Level: API | P2 | Error guessing
- **Input:** token with `nbf = now+600`; token with no `exp`; token with no `sub`.
- **Expected:** 401 for `nbf` future and no `sub`. For no `exp`, 401 is expected (proposal: verifier passes `requiredClaims: ['exp','sub']`; design.md is silent, see §9 gap G-1).
- **Mock needed:** LocalJWKS. **Covers:** FR-014.

### TC-A-010
**Unknown key after refetch is 401, not 503** | Level: API | P1 | Decision table
- **Preconditions:** key set that returns no match (`JWKSNoMatchingKey`) versus one that throws `JWKSTimeout`.
- **Input:** `GET /me` with a token signed by an unlisted key.
- **Expected:** `JWKSNoMatchingKey` → 401; `JWKSTimeout` → 503 (TC-U-009).
- **Mock needed:** ThrowingKeys. **Covers:** FR-014 (ADR-007).

### TC-A-011
**Cached key survives a JWKS outage** | Level: API | P2 | State transition
- **Preconditions:** resolver using `createRemoteJWKSet` against a stub HTTP server.
- **Input:** verify a token (server up), stop the server, verify another token with the same `kid`.
- **Expected:** both 200; JWKS server hit once.
- **Mock needed:** local stub JWKS server. **Covers:** NFR-005, FR-014.

### TC-A-012
**401 and 503 bodies carry no secrets or reasons** | Level: API | P1 | Error guessing
- **Input:** each rejection row of TC-U-007 plus the 503 case.
- **Expected:** body keys exactly `type`, `title`, `status`, `code`, `requestId`; body text contains none of: the token, `exp`, `signature`, `issuer`, `audience`, a stack trace.
- **Mock needed:** LocalJWKS, ThrowingKeys. **Covers:** NFR-004, NFR-001.

### TC-A-013
**Rejection is logged with a reason and without the token** | Level: API | P2 | EP
- **Input:** expired token and wrong-audience token.
- **Expected:** one log line each with `reason` (`expired`, `audience`), `authorization: "[redacted]"`, no `eyJ` substring.
- **Mock needed:** LocalJWKS, LogCapture. **Covers:** NFR-004.

### TC-A-014
**Concurrent users never cross identities** | Level: API | P2 | Error guessing
- **Input:** 50 interleaved `GET /me` calls alternating tokens U and V via `Promise.all`.
- **Expected:** each response id equals its own token's `sub`.
- **Mock needed:** LocalJWKS. **Covers:** FR-015.

### TC-A-015
**OpenAPI declares bearerAuth** | Level: API | P2 | EP
- **Input:** `GET /openapi.json`.
- **Expected:** `components.securitySchemes.bearerAuth = { type: http, scheme: bearer, bearerFormat: JWT }`; `paths./me.get.security` lists it; `/health` and `/ready` have none.
- **Mock needed:** LocalJWKS. **Covers:** FR-014.

### TC-A-016
**Token verification p95 within 5 ms** | Level: Performance | P2 | BVA
- **Preconditions:** cached local key set; 1,000 distinct valid tokens; warm-up of 50.
- **Input:** time `verify` for each.
- **Expected:** p95 ≤ 5 ms; zero network calls (fetch stub never called).
- **Mock needed:** LocalJWKS. **Covers:** NFR-005.

### TC-A-017
**API auth tests run offline** | Level: API | P2 | EP
- **Preconditions:** global `fetch` and `http` replaced by functions that throw.
- **Input:** run TC-U-006, TC-U-007, TC-U-008, TC-A-004 with the local key set.
- **Expected:** all pass; the throwing stubs are never invoked.
- **Mock needed:** LocalJWKS. **Covers:** NFR-007.

### TC-A-018
**Access token claims from local Auth** | Level: Integration | P1 | EP
- **Preconditions:** confirmed user via AdminAPI.
- **Input:** `signInWithPassword`, decode the access token.
- **Expected:** header `alg: ES256` and a `kid` present in the JWKS; `iss: http://127.0.0.1:54321/auth/v1`, `aud: authenticated`, `role: authenticated`, `exp - iat = 3600`, `sub` is a UUID, no `is_anonymous: true`.
- **Mock needed:** AdminAPI. **Covers:** FR-014, NFR-001.

### TC-A-019
**A real local token is accepted by the API verifier** | Level: Integration | P1 | EP
- **Preconditions:** API app built with `createRemoteJWKSet` pointed at the local JWKS.
- **Input:** `GET /me` with the token from TC-A-018.
- **Expected:** 200, `id` equals the user's `auth.users.id`, `email` equals the sign-in email.
- **Mock needed:** AdminAPI. **Covers:** FR-014, FR-015, FR-016, NFR-001.

### TC-A-020
**Anonymous sign-ins are disabled** | Level: Integration | P2 | EP
- **Input:** `signInAnonymously()`.
- **Expected:** error (`anonymous_provider_disabled`); no `auth.users` row with `is_anonymous = true`.
- **Mock needed:** none. **Covers:** FR-014.

### TC-A-021
**Password length ceiling at the provider** | Level: Integration | P2 | BVA
- **Input:** `signUp` with 72 and 73 characters.
- **Expected:** 72 succeeds; 73 is rejected (`weak_password` or validation error) and creates no user.
- **Mock needed:** none. **Covers:** NFR-002.

### TC-A-022
**Existing allowlisted email gives no signal at the provider** | Level: Integration | P1 | Decision table
- **Preconditions:** confirmed user `taken-<n>@example.test`.
- **Input:** `signUp` again with the same email and a different password.
- **Expected:** no error (obfuscated user object, or `user_already_exists` mapped to success by the adapter); still one `auth.users` row; the original password still signs in.
- **Mock needed:** AdminAPI. **Covers:** FR-003.

### TC-A-023
**Sign-in failure is identical for wrong password and unknown email** | Level: Integration | P1 | Decision table
- **Input:** sign in with (existing email, wrong password) and (unknown email, any password).
- **Expected:** both return error code `invalid_credentials`, same HTTP status and same message.
- **Mock needed:** AdminAPI. **Covers:** FR-005.

### TC-A-024
**Reset for an unregistered email is silent** | Level: Integration | P1 | EP
- **Input:** `resetPasswordForEmail("nobody-<n>@example.test")`.
- **Expected:** no error; no Mailpit message to that address; response indistinguishable from a registered email.
- **Mock needed:** Supabase+Mailpit. **Covers:** FR-011.

### TC-A-025
**Recovery email uses the recovery template** | Level: Integration | P1 | EP
- **Input:** `resetPasswordForEmail` for a confirmed user.
- **Expected:** one message whose link matches `http://localhost:5173/auth/confirm?token_hash=…&type=recovery`.
- **Mock needed:** Supabase+Mailpit, AdminAPI. **Covers:** FR-012, NFR-004.

### TC-A-026
**Confirmation link is single-use** | Level: Integration | P1 | State transition
- **Input:** `verifyOtp({ token_hash, type: 'email' })` twice with the link's hash.
- **Expected:** first returns a session; second fails with `otp_expired`.
- **Mock needed:** Supabase+Mailpit. **Covers:** FR-004.

### TC-A-027
**Tampered or truncated token_hash is invalid** | Level: Integration | P2 | Error guessing
- **Input:** `verifyOtp` with the real hash minus its last character, and with `type: 'recovery'` on an email-type hash.
- **Expected:** both fail (`otp_expired` or `bad_code_verifier`), no session.
- **Mock needed:** Supabase+Mailpit. **Covers:** FR-004, FR-012.

### TC-A-028
**Confirmation email frequency limit** | Level: Integration | P2 | BVA
- **Preconditions:** `max_frequency = 60s`.
- **Input:** sign up, then `resend({ type: 'signup' })` within 5 s.
- **Expected:** resend fails `over_email_send_rate_limit` (mapped `rate_limited`); one Mailpit message only.
- **Mock needed:** Supabase+Mailpit. **Covers:** NFR-003.

### TC-A-029
**Foreign redirect URL is not honoured** | Level: Integration | P1 | Error guessing
- **Input:** `signUp` with `emailRedirectTo: "https://evil.example/auth/confirm"`; `resetPasswordForEmail` with `redirectTo: "https://evil.example/"`.
- **Expected:** the email link host is `localhost:5173` (site URL fallback) or the call is rejected; no link points at `evil.example`.
- **Mock needed:** Supabase+Mailpit. **Covers:** FR-008, NFR-004.

### TC-A-030
**Refresh token rotation and reuse detection** | Level: Integration | P3 | State transition
- **Input:** refresh once (token R1 → R2); after 11 s reuse R1.
- **Expected:** R1 is rejected and the session family is revoked (R2 no longer refreshes); reuse within 10 s is tolerated.
- **Mock needed:** AdminAPI. **Covers:** FR-006.

### TC-A-031
**Auth settings match the design** | Level: Static | P2 | EP
- **Input:** parse `supabase/config.toml`.
- **Expected:** values per design.md §Supabase project: `site_url`, `additional_redirect_urls`, `jwt_expiry 3600`, rotation on, reuse interval 10, `enable_signup true`, anonymous off, `minimum_password_length 8`, `enable_confirmations true`, `max_frequency 60s`, `otp_expiry 3600`, templates paths exist, hook enabled with the `pg-functions://postgres/app/hook_before_user_created` URI, `rate_limit` keys not loosened.
- **Mock needed:** none. **Covers:** FR-001, FR-002, FR-018, NFR-002, NFR-003.

### TC-A-032
**Free-tier and cost review** | Level: Static (inspection) | P3 | EP
- **Input:** read `config.toml`, `supabase/README.md`, root and app `package.json`.
- **Expected:** no setting or dependency that needs a paid Supabase plan (no leaked-password protection, session timeboxes, or SAML); README names a free or low-cost SMTP option for OQ-1; the only new dependencies are `jose`, `@supabase/supabase-js` and the Supabase CLI.
- **Mock needed:** none. **Covers:** NFR-008.

---

## 6. New web component and static cases (TC-C)

### Foundation and static checks

### TC-C-001
**Only the adapter imports the Supabase SDK** | Level: Static | P1 | EP
- **Input:** run oxlint on a temp file `apps/web/src/features/auth/fixture.ts` importing `@supabase/supabase-js`; grep `apps/web/src` for the import.
- **Expected:** lint fails on the fixture with `no-restricted-imports`; the grep finds only `supabase-auth-client.ts`.
- **Mock needed:** none. **Covers:** FR-014 (ADR-005), NFR-007.

### TC-C-002
**Startup config in supabase mode** | Level: Unit | P1 | EP
- **Input rows:** `VITE_AUTH_MODE` unset with both Supabase vars; `supabase` without `VITE_SUPABASE_URL`; `supabase` without `VITE_SUPABASE_PUBLISHABLE_KEY`; `mock` with neither.
- **Expected:** mode `supabase`; throws naming `VITE_SUPABASE_URL`; throws naming `VITE_SUPABASE_PUBLISHABLE_KEY`; mode `mock`, no throw.
- **Mock needed:** none. **Covers:** FR-017.

### TC-C-003
**Mock mode keeps today's behaviour** | Level: Component | P1 | EP
- **Preconditions:** `MockAdapter`; fetch stub for `GET /me` returning the mock user.
- **Input:** open `/stocks`; open `/auth/sign-in`; trigger any api-client call.
- **Expected:** `/stocks` renders with no redirect; sign-in redirects to `/stocks`; no `Authorization` header on the request; menu shows the mock user's email from `/me`.
- **Mock needed:** MockAdapter, FetchStub. **Covers:** FR-017, FR-016.

### TC-C-004
**Session survives a reload (adapter and storage)** | Level: Component | P1 | State transition
- **Preconditions:** supabase adapter on a shared in-memory `localStorage`; Supabase HTTP stubbed to return a session on sign-in.
- **Input:** sign in; create a second adapter instance on the same storage; `getSession()`.
- **Expected:** the second instance returns the same user and access token without a network sign-in call.
- **Mock needed:** FetchStub. **Covers:** FR-006.

### TC-C-005
**Expired but refreshable session is renewed before a page renders** | Level: Component | P1 | Decision table
- **Preconditions:** stored session with `expires_at` in the past.
- **Input:** open `/lists` twice: refresh succeeds (T2); refresh fails (`invalid_refresh_token`).
- **Expected:** first renders `/lists` with Bearer T2; second redirects to `/auth/sign-in?next=%2Flists`.
- **Mock needed:** FakeAuth. **Covers:** FR-006, FR-008.

### TC-C-006
**Token refreshed event needs no navigation** | Level: Component | P3 | State transition
- **Input:** fake emits `TOKEN_REFRESHED` on `/stocks`.
- **Expected:** location unchanged; no notice shown.
- **Mock needed:** FakeAuth. **Covers:** FR-006.

### TC-C-007
**api-client sends no request without a session** | Level: Component | P1 | EP
- **Preconditions:** supabase mode, no session, current path `/lists`.
- **Input:** `apiClient.get('/lists')`.
- **Expected:** `fetch` calls 0; same redirect to `/auth/sign-in?next=%2Flists` as the guard.
- **Mock needed:** FakeAuth, FetchStub. **Covers:** FR-008, FR-010.

### TC-C-008
**api-client attaches the bearer header only with a session** | Level: Component | P1 | EP
- **Input:** call with session token T1; call in mock mode.
- **Expected:** first has `Authorization: Bearer T1`; second has no `Authorization` header.
- **Mock needed:** FakeAuth, MockAdapter, FetchStub. **Covers:** FR-014.

### TC-C-009
**api-client retries a FormData body** | Level: Component | P2 | Error guessing
- **Preconditions:** `fetch` returns 401 then 201.
- **Input:** `apiClient.post('/import', formData)` with one file field.
- **Expected:** both requests carry an equal file; one refresh; result 201.
- **Mock needed:** FakeAuth, FetchStub. **Covers:** FR-010.

### TC-C-010
**api-client does not refresh on non-401 failures** | Level: Component | P2 | Decision table
- **Input:** responses 403, 404, 500.
- **Expected:** `refresh` calls 0, `signOut` calls 0; each rejects with `ApiError` of that status.
- **Mock needed:** FakeAuth, FetchStub. **Covers:** FR-010.

### TC-C-011
**api-client when refresh itself fails** | Level: Component | P2 | State transition
- **Preconditions:** `fetch` returns 401; fake `refresh()` returns `{ ok: false }`.
- **Input:** `apiClient.get('/lists')` on `/lists`.
- **Expected:** one `fetch` call (no retry); `signOut` once; navigation to `/auth/sign-in?next=%2Flists` with `session_ended`.
- **Mock needed:** FakeAuth, FetchStub. **Covers:** FR-010, FR-006.

### TC-C-012
**Unknown errors log no secrets** | Level: Component | P2 | Error guessing
- **Preconditions:** `console.error` spy; fake returns `unknown` for sign-in with password `Abc12345`.
- **Input:** submit.
- **Expected:** generic destructive alert shown; spy arguments contain neither `Abc12345` nor any token string.
- **Mock needed:** FakeAuth. **Covers:** NFR-004.

### Sign-in

### TC-C-013
**Sign-in error is identical for unknown email and wrong password** | Level: Component | P1 | Decision table
- **Preconditions:** fake returns `invalid_credentials` for both `nobody@x.io` and `a@x.io` (wrong password).
- **Input:** submit each.
- **Expected:** alert text, aria attributes and focus target are the same in both; nothing names which field was wrong.
- **Mock needed:** FakeAuth. **Covers:** FR-005.

### TC-C-014
**Sign-in does not apply the 8-character rule** | Level: Component | P2 | BVA
- **Input:** password `abc` (3 characters).
- **Expected:** `signIn` called with `abc`; no client-side password error.
- **Mock needed:** FakeAuth. **Covers:** FR-005.

### TC-C-015
**Hostile next values after sign-in** | Level: Component | P1 | Error guessing (table)
- **Preconditions:** valid account.
- **Input:** sign in on `/auth/sign-in?next=` each of `//evil.example`, `/\evil.example`, `https://evil.example/`, `javascript:alert(1)`, `%2F%2Fevil.example`, `/auth/sign-up`, `/lists` (control).
- **Expected:** location `/stocks` for the six hostile values; `/lists` for the control; `window.location` origin unchanged.
- **Mock needed:** FakeAuth. **Covers:** FR-008.

### TC-C-016
**next is carried through the sign-up and forgot links** | Level: Component | P2 | EP
- **Input:** open `/auth/sign-in?next=%2Flists`; read both link hrefs.
- **Expected:** sign-up href `/auth/sign-up?next=%2Flists`, forgot href `/auth/forgot-password?next=%2Flists`; with no `next`, neither href has a query.
- **Mock needed:** FakeAuth. **Covers:** FR-008.

### TC-C-017
**Session-ended notice** | Level: Component | P2 | Decision table
- **Input:** open sign-in with `state.reason = session_ended`; open it with no state.
- **Expected:** first shows a default-variant alert (`role="status"`) "Your session has ended. Sign in again."; second shows none.
- **Mock needed:** FakeAuth. **Covers:** FR-010.

### TC-C-018
**Double submit is ignored and busy state shown** | Level: Component | P2 | Error guessing
- **Preconditions:** fake `signIn` resolves after a controlled delay.
- **Input:** press Enter twice quickly.
- **Expected:** `signIn` called once; button `disabled`, `aria-busy="true"`, label "Signing in…"; inputs still editable.
- **Mock needed:** FakeAuth. **Covers:** NFR-006.

### TC-C-019
**Rate-limit and outage copy on sign-in** | Level: Component | P2 | EP
- **Input:** fake returns `rate_limited`, then `unavailable`, then `unknown`.
- **Expected:** destructive alerts "Too many attempts. Try again in a few minutes.", "Can't reach the sign-in service. Try again.", and the generic text; email field kept.
- **Mock needed:** FakeAuth. **Covers:** NFR-003.

### TC-C-020
**Unconfirmed alert names the email** | Level: Component | P2 | EP
- **Input:** fake returns `email_not_confirmed` for `a@x.io`.
- **Expected:** alert "Confirm your email first. We sent a link to a@x.io." with a Resend control.
- **Mock needed:** FakeAuth. **Covers:** FR-002.

### TC-C-021
**No credentials in the URL after any sign-in outcome** | Level: Component | P1 | Error guessing
- **Input:** submit sign-in with success, wrong password, unconfirmed.
- **Expected:** after each, `location.search` and `location.pathname` contain neither the email nor the password; the form `action` is not a GET with fields (default prevented).
- **Mock needed:** FakeAuth. **Covers:** NFR-004.

### Sign-up

### TC-C-022
**Sign-up client checks block the call** | Level: Component | P1 | BVA (table)
- **Input rows:** empty password; 7 characters; 73 characters; 8 characters with mismatching confirm.
- **Expected:** `signUp` calls 0; messages "Enter a password.", "Use at least 8 characters.", "Use 72 characters or fewer." on Password and "Passwords don't match." on Confirm; focus on the first invalid field.
- **Mock needed:** FakeAuth. **Covers:** FR-001, NFR-002.

### TC-C-023
**Sign-up accepts the boundaries** | Level: Component | P2 | BVA
- **Input:** 8 characters and 72 characters, matching confirm.
- **Expected:** `signUp` called once each with that password.
- **Mock needed:** FakeAuth. **Covers:** FR-001, NFR-002.

### TC-C-024
**Field errors are tied to their inputs** | Level: Component | P2 | EP
- **Input:** trigger "Passwords don't match.".
- **Expected:** Confirm input has `aria-invalid="true"` and `aria-describedby` containing the error element's id; the parent `Field` has `data-invalid`.
- **Mock needed:** FakeAuth. **Covers:** NFR-006.

### TC-C-025
**Server weak_password maps to the field** | Level: Component | P2 | EP
- **Preconditions:** fake returns `weak_password` for a client-valid password.
- **Input:** submit.
- **Expected:** policy text on the Password field; passwords kept.
- **Mock needed:** FakeAuth. **Covers:** FR-001, NFR-002.

### TC-C-026
**Sign-up outage and rate-limit alerts keep the passwords** | Level: Component | P2 | EP
- **Input:** fake returns `rate_limited`, then `unavailable`.
- **Expected:** destructive alert with mapped copy; Email, Password and Confirm values kept; location stays `/auth/sign-up`.
- **Mock needed:** FakeAuth. **Covers:** NFR-003.

### TC-C-027
**Invite-only refusal keeps passwords and differs from existing-account behaviour** | Level: Component | P1 | Decision table
- **Preconditions:** fake: `signup_not_allowed` for `stranger@gmail.com`, `user_already_exists` for `taken@example.test`.
- **Input:** submit each.
- **Expected:** stranger: alert, passwords kept, no navigation; taken: navigates to check-email (the invite-only text appears only for non-allowlisted addresses, so it reveals allowlist membership, not account existence).
- **Mock needed:** FakeAuth. **Covers:** FR-018, FR-003.

### TC-C-028
**Sign-up passwords cleared after navigation** | Level: Component | P3 | State transition
- **Input:** successful sign-up, press Back to `/auth/sign-up`.
- **Expected:** password and confirm fields are empty.
- **Mock needed:** FakeAuth. **Covers:** NFR-004.

### Password input

### TC-C-029
**Visibility toggle** | Level: Component | P2 | EP
- **Input:** click the toggle, press Space on it, then click again.
- **Expected:** input `type` flips `password` ↔ `text`; `aria-label` flips "Show password" ↔ "Hide password"; `aria-pressed` follows; focus stays on the toggle; the toggle is `type="button"` and does not submit the form.
- **Mock needed:** none. **Covers:** NFR-006.

### TC-C-030
**Autocomplete tokens** | Level: Component | P3 | EP
- **Input:** read `autocomplete` on every password input and email input.
- **Expected:** sign-in password and account Current password `current-password`; sign-up, reset and account New/Confirm `new-password`; emails `email`.
- **Mock needed:** FakeAuth. **Covers:** NFR-006.

### Check email

### TC-C-031
**Resend feedback and rate limit** | Level: Component | P2 | EP
- **Preconditions:** `/auth/check-email` with `state.email = "a@x.io"`.
- **Input:** click Resend (ok), wait out cooldown, click again (fake returns `rate_limited`).
- **Expected:** "Sent again." with `role="status"` and cooldown; then destructive alert instead of "Sent again."
- **Mock needed:** FakeAuth, FakeTimers. **Covers:** FR-002, NFR-003.

### TC-C-032
**Check-email page leaks nothing in the URL** | Level: Component | P1 | EP
- **Input:** reach check-email from sign-up with `a@x.io`.
- **Expected:** location is exactly `/auth/check-email`; "Back to sign in" link present; heading focused.
- **Mock needed:** FakeAuth. **Covers:** NFR-004, FR-003.

### TC-C-033
**Reload fallback resend** | Level: Component | P3 | EP
- **Input:** no state; submit the Email field empty, then `a@x.io`.
- **Expected:** empty is blocked by native `required` (no call); second calls `resendConfirmation("a@x.io")` once.
- **Mock needed:** FakeAuth. **Covers:** FR-002.

### Confirm and link-expired

### TC-C-034
**Confirming pending UI** | Level: Component | P3 | EP
- **Preconditions:** fake `verifyEmailLink` held pending.
- **Input:** open `/auth/confirm?token_hash=h1&type=email`, then with `type=recovery`.
- **Expected:** shows "Confirming your email…" and "Checking your link…" respectively, with a spinner marked `aria-hidden`; resolving the call leaves the pending UI.
- **Mock needed:** FakeAuth. **Covers:** FR-004.

### TC-C-035
**Confirm verifies exactly once and never renders the hash** | Level: Component | P1 | Error guessing
- **Preconditions:** StrictMode enabled in the test router.
- **Input:** open `/auth/confirm?token_hash=SECRETHASH&type=email`.
- **Expected:** `verifyEmailLink` called once; `SECRETHASH` appears nowhere in the DOM; Back does not return to the confirm URL (entry replaced).
- **Mock needed:** FakeAuth. **Covers:** FR-004, NFR-004.

### TC-C-036
**Hostile next on a valid email link** | Level: Component | P1 | Error guessing
- **Preconditions:** fake ok for `h5`.
- **Input:** `/auth/confirm?token_hash=h5&type=email&next=//evil.example` and `next=https://evil.example/`.
- **Expected:** location `/stocks` both times.
- **Mock needed:** FakeAuth. **Covers:** FR-008, FR-004.

### TC-C-037
**Link-expired variants** | Level: Component | P1 | Decision table
- **Input → Expected:** `state.type=email`, signed out → email field + "Send a new link"; click calls `resendConfirmation` and goes to check-email. `type=recovery` → click calls `requestPasswordReset` and shows forgot-password's sent state. `type=unknown` → two outline buttons "Resend confirmation" and "Reset password". Signed in (any type) → "You're already signed in." and a "Go to Stocks" button, no form. All variants: "Links work once and expire after 1 hour." and "Back to sign in" (signed-out variants).
- **Mock needed:** FakeAuth. **Covers:** FR-004, FR-012.

### Forgot and reset

### TC-C-038
**Forgot password is identical for registered and unregistered emails** | Level: Component | P1 | Decision table
- **Input:** submit `a@x.io` (registered in the fake) and `nobody@x.io`.
- **Expected:** sent state text identical apart from the address; same focus target; no error alert.
- **Mock needed:** FakeAuth. **Covers:** FR-011.

### TC-C-039
**Forgot prefill, outage and resend cooldown** | Level: Component | P2 | EP
- **Input:** arrive from sign-in with `state.email = "a@x.io"`; submit; then Resend; separately fake returns `unavailable`.
- **Expected:** field prefilled and URL has no email; sent state shows 60 s Resend cooldown; `unavailable` shows the destructive alert and no sent state.
- **Mock needed:** FakeAuth, FakeTimers. **Covers:** FR-011, NFR-003.

### TC-C-040
**Set-new-password client checks** | Level: Component | P1 | BVA
- **Preconditions:** recovery session for `a@x.io`.
- **Input:** 7 characters; 73 characters; 8 characters with mismatch.
- **Expected:** `setNewPassword` calls 0; per-field messages as TC-U-021; page shows "For a@x.io" and has no "Back to sign in".
- **Mock needed:** FakeAuth. **Covers:** FR-012, NFR-002.

### TC-C-041
**Recovery session lost on submit** | Level: Component | P2 | State transition
- **Preconditions:** fake `setNewPassword` returns `link_invalid`.
- **Input:** submit valid passwords.
- **Expected:** location `/auth/link-expired`, `state.type = recovery`.
- **Mock needed:** FakeAuth. **Covers:** FR-012.

### TC-C-042
**Recovery pages are not guest pages** | Level: Component | P1 | Decision table
- **Preconditions:** signed-in (recovery) session.
- **Input:** open `/auth/reset-password`, `/auth/confirm?token_hash=h2&type=recovery`, `/auth/link-expired`.
- **Expected:** none redirects to `/stocks` on load; reset form and link-expired "already signed in" variant render.
- **Mock needed:** FakeAuth. **Covers:** FR-012, FR-009.

### Account and menu

### TC-C-043
**Change-password client checks** | Level: Component | P1 | BVA
- **Input:** new 7 characters; new 73 characters; new 8 with mismatching confirm; all with a filled Current.
- **Expected:** `changePassword` calls 0; messages on New or Confirm as TC-U-021.
- **Mock needed:** FakeAuth. **Covers:** FR-013, NFR-002.

### TC-C-044
**Same or weak password on the right field** | Level: Component | P2 | EP
- **Input:** fake returns `same_password`, then `weak_password`.
- **Expected:** "Choose a password you haven't used here." and the policy text on New password; Current kept.
- **Mock needed:** FakeAuth. **Covers:** FR-013.

### TC-C-045
**Account page content and route** | Level: Component | P2 | EP
- **Input:** open `/account` signed in as `investor@x.io`.
- **Expected:** `h1` "Account"; "Signed in as investor@x.io"; card titled "Change password" with the form labelled by it; breadcrumb "Account"; "Account" absent from the main nav; menu Account item links to `/account`.
- **Mock needed:** FakeAuth, FetchStub. **Covers:** FR-013, FR-016.

### TC-C-046
**Signed-out visitor cannot open /account** | Level: Component | P1 | EP
- **Input:** open `/account`, no session.
- **Expected:** location `/auth/sign-in?next=%2Faccount`.
- **Mock needed:** FakeAuth. **Covers:** FR-008, UC-007.

### TC-C-047
**Initials and repeated second line** | Level: Component | P3 | BVA
- **Input:** `/me` emails `a@x.io`, `ab@x.io`, `investor@x.io`.
- **Expected:** initials "A", "AB", "IN"; second line hidden because it would repeat the email.
- **Mock needed:** FakeAuth, FetchStub. **Covers:** FR-016.

### TC-C-048
**Account menu keyboard behaviour** | Level: Component | P2 | EP
- **Input:** focus the trigger; Enter; ArrowDown; Esc.
- **Expected:** menu opens with `aria-label="Account menu"` trigger; items are `menuitem`; Sign out is a button-like item, not a link; Esc closes and returns focus to the trigger.
- **Mock needed:** FakeAuth. **Covers:** NFR-006, FR-007.

### Accessibility wiring

### TC-C-049
**Focus and title on every auth route** | Level: Component | P2 | EP (table over 7 routes)
- **Input:** navigate to each of sign-in, sign-up, check-email, confirm result, link-expired, forgot-password, reset-password.
- **Expected:** `document.activeElement` is the `h1` (`tabIndex=-1`); `document.title` is `"<Title> · Investhesis"`; after a failed submit focus is the first invalid field, or the password field for `invalid_credentials`.
- **Mock needed:** FakeAuth. **Covers:** NFR-006.

### TC-C-050
**Every control has a visible label and errors are announced** | Level: Component | P1 | EP
- **Input:** on each form, query inputs by `getByLabelText`; trigger a form-level error and a field error.
- **Expected:** every input resolves by its visible label; form-level errors render in `role="alert"`, notices and resend confirmations in `role="status"`; decorative icons `aria-hidden`.
- **Mock needed:** FakeAuth. **Covers:** NFR-006.

### TC-C-051
**Spinner honours reduced motion** | Level: Static | P3 | EP
- **Input:** inspect the spinner class list in the confirming and submitting states.
- **Expected:** includes `motion-reduce:animate-none`.
- **Mock needed:** none. **Covers:** NFR-006.

---

## 7. End-to-end cases (TC-E)

Run with Playwright against `pnpm dev` (web 5173, API 3000 in `AUTH_MODE=supabase`), local Supabase and
Mailpit. Helper `mailFor(email)` polls `GET /api/v1/messages` for the newest message to that address
(timeout 10 s) and extracts the link from the body. `createUser(email, { confirmed })` uses the admin
API (no email sent). Each test makes a unique `@example.test` address. Rate limiting is not tested
end to end.

### TC-E-001
**Sign up, confirm, land signed in, API knows me** | Level: E2E | P1 | Use case
- **Preconditions:** Supabase+Mailpit up; browser context empty.
- **Input:** `/auth/sign-up`; email `e2e-1@example.test`, password and confirm `Abc12345`; submit; open the Mailpit link in the same page.
- **Expected:** "Check your email" with the address; exactly one email; after the link: URL `/stocks` (no `token_hash`), toast "Email confirmed. Welcome to Investhesis."; account menu shows `e2e-1@example.test`; `GET /api/me` from the page returns 200 with that email and a UUID id equal to `auth.users.id`.
- **Mock needed:** Supabase+Mailpit. **Covers:** FR-001, FR-002, FR-004, FR-014, FR-016, UC-001, UC-002.

### TC-E-002
**Non-allowlisted sign-up is refused with nothing created** | Level: E2E | P1 | EP
- **Input:** sign up `stranger-<n>@gmail.com` / `Abc12345` twice.
- **Expected:** alert "Sign-up is invite-only. Ask the owner to add this email."; URL stays `/auth/sign-up`; Email focused; zero Mailpit messages for the address; zero `auth.users` rows for it.
- **Mock needed:** Supabase+Mailpit. **Covers:** FR-018.

### TC-E-003
**Allowlist matching through the UI** | Level: E2E | P2 | Decision table
- **Input:** sign up `E2E-Mixed-<n>@EXAMPLE.TEST` (case differs) and `x@sub.example.test`.
- **Expected:** first reaches Check your email and receives a message; second shows the invite-only alert and receives none.
- **Mock needed:** Supabase+Mailpit. **Covers:** FR-018.

### TC-E-004
**Same screen for an already-registered email** | Level: E2E | P1 | Decision table
- **Preconditions:** confirmed user `e2e-4@example.test`.
- **Input:** sign up with that email, then with a new email.
- **Expected:** both land on `/auth/check-email` with the same heading and text apart from the address; no error, no "already registered" wording anywhere.
- **Mock needed:** AdminAPI. **Covers:** FR-003.

### TC-E-005
**Unconfirmed sign-in offers resend and works after confirming** | Level: E2E | P1 | State transition
- **Preconditions:** `createUser(unconfirmed)` (no email sent, so resend is not rate limited).
- **Input:** sign in with the right password; click Resend; open the new Mailpit link; sign in again if asked.
- **Expected:** alert "Confirm your email first. We sent a link to <email>."; Resend leads to Check your email; one email in Mailpit; after the link the user is signed in on `/stocks`.
- **Mock needed:** AdminAPI, Supabase+Mailpit. **Covers:** FR-002, FR-004.

### TC-E-006
**Wrong credentials are indistinguishable** | Level: E2E | P1 | Decision table
- **Preconditions:** confirmed user.
- **Input:** sign in with (right email, wrong password) and (unknown email, any password).
- **Expected:** both show the alert "Email or password is incorrect." with the password field cleared and focused; URL stays `/auth/sign-in` without query data; no navigation.
- **Mock needed:** AdminAPI. **Covers:** FR-005, NFR-004.

### TC-E-007
**Deep link returns after sign-in; hostile next does not leave the site** | Level: E2E | P1 | Error guessing
- **Preconditions:** confirmed user; signed out.
- **Input:** open `/lists`; sign in. Then sign out, open `/auth/sign-in?next=//evil.example` and `?next=https://evil.example/`, sign in; record every top-level navigation.
- **Expected:** first: redirect to `/auth/sign-in?next=%2Flists`, then `/lists` after sign-in; hostile: lands on `/stocks`; no request or navigation to `evil.example`.
- **Mock needed:** AdminAPI. **Covers:** FR-008, FR-009.

### TC-E-008
**Signed-in user is kept off guest pages** | Level: E2E | P2 | EP
- **Input:** while signed in open `/auth/sign-in`, `/auth/sign-up`, `/auth/forgot-password`.
- **Expected:** each ends on `/stocks`.
- **Mock needed:** AdminAPI. **Covers:** FR-009.

### TC-E-009
**Session survives reload and browser restart** | Level: E2E | P1 | State transition
- **Input:** sign in; reload `/stocks`; save `storageState`; open a new context from it; open `/stocks`.
- **Expected:** both stay signed in with no sign-in redirect; `GET /api/me` 200 in each.
- **Mock needed:** AdminAPI. **Covers:** FR-006.

### TC-E-010
**Expired access token is renewed silently** | Level: E2E | P1 | State transition
- **Preconditions:** signed in.
- **Input:** `PwRoute` makes the next `GET /api/me` answer 401 once, then passes through.
- **Expected:** exactly one Supabase `token?grant_type=refresh_token` call and one retried `/api/me` with a new Bearer token; page stays signed in; no sign-in redirect.
- **Mock needed:** PwRoute. **Covers:** FR-010, FR-006.

### TC-E-011
**Unrecoverable session sends the user to sign-in with the notice** | Level: E2E | P1 | State transition
- **Preconditions:** signed in on `/lists`.
- **Input:** `PwRoute` answers every `/api/*` with 401 and the Supabase refresh call with 400 `invalid_grant`; trigger an API call.
- **Expected:** URL `/auth/sign-in?next=%2Flists`; notice "Your session has ended. Sign in again."; signing in again returns to `/lists`.
- **Mock needed:** PwRoute. **Covers:** FR-010, FR-008.

### TC-E-012
**Token auto-renews across the expiry window** | Level: E2E | P3 | State transition
- **Preconditions:** signed in; `page.clock.install()`.
- **Input:** fast-forward 61 minutes; then trigger `GET /api/me`.
- **Expected:** the page used a refreshed token (new `exp`), `/api/me` is 200, no redirect.
- **Mock needed:** PwRoute (clock). **Covers:** FR-006.

### TC-E-013
**Sign out ends the session and the old token is not sent again** | Level: E2E | P1 | State transition
- **Input:** signed in; record the access token T; account menu → Sign out; press browser Back; record requests.
- **Expected:** URL `/auth/sign-in`; Back lands on `/auth/sign-in?next=…` again (guard), not on app content; no request after sign-out carries Bearer T; `localStorage` holds no Supabase session key.
- **Mock needed:** AdminAPI. **Covers:** FR-007, UC-004.

### TC-E-014
**Sign out in one tab signs out the other** | Level: E2E | P2 | State transition
- **Input:** two pages in one context on `/stocks`; sign out in page A.
- **Expected:** page B reaches `/auth/sign-in` with the session-ended notice without a reload.
- **Mock needed:** AdminAPI. **Covers:** FR-007, FR-010.

### TC-E-015
**Forgot, reset, sign in with the new password** | Level: E2E | P1 | Use case
- **Preconditions:** confirmed user, password `Abc12345`.
- **Input:** `/auth/forgot-password` → submit email; open Mailpit recovery link; set `Xyz98765` twice; sign out; sign in with `Xyz98765`; sign out; try `Abc12345`.
- **Expected:** sent message "If an account exists for <email>, we sent a link…"; link opens `/auth/reset-password` (the URL has no `token_hash`); save leads to `/stocks` with toast "Password updated. You're signed in."; new password signs in; old password shows the generic error.
- **Mock needed:** AdminAPI, Supabase+Mailpit. **Covers:** FR-011, FR-012, FR-005, UC-005.

### TC-E-016
**Forgot for an unregistered email** | Level: E2E | P1 | Decision table
- **Input:** submit `nobody-<n>@example.test` and a registered email.
- **Expected:** identical sent-state text apart from the address; Mailpit has a message only for the registered one.
- **Mock needed:** AdminAPI, Supabase+Mailpit. **Covers:** FR-011.

### TC-E-017
**Used, malformed and wrong-type links** | Level: E2E | P1 | Decision table
- **Input:** open a confirmation link twice; open a recovery link twice; open `/auth/confirm?token_hash=garbage&type=email`; `/auth/confirm?type=email`; `/auth/confirm?token_hash=x&type=magiclink`.
- **Expected:** the first use succeeds; every other case lands on `/auth/link-expired` with the right actions (resend for email, new reset for recovery, both for unknown) and the 1-hour copy; "Send a new link" produces a new Mailpit message.
- **Mock needed:** AdminAPI, Supabase+Mailpit. **Covers:** FR-004, FR-012.

### TC-E-018
**Reset page without a recovery session** | Level: E2E | P2 | EP
- **Input:** signed out, open `/auth/reset-password`.
- **Expected:** `/auth/link-expired` for a recovery link.
- **Mock needed:** none. **Covers:** FR-012.

### TC-E-019
**Change password on the account page** | Level: E2E | P1 | Use case
- **Preconditions:** confirmed user, `Abc12345`, signed in.
- **Input:** menu → Account; Current `wrong`, New and Confirm `Xyz98765`, submit; then Current `Abc12345`, same new values; sign out; sign in with `Xyz98765`.
- **Expected:** first: "Current password is incorrect." on Current, field cleared; second: toast "Password changed.", fields empty; new password signs in; old does not.
- **Mock needed:** AdminAPI. **Covers:** FR-013, UC-006.

### TC-E-020
**Two investors see only their own identity** | Level: E2E | P1 | Error guessing
- **Preconditions:** users U1 and U2 in separate browser contexts.
- **Input:** each calls `GET /api/me` and loads the menu; context 1 replays its Bearer token with a `x-user-id` header set to U2's id.
- **Expected:** each sees its own email and id; the forged header changes nothing.
- **Mock needed:** AdminAPI. **Covers:** FR-015, FR-016.

### TC-E-021
**API rejects requests without a valid token through the proxy** | Level: E2E | P1 | EP
- **Input:** `GET http://localhost:5173/api/me` with no header, with a tampered token (last signature character changed), and with a valid token; `GET /api/health`.
- **Expected:** 401 problem+json, 401, 200; `/api/health` 200 without a token.
- **Mock needed:** AdminAPI. **Covers:** FR-014, UC-007.

### TC-E-022
**Nothing sensitive in URLs or history** | Level: E2E | P1 | Error guessing
- **Input:** across TC-E-001, TC-E-005, TC-E-015 record every `page.url()` and `history` entry; scan for `token_hash`, `access_token`, `refresh_token`, the password and (after check-email) the email.
- **Expected:** none found after each auth callback is handled; check-email and link-expired URLs carry no email.
- **Mock needed:** Supabase+Mailpit. **Covers:** NFR-004.

### TC-E-023
**API logs never contain tokens** | Level: E2E | P2 | EP
- **Input:** capture the API process output during TC-E-001, TC-E-010, TC-E-021.
- **Expected:** no `eyJ` substring and no password text; `authorization` appears only as `[redacted]`.
- **Mock needed:** LogCapture (stdout capture). **Covers:** NFR-004.

### TC-E-024
**Keyboard-only sign-in** | Level: E2E | P1 | Use case
- **Preconditions:** confirmed user; signed out; no mouse events (Playwright keyboard only).
- **Input:** open `/auth/sign-in`; Tab to Email; type; Tab (Forgot password?) Tab to Password; type; Tab (visibility toggle) Tab (Sign in); Enter. Also repeat submitting by pressing Enter inside the Password field. Then Tab to the account menu trigger, Enter, ArrowDown to Sign out, Enter.
- **Expected:** focus order Email → Forgot password? → Password → toggle → Sign in → footer link, each showing a visible focus ring; Enter submits from either path; focus lands on the new page's `h1` after navigation; Esc closes the menu returning focus to its trigger; signing out works without a pointer.
- **Mock needed:** AdminAPI. **Covers:** NFR-006, FR-005, FR-007.

### TC-E-025
**Keyboard-only sign-up and error focus** | Level: E2E | P2 | EP
- **Input:** open `/auth/sign-up`; Tab through; submit with mismatching confirm using Enter; fix; toggle visibility with Space.
- **Expected:** focus moves to the Confirm field with its error announced (`role` and `aria-describedby`); no focus trap; toggle does not move focus or submit.
- **Mock needed:** none. **Covers:** NFR-006, FR-001.

### TC-E-026
**360 px layout** | Level: E2E | P1 | BVA
- **Input:** viewport 360×640 (and 320×568 as a smoke); visit sign-in, sign-up, check-email, link-expired (via `/auth/link-expired`), forgot-password (request and sent), reset-password (with recovery session), and `/account`; focus the last field and open the keyboard-height viewport (360×360).
- **Expected:** `document.documentElement.scrollWidth <= clientWidth` on every page; decorative panel hidden; form content (`max-w-xs`) fully visible with side padding; Submit buttons fully inside the viewport and reachable by scrolling; the Account card is full width and its submit is `w-full`; text is not truncated or overlapping (screenshots compared by a visual snapshot with 0.1% tolerance). At 1280×800 the decorative panel is visible.
- **Mock needed:** AdminAPI. **Covers:** NFR-006.

### TC-E-027
**Axe on every auth screen in light and dark** | Level: E2E | P1 | EP
- **Input:** for each screen in TC-E-026 plus the form-error state of sign-in and sign-up, emulate `prefers-color-scheme: light` then `dark` and run axe (wcag2a, wcag2aa, wcag21aa).
- **Expected:** zero violations, including `color-contrast`; error and alert states included.
- **Mock needed:** AdminAPI. **Covers:** NFR-006.

### TC-E-028
**Mock mode smoke** | Level: E2E | P3 | EP
- **Preconditions:** API `AUTH_MODE=mock`, web `VITE_AUTH_MODE=mock`.
- **Input:** open `/stocks`; open `/auth/sign-in`; `GET /api/me`.
- **Expected:** `/stocks` loads; sign-in redirects to `/stocks`; `/api/me` returns the mock user with no token.
- **Mock needed:** MockAdapter. **Covers:** FR-017.

---

## 8. Coverage

### 8.1 Coverage matrix

| Test area | Unit | Component | Integration | API | E2E | Covered |
|---|---|---|---|---|---|---|
| Happy path | U-016 | U-022, U-028, U-036 | U-003, A-019 | U-006 | E-001, E-015, E-019 | Yes |
| Validation and boundaries | U-021 | C-022, C-023, C-040, C-043 | A-021, U-002 | A-008 | E-025 | Yes |
| Auth and authorization | U-011 | U-014, U-015, C-046 | A-018, A-020 | U-007, A-004 to A-006 | E-021 | Yes |
| Business rules (allowlist, enumeration) | - | U-025, C-013, C-038 | U-039 to U-042, A-022 to A-024 | - | E-002 to E-004, E-006, E-016 | Yes |
| State transitions (session) | - | U-017, U-018, C-005 | A-026, A-030 | A-011 | E-009 to E-014 | Yes |
| Error and failure | U-019 | C-019, C-026 | A-028 | U-009, A-010 | E-011, E-017 | Yes |
| Open redirect | U-016 | C-015, C-036 | A-029 | - | E-007 | Yes |
| Token tampering | - | - | A-027 | U-007, A-004 to A-006, A-009 | E-021 | Yes |
| Privacy (logs, URLs) | - | C-012, C-021, C-035 | - | U-013, A-012, A-013 | E-022, E-023 | Yes |
| Accessibility | - | C-029, C-049, C-050 | - | - | E-024 to E-027 | Yes |
| Performance | - | - | - | A-016 | - | Yes (NFR-005 only) |
| Rate limiting (UI) | - | U-026, U-032, C-019, C-031 | A-028 | - | not E2E by design | Partial by design |

### 8.2 Traceability

| Requirement | Test cases |
|---|---|
| FR-001 | U-002, U-021, C-022, C-023, C-025, A-031, E-001, E-025 |
| FR-002 | U-003, U-004, U-024, U-026, U-027, C-020, C-031, C-033, A-031, E-001, E-005 |
| FR-003 | U-025, C-027, C-032, A-022, E-004 |
| FR-004 | U-003, U-028, U-030, C-034, C-035, C-036, C-037, A-026, A-027, E-001, E-005, E-017 |
| FR-005 | U-019, U-022, U-023, C-013, C-014, A-023, E-006, E-015, E-024 |
| FR-006 | U-017, C-004, C-005, C-006, C-011, A-011, A-030, E-009, E-010, E-012 |
| FR-007 | U-020, U-038, C-048, E-013, E-014, E-024 |
| FR-008 | U-014, U-014b, U-016, U-022, U-030, C-005, C-007, C-015, C-016, C-036, C-046, A-029, E-007, E-011 |
| FR-009 | U-015, C-042, E-007, E-008 |
| FR-010 | U-017, U-018, U-020, C-007, C-009, C-010, C-011, C-017, E-010, E-011, E-014 |
| FR-011 | U-031, U-032, C-038, C-039, A-024, E-015, E-016 |
| FR-012 | U-021, U-029, U-033, U-034, C-037, C-040, C-041, C-042, A-025, A-027, E-015, E-017, E-018 |
| FR-013 | U-005, U-021, U-036, U-037, C-043, C-044, C-045, E-019 |
| FR-014 | U-001, U-004, U-006, U-007, U-008, U-009, U-010, A-004 to A-006, A-009, A-010, A-015, A-018 to A-020, C-008, E-001, E-021 |
| FR-015 | U-006, U-012, A-004, A-007, A-014, A-019, E-020 |
| FR-016 | U-006, U-035, C-003, C-045, C-047, A-019, E-001, E-020 |
| FR-017 | U-011, A-001, A-002, A-003, C-002, C-003, E-028 |
| FR-018 | U-025b, U-039 to U-042, A-031, C-027, E-002, E-003 |
| NFR-001 | U-001, U-006, U-007, U-041, A-004 to A-007, A-012, A-018, A-019 |
| NFR-002 | U-002, U-021, C-022, C-023, C-025, C-040, C-043, A-021, A-031 |
| NFR-003 | U-019, U-026, U-032, C-019, C-026, C-031, C-039, A-028, A-031 |
| NFR-004 | U-003, U-013, U-027, U-028, A-012, A-013, A-025, A-029, C-012, C-021, C-028, C-032, C-035, E-006, E-022, E-023 |
| NFR-005 | A-011, A-016 |
| NFR-006 | C-018, C-024, C-029, C-030, C-048, C-049, C-050, C-051, E-024 to E-027 |
| NFR-007 | U-001, A-017, C-001, E-001 |
| NFR-008 | A-032 |

Use-case coverage: UC-001 (E-001), UC-002 (E-001, E-005), UC-003 (U-022, E-007), UC-004 (U-038, E-013),
UC-005 (E-015), UC-006 (E-019), UC-007 (U-014, E-021, C-046).

## 9. Gaps, assumptions and risks

No FR or NFR is without a case. These need an owner's or developer's decision:

- **G-1: claim-less tokens.** design.md does not say what happens to a token with no `exp` or no `email`. TC-A-009 expects 401 for no `exp` and no `sub` and proposes `requiredClaims: ['exp','sub']`; the email-less case is not designed (what does `/me` return?). Decide before T-002 is closed.
- **G-2: "confirmed user" at the API (FR-014).** The API cannot check confirmation itself (the token has no such claim); it relies on Auth never issuing tokens to unconfirmed accounts. This is tested at the provider (TC-U-004, TC-A-018), not in the API.
- **G-3: NFR-003 end to end.** Hosted rate limits are not testable locally; only the UI mapping (components) and the 60 s resend limit (TC-A-028) are covered, as the plan intends.
- **G-4: NFR-008 is an inspection, not an executable check** (TC-A-032).
- **G-5: concurrent 401s.** design.md says "refresh once" per request; behaviour for two parallel 401s (one shared refresh or two) is not specified, so no case pins it. Suggest a shared in-flight refresh and a P3 case once decided.
- **G-6: sign-in email normalisation** (leading or trailing spaces, mixed case) is unspecified; no case until decided.
- **G-7: resend limit on the sign-in page.** The unconfirmed-account resend link has no stated cooldown, yet Auth limits to one email per 60 s after sign-up; a user who signs up and immediately tries sign-in gets `rate_limited`. TC-E-005 avoids this with an admin-created user; the real-user path is covered only at provider level (TC-A-028).
- **G-8: flakiness.** TC-E-012 depends on `page.clock` interacting with supabase-js timers (P3, may be dropped); Mailpit polling needs a timeout and per-test unique addresses.
- **Execution notes for T-008.** T-001, T-009 and TC-A integration cases share the Docker-based `pnpm test:supabase` suite; E2E needs the dev servers and the stack; the test gate table must name both commands.
