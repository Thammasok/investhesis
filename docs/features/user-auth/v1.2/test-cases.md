---
version: 1.2
status: draft
date: 2026-11-23
requires: requirements.md, design.md, dev-plan.md
task: T-004
---

# Test Cases: User Auth v1.2 (admin-created accounts, no self sign-up)

Test design for [requirements.md](requirements.md) and [design.md](design.md). It keeps the 15
`TC-U-301..315` cases already written into tasks T-001 to T-003 of [dev-plan.md](dev-plan.md) (same
ids, none renumbered) and adds `TC-C-3xx` (web component and static), `TC-A-3xx` (Supabase and API
level, run by `pnpm test:supabase` or the API Vitest suite) and `TC-E-3xx` (Playwright) cases.
`software-tester-automation` (T-005) turns every case into a test whose title starts with its id.

v1.2 is mostly deletion, so the suite has two jobs: prove registration is closed everywhere
(web, Auth endpoint, schema, docs) and prove nothing else moved. Every v1.0 case not listed in
section 7 stays in force and green (NFR-015).

## 1. System under test

### 1.1 Scope

| Part | Unit under test | Where |
|---|---|---|
| Web router and screens | route table (no `sign-up`), `SignInForm`, `CheckEmailPanel`, link-expired, forgot/reset, account change password, not-found page | `apps/web/src` |
| Web auth client | `AuthClient` port, `createSupabaseAuthClient`, mock adapter, `FakeAuthClient`, `mapSupabaseError`, `withNext`, `validateNewPassword` | `apps/web/src/features/auth` |
| Supabase Auth | `POST /auth/v1/signup`, Admin API user creation, `resend`, recovery, refresh, `config.toml` | local stack |
| Database | retired `app.hook_before_user_created` and `app.signup_allowlist`, migration `*_close_signup.sql`, `seed.sql`, `anon`/`authenticated` grants | `supabase/` |
| API verifier | `GET /me` with a token of an admin-created user (unchanged code, regression only) | `apps/api` |
| Docs | `supabase/README.md` "Creating accounts", hosted checklist, re-open steps | `supabase/README.md` |
| Whole flow | web + API in `supabase` mode, local Supabase, Mailpit `http://127.0.0.1:54324/api/v1/messages` | Playwright |

Not under test: Supabase Auth internals beyond the behaviour our settings produce, Studio's UI,
hosted project settings (manual checklist), production SMTP (OQ-1), the Terms/consent flow (dropped
with v1.1).

### 1.2 Inputs

| Input | Boundaries |
|---|---|
| Signup request body | `{ email, password }`; any address (registered, unknown, `example.test`, `gmail.com`, mixed case), password 7/8/72/73 chars; empty body (anonymous attempt) |
| Admin create body | `{ email, password, email_confirm: true | false }`; password min 8 (Auth setting) |
| Route path | `/auth/sign-up`, with trailing slash, with `?next=`, signed in or out |
| `next` value | unchanged v1.0 rule (`safeNext`) |
| Resend request | `{ type: 'signup', email }` for unknown, unconfirmed and confirmed addresses |
| Setting `enable_signup` | `false` (shipped), `true` (manual re-open check) |

### 1.3 Outputs

Not-found page vs form; HTTP status and `error_code` of Auth responses; `auth.users` row counts;
Mailpit message counts per address; router location and state; `GET /api/me` body; `pg_proc` and
`pg_class` lookups; SQLSTATE of denied queries.

### 1.4 Invariants

1. No public request creates an `auth.users` row or sends mail, for any address (FR-026, NFR-013).
2. The refusal is identical for known and unknown addresses (no enumeration).
3. An admin-created confirmed user signs in, resets and changes the password, refreshes and calls
   the API exactly like a v1.0 user (FR-027, FR-028, NFR-015).
4. No web file, client port or error map mentions sign-up (FR-025, FR-029).
5. No service-role key or admin password is in a tracked file other than documented placeholders
   (NFR-014).
6. The `app` schema stays unreachable for `anon` and `authenticated`.

## 2. Business flow map

| Flow | Path |
|---|---|
| Admin creates account (UC-010) | Admin API or Studio, `email_confirm: true` → investor opens `/auth/sign-in` → `/stocks` → `GET /api/me` |
| Hand-over | temporary password → sign in → Change password → sign in with new one |
| Reset for admin-created user | `/auth/forgot-password` → mail → `/auth/confirm` (recovery) → `/auth/reset-password` → sign in |
| Unconfirmed admin-created user | Admin API `email_confirm: false` → sign-in says unconfirmed → Resend → `/auth/check-email` → mail → `/auth/confirm` → `/stocks` |
| Visitor looks for registration (UC-011) | sign-in has no link; `/auth/sign-up` → not-found |
| Direct abuse | `POST /auth/v1/signup` with the public anon key → 422, nothing created |
| Re-open (FR-030) | `enable_signup = true` + restart (or dashboard toggle) → sign-up works again; existing accounts unaffected |
| Exception flows | wrong password, unknown email at sign-in, expired link, resend rate limit, Auth outage |

## 3. Techniques

EP (email domains, resend targets), BVA (password 7/8/72/73), decision tables (resend outcome,
signup refusal by address kind), state transition (unconfirmed → confirmed, signed in/out
redirects), error guessing (path casing, trailing slash, anonymous empty body, evil redirect,
double apply of a migration), use case (UC-010, UC-011), static inspection (grep, config, README).

## 4. Unit and script-level cases (from the dev plan, TC-U-301..315)

