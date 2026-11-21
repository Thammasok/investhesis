# Test gate — green before, green after, then human review

Loaded every session. Applies to every development task (a `dev-plan.md` task, a fix, a refactor,
any change to `apps/`, `packages/`, `db/` or `scripts/`). Docs-only or `.claude/`-only changes
skip it. Every development skill follows this flow; it overrides a skill's own workflow where they
differ.

## The flow

1. **Baseline gate (before writing any code).** Check you are on `main` with a clean tree, then run
   the full suite below.
2. **Fix the baseline.** If anything fails, fix all of it before starting the task:
   - Find the root cause; fix the product or the test, whichever is wrong. Never skip, delete,
     `.only`/`.skip`, loosen an assertion or add `it.fails` just to get green.
   - A flaky test counts as failing: fix the flakiness, don't re-run until it passes.
   - Environment problems (Docker down, port taken, missing Playwright browser) are fixed in the
     environment (`pnpm stack:up`, port overrides from `testing.md`, `playwright install`), not
     in the code.
   - Commit the baseline fixes on their own (`fix(...)` / `test(...)`), before any task work.
   - If a fix needs a product decision, conflicts with the requirements, or you can't find the
     cause, stop and ask the owner. Don't start the task on a red baseline.
3. **Re-run the full suite** until it is all green. Only then start developing.
4. **Develop** the task (TDD per the skill and `dev-plan.md`).
5. **Final gate.** When the task is done, run the full suite again. Everything must pass,
   including tests the task did not touch. A failure is fixed (same rules as step 2) and the
   whole suite re-run; a green subset is not a green suite.
6. **Hand to human review.** Commit (per `git.md`), then post the gate report below and stop. The
   task moves to `review`, never to `done`; only the owner approves it. Don't start the next task
   until the owner answers, unless they told you to keep going.

Known findings pinned with `it.fails` / `test.fail` (listed in a test report) are expected and
pass the suite; leave them unless the task is about that finding.

If the baseline ran on the same commit with a clean tree earlier in this session (for example the
previous task's final gate), it may be reused for step 1; say so in the report.

## The full suite

Run from the repo root, in this order (stop at the first failing step, fix, restart the list):

| # | Command | Needs |
|---|---|---|
| 1 | `pnpm stack:up && pnpm db:update:test` | Docker |
| 2 | `pnpm lint` | |
| 3 | `pnpm typecheck` | |
| 4 | `pnpm guard && pnpm check:secrets` | |
| 5 | `pnpm test:scripts` | |
| 6 | `pnpm test:db` | test DB |
| 7 | `pnpm test` (API + web Vitest) | test DB |
| 8 | `pnpm build` | |
| 9 | `pnpm test:e2e` (mocked) | Playwright chromium |
| 10 | `PACTA_PG_PORT=5543 PACTA_SMTP_PORT=1125 PACTA_MAILPIT_UI_PORT=8125 PACTA_GCS_PORT=4543 pnpm test:e2e:integration` | Docker (ports differ from the dev stack) |
| 11 | `pnpm --filter @pacta/api test:ops` | Docker, test DB (~90 s) |

New suites (extension, `packages/api-client`) join this table in the task that adds them.

## Gate report (posted with the review request)

```
⏸ HUMAN REVIEW REQUIRED — T-XXX <title>

Baseline gate (commit <sha>): <all green | N failures fixed: what + commit sha>
Final gate   (commit <sha>):
  lint ✅  typecheck ✅  guard ✅  scripts ✅  db ✅
  vitest  api <pass>/<total>  web <pass>/<total>
  build ✅  e2e mocked <pass>/<total>  e2e integration <pass>/<total>  ops <pass>/<total>
  expected failures (it.fails / test.fail): <ids or none>

What changed: <summary + commits>
Please check: acceptance criteria, code, security, docs.
Reply "approve T-XXX" or "reject T-XXX: <notes>".
```

Report real numbers from the runs. If a step could not run, the gate is not green: say which and
why, and ask the owner instead of sending it to review as passed.
