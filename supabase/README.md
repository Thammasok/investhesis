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

## Sign-up allowlist

Sign-up is invite-only: the Before User Created hook (`app.hook_before_user_created`, enabled in
`config.toml`) answers 403 `signup_not_allowed` unless the email matches a row of
`app.signup_allowlist`. A row is one address or a whole domain, lower case; a `@domain` row does not
match sub-domains (add them as their own rows). The table is reachable only by `postgres` and
`supabase_auth_admin`, so edit it with SQL (Studio SQL editor, or `psql` on port 54322):

```sql
insert into app.signup_allowlist (pattern, note) values ('owner@example.com', 'owner');   -- one address
insert into app.signup_allowlist (pattern, note) values ('@example.com', 'whole domain');  -- a domain
delete from app.signup_allowlist where pattern = 'owner@example.com';                      -- remove
```

Removing a row does not delete an account that already exists. `seed.sql` allowlists
`@example.test` locally, the domain every test uses. After changing the hook in `config.toml`, run
`pnpm db:stop && pnpm db:start`: `db:reset` alone does not reload Auth's config.

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
- [ ] Minimum password length 8; anonymous sign-ins off; sign-ups on
- [ ] JWT expiry 3600 s; refresh token rotation on, reuse interval 10 s
- [ ] Email templates: paste `templates/confirmation.html` and `templates/recovery.html` (Confirm signup, Reset password)
- [ ] JWT signing keys: an ES256 key is the current key (rotate from the legacy secret), so the JWKS endpoint serves it
- [ ] Custom SMTP set up (requirements OQ-1); the built-in mailer is for testing only
- [ ] Email rate limits reviewed after SMTP is on
- [ ] `supabase db push` for migrations (creates `app.signup_allowlist` and `app.hook_before_user_created`)
- [ ] Authentication, Hooks: enable Before User Created, type Postgres function, schema `app`, function `hook_before_user_created`
- [ ] Insert the owner's address before the first sign-up (SQL below); the hosted allowlist starts empty, and the hook also gates users made through the admin API
