---
version: 1.0
status: active
date: 2026-11-24
requires: design.md
ux-design: ux-design.md
---

# Development Plan: Search, Filter and Export

Builds [requirements.md](requirements.md) per [design.md](design.md) and
[ux-design.md](ux-design.md). Every engineering task follows the test gate (green before, green
after, then human review). The gate is the **Investhesis gate** in `CLAUDE.md` (Tests and the
Investhesis gate), run from the repo root: `pnpm db:start && pnpm db:reset`, `pnpm test:supabase`,
`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (with `E2E_WEB_PORT`
when 5173 is taken). `.claude/rules/test-gate.md` still lists Pacta's commands (carried work in
`docs/todo.md`).

**Before T-001.** `main` is clean at the v0.4.0 release plus the planning docs. The carried item
"TC-C-114 fails under CPU load" (`docs/todo.md`) can turn the baseline red on a busy machine;
if it does, it is fixed as a baseline fix (root cause, not a re-run) before T-001 starts, since
this slice adds more timing tests of the same kind.

**Test ids.** This slice uses the 500 range: `TC-U-5xx` in the task contracts below, and
`TC-A-5xx`, `TC-C-5xx`, `TC-E-5xx` from [T-010](#t-010--design-test-cases--search-filter-and-export).
Every test title starts with its id.

## Summary

- **Total tasks** — 11 (9 engineering, 1 test design, 1 test automation)
- **Estimated effort** — about 8.5 days of agent work (S ≈ 0.4 day, M ≈ 0.75 day, L ≈ 1.5 days);
  about 5 days elapsed with the domain/API and web lanes in parallel
- **Critical path** — [T-001](#t-001--domain-stock-filters) →
  [T-005](#t-005--web-filter-state-in-the-address-and-controlled-sort) →
  [T-006](#t-006--web-filter-toolbar-sheet-and-result-line) →
  [T-007](#t-007--web-filters-on-concentration-and-the-see-concentration-link) →
  [T-011](#t-011--automate-tests--search-filter-and-export)
- **Parallel lanes** — T-001 and [T-002](#t-002--domain-export-rows-delimited-text-and-backup-format)
  start at once. API: [T-003](#t-003--api-backup-exports-module) and
  [T-004](#t-004--api-import-skips-export-only-columns) need T-002. Web: T-005 needs T-001;
  [T-008](#t-008--web-export-menu-csv-download-and-copy) needs T-002 and T-006;
  [T-009](#t-009--web-backup-card-and-import-preview-note) needs only T-002 and builds against the
  contracts in `design.md` with `StubApi`, and T-011 proves it against the real API.
  [T-010](#t-010--design-test-cases--search-filter-and-export) starts at once.

## Tasks

### T-001 — Domain: stock filters

```yaml
- title: Add STOCK_FILTERS, applyStockFilters and filterOptions to @investhesis/domain
- description: >
  New packages/domain/src/filters.ts per design.md §Filter state: the FilterKey union (market,
  exchange, held, then the CONCENTRATION_LENSES keys except market), STOCK_FILTERS in the order
  of ux-design.md §Filter sheet (key, label from LENS_LABELS plus "Market", "Exchange", "Held",
  kind single|multi, vocabulary or 'fromData', getter), a structural FilterableStock type
  (GroupableStock plus ticker, name, exchange), FilterState { q, picks: Map<FilterKey,
  Set<string | null>> }, applyStockFilters(stocks, state) (search on ticker, name, themes with
  toLocaleLowerCase('en'); OR within a filter, AND across; null = Not set; multi-value: any
  value picked, or null picked and the list empty; held yes|no), and filterOptions(stocks)
  returning per filter the options in vocabulary order (free text: distinct values,
  case-insensitive, first spelling kept, sorted with an en collator) with counts, plus the Not set
  count. Exported from index.ts. Erasable syntax only. Covers FR-001 to FR-004, NFR-001.
