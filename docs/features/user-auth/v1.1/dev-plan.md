---
version: 1.1
status: superseded
date: 2026-11-22
requires: design.md
ux-design: ux-design.md
---

# Development Plan: User Auth v1.1 (open sign-up with consent)

Builds [requirements.md](requirements.md) per [design.md](design.md) and
[ux-design.md](ux-design.md). Every engineering task follows the test gate (green before, green
after, then human review). Until the owner replaces the Pacta command table in
`.claude/rules/test-gate.md`, the gate for this plan is the **Investhesis gate** in `CLAUDE.md`:
`pnpm db:start && pnpm db:reset`, `pnpm test:supabase`, `pnpm lint`, `pnpm typecheck`,
`pnpm test`, `pnpm build`, `pnpm test:e2e`.

**Why the tasks run in this order.** The hook also gates the admin API, and the E2E suite signs
users up through the real form, so turning consent enforcement on before every caller sends
`terms_version` would make the gate fail. The order is:

1. Shared version and test helpers ([T-001](#t-001--policy-version-and-test-helpers)).
2. The web sends the version ([T-002](#t-002--consent-on-the-sign-up-form)). Sending extra
   metadata is harmless while the hook still checks only the allowlist.
3. Only then does the database enforce it and open sign-up
   ([T-003](#t-003--open-sign-up-and-consent-enforcement-in-supabase)).

Each task leaves `main` green on its own.

New test ids use the 2xx range (`TC-U-201` and up, `TC-C-201`, `TC-A-201`, `TC-E-201`), so they
never collide with v1.0 (`TC-U-001..042`) or Stock Lists (up to `TC-U-135`, `TC-C-181`,
`TC-A-149`, `TC-E-134`).

## Summary

- **Total tasks** — 6 (4 engineering, 1 test design, 1 test automation)
- **Estimated effort** — about 4 days of agent work (S ≈ 0.5 day, M ≈ 0.75 day); about 2.5 days
  elapsed, with the policy pages running alongside the sign-up work
- **Critical path** — [T-001](#t-001--policy-version-and-test-helpers) →
  [T-002](#t-002--consent-on-the-sign-up-form) →
  [T-003](#t-003--open-sign-up-and-consent-enforcement-in-supabase) →
  [T-006](#t-006--automate-tests--user-auth-v11)
- **Parallel lanes** — [T-004](#t-004--policy-pages-and-legal-footer) starts after T-001 and runs
  alongside T-002 and T-003. [T-005](#t-005--design-test-cases--user-auth-v11) starts at once.

## Tasks

### T-001 — Policy version and test helpers

```yaml
- title: Shared POLICY constant and test helpers that send terms_version
- description: >
  Add `packages/domain/src/policy.ts` exporting
  `POLICY = { version: '2026-11-22', effectiveDate: '2026-11-22' } as const` and re-export it
  from `src/index.ts` (design.md ADR-012; keep the file erasable: no enum). Then make every place
  that creates a Supabase user in tests send `terms_version: POLICY.version`, so T-003 can turn on
  enforcement without breaking the suites:
  `scripts/lib/stack.ts` `adminCreateUser` (`user_metadata` in the admin body) and
  `confirmedUser` (`options.data` in `signUp`), `scripts/lib/global-setup.ts`, and any direct
  `signUp` or admin call in `scripts/auth-integration.test.ts` and `scripts/supabase-auth.test.ts`.
  The E2E helpers reuse `adminCreateUser`, so they follow. No behaviour changes yet: the hook
  ignores the metadata until T-003.
- agent: software-engineer-backend
- depends_on: []
- status: backlog
- size: S
```

#### Acceptance criteria

- [ ] `import { POLICY } from '@investhesis/domain'` works in the web, in `scripts/` and in `e2e/`
- [ ] Every user made by `adminCreateUser`, `confirmedUser` and the global setup has `raw_user_meta_data->>'terms_version' = POLICY.version`
- [ ] `pnpm --filter @investhesis/domain test:coverage` stays at or above 95 %
- [ ] The Investhesis gate is green with no test changed in behaviour

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-201
    scenario: POLICY has a date-style version and a valid effective date
    given: the exported POLICY constant
    when: its fields are checked
    then: version matches YYYY-MM-DD and effectiveDate parses to a real calendar date
    test_data:
      input: POLICY
      expected: { version: "/^\\d{4}-\\d{2}-\\d{2}$/", effectiveDate: "valid Date, not NaN" }
  - id: TC-U-202
    scenario: helper-created users carry the policy version
    given: local stack running
    when: adminCreateUser() and confirmedUser(newEmail('h')) each create a user
    then: auth.users.raw_user_meta_data->>'terms_version' equals POLICY.version for both
    test_data:
      input: two fresh @example.test addresses
      expected: "2026-11-22"
```

**Notes** — `TC-U-202` lives in `scripts/supabase-auth.test.ts` (needs `pnpm db:start`).

### T-002 — Consent on the sign-up form

```yaml
- title: Consent checkbox, terms_version on sign-up, new error codes and copy
- description: >
  Implement ux-design.md §Sign up and design.md §API Contracts (Supabase sign-up).
  `AuthClient.signUp(email, password, consent: { termsVersion: string })`; the supabase adapter
  sends `options.data.terms_version`; the mock adapter and `FakeAuthClient` accept and record the
  consent (the fake can script `terms_outdated`). Add `AuthErrorCode` `terms_outdated` (403 with
  message containing `terms_outdated` in `map-supabase-error.ts`) and change the
  `signup_not_allowed` copy to "Sign-up is closed right now. Try again later." with focus on the
  alert (ADR-013). `SignUpForm` gains the consent `Field orientation="horizontal"` with `Checkbox`
  and a label whose two links open `/terms` and `/privacy` in a new tab with sr-only "(opens in a
  new tab)" text (ADR-014). Client checks run in field order (password, confirm, consent), all
  errors show together and focus the first invalid control. Ticking clears the consent error. The
  box stays ticked after a server error. The `terms_outdated` alert has a "Reload page" link
  button. Update the existing tests that pin the old copy or the two-argument `signUp`
  (TC-U-025b, TC-C-027 in `auth-pages.test.tsx`), and the E2E `fillSignUp` helper in
  `e2e/auth-sign-up.spec.ts`, so it ticks the box. TC-E-002 still expects a refusal at this point
  (the hook is still invite-only) but with the new copy; T-003 rewrites it for open sign-up.
  Update CLAUDE.md's `apps/web` auth paragraph.
- agent: react-vite-developer
- depends_on: [T-001]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] The checkbox is unticked on every visit; submitting unticked shows "Agree to the Terms of Service and Privacy Policy to create an account.", focuses the checkbox and makes no `signUp` call
- [ ] A ticked, valid submit calls `signUp(email, password, { termsVersion: POLICY.version })` and lands on Check your email
- [ ] The adapter sends `options: { emailRedirectTo, data: { terms_version } }`
- [ ] `terms_outdated` and `signup_not_allowed` show the copy from design.md, focused, with no navigation
- [ ] The text "invite-only" appears nowhere in `apps/web/src`
- [ ] Both label links have `target="_blank"`, `rel="noopener noreferrer"` and the sr-only new-tab text; clicking a link does not toggle the box
- [ ] `pnpm --filter @investhesis/web test:coverage` keeps `src/features/auth/` at or above 90 %
- [ ] The Investhesis gate is green, E2E sign-up included

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-203
    scenario: consent checkbox starts unticked
    given: /auth/sign-up rendered with FakeAuthClient.signedOut()
    when: the page loads
    then: checkbox "I agree to the Terms of Service and Privacy Policy." is not checked
    test_data:
      input: route /auth/sign-up
      expected: { role: checkbox, checked: false }
  - id: TC-U-204
    scenario: unticked submit is blocked on the client
    given: valid email and matching 8+ character passwords, box unticked
    when: Create account is clicked
    then: consent error shown, checkbox aria-invalid and focused, fake signUp never called, location unchanged
    test_data:
      input: { email: "new@example.test", password: "correct-horse", confirm: "correct-horse", consent: false }
      expected: { error: "Agree to the Terms of Service and Privacy Policy to create an account.", signUpCalls: 0 }
  - id: TC-U-205
    scenario: all client errors show together, focus goes to the first in field order
    given: password "short", confirm "other", box unticked
    when: Create account is clicked
    then: password, confirm and consent errors all visible; focus on Password
    test_data:
      input: { password: "short", confirm: "other", consent: false }
      expected: { errors: ["password", "confirm", "consent"], focused: "Password" }
  - id: TC-U-206
    scenario: ticked valid submit sends the policy version
    given: valid inputs, box ticked
    when: Create account is clicked
    then: fake records signUp("new@example.test", "correct-horse", { termsVersion: POLICY.version }); navigates to /auth/check-email
    test_data:
      input: { consent: true }
      expected: { consent: { termsVersion: "2026-11-22" }, location: "/auth/check-email" }
  - id: TC-U-207
    scenario: ticking clears the consent error immediately
    given: the consent error is showing
    when: the checkbox is clicked
    then: the error disappears and aria-invalid is removed, before any submit
    test_data:
      input: click checkbox
      expected: { consentError: null }
  - id: TC-U-208
    scenario: stale policy version
    given: fake signUp returns terms_outdated
    when: a valid ticked form is submitted
    then: alert "The terms have changed. Reload the page and try again." focused, with a "Reload page" button; passwords and box kept
    test_data:
      input: { error: terms_outdated }
      expected: { alert: "The terms have changed. Reload the page and try again.", button: "Reload page", consentChecked: true }
  - id: TC-U-209
    scenario: sign-up closed by the owner
    given: fake signUp returns signup_not_allowed
    when: a valid ticked form is submitted
    then: alert "Sign-up is closed right now. Try again later." has focus (not the Email field); location /auth/sign-up
    test_data:
      input: { error: signup_not_allowed }
      expected: { alert: "Sign-up is closed right now. Try again later.", focused: "alert" }
  - id: TC-U-210
    scenario: mapping the hook's terms refusal
    given: mapSupabaseError
    when: called with { status: 403, message: "terms_outdated" } and { status: 403, message: "signup_not_allowed" }
    then: returns terms_outdated and signup_not_allowed respectively
    test_data:
      input: [{ status: 403, message: "terms_outdated" }, { status: 403, message: "signup_not_allowed" }]
      expected: ["terms_outdated", "signup_not_allowed"]
  - id: TC-U-211
    scenario: adapter forwards the consent as user metadata
    given: createSupabaseAuthClient with a stubbed fetch capturing the /auth/v1/signup body
    when: signUp("a@example.test", "correct-horse", { termsVersion: "2026-11-22" })
    then: the request body has data.terms_version "2026-11-22" and the existing redirect
    test_data:
      input: { termsVersion: "2026-11-22" }
      expected: { body: { data: { terms_version: "2026-11-22" } } }
  - id: TC-U-212
    scenario: policy links open in a new tab without toggling the box
    given: /auth/sign-up rendered
    when: the two label links are inspected and the Terms link is clicked
    then: hrefs /terms and /privacy, target _blank, rel "noopener noreferrer", accessible names end "(opens in a new tab)"; checkbox still unchecked
    test_data:
      input: click "Terms of Service (opens in a new tab)"
      expected: { checked: false, hrefs: ["/terms", "/privacy"] }
```

**Notes** — The adapter must not drop `isAlreadyRegistered` handling (FR-003). `TC-U-211` can
use the existing pattern in `supabase-auth-client.test.ts`.

### T-003 — Open sign-up and consent enforcement in Supabase

```yaml
- title: signup_settings mode, consent-checking hook, signup_consents trigger, README
- description: >
  Implement design.md §Data Model in `supabase/migrations/<timestamp>_open_signup.sql` (after
  `*_signup_allowlist.sql`, idempotent): `app.signup_settings` (one row, mode 'open', terms_version
  '2026-11-22'), `app.signup_consents`, `app.record_signup_consent()` (`security definer`, empty
  `search_path`) with its `after insert` trigger on `auth.users`, and the new body of
  `app.hook_before_user_created` (invite mode → allowlist; then the version must equal
  signup_settings.terms_version; missing settings row fails closed). `config.toml` keeps the hook
  enabled; `seed.sql` keeps `@example.test`. First, before writing the hook, prove with a real
  local sign-up that `options.data.terms_version` reaches `event.user.user_metadata` (design
  Risks). If it does not, stop and report. Rewrite the allowlist script tests (TC-U-039, TC-U-040,
  TC-U-041) as invite-mode cases and the E2E TC-E-002 and TC-E-003 for open sign-up (a
  non-`@example.test` address now succeeds). Use a test-only domain such as `@open.example.test`
  so Mailpit lookups stay scoped. Pin the stale-version behaviour for an already registered email
  (design Risks: enumeration). Rewrite `supabase/README.md` "Sign-up allowlist" as "Sign-up mode
  and consent" (open/invite switch, consent audit query, version bump = migration + POLICY,
  creating users by hand with `user_metadata.terms_version`), and update the hosted checklist
  (custom SMTP first, push the migration, the hook stays enabled, no owner allowlist row needed in
  open mode). Update CLAUDE.md's Commands and Supabase notes.
- agent: software-engineer-backend
- depends_on: [T-001, T-002]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] `pnpm db:start && pnpm db:reset` applies every migration and the seed with no errors
- [ ] In open mode, a sign-up from any domain with the current version creates the user, sends one confirmation email and writes exactly one `app.signup_consents` row with `accepted_at = auth.users.created_at`
- [ ] A sign-up with a missing or old version gets HTTP 403 `terms_outdated`, creates no `auth.users` row and sends no Mailpit message
- [ ] `update app.signup_settings set mode = 'invite'` restores v1.0 allowlist behaviour with no Auth restart; switching back reopens it; existing accounts keep signing in
- [ ] `anon` and `authenticated` cannot read `app.signup_settings` or `app.signup_consents`, or execute `app.hook_before_user_created` or `app.record_signup_consent`
- [ ] A test fails when `signup_settings.terms_version` differs from `POLICY.version`
- [ ] A user editing their own `user_metadata.terms_version` later does not change their consent row
- [ ] `supabase/README.md` documents the mode switch, the audit query, the version-bump steps and the hosted checklist
- [ ] The Investhesis gate is green; no allowlist test is skipped, only rewritten

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-213
    scenario: user metadata reaches the hook (spike, kept as a regression test)
    given: a temporary hook body that refuses with the received user_metadata as its message
    when: signUp with options.data.terms_version "2026-11-22"
    then: the error message contains "2026-11-22"; the real hook is restored afterwards
    test_data:
      input: { data: { terms_version: "2026-11-22" } }
      expected: message contains "2026-11-22"
  - id: TC-U-214
    scenario: hook decision table
    given: allowlist '@example.test'; settings terms_version '2026-11-22'
    when: select app.hook_before_user_created(event) for each (mode, email, version)
    then: matches the expected result per row
    test_data:
      input:
        - [open,   "a@gmail.com",       "2026-11-22"]
        - [open,   "a@gmail.com",       "2026-01-01"]
        - [open,   "a@gmail.com",       null]
        - [invite, "a@example.test",    "2026-11-22"]
        - [invite, "a@gmail.com",       "2026-11-22"]
        - [invite, "a@gmail.com",       null]
      expected: ["{}", "terms_outdated", "terms_outdated", "{}", "signup_not_allowed", "signup_not_allowed"]
  - id: TC-U-215
    scenario: open sign-up records consent
    given: open mode
    when: signUp("x-<tag>@open.example.test", password, data.terms_version = POLICY.version)
    then: one auth.users row; one signup_consents row with terms_version POLICY.version and accepted_at = created_at; one Mailpit message
    test_data:
      input: fresh @open.example.test address
      expected: { users: 1, consents: 1, mails: 1 }
  - id: TC-U-216
    scenario: missing version is refused with nothing created
    given: open mode
    when: signUp without options.data
    then: 403 message terms_outdated; zero auth.users rows; zero consent rows; zero Mailpit messages
    test_data:
      input: fresh address, no data
      expected: { status: 403, users: 0, consents: 0, mails: 0 }
  - id: TC-U-217
    scenario: invite mode switch takes effect without restart
    given: mode switched to invite inside the test (restored in finally)
    when: signUp a non-allowlisted address with the current version, then an @example.test address
    then: first 403 signup_not_allowed with no row; second succeeds
    test_data:
      input: ["a-<tag>@open.example.test", "a-<tag>@example.test"]
      expected: ["403 signup_not_allowed", "ok"]
  - id: TC-U-218
    scenario: new objects are unreachable through Data API roles
    given: psql as anon and as authenticated
    when: select from app.signup_settings and app.signup_consents; execute both functions
    then: each fails with permission denied (42501)
    test_data:
      input: [anon, authenticated]
      expected: "42501"
  - id: TC-U-219
    scenario: database and web agree on the policy version
    given: migrated local database
    when: select terms_version from app.signup_settings
    then: equals POLICY.version
    test_data:
      input: POLICY.version
      expected: equal
  - id: TC-U-220
    scenario: missing settings row fails closed
    given: the settings row deleted inside a transaction that is rolled back
    when: the hook is called with a current-version open-domain event
    then: returns terms_outdated
    test_data:
      input: no settings row
      expected: terms_outdated
  - id: TC-U-221
    scenario: consent record is immune to later metadata edits
    given: a user created with the current version
    when: the user calls updateUser({ data: { terms_version: "1999-01-01" } })
    then: signup_consents row unchanged
    test_data:
      input: { terms_version: "1999-01-01" }
      expected: consent row terms_version "2026-11-22"
  - id: TC-U-222
    scenario: stale version for an already registered email (enumeration pin)
    given: a confirmed user u@example.test
    when: signUp(u@example.test) with an old version, and signUp(new@open.example.test) with an old version
    then: record the actual responses; the test asserts they do not differ in status and message, or (if they do) is a test.fail pinned to a finding id listed in the test report
    test_data:
      input: old version "2026-01-01"
      expected: same response shape, or a pinned finding
```

**Notes** — The script tests run serially against one stack. Every mode change is restored in
`finally`, so a failing test cannot leave the stack in invite mode for the next suite.

### T-004 — Policy pages and legal footer

```yaml
- title: /terms and /privacy pages, PolicyLayout, LegalFooter on auth pages
- description: >
  Implement ux-design.md §Terms of Service / Privacy Policy and §Auth footer. Add
  `components/layout/legal-footer.tsx` (`LegalFooter`: nav "Legal", Terms · Privacy,
  `aria-current` on the current page) and `components/layout/policy-layout.tsx` (logo link to
  `/stocks` when a session exists, `/auth/sign-in` otherwise; read the session through the
  `AuthClient`, never blocking the render), and add `LegalFooter` to `AuthLayout`. Add
  `features/policies/` (`PolicyPage` showing the title, "Version {POLICY.version} · Effective
  {d MMM yyyy en-GB}", the draft `Alert` and the headed placeholder sections listed in
  ux-design.md; `terms-content.tsx`, `privacy-content.tsx`) and lazy views `views/terms.tsx`,
  `views/privacy.tsx`. Register `/terms` and `/privacy` in `createRoutes` as top-level siblings
  of `/auth` and the app route, with no guard and `RouteError`. Add both routes to the E2E
  global-setup route visit list. Update CLAUDE.md's `apps/web` routes paragraph.
- agent: react-vite-developer
- depends_on: [T-001]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] `/terms` and `/privacy` render for a signed-out visitor and for a signed-in investor with no redirect, each its own lazy chunk
- [ ] Each page shows its h1 (focused, tab title "<Title> · Investhesis"), the version line from `POLICY`, the draft notice and the placeholder sections
- [ ] Every `/auth/*` page and both policy pages show the Legal footer; the current page's link has `aria-current="page"`
- [ ] No horizontal scroll at 360 px (component layout classes per ux-design; checked end to end in T-006)
- [ ] The Investhesis gate is green

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-223
    scenario: Terms page renders for a visitor
    given: createRoutes(FakeAuthClient.signedOut())
    when: navigating to /terms
    then: h1 "Terms of Service" focused; text "Version 2026-11-22 · Effective 22 Nov 2026"; draft notice visible; document.title "Terms of Service · Investhesis"
    test_data:
      input: /terms, signed out
      expected: { h1: "Terms of Service", version: "Version 2026-11-22 · Effective 22 Nov 2026" }
  - id: TC-U-224
    scenario: Privacy page is not a guest-only page
    given: createRoutes(FakeAuthClient.signedIn())
    when: navigating to /privacy
    then: stays on /privacy (no redirect to /stocks or sign-in); h1 "Privacy Policy"; a section states holdings and cost basis are never shared with third parties
    test_data:
      input: /privacy, signed in
      expected: { location: "/privacy", h1: "Privacy Policy" }
  - id: TC-U-225
    scenario: legal footer on auth pages
    given: signed-out routes
    when: /auth/sign-in and /auth/forgot-password render
    then: navigation "Legal" contains links Terms (/terms) and Privacy (/privacy), same tab (no target)
    test_data:
      input: ["/auth/sign-in", "/auth/forgot-password"]
      expected: { nav: "Legal", links: ["/terms", "/privacy"] }
  - id: TC-U-226
    scenario: current page marked in the footer
    given: /terms rendered
    when: the Legal nav is inspected
    then: Terms link has aria-current="page"; Privacy link does not
    test_data:
      input: /terms
      expected: { "Terms": "page", "Privacy": null }
  - id: TC-U-227
    scenario: logo link follows the session
    given: /terms signed out, then /terms signed in
    when: the Investhesis logo link is inspected
    then: href /auth/sign-in when signed out, /stocks when signed in
    test_data:
      input: [signedOut, signedIn]
      expected: ["/auth/sign-in", "/stocks"]
```

**Notes** — The links in `LegalFooter` open in the same tab; only the sign-up label links open a
new tab (T-002). Mock mode (`VITE_AUTH_MODE=mock`) has no session, so its logo goes to
`/stocks`, as in mock mode guards never redirect.

### T-005 — Design test cases — user auth v1.1

```yaml
- title: Design test cases — user auth v1.1
- description: >
  Using the software-tester-design skill, produce structured TC-xxx test cases covering
  all test levels: unit boundaries, API (happy path + error paths + auth), frontend
  component, and E2E flows. Run Steps 0–4 (SUT definition → business flow → field specs
  → scenarios → test data). Output must be in TC-xxx format for software-tester-automation.
  Inputs: requirements.md, design.md, ux-design.md of this slice. Must cover FR-019 to FR-024 and
  NFR-009 to NFR-012; the hook decision table (mode × allowlisted × version); the consent
  record's integrity (trigger in the same transaction, later metadata edits, admin-created users);
  enumeration with new and registered emails, including a stale version; the invite-mode switch
  and restore; the policy pages signed in and out; keyboard order and Space/Enter behaviour on the
  consent field; axe and the 360 px check for Sign up (default and consent error), Terms and
  Privacy, in light and dark mode. Map each retired v1.0 case (TC-U-025b, TC-U-039, TC-U-040,
  TC-U-041, TC-C-027, TC-E-002, TC-E-003) to its replacement. Use ids from TC-C-201, TC-A-201 and
  TC-E-201 upward, plus the TC-U-201..227 already in this plan. Save as
  docs/features/user-auth/v1.1/test-cases.md.
- agent: software-tester-design
- depends_on: []
- status: backlog
- size: S
```

#### Acceptance criteria

- [ ] SUT definition documented
- [ ] TC-xxx cases cover happy path, boundaries, error paths, and business rules
- [ ] Each TC includes Level, Input, Expected Output, Preconditions, and Mock needed
- [ ] A traceability table maps every FR-019–FR-024 and NFR-009–NFR-012 to at least one TC
- [ ] Every retired v1.0 case is mapped to a replacement or marked as removed, with the reason

**Notes** — Runs in parallel with engineering tasks; depends only on requirements/design, not on code.

### T-006 — Automate tests — user auth v1.1

```yaml
- title: Automate tests — user auth v1.1
- description: >
  Using the software-tester-automation skill, convert the TC-xxx cases from T-005 into
  runnable scripts at the appropriate levels (Unit, script-level against local Supabase,
  Frontend Component, E2E). Run the full suite against the implementation. E2E: open sign-up with
  a fresh non-allowlisted address → Mailpit link → confirmed → /stocks → `GET /api/me`, with the
  consent row checked through `psql`; unticked submit blocked; policy pages reachable signed in
  and out. Extend `e2e/lib/states.ts` so axe and the 360 px check visit Sign up (default and
  consent error), Terms and Privacy, and extend the contrast check to the checkbox border and
  focus ring in light and dark mode. Produce docs/features/user-auth/v1.1/test-report.md with
  `pnpm test:report:unit`, `pnpm test:e2e` and `pnpm test:report` (extend
  `scripts/stock-lists-report.mjs` or add a sibling for this slice if its id parsing needs it).
- agent: software-tester-automation
- depends_on: [T-001, T-002, T-003, T-004, T-005]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] All TC-* from T-005 automated and passing (or pinned with `test.fail` and a finding id listed in the report)
- [ ] Coverage stays at or above the CLAUDE.md thresholds (`src/features/auth/` ≥ 90 %, `src/features/` ≥ 70 %, domain ≥ 95 %)
- [ ] E2E open sign-up → confirm → `GET /api/me` passes against local Supabase in a clean run
- [ ] Axe and the 360 px check pass for Sign up, Terms and Privacy in light and dark mode
- [ ] Test report produced with pass/fail per TC-id
- [ ] The full Investhesis gate is green

**Notes** — Report "T-006 done" with the full test report when all TCs pass.

## Status Legend

| Status | Changed By | Meaning |
|--------|-----------|---------|
| `backlog` | Orchestrator | Ready, waiting to be picked up |
| `doing` | Orchestrator / Agent | Agent actively working |
| `blocked` | Agent | Stuck, needs human intervention |
| `test` | Agent | Dev done, needs testing |
| `review` | Agent / Tester | Human must review before advancing |
| `done` | Human | Approved and complete |
