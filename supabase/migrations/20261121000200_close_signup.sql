-- Sign-up is closed (user-auth v1.2: accounts are created by the owner through the Admin API or
-- Studio). The Before User Created hook and its allowlist are retired. Idempotent; the v1.0
-- *_signup_allowlist.sql migration stays as history.
drop function if exists app.hook_before_user_created(jsonb);
drop table if exists app.signup_allowlist;
-- The hook was the only reason Auth's role could reach the app schema.
revoke usage on schema app from supabase_auth_admin;
