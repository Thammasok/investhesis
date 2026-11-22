---
version: 1.1
status: superseded
date: 2026-11-22
requires: design.md
extends: ../v1.0/ux-design.md
---

# UX/UI Design: User Auth v1.1 (open sign-up with consent)

There are still no mockups for Investhesis. v1.1 changes one existing screen (Sign up), adds a
footer to `AuthLayout`, and adds two public pages that reuse the auth look. Everything in
[v1.0 › Shared patterns](../v1.0/ux-design.md#shared-patterns) applies unchanged: heading block,
field errors, form-level `Alert`, submitting state, secondary links. No new colours, radii, fonts
or shadcn components (`checkbox`, `field`, `alert`, `separator` are already installed).

## Screens in Scope

- **Sign up** (changed) — `/auth/sign-up`: adds the consent checkbox and new error copy
  ([UC-008](requirements.md#uc-008), [FR-020](requirements.md#fr-020),
  [FR-021](requirements.md#fr-021), [FR-023](requirements.md#fr-023)).
- **Auth footer** (new, every `/auth/*` page) — Terms and Privacy links
  ([UC-009](requirements.md#uc-009)).
- **Terms of Service** (new) — `/terms` ([FR-022](requirements.md#fr-022)).
- **Privacy Policy** (new) — `/privacy` ([FR-022](requirements.md#fr-022)).

Unchanged and not re-specified: Sign in, Check your email, Confirming, Link expired, Forgot
password, Set a new password, Account, Account menu
([v1.0 wireframes](../v1.0/ux-design.md#lo-fi-wireframes)).

## Lo-fi Wireframes

### Sign up

<pre>
┌───────────────────────────────┐
│     Create your account       │
│ Enter your email and choose a │
│          password             │
│                               │
│ Email                         │
│ [ you@example.com           ] │
│ Password                      │
│ [ ••••••••              (👁) ] │
│ At least 8 characters.        │
│ Confirm password              │
│ [ ••••••••              (👁) ] │
│                               │
│ [ ] I agree to the Terms of   │  ← Checkbox + label; "Terms of Service" and
│     Service and Privacy       │    "Privacy Policy" are links (new tab)
│     Policy.                   │
│                               │
│ [       Create account      ] │
│                               │
│ Already have an account?      │
│            Sign in            │
│ ───────────────────────────── │
│      Terms  ·  Privacy        │  ← AuthLayout footer (every /auth page)
└───────────────────────────────┘
</pre>

Error: submitted without consent

<pre>
│ [!] I agree to the Terms of   │  ← checkbox aria-invalid (destructive border + ring)
│     Service and Privacy       │
│     Policy.                   │
│ ⚠ Agree to the Terms of       │  ← FieldError, id="consent-error"
│   Service and Privacy Policy  │
│   to create an account.       │
</pre>

Error: stale policy version (server)

<pre>
│ ┌───────────────────────────┐ │
│ │ ⓘ The terms have changed. │ │  ← Alert destructive, top of form, focused
│ │ Reload the page and try   │ │
│ │ again.  [Reload page]     │ │  ← Button link/sm → window.location.reload()
│ └───────────────────────────┘ │
</pre>

Error: invite mode refuses (owner re-locked, [FR-024](requirements.md#fr-024))

<pre>
│ ┌───────────────────────────┐ │
│ │ ⓘ Sign-up is closed right │ │  ← Alert destructive, top of form, focused
│ │ now. Try again later.     │ │
│ └───────────────────────────┘ │
</pre>

- **Layout notes** — the consent field sits between Confirm password and the submit button, so
  agreeing is the last step before submitting. It is a horizontal `Field`: checkbox on the left
  and label text wrapping beside it.
- **User flow** —
  - Submit runs the client checks in field order: password, confirm, consent. All errors show
    together, and focus goes to the first invalid control. The checkbox counts as invalid only when
    it is unticked. When any check fails, nothing is sent.
  - A valid submit → `signUp(email, password, { termsVersion })` → Check your email (unchanged;
    the same screen for new and registered emails, [FR-023](requirements.md#fr-023)).
  - `terms_outdated` → alert with Reload page. `signup_not_allowed` → "closed" alert (focus on
    the alert, no longer on Email). `weak_password`, `rate_limited` and `unavailable` behave as in
    v1.0.
  - Ticking the checkbox clears its error straight away. Password errors still clear only on the
    next submit (v1.0 behaviour).
- **Annotations** —
  - The checkbox is unticked on every visit and is never pre-ticked or remembered.
  - Clicking the label text ticks the box, but clicking a link inside the label only opens that
    policy (the link click does not toggle the box).
  - The links open in a new tab ([ADR-014](design.md#key-decisions)), so the form keeps what the
    user typed.
  - After a failed server call the box stays ticked, like the passwords.

### Auth footer

<pre>
 form column (AuthLayout, left half from lg)
┌───────────────────────────────┐
│ ▣ Investhesis                 │
│                               │
│          (page form)          │
│                               │
│      Terms  ·  Privacy        │  ← footer at the bottom of the column, centred
└───────────────────────────────┘
</pre>

- **Layout notes** — a `footer` after `main` in the form column, so it sits at the bottom of the
  viewport on tall screens and after the form on short ones. It is centred on all sizes, and from
  `md` it is left-aligned like the logo.
- **Annotations** — these links open in the same tab, because a footer link is a deliberate move
  away from the page. A `nav` with `aria-label="Legal"`.

### Terms of Service / Privacy Policy

Both pages share one layout; only the title and body differ.

<pre>
┌──────────────────────────────────────────────┐
│ ▣ Investhesis                                │  ← logo link: /stocks when signed in,
│                                              │    /auth/sign-in when signed out
│  Terms of Service                            │  ← h1, focused on load
│  Version 2026-11-22 · Effective 22 Nov 2026  │  ← text-sm muted
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │ ⓘ Draft. The final text of these     │    │  ← Alert default (InfoIcon), placeholder
│  │ terms is pending.                    │    │    notice (OQ-3)
│  └──────────────────────────────────────┘    │
│                                              │
│  1. Your account                             │  ← h2 sections, placeholder paragraphs
│  Lorem-free placeholder sentence…            │    (plain English, no lorem ipsum)
│  2. Your data                                │
│  …                                           │
│                                              │
│  ──────────────────────────────────────────  │
│  Terms  ·  Privacy                           │  ← same footer nav; current page
│                                              │    aria-current="page", not underlined
└──────────────────────────────────────────────┘
</pre>

- **Layout notes** — one reading column `max-w-prose`, centred, with page padding `p-6
  md:p-10`. There is no sidebar and no decorative panel, so the same page works signed in and
  signed out.
- **User flow** — direct visit, a footer link or a sign-up link (new tab) → page. The logo goes
  back. There is no session check, so the page renders at once.
- **Annotations** — the placeholder bodies use short headed sections the real text will probably
  keep:
  - Terms: Your account, Acceptable use, Your data, Changes to these terms, Contact.
  - Privacy: What we collect, Why we use it, Who we share it with (stating that holdings and cost
    basis never go to third parties), How long we keep it, Your rights, Contact.

  Each section is one sentence saying what it will cover. These pages are the only place where the
  version and effective date (`POLICY`) appear.

## Hi-fi Component Specs

### Sign up — consent field

#### Layout

- **Wrapper** — `Field orientation="horizontal" data-invalid={consentError || undefined}` placed
  after the Confirm password `Field`, before the submit `Field`.
- **Responsive** — the same at every width. The label wraps beside the checkbox inside
  `max-w-xs`, and at 360 px it wraps to three lines with nothing clipped
  ([NFR-012](requirements.md#nfr-012)).

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Consent field | `Field` | `orientation="horizontal"` | `items-start` | default, invalid (`data-invalid`) |
| Checkbox | `Checkbox` | default | `mt-0.5` (aligns with the first text line); `id="consent"`, `name="consent"`, `aria-invalid`, `aria-describedby="consent-error"` when invalid | unchecked, checked (`data-checked` → `bg-primary`), focus-visible (`ring-ring/50`), invalid (`border-destructive ring-destructive/20`), disabled — never disabled |
| Label | `FieldLabel htmlFor="consent"` | — | `text-sm font-normal leading-snug` (body weight: a sentence, not a field name) | — |
| Policy links (×2) | — (`Link to="/terms"`, `to="/privacy"`) | — | `underline underline-offset-4 hover:text-primary`; `target="_blank" rel="noopener noreferrer"`; visually hidden `<span className="sr-only"> (opens in a new tab)</span>` | default, hover, focus-visible ring |
| Consent error | `FieldError id="consent-error"` | — | default (`text-sm text-destructive`) | shown when unticked on submit |
| `terms_outdated` alert | `Alert` | `destructive` | existing form-alert slot; contains `AlertDescription` + `Button variant="link" size="sm" className="h-auto p-0"` "Reload page" | — |
| `signup_not_allowed` alert | `Alert` | `destructive` | existing form-alert slot | — |

Copy:

| Key | Text |
|---|---|
| Label | "I agree to the {Terms of Service} and {Privacy Policy}." |
| Consent error | "Agree to the Terms of Service and Privacy Policy to create an account." |
| `terms_outdated` | "The terms have changed. Reload the page and try again." + button "Reload page" |
| `signup_not_allowed` | "Sign-up is closed right now. Try again later." |

#### Accessibility

- **Contrast** — the label and links use `foreground` on `background` (≈ 18:1). Links are told
  apart by underline as well as colour. `FieldError` is `text-destructive text-sm`, the same as
  the v1.0 password errors. The checkbox border (`input`) against `background` passes 3:1
  non-text contrast in light and dark mode; an E2E computed-contrast check covers it
  (`e2e/lib/contrast.ts`).
- **ARIA roles** — native checkbox semantics from Radix (`role="checkbox"`, `aria-checked`). The
  label is tied by `htmlFor`. When invalid it has `aria-invalid="true"` and `aria-describedby`
  pointing at the error. The error is announced because focus moves to the checkbox, so no live
  region is added. Form alerts keep `role="alert"`.
- **Keyboard navigation** — Tab order: Email → Password → toggle → Confirm → toggle → Checkbox
  → Terms link → Privacy link → Create account → Sign in → footer Terms → footer Privacy.
  Space toggles the checkbox, and Enter in a text field submits the form. The links inside the
  label are separate tab stops, and pressing Enter on one opens it without toggling the box.

### Auth footer

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Footer | — (`footer` > `nav aria-label="Legal"`) | — | `flex justify-center gap-2 text-sm text-muted-foreground md:justify-start` | — |
| Link (×2) | — (`Link`) | — | `underline-offset-4 hover:underline hover:text-foreground` | default, hover, focus-visible ring, current (`aria-current="page"`, `text-foreground`) |
| Separator dot | — (`span aria-hidden`) | — | — | — |

The `PolicyLayout` reuses this footer component (`LegalFooter`, in `components/layout/`).

#### Accessibility

- **Contrast** — `muted-foreground` on `background` ≈ 4.8:1 at `text-sm` (AA). The links have
  no underline at rest, but they are the only content of a nav labelled "Legal", so they read as
  links; the hover underline and focus ring confirm it.
- **Keyboard navigation** — the last tab stops of every auth page.

### Terms of Service / Privacy Policy

#### Layout

- **Wrapper** — `PolicyLayout`: `div.min-h-svh.flex.flex-col.p-6.md:p-10` → header (logo link,
  the same markup as `AuthLayout`) → `main.mx-auto.w-full.max-w-prose.flex-1.py-8` → `article` →
  `LegalFooter` (`mx-auto w-full max-w-prose border-t pt-4`).
- **Responsive** — a single column at all widths. `max-w-prose` (~65 ch) caps the line length,
  with no horizontal scroll at 360 px ([NFR-012](requirements.md#nfr-012)).

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Title | — (`h1`, via the `PageHeading` pattern: sets `document.title` "Terms of Service · Investhesis", focused) | — | `text-2xl font-bold outline-none` | programmatic focus |
| Version line | — (`p`) | — | `text-sm text-muted-foreground`; date formatted `d MMM yyyy` in `en-GB` | — |
| Draft notice | `Alert` | `default` | `mt-6`; `InfoIcon`; `role="status"` is not needed (static content) | — |
| Section heading | — (`h2`) | — | `mt-8 text-lg font-semibold` | — |
| Body | — (`p`) | — | `mt-2 text-sm leading-relaxed` | — |
| Logo link | — (`Link`) | — | as `AuthLayout` | hover, focus |

#### Accessibility

- **Contrast** — body text uses `foreground` on `background` (≈ 18:1), and the version line uses
  `muted-foreground` (≈ 4.8:1).
- **ARIA roles** — `main` landmark, one `h1`, and `h2` sections in order. The footer nav is
  labelled "Legal", and the current page's link has `aria-current="page"`.
- **Keyboard navigation** — logo → footer links. There are no interactive controls in the
  article.

## Design Review

### Heuristics (Nielsen)

| # | Heuristic | Issues Found | Score (1–4) | Resolution |
|---|-----------|--------------|-------------|------------|
| 1 | Visibility of system status | A stale-version refusal could look like a random error | 2 | A specific message plus a Reload page button |
| 3 | User control and freedom | Reading the terms could lose the half-filled form | 2 | Sign-up links open in a new tab ([ADR-014](design.md#key-decisions)) |
| 4 | Consistency and standards | A new error style for a checkbox | 1 | The same `Field` / `FieldError` / focus-first-invalid pattern as the password fields |
| 5 | Error prevention | Submitting without agreeing | 1 | Checked on the client before any call; the server check is a backstop |
| 8 | Aesthetic and minimalist design | Legal text could crowd the form | 1 | One sentence with two links; the full text lives on its own pages |
| 9 | Help users recover from errors | "Closed" gives no next step | 2 | "Try again later" is honest while the owner has paused sign-up; no fake invite path ([ADR-013](design.md#key-decisions)) |
| 10 | Help and documentation | The draft status of the policies is unclear | 2 | A draft notice on both pages until [OQ-3](requirements.md#oq-3) is answered |

No issue scores 3 or 4.

### Accessibility Audit

- **WCAG AA** — every pair above passes. The checkbox's non-text contrast and focus ring are
  checked by the E2E contrast helper in light and dark mode. Policy links are underlined.
- **Keyboard flow** — confirmed for Sign up (checkbox and links in DOM order, Space toggles,
  Enter on a link does not toggle) and for both policy pages. No traps. Axe runs on Sign up
  (default and consent-error states), Terms and Privacy in the E2E a11y suite, at desktop size
  and at 360 px.
