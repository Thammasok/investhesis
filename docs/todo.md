# Todo

The Orchestrator's index of planned slices. Edit the tables in place; never regenerate this file.

## Slices under development

| Slice | Version | Plan | Status | Gate reached | Updated |
|---|---|---|---|---|---|
| Search, Filter and Export | v1.0 | [dev-plan.md](features/search-filter-export/v1.0/dev-plan.md) | done | All 11 tasks approved; awaiting release tag | 2026-11-24 |
| Holdings and Concentration | v1.0 | [dev-plan.md](features/holdings-concentration/v1.0/dev-plan.md) | done | Released as v0.4.0 | 2026-11-24 |
| User Auth (admin-created accounts, no sign-up) | v1.2 | [dev-plan.md](features/user-auth/v1.2/dev-plan.md) | done | Released as v0.3.0 | 2026-11-23 |
| User Auth (open sign-up) | v1.1 | [dev-plan.md](features/user-auth/v1.1/dev-plan.md) | superseded | Replaced by v1.2 before any task started | 2026-11-23 |
| Stock Lists | v1.0 | [dev-plan.md](features/stock-lists/v1.0/dev-plan.md) | done | Released as v0.2.0 | 2026-11-22 |
| User Auth | v1.0 | [dev-plan.md](features/user-auth/v1.0/dev-plan.md) | done | Released as v0.1.0 | 2026-11-21 |

## Carried work

| Item | From | Notes |
|---|---|---|
| Rewrite `.claude/rules/test-gate.md` command table for Investhesis | Stock Lists v1.0 | Proposed in T-001's review note |
| Fix destructive contrast: delete confirm buttons are not solid in light mode (F-2), dark mode 4.26:1 (F-3), highlighted destructive menu item 4.28:1 (F-4); remove the matching `test.fail` cases when fixed | Stock Lists v1.0 | Pinned in `sl-a11y.spec.ts`; see test-report.md |
| Decide how to stop `TC-C-114` (NFR-003 timing, `stocks-page.test.tsx`) failing under CPU load | Stock Lists v1.0 | Failed once at 209 ms vs 200 ms; passed in 12 re-runs |
| Check F-1 (import wizard focus under StrictMode) against a production build | Stock Lists v1.0 | Probably dev-only |
| Decide on spreadsheet formula escaping in the error CSV and templates | Stock Lists v1.0 | Not escaped, per NFR-009; pinned by TC-A-149 |
| Rewrite or delete the Pacta rule files in `.claude/rules/` | Stock Lists v1.0 | Still open from CLAUDE.md |