- agent: software-engineer-backend
- depends_on: []
- status: done
- size: M
```

#### Acceptance criteria

- [ ] `pnpm --filter @investhesis/domain test:coverage` stays at or above 95% lines
- [ ] `applyStockFilters` on 200 stocks with a search and 4 active filters runs in under 10 ms in a Vitest timing test
- [ ] `CONCENTRATION_LENSES` is reused for the lens getters (no second copy of a lens accessor)
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-500
    scenario: search matches ticker, name and theme, ignoring case and spaces
    given: stocks PTT (name "PTT Public Company Limited"), NVDA (themes ["AI"]), KBANK
    when: applyStockFilters with q "  ptt ", then "ai", then "public"
    then: [PTT], [NVDA], [PTT]
    test_data:
      input: { q: ["  ptt ", "ai", "public"] }
      expected: [["PTT"], ["NVDA"], ["PTT"]]
  - id: TC-U-501
    scenario: Thai text is matched as typed
    given: PTTEP with name "บริษัท ปตท. สำรวจและผลิตปิโตรเลียม จำกัด (มหาชน)"
    when: q "ปตท."
    then: [PTTEP]
    test_data:
      input: { q: "ปตท." }
      expected: ["PTTEP"]
  - id: TC-U-502
    scenario: OR within a filter, AND across filters
    given: A (TH, Cyclical), B (TH, Defensive), C (US, Cyclical)
    when: picks { market: [TH], economicCycle: [Cyclical, Defensive] }
    then: [A, B]
    test_data:
      input: { market: ["TH"], economicCycle: ["Cyclical", "Defensive"] }
      expected: ["A", "B"]
  - id: TC-U-503
    scenario: Not set on a single-value field, and None is an ordinary value
    given: A valueChainPosition null, B "None", C "Upstream"
    when: picks { valueChainPosition: [null] }, then { valueChainPosition: ["None"] }
    then: [A], then [B]
    test_data:
      input: [{ valueChainPosition: [null] }, { valueChainPosition: ["None"] }]
      expected: [["A"], ["B"]]
  - id: TC-U-504
    scenario: multi-value fields match any picked value, Not set matches an empty list
    given: A themes ["AI", "EV"], B themes [], C themes ["GLP-1"]
    when: picks { themes: ["EV", "GLP-1"] }, then { themes: [null] }, then { themes: ["ev"] }
    then: [A, C], then [B], then [A] (free-text match ignores case)
    test_data:
      input: [{ themes: ["EV", "GLP-1"] }, { themes: [null] }, { themes: ["ev"] }]
      expected: [["A", "C"], ["B"], ["A"]]
  - id: TC-U-505
    scenario: held filter
    given: A holding { shares: "10.0000", ... }, B holding { shares: null, averageCost: null }, C holding null
    when: picks { held: [yes] }, then { held: [no] }, then { held: [yes, no] }
    then: [A, B], then [C], then [A, B, C]
    test_data:
      input: [{ held: ["yes"] }, { held: ["no"] }, { held: ["yes", "no"] }]
      expected: [["A", "B"], ["C"], ["A", "B", "C"]]
  - id: TC-U-506
    scenario: empty state keeps every stock in input order
    given: stocks [C, A, B]
    when: applyStockFilters with q "" and no picks
    then: [C, A, B] (a new array; the input is not changed)
    test_data:
      input: { q: "", picks: {} }
      expected: ["C", "A", "B"]
  - id: TC-U-507
    scenario: filterOptions counts vocabulary values, zeros and Not set
    given: 3 stocks with economicCycle Cyclical, Cyclical, null
    when: filterOptions(stocks).economicCycle
    then: Cyclical 2, Sensitive 0, Defensive 0, then Not set 1, in vocabulary order
    test_data:
      input: { economicCycle: ["Cyclical", "Cyclical", null] }
      expected: [["Cyclical", 2], ["Sensitive", 0], ["Defensive", 0], [null, 1]]
  - id: TC-U-508
    scenario: free-text options are de-duplicated case-insensitively, first spelling kept, sorted
    given: themes ["AI"], ["ai", "EV"], ["Dividend"]
    when: filterOptions(stocks).themes
    then: AI 2, Dividend 1, EV 1, Not set 0
    test_data:
      input: [["AI"], ["ai", "EV"], ["Dividend"]]
      expected: [["AI", 2], ["Dividend", 1], ["EV", 1], [null, 0]]
  - id: TC-U-509
    scenario: STOCK_FILTERS order and labels
    given: the module
    when: STOCK_FILTERS.map(f => f.key)
    then: market, held, exchange, gicsSector, setIndustryGroup, valueChainPosition, valueChain, size, style, economicCycle, lynchType, lifeCycle, customers, revenueTypes, moat, themes, volatility, indexMembership
    test_data:
      input: STOCK_FILTERS
      expected: 18 keys in that order
```

**Notes** — The order in TC-U-509 is the sheet's order (Market, Held, Exchange, then lenses). Lens
getters come from `CONCENTRATION_LENSES`; market and exchange read the stock directly.

### T-002 — Domain: export rows, delimited text and backup format

```yaml
- title: Add EXPORT_COLUMNS, exportRow, toDelimited and BackupV1 to @investhesis/domain
- description: >
  New packages/domain/src/export.ts per design.md §CSV row and §Backup JSON: EXPORT_COLUMNS
  (TEMPLATE_COLUMNS headers, then lists, held, shares, average_cost, cost_currency),
  EXPORT_ONLY_HEADERS, exportRow(stock, listNamesById) (sector/gics_sector by market, `;` joins,
  list names sorted with an en collator, held yes|no, decimals as given, empty for null),
  toDelimited(rows, ',' | '\t') (RFC 4180 quoting of fields with the separator, ", CR or LF;
  CRLF line ends; no BOM; no formula escaping), BACKUP_FORMAT = 'investhesis-backup' and the
  Zod BackupV1 schema (format, formatVersion 1, exportedAt ISO, stocks without listIds, lists
  with stockIds, settings). Covers FR-012, FR-014, FR-016, NFR-005, NFR-008.
- agent: software-engineer-backend
- depends_on: []
- status: done
- size: M
```

#### Acceptance criteria

