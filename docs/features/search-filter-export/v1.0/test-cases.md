---
version: 1.0
status: draft
date: 2026-11-24
requires: requirements.md, design.md, ux-design.md, dev-plan.md
task: T-010
---

# Test Cases: Search, Filter and Export

Test design for [requirements.md](requirements.md), [design.md](design.md) and
[ux-design.md](ux-design.md). It keeps the 52 `TC-U-5xx` cases already written into tasks T-001 to
T-009 of [dev-plan.md](dev-plan.md) (same ids, none renumbered; section 6 indexes them) and adds
three series: `TC-A-5xx` (API, database, import), `TC-C-5xx` (web component and static) and
`TC-E-5xx` (end to end). `software-tester-automation` (T-011) turns every case into a test whose
title starts with its id.

**ID scheme.** Stock Lists owns 1xx, Holdings and Concentration 4xx, User Auth 0xx. This slice uses
the 500 range only: `TC-A-500..514`, `TC-C-500..531`, `TC-E-500..522`, plus the dev-plan
`TC-U-500..509, 520..528, 540..544, 560..563, 580..584, 600..605, 620..623, 640..644, 660..663`.
Some `TC-U-54x` and `TC-U-56x` cases run at API level (`app.inject`); the id keeps the dev plan's
letter.

## 0. Inputs, assumptions and conventions

| Source | Used for |
|---|---|
| requirements.md | FR-001..FR-017, NFR-001..NFR-008, UC-001..UC-006, OQ-1..OQ-4 (resolved) |
| design.md | `filters.ts`, `export.ts`, `BackupV1`, address rules, API contracts, ADR-001..008 |
| ux-design.md | exact copy, focus order, ARIA names, responsive rules, contrast points left to E2E |
| dev-plan.md T-001..T-009 | the 52 `TC-U-5xx` cases (extended, not duplicated) |
| holdings-concentration test-cases.md | house format, mock legend, helpers (`e2e/lib/hc.ts`, `trackPointer`, `e2e/lib/contrast.ts`, `e2e/lib/states.ts`) |

Levels: **Unit** (domain), **API** (`app.inject`, local Supabase), **Component** (Testing Library,
`StubApi`, jsdom), **Static** (source scan), **E2E** (Playwright, real web + API + local Supabase).
Priority: P1 smoke, P2 regression, P3 edge. Technique: BVA, EP, DT, ST, EG, UC.

**Case anatomy.** Level, Priority, Technique, covers, Preconditions, Input, Expected Output, Mock
needed. Where the three documents are silent the expected value is marked **(proposed)** and listed
in section 9.

| Mock | Meaning |
|---|---|
| none | real code |
| DB | local Supabase (`pnpm db:start && pnpm db:reset`) |
| LocalJWKS | `signTestToken` + `supabaseIdentityResolver` (`test/auth.ts`) |
| TwoUsers | users U and W with own tokens (API) or browser contexts (E2E) and own rows |
| SeedRepo | rows through `test/seed.ts` (`seedStock`, `seedList`, `seedMembership`, `seedHolding`) |
| SeedAPI | data through the real API with `apiAs` (`e2e/lib/sl.ts`) |
| StubApi | `src/test/stub-api.ts`, counts requests (as TC-E-406); `makeStock` with `holding` |
| FakeAuth | `FakeAuthClient.signedIn()` with `createRoutes(...)` |
| FakeClock | Vitest fake timers / injected clock / `page.clock` |
| LogCapture | `buildApp` with a capturing `logStream`, level `trace` |
| ClipboardStub | `navigator.clipboard` replaced by a spy (resolve, reject, undefined) |
| PwRoute | Playwright `page.route`, `context.setOffline` |
| PwClipboard | Playwright `grantPermissions(['clipboard-read','clipboard-write'])` or denied |
| AdminAPI | `confirmedUser` / `adminCreateUser` (`scripts/lib/stack.ts`) |

## 1. System under test

| Part | Inputs | Outputs | Invariants |
|---|---|---|---|
| `applyStockFilters`, `filterOptions` (domain) | stocks, `{ q, picks }` | kept stocks in input order; options with counts | OR within a filter, AND across; input not mutated; no I/O |
| `readFilters`, `filterSearch` (web) | `URLSearchParams`, `{ state, sort }` | state, sort, notes; canonical string | equal views have equal addresses; round trip is lossless; address never rewritten on a bad part |
| Filter toolbar, sheet, result line, no-match card (web) | state in the address | table, count, badges, notes | no API request on a change; one live region; focus rules |
| Concentration with filters (web) | scope, lens, measure + filters | groups over filtered stocks | shares are of filtered stocks; no request |
| `exportRow`, `toDelimited` (domain) | stock, list names, rows | CSV row, delimited text | cells as typed (no escaping); CRLF; quoting by separator |
| Export menu, copy, file names (web) | shown rows | CSV file, clipboard text, toasts | file equals the shown rows and order |
| `GET /exports/backup.json|.csv` (API) | bearer token | `BackupV1` / CSV attachment | one read-only snapshot; only the caller's rows; no body in logs |
| Import (changed) | export CSV | `ignoredColumns`, no warnings | holdings and lists never written from the file |

## 2. Business flows

- **Happy**: open `/stocks` → search → open Filters, tick Market TH and Cyclical → table narrows →
  open a stock → Back → same view → Export → Download CSV → import it into a fresh account.
- **Alt**: filter a list page → See concentration → change filters there; Copy as table; bookmark
  and reload; Back/Forward; sort in the address; backup from `/import-export`.
- **Exceptions**: no match; bad address parts; clipboard refused; backup 503/offline; empty account;
  no token.
- **Edge**: Not set vs `None`; Thai text; list name with `/ : ?`; cells starting `=`; held with
  unknown amounts; two users; 1,000 stocks.

## 3. Field specifications (equivalence classes and boundaries)

