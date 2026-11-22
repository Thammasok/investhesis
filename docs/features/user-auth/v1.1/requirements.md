---
version: 1.1
status: superseded
date: 2026-11-22
supersedes: ../v1.0/requirements.md#fr-018
source: owner request 2026-11-22 ("unlock the sign-up allowlist to open sign-up")
---

# Requirements: User Auth v1.1 (open sign-up with consent)

v1.0 made sign-up invite-only through an email allowlist ([FR-018](../v1.0/requirements.md#fr-018),
ADR-009). v1.1 opens sign-up: anyone with an email address they can confirm can create an account,
after agreeing to the Terms of Service and the Privacy Policy.

This document lists only what changes. Every v1.0 requirement not named here stays in force as
written in [v1.0/requirements.md](../v1.0/requirements.md).

## Decisions taken for this slice

These were agreed with the owner on 2026-11-22.

- **Sign-up is open to any email address.** The account still has to confirm its email before it
  can sign in ([FR-002](../v1.0/requirements.md#fr-002) and
  [FR-004](../v1.0/requirements.md#fr-004) are unchanged).
- **No extra bot protection in v1.1.** Required email confirmation, the 60 s resend throttle and
  Supabase Auth's built-in rate limits are enough for now. CAPTCHA is deferred.
- **No new per-user limits.** The existing Stock Lists import caps (1 MB upload, 1,000 rows) stay
  as they are. The remaining XLSX decompression risk that ADR-009 cited is accepted and recorded
  in the design.
- **Sign-up needs consent.** A required checkbox accepts the Terms of Service and the Privacy
  Policy, and the system stores when the user accepted and which policy version they accepted.
  The policy pages show placeholder text until the owner supplies the legal text.

## Actors

Unchanged from [v1.0](../v1.0/requirements.md#actors). A **Visitor** is now anyone on the internet,
not only an allowlisted person.

## Use Cases

### UC-008

**Open sign-up** — A visitor opens Sign up, enters an email address and a password twice, ticks
"I agree to the Terms of Service and Privacy Policy", and submits. They see Check your email,
open the confirmation link and are signed in. This replaces the allowlist check in v1.0
[UC-001](../v1.0/requirements.md#uc-001).

### UC-009

**Read the policies** — A visitor or an investor opens the Terms of Service or the Privacy Policy
from the sign-up form or from the auth page footer and reads it without signing in.

## Functional Requirements

### Sign-up

#### FR-019

The system SHALL create an account for any syntactically valid email address that passes
[FR-001](../v1.0/requirements.md#fr-001) and [FR-020](#fr-020), with no allowlist check. This
retires [FR-018](../v1.0/requirements.md#fr-018).

#### FR-020

The sign-up form SHALL contain a required, unticked-by-default checkbox labelled "I agree to the
Terms of Service and Privacy Policy", where both names are links to the policy pages of
[FR-022](#fr-022). Submitting with the checkbox unticked SHALL show an error on that checkbox
and SHALL NOT call Supabase.

#### FR-021

The system SHALL record, for every account created from v1.1 on, the time the policies were
accepted and the version identifier of the policies accepted. The record SHALL be checked on the
server side: Supabase Auth SHALL refuse to create an account whose sign-up request does not carry
an accepted policy version equal to the current one, and the web SHALL show "The terms have
changed. Reload the page and try again." for that refusal.

#### FR-022

The system SHALL serve two public pages, Terms of Service and Privacy Policy, reachable without a
session, each showing its policy version and effective date. Until the owner supplies the legal
text, each page SHALL show placeholder text stating that the final text is pending.

#### FR-023

The system SHALL no longer show the invite-only message "Sign-up is invite-only. Ask the owner to
add this email." anywhere. [FR-003](../v1.0/requirements.md#fr-003) now applies to every sign-up:
a new and an already registered email both lead to the same Check your email screen.

### Owner operations

#### FR-024

The owner SHALL be able to return sign-up to invite-only without a code change, by a documented
configuration step in `supabase/README.md` (local and hosted). Re-locking SHALL NOT delete or
block existing accounts.

## Non-Functional Requirements

### NFR-009

**Privacy (enumeration)** — The sign-up response SHALL NOT reveal whether an email already has an
account: the status, body shape and screen are the same for new and registered emails, as in
[NFR-005](../v1.0/requirements.md#nfr-005).

### NFR-010

**Integrity** — A consent record SHALL exist for 100 % of accounts created through sign-up from
v1.1 on. An account created through the public Auth API without a valid consent version SHALL be
refused with no `auth.users` row and no email sent.

### NFR-011

**Accessibility** — The consent checkbox and its error meet WCAG 2.1 AA: it can be reached and
toggled with the keyboard, it has a programmatic label, the error is announced and linked with
`aria-describedby`, the links are distinguishable from the label text, and text contrast is at
least 4.5:1 in light and dark mode.

### NFR-012

**Responsiveness** — The sign-up form and both policy pages render without horizontal scrolling at
360 px width.

## Constraints

- Stack, Supabase Auth ownership and the `IdentityResolver` seam are unchanged
  ([v1.0 Constraints](../v1.0/requirements.md#constraints)).
- Accounts that exist before v1.1 (the owner's and test accounts) have no consent record and are
  not asked to accept in v1.1.
- The `app` schema stays unreachable through Supabase's Data API.
- UI copy, including the policy placeholders, is English only, like the rest of the app.
- Existing tests that pin the allowlist (TC-U-025b, TC-U-039 to TC-U-042, TC-C-027, TC-E-002,
  TC-E-003 and related cases in `../v1.0/test-cases.md`) are retired or rewritten for open
  sign-up. They must not be skipped.

## Out of Scope

- CAPTCHA (Turnstile, hCaptcha) and other bot protection beyond Supabase defaults.
- Per-user API rate limits and quotas on stocks, lists or imports.
- Blocklists of emails or disposable-email domains.
- Asking existing users to accept, or re-accept after a policy version change.
- Writing the legal text of the Terms of Service and Privacy Policy.
- Account deletion and data export on request (PDPA data-subject rights), still out of scope as in
  v1.0.
- Social sign-in, MFA and the other v1.0 out-of-scope items.

## Open Questions

### OQ-3

Who writes the Terms of Service and Privacy Policy text, and what controller name and contact
address do they name? Needed before a public launch, not before development.

### OQ-4

When the policy version changes later, must existing users re-accept at their next sign-in? v1.1
only records the version, so that a later slice can add re-acceptance.

### OQ-5

PDPA asks for a way to withdraw consent and delete an account. Should account deletion be the next
user-auth slice before a public launch? (Still deferred as in v1.0.)

OQ-1 (production SMTP provider) from v1.0 is still open, and it matters more now: with public
sign-up, Supabase's built-in mailer (2 emails per hour) would block real users.