- [ ] `pnpm --filter @investhesis/domain test:coverage` stays at or above 95% lines
- [ ] `exportRow` output fed through `canonicaliseRow` returns the same `StockInput` for a US and a TH stock with every lens set (round-trip test)
- [ ] `BackupV1` is exported with its inferred TypeScript type for the API and web
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-520
    scenario: EXPORT_COLUMNS is the template then the export-only columns
    given: the module
    when: EXPORT_COLUMNS
    then: the 19 TEMPLATE_COLUMNS headers in order, then lists, held, shares, average_cost, cost_currency
    test_data:
      input: EXPORT_COLUMNS
      expected: 24 headers; [19..23] = ["lists", "held", "shares", "average_cost", "cost_currency"]
  - id: TC-U-521
    scenario: a US stock puts GICS in sector and leaves gics_sector empty
    given: NVDA US NASDAQ gicsSector "Information Technology", indexMembership ["S&P 500", "Nasdaq-100"], not held, no lists
    when: exportRow(stock, new Map())
    then: sector "Information Technology", gics_sector "", index_membership "S&P 500;Nasdaq-100", lists "", held "no", shares "", average_cost "", cost_currency ""
    test_data:
      input: NVDA
      expected: { sector: "Information Technology", gics_sector: "", index_membership: "S&P 500;Nasdaq-100", held: "no" }
  - id: TC-U-522
    scenario: a TH stock puts the SET group in sector and GICS in gics_sector
    given: PTTEP TH SET setIndustryGroup "Resources", gicsSector "Energy"
    when: exportRow
    then: sector "Resources", gics_sector "Energy"
    test_data:
      input: PTTEP
      expected: { sector: "Resources", gics_sector: "Energy" }
  - id: TC-U-523
    scenario: holdings columns
    given: A holding { shares: "1000.0000", averageCost: "120.5000", costCurrency: "THB" }; B holding { shares: null, averageCost: null, costCurrency: "USD" }
    when: exportRow for each
    then: A yes, "1000.0000", "120.5000", THB; B yes, "", "", USD
    test_data:
      input: [A, B]
      expected: [["yes", "1000.0000", "120.5000", "THB"], ["yes", "", "", "USD"]]
  - id: TC-U-524
    scenario: list names sorted and joined, unknown ids ignored
    given: listIds [l2, l1, gone]; names { l1: "core", l2: "Watching" }
    when: exportRow
    then: lists "core;Watching"
    test_data:
      input: { listIds: ["l2", "l1", "gone"] }
      expected: "core;Watching"
  - id: TC-U-525
    scenario: toDelimited quoting with a comma separator
    given: rows [["a,b", "say \"hi\"", "line1\nline2", "=1+1", "plain"]]
    when: toDelimited(rows, ',')
    then: "\"a,b\",\"say \"\"hi\"\"\",\"line1\nline2\",=1+1,plain\r\n"
    test_data:
      input: [["a,b", "say \"hi\"", "line1\nline2", "=1+1", "plain"]]
      expected: "\"a,b\",\"say \"\"hi\"\"\",\"line1\nline2\",=1+1,plain\r\n"
  - id: TC-U-526
    scenario: toDelimited with a tab separator quotes tabs, not commas
    given: rows [["a,b", "c\td"]]
    when: toDelimited(rows, '\t')
    then: "a,b\t\"c\td\"\r\n"
    test_data:
      input: [["a,b", "c\td"]]
      expected: "a,b\t\"c\td\"\r\n"
  - id: TC-U-527
    scenario: BackupV1 accepts a full and an empty backup
    given: a backup with one stock, one list, settings; and one with [] and default settings
    when: BackupV1.parse
    then: both parse
    test_data:
      input: [fullBackup, { format: "investhesis-backup", formatVersion: 1, exportedAt: "2026-11-24T09:30:00.000Z", stocks: [], lists: [], settings: { concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null } }]
      expected: ok, ok
  - id: TC-U-528
    scenario: BackupV1 rejects a wrong format or version and a stock with listIds
    given: format "other"; formatVersion 2; a stock carrying listIds
    when: BackupV1.safeParse
    then: each fails with the offending path
    test_data:
      input: [{ format: "other" }, { formatVersion: 2 }, { stocks: [{ listIds: [] }] }]
      expected: [["format"], ["formatVersion"], ["stocks", 0, "listIds"]]
```

**Notes** — The web's `buildErrorCsv` moves to `toDelimited` in T-008, not here, so this task
touches only `packages/domain`.

### T-003 — API: backup exports module

```yaml
- title: Serve GET /exports/backup.json and GET /exports/backup.csv
- description: >
  New apps/api/src/modules/exports (exports.routes.ts → exports.service.ts) per design.md
  §API Contracts and ADR-005: buildBackup(db, userId) inside db.transaction with isolationLevel
  'repeatable read' and accessMode 'read only', reading listOwnedStocks (stocks with holding and
  listIds), listLists, one membership query ordered by added_at then stock_id (new
  listMembershipsForUser in lists.repository.ts), and findSettings with defaults. JSON: BackupV1
  shape (stocks without listIds, ordered by market then ticker; lists by name with stockIds),
  exportedAt from an injectable clock. CSV: BOM + toDelimited([EXPORT_COLUMNS, ...exportRow]).
  content-disposition attachment with the UTC date; OpenAPI declares both (JSON with the
  BackupV1 schema, CSV as text/csv); bearerAuth like every route; 503 db_unavailable without a
  database. Register in app.ts. Covers FR-015 to FR-017, NFR-002 to NFR-004.