| Field | Valid | Invalid / boundary |
|---|---|---|
| `q` | `ptt`, `  PTT `, `ปตท.`, `a,b&c=d` (needs URL encoding) | `''` (no search), whitespace only (= none), repeated `q` (note), 200 chars |
| single-value filter | vocabulary value any case (`th`), empty = Not set, several values | `Bitcoin` (note), repeated unknown, `None` (valid value of `valueChainPosition`) |
| multi-value filter | picked value, empty = Not set (matches empty list) | stock with `[]` vs `['x']` |
| `held` | `yes`, `no`, both | `maybe` (note) |
| `sort`, `dir` | `ticker|name|market|sector|held`, `asc|desc` | `price` (note), repeated `sort`, default not written |
| unknown param | `utm_source=mail` | ignored silently, no note |
| file name list part | `Core`, `Core / Swing: 2026?` | `???` (fallback `list`), 70 chars (cut to 60 code points), Thai, emoji (code points) |
| backup size | 0 stocks, 1, 1,000 + 20 lists | header-only CSV; empty arrays |
| decimals | `0.0001`, `1000.0000`, `99999999999999.9999` | unknown (`null`) |

## 4. Scenarios and techniques

| Area | Technique |
|---|---|
| Filter semantics | Decision table: (single/multi) × (value/Not set/None) × (one/several picks) × (search yes/no) |
| Address | EP + round trip + error guessing (bad, repeated, unknown, Thai) |
| Sheet | State transition (closed → open → applied → closed), keyboard path |
| Export rows | EP on market (US/TH) × held (no/unknown/amounts) × lists (0/many) |
| Backup | Use case + isolation + snapshot consistency + performance |
| Round trip | Use case: export → import into an empty account → compare |

## 5. Test data

| Dataset | Content |
|---|---|
| **SF-A** (E2E, API seeded) | 12 stocks: TH `PTT`, `PTTEP`, `PTTGC`, `KBANK`, `CPALL`, `ADVANC` (names in English and Thai), US `NVDA`, `AAPL`, `MSFT`, `JNJ`, `KO`, `XOM`. Cycles: 4 Cyclical, 3 Defensive, 2 Sensitive, 3 unset. Value-chain position: 2 `None`, 3 `Upstream`, 7 unset. Themes: `AI` (3, one spelled `ai`), `Dividend` (4), `EV` (1), 4 with none. Held: PTT (1000 @ 34.5 THB), NVDA (held, amounts unknown), KO (10 @ 60 USD). Lists: `Core` = PTT, PTTEP, NVDA; `Core / Swing: 2026?` = KO. Settings: threshold 35, rate 34.045 |
| **SF-B** (API timing) | 1,000 stocks (500 TH, 500 US) each with a holding and 3 themes, 20 lists of 50 members |
| **SF-C** (round trip) | the SF-A export, imported into a fresh user |
| Odd cells | name `Acme, "Inc"`, name `=1+1`, theme `@x`, note with CR LF, theme `a;b` (semicolon inside a value, **(proposed)** see section 9) |
| Users | two admin-created users per spec (`confirmedUser`), random ids per file |

## 6. Cases from the dev plan (ids kept, not repeated)

| Task | Ids | Level |
|---|---|---|
| T-001 filters | TC-U-500..509 | Unit (domain) |
| T-002 export rows, `toDelimited`, `BackupV1` | TC-U-520..528 | Unit (domain) |
| T-003 backup routes | TC-U-540..544 | API |
| T-004 import skips export-only columns | TC-U-560..563 | API (560, 561 unit) |
| T-005 address | TC-U-580..584 | Unit (web) |
| T-006 toolbar, sheet, no-match | TC-U-600..605 | Component |
| T-007 concentration and link | TC-U-620..623 | Component |
| T-008 export menu, copy, file names | TC-U-640..644 | Component |
| T-009 backup card, preview note | TC-U-660..663 | Component |

## 7. New cases

### 7.1 API, database and import (TC-A)

### TC-A-500
- **Level** API · **P1** · EP · FR-016, NFR-008
- **Preconditions** user U with a TH stock having every lens set, `lensSources` mixed (manual, default), a held stock with `{ shares: null, averageCost: null, costCurrency: "USD" }`, one list.
- **Input** `GET /exports/backup.json` as U.
- **Expected** `BackupV1.parse` succeeds; stock has `id, ticker, market, exchange, name`, all 14 lens fields, `lensSources`, `holding`, `createdAt`, `updatedAt` (ISO); held-unknown stock has `holding` with null amounts; not-held stock has `holding: null`; `format` is `investhesis-backup`, `formatVersion` is `1`.
- **Mock** DB, LocalJWKS, SeedRepo.

### TC-A-501
- **Level** API · **P1** · EG · FR-016, NFR-003
- **Preconditions** as TC-A-500 (user id `U-ID`, email `u@example.test`).
- **Input** `GET /exports/backup.json`.
- **Expected** the body text contains neither `U-ID`, nor `u@example.test`, nor `userId`, `user_id`, `listIds`, `token`; top-level keys are exactly `format, formatVersion, exportedAt, stocks, lists, settings`.
- **Mock** DB, LocalJWKS, SeedRepo.

### TC-A-502
- **Level** API · **P2** · BVA · FR-016
- **Preconditions** list `Core` with members added B, A, C where `added_at` of A and C are equal; ids ordered A < C.
- **Input** `GET /exports/backup.json`.
- **Expected** `lists[0].stockIds` is `[B, A, C]` (added order, then stock id); lists are ordered by name (`core` before `Watching` with the en collator **(proposed)**, section 9).
- **Mock** DB, SeedRepo (explicit `added_at`).

### TC-A-503
- **Level** API · **P1** · BVA · NFR-005, FR-012
- **Preconditions** holdings `0.0001`, `99999999999999.9999`, `1000.0000`; one held with null amounts.
- **Input** `GET /exports/backup.json` and `.csv`.
- **Expected** JSON decimals are those strings; CSV cells `shares`, `average_cost` are the same strings, empty for null; `held` is `yes` for the null-amount stock, `no` for not held; `cost_currency` empty when not held.
- **Mock** DB, SeedRepo.

### TC-A-504
- **Level** API · **P2** · BVA · FR-011/015
- **Preconditions** clock fixed at `2026-11-24T23:30:00Z`, then `2026-11-25T00:00:00Z`, then `2026-12-31T23:59:59Z`.
- **Input** both routes at each time.
- **Expected** `content-disposition` filenames `investhesis-backup-2026-11-24`, `…-2026-11-25`, `…-2026-12-31` (`.json` / `.csv`); `exportedAt` equals the clock.
- **Mock** DB, FakeClock (injectable clock).

