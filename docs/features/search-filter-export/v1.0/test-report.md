---
version: 1.0
status: draft
date: 2026-11-24
requires: test-cases.md, dev-plan.md
task: T-011
---

# Test Report: Search, Filter and Export

Results of the automation of [test-cases.md](test-cases.md) against the implementation of
[dev-plan.md](dev-plan.md) T-001 to T-009, produced by `pnpm test:report:unit`, `pnpm test:e2e` and
`pnpm test:report:sfe` (`scripts/search-filter-export-report.mjs`). Every test title starts with, or contains, its TC id.

## Summary

| | |
|---|---|
| Ids in scope | 122 (`TC-U` 52 from the dev plan, `TC-A` 15, `TC-C` 32, `TC-E` 23) |
| Automated | **122 of 122** |
| Result | **122 pass**, 0 fail, 0 skipped, 0 expected failures of this slice |
| Gate (commit `9f1d7ce`) | `db:reset` ✅, `test:supabase` 68/68, lint ✅, typecheck ✅, domain 192/192, API 378/378, web 640/640, build ✅, E2E **237/237** (15.5 min) |
| Expected failures (`test.fail`) | the pinned `[F-2]`, `[F-3]`, `[F-4]` contrast findings of Stock Lists, unchanged |

Coverage (lines): `packages/domain` 99.4% (bar 95%); API `modules/exports` 100% and `modules/imports` 95% (bar 85%);
web `features/stock-filters` 97%, `features/exports` 98%, `features/concentration` 97%, `features/imports` 98% (bar 70%).

## Results per TC id

