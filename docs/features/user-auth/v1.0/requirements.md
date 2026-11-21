---
version: 1.0
status: approved
date: 2026-11-21
source: Multi-Market Stock Watchlist Brief.md (FR-001, NFR-003)
---

# Requirements: User Auth (email + password)

Investors create an account with their email and a password, confirm the email, sign in, stay
signed in on that browser, and can change or reset their password. Every API call then runs as the
signed-in user instead of the mock user, so each investor sees only their own data (brief FR-001,
NFR-003).

## Decisions taken for this slice

These were agreed with the owner on 2026-11-21 and shape the requirements below.

- **Supabase Auth owns accounts, passwords and sessions.** The web app signs in through Supabase
  Auth; the API only verifies the access token Supabase issues and maps it to an `Identity`
  through the existing `IdentityResolver` seam. Investhesis stores no password hashes.
- **Flows in scope:** sign-up, email verification, sign-in, sign-out, forgot/reset password and
  change password.
- **Sign-up is invite-only through an email allowlist** (agreed 2026-11-21, after cross-checking
  with Stock Lists, which was planned for a single user). Only emails or domains on the allowlist
  can create an account; the owner manages the list in the database.
- **Stay signed in:** a session survives browser restarts and is renewed automatically until the
  user signs out or the session can no longer be refreshed.
- **Mock auth stays for development and tests** (`AUTH_MODE=mock`), still refused in production.
  Real auth becomes the default mode.

## Actors

- **Visitor** — someone without a session. Can sign up, confirm an email, sign in and request a
  password reset. Cannot reach the signed-in area or any non-public API route.
- **Investor** — a signed-in user. Owns all data created under their account.
- **Supabase Auth** (system) — stores accounts and password hashes, sends confirmation and reset
  emails, issues and refreshes access tokens.

## Use Cases

### UC-001

**Sign up** — The visitor enters an email and a password (twice). Supabase creates an unconfirmed
account and emails a confirmation link. The visitor sees a "check your email" screen.

### UC-002

**Confirm email** — The visitor opens the confirmation link. The account is confirmed and the
visitor lands in the app signed in, or on sign-in if the link opened in another browser.

### UC-003

**Sign in** — The visitor enters email and password and lands on the page they originally asked
for, or `/stocks` by default.

### UC-004

**Sign out** — The investor signs out from the account menu. The session on this browser ends and
they land on sign-in.

### UC-005

**Reset a forgotten password** — The visitor asks for a reset link by email, opens it, sets a new
password and is signed in.

### UC-006

**Change password** — The signed-in investor enters their current password and a new one.

### UC-007

**Reach a protected page or route** — Any request for the signed-in area or a non-public API route
without a valid session is turned away (to sign-in in the web; `401` from the API).

## Functional Requirements

### Sign-up and confirmation

#### FR-001

