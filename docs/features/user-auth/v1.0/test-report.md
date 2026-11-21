---
version: 1.0
status: draft
date: 2026-11-21
task: T-008
requires: test-cases.md
---

# Test report: User Auth (email + password)

Results of T-008, run against the implementation on `main` with local Supabase (`pnpm db:start`).

## Summary

| Suite | Command | Result |
|---|---|---|
| Supabase and API integration (TC-U-001..005, 039..042, TC-A-018..032) | `pnpm test:supabase` | 33/33 pass (2 files) |
| API Vitest | `pnpm test` (api) | 76/76 pass (8 files) |
| Web Vitest | `pnpm test` (web) | 180/180 pass (12 files) |
| End to end (Playwright, Chromium) | `pnpm test:e2e` | 40/40 pass, two consecutive runs on the final code (a third earlier run also green), about 1.2 min each |
| Lint, typecheck, build | `pnpm lint`, `pnpm typecheck`, `pnpm build` | pass |

Counts are tests, not cases: one case can have several tests, and a few tests carry two ids.

## Coverage (Vitest v8, `pnpm --filter <pkg> test:coverage`, threshold 90 % lines)

| Area | Lines | Statements | Branches | Functions |
|---|---|---|---|---|
| `apps/api/src/auth/` | 100 % | 100 % | 95 % | 100 % |
| `apps/web/src/features/auth/` | 96.83 % | 93.81 % | 89.5 % | 91.42 % |

No file is excluded. Two files of the web folder have no executable lines of their own (`auth-client.ts` is types only); `create-auth-client.ts` (50 %) is the two-line factory used by `main.tsx`.

## Defects found and fixed (each its own `fix` commit)

| # | Case | Defect | Fix |
|---|---|---|---|
| F-1 | TC-C-003, TC-E-028 | In mock mode the guest pages showed the sign-in form; design.md says they redirect to `/stocks` | `guards.ts`: no early return for mock mode |
| F-2 | TC-C-051 | Spinner on the confirming screen had no `motion-reduce:animate-none` | class added |
| F-3 | TC-E-001 | `App` built the router in a `useState` initializer, which StrictMode runs twice: two routers started their loaders, so an email link was verified twice (both calls succeeded in parallel) and the toast shown twice. Development only, but a race on a single-use token | router cached per `AuthClient` (`app.tsx`) |
| F-4 | TC-E-027 | Light theme: destructive text on white 4.49:1 and muted text on `bg-muted` 4.34:1 (needs 4.5:1) | `--destructive` and `--muted-foreground` darkened in `index.css` |
| F-5 | TC-A-032 | README did not name a free or low-cost SMTP option for OQ-1 | README section added |

## Deviations from the case text

- **D-1 (TC-A-030).** Local Auth (CLI 3.2.0) does not revoke the refresh-token family on reuse, and tolerates a reuse of the direct parent after the 10 s window. The case text expects both; the test asserts what holds (a stale token is rejected as `refresh_token_already_used`, no session). Decide whether hosted Auth behaves the same, and whether family revocation matters for the threat model.
- **D-2 (TC-E-026).** No pixel snapshot comparison (platform-specific baselines); structural checks instead.
- **D-3 (TC-E-027).** The app has no theme switch, so dark mode is the `.dark` class plus `prefers-color-scheme: dark`.
- **D-4 (TC-E-021).** The tampered signature character is in the middle, not the last one.
- **D-5 (ports).** The suite listens on 5173 (email links point there). `E2E_WEB_PORT` moves it when another project holds 5173; the suite then rewrites the origin of the links it opens. This run used 5174 because another project held 5173; the default 5173 path was not run here.
- Gaps G-5 and G-6 have no case and were skipped. G-8: TC-E-012 stayed in (stable).

## Results per case

