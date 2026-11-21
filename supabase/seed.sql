-- Every test and E2E sign-up uses @example.test.
insert into app.signup_allowlist (pattern, note)
values ('@example.test', 'local development and tests')
on conflict (pattern) do nothing;
