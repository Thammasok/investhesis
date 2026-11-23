---
version: 1.2
status: draft
date: 2026-11-23
task: T-005
requires: test-cases.md
---

# Test report: User Auth v1.2 (admin-created accounts, no self sign-up)

Results of T-005 on `main`, with local Supabase (`pnpm db:start`, `pnpm db:reset`). Per-case table
produced by `pnpm test:report:unit`, `pnpm test:e2e` and `pnpm test:report:auth`
(`scripts/user-auth-report.mjs`, ids from this folder's `test-cases.md`; the existing
`stock-lists-report.mjs` filters by file and stays as is).

## Summary

| Step | Command | Result |
|---|---|---|
| Database | `pnpm db:start && pnpm db:reset` | all four migrations and the seed apply |
| Supabase scripts | `pnpm test:supabase` | 54/54 pass (3 files, about 104 s) |
| Lint, typecheck | `pnpm lint`, `pnpm typecheck` (includes `e2e/`) | pass |
| Vitest | `pnpm test` | domain 121/121, api 304/304, web 399/399 |
| Build | `pnpm build` | pass |
| E2E (Playwright, Chromium) | `pnpm test:e2e` | 123 expected, 0 unexpected, 0 flaky, 0 skipped (7.3 min); 14 of them are the Stock Lists `test.fail` pins (F-1 to F-4 of that report), none belongs to this feature |
| Auth report | `pnpm test:report:auth` | 58 of 59 ids automated and passing; TC-A-317 is manual |

## Coverage (`pnpm --filter <pkg> test:coverage`)

| Area | Lines | Threshold |
|---|---|---|
| `apps/web/src/features/auth` | 94.61 % (`auth/components` 99.02 %) | 90 % |
| `apps/web/src/features` (whole web, all files) | 97.56 % | 70 % |
| `packages/domain` | 100 % | 95 % |

## Findings

No new product defect. Deviations and notes:

- **D-1 (TC-A-307, carried from v1.0 D-1).** Local Auth 3.2.0 rejects a stale ancestor refresh token
  (`refresh_token_already_used`) and tolerates reuse inside 10 s, but does not revoke the session
  family, so that clause of the case is not asserted. R1, R2, R3 are used so R1 is not the direct
  parent; the test waits 11 s.
- **TC-A-312.** The case text says no tracked file outside the README names `service_role`. Three
  files legitimately name the variable (`scripts/lib/stack.ts` reads it at run time, `config.toml`
  mentions the Postgres role in a comment, and the test itself). The test asserts the stronger
  property: no tracked file holds the live service key (read from `supabase status` at run time),
  no JWT or `sb_secret_` literal exists, only those files name it, and `.env*` files do not.
- **TC-A-314** waits 61 s past `max_frequency` and so takes about 62 s.
- **TC-C-309** reviewed list: the only non-comment source line that matches is Supabase's own type
  name in `auth.resend({ type: 'signup', email })`.
- **TC-E-312** is scanned in the resend-then-confirm flow; the reset flow is scanned in TC-E-307,
  and TC-E-309 checks the check-email URL for the address. TC-E-301 does not scan the history.
- **TC-E-313** runs as the existing 360 px and axe tests (titles carry both the v1.0 and v1.2 ids):
  now ten screens (sign-in, sign-in error, check-email, link-expired unknown / email / recovery,
  forgot-password request and sent, reset-password, account), at 360x640, 320x568 and 360x360 and
  under axe (wcag2a, wcag2aa, wcag21aa), each in light and dark.
- TC-U-308 relies on `mapSupabaseError` falling back to `unknown`; confirmed by the test.

## Manual checks

- **TC-A-317 (re-open sign-up by configuration only): not run in T-005.** It needs
  `enable_signup = true`, a stack restart and a revert. Steps are in `supabase/README.md`
  ("Re-opening sign-up"); record date and result here when the owner runs it.
  Date: ______  Result: ______
- Hosted rollout order (README checklist) is checked as documentation only (TC-A-318).

## Results per case