- agent: software-engineer-backend
- depends_on: [T-002]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] Every JSON backup in the tests parses with `BackupV1`
- [ ] A log-capture test of a backup for a held stock with a rate finds no shares, cost or rate value in any log line
- [ ] A timed test with 1,000 stocks (with holdings) and 20 lists answers within 2 s p95 for both routes (logged, as `stocks.latency.test.ts`)
- [ ] `pnpm --filter @investhesis/api test:coverage` keeps 85% lines for `src/modules/exports/`; the coverage config includes the new module
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-540
    scenario: a full JSON backup
    given: user U with PTT (TH, held 1000 @ 34.5 THB) and AAPL (US, not held), list "Core" with [AAPL, PTT] added in that order, settings threshold 35 and rate 34.045
    when: GET /exports/backup.json as U at a fixed clock 2026-11-24T09:30:00Z
    then: 200 application/json; content-disposition attachment; filename="investhesis-backup-2026-11-24.json"; stocks [PTT, AAPL] (market order TH then US, then ticker); lists[0].stockIds [AAPL.id, PTT.id] (added order); settings { 35, "34.045000", <time> }; no listIds on stocks; no userId anywhere
    test_data:
      input: { user: U }
      expected: { stocks: ["PTT", "AAPL"], lists: [{ name: "Core", stockIds: ["AAPL", "PTT"] }], settings: { concentrationThreshold: 35, usdThbRate: "34.045000" } }
  - id: TC-U-541
    scenario: an empty account
    given: user V with no rows
    when: GET /exports/backup.json and GET /exports/backup.csv
    then: JSON with [] stocks and lists and settings { 40, null, null }; CSV is BOM + the 24-column header + CRLF only
    test_data:
      input: { user: V }
      expected: { json: { stocks: [], lists: [], settings: { concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null } }, csvLines: 1 }
  - id: TC-U-542
    scenario: the CSV backup rows
    given: user U as in TC-U-540
    when: GET /exports/backup.csv
    then: 200 text/csv; charset=utf-8; starts with ﻿; header EXPORT_COLUMNS; row PTT has held yes, shares "1000.0000", cost_currency THB, lists Core; row AAPL held no
    test_data:
      input: { user: U }
      expected: { rows: [["PTT", "TH", "...", "Core", "yes", "1000.0000", "34.5000", "THB"], ["AAPL", "US", "...", "Core", "no", "", "", ""]] }
  - id: TC-U-543
    scenario: another user's rows never appear
    given: users U and W each with stocks and a list
    when: GET /exports/backup.json as U
    then: only U's stock and list ids appear
    test_data:
      input: { as: U }
      expected: no id of W in the body
  - id: TC-U-544
    scenario: authentication and database errors
    given: no bearer token; then an app built without a database
    when: GET /exports/backup.json and .csv
    then: 401 unauthenticated with WWW-Authenticate Bearer; 503 db_unavailable (problem+json)
    test_data:
      input: [{ token: none }, { db: none }]
      expected: [401, 503]
```

**Notes** — Market order is alphabetical (`TH` before `US`) per design.md; the test fixes that so
the order is never ambiguous. Use `buildTestApp` / `appFor` with random user ids.

### T-004 — API: import skips export-only columns

```yaml
- title: Recognise export-only columns in the import and report them in ignoredColumns
- description: >
  In apps/api/src/modules/imports per design.md §Imports (changed) and ADR-006: mapHeaders treats
  EXPORT_ONLY_HEADERS (from the domain) as known but unmapped — no "Unknown column" warning, still
  under the duplicate-header rule — and returns ignoredColumns (as written in the file, in file
  order). The preview response gains ignoredColumns: string[] (OpenAPI updated); confirm behaves
  as before and never writes lists or holdings from those columns. Covers FR-014.
- agent: software-engineer-backend
- depends_on: [T-002]
- status: backlog
- size: S
```

#### Acceptance criteria

- [ ] A file built with `exportRow` for two stocks previews with no header warnings and both rows `new` for an empty user, and confirms with both stocks created and no holding or list membership
- [ ] Existing import tests pass unchanged apart from the added `ignoredColumns: []` in whole-body assertions
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-560
    scenario: export-only headers are known, ignored and listed
    given: header ["ticker", "market", "exchange", "name", "Lists", "held", "shares", "average_cost", "cost_currency"]
    when: mapHeaders(header)
    then: warnings []; ignoredColumns ["Lists", "held", "shares", "average_cost", "cost_currency"]; index has no entry for them
    test_data:
      input: ["ticker", "market", "exchange", "name", "Lists", "held", "shares", "average_cost", "cost_currency"]
      expected: { warnings: [], ignoredColumns: ["Lists", "held", "shares", "average_cost", "cost_currency"] }
  - id: TC-U-561
    scenario: a repeated export-only header is a duplicate
    given: header ["ticker", "market", "exchange", "name", "held", "HELD"]
    when: mapHeaders
    then: warnings ['Duplicate column "HELD" ignored']; ignoredColumns ["held"]
    test_data:
      input: ["ticker", "market", "exchange", "name", "held", "HELD"]
      expected: { warnings: ["Duplicate column \"HELD\" ignored"], ignoredColumns: ["held"] }
  - id: TC-U-562
    scenario: a template-only file has no ignored columns
    given: the 19 template headers
    when: POST /imports/preview
    then: ignoredColumns []
    test_data:
      input: template.csv
      expected: { ignoredColumns: [] }
  - id: TC-U-563
    scenario: confirm does not apply holdings or lists from the file
    given: empty user U; an exported CSV with PTT held 1000 and lists "Core"
    when: POST /imports (duplicateMode skip, no target list)
    then: PTT created with holding null and listIds []; no list named Core exists
    test_data:
      input: { row: { ticker: "PTT", held: "yes", shares: "1000.0000", lists: "Core" } }
      expected: { holding: null, listIds: [], lists: [] }
```