### TC-A-505
- **Level** API · **P1** · UC · NFR-005, FR-014
- **Preconditions** user U with SF-A; fresh user W.
- **Input** `GET /exports/backup.csv` as U; `POST /imports/preview` then `POST /imports` (skip, no target list) as W with that file.
- **Expected** preview: no `headerWarnings`, `ignoredColumns` = the five names, every row `new`, `error` 0; confirm creates 12 stocks; for each, ticker, market, exchange, name and the 14 lens values equal U's; W has no holding, no list; BOM at the file start does not become part of the first header.
- **Mock** DB, LocalJWKS, TwoUsers, SeedRepo.

### TC-A-506
- **Level** API · **P2** · EG · OQ-3, FR-012
- **Preconditions** stocks with name `Acme, "Inc"`, name `=1+1`, theme `@x`, note-like theme with `\r\n`.
- **Input** `GET /exports/backup.csv`; parse the body with `csv-parse`.
- **Expected** parsed cells equal the stored text exactly; `=1+1` and `@x` are not prefixed; the comma and CR LF cells are quoted; each record ends CRLF.
- **Mock** DB, SeedRepo.

### TC-A-507
- **Level** API · **P1** · EP · NFR-003
- **Preconditions** users U and W each with stocks, holdings, lists, settings (U threshold 35, W threshold 60).
- **Input** both routes as U, then as W.
- **Expected** U's JSON and CSV hold no id, ticker, list name or setting of W and the reverse; `settings` are the caller's; W without a settings row gets defaults `{ 40, null, null }` and no row is created by the call (`GET /exports` never writes).
- **Mock** DB, LocalJWKS, TwoUsers.

### TC-A-508
- **Level** API · **P2** · EG · ADR-005
- **Preconditions** U with 3 stocks and a list; a hook runs between the stocks read and the memberships read and commits a new stock with a membership on another connection.
- **Input** `GET /exports/backup.json`.
- **Expected** every id in `lists[].stockIds` exists in `stocks` (snapshot consistent: either both or neither of the new rows appear).
- **Mock** DB, SeedRepo, and `vi.mock` of `lists.repository.ts` in the test file (no seam in product code). Mutation-checked: under `read committed` the test fails.

### TC-A-509
- **Level** API · **P1** · EG · NFR-004
- **Preconditions** held stock with sentinel shares `7654321.1234`, cost `0.7777`, rate `34.123456`.
- **Input** both routes with `LogCapture` at `trace`.
- **Expected** no log line contains a sentinel, the stock name, or any response body; lines carry request id, method, URL, status, duration; headers `authorization` redacted.
- **Mock** DB, LogCapture, LocalJWKS.

### TC-A-510
- **Level** API · **P2** · perf · NFR-002
- **Preconditions** SF-B for user U.
- **Input** 20 timed requests per route, after one warm-up.
- **Expected** p95 ≤ 2,000 ms for `.json` and `.csv`; the figure is logged (as `stocks.latency.test.ts`); JSON parses with `BackupV1`; CSV has 1,001 records.
- **Mock** DB, SeedRepo (bulk).

### TC-A-511
- **Level** API · **P1** · EP · FR-014
- **Preconditions** CSV with the 19 template headers, `Lists`, `HELD`, `shares`, `average_cost`, `cost_currency`, plus a real unknown column `colour`.
- **Input** `POST /imports/preview`.
- **Expected** `headerWarnings` has exactly one entry, for `colour`; `ignoredColumns` is `["Lists", "HELD", "shares", "average_cost", "cost_currency"]` in file order, as written; XLSX file with the same header gives the same result.
- **Mock** DB, LocalJWKS.

### TC-A-512
- **Level** API · **P1** · EG · FR-014
- **Preconditions** U has PTT held (1000 @ 34.5 THB) in list `Core`; a file row for PTT with `held` `no`, `shares` `1`, `lists` `Other`, and a changed `name`.
- **Input** `POST /imports` with `duplicateMode: update`.
- **Expected** the name changes; the holding stays `1000.0000 / 34.5000 / THB`; PTT stays in `Core`; no list `Other` exists.
- **Mock** DB, LocalJWKS, SeedRepo.

### TC-A-513
- **Level** API · **P2** · EP · NFR-003, NFR-008
- **Preconditions** app built with the OpenAPI plugin.
- **Input** `GET /openapi.json`.
- **Expected** both paths exist with `bearerAuth`; the JSON route's 200 body is the `BackupV1` schema (names `format`, `formatVersion`, `stocks`, `lists`, `settings`); the CSV route's 200 is `text/csv`; 401 and 503 are declared; `/imports/preview` response includes `ignoredColumns: string[]`.
- **Mock** none.

### TC-A-514
- **Level** API / static · **P3** · EP · design "No data model change"
- **Preconditions** repo at the slice's end.
- **Input** `git diff --name-only <slice-start>..HEAD -- supabase/migrations src/db/schema`; run `schema.drift.test.ts`.
- **Expected** no migration or schema file changed; drift test green.
- **Mock** DB.

### 7.2 Web component and static (TC-C)

### TC-C-500
- **Level** Component · **P1** · ST · FR-006
- **Preconditions** `StockTable` rendered with `sort={column:'name',direction:'asc'}` and an `onSort` spy.
- **Input** click the `Market` header twice.
- **Expected** `onSort` called with `{market, asc}` then (after the parent sets it) `{market, desc}`; the table does not reorder on its own when the prop is not updated; `aria-sort` follows the prop; every other caller of `StockTable` renders with the default.
- **Mock** none.

### TC-C-501
- **Level** Component · **P1** · EP · NFR-001
- **Preconditions** `/stocks`, `/lists/L1`, `/concentration` each loaded with `StubApi` (counts requests).
- **Input** on each page: type `ptt`, pick Market TH in the sheet, remove the badge, Clear all, change sort (not concentration).
- **Expected** request count after the initial load is unchanged (no `GET /stocks`, `/lists`, `/settings`, `/me`).
- **Mock** StubApi, FakeAuth.

### TC-C-502
- **Level** Component · **P2** · perf · NFR-001
- **Preconditions** 200 stocks, 3 themes each, 4 active filters.
- **Input** type one character into the search box with `userEvent`; measure from the event to the updated count text.
- **Expected** under 200 ms; table and count agree; typing the next character before the deferred render settles does not lose a character.
- **Mock** StubApi.