| TC | tests | result | files |
|---|---|---|---|
| TC-A-301 | 7 | pass | scripts/auth-integration.test.ts |
| TC-A-302 | 1 | pass | scripts/auth-integration.test.ts |
| TC-A-303 | 1 | pass | scripts/auth-integration.test.ts |
| TC-A-304 | 2 | pass | scripts/auth-integration.test.ts |
| TC-A-305 | 6 | pass | scripts/auth-integration.test.ts, scripts/supabase-auth.test.ts |
| TC-A-306 | 4 | pass | scripts/auth-integration.test.ts |
| TC-A-307 | 1 | pass | scripts/auth-integration.test.ts |
| TC-A-308 | 1 | pass | scripts/auth-integration.test.ts |
| TC-A-309 | 5 | pass | scripts/auth-integration.test.ts |
| TC-A-310 | 5 | pass | scripts/auth-integration.test.ts |
| TC-A-311 | 1 | pass | scripts/supabase-auth.test.ts |
| TC-A-312 | 3 | pass | scripts/auth-integration.test.ts |
| TC-A-313 | 1 | pass | scripts/supabase-auth.test.ts |
| TC-A-314 | 1 | pass | scripts/auth-integration.test.ts |
| TC-A-315 | 7 | pass | scripts/auth-integration.test.ts |
| TC-A-316 | 2 | pass | scripts/auth-integration.test.ts |
| TC-A-317 | 0 | MANUAL |  |
| TC-A-318 | 3 | pass | scripts/auth-integration.test.ts |
| TC-C-301 | 4 | pass | apps/web/src/features/auth/registration-closed.test.tsx |
| TC-C-302 | 8 | pass | apps/web/src/features/auth/registration-closed.test.tsx |
| TC-C-303 | 3 | pass | apps/web/src/features/auth/registration-closed.test.tsx |
| TC-C-304 | 1 | pass | apps/web/src/features/auth/registration-closed.test.tsx |
| TC-C-305 | 2 | pass | apps/web/src/features/auth/auth-pages.test.tsx |
| TC-C-306 | 12 | pass | apps/web/src/features/auth/v12-remaining-screens.test.tsx |
| TC-C-307 | 2 | pass | apps/web/src/features/auth/v12-remaining-screens.test.tsx |
| TC-C-308 | 6 | pass | apps/web/src/features/auth/registration-closed.test.tsx |
| TC-C-309 | 1 | pass | apps/web/src/features/auth/registration-closed.test.tsx |
| TC-C-310 | 1 | pass | apps/web/src/features/auth/auth-pages.test.tsx |
| TC-C-311 | 4 | pass | apps/web/src/features/auth/auth-pages.test.tsx, apps/web/src/features/auth/v12-remaining-screens.test.tsx |
| TC-C-312 | 6 | pass | apps/web/src/features/auth/v12-remaining-screens.test.tsx |
| TC-C-313 | 1 | pass | apps/web/src/features/auth/registration-closed.test.tsx |
| TC-E-301 | 1 | pass | e2e/auth-registration-closed.spec.ts |
| TC-E-302 | 1 | pass | e2e/auth-registration-closed.spec.ts |
| TC-E-303 | 1 | pass | e2e/auth-registration-closed.spec.ts |
| TC-E-304 | 1 | pass | e2e/auth-registration-closed.spec.ts |
| TC-E-305 | 1 | pass | e2e/auth-sign-in.spec.ts |
| TC-E-306 | 1 | pass | e2e/auth-admin-accounts.spec.ts |
| TC-E-307 | 1 | pass | e2e/auth-admin-accounts.spec.ts |
| TC-E-308 | 1 | pass | e2e/auth-admin-accounts.spec.ts |
| TC-E-309 | 1 | pass | e2e/auth-admin-accounts.spec.ts |
| TC-E-310 | 1 | pass | e2e/auth-admin-accounts.spec.ts |
| TC-E-311 | 1 | pass | e2e/auth-admin-accounts.spec.ts |
| TC-E-312 | 1 | pass | e2e/auth-registration-closed.spec.ts |
| TC-E-313 | 8 | pass | e2e/auth-layout-a11y.spec.ts |
| TC-U-301 | 1 | pass | scripts/supabase-auth.test.ts |
| TC-U-302 | 1 | pass | scripts/supabase-auth.test.ts |
| TC-U-303 | 1 | pass | apps/web/src/features/auth/registration-closed.test.tsx |
| TC-U-304 | 1 | pass | apps/web/src/features/auth/registration-closed.test.tsx |
| TC-U-305 | 1 | pass | apps/web/src/features/auth/registration-closed.test.tsx |
| TC-U-306 | 1 | pass | apps/web/src/features/auth/registration-closed.test.tsx |
| TC-U-307 | 1 | pass | apps/web/src/features/auth/registration-closed.test.tsx |
| TC-U-308 | 1 | pass | apps/web/src/features/auth/registration-closed.test.tsx |
| TC-U-309 | 1 | pass | scripts/supabase-auth.test.ts |
| TC-U-310 | 1 | pass | scripts/supabase-auth.test.ts |
| TC-U-311 | 1 | pass | scripts/supabase-auth.test.ts |
| TC-U-312 | 1 | pass | scripts/supabase-auth.test.ts |
| TC-U-313 | 1 | pass | scripts/supabase-auth.test.ts |
| TC-U-314 | 1 | pass | scripts/supabase-auth.test.ts |
| TC-U-315 | 1 | pass | scripts/supabase-auth.test.ts |

