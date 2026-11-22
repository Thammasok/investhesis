---
version: 1.2
status: approved
date: 2026-11-23
supersedes: ../v1.1/requirements.md
source: owner request 2026-11-23 ("remove sign up feature; accounts are created by an admin, via Supabase only")
---

# Requirements: User Auth v1.2 (admin-created accounts, no self sign-up)

v1.0 made sign-up invite-only through an allowlist; v1.1 planned to open it. v1.2 goes the other
way: **there is no sign-up at all.** Public self-registration is removed from the web app and
switched off in Supabase Auth. The owner (admin) creates every account in Supabase (Studio or the
Admin API), and the investor only signs in.

v1.1 was never built, so it is superseded as a whole: open sign-up, the consent checkbox, the
consent record and the Terms/Privacy pages are dropped. This document lists only what changes.
Every v1.0 requirement not named here stays in force as written in
[v1.0/requirements.md](../v1.0/requirements.md).

## Decisions taken for this slice

Agreed with the owner on 2026-11-23.

- **Admin creates accounts in Supabase only.** No Investhesis admin screen, API route or role is
  added. The admin works in Supabase Studio ("Add user") or calls the Auth Admin API.
- **Self sign-up is disabled at the source.** Supabase Auth setting `enable_signup = false`
  (`config.toml` locally, the dashboard on hosted). The Admin API and Studio keep working.
- **The v1.0 allowlist is retired.** Its hook, table and `signup_not_allowed` behaviour go away
  because nothing needs them once sign-up is off.
- **The web removes the sign-up route and every link to it.** Sign-in, forgot/reset password,
  check email and the email-link pages stay.
- **No consent flow.** There is no sign-up moment to collect consent at, so v1.1's checkbox,
  `signup_consents` record and policy pages are not built.

## Actors

- **Admin** (new) — the owner. Creates accounts in Supabase Studio or with the service-role key.
  Not a role inside Investhesis: an investor cannot become an admin, and the web has no admin UI.
- **Visitor, Investor, Supabase Auth** — unchanged from
  [v1.0](../v1.0/requirements.md#actors), except that a Visitor can no longer sign up.

## Use Cases

### UC-010

**Admin creates an account** — The admin opens Supabase Studio, chooses Add user, enters the
investor's email and a password and marks the email as confirmed (or uses the Admin API with
`email_confirm: true`). The investor can sign in at once. This replaces v1.0
[UC-001](../v1.0/requirements.md#uc-001) and the sign-up step of
[UC-002](../v1.0/requirements.md#uc-002).

### UC-011

**Visitor looks for a way to register** — A visitor with no account opens the sign-in page and
finds no Create account link. If they open `/auth/sign-up` they land on the not-found page.

## Functional Requirements

### Account creation

#### FR-025

The web app SHALL NOT offer self-registration: no `/auth/sign-up` route, no sign-up form and no
"Create account" or "Sign up" link on any page. A request for `/auth/sign-up` SHALL show the
not-found page. This retires [FR-001](../v1.0/requirements.md#fr-001) and
[FR-009](../v1.0/requirements.md#fr-009)'s `/auth/sign-up` half.

#### FR-026

Supabase Auth SHALL refuse a public sign-up request (`POST /auth/v1/signup`) with no
`auth.users` row created and no email sent, whatever the email address. This retires the
allowlist rule [FR-018](../v1.0/requirements.md#fr-018).

#### FR-027

The admin SHALL be able to create a confirmed, ready-to-sign-in account through Supabase Studio or
the Auth Admin API, with no Investhesis code, and the account SHALL sign in with the password the
admin set. The steps, local and hosted, SHALL be documented in `supabase/README.md`.

#### FR-028

The system SHALL let a user who was created by the admin reset and change their password with the
existing flows ([FR-011](../v1.0/requirements.md#fr-011) to
[FR-013](../v1.0/requirements.md#fr-013)), so the admin does not need to know the password for
long. Password reset SHALL keep working while sign-up is disabled.

### Sign-in screens

#### FR-029

The sign-in page SHALL NOT mention sign-up. When an account is unconfirmed, the sign-in message
SHALL still offer to resend the confirmation email
([FR-002](../v1.0/requirements.md#fr-002)) for accounts the admin created without confirming
them.

### Admin operations

#### FR-030

Turning self sign-up back on SHALL need only a documented configuration step (no code change and
no migration), and existing accounts SHALL keep signing in either way.

## Non-Functional Requirements

### NFR-013

**Security (closed registration)** — A direct call to the Auth API's sign-up endpoint with a
valid email and password creates nothing and answers an error in every environment where the
migration is applied; no web code path is needed to enforce this.

### NFR-014

**Security (admin credentials)** — The service-role key and any admin password are never placed in
the web app, the API, a migration, the seed or the repository. Only `supabase/README.md`
describes how the admin uses them.

### NFR-015

**Regression** — Removing sign-up changes no behaviour of sign-in, sign-out, session refresh,
password reset, password change, or the API's token verification: their existing tests
([v1.0 test cases](../v1.0/test-cases.md)) stay green, with only the sign-up cases removed or
rewritten.

## Constraints

- Stack, Supabase Auth ownership and the `IdentityResolver` seam are unchanged
  ([v1.0 Constraints](../v1.0/requirements.md#constraints)).
- Tests and the E2E suite create their users through the Admin API (`adminCreateUser` in
  `scripts/lib/stack.ts`) already; they must keep doing so with sign-up disabled.
- Accounts that exist today stay valid. Self-registered accounts that never confirmed their email
  are not cleaned up by this slice ([OQ-6](#oq-6)).
- The `app` schema stays unreachable through Supabase's Data API.
- UI copy is English only.
- Existing tests that pin sign-up (TC-U-025b, TC-U-039 to TC-U-042, TC-C-027, TC-E-002, TC-E-003
  and related cases in `../v1.0/test-cases.md`) are removed with a stated reason or rewritten for
  the closed behaviour. They must not be skipped.

## Out of Scope

- Any Investhesis admin UI, admin API route, roles or user management screen.
- Email invitations through `inviteUserByEmail` and the set-password page they would need
  (decided in [OQ-7](#oq-7)).
- Terms of Service, Privacy Policy pages and consent records (dropped with v1.1).
- Account deletion, email change, MFA, social sign-in and the other v1.0 out-of-scope items.
- Bulk import of users.

## Open Questions

### OQ-1

Production SMTP provider (carried from v1.0). Still needed for password-reset email; less urgent
now that no sign-up mail is sent.

### OQ-6

Are there self-registered, unconfirmed accounts in any hosted project that the admin should
delete? Expected answer for the local stack: no.

### OQ-7

Resolved 2026-11-23: the admin sets a temporary password in Studio and shares it out of band; the
investor changes it with the existing change password flow ([FR-028](#fr-028)). Invite emails stay
out of scope.