### TC-C-503
- **Level** Component · **P1** · UC · FR-006, UC-003
- **Preconditions** memory router at `/stocks?q=ptt&market=TH&sort=name&dir=desc`.
- **Input** click a stock row, then `router.navigate(-1)`.
- **Expected** same rows and order, search box shows `ptt`, badges `Search: ptt`, `Market: TH`. Going Back to `/stocks` is a path change, so the data is read again (design: re-read on a form submit or a path change); only a change to the query string sends nothing.
- **Mock** StubApi.

### TC-C-504
- **Level** Component · **P1** · BVA · FR-006
- **Preconditions** `/stocks` at history index 0, length 1.
- **Input** type `p`,`t`,`t` then pick a filter, then remove it.
- **Expected** `history.length` unchanged; Back leaves the page rather than undoing a keystroke.
- **Mock** StubApi.

### TC-C-505
- **Level** Component · **P1** · EP · FR-003
- **Preconditions** stocks: A `valueChainPosition` null, B `"None"`, C `"Upstream"`; open the sheet.
- **Input** in "Value chain position" tick `None`; then untick and tick `Not set`.
- **Expected** options order `Upstream, …, None, Not set` with `Not set` last and italic; `None` selected → row B, address `valueChainPosition=None`; `Not set` selected → row A, address `valueChainPosition=`; badge text differs (`Value chain position: None` / `…: Not set`).
- **Mock** StubApi.

### TC-C-506
- **Level** Component · **P2** · EG · FR-001
- **Preconditions** stock `PTTEP` named `บริษัท ปตท. สำรวจและผลิตปิโตรเลียม จำกัด (มหาชน)`.
- **Input** type `ปตท.` (with an IME composition event sequence first, then the committed text).
- **Expected** during composition the table does not filter on partial text **(proposed)**; after commit, 1 row; address contains the percent-encoded text and reloading it restores the box value and row.
- **Mock** StubApi.

### TC-C-507
- **Level** Component · **P2** · BVA · FR-004
- **Preconditions** no stock has `economicCycle` `Defensive`.
- **Input** open the sheet.
- **Expected** `Defensive` shows count `0` in muted text, is enabled and can be ticked (then the table is empty and the no-match card shows); accessible name `Defensive, 0 stocks`.
- **Mock** StubApi.

### TC-C-508
- **Level** Component · **P2** · BVA · UX Filter sheet
- **Preconditions** 12 distinct sectors; 8 exchanges **(proposed: exchange has 8 or fewer)**.
- **Input** type `en` in the sector Find box; pick a sector; then search `zzz`.
- **Expected** sections with more than 8 options have Find, others do not; Find narrows by plain substring (`pt` does not match `Microsoft`-style fuzzy); a picked option stays visible whatever Find says; no match shows "No match"; the Find text is not in the address.
- **Mock** StubApi.

### TC-C-509
- **Level** Component · **P3** · EG · UX Filter sheet
- **Preconditions** no stock has a theme.
- **Input** open Themes.
- **Expected** only `Not set` with count = all stocks; picking it keeps stocks with no theme.
- **Mock** StubApi.

### TC-C-510
- **Level** Component · **P1** · ST · NFR-006
- **Preconditions** `/stocks`.
- **Input** keyboard only: Tab to Filters, Enter; Tab through triggers; Space on Economic cycle trigger; Tab to `Cyclical`, Space; Esc.
- **Expected** focus lands on the first section trigger; the sheet traps Tab (last → first); Space toggles an option and the table behind updates; Esc closes and focus returns to the Filters button; "Show N stocks" also returns focus there.
- **Mock** StubApi.

### TC-C-511
- **Level** Component · **P1** · EP · NFR-006
- **Preconditions** 2 filters active, search `ptt`.
- **Input** query by role.
- **Expected** textbox `Search stocks`; button `Filters 2 active` with `aria-haspopup="dialog"`, `aria-expanded` follows the sheet; buttons `Remove filter Market: TH`, `Remove filter Economic cycle: Cyclical, Not set`, `Remove search: ptt` **(proposed name)**; checkbox `Cyclical, 9 stocks`; dialog named `Filters`; each section is a `group` named by its legend; the no-match heading is level 2.
- **Mock** StubApi.

### TC-C-512
- **Level** Component · **P2** · EP · NFR-006
- **Preconditions** `/stocks` with 42 stocks.
- **Input** type `ptt` quickly; open the sheet.
- **Expected** exactly one `role=status` live region carries the count on the page (the address-note Alert aside, which only exists with notes); its text changes once ("3 of 42 stocks") after typing settles, not per keystroke; with the sheet open the sheet description has `aria-live="polite"`.
- **Mock** StubApi, FakeClock.

### TC-C-513
- **Level** Component · **P1** · ST · NFR-006
- **Preconditions** search + badges Market, Cycle.
- **Input** remove Market badge; remove Cycle badge; remove search; re-add two filters and click Clear all.
- **Expected** focus moves to the next badge, then the remaining one, then the search box when none is left; Clear all moves focus to the search box; focus is never on `body`.
- **Mock** StubApi.

### TC-C-514
- **Level** Component · **P2** · EP · UX Filter sheet
- **Preconditions** search `ptt`, two filters, sheet open.
- **Input** click Clear all in the sheet.
- **Expected** filters cleared, search `ptt` kept, the sheet stays open and its description updates; the footer Clear all is disabled with no filter; "Show N stocks" closes.
- **Mock** StubApi.

### TC-C-515
- **Level** Component · **P1** · DT · FR-008
- **Preconditions** (a) account with no stocks; (b) list with no members; (c) list with 3 members and `q=zzz`; (d) `/stocks?q=zzz` with stocks.
- **Input** render each.
- **Expected** (a) "No stocks yet" card, no toolbar; (b) the list's empty card, no toolbar, Add stock and Import moved into the card (as today); (c) and (d) "No stocks match" with Clear all, toolbar still shown, Export items disabled.
- **Mock** StubApi.

### TC-C-516
- **Level** Component · **P1** · EP · FR-007
- **Preconditions** list `Core` (PTT, NVDA), list `Other` (KO); 40 more stocks.
- **Input** `/lists/core?held=yes`, then Market options.
- **Expected** rows PTT and NVDA only; `2 of 2 stocks`; option counts computed over the 2 members; a filter value present only in non-members is listed with count 0 or absent **(proposed: absent for free text, present at 0 for vocabulary)**; the See concentration link has `scope=core`.
- **Mock** StubApi.