### T-005 — Web: filter state in the address and controlled sort

```yaml
- title: Read and write search, filters and sort in the address; make StockTable sort controlled
- description: >
  New apps/web/src/features/stock-filters/filter-address.ts per design.md §Address and ADR-003:
  readFilters(params) → { state: FilterState, sort, notes } (repeatable params by FilterKey, empty
  value = Not set, values matched to the vocabulary case-insensitively and kept canonical,
  free-text kept as typed; unknown param names ignored; a known filter with an unknown value, a
  repeated q/sort/dir or an unknown sort dropped with one note each), filterSearch(state, sort)
  (STOCK_FILTERS order, vocabulary order, default sort not written), and use-filter-state.ts
  (useSearchParams, setSearchParams with replace, useDeferredValue for the rendered state).
  StockTable takes sort and onSort (no internal state); /stocks and /lists/:id keep sort in
  sort/dir. Add shouldRevalidate to the /stocks and /lists/:id routes (re-read only on a form
  submit or a path change), as concentration-routes.tsx does. No visible filter UI yet. Covers
  FR-006, FR-007 (sort part), NFR-001.
- agent: react-vite-developer
- depends_on: [T-001]
- status: done
- size: M
```

#### Acceptance criteria

- [ ] Changing only the query string on `/stocks` or `/lists/:id` sends no API request (StubApi request count, as TC-E-406)
- [ ] Sorting a column writes `sort`/`dir`; reload restores it; the default sort leaves the address bare
- [ ] Every existing `StockTable` caller and test passes with the controlled sort
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-580
    scenario: read filters, Not set and canonical spelling
    given: "?q=ptt&market=th&economicCycle=Cyclical&economicCycle=&themes=ai"
    when: readFilters
    then: q "ptt"; market {TH}; economicCycle {Cyclical, null}; themes {"ai"}; notes []
    test_data:
      input: "?q=ptt&market=th&economicCycle=Cyclical&economicCycle=&themes=ai"
      expected: { q: "ptt", picks: { market: ["TH"], economicCycle: ["Cyclical", null], themes: ["ai"] }, notes: [] }
  - id: TC-U-581
    scenario: bad parts are dropped with one note each; unknown names are ignored silently
    given: "?market=Bitcoin&sort=price&q=a&q=b&utm_source=mail"
    when: readFilters
    then: no market pick, default sort, q "", three notes, utm_source ignored without a note
    test_data:
      input: "?market=Bitcoin&sort=price&q=a&q=b&utm_source=mail"
      expected: { picks: {}, sort: { column: "ticker", direction: "asc" }, q: "", notes: 3 }
  - id: TC-U-582
    scenario: filterSearch is canonical
    given: state { picks: { economicCycle: [Defensive, null, Cyclical], market: [TH] }, q: "ptt" }, sort held desc
    when: filterSearch
    then: "?q=ptt&market=TH&economicCycle=Cyclical&economicCycle=Defensive&economicCycle=&sort=held&dir=desc"
    test_data:
      input: { q: "ptt", market: ["TH"], economicCycle: ["Defensive", null, "Cyclical"], sort: ["held", "desc"] }
      expected: "?q=ptt&market=TH&economicCycle=Cyclical&economicCycle=Defensive&economicCycle=&sort=held&dir=desc"
  - id: TC-U-583
    scenario: round trip
    given: any state from TC-U-580
    when: readFilters(filterSearch(state, sort))
    then: the same state and sort, no notes
    test_data:
      input: TC-U-580 state
      expected: equal state
  - id: TC-U-584
    scenario: Thai search text survives the address
    given: q "ปตท."
    when: filterSearch then readFilters
    then: q "ปตท."
    test_data:
      input: { q: "ปตท." }
      expected: { q: "ปตท." }
```

### T-006 — Web: filter toolbar, sheet and result line

```yaml
- title: Build FilterToolbar, the filter sheet, the result line and the no-match state on /stocks and /lists/:id
- description: >
  Implement per ux-design.md §Filter toolbar and result line, §Filter sheet, §Stocks and §List
  detail: search InputGroup with clear (Esc clears), Filters button with the active count, the
  Sheet (right from sm, bottom below; sections as Collapsible fieldsets in STOCK_FILTERS order;
  Market, Held and active sections open; Find input on sections with more than 8 options; Not
  set last in italics; counts from filterOptions over the page's base set; live count in the
  sheet description; Clear all keeps the sheet open; Show N stocks closes), the result line (polite
  status count "N of M stocks", removable badges per filter and the search, Clear all, focus rules
  on removal), the address notes Alert, and the NoMatches card. /stocks filters all stocks;
  /lists/:id filters the members, and an empty list keeps its empty card with no toolbar. The
  Export button and See concentration link are placeholders for T-007/T-008 (not rendered yet).
  Covers FR-001 to FR-005, FR-007, FR-008, NFR-006, NFR-007.
