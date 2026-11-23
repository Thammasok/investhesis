---
version: 1.2
status: active
date: 2026-11-23
requires: design.md
---

# Development Plan: User Auth v1.2 (admin-created accounts, no self sign-up)

Builds [requirements.md](requirements.md) per [design.md](design.md). No UX phase: the slice only
removes a route, a form and a link (design.md, Components). Every engineering task follows the
test gate (green before, green after, then human review). Until the owner replaces the Pacta
command table in `.claude/rules/test-gate.md`, the gate is the **Investhesis gate** in
`CLAUDE.md`: `pnpm db:start && pnpm db:reset`, `pnpm test:supabase`, `pnpm lint`,
`pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`.

**Why the tasks run in this order** (ADR-020). The test helpers and some E2E cases sign up through
the public API, so closing Auth first would fail the gate. The order is:

1. Test helpers stop using public sign-up ([T-001](#t-001--test-helpers-create-users-through-the-admin-api)).
2. The web drops sign-up ([T-002](#t-002--remove-sign-up-from-the-web)). Supabase still allows it, so nothing breaks.
3. Only then is Auth closed and the hook retired ([T-003](#t-003--close-sign-up-in-supabase-and-retire-the-allowlist)).

Each task leaves `main` green on its own. New test ids use the 3xx range (`TC-U-301` and up,
`TC-C-301`, `TC-A-301`, `TC-E-301`).

## Summary

- **Total tasks** — 5 (3 engineering, 1 test design, 1 test automation)
- **Estimated effort** — about 2.5 days of agent work (S ≈ 0.5 day, M ≈ 0.75 day)
- **Critical path** — [T-001](#t-001--test-helpers-create-users-through-the-admin-api) →
  [T-002](#t-002--remove-sign-up-from-the-web) →
  [T-003](#t-003--close-sign-up-in-supabase-and-retire-the-allowlist) →
  [T-005](#t-005--automate-tests--user-auth-v12)
- **Parallel lanes** — [T-004](#t-004--design-test-cases--user-auth-v12) starts at once.

## Tasks

### T-001 — Test helpers create users through the Admin API

```yaml
- title: confirmedUser and the template warm-up stop using public sign-up
- description: >
  In `scripts/lib/stack.ts`, change `confirmedUser` to create an unconfirmed user with the Admin
  API (`email_confirm: false`), call `auth.resend({ type: 'signup', email })`, read the mail from
  Mailpit and verify the token hash, as today (ADR-018). In `scripts/lib/global-setup.ts`, make the
  warm-up do the same instead of `signUp`. Search `scripts/` and `e2e/` for any other direct
  `auth.signUp` used as setup (not as the thing under test) and move it too. No behaviour
  changes: sign-up is still open, and tests that exercise sign-up itself are left for T-002
  and T-003.
- agent: software-engineer-backend
- depends_on: []
- status: done
- size: S
```

#### Acceptance criteria

- [ ] `confirmedUser` and `global-setup.ts` contain no call to `auth.signUp`
- [ ] The custom confirmation template still reaches Mailpit through `resend` during warm-up
- [ ] The helpers work with `enable_signup` both true and false (checked once by hand with the setting flipped locally, then reverted)
- [ ] The Investhesis gate is green with no test changed in behaviour

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-301
    scenario: confirmedUser needs no public sign-up
    given: local stack running
    when: confirmedUser(newEmail('h')) runs
    then: it returns a client whose signInWithPassword succeeds; auth.users row has email_confirmed_at set; the signup endpoint was never called
    test_data:
      input: fresh @example.test address
      expected: { signedIn: true, confirmed: true }
  - id: TC-U-302
    scenario: warm-up waits for the custom template without sign-up
    given: freshly started stack
    when: global setup runs
    then: it resolves once a Mailpit message contains "/auth/confirm?token_hash="
    test_data:
      input: warm-up user
      expected: resolves within 40 s
```

**Notes** — Both cases live in `scripts/supabase-auth.test.ts`. `auth-reset.spec.ts` already
uses `resend` for an unconfirmed user, so copy that pattern.

### T-002 — Remove sign-up from the web

```yaml
- title: Delete the sign-up route, form, client method and link
- description: >
  Implement design.md §Components. Remove the `sign-up` route in `routers/router.tsx` and
  `views/sign-up.tsx`; delete `features/auth/components/sign-up-form.tsx`; remove `signUp` from
  `AuthClient`, `supabase-auth-client.ts`, `mock-auth-client.ts` and `FakeAuthClient`
  (`calls`/`args`); remove the `signup_not_allowed` code from `auth-client.ts`, `auth-errors.ts`
  and `map-supabase-error.ts`, and `isAlreadyRegistered`; remove the "Create account" link from
  `SignInForm` (and `withNext` if nothing else uses it for sign-up; the forgot-password link
  still uses it). Keep `CheckEmailPanel`, `/auth/check-email`, unconfirmed resend and
  `validateNewPassword`. Retire or rewrite the tests that pin sign-up, never skip them: in
  `auth-pages.test.tsx`, `supabase-auth-client.test.ts`, `map-supabase-error.test.ts`,
  `tc-foundation.test.tsx` (find them with grep, including TC-U-025b and TC-C-027); in E2E delete
  `auth-sign-up.spec.ts` and the sign-up entries of `e2e/lib/screens.ts`, and rewrite the sign-up
  parts of `auth-sign-in.spec.ts` (TC-E-025 keyboard flow, the guest-redirect loop),
  `auth-layout-a11y.spec.ts` and any TC-E-022 history check, starting those from an admin-created
  user. List each retired id with its replacement or removal reason in the commit body. Update the
  `apps/web` auth paragraph in CLAUDE.md.
- agent: react-vite-developer
- depends_on: [T-001]
- status: done
- size: M
```

#### Acceptance criteria

- [ ] `/auth/sign-up` shows the not-found page, signed in or out
- [ ] The sign-in page has no link or text about creating an account
- [ ] `grep -rniE "sign-?up|signUp|invite-only|signup_not_allowed" apps/web/src` finds only the test names that assert the absence and comments that explain history
- [ ] Sign-in, unconfirmed resend → check-email, forgot/reset password and change password tests still pass
- [ ] `pnpm --filter @investhesis/web test:coverage` keeps `src/features/auth/` at or above 90 %
- [ ] The Investhesis gate is green, E2E included; no test is skipped, only rewritten or removed with a stated reason

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-303
    scenario: the sign-up route is gone
    given: createRoutes(FakeAuthClient.signedOut())
    when: navigating to /auth/sign-up?next=%2Fstocks
    then: the not-found page renders; no form with a password field is on screen
    test_data:
      input: /auth/sign-up?next=/stocks
      expected: { heading: "not found page", passwordFields: 0 }
  - id: TC-U-304
    scenario: signed-in visitor also gets not-found
    given: createRoutes(FakeAuthClient.signedIn())
    when: navigating to /auth/sign-up
    then: not-found page; no redirect to /stocks
    test_data:
      input: /auth/sign-up, signed in
      expected: { location: "/auth/sign-up", page: "not found" }
  - id: TC-U-305
    scenario: sign-in offers no registration link
    given: /auth/sign-in rendered
    when: all links are listed
    then: none has an href containing "sign-up" and no text matches /create account|sign up/i; Forgot password link remains
    test_data:
      input: /auth/sign-in
      expected: { signUpLinks: 0, forgotLink: true }
  - id: TC-U-306
    scenario: unconfirmed sign-in still offers resend
    given: fake signIn returns email_not_confirmed
    when: valid credentials are submitted, then Resend is clicked
    then: fake resendConfirmation called once; location /auth/check-email with state { email, justSent: true }
    test_data:
      input: { email: "a@example.test" }
      expected: { resendCalls: 1, location: "/auth/check-email" }
  - id: TC-U-307
    scenario: the client port has no sign-up
    given: FakeAuthClient, the mock adapter and createSupabaseAuthClient
    when: their keys are listed
    then: none has a signUp member
    test_data:
      input: three clients
      expected: { hasSignUp: [false, false, false] }
  - id: TC-U-308
    scenario: the old refusal code is not mapped
    given: mapSupabaseError
    when: called with { status: 403, message: "signup_not_allowed" }
    then: returns unknown, not a dedicated code
    test_data:
      input: { status: 403, message: "signup_not_allowed" }
      expected: unknown
```

**Notes** — At this point Supabase still allows sign-up; the web just no longer offers it.
`TC-U-308`'s `unknown` assumes the mapper's fallback is `unknown`; check `map-supabase-error.ts`.

### T-003 — Close sign-up in Supabase and retire the allowlist

```yaml
- title: enable_signup=false, drop hook and allowlist, README and rollout order
- description: >
  Implement design.md §Data Model and §Components. First, before changing anything, prove with
  the local stack that with `enable_signup = false` and no hook, the Admin API creates a user,
  `resend` sends the confirmation mail and the user signs in (design Risks). If it does not, stop
  and report. Then: set `enable_signup = false` and remove the `[auth.hook.before_user_created]`
  block in `config.toml`; add `supabase/migrations/<timestamp>_close_signup.sql` (after
  `*_stock_lists.sql`, idempotent; drops the function then the table); remove the allowlist insert
  from `seed.sql`; rewrite the allowlist script tests (TC-U-039, TC-U-040, TC-U-041, and any case
  in `supabase-auth.test.ts` or `auth-integration.test.ts` that signs up through the public API)
  as closed-sign-up cases. Rewrite `supabase/README.md` "Sign-up allowlist" as "Creating accounts"
  (Studio steps with Auto Confirm User, the Admin API curl, the temporary-password hand-over,
  re-opening sign-up locally and hosted) and update the hosted checklist in the order disable
  the hook, sign-ups off, `supabase db push`. Pin what public `resend` does for an unknown and for
  an unconfirmed email (design Risks). Update CLAUDE.md's Commands, auth decision and Supabase
  notes (replace "invite-only through an allowlist", the `@example.test` seed remark and the
  `db:stop` hook note).
- agent: software-engineer-backend
- depends_on: [T-001, T-002]
- status: done
- size: M
```

#### Acceptance criteria

- [ ] `pnpm db:start && pnpm db:reset` applies every migration with no errors; `pnpm db:stop && pnpm db:start` picks up the new config
- [ ] `POST /auth/v1/signup` with any email and password answers 422 `signup_disabled`, creates no `auth.users` row and sends no Mailpit message
- [ ] The Admin API creates a confirmed user who signs in, resets their password and changes it
- [ ] `app.hook_before_user_created` and `app.signup_allowlist` no longer exist; `config.toml` has no hook block
- [ ] `anon` and `authenticated` still cannot reach anything in the `app` schema
- [ ] `supabase/README.md` documents creating an account (Studio and API), the temporary-password hand-over, re-opening sign-up and the hosted rollout order
- [ ] No service-role key or admin password is committed (NFR-014)
- [ ] The Investhesis gate is green; no allowlist test is skipped, only rewritten or removed with a stated reason

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-309
    scenario: closed sign-up spike (kept as a regression test)
    given: local stack with enable_signup=false and no hook
    when: the Admin API creates u@example.test (email_confirm false), resend signup runs, the mail link is verified, then signInWithPassword
    then: every step succeeds
    test_data:
      input: fresh @example.test address
      expected: { created: true, mail: 1, signedIn: true }
  - id: TC-U-310
    scenario: public sign-up is refused with nothing created
    given: closed sign-up
    when: signUp for a fresh address on example.test, and for one on gmail.com
    then: both 422 signup_disabled; zero auth.users rows; zero Mailpit messages
    test_data:
      input: ["a-<tag>@example.test", "a-<tag>@gmail.com"]
      expected: { status: 422, code: "signup_disabled", users: 0, mails: 0 }
  - id: TC-U-311
    scenario: the retired objects are gone
    given: migrated local database
    when: querying pg_proc and pg_class for app.hook_before_user_created and app.signup_allowlist
    then: neither exists
    test_data:
      input: names
      expected: { function: null, table: null }
  - id: TC-U-312
    scenario: config says closed and has no hook
    given: supabase/config.toml
    when: parsed
    then: auth.enable_signup is false; auth.hook.before_user_created is absent or enabled=false
    test_data:
      input: config.toml
      expected: { enable_signup: false, hook: "absent" }
  - id: TC-U-313
    scenario: admin-created user resets and changes password
    given: an admin-created confirmed user
    when: resetPasswordForEmail, the recovery link is verified, updateUser with a new password, then sign in with the new password
    then: each step succeeds
    test_data:
      input: { newPassword: "correct-horse-2" }
      expected: { signedInWithNew: true }
  - id: TC-U-314
    scenario: public resend does not become a registration path
    given: closed sign-up
    when: auth.resend({ type: signup }) for an unknown email, and for an admin-created unconfirmed email
    then: the unknown email creates no user and sends no mail; the unconfirmed one sends one mail; both responses are recorded (finding id if they differ)
    test_data:
      input: ["nobody-<tag>@example.test", "unconf-<tag>@example.test"]
      expected: { unknown: { users: 0, mails: 0 }, unconfirmed: { mails: 1 } }
  - id: TC-U-315
    scenario: app schema stays unreachable
    given: psql as anon and as authenticated
    when: select from app.stocks, app.lists
    then: permission denied (42501)
    test_data:
      input: [anon, authenticated]
      expected: "42501"
```

**Notes** — The script tests run serially against one stack. `TC-U-312` reads the file, so it
fails if someone re-enables sign-up in `config.toml` without updating the requirement.

### T-004 — Design test cases — user auth v1.2

```yaml
- title: Design test cases — user auth v1.2
- description: >
  Using the software-tester-design skill, produce structured TC-xxx test cases covering
  all test levels: unit boundaries, API (happy path + error paths + auth), frontend
  component, and E2E flows. Run Steps 0–4 (SUT definition → business flow → field specs
  → scenarios → test data). Output must be in TC-xxx format for software-tester-automation.
  Inputs: requirements.md and design.md of this slice. Must cover FR-025 to FR-030 and NFR-013
  to NFR-015: the web with no sign-up (route, link, client port); the public sign-up refusal for
  new and registered emails; the admin-created account journey (create → sign in → /stocks →
  GET /api/me → change password); reset for an admin-created user; unconfirmed admin-created
  user and resend; the retired objects; re-opening sign-up (FR-030) as a documented manual check;
  regression of sign-in, sign-out, refresh and API token verification. Map each retired v1.0
  case (TC-U-025b, TC-U-039, TC-U-040, TC-U-041, TC-C-027, TC-E-002, TC-E-003 and the sign-up
  parts of TC-E-022 and TC-E-025) to its replacement or mark it removed with the reason. Use ids
  from TC-C-301, TC-A-301 and TC-E-301 upward, plus the TC-U-301..315 already in this plan. Save as
  docs/features/user-auth/v1.2/test-cases.md.
- agent: software-tester-design
- depends_on: []
- status: done
- size: S
```

#### Acceptance criteria

- [ ] SUT definition documented
- [ ] TC-xxx cases cover happy path, boundaries, error paths, and business rules
- [ ] Each TC includes Level, Input, Expected Output, Preconditions, and Mock needed
- [ ] A traceability table maps every FR-025–FR-030 and NFR-013–NFR-015 to at least one TC
- [ ] Every retired v1.0 case is mapped to a replacement or marked removed, with the reason

**Notes** — Runs in parallel with engineering tasks; depends only on requirements/design, not on code.

### T-005 — Automate tests — user auth v1.2

```yaml
- title: Automate tests — user auth v1.2
- description: >
  Using the software-tester-automation skill, convert the TC-xxx cases from T-004 into
  runnable scripts at the appropriate levels (Unit, script-level against local Supabase,
  Frontend Component, E2E). Run the full suite against the implementation. E2E: admin-created
  user signs in → /stocks → `GET /api/me`; `/auth/sign-up` shows not-found signed out and in;
  sign-in has no registration link; direct `POST /auth/v1/signup` is refused (422) with nothing in
  Mailpit; reset and unconfirmed-resend flows from an admin-created user. Keep axe and the 360 px
  check passing for the remaining auth screens (`e2e/lib/screens.ts`). Produce
  docs/features/user-auth/v1.2/test-report.md with `pnpm test:report:unit`, `pnpm test:e2e` and
  `pnpm test:report` (extend `scripts/stock-lists-report.mjs` or add a sibling if its id parsing
  needs it).
- agent: software-tester-automation
- depends_on: [T-001, T-002, T-003, T-004]
- status: review
- size: M
```

#### Acceptance criteria

- [ ] All TC-* from T-004 automated and passing (or pinned with `test.fail` and a finding id listed in the report)
- [ ] Coverage stays at or above the CLAUDE.md thresholds (`src/features/auth/` ≥ 90 %, `src/features/` ≥ 70 %, domain ≥ 95 %)
- [ ] E2E admin-created sign-in → `GET /api/me` passes against local Supabase in a clean run
- [ ] Axe and the 360 px check pass for every remaining auth screen in light and dark mode
- [ ] Test report produced with pass/fail per TC-id
- [ ] The full Investhesis gate is green

**Notes** — Report "T-005 done" with the full test report when all TCs pass.

## Status Legend

| Status | Changed By | Meaning |
|--------|-----------|---------|
| `backlog` | Orchestrator | Ready, waiting to be picked up |
| `doing` | Orchestrator / Agent | Agent actively working |
| `blocked` | Agent | Stuck, needs human intervention |
| `test` | Agent | Dev done, needs testing |
| `review` | Agent / Tester | Human must review before advancing |
| `done` | Human | Approved and complete |
