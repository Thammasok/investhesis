-- Invite-only sign-up (user-auth ADR-009). Idempotent and independent of other slices' migrations.
create schema if not exists app;
revoke all on schema app from public, anon, authenticated;

create table if not exists app.signup_allowlist (
  pattern    text primary key check (pattern = lower(pattern) and pattern ~ '^([^@\s]+)?@[^@\s]+$'),
  note       text,
  created_at timestamptz not null default now()
);
alter table app.signup_allowlist enable row level security;
-- supabase_auth_admin does not bypass RLS, so with no policy the hook would see an empty table.
drop policy if exists auth_admin_read on app.signup_allowlist;
create policy auth_admin_read on app.signup_allowlist for select to supabase_auth_admin using (true);
revoke all on app.signup_allowlist from public, anon, authenticated;

create or replace function app.hook_before_user_created(event jsonb) returns jsonb
language sql stable as $$
  select case when exists (
    select 1 from app.signup_allowlist a
    where a.pattern = lower(event->'user'->>'email')
       or a.pattern = '@' || split_part(lower(event->'user'->>'email'), '@', 2)
  ) then '{}'::jsonb
  else '{"error":{"http_code":403,"message":"signup_not_allowed"}}'::jsonb end
$$;

grant usage on schema app to supabase_auth_admin;
grant select on app.signup_allowlist to supabase_auth_admin;
grant execute on function app.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function app.hook_before_user_created(jsonb) from public, anon, authenticated;