- agent: react-vite-developer
- depends_on: [T-005]
- status: backlog
- size: L
```

#### Acceptance criteria

- [ ] Typing, picking and removing filters update the table, the count and the address with no API request
- [ ] The sheet is keyboard-operable end to end and returns focus to Filters on close
- [ ] At 360 px the toolbar and badges wrap with no horizontal page scroll (Testing Library cannot measure this; T-011 checks it in E2E)
- [ ] A 200-stock keystroke test re-renders in under 200 ms (as TC-C-114)
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-600
    scenario: search narrows the table and the count
    given: /stocks with 42 stocks, 3 containing "ptt"
    when: type "ptt" in Search stocks
    then: 3 rows; status "3 of 42 stocks"; address q=ptt; a badge "Search: ptt"
    test_data:
      input: { q: "ptt" }
      expected: { rows: 3, status: "3 of 42 stocks" }
  - id: TC-U-601
    scenario: picking in the sheet applies at once
    given: the sheet open on /stocks
    when: tick Market TH then Economic cycle Cyclical
    then: table and sheet description show the filtered count; Filters button reads "Filters, 2 active"; Show N stocks closes and focus returns to Filters
    test_data:
      input: { market: ["TH"], economicCycle: ["Cyclical"] }
      expected: { activeFilters: 2 }
  - id: TC-U-602
    scenario: removing a badge and Clear all
    given: q "ptt" and two filters
    when: remove the Market badge; then Clear all
    then: Market gone, focus on the next badge; then every filter and the search gone, focus in the search box, address bare
    test_data:
      input: { remove: "Market", then: "Clear all" }
      expected: { address: "/stocks" }
  - id: TC-U-603
    scenario: no match vs no stocks
    given: /stocks with stocks and q "zzz"; and an account with no stocks
    when: render
    then: "No stocks match" with Clear all; the existing "No stocks yet" card
    test_data:
      input: [{ q: "zzz" }, { stocks: [] }]
      expected: ["No stocks match", "No stocks yet"]
  - id: TC-U-604
    scenario: list page filters members only
    given: list "Core" with 2 TH and 1 US member; 40 other stocks
    when: open /lists/core?market=TH
    then: 2 rows; status "2 of 3 stocks"; Market option counts TH 2, US 1
    test_data:
      input: { list: "Core", market: ["TH"] }
      expected: { rows: 2, counts: { TH: 2, US: 1 } }
  - id: TC-U-605
    scenario: address notes
    given: /stocks?market=Bitcoin
    when: render
    then: an Alert (role status) with one note naming Market; the table shows every stock; the address is unchanged
    test_data:
      input: "?market=Bitcoin"
      expected: { notes: 1 }
```

### T-007 — Web: filters on concentration and the See concentration link

```yaml
- title: Apply the filters on /concentration and link to it from /stocks and /lists/:id
- description: >
  Per design.md §Web (To concentration, Concentration) and ux-design.md §Concentration: the
  concentration page renders FilterToolbar without Export; readView keeps scope/lens/measure and
  readFilters reads the rest; planView groups applyStockFilters(stocksInScope(...)); viewSearch
  writes scope, lens, measure, then filterSearch's params (no sort); the line reads "N of M
  stocks in scope" (or "M stocks in scope" unfiltered); filters that leave nothing show the
  no-match card instead of the summary and table; filter option counts are over the scope. The
  result line on /stocks and /lists/:id gains See concentration → building
  /concentration?scope=<all|listId>&lens=gicsSector&measure=count + the filter params. Keep
  TC-E-406 and TC-E-419 passing. Covers FR-009, FR-010.
- agent: react-vite-developer
- depends_on: [T-006]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] A filter change on `/concentration` regroups with no API request
- [ ] Count and value shares, flags and the left-out note are computed over the filtered stocks only
- [ ] All existing concentration tests pass
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-620
    scenario: concentration over filtered stocks
    given: scope all with 10 stocks (6 TH: 4 Energy, 2 Financials; 4 US Information Technology); threshold 40
    when: open /concentration?scope=all&lens=gicsSector&measure=count&market=TH
    then: "6 of 10 stocks in scope"; groups Energy 4 (66.7%, flagged), Financials 2 (33.3%); no Information Technology group
    test_data:
      input: "?scope=all&lens=gicsSector&measure=count&market=TH"
      expected: { line: "6 of 10 stocks in scope", groups: [["Energy", 4, "66.7%"], ["Financials", 2, "33.3%"]] }
  - id: TC-U-621
    scenario: See concentration from a filtered list page
    given: /lists/L1?q=ptt&held=yes&sort=name
    when: follow See concentration
    then: lands on /concentration?scope=L1&lens=gicsSector&measure=count&q=ptt&held=yes (no sort)
    test_data:
      input: "/lists/L1?q=ptt&held=yes&sort=name"
      expected: "/concentration?scope=L1&lens=gicsSector&measure=count&q=ptt&held=yes"
  - id: TC-U-622
    scenario: changing lens keeps the filters
    given: /concentration?scope=all&lens=gicsSector&measure=count&market=TH
    when: pick Group by Economic cycle
    then: address ?scope=all&lens=economicCycle&measure=count&market=TH
    test_data:
      input: { lens: "economicCycle" }
      expected: "?scope=all&lens=economicCycle&measure=count&market=TH"
  - id: TC-U-623
    scenario: filters that leave nothing in scope
    given: scope held with 3 held stocks, none TH
    when: add market=TH
    then: "0 of 3 stocks in scope" and the no-match card; no flagged summary
    test_data:
      input: "?scope=held&market=TH"
      expected: { line: "0 of 3 stocks in scope", card: "No stocks match" }
```