The system SHALL let a visitor create an account with an email address and a password entered
twice, and SHALL reject the form when the two passwords differ or the password breaks the policy
in [NFR-002](#nfr-002), before calling Supabase.

#### FR-018

The system SHALL create an account only when the sign-up email matches an allowlist entry (the
exact address, or `@domain` for a whole domain, compared case-insensitively), and SHALL otherwise
refuse the sign-up and show "Sign-up is invite-only. Ask the owner to add this email." Refusal
happens before any account or email is created.

### FR-002

The system SHALL send a confirmation email after sign-up and SHALL NOT let an unconfirmed account
sign in; signing in with an unconfirmed account SHALL show a message offering to resend the
confirmation email.

#### FR-003

The system SHALL show the same "check your email" result for an allowlisted sign-up whether or not
the email is already registered, so the form does not reveal which emails have accounts. (The
invite-only message of [FR-018](#fr-018) reveals only allowlist membership, never whether an
account exists.)

#### FR-004

The system SHALL confirm the account and start a session when the visitor opens a valid
confirmation link, and SHALL show an "expired or invalid link" page with a resend option when the
link is expired, already used or malformed.

### Sign-in, session and sign-out

#### FR-005

The system SHALL sign in a visitor whose email and password match a confirmed account, and SHALL
show one generic "email or password is incorrect" error otherwise, without saying which one was
wrong.

#### FR-006

The system SHALL keep the investor signed in across page reloads and browser restarts, renewing the
access token automatically before or when it expires, until the investor signs out or the session
cannot be refreshed.

#### FR-007

The system SHALL end the session on the current browser when the investor chooses Sign out in the
account menu, and SHALL then show the sign-in page; afterwards the old access token SHALL no longer
be sent by the web app.

#### FR-008

The web app SHALL redirect a visitor who opens any page in the signed-in area to `/auth/sign-in`,
and after a successful sign-in SHALL return them to the page they asked for (same-origin paths
only; anything else falls back to `/stocks`).

#### FR-009

The web app SHALL redirect a signed-in investor who opens `/auth/sign-in` or `/auth/sign-up` to
`/stocks`.

#### FR-010

The web app SHALL send the investor to sign-in, keeping the current page as the return target, when
the API answers `401` and a token refresh does not fix it.

### Password reset and change

#### FR-011

The system SHALL let a visitor request a password reset by email, and SHALL show the same "if an
account exists, we sent a link" message whether or not the email is registered.

#### FR-012

The system SHALL let a visitor who opens a valid reset link set a new password (entered twice,
checked against [NFR-002](#nfr-002)) and SHALL sign them in afterwards; an expired or used link
SHALL show the "expired or invalid link" page with a way to request a new one.

#### FR-013

The system SHALL let a signed-in investor change their password only after entering their current
password correctly, and SHALL reject a new password that breaks [NFR-002](#nfr-002) or does not
match its confirmation.

### API identity

#### FR-014

The API SHALL, when `AUTH_MODE=supabase`, accept a request on a non-public path only if it carries
a valid, unexpired Supabase access token (`Authorization: Bearer`) for a confirmed user, and SHALL
answer `401` (`application/problem+json`, code `unauthenticated`) otherwise.

#### FR-015

The API SHALL take the user id for every query from the verified token's subject (the Supabase
user id), so each investor reads and writes only rows carrying their own `user_id`.

#### FR-016

`GET /me` SHALL return the signed-in investor's user id and email, and the account menu SHALL show
that email instead of the placeholder user.

#### FR-017

The API SHALL keep `AUTH_MODE=mock` available in `development` and `test`, SHALL refuse it in
`production` (as today), and SHALL refuse to start in `supabase` mode without the settings it needs
to verify tokens.

## Non-Functional Requirements

### NFR-001

**Security — token verification** — The API verifies access tokens locally (signature, expiry,
issuer, audience) against Supabase's published signing keys, cached in memory; it never trusts a
user id sent in a body, query or custom header.

### NFR-002

**Security — password policy** — Passwords are 8 to 72 characters. The web app checks this before
submitting and Supabase Auth is configured to enforce the same minimum, so the API-side policy and
the form agree.

### NFR-003

**Security — brute force** — Sign-in, sign-up and email-sending endpoints are rate-limited by
Supabase Auth (project defaults or stricter); the web app shows a "too many attempts, try again
later" message when a limit is hit.

### NFR-004

**Privacy** — Passwords, access tokens, refresh tokens and email links never appear in API logs,
error responses, URLs kept in browser history after the auth callback is handled, or analytics.

### NFR-005

**Performance** — Token verification adds no more than 5 ms p95 to an API request once signing
keys are cached; no per-request network call to Supabase.

### NFR-006

**Accessibility** — All auth forms are usable by keyboard alone, every field has a visible label,
errors are announced (`role="alert"` or `aria-live`) and tied to their field (`aria-describedby`),
and text meets WCAG AA contrast.

### NFR-007

**Testability** — The API's auth is testable without the network: tests sign tokens with a local
test key and point the verifier at it. Email flows are testable end to end against local Supabase
(`supabase start`), whose emails go to its bundled Mailpit.

### NFR-008

**Cost** — Uses Supabase's free tier and a free or low-cost SMTP plan at single-user scale (brief
NFR-010).

## Constraints

- Stack is fixed (CLAUDE.md): Vite + React SPA, Fastify API, Supabase Postgres via Drizzle. Auth
  plugs in behind `IdentityResolver` in `apps/api/src/plugins/authenticate.ts`; routes and services
  do not change.
- The `app` schema stays unreachable through Supabase's Data API; the web app talks to Supabase only
  for auth, and to the Investhesis API for all data.
- Supabase's built-in email service sends at most 2 emails per hour, best effort. Production needs
  a custom SMTP provider ([OQ-1](#oq-1)); local development uses the CLI's Mailpit.
- Sign-in pages reuse the existing `/auth` routes and `AuthLayout` (`login-02`); the current
  `SignInForm` becomes the real form.
- UI copy is English only for now, like the rest of the app; Thai labels come with the i18n slice.

## Out of Scope

- Social or SSO sign-in (Google, Apple, GitHub), magic links, one-time codes, passkeys.
- Multi-factor authentication.
- Changing the account email, deleting the account, and profile fields such as display name.
- "Sign out everywhere" and listing active sessions.
- Idle-session timeouts and leaked-password checks (Supabase paid-plan features).
- Admin user management, roles, invitations, teams. The allowlist has no UI: the owner adds rows
  with SQL (documented in `supabase/README.md`).
- Custom-designed or Thai-language email templates (Supabase defaults with the app name).

## Open Questions

### OQ-1

Which SMTP provider sends production auth emails (e.g. Resend, Amazon SES, Mailtrap), and from
which sender address and domain? Needed before deploying, not before development.

### OQ-2

Are there rows under the current `MOCK_USER_ID` in any shared database that must move to the
owner's real Supabase user id? Stock Lists is not built yet, so the expected answer is "no".
