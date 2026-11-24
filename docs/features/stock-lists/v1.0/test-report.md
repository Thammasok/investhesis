---
version: 1.0
status: draft
date: 2026-11-22
task: T-013
requires: test-cases.md, dev-plan.md
---

# Test Report: Stock Lists

Results of the automated suites for [test-cases.md](test-cases.md) (T-013). The per-case table is
generated from the runs by `scripts/stock-lists-report.mjs` (`pnpm test:report:unit`, `pnpm test:e2e`,
then `pnpm test:report`); everything else is copied from the gate output below. Gate commit `68066e1`
(later commits only add this report and fix the report script's output path).

## Summary

- **TC coverage** - 226 of 226 case ids have at least one automated test whose title starts with the id
  (nothing is left manual). 224 pass outright; 2 ids (TC-E-124, TC-E-125) pass with documented expected
  failures that pin product findings.
- **Gate** - green: no unexpected failure, no flaky test, no skipped test (numbers as of the original gate
  below; the current full gate, with the holdings and concentration slice, is in
  [../../holdings-concentration/v1.0/test-report.md](../../holdings-concentration/v1.0/test-report.md)).
- **Product findings** - 4 were found (F-1..F-4). F-1 is fixed and F-3 is fixed except on hover (below);
  F-2, the F-3 hover case and F-4 are still pinned by `test.fail` cases, so the suite stays green and fails
  loudly the day they are fixed.

### Changes since the original gate (2026-11-24)

- **Add stock and Import are route-backed dialogs.** `/stocks/new` opens over the Stocks page and
  `/import-export/import` over Import / export (Esc and Back close them, a typed URL falls back to the page
  behind). The affected cases keep their ids and now drive the dialogs: TC-E-101 (Add stock is a dialog; Esc and
  Back return to Stocks), TC-E-109 (Import is a dialog; Esc and Back close it, an outside click does not),
  TC-E-122 and the import cases through `/import-export/import`.
- **F-1 is fixed.** The wizard now lives in the import dialog, which holds focus on arrival. TC-E-134 [F-1]
  is an ordinary passing test ("the import dialog holds focus on arrival"); its `test.fail` pin was removed.
- **F-3 is fixed at rest and on focus.** The dark theme tokens changed after this report was written, so the
  delete confirm buttons now pass in dark mode at rest and when focused; those pins were removed. Only the
  hover state is still below 4.5:1 and stays pinned.

## Gate (repo root, in order)

| Step | Command | Result |
|---|---|---|
| 1 | `pnpm db:start && pnpm db:reset` | migration applied to a fresh local Supabase |
| 2 | `pnpm test:supabase` | 3 files, 38 tests passed (includes TC-A-106, 5 tests) |
| 3 | `pnpm lint` | 0 errors, 0 warnings |
| 4 | `pnpm typecheck` | clean (also type-checks `e2e/`) |
| 5 | `pnpm test` | domain 121/121 (4 files), api 304/304 (22 files), web 370/370 (23 files) = 795 passed |
| 6 | `pnpm build` | built |
| 7 | `E2E_WEB_PORT=5174 pnpm test:e2e` | 114 passed in 6.9 min (user auth 40, stock lists 74 of which 14 are expected failures), 0 unexpected, 0 flaky, 0 skipped |

`E2E_WEB_PORT=5174` because an unrelated dev server holds 5173.

## Coverage (lines)

| Area | Lines | Threshold | Command |
|---|---|---|---|
| `packages/domain` | 100 % | 95 % | `pnpm --filter @investhesis/domain test:coverage` |
| `apps/api/src/modules/stocks` | 100 % | 85 % | `pnpm --filter @investhesis/api test:coverage` |
| `apps/api/src/modules/lists` | 96.34 % | 85 % | same |
| `apps/api/src/modules/imports` | 96.9 % | 85 % | same |
| `apps/api/src/auth` | 100 % | 90 % | same |
| `apps/web/src/features` (all) | 97.38 % | 70 % | `pnpm --filter @investhesis/web test:coverage` |
| `apps/web/src/features/auth` | 94.16 % | 90 % | same |

The thresholds are enforced by the coverage configs (`apps/api/vitest.config.ts`, `apps/web/vite.config.ts`, `packages/domain/vitest.config.ts`).

## Expected failures (pinned findings)

Each is a `test.fail` Playwright case (8 in all: TC-E-124 light, 7 of TC-E-125); the suite counts it as passed while the product behaves as measured.
Contrast is the computed text colour over the effective background, with each semi-transparent layer
composited over its real parent (`e2e/lib/contrast.ts`), cross-checked with axe's own numbers.

| Finding | Element | Theme | State | Ratio | Case |
|---|---|---|---|---|---|
| F-2 | `Delete` confirm button in the delete-stock and the delete-list AlertDialog (`SOLID_DESTRUCTIVE_LIGHT`) | light | rest, focus-visible | **1.25:1** (white text on the pale tint `rgb(247,224,224)`) | TC-E-125 (4 cases), TC-E-124 |
| F-3 | same buttons | dark | hover | **3.55:1** (on `rgb(97,52,52)`) | TC-E-125 (2 cases) |
| F-4 | highlighted `Delete` item of the stock actions menu (`variant="destructive"`) | light | focus/highlight | **4.28:1** (`rgb(221,0,0)` on `rgb(251,229,229)`) | TC-E-125 |

- **F-2 is a product bug, not only a token decision.** The solid light-theme override
  (`bg-destructive text-white`) does not win over the variant's `bg-destructive/10`, so at rest and on
  keyboard focus the button is white text on a near-white tint (1.25:1, close to unreadable). It only turns
  solid on hover (4.87:1, passes). axe reports it too (`color-contrast`, `.bg-destructive/10`). The comment
  in `solid-destructive.ts` and the T-008/T-010 notes claim 5.2:1.
- **F-3:** the dark tint was believed to measure 4.6:1; it measured 4.26:1 at rest and 3.55:1 on hover. The
  new dark theme tokens fixed rest and focus (their pins are gone, and TC-E-124 in dark mode is a plain test
  again); hover still measures 3.55:1 and stays pinned.
- **F-4:** same family: tinted destructive text on `bg-destructive/10` at about 4.3:1 in light mode.
- **F-1 (fixed):** under StrictMode (the Vite dev server) the wizard's focus effect ran twice and focus ended
  on the step heading `Choose file` instead of the page h1. Import now opens as a route-backed dialog that
  holds focus on arrival, and TC-E-134 [F-1] passes without a pin.

Measured and passing (so not findings), contrary to the expectation that they fail in light mode:
destructive `Alert` text 4.85:1 (file error) and 5.15:1 (duplicate stock), `FieldError` text 5.15:1,
`muted-foreground` hint on a card 5.74:1, error badge 15.09:1, count badge 16.44:1, error row text 18.06:1.
In dark mode: Alert 5.25 to 6.21, FieldError 6.21, hint 6.94, badges 11.91 to 12.83, row text 16.2,
destructive menu item 4.64. axe (`wcag2a`, `wcag2aa`, `wcag21aa`) finds nothing else on 16 screens and states
in both themes.

## Deviations

See section 13 of [test-cases.md](test-cases.md) (D-1 to D-19): the template buttons, the too-many-rows
message, the TH sector PATCH rule, the empty-PATCH `updatedAt`, the `row` column of the error CSV and the others.

## Measurements

- TC-E-126 (200 stocks, Chromium, no CPU throttling): first render after the data arrived 94 ms, median
  re-sort 28 ms (max 29 ms), no long task.
- TC-A-125, TC-A-138, TC-A-146 timings are asserted inside the API suites (95th percentile 500 ms, 1,000-row
  preview 3 s, 1,000-row confirm 5 s) and pass.

## Flakiness found and fixed

- User Auth TC-E-002 once timed out: `psql` in `scripts/lib/stack.ts` used a synchronous `docker exec` with
  no timeout. It now fails after 15 s with a clear message (commit `4cf8111`). The hang itself did not
  reproduce in this session.
- Vite re-optimising a dependency reloaded a page under a running test (a form wiped mid-fill): the E2E global
  setup now visits every route once before the first test.
- A Radix `Select` returns focus to its trigger on a later tick and the arrow keys of a radio group act only
  while the key is down: the keyboard tests wait for focus and hold the key 60 ms (TC-E-122, TC-E-120).

## Results per TC id

Generated; `tests` is the number of automated tests carrying the id. Results come from the files listed.

| TC | tests | result | files |
|---|---|---|---|
| TC-A-101 | 21 | pass | src/modules/imports/imports.supabase.test.ts, src/modules/lists/lists.supabase.test.ts, src/modules/stocks/stocks.supabase.test.ts |
| TC-A-102 | 1 | pass | src/modules/stocks/stocks.routes.test.ts |
| TC-A-103 | 1 | pass | src/modules/lists/lists.routes.test.ts |
| TC-A-104 | 2 | pass | src/modules/imports/imports.confirm.test.ts, src/modules/imports/imports.routes.test.ts |
| TC-A-105 | 3 | pass | src/modules/imports/imports.confirm.test.ts, src/modules/imports/imports.routes.test.ts, src/modules/stocks/stocks.routes.test.ts |
| TC-A-106 | 9 | pass | scripts/stock-lists-integration.test.ts |
| TC-A-107 | 1 | pass | src/modules/stocks/stocks.cases.test.ts |
| TC-A-108 | 20 | pass | src/modules/stocks/stocks.cases.test.ts |
| TC-A-109 | 6 | pass | src/modules/stocks/stocks.cases.test.ts |
| TC-A-110 | 10 | pass | src/modules/stocks/stocks.cases.test.ts |
| TC-A-111 | 11 | pass | src/modules/stocks/stocks.cases.test.ts |
| TC-A-112 | 13 | pass | src/modules/stocks/stocks.cases.test.ts |
| TC-A-113 | 11 | pass | src/modules/stocks/stocks.cases.test.ts |
| TC-A-114 | 15 | pass | src/modules/stocks/stocks.cases.test.ts |
| TC-A-115 | 1 | pass | src/modules/stocks/stocks.cases.test.ts |
| TC-A-116 | 7 | pass | src/modules/stocks/stocks.cases.test.ts |
| TC-A-117 | 2 | pass | src/modules/stocks/stocks.cases.test.ts |
| TC-A-118 | 2 | pass | src/modules/stocks/stocks.cases.test.ts |
| TC-A-119 | 1 | pass | src/modules/stocks/stocks.cases.test.ts |
| TC-A-120 | 1 | pass | src/modules/lists/lists.routes.test.ts |
| TC-A-121 | 1 | pass | src/modules/lists/lists.routes.test.ts |
| TC-A-122 | 2 | pass | src/modules/lists/lists.routes.test.ts, src/modules/stocks/stocks.routes.test.ts |
| TC-A-123 | 8 | pass | src/modules/imports/imports.supabase.test.ts, src/modules/lists/lists.routes.test.ts, src/modules/stocks/stocks.routes.test.ts |
| TC-A-124 | 3 | pass | src/modules/imports/imports.routes.test.ts, src/modules/lists/lists.routes.test.ts, src/modules/stocks/stocks.routes.test.ts |
| TC-A-125 | 1 | pass | src/modules/stocks/stocks.latency.test.ts |
| TC-A-126 | 2 | pass | src/modules/stocks/stocks.cases.test.ts |
| TC-A-127 | 1 | pass | src/modules/imports/imports.routes.test.ts |
| TC-A-128 | 1 | pass | src/modules/imports/imports.routes.test.ts |
| TC-A-129 | 2 | pass | src/modules/imports/imports.routes.test.ts |
| TC-A-130 | 1 | pass | src/modules/imports/imports.routes.test.ts |
| TC-A-131 | 1 | pass | src/modules/imports/imports.routes.test.ts |
| TC-A-132 | 1 | pass | src/modules/imports/imports.routes.test.ts |
| TC-A-133 | 1 | pass | src/modules/imports/imports.routes.test.ts |
| TC-A-134 | 1 | pass | src/modules/imports/imports.routes.test.ts |
| TC-A-135 | 1 | pass | src/modules/imports/imports.routes.test.ts |
| TC-A-136 | 1 | pass | src/modules/imports/imports.routes.test.ts |
| TC-A-137 | 1 | pass | src/modules/imports/imports.routes.test.ts |
| TC-A-138 | 1 | pass | src/modules/imports/imports.routes.test.ts |
| TC-A-139 | 1 | pass | src/modules/imports/imports.confirm.test.ts |
| TC-A-140 | 1 | pass | src/modules/imports/imports.confirm.test.ts |
| TC-A-141 | 1 | pass | src/modules/imports/imports.confirm.test.ts |
| TC-A-142 | 3 | pass | src/modules/imports/imports.confirm.test.ts |
| TC-A-143 | 1 | pass | src/modules/imports/imports.confirm.test.ts |
| TC-A-144 | 1 | pass | src/modules/imports/imports.confirm.test.ts |
| TC-A-145 | 1 | pass | src/modules/imports/imports.confirm.test.ts |
| TC-A-146 | 1 | pass | src/modules/imports/imports.confirm.test.ts |
| TC-A-147 | 1 | pass | src/modules/imports/imports.confirm.test.ts |
| TC-A-148 | 1 | pass | src/modules/imports/imports.abort.test.ts |
| TC-A-149 | 3 | pass | src/modules/imports/imports.formulas.test.ts |
| TC-C-101 | 1 | pass | src/features/stocks/stock-detail.test.tsx |
| TC-C-102 | 2 | pass | src/lib/api-client.test.ts |
| TC-C-103 | 4 | pass | src/routers/router.test.tsx |
| TC-C-110 | 1 | pass | src/features/stocks/stocks-page.test.tsx |
| TC-C-111 | 1 | pass | src/features/stocks/stocks-page.test.tsx |
| TC-C-112 | 2 | pass | src/features/stocks/stocks-page.test.tsx |
| TC-C-113 | 3 | pass | src/features/stocks/stocks-page.test.tsx |
| TC-C-114 | 1 | pass | src/features/stocks/stocks-page.test.tsx |
| TC-C-120 | 3 | pass | src/features/stocks/stock-detail.test.tsx |
| TC-C-121 | 6 | pass | src/features/stocks/stock-detail.test.tsx |
| TC-C-122 | 4 | pass | src/features/stocks/stock-detail.test.tsx |
| TC-C-123 | 2 | pass | src/features/stocks/stock-detail.test.tsx |
| TC-C-124 | 1 | pass | src/features/stocks/stock-detail.test.tsx |
| TC-C-130 | 1 | pass | src/features/stocks/stock-form.test.tsx |
| TC-C-131 | 2 | pass | src/features/stocks/stock-form.test.tsx |
| TC-C-132 | 2 | pass | src/features/stocks/stock-form.test.tsx |
| TC-C-133 | 1 | pass | src/features/stocks/stock-form.test.tsx |
| TC-C-134 | 1 | pass | src/features/stocks/stock-form.test.tsx |
| TC-C-135 | 1 | pass | src/features/stocks/stock-form.test.tsx |
| TC-C-136 | 1 | pass | src/features/stocks/stock-form.test.tsx |
| TC-C-137 | 2 | pass | src/features/stocks/stock-form.test.tsx |
| TC-C-138 | 4 | pass | src/features/stocks/stock-form.test.tsx |
| TC-C-139 | 1 | pass | src/features/stocks/stock-form.test.tsx |
| TC-C-140 | 3 | pass | src/features/stocks/stock-form.test.tsx |
| TC-C-141 | 4 | pass | src/features/stocks/stock-form.test.tsx |
| TC-C-150 | 3 | pass | src/features/lists/lists-page.test.tsx |
| TC-C-151 | 6 | pass | src/features/lists/lists-page.test.tsx |
| TC-C-152 | 6 | pass | src/features/lists/list-detail.test.tsx, src/features/lists/lists-page.test.tsx |
| TC-C-153 | 4 | pass | src/features/lists/list-detail.test.tsx, src/features/lists/lists-page.test.tsx |
| TC-C-154 | 4 | pass | src/features/lists/list-detail.test.tsx |
| TC-C-155 | 4 | pass | src/features/lists/list-detail.test.tsx |
| TC-C-156 | 3 | pass | src/features/lists/list-detail.test.tsx |
| TC-C-160 | 3 | pass | src/features/imports/import-wizard.test.tsx |
| TC-C-161 | 2 | pass | src/features/imports/import-wizard.test.tsx |
| TC-C-162 | 7 | pass | src/features/imports/import-wizard.test.tsx |
| TC-C-163 | 1 | pass | src/features/imports/import-wizard.test.tsx |
| TC-C-164 | 2 | pass | src/features/imports/import-wizard.test.tsx |
| TC-C-165 | 1 | pass | src/features/imports/import-wizard.test.tsx |
| TC-C-166 | 1 | pass | src/features/imports/import-wizard.test.tsx |
| TC-C-167 | 2 | pass | src/features/imports/import-wizard.test.tsx |
| TC-C-168 | 2 | pass | src/features/imports/import-wizard.test.tsx |
| TC-C-169 | 1 | pass | src/features/imports/import-wizard.test.tsx |
| TC-C-170 | 2 | pass | src/features/imports/import-wizard.test.tsx |
| TC-C-171 | 5 | pass | src/features/imports/import-wizard.test.tsx |
| TC-C-172 | 3 | pass | src/features/imports/import-helpers.test.ts, src/features/imports/import-wizard.test.tsx |
| TC-C-180 | 2 | pass | test/contrast-rule.test.ts |
| TC-C-181 | 3 | pass | src/features/lists/list-detail.test.tsx, src/features/stocks/stock-detail.test.tsx, src/features/stocks/stocks-page.test.tsx |
| TC-E-101 | 2 | pass | e2e/sl-stocks.spec.ts |
| TC-E-102 | 1 | pass | e2e/sl-stocks.spec.ts |
| TC-E-103 | 1 | pass | e2e/sl-stocks.spec.ts |
| TC-E-104 | 1 | pass | e2e/sl-stocks.spec.ts |
| TC-E-105 | 1 | pass | e2e/sl-stocks.spec.ts |
| TC-E-106 | 1 | pass | e2e/sl-lists.spec.ts |
| TC-E-107 | 1 | pass | e2e/sl-stocks.spec.ts |
| TC-E-108 | 1 | pass | e2e/sl-stocks.spec.ts |
| TC-E-109 | 2 | pass | e2e/sl-import.spec.ts |
| TC-E-110 | 1 | pass | e2e/sl-import.spec.ts |
| TC-E-111 | 1 | pass | e2e/sl-import.spec.ts |
| TC-E-112 | 1 | pass | e2e/sl-import.spec.ts |
| TC-E-113 | 2 | pass | e2e/sl-import.spec.ts |
| TC-E-114 | 1 | pass | e2e/sl-import.spec.ts |
| TC-E-115 | 1 | pass | e2e/sl-import.spec.ts |
| TC-E-116 | 1 | pass | e2e/sl-resilience.spec.ts |
| TC-E-117 | 2 | pass | e2e/sl-import.spec.ts, e2e/sl-resilience.spec.ts |
| TC-E-118 | 3 | pass | e2e/sl-responsive.spec.ts |
| TC-E-119 | 2 | pass | e2e/sl-responsive.spec.ts |
| TC-E-120 | 1 | pass | e2e/sl-responsive.spec.ts |
| TC-E-121 | 1 | pass | e2e/sl-lists.spec.ts |
| TC-E-122 | 1 | pass | e2e/sl-import.spec.ts |
| TC-E-123 | 1 | pass | e2e/sl-lists.spec.ts |
| TC-E-124 | 4 | pass + expected failure | e2e/sl-a11y.spec.ts |
| TC-E-125 | 32 | pass + expected failure | e2e/sl-a11y.spec.ts |
| TC-E-126 | 1 | pass | e2e/sl-a11y.spec.ts |
| TC-E-127 | 1 | pass | e2e/sl-import.spec.ts |
| TC-E-128 | 1 | pass | e2e/sl-import.spec.ts |
| TC-E-129 | 1 | pass | e2e/sl-resilience.spec.ts |
| TC-E-130 | 1 | pass | e2e/sl-import.spec.ts |
| TC-E-131 | 1 | pass | e2e/sl-resilience.spec.ts |
| TC-E-132 | 1 | pass | e2e/sl-resilience.spec.ts |
| TC-E-133 | 1 | pass | e2e/sl-resilience.spec.ts |
| TC-E-134 | 2 | pass | e2e/sl-resilience.spec.ts |
| TC-U-001 | 1 | pass | src/db/stock-lists.constraints.test.ts |
| TC-U-002 | 1 | pass | src/db/stock-lists.constraints.test.ts |
| TC-U-003 | 1 | pass | src/db/stock-lists.constraints.test.ts |
| TC-U-004 | 1 | pass | src/db/stock-lists.constraints.test.ts |
| TC-U-005 | 1 | pass | src/db/stock-lists.constraints.test.ts |
| TC-U-006 | 1 | pass | src/db/schema.drift.test.ts |
| TC-U-010 | 7 | pass | src/stock-schema.test.ts, src/vocabulary.test.ts |
| TC-U-011 | 3 | pass | src/stock-schema.test.ts |
| TC-U-012 | 4 | pass | src/stock-schema.test.ts |
| TC-U-013 | 2 | pass | src/stock-schema.test.ts |
| TC-U-014 | 3 | pass | src/stock-schema.test.ts |
| TC-U-015 | 5 | pass | src/economic-cycle.test.ts |
| TC-U-016 | 2 | pass | src/economic-cycle.test.ts, src/vocabulary.test.ts |
| TC-U-017 | 1 | pass | src/template.test.ts |
| TC-U-018 | 1 | pass | src/template.test.ts |
| TC-U-019 | 3 | pass | src/template.test.ts |
| TC-U-020 | 3 | pass | src/stock-schema.test.ts, src/template.test.ts |
| TC-U-030 | 1 | pass | src/modules/lists/lists.routes.test.ts |
| TC-U-031 | 1 | pass | src/modules/lists/lists.routes.test.ts |
| TC-U-032 | 1 | pass | src/modules/lists/lists.routes.test.ts |
| TC-U-033 | 1 | pass | src/modules/lists/lists.routes.test.ts |
| TC-U-034 | 1 | pass | src/modules/lists/lists.routes.test.ts |
| TC-U-035 | 1 | pass | src/modules/lists/lists.routes.test.ts |
| TC-U-036 | 1 | pass | src/modules/lists/lists.routes.test.ts |
| TC-U-040 | 7 | pass | src/modules/stocks/stocks.routes.test.ts |
| TC-U-041 | 2 | pass | src/modules/stocks/stocks.routes.test.ts |
| TC-U-042 | 1 | pass | src/modules/stocks/stocks.routes.test.ts |
| TC-U-043 | 1 | pass | src/modules/stocks/stocks.routes.test.ts |
| TC-U-044 | 2 | pass | src/modules/stocks/stocks.routes.test.ts |
| TC-U-045 | 4 | pass | src/modules/stocks/stocks.routes.test.ts |
| TC-U-046 | 1 | pass | src/modules/stocks/stocks.routes.test.ts |
| TC-U-047 | 2 | pass | src/modules/stocks/stocks.routes.test.ts |
| TC-U-048 | 1 | pass | src/modules/stocks/stocks.routes.test.ts |
| TC-U-050 | 1 | pass | src/modules/imports/imports.routes.test.ts |
| TC-U-051 | 1 | pass | src/modules/imports/imports.routes.test.ts |
| TC-U-052 | 1 | pass | src/modules/imports/imports.routes.test.ts |
| TC-U-053 | 1 | pass | src/modules/imports/imports.routes.test.ts |
| TC-U-054 | 1 | pass | src/modules/imports/imports.routes.test.ts |
| TC-U-055 | 1 | pass | src/modules/imports/imports.routes.test.ts |
| TC-U-056 | 1 | pass | src/modules/imports/imports.routes.test.ts |
| TC-U-057 | 1 | pass | src/modules/imports/imports.routes.test.ts |
| TC-U-058 | 2 | pass | src/modules/imports/imports.routes.test.ts |
| TC-U-060 | 1 | pass | src/modules/imports/imports.confirm.test.ts |
| TC-U-061 | 1 | pass | src/modules/imports/imports.confirm.test.ts |
| TC-U-062 | 1 | pass | src/modules/imports/imports.confirm.test.ts |
| TC-U-063 | 1 | pass | src/modules/imports/imports.confirm.test.ts |
| TC-U-064 | 1 | pass | src/modules/imports/imports.confirm.test.ts |
| TC-U-065 | 1 | pass | src/modules/imports/imports.confirm.test.ts |
| TC-U-066 | 1 | pass | src/modules/imports/imports.confirm.test.ts |
| TC-U-070 | 5 | pass | src/lib/api-client.test.ts |
| TC-U-071 | 2 | pass | src/lib/api-client.test.ts |
| TC-U-072 | 1 | pass | src/lib/api-client.test.ts |
| TC-U-073 | 1 | pass | src/lib/api-client.test.ts |
| TC-U-074 | 2 | pass | src/routers/route-handle.test.tsx |
| TC-U-080 | 1 | pass | src/features/stocks/stocks-page.test.tsx |
| TC-U-081 | 1 | pass | src/features/stocks/stocks-page.test.tsx |
| TC-U-082 | 1 | pass | src/features/stocks/stocks-page.test.tsx |
| TC-U-083 | 1 | pass | src/features/stocks/stock-detail.test.tsx |
| TC-U-084 | 1 | pass | src/features/stocks/stock-detail.test.tsx |
| TC-U-085 | 1 | pass | src/features/stocks/stock-detail.test.tsx |
| TC-U-086 | 1 | pass | src/features/stocks/stock-detail.test.tsx |
| TC-U-090 | 1 | pass | src/features/stocks/stock-form.test.tsx |
| TC-U-091 | 1 | pass | src/features/stocks/stock-form.test.tsx |
| TC-U-092 | 1 | pass | src/features/stocks/stock-form.test.tsx |
| TC-U-093 | 1 | pass | src/features/stocks/stock-form.test.tsx |
| TC-U-094 | 1 | pass | src/features/stocks/stock-form.test.tsx |
| TC-U-095 | 1 | pass | src/features/stocks/stock-form.test.tsx |
| TC-U-096 | 1 | pass | src/features/stocks/stock-form.test.tsx |
| TC-U-100 | 1 | pass | src/features/lists/lists-page.test.tsx |
| TC-U-101 | 1 | pass | src/features/lists/lists-page.test.tsx |
| TC-U-102 | 4 | pass | src/features/lists/lists-page.test.tsx |
| TC-U-103 | 1 | pass | src/features/lists/list-detail.test.tsx |
| TC-U-104 | 1 | pass | src/features/lists/list-detail.test.tsx |
| TC-U-110 | 1 | pass | src/features/imports/import-wizard.test.tsx |
| TC-U-111 | 1 | pass | src/features/imports/import-wizard.test.tsx |
| TC-U-112 | 1 | pass | src/features/imports/import-wizard.test.tsx |
| TC-U-113 | 1 | pass | src/features/imports/import-wizard.test.tsx |
| TC-U-114 | 1 | pass | src/features/imports/import-wizard.test.tsx |
| TC-U-115 | 5 | pass | src/features/imports/import-helpers.test.ts, src/features/imports/import-wizard.test.tsx |
| TC-U-116 | 1 | pass | src/features/imports/import-wizard.test.tsx |
| TC-U-120 | 18 | pass | src/vocabulary.test.ts |
| TC-U-121 | 10 | pass | src/stock-schema.test.ts |
| TC-U-122 | 3 | pass | src/stock-schema.test.ts |
| TC-U-123 | 17 | pass | src/stock-schema.test.ts, src/template.test.ts, src/vocabulary.test.ts |
| TC-U-124 | 6 | pass | src/economic-cycle.test.ts |
| TC-U-125 | 1 | pass | src/template.test.ts |
| TC-U-126 | 3 | pass | src/template.test.ts |
| TC-U-127 | 1 | pass | src/template.test.ts |
| TC-U-128 | 2 | pass | src/template.test.ts |
| TC-U-129 | 10 | pass | src/stock-schema.test.ts |
| TC-U-130 | 14 | pass | src/stock-schema.test.ts |
| TC-U-131 | 2 | pass | src/stock-schema.test.ts, src/template.test.ts |
| TC-U-132 | 3 | pass | src/features/imports/import-helpers.test.ts |
| TC-U-133 | 6 | pass | src/features/stocks/sort-stocks.test.ts |
| TC-U-134 | 6 | pass | src/features/stocks/format.test.ts |
| TC-U-135 | 5 | pass | src/features/imports/import-helpers.test.ts |
