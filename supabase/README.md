# Supabase (local stack and hosted checklist)

The Supabase CLI project for Investhesis. Auth settings live in `config.toml`; the API verifies the
tokens it issues (docs/features/user-auth/v1.0/design.md).

## Local

```
pnpm db:start   # makes supabase/signing_keys.json if missing (git-ignored), then supabase start
pnpm db:reset   # re-applies migrations and seed.sql
pnpm db:stop
pnpm test:supabase   # script-level checks of the settings below, needs the stack running
```

| Service | URL |
|---|---|
| API gateway (Auth at `/auth/v1`) | http://127.0.0.1:54321 |
| Postgres | postgresql://postgres:postgres@127.0.0.1:54322/postgres |
| Studio | http://127.0.0.1:54323 |
| Mailpit (every Auth email lands here) | http://127.0.0.1:54324 |

Auth reloads the email templates about every 10 s and Kong starts after Auth, so for the first seconds after `db:start` an email can carry Supabase's built-in wording; `pnpm test:supabase` waits for the custom templates first.

The publishable key is printed by `pnpm exec supabase status -o env` (`ANON_KEY`).

Settings in `config.toml`: site URL `http://localhost:5173`, ES256 signing key from
`signing_keys.json`, 1 h access tokens, refresh token rotation, minimum password length 8, email
confirmation required, `auth.email.require_current_password = true` (a password change needs
`current_password`; Auth answers `current_password_required` or `current_password_invalid`),
60 s between emails per address. The confirmation and recovery templates link to
`{{ .SiteURL }}/auth/confirm?token_hash=...&type=email|recovery&next=...`.

## Creating accounts

Public sign-up is closed (`enable_signup = false` in `config.toml`, no Before User Created hook):
`POST /auth/v1/signup` answers 422 `signup_disabled` for every address, known or not, and creates
nothing. The web has no sign-up page. Accounts are made by the owner, through Studio or the Admin
API; the Admin API ignores `enable_signup`. Public `resend` still works (see below), which is how
an unconfirmed account gets its confirmation mail.

**Studio** (local http://127.0.0.1:54323, hosted: dashboard, Authentication, Users):

1. Add user, Create new user.
2. Enter the email and a temporary password (at least 8 characters).
3. Tick Auto Confirm User to skip the confirmation mail; leave it off to have the person confirm
   first (then send the mail with `resend`, below).
4. Create user.

**Admin API** (needs the service role key; keep it in your shell, never in a file or in git. Local:
`pnpm exec supabase status -o env`, `SERVICE_ROLE_KEY`; hosted: dashboard, Project Settings, API Keys):

```
curl -sS -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"person@example.com","password":"<temporary-password>","email_confirm":true}'
```

`email_confirm: true` creates a confirmed user who can sign in at once; `false` leaves it
unconfirmed (sign-in answers `email_not_confirmed` until the mail link is used). Creating the same
address twice answers 422 `email_exists`.

**Hand-over.** Send the person the sign-in URL and the temporary password through a different
channel from the one carrying the address (a message, not the same email thread). Ask them to sign
in and change the password straight away (Account, change password), or to use "Forgot password"
and set their own. Never reuse one temporary password for two people.

**Public `resend`** (`auth.resend({ type: 'signup', email })`): for an unconfirmed admin-created
address it sends one confirmation mail (at most one per 60 s); for an unknown address it sends
nothing and creates no user. Both calls return success with the same body, so the answer does not
reveal whether an address exists (pinned by TC-U-314, no finding). It is not a registration path.

**Re-opening sign-up** is a configuration change only, with no code or migration change:

- Local: set `enable_signup = true` in `config.toml`, then `pnpm db:stop && pnpm db:start`
  (`db:reset` alone does not reload Auth's config). Any address can then sign up and gets a
  confirmation mail; revert the line and restart to close it. `pnpm test:supabase` fails while it
  is open (TC-U-312, TC-A-310).
- Hosted: dashboard, Authentication, Sign In / Providers, turn "Allow new users to sign up" on.
  Close it again the same way.

The retired v1.0 allowlist (`app.signup_allowlist`, `app.hook_before_user_created`) is dropped by
`migrations/*_close_signup.sql`; `*_signup_allowlist.sql` stays as history.

## Production email (OQ-1)

Supabase's built-in mailer is for testing only. For production, point Auth at a custom SMTP
provider with a free or low-cost tier: Resend (free tier), Brevo (free tier) or Amazon SES
(low-cost, pay per message). Any of them works with Auth's SMTP settings; the owner picks one
before deploying (requirements OQ-1).

## Smoke check

```
curl -s http://127.0.0.1:54321/auth/v1/.well-known/jwks.json   # one key, kty EC, crv P-256, alg ES256
pnpm test:supabase
```

## Hosted project checklist

Apply by hand in the dashboard (or `supabase config push`); the dashboard is the source of truth
until then.

- [ ] Authentication, URL configuration: site URL is the web origin; redirect URLs include `<origin>/**`
- [ ] Sign-in providers, email: confirm email on; secure password change off; require current password on
- [ ] Minimum password length 8; anonymous sign-ins off; sign-ups off (see Creating accounts)
- [ ] JWT expiry 3600 s; refresh token rotation on, reuse interval 10 s
- [ ] Email templates: paste `templates/confirmation.html` and `templates/recovery.html` (Confirm signup, Reset password)
- [ ] JWT signing keys: an ES256 key is the current key (rotate from the legacy secret), so the JWKS endpoint serves it
- [ ] Custom SMTP set up (requirements OQ-1); the built-in mailer is for testing only
- [ ] Email rate limits reviewed after SMTP is on
- [ ] Rollout order for closing sign-up on a project that ran v1.0: (1) Authentication, Hooks: disable Before User Created (delete the hook); (2) Authentication, Sign In / Providers: turn "Allow new users to sign up" off; (3) `supabase db push` (applies `*_close_signup.sql`, which drops the function and table). Never push first: dropping the function while the hook is still enabled makes every sign-in path that creates users fail
- [ ] Create the owner's account (Creating accounts); there is no sign-up to fall back on