### TC-C-517
- **Level** Component · **P2** · BVA · FR-006
- **Preconditions** `/stocks`.
- **Input** sort Name asc (default is Ticker asc), Name desc, then Ticker asc; reload each; `?sort=price`.
- **Expected** address `sort=name`, `sort=name&dir=desc`, then bare; reload restores; unknown sort → one note, default order, address unchanged; sort and filters coexist in canonical order.
- **Mock** StubApi.

### TC-C-518
- **Level** Component · **P2** · EG · FR-006
- **Preconditions** `/concentration?scope=all&lens=gicsSector&measure=count&market=Bitcoin&held=maybe&lens=size&utm_source=mail`.
- **Input** render.
- **Expected** one note line per dropped part (market, held, repeated `lens`) inside one Alert, none for `utm_source`; table uses defaults for the dropped parts; address unchanged until the user changes something; the first user change writes the clean canonical address (without the dropped parts) **(proposed)**.
- **Mock** StubApi.

### TC-C-519
- **Level** Component · **P1** · EP · FR-012, OQ-3
- **Preconditions** stocks with name `Acme, "Inc"`, name `=1+1`, theme `a;b`, multi-line text; `saveFile` spy.
- **Input** Download CSV with sort name desc and a filter.
- **Expected** blob text starts with BOM; header = `EXPORT_COLUMNS`; rows are exactly the shown rows in the shown order; the comma/quote cell is quoted and doubled; `=1+1` is not escaped; CRLF endings; MIME `text/csv;charset=utf-8`.
- **Mock** StubApi, `saveFile` mock.

### TC-C-520
- **Level** Component / unit · **P2** · perf · NFR-002
- **Preconditions** 1,000 stocks with holdings, 20 lists.
- **Input** build the CSV through the same function the button calls.
- **Expected** under 1,000 ms; 1,001 records.
- **Mock** none.