| TC | tests | result | files |
|---|---|---|---|
| TC-A-500 | 1 | pass | src/modules/exports/exports.routes.test.ts |
| TC-A-501 | 1 | pass | src/modules/exports/exports.routes.test.ts |
| TC-A-502 | 1 | pass | src/modules/exports/exports.routes.test.ts |
| TC-A-503 | 1 | pass | src/modules/exports/exports.routes.test.ts |
| TC-A-504 | 1 | pass | src/modules/exports/exports.routes.test.ts |
| TC-A-505 | 1 | pass | src/modules/imports/imports.exports.test.ts |
| TC-A-506 | 1 | pass | src/modules/exports/exports.routes.test.ts |
| TC-A-507 | 1 | pass | src/modules/exports/exports.routes.test.ts |
| TC-A-508 | 1 | pass | src/modules/exports/exports.snapshot.test.ts |
| TC-A-509 | 1 | pass | src/modules/exports/exports.supabase.test.ts |
| TC-A-510 | 1 | pass | src/modules/exports/exports.latency.test.ts |
| TC-A-511 | 1 | pass | src/modules/imports/imports.exports.test.ts |
| TC-A-512 | 1 | pass | src/modules/imports/imports.exports.test.ts |
| TC-A-513 | 1 | pass | src/modules/exports/exports.routes.test.ts |
| TC-A-514 | 1 | pass | src/modules/exports/exports.routes.test.ts |
| TC-C-500 | 1 | pass | src/features/stock-filters/filter-components.test.tsx |
| TC-C-501 | 3 | pass | src/features/concentration/concentration-filters.test.tsx, src/features/stock-filters/filter-toolbar.test.tsx, src/features/stock-filters/sort-address.test.tsx |
| TC-C-502 | 1 | pass | src/features/stock-filters/filter-toolbar.test.tsx |
| TC-C-503 | 1 | pass | src/features/stock-filters/filter-components.test.tsx |
| TC-C-504 | 1 | pass | src/features/stock-filters/filter-components.test.tsx |
| TC-C-505 | 1 | pass | src/features/stock-filters/filter-toolbar.test.tsx |
| TC-C-506 | 1 | pass | src/features/stock-filters/filter-components.test.tsx |
| TC-C-507 | 1 | pass | src/features/stock-filters/filter-components.test.tsx |
| TC-C-508 | 1 | pass | src/features/stock-filters/filter-toolbar.test.tsx |
| TC-C-509 | 1 | pass | src/features/stock-filters/filter-components.test.tsx |
| TC-C-510 | 1 | pass | src/features/stock-filters/filter-toolbar.test.tsx |
| TC-C-511 | 1 | pass | src/features/stock-filters/filter-components.test.tsx |
| TC-C-512 | 1 | pass | src/features/stock-filters/filter-components.test.tsx |
| TC-C-513 | 1 | pass | src/features/stock-filters/filter-toolbar.test.tsx |
| TC-C-514 | 1 | pass | src/features/stock-filters/filter-toolbar.test.tsx |
| TC-C-515 | 2 | pass | src/features/stock-filters/filter-toolbar.test.tsx |
| TC-C-516 | 1 | pass | src/features/stock-filters/filter-toolbar.test.tsx |
| TC-C-517 | 1 | pass | src/features/stock-filters/sort-address.test.tsx |
| TC-C-518 | 1 | pass | src/features/stock-filters/filter-components.test.tsx |
| TC-C-519 | 1 | pass | src/features/exports/export-menu.test.tsx |
| TC-C-520 | 1 | pass | src/features/exports/export-menu.test.tsx |
| TC-C-521 | 1 | pass | src/features/exports/export-menu.test.tsx |
| TC-C-522 | 2 | pass | src/features/exports/export-menu.test.tsx |
| TC-C-523 | 3 | pass | src/features/exports/export-menu.test.tsx |
| TC-C-524 | 3 | pass | src/features/exports/backup-card.test.tsx |
| TC-C-525 | 2 | pass | src/features/concentration/concentration-filters.test.tsx |
| TC-C-526 | 2 | pass | src/features/concentration/concentration-filters.test.tsx |
| TC-C-527 | 1 | pass | src/features/imports/import-helpers.test.ts |
| TC-C-528 | 1 | pass | src/features/stock-filters/filter-static.test.ts |
| TC-C-529 | 1 | pass | src/features/stock-filters/filter-components.test.tsx |
| TC-C-530 | 3 | pass | src/features/imports/import-wizard.test.tsx |
| TC-C-531 | 1 | pass | src/features/stock-filters/filter-components.test.tsx |
| TC-E-500 | 1 | pass | e2e/sfe-filters.spec.ts |
| TC-E-501 | 1 | pass | e2e/sfe-filters.spec.ts |
| TC-E-502 | 1 | pass | e2e/sfe-filters.spec.ts |
| TC-E-503 | 1 | pass | e2e/sfe-filters.spec.ts |
| TC-E-504 | 1 | pass | e2e/sfe-filters.spec.ts |
| TC-E-505 | 1 | pass | e2e/sfe-filters.spec.ts |
| TC-E-506 | 1 | pass | e2e/sfe-filters.spec.ts |
| TC-E-507 | 1 | pass | e2e/sfe-concentration.spec.ts |
| TC-E-508 | 1 | pass | e2e/sfe-concentration.spec.ts |
| TC-E-509 | 1 | pass | e2e/sfe-export.spec.ts |
| TC-E-510 | 1 | pass | e2e/sfe-export.spec.ts |
| TC-E-511 | 1 | pass | e2e/sfe-export.spec.ts |
| TC-E-512 | 1 | pass | e2e/sfe-export.spec.ts |
| TC-E-513 | 1 | pass | e2e/sfe-export.spec.ts |
| TC-E-514 | 1 | pass | e2e/sfe-export.spec.ts |
| TC-E-515 | 1 | pass | e2e/sfe-privacy.spec.ts |
| TC-E-516 | 1 | pass | e2e/sfe-privacy.spec.ts |
| TC-E-517 | 1 | pass | e2e/sfe-privacy.spec.ts |
| TC-E-518 | 1 | pass | e2e/sfe-privacy.spec.ts |
| TC-E-519 | 2 | pass | e2e/sfe-a11y.spec.ts |
| TC-E-520 | 24 | pass | e2e/sfe-a11y.spec.ts |
| TC-E-521 | 2 | pass | e2e/sfe-responsive.spec.ts |
| TC-E-522 | 1 | pass | e2e/sfe-keyboard.spec.ts |
| TC-U-500 | 1 | pass | src/filters.test.ts |
| TC-U-501 | 1 | pass | src/filters.test.ts |
| TC-U-502 | 1 | pass | src/filters.test.ts |
| TC-U-503 | 1 | pass | src/filters.test.ts |
| TC-U-504 | 1 | pass | src/filters.test.ts |
| TC-U-505 | 1 | pass | src/filters.test.ts |
| TC-U-506 | 1 | pass | src/filters.test.ts |
| TC-U-507 | 1 | pass | src/filters.test.ts |
| TC-U-508 | 1 | pass | src/filters.test.ts |
| TC-U-509 | 1 | pass | src/filters.test.ts |
| TC-U-520 | 1 | pass | src/export.test.ts |
| TC-U-521 | 1 | pass | src/export.test.ts |
| TC-U-522 | 1 | pass | src/export.test.ts |
| TC-U-523 | 1 | pass | src/export.test.ts |
| TC-U-524 | 1 | pass | src/export.test.ts |
| TC-U-525 | 1 | pass | src/export.test.ts |
| TC-U-526 | 1 | pass | src/export.test.ts |
| TC-U-527 | 1 | pass | src/export.test.ts |
| TC-U-528 | 1 | pass | src/export.test.ts |
| TC-U-540 | 1 | pass | src/modules/exports/exports.routes.test.ts |
| TC-U-541 | 1 | pass | src/modules/exports/exports.routes.test.ts |
| TC-U-542 | 1 | pass | src/modules/exports/exports.routes.test.ts |
| TC-U-543 | 1 | pass | src/modules/exports/exports.routes.test.ts |
| TC-U-544 | 4 | pass | src/modules/exports/exports.supabase.test.ts |
| TC-U-560 | 1 | pass | src/modules/imports/imports.exports.test.ts |
| TC-U-561 | 1 | pass | src/modules/imports/imports.exports.test.ts |
| TC-U-562 | 1 | pass | src/modules/imports/imports.exports.test.ts |
| TC-U-563 | 1 | pass | src/modules/imports/imports.exports.test.ts |
| TC-U-580 | 1 | pass | src/features/stock-filters/filter-address.test.ts |
| TC-U-581 | 1 | pass | src/features/stock-filters/filter-address.test.ts |
| TC-U-582 | 1 | pass | src/features/stock-filters/filter-address.test.ts |
| TC-U-583 | 1 | pass | src/features/stock-filters/filter-address.test.ts |
| TC-U-584 | 1 | pass | src/features/stock-filters/filter-address.test.ts |
| TC-U-600 | 1 | pass | src/features/stock-filters/filter-toolbar.test.tsx |
| TC-U-601 | 1 | pass | src/features/stock-filters/filter-toolbar.test.tsx |
| TC-U-602 | 1 | pass | src/features/stock-filters/filter-toolbar.test.tsx |
| TC-U-603 | 1 | pass | src/features/stock-filters/filter-toolbar.test.tsx |
| TC-U-604 | 1 | pass | src/features/stock-filters/filter-toolbar.test.tsx |
| TC-U-605 | 1 | pass | src/features/stock-filters/filter-toolbar.test.tsx |
| TC-U-620 | 1 | pass | src/features/concentration/concentration-filters.test.tsx |
| TC-U-621 | 1 | pass | src/features/concentration/concentration-filters.test.tsx |
| TC-U-622 | 1 | pass | src/features/concentration/concentration-filters.test.tsx |
| TC-U-623 | 1 | pass | src/features/concentration/concentration-filters.test.tsx |
| TC-U-640 | 1 | pass | src/features/exports/export-menu.test.tsx |
| TC-U-641 | 1 | pass | src/features/exports/export-menu.test.tsx |
| TC-U-642 | 1 | pass | src/features/exports/export-menu.test.tsx |
| TC-U-643 | 1 | pass | src/features/exports/export-menu.test.tsx |
| TC-U-644 | 1 | pass | src/features/exports/export-menu.test.tsx |
| TC-U-660 | 1 | pass | src/features/exports/backup-card.test.tsx |
| TC-U-661 | 1 | pass | src/features/exports/backup-card.test.tsx |
| TC-U-662 | 1 | pass | src/features/imports/import-wizard.test.tsx |
| TC-U-663 | 1 | pass | src/features/imports/import-wizard.test.tsx |

