---
version: 1.0
status: approved
date: 2026-11-21
requires: design.md
---

# UX/UI Design: User Auth (email + password)

There are no mockups for Investhesis, so every auth screen builds on the existing `AuthLayout`
(shadcn `login-02`: form column on the left, decorative panel from `lg`, content `max-w-xs`) and
the existing `SignInForm` look: centred `h1` (`text-2xl font-bold`) and `text-sm
text-muted-foreground` lead, `FieldGroup` of `Field`s, full-width primary `Button`. The signed-in
Account page uses the `AppLayout` page patterns from
[Stock Lists](../../stock-lists/v1.0/ux-design.md#shared-patterns). No new colours, radii or fonts.

New shadcn component: `alert` (`pnpm dlx shadcn@latest add alert` in `apps/web`, then check the
`@/lib/utils` import). If Stock Lists already added it, nothing to do.

## Screens in Scope

- **Sign in** — `/auth/sign-in`: email + password, links to sign-up and forgot-password ([UC-003](requirements.md#uc-003), [FR-005](requirements.md#fr-005), [FR-008](requirements.md#fr-008)).
- **Sign up** — `/auth/sign-up`: email, password, confirm password ([UC-001](requirements.md#uc-001), [FR-001](requirements.md#fr-001)).
- **Check your email** — `/auth/check-email`: after sign-up and after a resend ([FR-002](requirements.md#fr-002), [FR-003](requirements.md#fr-003)).
- **Confirming** — `/auth/confirm`: transient state while the email link is verified ([FR-004](requirements.md#fr-004)).
- **Link expired** — `/auth/link-expired`: invalid, used or expired link ([FR-004](requirements.md#fr-004), [FR-012](requirements.md#fr-012)).
- **Forgot password** — `/auth/forgot-password`: request a reset link, then a sent state ([UC-005](requirements.md#uc-005), [FR-011](requirements.md#fr-011)).
- **Set a new password** — `/auth/reset-password`: after a recovery link ([FR-012](requirements.md#fr-012)).
- **Account** — `/account`: change password inside the app shell ([UC-006](requirements.md#uc-006), [FR-013](requirements.md#fr-013)).
- **Account menu** — sidebar `NavUser`: real email, Account enabled, working Sign out ([FR-007](requirements.md#fr-007), [FR-016](requirements.md#fr-016)).

## Shared patterns

These apply to every auth screen and are not repeated per screen.

- **Heading block** — centred `h1` (`text-2xl font-bold`, `tabIndex={-1}`, focused on route
  change) and one `p` lead (`text-sm text-balance text-muted-foreground`). `document.title` is
  `"<Title> · Investhesis"`.
- **Fields** — `Field` > `FieldLabel` + `Input className="bg-background"`; email inputs use
  `type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false}`.
  Native `required` stays; our own checks run on submit and show in `FieldError`.
- **Password input** — `PasswordInput` (new, in `features/auth/components/`): `Input` with a
  trailing `Button variant="ghost" size="icon-sm"` toggling visibility (`EyeIcon` / `EyeOffIcon`,
  `aria-label="Show password"` / `"Hide password"`, `aria-pressed`, `type="button"`). Toggling never
  moves focus. `autoComplete` is `current-password` on sign-in and for the current password,
  `new-password` elsewhere.
- **Password rules** — on new-password fields, `FieldDescription` "At least 8 characters." Checks
  on submit, in this order: empty → "Enter a password."; < 8 → "Use at least 8 characters."; > 72 →
  "Use 72 characters or fewer."; confirm differs → on the confirm field, "Passwords don't match."
  ([NFR-002](requirements.md#nfr-002)). No strength meter.
- **Field errors** — `Field data-invalid`, control `aria-invalid` and `aria-describedby` →
  `FieldError`. After a failed submit, focus moves to the first invalid field.
- **Form-level messages** — `Alert` at the top of the form (`role="alert"`): `variant="destructive"`
  for errors (`invalid_credentials`, `signup_not_allowed`, `rate_limited`, `unavailable`, `unknown`), default variant
  with `InfoIcon` for notices (e.g. "Your session has ended. Sign in again."). Copy per code is in
  [design.md › Error mapping](design.md#error-mapping).
- **Submitting** — the submit button shows `Loader2Icon animate-spin` before its label, gets
  `disabled` and `aria-busy="true"`; inputs stay editable but a second submit is ignored. Labels
  change to the -ing form ("Signing in…", "Creating account…", "Sending…", "Saving…").
- **Secondary links** — `text-sm`, `underline underline-offset-4` (hover: `text-primary`), React
  Router `Link`. Centred under the submit button in a `FieldDescription className="text-center"`.
- **Resend** — `Button variant="link"` (`h-auto p-0`) with a 60-second cooldown after each send,
  matching Supabase's `max_frequency`: while cooling down it is `disabled` and reads "Resend in
  42s" (updated every second, announced only on start/end via a polite live region).
- **Emails in the URL** — never. The check-email and link-expired pages receive the email via
  router `state`; after a reload it is gone and the page asks for it in a field instead.

## Lo-fi Wireframes

All auth screens sit in the `AuthLayout` form column; the panel on the right (from `lg`) is
unchanged and omitted below.

### Sign in

```
┌───────────────────────────────┐
│ [▲] Investhesis               │
│                               │
│    Sign in to your account    │
│  Enter your email and password│
│                               │
│ ┌ ⓘ Your session has ended. ┐ │  ← only when sent here by a 401 / sign-out elsewhere
│ └  Sign in again.           ┘ │
│ ┌ ⚠ Email or password is    ┐ │  ← after a failed submit
│ └  incorrect.               ┘ │
│ Email                         │
│ [ you@example.com           ] │
│ Password      Forgot password?│
│ [ ••••••••              (👁) ] │
│ [         Sign in           ] │
│                               │
│ Don't have an account? Sign up│
└───────────────────────────────┘
```

- **Layout notes** — "Forgot password?" sits on the label row, right-aligned (`ml-auto text-sm`),
  as in the `login-02` block. The old "isn't connected yet" description is removed.
- **User flow** — submit → success → `navigate(safeNext(next), { replace: true })`. Error
  `invalid_credentials` → alert, password cleared, focus to password. `email_not_confirmed` →
  alert "Confirm your email first. We sent a link to you@example.com." with a Resend link
  (cooldown rules); resend success → navigate to Check your email.
- **Annotations** — the `next` query param is carried into the Sign up and Forgot links so it
  survives a detour. The session-ended notice comes from router `state.reason = 'session_ended'`.

### Sign up

```
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
│ ⚠ Passwords don't match.      │  ← FieldError
│ [       Create account      ] │
│                               │
│ Already have an account?      │
│            Sign in            │
└───────────────────────────────┘
```

- **User flow** — submit → client checks → `signUp` → navigate to Check your email (state:
  email). `user_already_exists` goes the same way ([FR-003](requirements.md#fr-003)).
  `signup_not_allowed` → destructive alert "Sign-up is invite-only. Ask the owner to add this
  email.", focus to Email, passwords kept ([FR-018](requirements.md#fr-018)).
  `weak_password` → FieldError on Password. `rate_limited` / `unavailable` → destructive alert.
- **Annotations** — passwords are kept on a failed server call (so the user needn't retype) but
  cleared after navigation.

### Check your email

```
┌───────────────────────────────┐
│          ( ✉ )                │
│      Check your email         │
│ We sent a confirmation link to│
│      you@example.com.         │
│ Open it to finish signing up. │
│ The link works once and       │
│ expires in 1 hour.            │
│                               │
│ Didn't get it? Check spam, or │
│      Resend email             │  ← link button, 60 s cooldown
│                               │
│        Back to sign in        │
└───────────────────────────────┘
 (no email in state, e.g. after reload)
│ Email [ you@example.com     ] │
│ [      Resend email         ] │
```

- **User flow** — Resend → `resendConfirmation` → inline `text-sm` confirmation "Sent again."
  (`role="status"`) and cooldown. A rate-limit result shows the destructive alert instead.
- **Annotations** — the icon is decorative (`MailIcon` in a `size-12 rounded-full bg-muted`
  circle, `aria-hidden`).

### Confirming

```
┌───────────────────────────────┐
│           ( ◌ )               │  ← Loader2Icon, animate-spin
│    Confirming your email…     │
└───────────────────────────────┘
```

- **Layout notes** — rendered by the route's `HydrateFallback`/pending UI while the loader calls
  `verifyOtp`; usually visible for well under a second. Recovery links read "Checking your link…".
- **User flow** — valid `email` link → `/stocks` (or safe `next`) with a `sonner` toast "Email
  confirmed. Welcome to Investhesis." Valid `recovery` link → Set a new password. Invalid →
  Link expired (state: `type`).

### Link expired

```
┌───────────────────────────────┐
│          ( ⚠ )                │
│  This link has expired or was │
│       already used            │
│ Links work once and expire    │
│ after 1 hour.                 │
│                               │
│ Email                         │
│ [ you@example.com           ] │
│ [   Send a new link         ] │
│                               │
│        Back to sign in        │
└───────────────────────────────┘
```

- **User flow** — for a confirmation link, "Send a new link" calls `resendConfirmation` → Check
  your email. For a recovery link it calls `requestPasswordReset` → Forgot password's sent state.
  If the type is unknown (malformed link), it shows two buttons: "Resend confirmation" (outline)
  and "Reset password" (outline), both using the email field.
- **Annotations** — if the visitor already has a session (e.g. they confirmed in another tab), the
  page shows "You're already signed in." with a "Go to Stocks" button instead of the form.

### Forgot password

```
 request state                     sent state
┌───────────────────────────────┐ ┌───────────────────────────────┐
│     Reset your password       │ │          ( ✉ )                │
│ Enter your account's email and│ │      Check your email         │
│ we'll send you a reset link.  │ │ If an account exists for      │
│                               │ │ you@example.com, we sent a    │
│ Email                         │ │ link to reset its password.   │
│ [ you@example.com           ] │ │ It expires in 1 hour.         │
│ [     Send reset link       ] │ │                               │
│                               │ │ Didn't get it? Resend email   │
│        Back to sign in        │ │        Back to sign in        │
└───────────────────────────────┘ └───────────────────────────────┘
```

- **User flow** — submit → always the sent state unless `rate_limited` / `unavailable`
  ([FR-011](requirements.md#fr-011)). The email field is prefilled from sign-in's field when the
  user came via "Forgot password?" (router state, not URL).
- **Annotations** — sent state replaces the form in place (same route); focus moves to its `h1`.

### Set a new password

```
┌───────────────────────────────┐
│    Choose a new password      │
│ For you@example.com           │
│                               │
│ New password                  │
│ [ ••••••••              (👁) ] │
│ At least 8 characters.        │
│ Confirm new password          │
│ [ ••••••••              (👁) ] │
│ [      Save password        ] │
└───────────────────────────────┘
```

- **User flow** — submit → `setNewPassword` → `/stocks` with toast "Password updated. You're
  signed in." `same_password` → FieldError on New password. Session missing or expired on load or
  submit → Link expired (type `recovery`).
- **Annotations** — no "Back to sign in" link: the user already holds a recovery session, and
  leaving keeps them signed in. The email under the title comes from the session.

### Account

```
┌ Sidebar ┬─ ☰ │ Account ───────────────────────────────────────────────┐
│         │ Account                                                    │
│         │ Signed in as you@example.com                               │
│         │                                                            │
│         │ ┌ Change password ───────────────────────────────┐         │
│         │ │ Use at least 8 characters.                     │         │
│         │ │ Current password  [ ••••••          (👁) ]     │         │
│         │ │ New password      [ ••••••          (👁) ]     │         │
│         │ │ Confirm new       [ ••••••          (👁) ]     │         │
│         │ │                          [ Change password ]   │         │
│         │ └────────────────────────────────────────────────┘         │
└─────────┴────────────────────────────────────────────────────────────┘
```

- **Layout notes** — page header per Stock Lists shared patterns; one `Card` (`max-w-lg`) with the
  form. Labels stack above inputs at every width (the side-by-side sketch is only for brevity).
- **User flow** — submit → `changePassword` → toast "Password changed.", all three fields cleared,
  focus to Current password. `wrong_current_password` → FieldError on Current password, that field
  cleared and focused. `same_password` / `weak_password` → FieldError on New password. 401 during
  submit → api-client/auth flow sends the user to sign-in with the session-ended notice.

### Account menu

```
┌────────────────────────────┐
│ (YO) you@example.com       │   ← trigger: initials from the email's local part
├────────────────────────────┤
│ 👤 Account                 │   → /account
├────────────────────────────┤
│ ⎋ Sign out                 │   → signOut(), then /auth/sign-in
└────────────────────────────┘
```

- **Layout notes** — `SidebarUser` gets `name` = email (no display name in v1,
  [design.md](design.md#key-decisions) ADR-004), so `UserSummary` shows the email on the first line
  and hides the second line when it would repeat. Initials: first two letters of the email's local
  part, upper-cased.
- **User flow** — Sign out: menu closes, item shows nothing extra (the call is local and instant),
  then `navigate('/auth/sign-in', { replace: true })`. No confirm dialog: signing out is easy to
  undo.

## Hi-fi Component Specs

### Auth pages (Sign in, Sign up, Check your email, Confirming, Link expired, Forgot password, Set a new password)

#### Layout

- **Wrapper** — existing `AuthLayout`; each page renders a `form` (or `div` for status pages)
  `className="flex flex-col gap-6"` containing a `FieldGroup`.
- **Status icon** (check-email, link-expired, confirming, sent) —
  `div.mx-auto.flex.size-12.items-center.justify-center.rounded-full.bg-muted` with a `size-6`
  lucide icon (`MailIcon`, `TriangleAlertIcon`, `Loader2Icon animate-spin`), `aria-hidden`.
- **Responsive** — single column at all sizes (`max-w-xs` from `AuthLayout`); from `lg` the
  decorative panel appears on the right. Below `md` the page padding is `p-6`, above `md:p-10`
  (existing).

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Page title | — (`h1`) | — | `text-2xl font-bold text-center outline-none` | focus (programmatic, no ring) |
| Lead text | — (`p`) | — | `text-sm text-balance text-muted-foreground text-center` | — |
| Email input | `Input` | default | `bg-background` | default, focus (`ring-ring/50`), invalid (`aria-invalid` → `border-destructive ring-destructive/20`), disabled |
| Password input | `PasswordInput` (`Input` + `Button`) | input default; toggle `ghost` / `icon-sm` | wrapper `relative`; input `bg-background pr-9`; toggle `absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground` | default, focus, invalid, toggle pressed |
| Password hint | `FieldDescription` | — | default | — |
| Field error | `FieldError` | — | default (`text-destructive text-sm`) | shown when invalid |
| Form error | `Alert` | `destructive` | `role="alert"`; `CircleAlertIcon` | — |
| Notice | `Alert` | `default` | `role="status"`; `InfoIcon` | — |
| Submit | `Button` | `default` / `default` | `w-full` (via `Field`) | default, hover, focus-visible ring, disabled + spinner while submitting |
| Secondary action (two-option link-expired) | `Button` | `outline` / `default` | `w-full` | default, hover, focus, disabled |
| Forgot password link | — (`Link`) | — | `ml-auto text-sm underline-offset-4 hover:underline` | hover, focus-visible ring |
| Footer links | `FieldDescription` + `Link` | — | `text-center`; link `underline underline-offset-4 hover:text-primary` | hover, focus |
| Resend | `Button` | `link` / `sm` | `h-auto p-0` | default, hover, focus, disabled (cooldown) |
| Resent confirmation | — (`p`) | — | `text-sm text-muted-foreground`, `role="status"` | — |

#### Accessibility

- **Contrast** — `foreground` on `background` ≈ 18:1; `muted-foreground` on `background` ≈ 4.8:1
  (AA for `text-sm`); `primary-foreground` on `primary` ≈ 17:1; `destructive` text on `background`
  ≈ 4.6:1 (light) — keep `FieldError` at `text-sm` regular or larger, never `text-xs`. No
  `muted-foreground` on `bg-muted` (the status icon is decorative).
- **ARIA roles** — form errors `role="alert"`; notices, resend confirmation and cooldown start/end
  `role="status"` (`aria-live="polite"`); invalid controls `aria-invalid="true"` +
  `aria-describedby` (hint and error ids); submitting buttons `aria-busy`; password toggle
  `aria-pressed` + `aria-controls` the input; decorative icons `aria-hidden`.
- **Keyboard navigation** — tab order follows visual order: Email → (Forgot password? on sign-in)
  → Password → visibility toggle → Submit → footer links. Enter submits from any field. Focus
  starts on the `h1` after navigation so screen readers announce the page; after a failed submit,
  on the first invalid field (or the alert when the error is form-level, e.g.
  `invalid_credentials` focuses the password field). No focus traps.

### Account

#### Layout

- **Wrapper** — `AppLayout` page: header block (`h1` "Account", `p.text-sm.text-muted-foreground`
  "Signed in as …"), then `Card className="max-w-lg"` with `CardHeader` (`CardTitle` "Change
  password", `CardDescription` "Use at least 8 characters.") and `CardContent` holding the form;
  submit in `CardFooter className="justify-end"`.
- **Responsive** — card is full width below `sm`, `max-w-lg` above; submit button `w-full sm:w-auto`.

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Card | `Card` + `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter` | — | `max-w-lg` | — |
| Current / New / Confirm password | `PasswordInput` | as above | `bg-background` | default, focus, invalid, disabled while submitting |
| Submit | `Button` | `default` / `default` | `w-full sm:w-auto` | default, hover, focus, disabled + spinner |
| Success | `sonner` toast | default | — | — |
| Error (network, rate limit) | `Alert` | `destructive` | top of `CardContent` | — |

#### Accessibility

- **Contrast** — as auth pages; `CardDescription` is `muted-foreground` on `card` (white) ≈ 4.8:1.
- **ARIA roles** — the form has `aria-labelledby` the card title; errors as above.
- **Keyboard navigation** — Current → toggle → New → toggle → Confirm → toggle → Change password.

### Account menu

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Account | `DropdownMenuItem asChild` + `Link to="/account"` | — | existing | default, highlighted, focus |
| Sign out | `DropdownMenuItem onSelect={signOut}` | — | existing | default, highlighted, focus |

#### Accessibility

- **ARIA roles** — unchanged from the existing menu (`aria-label="Account menu"` trigger, Radix
  menu roles). Sign out is a `menuitem`, no longer a link, since it performs an action.
- **Keyboard navigation** — Radix defaults: Enter/Space opens, arrows move, Esc closes and returns
  focus to the trigger.

## Design Review

### Heuristics (Nielsen)

| # | Heuristic | Issues Found | Score (1–4) | Resolution |
|---|-----------|--------------|-------------|------------|
| 1 | Visibility of system status | Email-link verification could look frozen | 2 | Confirming screen with spinner; toasts after confirm and reset |
| 2 | Match with the real world | "OTP", "token" would confuse | 1 | Copy says "link", "email", "password" only |
| 3 | User control and freedom | Getting stuck on check-email or link-expired | 2 | "Back to sign in" on every guest page; resend and new-link actions |
| 4 | Consistency and standards | Two password-confirmation patterns | 1 | One `PasswordInput` and one rule set for sign-up, reset and change |
| 5 | Error prevention | Typos in new passwords | 2 | Confirm field + show/hide toggle; client checks before any call |
| 6 | Recognition rather than recall | Losing `next` on a detour to sign-up | 2 | `next` carried through sign-up and forgot links |
| 7 | Flexibility and efficiency | Password managers | 1 | Correct `autoComplete` tokens; email kept in sign-in → forgot hop |
| 8 | Aesthetic and minimalist design | — | — | Same `login-02` pattern, one action per screen |
| 9 | Help users recover from errors | Generic "incorrect" message (deliberate, [FR-005](requirements.md#fr-005)) | 2 | Forgot-password link always next to the password field; unconfirmed accounts get a specific message with resend |
| 10 | Help and documentation | Link lifetimes unclear | 1 | Lifetimes stated on check-email, sent and link-expired screens |

No issue scores 3 or 4.

### Accessibility Audit

- **WCAG AA** — pass for all text/background pairs listed above; status icons are decorative;
  focus rings use the theme `ring` token at 3 px (`focus-visible:ring-[3px]`), visible on both
  `background` and `muted`.
- **Keyboard flow** — confirmed for every screen above; no traps; Esc only applies to the account
  menu. Reduced motion: the spinner respects `motion-reduce:animate-none`.