Run in `scripts/supabase-auth.test.ts` (301, 302, 309 to 315) and `apps/web` Vitest (303 to 308).
All need the local stack except the web ones.

### TC-U-301
**confirmedUser needs no public sign-up** | Level: Integration (script) | P1 | EP
- **Preconditions:** local stack running.
- **Input:** `confirmedUser(newEmail('h'))` with a fresh `@example.test` address.
- **Expected:** returns a client whose `signInWithPassword` succeeds; `auth.users.email_confirmed_at` is set; the signup endpoint was never called (spy on `fetch` or inspect the helper's calls).
- **Mock needed:** Supabase + Mailpit. **Covers:** FR-027, NFR-015 (T-001).

### TC-U-302
**Warm-up waits for the custom template without sign-up** | Level: Integration (script) | P1 | EP
- **Preconditions:** freshly started stack.
- **Input:** global setup runs.
- **Expected:** resolves once a Mailpit message contains `/auth/confirm?token_hash=`, within 40 s; no call to `/auth/v1/signup`.
- **Mock needed:** Supabase + Mailpit. **Covers:** FR-027 (T-001).

### TC-U-303
**The sign-up route is gone** | Level: Component | P1 | EP
- **Preconditions:** `createRoutes(FakeAuthClient.signedOut())`.
- **Input:** navigate to `/auth/sign-up?next=%2Fstocks`.
- **Expected:** not-found page renders; no password field on screen (`passwordFields: 0`).
- **Mock needed:** FakeAuth. **Covers:** FR-025, UC-011.

### TC-U-304
**Signed-in visitor also gets not-found** | Level: Component | P1 | State transition
- **Preconditions:** `createRoutes(FakeAuthClient.signedIn())`.
- **Input:** navigate to `/auth/sign-up`.
- **Expected:** not-found page; location stays `/auth/sign-up`; no redirect to `/stocks`.
- **Mock needed:** FakeAuth. **Covers:** FR-025.

### TC-U-305
**Sign-in offers no registration link** | Level: Component | P1 | EP
- **Preconditions:** `/auth/sign-in` rendered signed out.
- **Input:** list every link and the page text.
- **Expected:** no `href` contains `sign-up`; no text matches `/create account|sign up/i`; the Forgot password link remains (`signUpLinks: 0, forgotLink: true`).
- **Mock needed:** FakeAuth. **Covers:** FR-025, FR-029.

### TC-U-306
**Unconfirmed sign-in still offers resend** | Level: Component | P1 | State transition
- **Preconditions:** fake `signIn` returns `email_not_confirmed`.
- **Input:** submit `a@example.test` with a valid password, then click Resend.
- **Expected:** fake `resendConfirmation` called once; location `/auth/check-email` with state `{ email, justSent: true }`.
- **Mock needed:** FakeAuth. **Covers:** FR-029, NFR-015.

### TC-U-307
**The client port has no sign-up** | Level: Unit | P1 | EP
- **Input:** list the keys of `FakeAuthClient`, the mock adapter and `createSupabaseAuthClient`.
- **Expected:** none has a `signUp` member (`[false, false, false]`).
- **Mock needed:** none. **Covers:** FR-025.

### TC-U-308
**The old refusal code is not mapped** | Level: Unit | P2 | EP
- **Input:** `mapSupabaseError({ status: 403, message: 'signup_not_allowed' })`.
- **Expected:** returns `unknown`, not a dedicated code. (Assumes the mapper's fallback is `unknown`; verify in `map-supabase-error.ts`.)
- **Mock needed:** none. **Covers:** FR-029.

### TC-U-309
**Closed sign-up spike kept as a regression test** | Level: Integration (script) | P1 | Use case
- **Preconditions:** stack with `enable_signup = false` and no hook.
- **Input:** Admin API creates a fresh `@example.test` user with `email_confirm: false`; `resend` signup; verify the mail's token hash; `signInWithPassword`.
- **Expected:** every step succeeds (`created: true, mail: 1, signedIn: true`).
- **Mock needed:** Supabase + Mailpit. **Covers:** FR-027, FR-029, NFR-015.

### TC-U-310
**Public sign-up is refused with nothing created** | Level: Integration (script) | P1 | EP
- **Preconditions:** closed sign-up; Mailpit cleared.
- **Input:** `signUp` for `a-<tag>@example.test` and for `a-<tag>@gmail.com`, password `Abc12345`.
- **Expected:** both status 422, `error_code: signup_disabled`; zero `auth.users` rows for either; zero Mailpit messages.
- **Mock needed:** Supabase + Mailpit. **Covers:** FR-026, NFR-013.

### TC-U-311
**The retired objects are gone** | Level: Integration (script) | P1 | EP
- **Preconditions:** migrated local database.
- **Input:** query `pg_proc` for `app.hook_before_user_created` and `pg_class` for `app.signup_allowlist`.
- **Expected:** both absent (`null`).
- **Mock needed:** none. **Covers:** FR-026, FR-030.

### TC-U-312
**Config says closed and has no hook** | Level: Static | P1 | EP
- **Input:** parse `supabase/config.toml`.
- **Expected:** `auth.enable_signup` is `false`; `auth.hook.before_user_created` is absent or `enabled = false`. Fails if someone re-enables sign-up without updating the requirement.
- **Mock needed:** none. **Covers:** FR-026, NFR-013.

### TC-U-313
**Admin-created user resets and changes password** | Level: Integration (script) | P1 | Use case
- **Preconditions:** an admin-created confirmed user.
- **Input:** `resetPasswordForEmail`, verify the recovery link, `updateUser` with `correct-horse-2`, sign in with it.
- **Expected:** each step succeeds; `signedInWithNew: true`.
- **Mock needed:** Supabase + Mailpit. **Covers:** FR-028, NFR-015.

### TC-U-314
**Public resend does not become a registration path** | Level: Integration (script) | P1 | Decision table
- **Preconditions:** closed sign-up; Mailpit cleared.
- **Input:** `auth.resend({ type: 'signup' })` for `nobody-<tag>@example.test` (unknown) and `unconf-<tag>@example.test` (admin-created, unconfirmed).
- **Expected:** unknown: zero users, zero mails; unconfirmed: exactly one mail. Both responses are recorded; if they differ, a finding id is opened (design Risks).
- **Mock needed:** Supabase + Mailpit. **Covers:** FR-026, FR-029, NFR-013.

### TC-U-315
**App schema stays unreachable** | Level: Integration (script) | P1 | EP
- **Input:** psql as `anon` and as `authenticated`: `select` from `app.stocks` and `app.lists`.
- **Expected:** SQLSTATE 42501 in all four cases.
- **Mock needed:** none. **Covers:** NFR-013, constraint "app schema unreachable".

## 5. Web component and static cases (TC-C-301..313)

### TC-C-301
**Every spelling of the sign-up path is not-found** | Level: Component | P2 | EP
- **Preconditions:** `createRoutes(FakeAuthClient.signedOut())`.
- **Input:** `/auth/sign-up`, `/auth/sign-up/`, `/auth/sign-up?next=%2Flists`, `/auth/SIGN-UP`.
- **Expected:** each renders the not-found page, none a form or a redirect to sign-in. Check which spelling React Router matches case-insensitively; either way no sign-up form appears.
- **Mock needed:** FakeAuth. **Covers:** FR-025, UC-011.

### TC-C-302
**No auth message mentions registration** | Level: Component | P1 | EP
- **Input:** iterate every code in the `AuthErrorCode` copy map and every static string of the sign-in, forgot, check-email, link-expired and reset screens.
- **Expected:** none matches `/sign.?up|invite|register|create (an )?account|allowlist/i`; `signup_not_allowed` is not a member of the code union.
- **Mock needed:** FakeAuth. **Covers:** FR-029, FR-025.

### TC-C-303
**Unconfirmed resend outcomes** | Level: Component | P1 | Decision table
- **Preconditions:** fake `signIn` returns `email_not_confirmed`.
- **Input:** click Resend with fake `resendConfirmation` set to (a) ok, (b) `rate_limited`, (c) `service_unavailable`.
- **Expected:** (a) check-email with `{ email, justSent: true }`; (b) alert with the rate-limit copy, location stays `/auth/sign-in`, password kept; (c) destructive alert, password kept.
- **Mock needed:** FakeAuth. **Covers:** FR-029, NFR-015.

### TC-C-304
**Wrong password and unknown email look the same** | Level: Component | P1 | EP
- **Input:** fake `signIn` returns `invalid_credentials` for `known@example.test` and for `ghost@example.test`.
- **Expected:** the same alert text for both; password cleared or kept per v1.0 rule; no hint about registration ("no account? create one") appears.
- **Mock needed:** FakeAuth. **Covers:** FR-029, NFR-015 (replaces the sign-up half of TC-C-027).

### TC-C-305
**next is carried through the forgot link only** | Level: Component | P2 | EP
- **Input:** `/auth/sign-in?next=%2Flists`, then `/auth/sign-in` with no `next`.
- **Expected:** forgot href is `/auth/forgot-password?next=%2Flists` in the first case; with no `next` it has no query; no link on the page carries `next` toward a sign-up path.
- **Mock needed:** FakeAuth. **Covers:** FR-025, NFR-015 (replaces TC-C-016's sign-up half).

### TC-C-306
**New-password rules on the remaining forms** | Level: Component | P1 | BVA
- **Input:** reset-password form and account change-password form with new password of 0, 7, 8, 72 and 73 characters (`Abc1234`, `Abc12345`, 72 and 73 x `a`), plus a mismatching confirm.
- **Expected:** 0, 7, 73 and mismatch are blocked with "Enter a password.", "Use at least 8 characters.", "Use 72 characters or fewer.", "Passwords don't match."; 8 and 72 call the client once. Replaces the sign-up halves of TC-C-022 and TC-C-023.
- **Mock needed:** FakeAuth. **Covers:** FR-028, NFR-015.

### TC-C-307
**Check-email reached from sign-in's resend** | Level: Component | P2 | State transition
- **Input:** reach `/auth/check-email` from the TC-U-306 flow, then visit it directly with no state, then wait 60 s (fake timers) and resend.
- **Expected:** with state it shows the address and a "sent" status; the URL never contains the email; with no state it shows the generic fallback and no address; Resend is disabled until the 60 s cooldown ends. Replaces TC-C-032's sign-up origin.
- **Mock needed:** FakeAuth, fake timers. **Covers:** FR-029, NFR-015.

### TC-C-308
**Link-expired screens offer no registration** | Level: Component | P1 | EP
- **Input:** `/auth/link-expired` with `state.type` = `email`, `recovery`, `unknown`.
- **Expected:** no text or link about creating an account or signing up; `recovery` offers to request a new reset link; `email` and `unknown` offer a way to sign in or resend. Assumption: v1.0 may have linked back to sign-up here; the task must confirm and fix that copy.
- **Mock needed:** FakeAuth. **Covers:** FR-025, FR-029.

### TC-C-309
**No sign-up code left in the web source** | Level: Static | P1 | EP
- **Input:** `grep -rniE "sign-?up|signUp|invite-only|signup_not_allowed|isAlreadyRegistered" apps/web/src`.
- **Expected:** matches only in test names that assert absence and in comments explaining history (list reviewed in the test report); none in non-test source files except such comments.
- **Mock needed:** none. **Covers:** FR-025, FR-029.

### TC-C-310
**Guest-only redirects on the remaining pages** | Level: Component | P2 | State transition
- **Input:** signed in, open `/auth/sign-in` and `/auth/forgot-password`; signed out, open each.
- **Expected:** signed in goes to `/stocks`; signed out renders the page. `/auth/check-email`, `/auth/confirm`, `/auth/link-expired`, `/auth/reset-password` are not redirected (as in v1.0). Replaces the sign-up entry of TC-E-008's loop at component level.
- **Mock needed:** FakeAuth. **Covers:** NFR-015.

### TC-C-311
**Password manager attributes** | Level: Component | P3 | EP
- **Input:** read `autocomplete` on sign-in, reset and account fields.
- **Expected:** sign-in password `current-password`; account Current password `current-password`; reset and account New/Confirm `new-password`; emails `email`. Replaces the sign-up part of TC-C-030.
- **Mock needed:** FakeAuth. **Covers:** NFR-015.

### TC-C-312
**Title and focus on every remaining auth screen** | Level: Component | P2 | EP
- **Input:** navigate to sign-in, check-email, confirm result, link-expired, forgot-password, reset-password.
- **Expected:** each sets its document title, moves focus to the `h1` once and has one `main` landmark. Replaces TC-C-049's list without sign-up.
- **Mock needed:** FakeAuth. **Covers:** NFR-015.

### TC-C-313
**Mock mode keeps sign-up closed** | Level: Component | P3 | EP
- **Preconditions:** `createRoutes` with the mock adapter (`VITE_AUTH_MODE=mock`).
- **Input:** open `/auth/sign-up` and `/stocks`.
- **Expected:** `/auth/sign-up` is not-found; `/stocks` renders without redirect (guards never redirect in mock mode).
- **Mock needed:** mock adapter. **Covers:** FR-025, NFR-015.

## 6. Supabase and API-level cases (TC-A-301..318)

Script cases run in `scripts/supabase-auth.test.ts` or `scripts/auth-integration.test.ts` through
`pnpm test:supabase`; the API case runs under `apps/api` Vitest with a signed token or the local stack.

### TC-A-301
**Raw sign-up request answers signup_disabled** | Level: API | P1 | EP
- **Preconditions:** local stack, closed sign-up, the public anon key (it is public by design).
- **Input:** `POST http://127.0.0.1:54321/auth/v1/signup` with `{ email: "raw-<tag>@example.test", password: "Abc12345" }`, headers `apikey` and `Content-Type`.
- **Expected:** HTTP 422; body `{ code: 422, error_code: "signup_disabled", msg: "Signups not allowed for this instance" }`; no `auth.users` row; no Mailpit message.
- **Mock needed:** Supabase + Mailpit. **Covers:** FR-026, NFR-013.

### TC-A-302
**Refusal is identical for known and unknown addresses** | Level: API | P1 | Decision table
- **Input:** sign-up for (a) an admin-created confirmed address, (b) an admin-created unconfirmed one, (c) an unknown one, (d) a mixed-case form of (a), same password.
- **Expected:** all four answer 422 `signup_disabled` with the same `msg`; no new rows; no mail; no password change on (a). Shows nothing about account existence.
- **Mock needed:** Supabase + Mailpit. **Covers:** FR-026, NFR-013.

### TC-A-303
**Anonymous and empty-body sign-up are refused** | Level: API | P2 | Error guessing
- **Input:** `POST /auth/v1/signup` with `{}`; `POST /auth/v1/signup` with `{ data: {} }`; `POST /auth/v1/signup` with a phone number and password.
- **Expected:** none creates a user (including an anonymous one); responses are 4xx; `select count(*) from auth.users where is_anonymous` stays 0.
- **Mock needed:** Supabase. **Covers:** FR-026, NFR-013.

### TC-A-304
**Admin-created user signs in and the API knows them** | Level: API | P1 | Use case
- **Input:** Admin API creates `admin-made-<tag>@example.test` with `email_confirm: true`, password `Abc12345`; sign in; `GET /me` on the API (supabase mode) with the access token.
- **Expected:** sign-in succeeds with no mail needed; `/me` answers 200 with that email and an id equal to `auth.users.id`.
- **Mock needed:** Supabase, API in supabase mode. **Covers:** FR-027, NFR-015.

### TC-A-305
**Admin create password boundary** | Level: API | P2 | BVA
- **Input:** Admin API create with passwords of 7 characters (`Abc1234`) and 8 characters (`Abc12345`).
- **Expected:** 7 fails `weak_password` (422), no user created; 8 succeeds. Assumption: the Admin API enforces `minimum_password_length`; if it does not, record a finding and keep the 8-character success case.
- **Mock needed:** Supabase. **Covers:** FR-027.

### TC-A-306
**Recovery answers the same for known and unknown emails** | Level: API | P1 | Decision table
- **Preconditions:** closed sign-up.
- **Input:** `resetPasswordForEmail` for an admin-created address and for `ghost-<tag>@example.test`.
- **Expected:** both responses equal in status and body; one Mailpit message for the known address, none for the unknown one; no `auth.users` row for the unknown one.
- **Mock needed:** Supabase + Mailpit. **Covers:** FR-028, NFR-013, NFR-015.

### TC-A-307
**Refresh rotation for an admin-created user** | Level: API | P2 | State transition
- **Input:** sign in; refresh once (R1 to R2); after 11 s reuse R1.
- **Expected:** R1 is rejected and the session family revoked; reuse inside the 10 s window is tolerated. Replaces v1.0 TC-A-030's setup, which no longer needs sign-up.
- **Mock needed:** Supabase. **Covers:** NFR-015.

### TC-A-308
**Sign-out revokes the session** | Level: API | P2 | State transition
- **Input:** sign in an admin-created user; `signOut`; try the refresh token.
- **Expected:** refresh fails; the old access token still verifies only until `exp` (unchanged v1.0 behaviour).
- **Mock needed:** Supabase. **Covers:** NFR-015.

### TC-A-309
**Admin create twice is refused** | Level: API | P3 | EP
- **Input:** Admin API create the same email twice, then once with a different case.
- **Expected:** the repeats answer 422 `email_exists`; one `auth.users` row only.
- **Mock needed:** Supabase. **Covers:** FR-027.

### TC-A-310
**Auth settings match the design (successor of TC-A-031)** | Level: Static | P1 | EP
- **Input:** parse `supabase/config.toml`.
- **Expected:** unchanged from v1.0: `site_url`, `additional_redirect_urls`, `jwt_expiry 3600`, rotation on, reuse interval 10, anonymous off, `minimum_password_length 8`, `enable_confirmations true`, `max_frequency 60s`, `otp_expiry 3600`, templates exist, `rate_limit` keys not loosened. Changed: `enable_signup false`; no `before_user_created` hook block.
- **Mock needed:** none. **Covers:** FR-026, NFR-015.

### TC-A-311
**Close-signup migration is idempotent and ordered** | Level: Integration | P1 | Error guessing
- **Input:** `pnpm db:reset`; then run `*_close_signup.sql` a second time with psql; list migration filenames sorted.
- **Expected:** reset applies all migrations with no error; the second run succeeds (`drop ... if exists`); `*_close_signup.sql` sorts after `*_stock_lists.sql`; the v1.0 `*_signup_allowlist.sql` file still exists as history.
- **Mock needed:** none. **Covers:** FR-026, NFR-013.

### TC-A-312
**No admin credential is committed** | Level: Static | P1 | Error guessing
- **Input:** search tracked files outside `supabase/README.md` for `service_role`, `SERVICE_ROLE_KEY`, a JWT-shaped string (`eyJ` with `role":"service_role`), and an admin password; inspect `apps/*/.env.example`, `seed.sql`, migrations, `config.toml` and `e2e/`.
- **Expected:** none found. The tests read the key from `supabase status -o env` at run time only; README shows `$SERVICE_ROLE_KEY` placeholders, never a real value.
- **Mock needed:** none. **Covers:** NFR-014.

### TC-A-313
**Seed no longer references the allowlist** | Level: Static | P2 | EP
- **Input:** read `supabase/seed.sql`; after `pnpm db:reset`, query `app` tables.
- **Expected:** no `signup_allowlist` text; reset succeeds; the `app` schema holds only the stock-lists tables.
- **Mock needed:** none. **Covers:** FR-026.

### TC-A-314
**Resend limited to one mail per 60 s** | Level: API | P2 | BVA
- **Input:** `resend` signup for an admin-created unconfirmed address twice within 5 s, and once after waiting past `max_frequency` (or with the limit read from config).
- **Expected:** second call inside 60 s is rejected with the over-limit error and sends no mail; the later one sends. Replaces TC-A-028's sign-up setup.
- **Mock needed:** Supabase + Mailpit. **Covers:** FR-029, NFR-015.

### TC-A-315
**Evil redirect on resend and recovery is ignored** | Level: API | P1 | Error guessing
- **Input:** `resend` signup with `emailRedirectTo: "https://evil.example/auth/confirm"`; `resetPasswordForEmail` with `redirectTo: "https://evil.example/"`.
- **Expected:** the mail links point to the configured `site_url`, never to `evil.example`. Replaces TC-A-029's sign-up half.
- **Mock needed:** Supabase + Mailpit. **Covers:** NFR-015.

### TC-A-316
**API rejects bad tokens for an admin-created user** | Level: API | P1 | EP
- **Input:** `GET /me` with (a) a valid token, (b) the same token with one payload byte changed, (c) no token.
- **Expected:** 200, 401 `unauthenticated` with `WWW-Authenticate: Bearer`, 401. Unchanged API behaviour, proving no code path depended on sign-up.
- **Mock needed:** Supabase, API in supabase mode. **Covers:** NFR-015.

### TC-A-317
**Re-opening sign-up needs configuration only (manual)** | Level: Manual | P2 | Use case
- **Preconditions:** local stack, one admin-created user `keep-<tag>@example.test`; working tree clean.
- **Input:** set `enable_signup = true` in `config.toml`; `pnpm db:stop && pnpm db:start`; `POST /auth/v1/signup` for `reopen-<tag>@example.test`; sign in as `keep-<tag>`; then revert the file and restart.
- **Expected:** sign-up now answers 200 and sends one mail (no hook, so any domain is allowed); the existing user still signs in; `git diff` shows only the `config.toml` line (no code or migration change); after reverting, TC-A-301 passes again. Record date and result in the test report.
- **Mock needed:** none. **Covers:** FR-030.

### TC-A-318
**README documents account creation** | Level: Static (inspection) | P1 | EP
- **Input:** read `supabase/README.md`.
- **Expected:** a "Creating accounts" section with Studio steps (Add user, Auto Confirm User), the Admin API curl using placeholders, the temporary-password hand-over and change-password step, how to re-open sign-up locally and hosted, and the hosted rollout order (disable hook, sign-ups off, `supabase db push`); no "Sign-up allowlist" section left; no real keys.
- **Mock needed:** none. **Covers:** FR-027, FR-030, NFR-014.

## 7. End-to-end cases (TC-E-301..313)

All run in Playwright against local Supabase (`supabase` mode servers). Users are created through the
Admin API with a fresh `@example.test` address per test; none uses the sign-up form.

### TC-E-301
**Admin-created user signs in, lands on /stocks, API knows me** | Level: E2E | P1 | Use case
- **Preconditions:** Admin API user `e2e-301-<tag>@example.test`, password `Abc12345`, confirmed; empty browser context.
- **Input:** open `/auth/sign-in`; type email and password; submit.
- **Expected:** URL `/stocks`; account menu shows the email; `GET /api/me` from the page returns 200 with that email and a UUID equal to `auth.users.id`; no registration text anywhere on the way.
- **Mock needed:** AdminAPI. **Covers:** FR-027, UC-010, NFR-015 (replaces TC-E-001).

### TC-E-302
**Sign-up URL is not-found when signed out** | Level: E2E | P1 | EP
- **Input:** visit `/auth/sign-up`, then `/auth/sign-up?next=%2Flists`.
- **Expected:** the not-found page both times (HTTP 200 SPA shell, not-found content); no form; the page offers a way back; no call to `/auth/v1/signup` was made (network log).
- **Mock needed:** none. **Covers:** FR-025, UC-011.

### TC-E-303
**Sign-up URL is not-found when signed in** | Level: E2E | P1 | State transition
- **Preconditions:** signed-in admin-created user.
- **Input:** visit `/auth/sign-up`; then navigate to `/stocks`.
- **Expected:** not-found page, no redirect; the session stays valid and `/stocks` loads.
- **Mock needed:** AdminAPI. **Covers:** FR-025.

### TC-E-304
**Sign-in page has no registration link** | Level: E2E | P1 | EP
- **Input:** open `/auth/sign-in` and `/auth/sign-in?next=%2Flists`; collect all anchors and buttons; submit wrong credentials once.
- **Expected:** no anchor to a sign-up path; no text "Create account", "Sign up", "Register"; Forgot password is present; the error alert contains none of those words either.
- **Mock needed:** AdminAPI. **Covers:** FR-025, FR-029.

### TC-E-305
**Keyboard-only sign-in and error focus** | Level: E2E | P2 | EP
- **Preconditions:** confirmed admin-created user; keyboard only.
- **Input:** open `/auth/sign-in`; Tab through; submit wrong password with Enter; fix; toggle visibility with Space; submit.
- **Expected:** focus order Email, Forgot password, Password, toggle, Sign in, and nothing after it (no sign-up link); the error alert is announced and focus stays usable; the toggle neither moves focus nor submits; signing in lands on `/stocks`. Replaces TC-E-025.
- **Mock needed:** AdminAPI. **Covers:** FR-029, NFR-015.

### TC-E-306
**Direct sign-up call from the browser is refused** | Level: E2E | P1 | Decision table
- **Input:** from a page context, `fetch` `POST {SUPABASE_URL}/auth/v1/signup` with the public anon key for (a) a fresh `@example.test` address, (b) a fresh `@gmail.com` address, (c) an existing admin-created address.
- **Expected:** all three 422 `signup_disabled`; zero `auth.users` rows created; zero Mailpit messages for (a) and (b); (c) receives no mail and its password is unchanged (it still signs in with the old one).
- **Mock needed:** Supabase + Mailpit. **Covers:** FR-026, NFR-013.

### TC-E-307
**Forgot and reset password for an admin-created user** | Level: E2E | P1 | Use case
- **Input:** `/auth/forgot-password` with the user's email; open the Mailpit recovery link in the same page; set `correct-horse-2` twice; then sign in with it.
- **Expected:** same "sent" screen as for an unknown email; link lands on `/auth/reset-password` with no `token_hash` left in the URL; after saving, `/stocks` loads; the old password no longer works.
- **Mock needed:** Supabase + Mailpit. **Covers:** FR-028, NFR-015.

### TC-E-308
**Temporary password hand-over** | Level: E2E | P1 | Use case
- **Preconditions:** Admin API user created with temporary password `Temp-pass-1`.
- **Input:** sign in with it; open Account; change the password to `correct-horse-3` (current password `Temp-pass-1`); sign out; sign in with the new one; try the temporary one.
- **Expected:** each step succeeds; the temporary password fails after the change with the generic invalid-credentials alert.
- **Mock needed:** AdminAPI. **Covers:** FR-028, UC-010.

### TC-E-309
**Unconfirmed admin-created user resends and confirms** | Level: E2E | P1 | Use case
- **Preconditions:** Admin API user with `email_confirm: false`; Mailpit cleared.
- **Input:** sign in with the right password; click the offered resend; open the mail link.
- **Expected:** the sign-in message says the email is not confirmed and offers resend; one click goes to `/auth/check-email` (email in state, not URL) and exactly one mail arrives; the link lands on `/stocks` signed in with the "Email confirmed" toast; `email_confirmed_at` is set.
- **Mock needed:** Supabase + Mailpit. **Covers:** FR-029, UC-010, NFR-015.

### TC-E-310
**Guest-only redirects without sign-up** | Level: E2E | P2 | State transition
- **Preconditions:** signed-in admin-created user.
- **Input:** open `/auth/sign-in` and `/auth/forgot-password`; then sign out and open protected `/lists` and `/auth/forgot-password`.
- **Expected:** signed in, both guest pages go to `/stocks`; signed out, `/lists` goes to `/auth/sign-in?next=%2Flists` and signing in returns to `/lists`; forgot-password renders. Replaces the sign-up entry of TC-E-008's loop.
- **Mock needed:** AdminAPI. **Covers:** NFR-015.

### TC-E-311
**Session survives reload; sign-out ends it** | Level: E2E | P2 | State transition
- **Input:** sign in; reload `/stocks`; open a second tab (same context); sign out in tab 1.
- **Expected:** reload keeps the session; tab 2 is sent to sign-in after the sign-out event; `GET /api/me` without a session is 401.
- **Mock needed:** AdminAPI. **Covers:** NFR-015.

### TC-E-312
**Nothing sensitive in URLs or history** | Level: E2E | P1 | Error guessing
- **Input:** across TC-E-301, TC-E-307 and TC-E-309 record every `page.url()` and history entry; scan for `token_hash`, `access_token`, `refresh_token`, the passwords and the email on check-email and link-expired.
- **Expected:** none found after each callback is handled. Replaces the sign-up route's part of TC-E-022.
- **Mock needed:** Supabase + Mailpit. **Covers:** NFR-015.

### TC-E-313
**Accessibility and 360 px layout of the remaining auth screens** | Level: E2E | P2 | EP
- **Input:** visit each screen in `e2e/lib/screens.ts` (sign-in plus its error state, check-email, link-expired variants, forgot-password request and sent, reset-password) at 360 x 640 and 320 x 568; with `prefers-color-scheme` light then dark run axe (wcag2a, wcag2aa, wcag21aa).
- **Expected:** zero axe violations; no horizontal scroll; contrast passes; no sign-up entry exists in the list. Replaces the sign-up entries of TC-E-026 and TC-E-027.
- **Mock needed:** AdminAPI. **Covers:** FR-025, NFR-015.

## 8. Traceability

| Requirement | Cases |
|---|---|
| FR-025 (no sign-up route, form or link) | TC-U-303, TC-U-304, TC-U-305, TC-U-307, TC-C-301, TC-C-302, TC-C-305, TC-C-308, TC-C-309, TC-C-313, TC-E-302, TC-E-303, TC-E-304, TC-E-313 |
| FR-026 (Auth refuses sign-up, nothing created) | TC-U-310, TC-U-311, TC-U-312, TC-U-314, TC-A-301, TC-A-302, TC-A-303, TC-A-310, TC-A-311, TC-A-313, TC-E-306 |
| FR-027 (admin creates confirmed account, documented) | TC-U-301, TC-U-302, TC-U-309, TC-A-304, TC-A-305, TC-A-309, TC-A-318, TC-E-301, TC-E-308 |
| FR-028 (reset and change for admin-created users) | TC-U-313, TC-C-306, TC-A-306, TC-E-307, TC-E-308 |
| FR-029 (sign-in silent on sign-up, unconfirmed resend kept) | TC-U-305, TC-U-306, TC-U-308, TC-C-302, TC-C-303, TC-C-304, TC-C-307, TC-C-308, TC-A-314, TC-E-304, TC-E-305, TC-E-309 |
| FR-030 (re-open by configuration only) | TC-U-311, TC-U-312, TC-A-317, TC-A-318 |
| NFR-013 (direct sign-up creates nothing, every environment) | TC-U-310, TC-U-312, TC-U-314, TC-U-315, TC-A-301, TC-A-302, TC-A-303, TC-A-306, TC-A-311, TC-E-306 |
| NFR-014 (no admin credentials in repo) | TC-A-312, TC-A-318 |
| NFR-015 (regression of sign-in, sign-out, refresh, reset, change, API verifier) | TC-U-306, TC-U-313, TC-C-303, TC-C-304, TC-C-306, TC-C-310, TC-C-311, TC-C-312, TC-C-313, TC-A-304, TC-A-306, TC-A-307, TC-A-308, TC-A-310, TC-A-314, TC-A-315, TC-A-316, TC-E-301, TC-E-305, TC-E-307, TC-E-309 to TC-E-313, and every v1.0 case not retired below |

Use cases: UC-010 (TC-E-301, TC-E-308, TC-E-309, TC-U-309), UC-011 (TC-U-303, TC-C-301, TC-E-302).

## 9. Retired v1.0 cases

Each case below is removed or rewritten, never skipped. Cases outside this table keep their v1.0 id
and stay green.

| v1.0 case | Action | Replacement or reason |
|---|---|---|
| TC-U-025b (sign-up outside allowlist, alert) | Removed | No sign-up form; no allowlist. Absence covered by TC-U-303, TC-U-307, TC-C-302 |
| TC-U-039 (hook decisions) | Removed | The hook is retired. Replaced by TC-U-311 (objects gone) and TC-U-312 (config) |
| TC-U-040 (sign-up refused end to end, 403 `signup_not_allowed`) | Rewritten | TC-U-310 and TC-A-301: now 422 `signup_disabled` for every address |
| TC-U-041 (allowlist not reachable by Data API roles) | Rewritten | Table and function no longer exist: TC-U-311; schema unreachability kept as TC-U-315 |
| TC-U-042 (allowlist pattern check) | Removed | The table and its check constraint are dropped; nothing left to check |
| TC-C-027 (invite-only refusal vs existing-account behaviour) | Rewritten | TC-C-304 (no registration hint, same alert for known and unknown) and TC-A-302 (identical refusal) |
| TC-E-002 (non-allowlisted sign-up refused) | Rewritten | TC-E-306: direct call refused with nothing created; TC-E-302: no form to try |
| TC-E-003 (allowlist matching through the UI) | Removed | Matching rules no longer exist. Closed behaviour for any address: TC-A-302, TC-E-306 |
| TC-E-022 (no sensitive URLs), sign-up part | Rewritten | TC-E-312 starts from admin-created users |
| TC-E-025 (keyboard-only sign-up) | Rewritten | TC-E-305 (keyboard-only sign-in with error focus) |

Other v1.0 cases that exercised sign-up as a setup step or as part of a larger screen list, with
the same treatment:

| v1.0 case | Action | Replacement or reason |
|---|---|---|
| TC-U-002 (min password via `signUp`) | Rewritten | TC-A-305 (Admin API boundary); client rules in TC-C-306 |
| TC-U-015 (guest redirect incl. `/auth/sign-up`) | Rewritten | TC-C-310 and TC-U-304 |
| TC-U-025 (sign-up hides whether email exists) | Removed | No sign-up. Enumeration safety now TC-A-302 and TC-A-306 |
| TC-A-021, TC-A-022 (72/73 chars and repeat via `signUp`) | Rewritten | TC-A-305 and TC-A-309 through the Admin API; TC-C-306 for 72/73 on reset and change |
| TC-A-028 (resend after sign-up) | Rewritten | TC-A-314 (admin-created unconfirmed user) |
| TC-A-029 (`emailRedirectTo` on sign-up) | Rewritten | TC-A-315 (resend and recovery only) |
| TC-A-030 (refresh reuse, signed up user) | Kept, setup changed | Uses `confirmedUser` (T-001); mirrored by TC-A-307 |
| TC-A-031 (config values incl. `enable_signup true`, hook) | Rewritten | TC-A-310 and TC-U-312 |
| TC-C-016 (next carried on sign-up and forgot links) | Rewritten | TC-C-305 |
| TC-C-021 to TC-C-023 (sign-up form, checks, boundaries) | Removed | Form deleted. Password boundaries stay on reset and change: TC-C-306 |
| TC-C-026 (sign-up outage alerts) | Removed | Form deleted. Sign-in and resend alerts: TC-C-303 |
| TC-C-028 (sign-up passwords cleared after Back) | Removed | Form deleted. Reset and account forms keep their v1.0 clearing cases |
| TC-C-030 (autofill attributes incl. sign-up), TC-C-032 (check-email from sign-up), TC-C-049 (screen list) | Rewritten | TC-C-311, TC-C-307, TC-C-312 |
| TC-E-001 (sign up, confirm, land signed in) | Rewritten | TC-E-301 (admin-created sign-in) and TC-E-309 (confirm link) |
| TC-E-008 (guest redirect loop incl. sign-up) | Rewritten | TC-E-310 |
| TC-E-026, TC-E-027 (a11y and 360 px incl. sign-up) | Rewritten | TC-E-313 |

## 10. Coverage matrix

| Test area | Unit | Component | Script/API | E2E | Covered |
|---|---|---|---|---|---|
| Happy path (admin-created sign-in) | TC-U-301, 309 | - | TC-A-304 | TC-E-301 | yes |
| Closed sign-up, any address | TC-U-310 | - | TC-A-301..303 | TC-E-306 | yes |
| Web has no sign-up | TC-U-303..308 | TC-C-301, 302, 305, 308, 309, 313 | - | TC-E-302..305 | yes |
| Validation (BVA) | - | TC-C-306 | TC-A-305 | - | yes |
| Auth / authz | TC-U-315 | TC-C-310 | TC-A-316 | TC-E-310 | yes |
| State transitions | TC-U-304, 306 | TC-C-303, 307 | TC-A-307, 308 | TC-E-303, 309, 311 | yes |
| Errors and failures | TC-U-308 | TC-C-303, 304 | TC-A-309, 314 | TC-E-304 | yes |
| Schema and config retirement | TC-U-311, 312 | - | TC-A-310, 311, 313 | - | yes |
| Docs and secrets | - | - | TC-A-312, 318 | - | yes (static) |
| Re-open (FR-030) | - | - | TC-A-317 (manual) | - | manual only |
| Accessibility, responsive | - | TC-C-312 | - | TC-E-313 | yes |
| Performance | - | - | - | - | not applicable |

## 11. Gaps and assumptions

- **Link-expired copy (TC-C-308).** v1.0's `email` variant may point back to sign-up; the T-002 task text does not list it. If it does, T-002 must fix it or TC-C-308 fails.
- **Admin API password policy (TC-A-305).** Assumes the Admin API enforces `minimum_password_length`. If not, the 7-character case becomes a recorded finding.
- **Unknown-email resend (TC-U-314).** Design Risks assume Auth answers success and sends nothing; the exact response is pinned by the test, with a finding id if it differs from the unconfirmed case.
- **Error fallback (TC-U-308).** Assumes `mapSupabaseError` falls back to `unknown`.
- **FR-030 is a manual check** (TC-A-317); automating it would need a second stack. The hosted toggle is not tested.
- **Hosted rollout order** (disable hook, sign-ups off, `supabase db push`) is verified only as documentation (TC-A-318); there is no hosted environment in the suite.
- **Self-registered unconfirmed accounts** on hosted projects are out of scope (OQ-6).
- **Performance and load** are not designed: the slice adds no endpoint or code path.