| Case | Title | Level | Test file | Result |
|---|---|---|---|---|
| TC-A-001 | Mock mode ignores the header and serves the mock user | API | `apps/api/src/modules/me/me.supabase.test.ts` | PASS |
| TC-A-002 | Mock mode is refused in production, allowed in development and test | Unit | `apps/api/src/config/env.test.ts` | PASS |
| TC-A-003 | Malformed SUPABASE_URL and trailing slash | Unit | `apps/api/src/config/env.test.ts` | PASS |
| TC-A-004 | Tampered payload keeps the old signature | API | `apps/api/src/modules/me/me.supabase.test.ts` | PASS |
| TC-A-005 | Tampered header and truncated signature | API | `apps/api/src/modules/me/me.supabase.test.ts` | PASS |
| TC-A-006 | Algorithm confusion with the public key as HMAC secret | API | `apps/api/src/modules/me/me.supabase.test.ts` | PASS |
| TC-A-007 | Identity is never taken from body, query or custom header | API | `apps/api/src/modules/me/me.supabase.test.ts` | PASS |
| TC-A-008 | Expiry tolerance boundary | API | `apps/api/src/modules/me/me.supabase.test.ts` | PASS |
| TC-A-009 | Not-yet-valid and claim-less tokens | API | `apps/api/src/modules/me/me.supabase.test.ts` | PASS |
| TC-A-010 | Unknown key after refetch is 401, not 503 | API | `apps/api/src/modules/me/me.supabase.test.ts` | PASS |
| TC-A-011 | Cached key survives a JWKS outage | API | `apps/api/src/auth/supabase-identity-resolver.test.ts` | PASS |
| TC-A-012 | 401 and 503 bodies carry no secrets or reasons | API | `apps/api/src/modules/me/me.supabase.test.ts` | PASS |
| TC-A-013 | Rejection is logged with a reason and without the token | API | `apps/api/src/modules/me/me.supabase.test.ts` | PASS |
| TC-A-014 | Concurrent users never cross identities | API | `apps/api/src/modules/me/me.supabase.test.ts` | PASS |
| TC-A-015 | OpenAPI declares bearerAuth | API | `apps/api/src/modules/me/me.supabase.test.ts` | PASS |
| TC-A-016 | Token verification p95 within 5 ms | Performance | `apps/api/src/auth/supabase-identity-resolver.test.ts` | PASS |
| TC-A-017 | API auth tests run offline | API | `apps/api/src/auth/supabase-identity-resolver.test.ts` | PASS |
| TC-A-018 | Access token claims from local Auth | Integration | `scripts/auth-integration.test.ts` | PASS |
| TC-A-019 | A real local token is accepted by the API verifier | Integration | `scripts/auth-integration.test.ts` | PASS |
| TC-A-020 | Anonymous sign-ins are disabled | Integration | `scripts/auth-integration.test.ts` | PASS |
| TC-A-021 | Password length ceiling at the provider | Integration | `scripts/auth-integration.test.ts` | PASS |
| TC-A-022 | Existing allowlisted email gives no signal at the provider | Integration | `scripts/auth-integration.test.ts` | PASS |
| TC-A-023 | Sign-in failure is identical for wrong password and unknown email | Integration | `scripts/auth-integration.test.ts` | PASS |
| TC-A-024 | Reset for an unregistered email is silent | Integration | `scripts/auth-integration.test.ts` | PASS |
| TC-A-025 | Recovery email uses the recovery template | Integration | `scripts/auth-integration.test.ts` | PASS |
| TC-A-026 | Confirmation link is single-use | Integration | `scripts/auth-integration.test.ts` | PASS |
| TC-A-027 | Tampered or truncated token_hash is invalid | Integration | `scripts/auth-integration.test.ts` | PASS |
| TC-A-028 | Confirmation email frequency limit | Integration | `scripts/auth-integration.test.ts` | PASS |
| TC-A-029 | Foreign redirect URL is not honoured | Integration | `scripts/auth-integration.test.ts` | PASS |
| TC-A-030 | Refresh token rotation and reuse detection | Integration | `scripts/auth-integration.test.ts` | PASS with deviation D-1: local Auth rejects a stale token (`refresh_token_already_used`) but does not revoke the family, and a direct-parent reuse after 11 s still returns the live token. The test asserts the rejection only. |
| TC-A-031 | Auth settings match the design | Static | `scripts/auth-integration.test.ts` | PASS |
| TC-A-032 | Free-tier and cost review | Static (inspection) | `scripts/auth-integration.test.ts` | PASS after the README gained the free/low-cost SMTP note (commit docs(supabase)). |
| TC-C-001 | Only the adapter imports the Supabase SDK | Static | `apps/web/src/features/auth/tc-foundation.test.tsx` | PASS (oxlint on a temp fixture plus a source scan). |
| TC-C-002 | Startup config in supabase mode | Unit | `apps/web/src/config.test.ts` | PASS |
| TC-C-003 | Mock mode keeps today's behaviour | Component | `apps/web/src/features/auth/tc-foundation.test.tsx` | PASS after fix(web): guest pages now redirect in mock mode (was showing the sign-in form). |
| TC-C-004 | Session survives a reload (adapter and storage) | Component | `apps/web/src/features/auth/tc-foundation.test.tsx` | PASS |
| TC-C-005 | Expired but refreshable session is renewed before a page renders | Component | `apps/web/src/features/auth/tc-foundation.test.tsx` | PASS |
| TC-C-006 | Token refreshed event needs no navigation | Component | `apps/web/src/features/auth/tc-foundation.test.tsx` | PASS |
| TC-C-007 | api-client sends no request without a session | Component | `apps/web/src/lib/api-client.test.ts` | PASS |
| TC-C-008 | api-client attaches the bearer header only with a session | Component | `apps/web/src/lib/api-client.test.ts` | PASS |
| TC-C-009 | api-client retries a FormData body | Component | `apps/web/src/lib/api-client.test.ts` | PASS |
| TC-C-010 | api-client does not refresh on non-401 failures | Component | `apps/web/src/lib/api-client.test.ts` | PASS |
| TC-C-011 | api-client when refresh itself fails | Component | `apps/web/src/lib/api-client.test.ts` | PASS |
| TC-C-012 | Unknown errors log no secrets | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-013 | Sign-in error is identical for unknown email and wrong password | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-014 | Sign-in does not apply the 8-character rule | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-015 | Hostile next values after sign-in | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-016 | next is carried through the sign-up and forgot links | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-017 | Session-ended notice | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-018 | Double submit is ignored and busy state shown | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-019 | Rate-limit and outage copy on sign-in | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-020 | Unconfirmed alert names the email | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-021 | No credentials in the URL after any sign-in outcome | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-022 | Sign-up client checks block the call | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-023 | Sign-up accepts the boundaries | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-024 | Field errors are tied to their inputs | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-025 | Server weak_password maps to the field | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-026 | Sign-up outage and rate-limit alerts keep the passwords | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-027 | Invite-only refusal keeps passwords and differs from existing-account behaviour | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-028 | Sign-up passwords cleared after navigation | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-029 | Visibility toggle | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-030 | Autocomplete tokens | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-031 | Resend feedback and rate limit | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-032 | Check-email page leaks nothing in the URL | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-033 | Reload fallback resend | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-034 | Confirming pending UI | Component | `apps/web/src/features/auth/email-links.test.tsx` | PASS |
| TC-C-035 | Confirm verifies exactly once and never renders the hash | Component | `apps/web/src/features/auth/email-links.test.tsx` | PASS |
| TC-C-036 | Hostile next on a valid email link | Component | `apps/web/src/features/auth/email-links.test.tsx` | PASS |
| TC-C-037 | Link-expired variants | Component | `apps/web/src/features/auth/email-links.test.tsx` | PASS |
| TC-C-038 | Forgot password is identical for registered and unregistered emails | Component | `apps/web/src/features/auth/email-links.test.tsx` | PASS |
| TC-C-039 | Forgot prefill, outage and resend cooldown | Component | `apps/web/src/features/auth/email-links.test.tsx` | PASS |
| TC-C-040 | Set-new-password client checks | Component | `apps/web/src/features/auth/email-links.test.tsx` | PASS |
| TC-C-041 | Recovery session lost on submit | Component | `apps/web/src/features/auth/email-links.test.tsx` | PASS |
| TC-C-042 | Recovery pages are not guest pages | Component | `apps/web/src/features/auth/email-links.test.tsx` | PASS |
| TC-C-043 | Change-password client checks | Component | `apps/web/src/features/auth/account.test.tsx` | PASS |
| TC-C-044 | Same or weak password on the right field | Component | `apps/web/src/features/auth/account.test.tsx` | PASS |
| TC-C-045 | Account page content and route | Component | `apps/web/src/features/auth/account.test.tsx` | PASS |
| TC-C-046 | Signed-out visitor cannot open /account | Component | `apps/web/src/features/auth/account.test.tsx` | PASS |
| TC-C-047 | Initials and repeated second line | Component | `apps/web/src/features/auth/account.test.tsx` | PASS |
| TC-C-048 | Account menu keyboard behaviour | Component | `apps/web/src/features/auth/account.test.tsx` | PASS |
| TC-C-049 | Focus and title on every auth route | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-C-050 | Every control has a visible label and errors are announced | Component | `apps/web/src/features/auth/tc-foundation.test.tsx` | PASS |
| TC-C-051 | Spinner honours reduced motion | Static | `apps/web/src/features/auth/tc-foundation.test.tsx` | PASS after fix(web): the confirming spinner lacked `motion-reduce:animate-none`. |
| TC-E-001 | Sign up, confirm, land signed in, API knows me | E2E | `e2e/auth-sign-up.spec.ts`, apps/web/src/features/auth/tc-foundation.test.tsx (StrictMode regression) | PASS after fix(web): StrictMode created two routers, so the link was verified twice and the toast shown twice. |
| TC-E-002 | Non-allowlisted sign-up is refused with nothing created | E2E | `e2e/auth-sign-up.spec.ts` | PASS |
| TC-E-003 | Allowlist matching through the UI | E2E | `e2e/auth-sign-up.spec.ts` | PASS |
| TC-E-004 | Same screen for an already-registered email | E2E | `e2e/auth-sign-up.spec.ts` | PASS |
| TC-E-005 | Unconfirmed sign-in offers resend and works after confirming | E2E | `e2e/auth-sign-in.spec.ts` | PASS |
| TC-E-006 | Wrong credentials are indistinguishable | E2E | `e2e/auth-sign-in.spec.ts` | PASS |
| TC-E-007 | Deep link returns after sign-in; hostile next does not leave the site | E2E | `e2e/auth-sign-in.spec.ts` | PASS |
| TC-E-008 | Signed-in user is kept off guest pages | E2E | `e2e/auth-sign-in.spec.ts` | PASS |
| TC-E-009 | Session survives reload and browser restart | E2E | `e2e/auth-session.spec.ts` | PASS |
| TC-E-010 | Expired access token is renewed silently | E2E | `e2e/auth-session.spec.ts` | PASS |
| TC-E-011 | Unrecoverable session sends the user to sign-in with the notice | E2E | `e2e/auth-session.spec.ts` | PASS |
| TC-E-012 | Token auto-renews across the expiry window | E2E | `e2e/auth-session.spec.ts` | PASS (kept; 5 consecutive green runs with `page.clock`). |
| TC-E-013 | Sign out ends the session and the old token is not sent again | E2E | `e2e/auth-session.spec.ts` | PASS |
| TC-E-014 | Sign out in one tab signs out the other | E2E | `e2e/auth-session.spec.ts` | PASS |
| TC-E-015 | Forgot, reset, sign in with the new password | E2E | `e2e/auth-reset.spec.ts` | PASS |
| TC-E-016 | Forgot for an unregistered email | E2E | `e2e/auth-reset.spec.ts` | PASS |
| TC-E-017 | Used, malformed and wrong-type links | E2E | `e2e/auth-reset.spec.ts` | PASS |
| TC-E-018 | Reset page without a recovery session | E2E | `e2e/auth-reset.spec.ts` | PASS |
| TC-E-019 | Change password on the account page | E2E | `e2e/auth-account-api.spec.ts` | PASS |
| TC-E-020 | Two investors see only their own identity | E2E | `e2e/auth-account-api.spec.ts` | PASS |
| TC-E-021 | API rejects requests without a valid token through the proxy | E2E | `e2e/auth-account-api.spec.ts` | PASS. The tampered token changes a signature character in the middle, not the last one (the last base64url character of an ES256 signature has unused bits, so changing it can leave the signature intact). |
| TC-E-022 | Nothing sensitive in URLs or history | E2E | `e2e/auth-sign-up.spec.ts` | PASS (history walk after sign-up/confirm in TC-E-022; URL checks also in TC-E-005 and TC-E-015). |
| TC-E-023 | API logs never contain tokens | E2E | `e2e/zz-api-logs.spec.ts` | PASS (runs last; reads the whole API/web log of the run). |
| TC-E-024 | Keyboard-only sign-in | E2E | `e2e/auth-sign-in.spec.ts` | PASS |
| TC-E-025 | Keyboard-only sign-up and error focus | E2E | `e2e/auth-sign-in.spec.ts` | PASS |
| TC-E-026 | 360 px layout | E2E | `e2e/auth-layout-a11y.spec.ts` | PASS structurally (overflow, padding, button reach, panel visibility, truncation). The 0.1 % visual snapshot is not done: baselines are platform specific. |
| TC-E-027 | Axe on every auth screen in light and dark | E2E | `e2e/auth-layout-a11y.spec.ts` | PASS after fix(web): light-theme contrast of destructive and muted text. The app has no theme switch, so dark is run with `emulateMedia` plus the `.dark` class. |
| TC-E-028 | Mock mode smoke | E2E | `e2e/auth-mock-mode.spec.ts` | PASS after fix(web): same guard fix as TC-C-003. |
| TC-U-001 | Local JWKS publishes the ES256 key | Integration | `scripts/supabase-auth.test.ts` | PASS |
| TC-U-002 | Password minimum enforced by Auth | Integration | `scripts/supabase-auth.test.ts` | PASS |
| TC-U-003 | Confirmation email uses the token_hash template | Integration | `scripts/supabase-auth.test.ts` | PASS |
| TC-U-004 | Unconfirmed account cannot sign in | Integration | `scripts/supabase-auth.test.ts` | PASS |
| TC-U-005 | Password change requires the current password | Integration | `scripts/supabase-auth.test.ts` | PASS |
| TC-U-006 | Valid token resolves the identity | API | `apps/api/src/modules/me/me.supabase.test.ts` | PASS |
| TC-U-007 | Rejected tokens all answer the same 401 | API | `apps/api/src/modules/me/me.supabase.test.ts` | PASS |
| TC-U-008 | Clock skew within tolerance is accepted | API | `apps/api/src/modules/me/me.supabase.test.ts` | PASS |
| TC-U-009 | JWKS outage is not a sign-out | API | `apps/api/src/modules/me/me.supabase.test.ts` | PASS |
| TC-U-010 | Public paths skip auth in supabase mode | API | `apps/api/src/modules/me/me.supabase.test.ts` | PASS |
| TC-U-011 | Config validation for supabase mode | Unit | `apps/api/src/config/env.test.ts` | PASS |
| TC-U-012 | Two users see only their own identity | API | `apps/api/src/modules/me/me.supabase.test.ts` | PASS |
| TC-U-013 | Bearer token never reaches the logs | API | `apps/api/src/modules/me/me.supabase.test.ts` | PASS |
| TC-U-014 | Guard redirects a signed-out visitor and keeps the target | Component | `apps/web/src/features/auth/guards.test.tsx` | PASS |
| TC-U-014b | Guard runs before child loaders | Component | `apps/web/src/features/auth/guards.test.tsx` | PASS |
| TC-U-015 | Guest page sends a signed-in user to stocks | Component | `apps/web/src/features/auth/auth-pages.test.tsx`, `apps/web/src/features/auth/guards.test.tsx` | PASS |
| TC-U-016 | safeNext only allows same-origin app paths | Unit | `apps/web/src/features/auth/safe-next.test.ts` | PASS |
| TC-U-017 | api-client recovers from one expired token | Component | `apps/web/src/lib/api-client.test.ts` | PASS |
| TC-U-018 | api-client gives up after a second 401 | Component | `apps/web/src/lib/api-client.test.ts` | PASS |
| TC-U-019 | Supabase errors map to AuthErrorCode | Unit | `apps/web/src/features/auth/map-supabase-error.test.ts` | PASS |
| TC-U-020 | Sign-out in another tab ends this tab's session | Component | `apps/web/src/features/auth/guards.test.tsx` | PASS |
| TC-U-021 | Password rules | Unit | `apps/web/src/features/auth/password-rules.test.ts` | PASS |
| TC-U-022 | Successful sign-in returns to next | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-U-023 | Wrong password | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-U-024 | Unconfirmed account can resend | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-U-025 | Sign-up hides whether the email exists | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-U-025b | Sign-up outside the allowlist | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-U-026 | Resend cooldown | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-U-027 | Check-email after reload asks for the email | Component | `apps/web/src/features/auth/auth-pages.test.tsx` | PASS |
| TC-U-028 | Confirm link success | Component | `apps/web/src/features/auth/email-links.test.tsx` | PASS |
| TC-U-029 | Recovery link ignores next | Component | `apps/web/src/features/auth/email-links.test.tsx` | PASS |
| TC-U-030 | Bad links | Component | `apps/web/src/features/auth/email-links.test.tsx` | PASS |
| TC-U-031 | Forgot password is neutral | Component | `apps/web/src/features/auth/email-links.test.tsx` | PASS |
| TC-U-032 | Forgot password rate limit | Component | `apps/web/src/features/auth/email-links.test.tsx` | PASS |
| TC-U-033 | Set new password | Component | `apps/web/src/features/auth/email-links.test.tsx` | PASS |
| TC-U-034 | Reset page without a session | Component | `apps/web/src/features/auth/email-links.test.tsx` | PASS |
| TC-U-035 | Menu shows the signed-in email | Component | `apps/web/src/features/auth/account.test.tsx` | PASS |
| TC-U-036 | Change password success | Component | `apps/web/src/features/auth/account.test.tsx` | PASS |
| TC-U-037 | Wrong current password | Component | `apps/web/src/features/auth/account.test.tsx` | PASS |
| TC-U-038 | Sign out | Component | `apps/web/src/features/auth/account.test.tsx` | PASS |
| TC-U-039 | Hook decisions | Integration | `scripts/supabase-auth.test.ts` | PASS |
| TC-U-040 | Sign-up refused end to end | Integration | `scripts/supabase-auth.test.ts` | PASS |
| TC-U-041 | Allowlist not reachable through Data API roles | Integration | `scripts/supabase-auth.test.ts` | PASS |
| TC-U-042 | Pattern check | Integration | `scripts/supabase-auth.test.ts` | PASS |