### T-008 — Web: export menu, CSV download and copy

```yaml
- title: Add the Export menu with Download CSV and Copy as table on /stocks and /lists/:id
- description: >
  Per design.md §Web (Export menu, File names) and ux-design.md §Stocks: features/exports with
  ExportMenu (DropdownMenu: Download CSV (N stocks), Copy as table (N rows), Back up all data… →
  /import-export; disabled with "No stocks to export" at 0), export-file-name.ts
  (exportFileName for investhesis-stocks-YYYY-MM-DD.csv and investhesis-<list>-YYYY-MM-DD.csv,
  local date, sanitised list name, cut to 60 code points, fallback "list"), csv built as BOM +
  toDelimited([EXPORT_COLUMNS, ...shown.map(exportRow)], ',') from the filtered and sorted rows,
  saveFile; copy-rows.ts writing the same rows with '\t' and no BOM via
  navigator.clipboard.writeText in the click handler, toast "Copied N rows" or the refusal error.
  Switch features/imports/error-csv.ts to toDelimited (behaviour unchanged). Covers FR-011 to
  FR-013, NFR-002 (browser part).
- agent: react-vite-developer
- depends_on: [T-002, T-006]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] The downloaded CSV holds exactly the shown rows in the shown order
- [ ] The CSV for 1,000 stocks is built in under 1 s in a Vitest timing test
- [ ] Existing import error-CSV tests pass unchanged
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-640
    scenario: download the filtered, sorted rows
    given: /stocks?market=TH&sort=ticker&dir=desc with PTTEP, PTT, KBANK
    when: Export → Download CSV
    then: saveFile called once with "investhesis-stocks-2026-11-24.csv" (clock fixed, local time); text starts with ﻿; header EXPORT_COLUMNS; rows PTTEP, PTT, KBANK in that order
    test_data:
      input: { now: "2026-11-24T23:30:00+07:00" }
      expected: { filename: "investhesis-stocks-2026-11-24.csv", tickers: ["PTTEP", "PTT", "KBANK"] }
  - id: TC-U-641
    scenario: list file names are sanitised
    given: list names "Core / Swing: 2026?", "???", and a 70-character name
    when: exportFileName
    then: "/", ":" and "?" become "-", runs of "-" collapse, spaces and "-" are trimmed from both ends; "???" leaves nothing so "list" is used; the long name is cut to 60 code points
    test_data:
      input: ["Core / Swing: 2026?", "???", "x".repeat(70)]
      expected: ["investhesis-Core - Swing- 2026-2026-11-24.csv", "investhesis-list-2026-11-24.csv", "investhesis-" + "x".repeat(60) + "-2026-11-24.csv"]
  - id: TC-U-642
    scenario: copy as tab-separated text
    given: 2 shown rows; clipboard.writeText resolves
    when: Export → Copy as table
    then: writeText called with header + 2 rows joined by tabs, CRLF, no BOM; toast "Copied 2 rows"
    test_data:
      input: { rows: 2 }
      expected: { toast: "Copied 2 rows", startsWithBom: false }
  - id: TC-U-643
    scenario: copy refused
    given: clipboard.writeText rejects (and, separately, navigator.clipboard undefined)
    when: Copy as table
    then: error toast pointing to Download CSV; no success toast
    test_data:
      input: [reject, undefined]
      expected: "Couldn't copy: your browser blocked the clipboard. Use Download CSV instead."
  - id: TC-U-644
    scenario: nothing to export
    given: filters that match no stock
    when: open the Export menu
    then: Download CSV and Copy as table are disabled, with "No stocks to export"
    test_data:
      input: { shown: 0 }
      expected: disabled
```

### T-009 — Web: backup card and import preview note

```yaml
- title: Replace the Export placeholder on /import-export with backup downloads; add the ignored-columns note
- description: >
  Per ux-design.md §Import / export and §Export card: the Export card with Download JSON
  (default) and Download CSV (outline), each calling api.download('/exports/backup.json' |
  '/exports/backup.csv') then saveFile(blob, investhesis-backup-<local date>.json|csv); a
  loading state per button (spinner with motion-reduce:animate-none, "Preparing…", aria-busy),
  an error Alert (role alert) cleared on the next click, the notes text; page description
  "Import stocks from CSV or Excel, or download all your data." The import wizard's preview
  shows an Alert (role status, InfoIcon) listing ignoredColumns when not empty. Add both routes
  to StubApi scripts in tests. Covers FR-014 (web part), FR-015 to FR-017 (web part).
- agent: react-vite-developer
- depends_on: [T-002]
- status: backlog
- size: S
```

#### Acceptance criteria