### TC-C-521
- **Level** Component · **P2** · EP · FR-011, FR-012
- **Preconditions** list `Core / Swing: 2026?` with 2 members that are also in list `Alpha`; clock `2026-11-24T23:30:00+07:00` (local).
- **Input** Download CSV on the list page.
- **Expected** file `investhesis-Core - Swing- 2026-2026-11-24.csv` **(follows TC-U-641; the doc's own rule)**; 2 rows; the `lists` cell is `Alpha;Core / Swing: 2026?` (names sorted by the en collator, the name unsanitised inside the file); a date change across local midnight is by local time.
- **Mock** StubApi, FakeClock.

### TC-C-522
- **Level** Component · **P2** · BVA · FR-011
- **Preconditions** 42 stocks.
- **Input** open Export unfiltered, then with 3 matches, then 0.
- **Expected** items read `Download CSV (42 stocks)`, `Copy as table (42 rows)`; `(3 stocks)`; at 0 both disabled with the label `No stocks to export`; `Back up all data…` is always enabled and links to `/import-export`; singular wording at 1 **(proposed: "1 stock", "1 row")**.
- **Mock** StubApi.

### TC-C-523
- **Level** Component · **P1** · DT · FR-013
- **Preconditions** `ClipboardStub`; a stock with a tab in its name and a comma in a theme.
- **Input** Copy as table with (a) resolve, (b) reject `NotAllowedError`, (c) `navigator.clipboard` undefined, (d) the sheet or menu closes during the pending promise.
- **Expected** (a) text uses `\t`, CRLF, no BOM, the tab cell quoted, the comma cell not quoted; toast `Copied N rows`; (b) and (c) error toast with the refusal text, no success toast; (d) the toast still shows; `writeText` is called synchronously in the click handler (no `await` before it).
- **Mock** ClipboardStub, `sonner` mock.

### TC-C-524
- **Level** Component · **P1** · ST · FR-015..017
- **Preconditions** `/import-export` with `StubApi` scripts for both download routes (one slow).
- **Input** click Download JSON (pending), then Download CSV; then force a 503; then click again.
- **Expected** the pending button has `aria-busy`, accessible name unchanged, "Preparing…" `aria-hidden`, disabled, the other stays enabled; the spinner has `motion-reduce:animate-none`; failure shows `Alert role=alert` with the exact copy and keeps focus on the button; the alert clears on the next click; success shows no message; file names use the local date.
- **Mock** StubApi, FakeClock, `saveFile` mock.

### TC-C-525
- **Level** Component · **P1** · EP · FR-010
- **Preconditions** scope `all` with 10 stocks incl. a USD holding with no rate (left out) and 2 THB holdings.
- **Input** `/concentration?...&measure=value&market=TH`, then add `market=US`.
- **Expected** value shares are of the filtered stocks only; the left-out note lists only filtered USD holdings without a rate (none for `market=TH`); the flag `Over N%` uses the filtered shares; with no filter the line reads `10 stocks in scope`; the sheet's option counts count over the scope; Group-by change keeps filters (TC-U-622); no request.
- **Mock** StubApi.

### TC-C-526
- **Level** Component · **P2** · EP · FR-009
- **Preconditions** `/stocks`, `/lists/L1`, with and without filters, sorted.
- **Input** read the See concentration link.
- **Expected** unfiltered `/stocks` → `/concentration?scope=all&lens=gicsSector&measure=count`; filtered carries the params in `STOCK_FILTERS` order; never `sort`/`dir`; a list name or id with unusual characters is encoded; the link is not shown on the empty list card or with no shown stock **(proposed: shown, since the concentration page shows its own no-match)**.
- **Mock** StubApi.

### TC-C-527
- **Level** Component · **P2** · EP · ADR-007
- **Preconditions** the existing import error-CSV tests.
- **Input** run them unchanged after `buildErrorCsv` uses `toDelimited`.
- **Expected** all pass, same bytes for a row with comma, quote, newline and a formula cell.
- **Mock** none.

### TC-C-528
- **Level** Static · **P1** · EG · NFR-004
- **Preconditions** source of `features/stock-filters`, `features/exports`, `packages/domain/src/{filters,export}.ts`.
- **Input** scan for `fetch(`, `XMLHttpRequest`, `sendBeacon`, `navigator.sendBeacon`, `import.meta.env` URLs, `http://`, `https://`, analytics names.
- **Expected** no match, except `api.download` in `features/exports/backup-card.tsx`; the domain files import only Zod and domain modules.
- **Mock** none.

### TC-C-529
- **Level** Component · **P1** · EG · NFR-004
- **Preconditions** sentinel search `SENTINEL-q-91` and a filter value `SENTINEL-theme`.
- **Input** search, filter, export, copy, navigate to concentration.
- **Expected** no request URL or body recorded by `StubApi` contains a sentinel; the sentinel is in `location.search` only.
- **Mock** StubApi.

### TC-C-530
- **Level** Component · **P2** · EP · FR-014
- **Preconditions** wizard at the review step.
- **Input** `ignoredColumns` of 5 names, of 1 name, of `[]`.
- **Expected** an Alert `role=status` with `InfoIcon` after the header warnings and before the table: "Lists and holdings columns are not imported: lists, held, shares, average_cost, cost_currency." plus the second line; names in `font-mono`; shown once; absent for `[]`; the existing warnings Alert still shows when both exist.
- **Mock** StubApi.

### TC-C-531
- **Level** Component · **P2** · EP · NFR-007
- **Preconditions** `matchMedia` stubbed narrow, then wide.
- **Input** open the sheet.
- **Expected** `data-side="bottom"` with `max-h-[85svh]` narrow; `right` wide; same content and order of sections (Market, Held, Exchange, then `CONCENTRATION_LENSES` order, 18 sections).
- **Mock** none.

### 7.3 End to end (TC-E)

All E2E cases use a fresh admin-created user per test (`confirmedUser`) and SF-A seeded with `apiAs`, unless stated.

### TC-E-500
- **Level** E2E · **P1** · UC · FR-001..003, FR-005, FR-006, UC-003
- **Input** open `/stocks`; type `ptt`; Filters → Market TH; close; click `PTTEP`; browser Back; reload; Forward/Back once more.
- **Expected** after Back and after reload the search box holds `ptt`, badges `Search: ptt`, `Market: TH`, count `3 of 12 stocks`, same rows; the address is `/stocks?q=ptt&market=TH`; history has no extra entry per keystroke (one Back from the filtered view leaves `/stocks` bare or the previous page).
- **Mock** SeedAPI.

### TC-E-501
- **Level** E2E · **P2** · EP · FR-006
- **Input** sort Name descending, then Held; reload; open a stock and Back.
- **Expected** `sort=name&dir=desc` then `sort=held`; the order survives reload and Back; Ticker ascending leaves the address bare.
- **Mock** SeedAPI.

### TC-E-502
- **Level** E2E · **P1** · DT · FR-002..004
- **Input** pick Market TH + Held yes + Economic cycle Cyclical + `Not set`; then add `Themes: ai` (typed spelling `ai`).
- **Expected** rows equal what the API data implies (computed in the test from `apiAs.listStocks`); sheet counts equal counts computed from the same data; `Themes` shows one `AI` option (case-insensitive merge, first spelling) with the count of 3; the count text matches the rows.
- **Mock** SeedAPI.

### TC-E-503
- **Level** E2E · **P2** · EP · FR-003
- **Input** Value chain position: pick `None`, read rows; clear, pick `Not set`.
- **Expected** `None` → exactly the 2 stocks with `None`; `Not set` → the 7 unset; the badges and addresses differ (`valueChainPosition=None` vs `valueChainPosition=`).
- **Mock** SeedAPI.

### TC-E-504
- **Level** E2E · **P2** · EG · FR-001
- **Preconditions** PTTEP has the Thai name from section 5.
- **Input** type Thai `ปตท.` with the browser's input (`fill`) and via `pressSequentially`.
- **Expected** `PTTEP` (and any other stock with that text) matches; the address holds the encoded text; reload restores the text.
- **Mock** SeedAPI.

### TC-E-505
- **Level** E2E · **P2** · EG · FR-006
- **Input** open `/stocks?market=Bitcoin&sort=price&q=a&q=b&utm_source=mail&held=yes`.
- **Expected** one Alert with three notes (market, sort, repeated q), none for `utm_source`; the `held=yes` filter applies; the address stays exactly as typed until the user changes a control, then it is rewritten without the dropped parts **(proposed)**.
- **Mock** SeedAPI.

### TC-E-506
- **Level** E2E · **P1** · UC · FR-006, design "shouldRevalidate"
- **Input** filter to `market=TH`; open `PTT`; Edit → change the name; save; follow the redirect; go to Stocks via Back/links.
- **Expected** the saved change is visible in the filtered table after the form submit (revalidation on submit); the filters are still applied where the address holds them; no stale row.
- **Mock** SeedAPI.

### TC-E-507
- **Level** E2E · **P1** · EP · NFR-001
- **Input** on `/stocks`, a list page and `/concentration`, record requests to the API origin (`page.on('request')`), then search, pick, remove, Clear all, change lens and measure.
- **Expected** zero API requests after the first load on each page (`/me`, `/stocks`, `/lists`, `/settings`); the page does not full-reload.
- **Mock** SeedAPI.

### TC-E-508
- **Level** E2E · **P1** · UC · FR-009, FR-010, UC-004
- **Input** on list `Core` filter `held=yes`; click See concentration; change Market filter there; change Measure to Value at cost.
- **Expected** lands on `/concentration?scope=<Core id>&lens=gicsSector&measure=count&held=yes`; line `2 of 3 stocks in scope`; groups match the held members; a further filter updates groups and the line without a request; value shares use the threshold 35 and the rate.
- **Mock** SeedAPI.

### TC-E-509
- **Level** E2E · **P1** · UC · FR-011, FR-012, UC-005
- **Input** `/stocks?market=TH&sort=ticker&dir=desc`; Export → Download CSV (Playwright `download`).
- **Expected** suggested name `investhesis-stocks-<today, browser local>.csv`; the file's bytes start with `EF BB BF`; header = the 24 columns; rows = the shown TH stocks in the shown order; PTT row has `held` `yes`, `shares` `1000.0000`, `average_cost` `34.5000`, `cost_currency` `THB`, `lists` `Core`; NVDA-like held-unknown row would have empty amounts.
- **Mock** SeedAPI, browser timezone fixed (`timezoneId: 'Asia/Bangkok'`).

### TC-E-510
- **Level** E2E · **P2** · EP · FR-007, FR-011
- **Input** open list `Core / Swing: 2026?`; Download CSV.
- **Expected** the file name `investhesis-Core - Swing- 2026-<date>.csv` (rule of TC-U-641); content has only the list's member; the menu entry names the count.
- **Mock** SeedAPI.

### TC-E-511
- **Level** E2E · **P1** · UC · NFR-005, FR-014
- **Preconditions** users A (SF-A) and B (fresh), two browser contexts.
- **Input** A downloads the all-stocks CSV from `/stocks`; B opens `/import-export`, chooses that file, reviews, confirms with no list.
- **Expected** review shows 12 new, no header warning, the ignored-columns note listing the five names; after confirm B's stocks (read with `apiAs`) equal A's by ticker, market, exchange, name and the 14 lens values; B has no holding and no list.
- **Mock** AdminAPI, SeedAPI, TwoUsers.

### TC-E-512
- **Level** E2E · **P1** · DT · FR-013
- **Input** (a) `PwClipboard` granted: Export → Copy as table, read the clipboard in the page; (b) permission denied (`navigator.clipboard.writeText` rejects).
- **Expected** (a) toast `Copied 12 rows`; the clipboard text has 13 lines, tab separated, no BOM, and pastes into 24 columns; (b) the error toast with the refusal and the Download CSV hint, no success toast; the Export menu keeps working afterwards.
- **Mock** PwClipboard, SeedAPI.

### TC-E-513
- **Level** E2E · **P1** · UC · FR-015, FR-016, UC-006
- **Input** `/import-export` → Download JSON; Download CSV.
- **Expected** names `investhesis-backup-<local date>.json` and `.csv`; JSON parses with `BackupV1`, has 12 stocks ordered TH then US by ticker, both lists with `stockIds`, the held stocks with their holdings, settings `{ 35, "34.045000", <time> }`, and no `userId`; the CSV has the header plus 12 rows, `held` `yes` for PTT, NVDA, KO; the CSV re-imports (TC-E-511 path).
- **Mock** SeedAPI.

### TC-E-514
- **Level** E2E · **P2** · BVA · FR-017
- **Preconditions** fresh user with no stocks, no lists, no settings row.
- **Input** both downloads; and Export on `/stocks`.
- **Expected** JSON has empty `stocks` and `lists` and settings `{ 40, null, null }`; CSV is the BOM, 24-column header and CRLF only; `/stocks` shows "No stocks yet" with no toolbar, so the page-level export is not offered **(proposed)** while `/import-export` backups still work.
- **Mock** AdminAPI.

### TC-E-515
- **Level** E2E · **P1** · EP · NFR-003
- **Preconditions** users A and B, each with SF-A-like data with different tickers (`A-PTT`, `B-PTT` prefixes in names).
- **Input** B downloads both backups through the UI; A's id is also tried directly by B (`apiAs(B).get('/exports/backup.json?userId=A')`).
- **Expected** B's files contain none of A's names, ids or settings; the query parameter is ignored.
- **Mock** AdminAPI, TwoUsers.

### TC-E-516
- **Level** E2E · **P1** · EG · NFR-004
- **Preconditions** held stock with sentinel amounts; API log file `e2e/.output/dev-server.log`.
- **Input** download both backups from the UI; filter and copy; poll the log for the last request id.
- **Expected** the log has the backup request lines and none of the sentinel shares, cost or rate; no request to a third-party host (`page.on('request')` filter by origin); storage and titles hold no sentinel search text.
- **Mock** SeedAPI.

### TC-E-517
- **Level** E2E · **P1** · EP · NFR-003
- **Input** `fetch` the two backup routes with no token, with a garbage token, with an expired token; open `/import-export` signed out.
- **Expected** 401 `unauthenticated` with `WWW-Authenticate: Bearer`; a signed-out visit goes to sign-in with `next`; after a mid-session sign-out in another tab the next backup click refreshes once, then goes to sign-in (existing client behaviour).
- **Mock** AdminAPI.

### TC-E-518
- **Level** E2E · **P2** · EG · FR-015, ux "States"
- **Input** `PwRoute` answers the CSV route 503; click Download CSV; then `setOffline(true)` and click JSON; then restore and click again.
- **Expected** `role=alert` "Couldn't download the backup. Check your connection and try again." each time; the other button stays usable; the next click clears the alert and succeeds; no file is saved on failure.
- **Mock** PwRoute, SeedAPI.

### TC-E-519
- **Level** E2E · **P1** · EP · NFR-006
- **Input** axe (WCAG 2.1 AA tags) on: `/stocks` filtered, sheet open (right side), no-match, address-note, list page, `/concentration` filtered, Export menu open, `/import-export` with the export card, with an error, and with the import review note; light and dark; extend `e2e/lib/states.ts`.
- **Expected** no violation, except pinned known findings listed with their finding ids (`test.fail`) only with the owner's agreement.
- **Mock** SeedAPI.

### TC-E-520
- **Level** E2E · **P1** · EP · NFR-006
- **Input** measure computed contrast (`e2e/lib/contrast.ts`): badge remove button focus ring (against the badge and page), checked and unchecked checkbox border in the sheet (light, dark), sheet background and body text in dark mode, count text `muted-foreground`, italic `Not set` label, disabled Export items text.
- **Expected** text ≥ 4.5:1; focus ring and checkbox border ≥ 3:1; any failure goes back to the owning web task as a fix.
- **Mock** SeedAPI.

### TC-E-521
- **Level** E2E · **P1** · EP · NFR-007
- **Input** viewport 360×740: `/stocks` filtered with 3 badges including a long theme, the bottom sheet open and scrolled, Export menu, list page, `/concentration` filtered, `/import-export`.
- **Expected** `document.documentElement.scrollWidth <= 360` for each; the sheet is a bottom sheet with `max-height` 85svh and a visible sticky footer; badges wrap and truncate; touch targets ≥ 24 px **(proposed WCAG 2.2 minimum)**.
- **Mock** SeedAPI.

### TC-E-522
- **Level** E2E · **P1** · UC · NFR-006
- **Input** keyboard only (`trackPointer` asserts no pointer events): Tab to Search, type, Tab to Filters, open the sheet, pick two options (one in a section opened with the keyboard), Esc, remove a badge with Enter, open Export, Copy, Esc, follow See concentration, change a filter there, go to `/import-export`, Download JSON.
- **Expected** every step completes; focus is visible at each step and never on `body`; focus returns to Filters after the sheet and to the Export button after its menu; the sheet traps focus.
- **Mock** SeedAPI, PwClipboard.

## 8. Traceability

| Req | Cases |
|---|---|
| FR-001 search | TC-U-500, 501, 600; TC-C-506; TC-E-500, 504 |
| FR-002 filters offered | TC-U-509; TC-C-531; TC-E-502 |
| FR-003 pick values, Not set, OR/AND | TC-U-502..505; TC-C-505; TC-E-502, 503 |
| FR-004 options and counts | TC-U-507, 508; TC-C-507..509, 516; TC-E-502 |
| FR-005 badges, Clear all, count | TC-U-600..602; TC-C-511..514; TC-E-500 |
| FR-006 address, history, notes | TC-U-580..584, 605; TC-C-500, 503, 504, 517, 518; TC-E-500, 501, 505, 506 |
| FR-007 list scope | TC-U-604; TC-C-516; TC-E-510 |
| FR-008 no match vs empty | TC-U-603; TC-C-515 |
| FR-009 link to concentration | TC-U-621; TC-C-526; TC-E-508 |
| FR-010 filters on concentration | TC-U-620, 622, 623; TC-C-525; TC-E-507, 508 |
| FR-011 CSV download and name | TC-U-640, 641; TC-C-521, 522; TC-E-509, 510; TC-A-504 |
| FR-012 CSV columns and quoting | TC-U-520..526; TC-C-519; TC-A-503, 506; TC-E-509 |
| FR-013 copy | TC-U-642, 643; TC-C-523; TC-E-512 |
| FR-014 import skips export columns | TC-U-560..563; TC-A-505, 511, 512; TC-C-530; TC-E-511 |
| FR-015 backup CSV | TC-U-542; TC-A-504, 505; TC-C-524; TC-E-513, 518 |
| FR-016 backup JSON | TC-U-527, 528, 540; TC-A-500..503; TC-E-513 |
| FR-017 empty exports | TC-U-541; TC-E-514 |
| NFR-001 no request, 200 ms | TC-U-600 (+ dev-plan timing); TC-C-501, 502; TC-E-507 |
| NFR-002 1,000 stocks | TC-A-510; TC-C-520 |
| NFR-003 auth and isolation | TC-U-543, 544; TC-A-501, 507, 513; TC-E-515, 517 |
| NFR-004 privacy and logs | TC-A-509; TC-C-528, 529; TC-E-516 |
| NFR-005 accuracy, round trip | TC-A-503, 505; TC-E-511 (+ domain round trip in T-002) |
| NFR-006 accessibility | TC-C-510..513; TC-E-519, 520, 522 |
| NFR-007 360 px | TC-C-531; TC-E-521 |
| NFR-008 documented format | TC-U-527, 528; TC-A-500, 513 |
| ADR-005 snapshot | TC-A-508 |
| ADR-007 one quoting rule | TC-U-525, 526; TC-C-527 |
| No data model change | TC-A-514 |

Every FR-001..FR-017 and NFR-001..NFR-008 has at least one case.

## 9. Assumptions and how they ended

Each was marked **(proposed)** in the cases above. Outcome after implementation (T-011):

1. **Semicolon inside a multi-value cell** (`a;b` as one theme) is exported as `a;b` and splits on re-import; kept, not tested for equality.
2. **List order**: lists are ordered by `lower(name)`, then name, by the database; `core` comes before `Watching` (TC-A-502).
3. **IME composition** (TC-C-506): the search box filters on what is committed to the box; the Thai test types the committed text. Not specially handled.
4. **Back revalidation** (TC-C-503): *changed.* Going Back to a table is a path change, so it re-reads; only a query change does not (TC-C-501, TC-E-507).
5. **Remove-search accessible name** (TC-C-511): `Remove search: <text>`, as proposed.
6. **Dropped parts are cleaned on the first user change** (TC-C-518, TC-E-505): confirmed.
7. **Singular wording** (`1 stock`, `1 row`): confirmed. The See concentration link is shown with no stock in view (the concentration page has its own no-match card).
8. **Export with no stocks** (TC-E-514): the page shows its empty card and no toolbar; only the backup card exports.
9. **Touch targets** (TC-E-521): the 24 px minimum is checked; the two link buttons and the badge remove buttons were enlarged to meet it.
10. **Snapshot test** (TC-A-508): done with a module mock in the test, no product seam.

Findings the E2E specs raised and the web tasks fixed (listed in `test-report.md`): the Filters button's accessible name,
the sheet checkbox border, the badge remove focus ring, the import preview's scroll region, and the backup button losing
keyboard focus while busy. The checkbox in the other forms (`border-input`, 1.2:1) is not part of this slice and is not changed.

## 10. Coverage matrix

| Area | Unit | API | Component | E2E |
|---|---|---|---|---|
| Happy path | U-500, 520, 540 | A-500, 505 | C-519, 524, 525 | E-500, 509, 511, 513 |
| Validation, address | U-580..584 | A-511 | C-517, 518 | E-505 |
| Auth, isolation | | U-543, 544, A-507 | | E-515, 517 |
| Boundaries | U-508, 525, 526 | A-502, 503, 504 | C-507, 508, 522 | E-503 |
| State | U-505 | | C-503, 504, 510, 513 | E-500, 506 |
| Errors | U-528 | U-544, A-512 | C-523, 524 | E-512, 514, 518 |
| Performance | U-500 timing | A-510 | C-502, 520 | E-507 |
| Security, privacy | | A-501, 509 | C-528, 529 | E-516 |
| Accessibility | | | C-511..513 | E-519, 520, 522 |
| Responsive | | | C-531 | E-521 |

## 11. Gaps and risks

- **jsdom cannot measure layout or contrast**: 360 px and contrast are E2E only (E-520, E-521).
- **Clipboard** differs by browser; E2E covers Chromium only (granted and denied).
- **Excel opening a `=` cell** is accepted by the owner (OQ-3) and is not tested.
- **Timezone**: file names use local time; E2E fixes `timezoneId`, the API uses UTC; TC-A-504 and TC-E-509 differ by design.
- **Security and load beyond NFR-002** (many users at once, fuzzing the address) are out of scope for a single-user v1.
- **Restore** is out of scope (OQ-4); `BackupV1` cases only prove the file is well-formed.