## Findings raised by the automation and fixed in this slice

Each was found by a test of this report, fixed in the web task that owns it, and re-run green.

| # | Found by | Finding | Fix |
|---|---|---|---|
| 1 | TC-E-103, TC-E-132 (existing) | The stocks page rendered one layout when empty and another when filled, so the Add stock dialog's `<Outlet />` changed slot and the form remounted when the first stock appeared, wiping a 409 error. | One tree for both states (T-006). |
| 2 | TC-E-502 | Sheet checkboxes read `None , 2 stocks` in Chromium (a stray space before the screen-reader suffix). | An explicit `aria-label` of `<value>, <N> stocks`. |
| 3 | TC-E-519 | The Filters button's `aria-label` failed axe `label-content-name-mismatch`. | The name is the visible text plus a screen-reader "active" (`Filters 2 active`). |
| 4 | TC-E-520 | Sheet checkbox border 1.27:1 (light) and 1.23:1 (dark), under the 3:1 non-text minimum. | `border-muted-foreground` on the sheet's checkboxes. |
| 5 | TC-E-520 | Badge remove button focus ring 2.35:1 (light) and 2.49:1 (dark). | A solid ring (`ring-2 ring-ring`). |
| 6 | TC-E-519 | The import preview scrolled without being keyboard-reachable once a file had more than a few rows (pre-existing). | The region is focusable and labelled only while its rows overflow, so short files gain no Tab stop. |
| 7 | TC-E-522 | The backup button lost keyboard focus while busy (`disabled` blurs it); the UX spec says focus stays. | `aria-disabled` and ignored clicks while busy. |
| 8 | TC-E-521 | The badge remove buttons (16 px) and the two link buttons (20 px) were under the 24 px target size. | 24 px targets. |
| 9 | the first gates | A theme change in `index.css` (not part of this slice) failed 18 AA checks; two timing races in existing tests followed the sort moving into the address. | Theme tuned to AA (`9716a0b`); the tests wait for the router (`a3ebc86`, `748ed06`). |