- [ ] Both downloads save a file named by the local date, from the bytes the API returned
- [ ] The spinner test (every spinner has `motion-reduce:animate-none`) still passes
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-660
    scenario: download the JSON backup
    given: StubApi "DOWNLOAD /exports/backup.json" returns a blob; clock 2026-11-24 local
    when: click Download JSON
    then: button busy then idle; saveFile(blob, "investhesis-backup-2026-11-24.json")
    test_data:
      input: { route: "/exports/backup.json" }
      expected: { filename: "investhesis-backup-2026-11-24.json" }
  - id: TC-U-661
    scenario: a failed backup
    given: the CSV route answers 503
    when: click Download CSV
    then: Alert role alert "Couldn't download the backup. Check your connection and try again."; Download JSON still enabled; the alert clears on the next click
    test_data:
      input: { status: 503 }
      expected: alert shown
  - id: TC-U-662
    scenario: the import preview names ignored columns
    given: preview response with ignoredColumns ["lists", "held"]
    when: the wizard shows the review step
    then: a status note "Lists and holdings columns are not imported: lists, held."
    test_data:
      input: { ignoredColumns: ["lists", "held"] }
      expected: note shown
  - id: TC-U-663
    scenario: no note for a template file
    given: ignoredColumns []
    when: review step
    then: no ignored-columns note
    test_data:
      input: { ignoredColumns: [] }
      expected: no note
```

### T-010 — Design test cases — search, filter and export

```yaml
- title: Design test cases — search, filter and export
- description: >
  Using the software-tester-design skill, produce structured TC-xxx test cases covering
  all test levels: unit boundaries, API (happy path + error paths + auth), frontend
  component, and E2E flows. Run Steps 0–4 (SUT definition → business flow → field specs
  → scenarios → test data). Output must be in TC-xxx format for software-tester-automation.
  Inputs: requirements.md, design.md, ux-design.md of this slice. Ids in the 500 range
  (TC-A-5xx API, TC-C-5xx component, TC-E-5xx E2E), not reusing the TC-U-5xx ids above. Must
  cover every FR and NFR; the address round trip including Back from a stock page and reload;
  "Not set" vs "None"; Thai search; the export → import round trip into a fresh user
  (NFR-005); two-user isolation and the log-privacy proof for the backup (NFR-003, NFR-004);
  the no-request proofs on all three pages (NFR-001); clipboard refusal; the 360 px and
  keyboard-only paths with the sheet; and the contrast points ux-design.md leaves to E2E (badge
  remove focus ring, the sheet in dark mode, checkbox border). Save as
  docs/features/search-filter-export/v1.0/test-cases.md.
- agent: software-tester-design
- depends_on: []
- status: done
- size: M
```

#### Acceptance criteria

- [ ] SUT definition documented
- [ ] TC-xxx cases cover happy path, boundaries, error paths, and business rules
- [ ] Each TC includes Level, Input, Expected Output, Preconditions, and Mock needed
- [ ] A traceability table maps every FR-001–FR-017 and NFR-001–NFR-008 to at least one TC

**Notes** — Runs in parallel with engineering tasks; depends only on requirements/design, not on code.

### T-011 — Automate tests — search, filter and export

```yaml
- title: Automate tests — search, filter and export
- description: >
  Using the software-tester-automation skill, convert the TC-xxx cases from T-010 into
  runnable scripts at the appropriate levels (Unit, API, Frontend Component, E2E).
  Run the full suite against the implementation. E2E specs are e2e/sfe-*.spec.ts on the
  existing Playwright setup (admin-created users through e2e/lib/sl.ts helpers, real API, local
  Supabase): search and filter then Back from a stock page; reload keeps the view; a filtered
  list to concentration; download the CSV (Playwright download) and import it into a fresh user;
  download both backups and parse the JSON with BackupV1; copy with granted and denied clipboard
  permissions; axe in light and dark with the sheet open (extend e2e/lib/states.ts); 360 px with
  the bottom sheet and no horizontal scroll; keyboard-only filtering. Add apiAs helpers for the
  backup routes. Add the slice's TC ids to a test report script (pnpm test:report:sfe) and write
  docs/features/search-filter-export/v1.0/test-report.md; update CLAUDE.md for the new module,
  routes, address params and commands.
- agent: software-tester-automation
- depends_on: [T-001, T-002, T-003, T-004, T-005, T-006, T-007, T-008, T-009, T-010]
- status: backlog
- size: L
```

#### Acceptance criteria

- [ ] All TC-* from T-010 automated and passing (findings pinned with `test.fail` and a finding id only with the owner's agreement)
- [ ] Coverage >= 95% lines for `packages/domain`; >= 85% for `apps/api/src/modules/{imports,exports}`; >= 70% for `apps/web/src/features`
- [ ] Test report produced with pass/fail per TC-id
- [ ] The full Investhesis gate is green

**Notes** — Report "T-011 done" with the full test report when all TCs pass. Any contrast failure
found here goes back to the owning web task as a fix.

## Status Legend

| Status | Changed By | Meaning |
|--------|-----------|---------|
| `backlog` | Orchestrator | Ready, waiting to be picked up |
| `doing` | Orchestrator / Agent | Agent actively working |
| `blocked` | Agent | Stuck, needs human intervention |
| `test` | Agent | Dev done, needs testing |
| `review` | Agent / Tester | Human must review before advancing |
| `done` | Human | Approved and complete |
