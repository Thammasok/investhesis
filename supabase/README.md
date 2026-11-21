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
- [ ] `supabase db push` for migrations; allowlist hook steps are added with the sign-up allowlist task