## Known gaps, not fixed here

- **Other checkboxes.** The shared `Checkbox` keeps `border-input` (about 1.2:1). Only the filter sheet's checkboxes were
  strengthened, because the rest of the app is outside this slice; the stock form, the holding form and the import
  options share the gap. Decide whether to change the shared component.
- **Modal overlays and axe `aria-hidden-focus`.** A Radix sheet or menu hides the page behind it and traps focus; axe reads
  the hidden page as focusable. The rule is not asked of overlay states in `sfe-a11y.spec.ts` (commented there). The overlay
  itself is still checked for contrast.
- **`TC-E-126` (Stock Lists) timing.** Sorting now goes through the address, so its two-frame timing measures the click, not
  the deferred render. It still passes; its 200 ms figure means less than before.
- **Formula cells.** Cells starting `=`, `+`, `-` or `@` are written as typed (OQ-3); Excel evaluates them. Not tested.
- **Restore** from the JSON backup is out of scope (OQ-4); `BackupV1` cases prove only that the file is well formed.

## How to reproduce

```
pnpm db:start && pnpm db:reset
pnpm test:supabase && pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:e2e            # E2E_WEB_PORT=5174 when 5173 is taken; port 3000 must be free
pnpm test:report:unit && pnpm test:report:sfe
pnpm test:e2e sfe        # only this slice (about 2.5 min)
```
