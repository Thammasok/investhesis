---
version: 1.0
status: draft
date: 2026-11-22
requires: requirements.md, design.md, ux-design.md, dev-plan.md
task: T-012
---

# Test Cases: Stock Lists

Test design for [requirements.md](requirements.md), [design.md](design.md) and
[ux-design.md](ux-design.md). It keeps the 80 `TC-U-xxx` cases already written into tasks T-001 to
T-011 of [dev-plan.md](dev-plan.md) (same IDs, none renumbered; section 6 indexes them) and adds
new cases in four series: `TC-U-12x..13x` (unit), `TC-A-1xx` (API, database and Supabase level),
`TC-C-1xx` (web component and static) and `TC-E-1xx` (end to end).
`software-tester-automation` (T-013) turns every case into a test whose title starts with its ID.

**ID scheme.** The User Auth plan already owns `TC-U-001..042`, `TC-A-001..032`, `TC-C-001..051`
and `TC-E-001..028`. To avoid new collisions, every new Stock Lists case starts at 101 in its
series (`TC-A-101`, `TC-C-101`, `TC-E-101`) and the new unit cases continue from `TC-U-120`.
The dev-plan `TC-U` ids reused by both features (for example `TC-U-001`) cannot be renumbered
(task instruction); see gap G-1 for how automation keeps them apart.

## 0. Inputs, assumptions and conventions

| Source | Used for |
|---|---|
| requirements.md | FR-001..FR-025, NFR-001..NFR-009, UC-001..UC-005 |
| design.md | table constraints, API contracts, confirm algorithm, error codes, ADRs |
| ux-design.md | exact copy, focus order, ARIA, responsive rules, contrast checks to verify |
| dev-plan.md T-001..T-011 | the 80 existing TC-U cases (extended, not duplicated) |
| user-auth v1.0 test-cases.md | house format, TC-id scheme, mock legend, helpers (`test/auth.ts`, `FakeAuthClient`, Mailpit) |

Levels used: **Unit** (pure functions, domain package, web helpers), **Integration** (real
Postgres, no HTTP), **API** (`app.inject` against local Supabase), **Component** (Testing Library,
stubbed `api-client`, jsdom), **E2E** (Playwright, real web + API + local Supabase).
The dev plan labels all its cases "unit"; section 6 re-classifies them by what they actually need.

Priority: P1 smoke, P2 regression, P3 edge. Technique: BVA, EP, DT (decision table), ST (state
transition), EG (error guessing), UC (use case).

**Mock legend** (column "Mock needed").

| Name | Meaning |
|---|---|
| none | real code, nothing replaced (pure function or real local stack) |
| DB | local Supabase from `pnpm db:start && pnpm db:reset` (real Postgres, no stub) |
| LocalJWKS | jose ES256 key pair + `createLocalJWKSet`, `signTestToken` (User Auth helpers); `AUTH_MODE=supabase` |
| TwoUsers | two identities U and V (own tokens in API tests, own browser contexts in E2E), each with its own rows |
| SeedRepo | stocks/lists inserted straight through repository functions (no routes), as T-003 notes say |
| SeedAPI | data created through the real API with the user's token |
| StubApi | stubbed `api-client` (or `fetch`) answering scripted statuses and bodies |
| FakeAuth | `FakeAuthClient.signedIn()` and `createRoutes(FakeAuthClient)` (User Auth T-003) |
| FakeTimers | Vitest fake timers |
| RepoFault | test-only repository stub that throws after N inserts / at a named step |
| NetBlock | undici `MockAgent` with `disableNetConnect()` (any outbound HTTP fails the test) |
| LogCapture | `buildApp` with a capturing `logStream` |
| Fixtures | files in `apps/api/test/fixtures/imports/` (section 5.4) |
| PwRoute | Playwright `page.route` / `page.clock` / `context.setOffline` |
| AdminAPI | GoTrue admin API with the service key from `supabase status` to create confirmed `@example.test` users without email |

---

## 1. System under test

### 1.1 Scope

| Part | Unit under test | Where |
|---|---|---|
| Schema | `app.stocks`, `app.lists`, `app.list_stocks`: CHECKs, unique keys, composite FKs, cascades, role grants, RLS, Drizzle drift | `supabase/migrations`, `apps/api/src/db/schema` |
| Domain package | `normaliseTicker`, `TICKER_PATTERN`, `LENS_VALUES`, `CYCLE_BY_GICS`, `resolveEconomicCycle`, `StockInput`, `StockPatch`, `ListName`, `TEMPLATE_COLUMNS`, `canonicaliseRow` | `packages/domain` |
| Stocks API | `GET/POST /stocks`, `GET/PATCH/DELETE /stocks/{id}` | `apps/api/src/modules/stocks` |
| Lists API | `GET/POST /lists`, `GET/PATCH/DELETE /lists/{id}`, `POST /lists/{id}/stocks`, `DELETE /lists/{id}/stocks/{stockId}` | `apps/api/src/modules/lists` |
| Imports API | `GET /imports/template.{csv,xlsx}`, `POST /imports/preview`, `POST /imports` (file reader, header mapping, row canonicalisation, transactional confirm), multipart plugin | `apps/api/src/modules/imports`, `plugins/multipart.ts` |
| Web foundation | `api-client` (JSON, multipart, ApiError), route table, breadcrumb with loader data, sonner Toaster | `apps/web/src/lib`, `routers`, `components/layout` |
| Web screens | `/stocks`, `/stocks/new`, `/stocks/:id`, `/stocks/:id/edit`, `/lists`, `/lists/:id`, `/import-export` (wizard) | `apps/web/src/views`, `features/{stocks,lists,imports}` |
| Whole flow | web + API in `supabase` mode against the local stack, signed in as seeded `@example.test` users | Playwright (`e2e/`) |

Not under test: Supabase Auth and sign-in (User Auth plan), provider lookup, concentration,
export, holdings, Thai UI labels (all out of scope in requirements.md).

### 1.2 Inputs

| Input | Type and boundaries |
|---|---|
| Ticker | 1..12 chars of `A-Z 0-9 . -`, first char `A-Z0-9`; trimmed and upper-cased first; boundaries 0, 1, 12, 13 |
| Market / exchange | `US`: NYSE, NASDAQ; `TH`: SET, mai; mismatches rejected; currency derived |
| Company name | 1..200 chars, any Unicode (Thai, combining marks, astral) |
| Index membership | 0..n of `S&P 500`, `Nasdaq-100` (US) / `SET50`, `SET100` (TH) |
| 10 lenses (14 stored fields) | enumerations per FR-003; value chain name 1..60; themes 0..20 tags of 1..40 chars, case-insensitive dedupe; TH sector needs SET group and GICS together |
| `lensSources` | server-written only: `manual` or `default` per set field |
| listIds (create) | uuid array of the caller's lists |
| List name | 1..60 chars trimmed, unique per user ignoring case |
| PATCH body | any `StockInput` field except market and ticker; omitted = keep, `null`/`[]` = clear |
| Import file | `.csv` (UTF-8, BOM optional, RFC 4180) or `.xlsx` (first sheet), 0..1 MB, 1..1,000 data rows, 19 template columns, 4 required |
| Import options | `duplicateMode` skip/update; exactly one of `targetListId`, `newListName` |
| Identity | bearer token (or mock user); the user id comes only from the verified identity |
| Query | `listId` uuid on `GET /stocks`; `listId` on `/import-export?listId=` |

### 1.3 Outputs

- API: `Stock`/list JSON shapes (null for unset singles, `[]` for unset arrays), `Location` header, `204`, problem+json (`code`, `errors[].path`, `existingStockId`, `requestId`), preview rows with `rowNumber` and status, confirm counts (`created`, `updated`, `skipped`, `failed`, `addedToList`), `errorRows`, template files with `content-disposition`.
- Database: rows in `app.*`, `lens_sources`, memberships, unchanged state after any failed confirm.
- Web: route and breadcrumb, table content and order, `aria-sort`, field errors, alerts, toasts, focus target, `document.title`, `fetch` calls (method, URL, headers, body, FormData key order), downloaded files.

### 1.4 Invariants

1. Every stock, list and membership row has the owner's `user_id`; a route never returns, changes or deletes another user's row, and another user's id is `404` (FR-025).
2. `(user_id, market, ticker)` is unique; `lower(name)` is unique per user for lists.
3. Currency always equals the market's currency; exchange always belongs to the market.
4. A `manual` cycle is never replaced by a default; a `default` cycle always equals `CYCLE_BY_GICS[gics]` or is absent (FR-005).
5. Preview writes nothing, anywhere (database, disk, logs, third parties); confirm is all-or-nothing (FR-022, NFR-005, NFR-006).
6. `created + updated + skipped + failed` = number of data rows in the file.
7. Deleting a stock removes its memberships; deleting a list never deletes stocks.
8. Text round-trips byte-for-byte file → database → screen (NFR-009).
9. The shipped UI works at 360 px with no page-level horizontal scroll, by keyboard alone, and meets WCAG 2.1 AA contrast in both themes.

## 2. Business flows

| Flow | Path |
|---|---|
| Add stock (happy) | `/stocks/new` → market, ticker, exchange, name, lenses, lists → `POST /stocks` → toast → `/stocks/:id` (UC-001) |
| Add stock (alt) | TH stock with SET group and GICS; economic cycle defaulted then overridden; no lists; Thai text; same ticker other market |
| Add stock (exceptions) | client validation; duplicate (409 + link); server 400 mapped to fields; foreign list id; network or 5xx alert; double submit; concurrent duplicate |
| Edit / delete | `/stocks/:id/edit` (market and ticker locked) → `PATCH`; delete → AlertDialog → `204` → `/stocks` (UC-002) |
| Lists | create, rename, delete (stocks stay), add and remove stocks from list page and stock page, undo (UC-003) |
| Browse | `/stocks` sort and empty state, `/lists` counts, `/lists/:id` table (UC-004) |
| Import (happy) | template → file → preview (new / duplicate / error) → target list + duplicate mode → confirm → summary + list link (UC-005) |
| Import (alt) | CSV vs XLSX, new list vs existing, skip vs update, `?listId=` pre-selection, error rows CSV download |
| Import (exceptions) | too large, wrong type, too many rows, empty, missing headers, all rows invalid, list name taken, list gone, stock saved between preview and confirm, forced mid-transaction failure, network failure, abandoned import |
| Isolation | user V uses the same endpoints and URLs as user U and sees nothing of U's |

## 3. Field specifications (equivalence classes and boundaries)

### 3.1 Stock identity and structure

| Field | Valid classes | Invalid classes | Boundaries |
|---|---|---|---|
| ticker | `NVDA`; `brk.b` → `BRK.B`; ` pttep ` → `PTTEP`; `ADVANC-R`; `0700` | `""`, `"  "`, `.ABC`, `-ABC`, `A B`, `AB_C`, `ABC/D`, `АAPL` (Cyrillic A), `ＡＡＰＬ` (full width), 13 chars | 1 (`A`), 12 (`ABCDEFGHIJKL`), 13 |
| market | `US`, `TH` | `JP`, `us ` (API strict; import tolerant), `""` | n/a |
| exchange | US: NYSE, NASDAQ; TH: SET, mai | TH+NASDAQ, US+SET, `LSE`, `""` | 2 per market |
| currency | derived: USD / THB | any client value (ignored or rejected, never stored) | n/a |
| name | `Apple Inc`; `บมจ. ปตท.`; `Berkshire "B", Inc.`; 200 chars | `""`, `"   "`, 201 chars | 1, 200 (code points) |
| indexMembership | `[]`, `["S&P 500","Nasdaq-100"]`, `["SET50"]` for TH | `["SET50"]` for US, `["S&P 500"]` for TH, `["FTSE"]` | 0, all 2 |

### 3.2 Lenses

| Lens (fields) | Valid | Invalid |
|---|---|---|
| Sector (`gicsSector`, `setIndustryGroup`) | US: 11 GICS values. TH: SET group + GICS together or both empty | US with a SET group; TH with only one of the two; `Technology` (not GICS); SET group `Information Technology` |
| Value chain (`valueChain`, `valueChainPosition`) | name 1..60 with position in {Upstream, Midstream, Downstream, Integrated, None}; `None` without name | position other than `None` without name; name 61 chars; position `Top` |
| Size, Style, Cycle, Lynch, Life cycle, Moat, Volatility | one canonical value or null | lower-case/other spelling at the API (`growth`), `Huge`, `Unknown` for Style |
| Business model (`customers`, `revenueTypes`) | subsets of the lists in FR-003 | `Retail`, `Ads ` |
| Themes | 0..20 tags, each 1..40, `["AI","ai"]` → `["AI"]` | 21 tags, a 41-char tag, `""` tag, tag of spaces |

Boundary sets: themes 0, 1, 20, 21; tag length 1, 40, 41; chain length 1, 60, 61.

### 3.3 Economic cycle decision table (FR-005, FR-024)

| # | gics sector | cycle in input | stored cycle / source before | Result |
|---|---|---|---|---|
| 1 | set | not given | none | `CYCLE_BY_GICS[gics]`, `default` |
| 2 | set | not given | any `default` | follows the (new) sector, `default` |
| 3 | changed | not given | any `manual` | unchanged, `manual` |
| 4 | any | explicit value (even equal to the default) | any | that value, `manual` |
| 5 | set | `null` (cleared) | any | default for sector, `default` |
| 6 | none | not given | `default` | cycle cleared, no source entry (design.md algorithm; see G-6) |
| 7 | none | not given | `manual` | unchanged |

### 3.4 Lists

| Field | Valid | Invalid | Boundaries |
|---|---|---|---|
| name | `Core holdings`; `  Core holdings  ` → trimmed; `หุ้นหลัก`; names with inner spaces | `""`, `"   "`, 61 chars, duplicate ignoring case (own other list) | 1, 60, 61 |
| membership | stock and list both the caller's, not yet a member | already member (409), foreign list or stock (404), unknown stock (404) | n/a |

### 3.5 Import file and options

| Field | Valid | Invalid | Boundaries |
|---|---|---|---|
| file name / type | `.csv`, `.xlsx` (case-insensitive extension) | `.txt`, `.xls`, PNG renamed `.xlsx`, Latin-1 CSV, no file part | n/a |
| size | ≤ 1 MB | > 1 MB | 1,048,576 and 1,048,577 bytes |
| data rows | 1..1,000 | 0 (`file_empty`), 1,001 | 0, 1, 999, 1,000, 1,001 |
| headers | the 4 required (case/space/order free), unknown ones warn | any of ticker, market, exchange, name missing | 4 of 4, 3 of 4 |
| cell values | canonical or any case with spaces; empty = unset; `;` lists | unknown enum value, wrong exchange for market, theme > 40 chars | n/a |
| `duplicateMode` | `skip`, `update` | missing, `merge`, `Skip` | n/a |
| target | exactly one of `targetListId` (own list), `newListName` (1..60, not taken) | both, neither, foreign list id, taken name, 61 chars | n/a |

### 3.6 Import row status decision table

| Row valid? | (market, ticker) saved by this user | Earlier row in same file with same (market, ticker) | Status |
|---|---|---|---|
| yes | no | no | new |
| yes | yes | no | duplicate |
| yes | either | yes | error (path `ticker`) |
| no | either | either | error (every failed path) |

## 4. Scenarios and techniques

| Technique | Applied to |
|---|---|
| BVA + EP | ticker (1, 12, 13), name (1, 200, 201), list name (1, 60, 61), chain (60, 61), themes (20, 21; 40, 41), file size (1 MB, +1), rows (999, 1,000, 1,001), perf sample sizes |
| Decision table | economic cycle (3.3), import row status (3.6), sector rules by market, confirm options (mode × target) |
| State transition | wizard steps 1→2→3 and back; list membership add/remove/undo; cycle `default` ↔ `manual`; confirm commit vs rollback |
| Error guessing | Cyrillic/full-width tickers, NUL byte in text, IME composition in tag input, double submit, parallel creates, stock saved between preview and confirm, XLSX decompression and fake dimensions, hostile file name, quoted CSV newlines, numeric XLSX ticker, token user id vs body user id, template link without bearer |
| Use case | E2E journeys UC-001..UC-005, two-user isolation |
| Pairwise | not used: the lenses are independent single-field rules; table-driven EP per field is smaller and clearer |

## 5. Test data

### 5.1 Identities

| Name | Value |
|---|---|
| User U | `6f1c2b9e-0d4a-4c8e-9a51-2f6c0b7d3e11` (API tests); E2E `e2e-sl-<ts>-u@example.test`, password `Abc12345` |
| User V | `b3a7d1f0-5e2c-4a96-8b14-7c9e0d2f6a58`; E2E `e2e-sl-<ts>-v@example.test` |
| Isolation | every test file makes its own random user ids and deletes their rows in `afterAll` (design.md §Testing approach) |

### 5.2 Stock catalogue (used by name in the cases)

| Id | market / exchange / ticker | name | Lenses |
|---|---|---|---|
| S-NVDA | US / NASDAQ / NVDA | NVIDIA Corporation | gics Information Technology, style Growth, size Mega, volatility High, moat Intangibles, chain `AI & Semis` Midstream, customers B2B, revenue Product sale, themes AI, Data center, index S&P 500, Nasdaq-100 |
| S-AAPL | US / NASDAQ / AAPL | Apple Inc | gics Information Technology, style Quality, size Mega |
| S-MSFT | US / NASDAQ / MSFT | Microsoft Corporation | none |
| S-BRKB | US / NYSE / BRK.B | Berkshire Hathaway Inc. Class B | gics Financials |
| S-PTTEP | TH / SET / PTTEP | `บมจ. ปตท. สำรวจและผลิตปิโตรเลียม` | setIndustryGroup Resources, gics Energy, style Dividend, size Large, themes `Energy security`, index SET50 |
| S-ADVANC | TH / SET / ADVANC | `แอดวานซ์ อินโฟร์ เซอร์วิส` | Technology + Communication Services |
| S-MAI | TH / mai / XYZMAI | `บริษัท ตัวอย่าง มาย` | none |
| S-TRUE | TH / SET / TRUE | True Corporation | for the same-ticker-other-market case with US/TRUE |

### 5.3 Lists

`Core holdings`, `Watching`, `Swing study`, `หุ้นหลัก`, 60-char `a×60`.

### 5.4 Import fixtures (`apps/api/test/fixtures/imports/`)

F-01..F-12 are the fixtures named in T-005's acceptance criteria. F-13..F-31 are added by this
design; T-013 creates them with the others.

| Id | File | Content | Expected preview / confirm | Cases |
|---|---|---|---|---|
| F-01 | `template-bom.csv` | downloaded template (BOM, 1 US + 1 TH example) | 200, 2 new, 0 errors | A-127, A-129 |
| F-02 | `no-bom.csv` | 3 valid rows, no BOM | 200, 3 new | A-129 |
| F-03 | `thai-names.csv` | BOM, 5 rows with Thai names and themes | 200, exact Thai strings | U-056, A-129, A-126, E-128 |
| F-04 | `formula.xlsx` | name cell `=CONCAT("Ad","vanc")` with cached value | 200, name `Advanc` | U-055 |
| F-05 | `two-sheets.xlsx` | sheet 1 one row, sheet 2 five rows | 200, 1 row | U-055 |
| F-06 | `rows-1000.csv` | 1,000 valid rows | 200, preview < 3 s | U-053, A-138 |
| F-07 | `rows-1001.csv` | 1,001 data rows | 422 `file_too_many_rows` | U-053 |
| F-08 | `size-1.1mb.csv` | 1.1 MB | 413 `file_too_large` | U-053 |
| F-09 | `header-only.csv` | headers, no rows | 422 `file_empty` | U-053 |
| F-10 | `fake.xlsx` | PNG bytes named `.xlsx` | 415 `file_unsupported` | U-054 |
| F-11 | `latin1.csv` | Latin-1 bytes (`0xE9`) | 415 `file_unsupported` | U-054 |
| F-12 | `report.txt` | text | 415 `file_unsupported` | U-054 |
| F-13 | `size-1mb-exact.csv` | exactly 1,048,576 bytes, ≤ 1,000 rows (padding in an unknown column) | 200 | A-129 |
| F-14 | `size-1mb-plus1.csv` | 1,048,577 bytes | 413 | A-129 |
| F-15 | `empty.csv` | 0 bytes | 422 `file_empty` (see G-7) | A-129 |
| F-16 | `quoted.csv` | RFC 4180: comma, doubled quotes, CRLF, a newline inside a quoted name | 200, names byte-exact | A-130 |
| F-17 | `crlf-blank-lines.csv` | CRLF endings, blank lines between and after rows | blank lines ignored, row numbers see A-130 | A-130 |
| F-18 | `messy-values.csv` | mixed case, padded cells, `MAI`, `a;B ; c` lists | 200, canonicalised on confirm | A-139, U-017 |
| F-19 | `all-errors.csv` | 3 invalid rows | counts error 3 | U-064, A-132 |
| F-20 | `dup-in-file.csv` | `NVDA US` twice, `nvda us` once, `NVDA TH` once | rows 3,4 error; row 5 (other market) new | A-133 |
| F-21 | `shuffled-unknown.csv` | header ` Name ,TICKER,exchange,market,notes` | 200 + 1 header warning | U-050 |
| F-22 | `missing-headers.csv` | `ticker,market` | 422 `file_missing_headers` (exchange, name) | U-051 |
| F-23 | `numeric-cells.xlsx` | ticker as number cell `700`, boolean cell, date cell, error-value cell | no 500; see A-134 | A-134 |
| F-24 | `xlsx-bomb.xlsx` | < 1 MB, compresses > 2,000 rows of cells | 422 `file_too_many_rows` fast, no OOM | A-135 |
| F-25 | `upper-ext.CSV`, `upper-ext.XLSX` | valid, upper-case extensions | 200 | A-129 |
| F-26 | `legacy.xls` | OLE2 binary | 415 | A-129 |
| F-27 | `duplicate-header.csv` | `ticker` column twice | defined behaviour, no 500 (see G-8) | A-131 |
| F-28 | `hostile-name.csv` | uploaded as `../../x<img src=x onerror=alert(1)>.csv` | 200; `fileName` is plain text; nothing written outside memory | A-136, C-163 |
| F-29 | `full-lens-th.csv`, `full-lens-us.csv` | every lens column filled (S-NVDA and S-PTTEP values) | 200, all stored | A-139 |
| F-30 | `rows-1000-mixed.csv` | 700 new + 300 duplicates of seeded stocks | confirm < 5 s | A-146 |
| F-31 | `fake-dimension.xlsx` | sheet claims `A1:XFD1048576`, 3 real rows | 200 fast, 3 rows | A-135 |

### 5.5 Strings

Thai `บมจ. ปตท. สำรวจและผลิตปิโตรเลียม`; combining marks `ก็ ก่ ก้` (no normalisation allowed);
zero-width joiner `a‍b`; astral `😀` ×200; NUL `a\u0000b`; 60/61-char `a×60`, `a×61`; 200/201-char names
`n×200`, `n×201`; hostile `<img src=x onerror=alert(1)>`.

---

## 6. Cases from the dev plan (IDs kept, not repeated)

Each case below is already specified with Given/When/Then in `dev-plan.md`; automation uses that
text. "Real level" is what the case needs to run (the plan calls all of them unit).

| Task | IDs | Real level | Subject | Covers |
|---|---|---|---|---|
| T-001 | TC-U-001..005 | Integration (DB) | exchange/market CHECK, per-user ticker unique, list name unique ignoring case, composite FK, cascades | FR-002, FR-007, FR-009, FR-011, FR-025 |
| T-001 | TC-U-006 | Integration (DB) | Drizzle drift test | FR-025 |
| T-002 | TC-U-010..020 | Unit (domain) | ticker, exchange, sector, chain, themes, cycle, canonicaliseRow | FR-001, FR-003, FR-005, FR-017..FR-019, NFR-009 |
| T-003 | TC-U-030..036 | API (DB) | lists create, uniqueness, bounds, membership, delete, isolation, order | FR-009..FR-013, FR-025 |
| T-004 | TC-U-040..048 | API (DB) | create, duplicate, other market, patch locks, cycle follow, clear, delete, filter, Thai | FR-001..FR-008, FR-014, FR-025, NFR-009 |
| T-005 | TC-U-050..058 | API (DB, Fixtures) | headers, statuses, limits, unsupported, xlsx, BOM, missing file, templates | FR-015..FR-020, NFR-009 |
| T-006 | TC-U-060..066 | API (DB) | skip, update, new list, late conflict, nothing to import, no double count, foreign list | FR-021..FR-025 |
| T-007 | TC-U-070..074 | Unit/Component (web) | ApiError, prefix, 204, network, crumb data | FR-025 (error surface) |
| T-008 | TC-U-080..086 | Component (StubApi) | sort, empty, TH sector, default badge, add/remove list, 404 | FR-004, FR-008, FR-012 |
| T-009 | TC-U-090..096 | Component (StubApi) | market switch, cycle default, validation, 409 alert, tags, patch body, server errors | FR-001..FR-006, FR-014 |
| T-010 | TC-U-100..104 | Component (StubApi) | create list, 409, delete text, add picker, empty list | FR-009..FR-013 |
| T-011 | TC-U-110..116 | Component (StubApi) | counts and filter, missing headers, confirm gating, all errors, name conflict, summary, `?listId=` | FR-020..FR-023 |

Notes on the existing cases: TC-U-014 asserts `["AI","EV"]` from a 3-element input, which fixes
the first spelling as the kept one; TC-U-016 also guards that no sector is unmapped;
TC-U-052 expects the second `nvda us` row (row 5) to be an error while row 2 stays new, which is
the same rule as 3.6.

---

## 7. New unit cases (domain and web helpers)

### TC-U-120
**Ticker boundaries and look-alike characters** | Level: Unit | P1 | BVA, EG (table-driven)
- **Preconditions:** none.
- **Input rows:** `A` ; `ABCDEFGHIJKL` ; `ABCDEFGHIJKLM` ; `A.B-C` ; `-ABC` ; `.ABC` ; `AB_C` ; `ABC/D` ; `АAPL` (first letter Cyrillic U+0410) ; `ＡＡＰＬ` (full width) ; ` brk.b ` ; `"AAPL\n"` ; `0700`.
- **Expected:** valid after `normaliseTicker` + `TICKER_PATTERN`: `A`, 12 chars, `A.B-C`, `BRK.B`, `AAPL` (newline trimmed), `0700`. Invalid: 13 chars, `-ABC`, `.ABC`, `AB_C`, `ABC/D`, Cyrillic, full width. No exception for any input.
- **Mock needed:** none. **Covers:** FR-001.

### TC-U-121
**Company name length counts characters, not bytes or UTF-16 units** | Level: Unit | P2 | BVA, EG
- **Input rows:** 1 char `A` ; 200 × `n` ; 201 × `n` ; `""` ; `"   "` ; 200 × Thai `ก` ; 200 × `😀` (astral) ; 201 × `😀` ; Thai with combining marks (`ก็`) 100 times.
- **Expected:** valid: 1, 200 `n`, 200 `ก`, 200 `😀` (see G-9: Zod `.max` counts UTF-16 units, so this row may fail and then is a defect, since FR-001 says characters and the DB `char_length` counts code points), combining-mark string. Invalid: 201 `n`, 201 `😀`, `""`, `"   "` (blank after trim, see G-5). Combining marks are not normalised or stripped.
- **Mock needed:** none. **Covers:** FR-001, NFR-009.

### TC-U-122
**Market, exchange and index combinations** | Level: Unit | P1 | EP (full 2 × 4 × 4 matrix)
- **Input:** `StockInput.safeParse` for every (market, exchange) pair of {US, TH} × {NYSE, NASDAQ, SET, mai}; every (market, index) pair of {US, TH} × {S&P 500, Nasdaq-100, SET50, SET100}; `indexMembership: []`; `["S&P 500","S&P 500"]`.
- **Expected:** exactly 4 valid exchange pairs and 4 valid index pairs; the others fail with path `exchange` or `indexMembership`; currency USD for US and THB for TH; duplicate index entries yield a single entry or an error, never a crash (defined in the implementation, pinned here).
- **Mock needed:** none. **Covers:** FR-001.

### TC-U-123
**StockInput is strict, canonicaliseRow is tolerant** | Level: Unit | P1 | EP (every enumerated lens value)
- **Input:** for each value in `LENS_VALUES` (all 10 lenses, FR-003 table): (a) the canonical spelling, (b) lower-case, (c) upper-case, (d) padded with spaces, to `StockInput.safeParse` and to `canonicaliseRow`.
- **Expected:** `StockInput` accepts (a) only; `canonicaliseRow` accepts (a)-(d) and returns the canonical spelling (`growth`→`Growth`, `network effect`→`Network effect`, `S&P 500` from `s&p 500`, `mai` from `MAI`). A value from another lens (`Cyclical` for Style) is rejected by both.
- **Mock needed:** none. **Covers:** FR-003, FR-018.

### TC-U-124
**resolveEconomicCycle extra branches** | Level: Unit | P1 | DT (3.3 rows 4, 6, 7)
- **Input rows:** (f) explicit `Defensive` with gics Utilities (equals the default); (g) prior `Defensive/default`, gics cleared (null); (h) prior `Cyclical/manual`, gics cleared; (i) no sector, no cycle, no prior; (j) invalid cycle `Stable`; (k) every one of the 11 sectors with no prior.
- **Expected:** (f) `Defensive/manual`; (g) none (cycle null, source absent); (h) `Cyclical/manual`; (i) none; (j) rejected by the schema (never reaches the resolver); (k) matches FR-005 table (4 Cyclical, 4 Sensitive, 3 Defensive).
- **Mock needed:** none. **Covers:** FR-004, FR-005.

### TC-U-125
**canonicaliseRow multi-value cells** | Level: Unit | P2 | EP, EG
- **Input cells:** `customers` = `b2b; B2C ;` ; `a;;b` ; `B2B;b2b` ; `B2B;Retail` ; `revenue_types` = `Ads;Rent` ; `themes` = `AI;ai; EV ` ; `themes` with one 41-char tag ; `themes` with 21 distinct tags ; `index_membership` = `SET50;SET100` for TH and for US.
- **Expected:** `["B2B","B2C"]`; empty segments dropped; `B2B;b2b` → `["B2B"]`; `Retail` → error path `customers`; `["Ads","Rent"]`; themes `["AI","EV"]`; 41-char tag → error `themes`; 21 tags → error `themes`; TH index ok, US index → error `indexMembership`.
- **Mock needed:** none. **Covers:** FR-003, FR-017, FR-018, FR-019.

### TC-U-126
**canonicaliseRow sector and value-chain rules by market** | Level: Unit | P1 | DT
- **Input rows:** US `sector=Information Technology`; US `sector=Resources` (a SET group); US `gics_sector=Garbage` + `sector=Energy`; TH `sector=Resources, gics_sector=Energy`; TH `sector=Resources` only; TH `gics_sector=Energy` only; TH `sector=Information Technology`; `value_chain_position=Upstream` with empty `value_chain`; `value_chain=Oil & Gas` with empty position; `value_chain_position=none` with empty chain; row where every cell is empty except the four required.
- **Expected:** US IT ok (`gicsSector`); US `Resources` error path `gicsSector`; US ignores `gics_sector` (ok, gics = Energy); TH both ok (`setIndustryGroup` Resources, `gicsSector` Energy); TH SET only → error `gicsSector`; TH GICS only → error `setIndustryGroup`; TH `Information Technology` → error `setIndustryGroup`; position without chain → error `valueChain`; chain without position → ok (position null; see G-10); `none` → `None`; minimal row ok with every lens unset.
- **Mock needed:** none. **Covers:** FR-003, FR-017, FR-018, FR-019.

### TC-U-127
**canonicaliseRow keeps text exactly, trims only surrounding spaces** | Level: Unit | P2 | EG
- **Input cells:** name ` Apple Inc ` ; name `ก็ ก่ ก้` (NFC and NFD forms) ; name `a‍b` ; name `Berkshire "B", Inc.` ; name with an inner newline ; ticker with a tab ; name `😀`.
- **Expected:** surrounding spaces trimmed (see G-5); inner characters byte-identical (same code points, NFC and NFD stay different); zero-width joiner kept; quotes and commas kept; inner newline kept; tab in ticker trimmed; astral kept.
- **Mock needed:** none. **Covers:** NFR-009, FR-018.

### TC-U-128
**Template columns match FR-015 exactly** | Level: Unit | P1 | EP
- **Input:** `TEMPLATE_COLUMNS`.
- **Expected:** 19 entries in this order: `ticker, market, exchange, name, index_membership, sector, gics_sector, value_chain, value_chain_position, size, style, economic_cycle, lynch_type, life_cycle, customers, revenue_types, moat, themes, volatility`; kinds `multi` exactly for `index_membership`, `customers`, `revenue_types`, `themes`; no duplicate headers; every `field` is a `StockInput` key.
- **Mock needed:** none. **Covers:** FR-015.

### TC-U-129
**ListName schema** | Level: Unit | P1 | BVA
- **Input rows:** `A` ; `a×60` ; `a×61` ; `""` ; `"   "` ; `"  Core holdings  "` ; `หุ้นหลัก` ; 60 × `ก` ; `Core  holdings` (two inner spaces).
- **Expected:** valid: 1, 60, trimmed → `Core holdings`, Thai, 60 Thai, inner spaces kept as typed. Invalid: 61, empty, blank.
- **Mock needed:** none. **Covers:** FR-009, FR-010.

### TC-U-130
**StockPatch is strict about locked and required fields** | Level: Unit | P1 | EP, EG
- **Input rows:** `{ ticker: "X" }` ; `{ market: "TH" }` ; `{ name: null }` ; `{ exchange: null }` ; `{ moat: null }` ; `{ themes: [] }` ; `{ customers: [] }` ; `{ valueChainPosition: null, valueChain: null }` ; `{}` ; `{ id: "x" }` ; `{ lensSources: {} }`.
- **Expected:** `ticker`, `market`, `name: null`, `exchange: null`, `id`, `lensSources` rejected (400 path = the key); `moat: null`, `themes: []`, `customers: []`, both chain fields null accepted; `{}` accepted as an empty patch (route behaviour pinned by TC-A-116).
- **Mock needed:** none. **Covers:** FR-006, FR-003.

### TC-U-131
**Client-supplied server fields are never accepted** | Level: Unit | P1 | EG
- **Input:** `StockInput.safeParse` with extra keys `currency: "EUR"`, `userId: <V>`, `user_id`, `id`, `lensSources: { economicCycle: "auto" }`, `createdAt`.
- **Expected:** each extra key is rejected, or stripped from the parsed output; none appears in the parsed object (which of the two is pinned by the implementation, never "kept").
- **Mock needed:** none. **Covers:** FR-001, FR-004, FR-025, NFR-004.

### TC-U-132
**Error-rows CSV builder** | Level: Unit | P1 | EP, EG
- **Input:** `errorRows` = row 4 `{ ticker: "XYZ", market: "JP", name: "" }` errors market + name; row 9 `{ ticker: "ก", name: "Berkshire \"B\", Inc.\nline2" }` with one error; one row with two errors.
- **Expected:** output starts with `EF BB BF`; header = original columns present + `errors`; `\r\n` line ends; fields with comma, quote or newline are quoted with doubled quotes (RFC 4180); errors joined as `market: must be US or TH; name: required`; Thai bytes unchanged; one data line per error row; empty list gives header only (button hidden by C-172).
- **Mock needed:** none. **Covers:** FR-023, NFR-009.

### TC-U-133
**Stock table sort helper** | Level: Unit | P2 | EP, EG
- **Input:** stocks with tickers `MSFT, AAPL, BRK.B, pttep`; names including Thai and `apple` vs `Apple`; markets US/TH; sectors with `null` values; sort by ticker, name, market, sector, asc and desc.
- **Expected:** order is deterministic and stable; comparison is case-insensitive; unset sector sorts last in both directions (see G-11); Thai names order by code point or locale (pinned, not random); toggling asc→desc reverses non-null order; sort by an unsortable key (`size`) is not offered.
- **Mock needed:** none. **Covers:** FR-008.

### TC-U-134
**Formatting helpers** | Level: Unit | P3 | BVA
- **Input:** counts 0, 1, 2, 1,248; labels `stock(s)`, `list(s)`, `row(s)`.
- **Expected:** `0 stocks`, `1 stock`, `2 stocks`, `1,248 rows`; no `1 stocks`.
- **Mock needed:** none. **Covers:** FR-008, FR-013, FR-020 (copy).

### TC-U-135
**File-level problem code to message mapper** | Level: Unit | P1 | EP
- **Input:** `file_too_large`, `file_unsupported`, `file_too_many_rows` (with and without a row count), `file_empty`, `file_missing_headers` (paths `ticker`, `name`), `file_missing`, a network error, an unknown code `boom`, status 500.
- **Expected:** `File is larger than 1 MB`; `Use a .csv or .xlsx file`; `The file has 1,248 rows; the limit is 1,000` (with count) or a generic form naming the limit (without, see G-3); `The file has no data rows`; `Missing columns: ticker, name`; a "choose a file" message; a retryable "could not reach the server" message; a generic message for the unknown code and 500, none showing raw JSON.
- **Mock needed:** none. **Covers:** FR-016, FR-017.

---

## 8. API, database and Supabase cases (TC-A)

Shared setup unless stated: `buildApp` against local Supabase (`pnpm db:reset`), `AUTH_MODE=supabase`
with LocalJWKS tokens (the real verifier path, as User Auth T-002), each file with its own random
user ids and `afterAll` cleanup. Inject helpers sign a token for U or V.

### Security and isolation

### TC-A-101
**Every stock, list and import route needs an identity** | Level: API | P1 | EP (table-driven, 17 rows)
- **Preconditions:** app in `supabase` mode; LocalJWKS.
- **Input rows:** no `Authorization` header and then an invalid token for each of `GET /stocks`, `POST /stocks`, `GET/PATCH/DELETE /stocks/{id}`, `GET /lists`, `POST /lists`, `GET/PATCH/DELETE /lists/{id}`, `POST /lists/{id}/stocks`, `DELETE /lists/{id}/stocks/{stockId}`, `GET /imports/template.csv`, `GET /imports/template.xlsx`, `POST /imports/preview`, `POST /imports`.
- **Expected:** every row 401 `unauthenticated`, `WWW-Authenticate: Bearer`, problem+json; no row written (table counts unchanged); handler never ran (no side effect for `POST` rows).
- **Mock needed:** LocalJWKS, DB. **Covers:** NFR-004, FR-025.

### TC-A-102
**Two-user proof: stocks** | Level: API | P1 | EP, EG
- **Preconditions:** U owns S-NVDA (in list LU), S-PTTEP; V owns S-AAPL and an own list LV; both signed in via TwoUsers.
- **Input (as V):** `GET /stocks` ; `GET /stocks/{U.NVDA}` ; `PATCH /stocks/{U.NVDA} { name: "Hacked" }` ; `DELETE /stocks/{U.NVDA}` ; `GET /stocks?listId={LU}` ; `POST /stocks` with `listIds: [LU]` ; `POST /stocks { ticker: "NVDA", market: "US", ... }`.
- **Expected:** list contains only V's AAPL; GET/PATCH/DELETE of U's id `404 not_found` (body identical to an id that never existed, apart from `requestId`); `?listId={LU}` `404`; `listIds: [LU]` `404` and no stock saved; V can create their own `US/NVDA` (201) without a `409` and without learning that U has it; afterwards U's NVDA is unchanged (name, lenses, memberships).
- **Mock needed:** LocalJWKS, TwoUsers, DB, SeedRepo. **Covers:** NFR-004, FR-025, FR-002.

### TC-A-103
**Two-user proof: lists and memberships** | Level: API | P1 | EP, EG
- **Preconditions:** as TC-A-102, plus U's stock SU in LU.
- **Input (as V):** `GET /lists` ; `GET/PATCH/DELETE /lists/{LU}` ; `POST /lists/{LU}/stocks { stockId: V.AAPL }` ; `POST /lists/{LV}/stocks { stockId: SU }` ; `DELETE /lists/{LU}/stocks/{SU}` ; `POST /lists { name: "core holdings" }` where U has `Core holdings`.
- **Expected:** V's list shows only `LV`; all calls on `LU` or `SU` answer `404 not_found`; `POST /lists { name }` for V succeeds (name uniqueness is per user); U's list still has SU and name `Core holdings`; `stockCount` of LU unchanged; the composite FK also blocks the direct SQL insert `(LV, SU, user V)` with SQLSTATE 23503 (backstop, see TC-U-004).
- **Mock needed:** LocalJWKS, TwoUsers, DB, SeedRepo. **Covers:** NFR-004, FR-025, FR-009, FR-012.

### TC-A-104
**Two-user proof: imports** | Level: API | P1 | EP, EG
- **Preconditions:** U owns US/AAPL and list LU; V owns nothing; fixture F-02 contains AAPL.
- **Input (as V):** `POST /imports/preview` with F-02 ; `POST /imports { duplicateMode: "update", newListName: "Mine" }` with F-02 ; `POST /imports { duplicateMode: "skip", targetListId: LU }`.
- **Expected:** preview marks AAPL `new` for V (V cannot tell that U saved it); confirm creates 3 stocks for V only, U's AAPL unchanged (style, name, `updatedAt`); the foreign `targetListId` answers `404` and V saved nothing from that call; `Mine` belongs to V.
- **Mock needed:** LocalJWKS, TwoUsers, DB, Fixtures. **Covers:** NFR-004, FR-025, FR-020, FR-022.

### TC-A-105
**The owner comes from the token, never from the body** | Level: API | P1 | EG
- **Input (as U):** `POST /stocks` with extra keys `userId: <V>`, `user_id: <V>`, `lensSources: { economicCycle: "auto" }`, `id: <fixed uuid>`; `POST /lists { name, userId: <V> }`; `POST /imports` with extra multipart field `userId=<V>`; header `x-user-id: <V>`.
- **Expected:** each call either `400 validation_failed` or succeeds ignoring the extra field; any created row has `user_id = U`; V's data and counts unchanged; stored `lens_sources` contains only `manual`/`default` values written by the server.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-025, FR-004, NFR-004.

### TC-A-106
**Database is not reachable except through the API** | Level: Integration | P1 | EP
- **Preconditions:** local stack; anon key and an `authenticated` user token from the stack.
- **Input:** `GET http://127.0.0.1:54321/rest/v1/stocks` with `Accept-Profile: app` and each key; `SET ROLE anon; select * from app.stocks`; `SET ROLE authenticated; select * from app.lists`; `information_schema.columns` for `user_id` on the three tables.
- **Expected:** REST answers an error (schema not exposed or permission denied), never rows, even when rows exist; both SQL role selects fail with `permission denied for schema app` (TC-U-001's grants, asserted end to end here); `user_id` is `NOT NULL` on `stocks`, `lists`, `list_stocks`; RLS enabled on all three.
- **Mock needed:** DB. **Covers:** FR-025, NFR-004.

### Stocks API

### TC-A-107
**Create a TH stock: derived fields and response shape** | Level: API | P1 | EP
- **Input:** `POST /stocks { ticker: " pttep ", market: "TH", exchange: "mai", name: "บมจ. ปตท.", indexMembership: ["SET100"] }`.
- **Expected:** 201, `Location: /stocks/{id}`; `ticker: "PTTEP"`, `currency: "THB"`, `exchange: "mai"`; every unset single lens `null`, `customers`/`revenueTypes`/`themes` `[]`, `lensSources: {}`, `listIds: []`; `createdAt = updatedAt`; id is a UUIDv7; `GET /stocks/{id}` returns the identical body.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-001, FR-014.

### TC-A-108
**Stock identity validation, table-driven** | Level: API | P1 | BVA, EP (one POST per row)
- **Input rows:** ticker `A` (201), 12 chars (201), 13 chars (400 `ticker`), `""` (400), `A B` (400), `.ABC` (400), Cyrillic (400); name 1 char (201), 200 (201), 201 (400 `name`), `""` (400), Thai 200 (201); market `JP` (400 `market`), missing (400); exchange `SET` with US (400 `exchange`), `NASDAQ` with TH (400); body `currency: "EUR"` (see TC-U-131); missing required keys one at a time (4 rows).
- **Expected:** statuses as listed; every 400 is `validation_failed` with `errors[].path` naming the field and no row saved; `currency` stored is always the market's.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-001.

### TC-A-109
**Index membership rules** | Level: API | P2 | EP
- **Input rows:** US `["S&P 500","Nasdaq-100"]` (201); TH `["SET50","SET100"]` (201); `[]` (201); US `["SET50"]` (400 `indexMembership`); TH `["S&P 500"]` (400); `["FTSE"]` (400).
- **Expected:** statuses as listed; stored arrays equal the input (order kept) for the valid rows.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-001.

### TC-A-110
**Each lens rejects values outside its set and stores canonical ones** | Level: API | P1 | EP (14 fields × valid/invalid)
- **Input:** for `size`, `style`, `economicCycle`, `lynchType`, `lifeCycle`, `moat`, `volatility`, `customers`, `revenueTypes`: one valid canonical value (201 and round-trips) and one invalid (`Huge`, `Dividend` for size, `Retail`, lower-case `growth`) → 400 with the field as `errors[].path`; one POST with every lens set (S-NVDA) round-trips field by field; one POST with every lens `null`/`[]`.
- **Expected:** as listed; no partial save on 400; the full stock equals the input plus derived fields.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-003.

### TC-A-111
**Sector rules per market** | Level: API | P1 | DT
- **Input rows:** US IT (201, `setIndustryGroup: null`); US + `setIndustryGroup: Services` (400 `setIndustryGroup`); US `gicsSector: Technology` (400); TH SET `Resources` + gics `Energy` (201); TH `Resources` only (400 `gicsSector`); TH gics only (400 `setIndustryGroup`); TH SET `Information Technology` (400); TH none (201); TH group `Agro & Food Industry` + `Consumer Staples` (201, all 8 SET groups accepted).
- **Expected:** as listed; for TH the two fields are set together or both null in the stored row; PATCH that sets only one of them on a TH stock that has both is also rejected (400).
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-003.

### TC-A-112
**Value chain rules** | Level: API | P2 | BVA, DT
- **Input rows:** chain 60 chars + `Upstream` (201); chain 61 chars (400 `valueChain`); chain `Oil & Gas` + each of the 5 positions (201); position `Upstream` without chain (400 `valueChain`); position `None` without chain (201); chain only (see G-10: 201 expected, position null); position `Top` (400).
- **Expected:** as listed. PATCH `{ valueChain: null }` on a stock whose position is `Upstream` is 400 unless the position is cleared in the same patch; `{ valueChain: null, valueChainPosition: null }` is 200.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-003.

### TC-A-113
**Themes bounds and de-duplication** | Level: API | P2 | BVA
- **Input rows:** 0 themes; 1 theme; 20 distinct (201); 21 distinct (400 `themes`); tag of 40 chars (201); 41 chars (400 `themes.0`); `["AI","ai"," EV "]` → stored `["AI","EV"]`; `[""]` (400); `["   "]` (400); `["Energy security"]` with inner space (201); Thai tag (201).
- **Expected:** as listed; first spelling is kept; order preserved.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-003, NFR-009.

### TC-A-114
**Default economic cycle for all 11 sectors, both markets** | Level: API | P1 | EP (table-driven, 11 US + 3 TH rows)
- **Input:** `POST /stocks` with only a sector for each GICS sector (US); TH rows: `Resources`+`Energy`, `Technology`+`Information Technology`, `Services`+`Utilities`.
- **Expected:** `economicCycle` and `lensSources.economicCycle = "default"` per the FR-005 table (Materials, Consumer Discretionary, Financials, Real Estate → Cyclical; Communication Services, Energy, Industrials, Information Technology → Sensitive; Consumer Staples, Health Care, Utilities → Defensive); TH default follows the mapped GICS value, not the SET group; an explicit `economicCycle` in the body wins and is `manual`.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-005, FR-004.

### TC-A-115
**lens_sources lifecycle on create and patch** | Level: API | P1 | ST
- **Preconditions:** none.
- **Input sequence:** create S-NVDA (sector, style set, cycle not given) → PATCH `{ economicCycle: "Cyclical" }` → PATCH `{ gicsSector: "Utilities" }` → PATCH `{ economicCycle: null }` → PATCH `{ style: null }` → PATCH `{ gicsSector: null }`.
- **Expected after each step:** (1) sources `gicsSector manual`, `style manual`, `economicCycle default`; (2) cycle `Cyclical`, source `manual`; (3) cycle stays `Cyclical/manual`; (4) cycle `Defensive/default` (cleared falls back to sector); (5) `style` null and no `style` key in `lensSources`; (6) sector null, cycle null (default removed, see G-6), no `gicsSector`/`economicCycle` keys. Every response equals a fresh `GET`.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-004, FR-005, FR-006.

### TC-A-116
**PATCH semantics** | Level: API | P1 | EP, EG
- **Preconditions:** TH stock `PTTEP` on `SET` with both sector fields.
- **Input rows:** `PATCH { exchange: "NASDAQ" }` ; `{ exchange: "mai" }` ; `{ name: "New name" }` and compare timestamps ; `{}` ; `{ name: null }` ; `{ indexMembership: ["S&P 500"] }` ; unknown key `{ foo: 1 }` ; `PATCH /stocks/not-a-uuid` ; `PATCH` of a deleted id ; body not JSON.
- **Expected:** `NASDAQ` → 400 `exchange` (checked against the stored market); `mai` → 200; name change → 200, `updatedAt` > old `updatedAt`, `createdAt` unchanged, other fields unchanged; `{}` → 200 with no change (or 400; pinned, see G-12) and never 500; `name: null` → 400; wrong-market index → 400; unknown key → 400 (or ignored, pinned like TC-U-131); malformed id → 400 or 404, never 500; deleted → 404; invalid JSON → 400.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-006, FR-001, FR-003.

### TC-A-117
**Duplicate stock detection** | Level: API | P1 | EP, DT
- **Preconditions:** U has US/AAPL (id A) and TH/TRUE absent.
- **Input rows:** ` aapl ` US ; `AAPL` US on NYSE (other exchange, same market) ; `AAPL` TH ; `TRUE` US then `TRUE` TH ; `aapl` + `listIds: [LU]` ; a duplicate whose body is also invalid.
- **Expected:** rows 1, 2 and 5 → 409 `stock_exists`, `existingStockId = A`, `detail` names `AAPL (US)`; `AAPL` TH → 201 (different stock); `TRUE` US and TH both 201; the 409 with `listIds` leaves LU unchanged; the invalid-and-duplicate body answers 400 (validation first), not 409.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-002, FR-014.

### TC-A-118
**Create with listIds** | Level: API | P1 | EP, EG
- **Preconditions:** U has lists L1, L2; V has LV.
- **Input rows:** `listIds: [L1, L2]` ; `listIds: []` ; `listIds: [L1, L1]` ; `listIds: [L1, LV]` ; `listIds: ["nope"]` ; `listIds: [<random uuid>]`.
- **Expected:** row 1: 201, `listIds` equals both, counts of L1 and L2 up by 1; row 2: 201, no membership; row 3: 201 with one membership or `400` (pinned, no 500, no duplicate row); row 4: 404 and **no stock saved** (count of stocks unchanged, L1 unchanged); row 5: 400; row 6: 404 with nothing saved. A forced failure after the stock insert (RepoFault) leaves neither the stock nor the memberships.
- **Mock needed:** LocalJWKS, DB, RepoFault (last step). **Covers:** FR-014, FR-025.

### TC-A-119
**GET /stocks shape, order and filter** | Level: API | P1 | EP
- **Preconditions:** U has MSFT, brk.b, AAPL, PTTEP, `S-MAI`; list L has PTTEP and AAPL; V has stocks too.
- **Input:** `GET /stocks` ; `GET /stocks?listId=L` ; `GET /stocks?listId=<empty list>` ; `GET /stocks?listId=bad` ; `GET /stocks?listId=<random uuid>` ; new user with no stocks.
- **Expected:** items ordered by ticker (`AAPL, BRK.B, MSFT, PTTEP, XYZMAI`; pinned collation, document if `BRK.B` vs `BRKB` matters); each item has full `Stock` shape and its `listIds`; `listId=L` → `AAPL, PTTEP`; empty list → `{ items: [] }`; malformed → 400; unknown → 404; no stocks → `{ items: [] }`; none of V's stocks appear.
- **Mock needed:** LocalJWKS, DB, SeedRepo. **Covers:** FR-008, FR-013.

### Lists API

### TC-A-120
**List name edge cases on create and rename** | Level: API | P2 | BVA, EG
- **Input rows:** create `หุ้นหลัก` ; create 60 × `ก` ; create `Core  holdings` ; rename `Core holdings` → `core holdings` (own list, case change only) ; rename to its own exact name ; rename to another list's name differing in case ; PATCH with 60 / 61 / empty / blank ; PATCH body `{}` ; create with body `{ name: 123 }` ; name containing `\u0000`.
- **Expected:** Thai and 60-char names 201 and byte-exact; inner spaces kept; own-list case change 200 (list is not its own duplicate, see G-13); same name 200; clash with another list 409 `list_name_taken`; 60 → 200, 61/empty/blank → 400; `{}` → 400; number → 400; NUL → 400, never 500.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-009, FR-010, NFR-009.

### TC-A-121
**Membership edge cases and counts** | Level: API | P1 | EP, ST
- **Input sequence:** `POST /lists/{L}/stocks` with `{}`, `{ stockId: "x" }`, a random uuid, a deleted stock's id; add S1, S2 (counts 2); `DELETE /lists/{L}/stocks/{S3}` (not a member); delete S1 (count 1); delete S1 again; re-add S1; delete stock S2 entirely; delete list L; `DELETE /lists/{L}/stocks/{S1}` afterwards.
- **Expected:** `{}` and `"x"` → 400; random and deleted ids → 404; non-member removal → 404; second removal of S1 → 404; re-add → 201; `stockCount` after each step is 2, 1, 2 (re-add), 1 (S2 deleted); list delete → 204 and S1 still `GET` 200; the last call → 404.
- **Mock needed:** LocalJWKS, DB, SeedRepo. **Covers:** FR-012, FR-007, FR-011, FR-013.

### TC-A-122
**Concurrency: parallel writes never produce 500 or duplicates** | Level: API | P2 | EG
- **Input:** `Promise.all` of 5 × `POST /stocks` same `US/NVDA`; 5 × `POST /lists/{L}/stocks` same stock; 5 × `POST /lists` same name with different case; 3 × `POST /imports` (skip, `newListName: "Race"`) of F-02.
- **Expected:** exactly one 201 and four 409 (`stock_exists`, `already_in_list`, `list_name_taken`) in the first three; no 5xx; row counts equal one; for the imports one wins and the others get `409 list_name_taken`, with no partially filled list.
- **Mock needed:** LocalJWKS, DB, Fixtures. **Covers:** FR-002, FR-009, FR-012, FR-022.

### TC-A-123
**Every error is RFC 7807 with a stable code** | Level: API | P2 | EP (table-driven)
- **Input:** one request per documented code: `validation_failed`, `not_found`, `stock_exists`, `list_name_taken`, `already_in_list`, `file_missing`, `file_too_large`, `file_unsupported`, `file_too_many_rows`, `file_empty`, `file_missing_headers`, `nothing_to_import`, `unauthenticated`.
- **Expected:** `content-type: application/problem+json`, body has `type`, `title`, `status` equal to the HTTP status, `code`, `requestId`; `errors[].path` and `message` for validation and header errors; `existingStockId` only on `stock_exists`; no stack trace, SQL text or constraint name in any body; a forced unexpected error (RepoFault) is `500` with a generic body and the detail only in the log.
- **Mock needed:** LocalJWKS, DB, Fixtures, RepoFault. **Covers:** FR-002, FR-016, FR-017, NFR-004.

### TC-A-124
**OpenAPI spec describes all routes** | Level: API | P2 | EP
- **Input:** `GET /openapi.json`.
- **Expected:** the 16 routes (5 stocks, 7 lists, 4 imports) appear with request and response schemas; every one carries `bearerAuth`; multipart bodies declare the `file` part; error responses list the codes of design.md; `Stock` schema matches the design example (nullable single lenses, array defaults); no route is public except health and spec.
- **Mock needed:** DB. **Covers:** NFR-004, FR-001.

### TC-A-125
**Add and edit latency** | Level: API | P2 | BVA
- **Input:** 50 sequential `POST /stocks` and then 50 sequential `PATCH /stocks/{id}` against local Supabase, single user, full-lens bodies (S-NVDA shape).
- **Expected:** p95 of each series < 500 ms (assert the percentile, log min/median/max); runs after a warm-up of 5 calls; no 4xx/5xx.
- **Mock needed:** LocalJWKS, DB. **Covers:** NFR-001.

### TC-A-126
**Unicode and unsafe text through the API** | Level: API | P1 | EG
- **Input:** create stock + list + theme + chain with Thai text including combining marks `ก็ ก่ ก้`, ZWJ, astral `😀`, quotes and `<img src=x onerror=alert(1)>`; read back through `GET /stocks`, `GET /lists`; direct SQL read; a field containing `\u0000`.
- **Expected:** values are identical in code points and UTF-8 bytes in the response and in the database (no normalisation, no HTML escaping in JSON); `\u0000` → 400 `validation_failed`, never 500; response `content-type` declares `charset=utf-8`.
- **Mock needed:** LocalJWKS, DB. **Covers:** NFR-009, FR-001.

### Imports API

### TC-A-127
**CSV template content and round trip** | Level: API | P1 | EP
- **Input:** `GET /imports/template.csv`, then upload the response as the file to `POST /imports/preview`.
- **Expected:** 200, `content-type: text/csv; charset=utf-8`, `content-disposition: attachment; filename="investhesis-stocks-template.csv"`, first bytes `EF BB BF`; header row equals TC-U-128's 19 headers; exactly one example row per market (a US row and a TH row, both with valid enumerations, the TH row having `sector` and `gics_sector`); preview of the file gives 2 `new`, 0 errors, 0 warnings; the example tickers do not collide with each other.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-015, NFR-009.

### TC-A-128
**XLSX template content and round trip** | Level: API | P1 | EP
- **Input:** `GET /imports/template.xlsx`, parse it with exceljs, upload it to preview.
- **Expected:** 200, `content-type` is the OOXML spreadsheet type, attachment filename `investhesis-stocks-template.xlsx`; one worksheet; row 1 = 19 headers in order; two example rows (US, TH); Thai example text intact; preview gives 2 `new` and no errors; cells are plain strings (no formulas, no dates).
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-015.

### TC-A-129
**Preview of every fixture file** | Level: API | P1 | EP, BVA (table-driven over section 5.4)
- **Input:** `POST /imports/preview` for F-01..F-03, F-06..F-15, F-19..F-22, F-25, F-26 with the file named as in the table.
- **Expected:** status, `code` and counts exactly as the "Expected" column of 5.4; for F-13 (1,048,576 bytes) 200 and F-14 (+1 byte) 413; F-25 (`.CSV`, `.XLSX`) and F-26 (`legacy.xls`) as listed; no 5xx for any fixture.
- **Mock needed:** LocalJWKS, DB, Fixtures. **Covers:** FR-016, FR-017, FR-019, FR-020, NFR-009.

### TC-A-130
**CSV parsing edge cases and row numbers** | Level: API | P1 | EG
- **Input:** F-16 (quoted) and F-17 (CRLF, blank lines).
- **Expected:** F-16: names such as `Berkshire "B", Inc.` and a name with an embedded newline arrive byte-exact in the preview row; field count per row is 19 or fewer, no shifted columns. F-17: blank lines are skipped and not counted against the 1,000-row limit (see G-14); `rowNumber` is the file's row number with header = 1, counting records in the way pinned here (blank lines count as rows, so a row after one blank line gets `rowNumber` +1; records spanning several physical lines count once, see G-15); final newline or its absence changes nothing.
- **Mock needed:** LocalJWKS, DB, Fixtures. **Covers:** FR-016, FR-020, NFR-009.

### TC-A-131
**Header mapping details** | Level: API | P1 | EP, EG
- **Input rows:** F-21; headers in reverse order; `TICKER ,Market,EXCHANGE,NAME`; one unknown header and three unknown headers; only the 4 required; 3 of 4 (each missing in turn); a BOM before `ticker`; F-27 (`ticker` twice); an empty header cell; a header named `Ticker` and a stray column `ticker ` (with trailing space).
- **Expected:** order and case free, spaces ignored; warnings: one `Unknown column "x" ignored` per unknown header, none otherwise; missing required headers → 422 `file_missing_headers` with `errors[].path` listing **all** missing headers (single request names every one); BOM stripped; duplicate or empty header: defined result (error or "first wins" with a warning), never 500 (see G-8); required headers present and no data rows → `file_empty`.
- **Mock needed:** LocalJWKS, DB, Fixtures. **Covers:** FR-017.

### TC-A-132
**Per-row errors report every failed field** | Level: API | P1 | EP, DT
- **Input rows (one file):** invalid ticker + market `JP` + empty name; US `sector=Resources`; TH `sector=Resources` without `gics_sector`; unknown `size`; `style=Dividend ` valid padded; theme of 41 chars; exchange `SET` with market US; value chain position without chain; all 14 lens cells invalid in one row.
- **Expected:** each row `error` with **all** failing paths (`ticker`, `market`, `name` in the first; 14 paths in the last), each with a non-empty message; padded valid values do not error; `rowNumber` matches the physical record; `counts.error` equals the number of error rows; valid rows in the same file stay `new`.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-019, FR-020, FR-018.

### TC-A-133
**Duplicate rows inside the file** | Level: API | P1 | DT
- **Input:** F-20, plus a file where row 2 is a saved `AAPL` and row 3 is `AAPL` again.
- **Expected:** F-20: row 2 `NVDA US` new, row 3 `NVDA US` error path `ticker`, row 4 `nvda us` error, row 5 `NVDA TH` new (different market). Second file: row 2 `duplicate`, row 3 `error` (repeats an earlier row, FR-019). Counts add up to the data-row count.
- **Mock needed:** LocalJWKS, DB, SeedRepo, Fixtures. **Covers:** FR-019, FR-020.

### TC-A-134
**XLSX cell types** | Level: API | P2 | EG
- **Input:** F-23: ticker as a number cell (`700`), a boolean cell in `name`, a date cell in `name`, a formula cell with an error value (`#REF!`), a formula without cached value, a rich-text cell, leading/trailing spaces in a shared string, an empty-string cell.
- **Expected:** no 5xx; number cell → text `700`; boolean/date → their text form or a row error (pinned); error value and missing cached value → empty cell (FR "counts as empty"), which fails `required` for `name` as a row error; rich text → plain text; spaces trimmed; empty string → unset.
- **Mock needed:** LocalJWKS, DB, Fixtures. **Covers:** FR-016, FR-018.

### TC-A-135
**XLSX decompression and dimension abuse** | Level: API | P1 | EG
- **Input:** F-24 (small file that expands to > 2,000 rows) and F-31 (declares `A1:XFD1048576`, has 3 rows).
- **Expected:** F-24: 422 `file_too_many_rows`, decided right after load and before reading cells, within 3 s, API memory stays bounded (RSS growth under 200 MB asserted, process alive); F-31: 200 with 3 rows within 1 s (declared dimension not trusted); ZIP signature missing → 415 (F-10).
- **Mock needed:** LocalJWKS, DB, Fixtures. **Covers:** FR-016, NFR-002.

### TC-A-136
**Multipart quirks** | Level: API | P2 | EG
- **Input rows:** two `file` parts; a text field named `file`; JSON body with `content-type: application/json`; multipart with a 2 MB text field; filename `../../etc/passwd.csv` and F-28; filename with no extension; part order for confirm (file before options); extra unknown form fields; `Content-Length` larger than the body.
- **Expected:** second file part → 400/413 (limit `files: 1`, pinned); JSON body → 415 or 400 `file_missing`; big text field → 413 or 400 (field limits), never accepted; hostile filename never touches the disk (temp dir listing unchanged) and `fileName` in the response is the plain string; no-extension → 415; confirm with the file part before the options → 400 `validation_failed` (design says fields first) or accepted (pinned, no 500); unknown fields ignored; truncated body → 400, nothing written.
- **Mock needed:** LocalJWKS, DB, Fixtures. **Covers:** FR-016, NFR-005.

### TC-A-137
**Preview writes nothing and sends nothing** | Level: API | P1 | EG
- **Preconditions:** snapshot of row counts of the three tables and of the API process temp directory; NetBlock active; LogCapture.
- **Input:** `POST /imports/preview` with F-03 (Thai names), F-06 and F-19; and one failed preview (F-12).
- **Expected:** table counts equal before and after; temp directory listing unchanged; no outbound HTTP (NetBlock records zero attempts); captured logs contain the request id and status but none of the file's cell values (search for `ปตท.`, a ticker, a company name) and no file bytes; no preview data cached for a later request (a second call with no file → 400).
- **Mock needed:** LocalJWKS, DB, NetBlock, LogCapture, Fixtures. **Covers:** NFR-005, FR-020.

### TC-A-138
**Preview latency for 1,000 rows** | Level: API | P2 | BVA
- **Preconditions:** U has 300 saved stocks that F-06 repeats in part.
- **Input:** `POST /imports/preview` with F-06 (CSV) and the equivalent 1,000-row XLSX; 3 timed runs after one warm-up.
- **Expected:** each run < 3 s (median asserted, max logged); counts correct (700 new, 300 duplicate); no timeout of the multipart parser.
- **Mock needed:** LocalJWKS, DB, SeedRepo, Fixtures. **Covers:** NFR-002.

### TC-A-139
**Confirm stores canonical values with correct sources** | Level: API | P1 | EP
- **Input:** `POST /imports { duplicateMode: "skip", newListName: "Swing study" }` with F-29 (US and TH full-lens) and with F-18 (messy values).
- **Expected:** 200; stocks created with canonical spelling (`growth`→`Growth`, `MAI`→`mai`, `a;B ; c` → three tags/values); `currency` derived; every set lens `manual`; empty `economic_cycle` with a sector → default cycle with source `default`; `gics_sector` ignored for US; `sector` for TH stored as `setIndustryGroup` plus `gicsSector`; themes de-duplicated; `GET /stocks` shows them with `listIds` containing the new list; Thai strings byte-exact; response `targetList.name = "Swing study"`, counts add up.
- **Mock needed:** LocalJWKS, DB, Fixtures. **Covers:** FR-018, FR-022, FR-024, FR-004, FR-005, NFR-009.

### TC-A-140
**Update mode merge matrix** | Level: API | P1 | DT
- **Preconditions:** saved NVDA with style `Value/manual`, moat `Brand/manual`, themes `["AI","EV"]`, customers `["B2B"]`, gics IT, cycle `Sensitive/default`; saved AAPL with cycle `Cyclical/manual`, gics IT.
- **Input rows (update mode):** NVDA: `style=Growth`, `moat=` (empty), `themes=Cloud`, `customers=` (empty), `economic_cycle=Defensive`; a second import for NVDA with `sector=Utilities` and empty cycle; AAPL with `sector=Energy` and empty cycle; AAPL with `name=` empty.
- **Expected:** NVDA after first: style `Growth/manual`, moat `Brand` untouched, themes replaced by `["Cloud"]` (non-empty replaces the whole list, see G-4), customers untouched, cycle `Defensive/manual`, `updated = 1`; NVDA second: cycle stays `Defensive/manual` (manual not replaced), sector Utilities; AAPL: cycle stays `Cyclical/manual`; empty `name` does not blank the saved name; `market`, `ticker`, `currency` never change; `updatedAt` moves only for rows that changed.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-021, FR-024, FR-005, FR-004.

### TC-A-141
**Confirm option validation** | Level: API | P1 | DT (mode × target)
- **Input rows:** no `duplicateMode`; `duplicateMode=merge`; `Skip`; both `targetListId` and `newListName`; neither; `newListName=""`, `"   "`, 61 chars, 60 chars; `targetListId=not-uuid`; random uuid; no file part; options only.
- **Expected:** every invalid row 400 `validation_failed` (or 404 for the random list uuid, 400 `file_missing` for no file) with the offending field in `errors[].path`; 60-char new list name → 200; after every failing row table counts of stocks, lists and memberships are unchanged.
- **Mock needed:** LocalJWKS, DB, Fixtures. **Covers:** FR-021, FR-022.

### TC-A-142
**Atomic confirm under injected failures** | Level: API | P1 | ST
- **Preconditions:** U has 10 saved stocks, list `Watching`, and 3 memberships; snapshot of all three tables; F-06 (1,000 rows) and `newListName: "Fresh"`.
- **Input:** `POST /imports` three times with RepoFault throwing (a) after 500 inserted stocks, (b) in the update loop (mode `update`, 5 duplicates), (c) at the membership insert; then a normal run.
- **Expected:** for (a), (b), (c) a 500 problem+json with no detail leak; the three tables are **identical** to the snapshot (no stocks, no `Fresh` list, no memberships, no `updatedAt` changes on updated rows); the normal run afterwards succeeds from a clean state and the list `Fresh` exists once.
- **Mock needed:** LocalJWKS, DB, RepoFault, Fixtures. **Covers:** FR-022, NFR-006.

### TC-A-143
**Late conflicts and the counting invariant** | Level: API | P1 | EG, EP
- **Input:** extend TC-U-063 for both modes: after the preview NVDA is saved by hand (and AAPL is deleted by hand); then confirm with `update` and again with `skip` on a fresh setup; also a property check over F-18, F-19, F-20 and F-30 in both modes.
- **Expected:** `update` turns the late NVDA into `updated 1`; `skip` into `skipped 1`; no 409, no second row; a row whose saved stock vanished between preview and confirm is simply `created`; in every run `created + updated + skipped + failed` equals the data-row count of the file and `addedToList` equals the number of new and duplicate rows not already in the list.
- **Mock needed:** LocalJWKS, DB, Fixtures. **Covers:** FR-022, FR-023.

### TC-A-144
**File-level errors on confirm write nothing** | Level: API | P1 | EP
- **Input:** `POST /imports` with F-07, F-08, F-09, F-10, F-11, F-12, F-22 and no file, each with `newListName: "Temp"`.
- **Expected:** the same status and code as the preview column of 5.4 (413, 422, 415, 422 `file_missing_headers`, 400); no list `Temp` created, no stock saved; `nothing_to_import` (F-19) is also a 422 with no list created.
- **Mock needed:** LocalJWKS, DB, Fixtures. **Covers:** FR-016, FR-017, FR-022, NFR-006.

### TC-A-145
**errorRows carry the original cells** | Level: API | P1 | EP
- **Input:** confirm F-03 extended with two invalid rows (one with Thai text, one with a comma-quoted name).
- **Expected:** `failed = 2`; `errorRows[i].rowNumber` equals the file row; `cells` holds the original cell strings keyed by template header (original spelling of values, not canonicalised, Thai exact); `errors` lists every failing path; valid rows are not in `errorRows`; no more than the cells present in the file are echoed (unknown columns omitted).
- **Mock needed:** LocalJWKS, DB, Fixtures. **Covers:** FR-023, NFR-009.

### TC-A-146
**Confirm latency for 1,000 rows** | Level: API | P2 | BVA
- **Preconditions:** F-30 (700 new, 300 duplicates of seeded stocks); modes `skip` and `update`.
- **Input:** `POST /imports` timed, 3 runs each on a fresh user.
- **Expected:** each run < 5 s (median asserted); `created 700`; `skipped 300` or `updated 300`; `addedToList 1000`.
- **Mock needed:** LocalJWKS, DB, Fixtures. **Covers:** NFR-002.

### TC-A-147
**Replaying the same confirm is safe** | Level: API | P2 | EG
- **Input:** confirm F-02 with `skip` into `newListName: "Once"`; the identical request again; again with `targetListId` of `Once`.
- **Expected:** first 200 `created 3`; second `409 list_name_taken` and nothing changed; third 200 with `created 0`, `skipped 3`, `addedToList 0`; the list holds each stock exactly once.
- **Mock needed:** LocalJWKS, DB, Fixtures. **Covers:** FR-021, FR-022, FR-012.

### TC-A-148
**Client abort during confirm leaves all or nothing** | Level: API | P3 | EG
- **Input:** start `POST /imports` for F-06 over a real socket and destroy the connection after 50 ms; wait 5 s; then query the database.
- **Expected:** either the whole import is stored (1,000 stocks, the list, all memberships) or none of it; never a partial set; API still answers `/health` and a new confirm of the same file then reports a consistent state (`created 0, skipped 1000` or `created 1000`).
- **Mock needed:** LocalJWKS, DB, Fixtures. **Covers:** NFR-006, FR-022.

---

## 9. Web component and static cases (TC-C)

Shared setup: Testing Library with `createRoutes(FakeAuth)` (signed in) or the component alone,
StubApi answering the contracts in design.md, `vi.mock('sonner')`, matchMedia stub from `test/setup.ts`.
Queries use roles and labels, so each assertion also proves an accessible name.

### Foundation

### TC-C-101
**New routes, breadcrumbs and titles** | Level: Component | P1 | EP
- **Input rows:** `/stocks`, `/stocks/new`, `/stocks/s1` (loader gives NVDA), `/stocks/s1/edit`, `/lists`, `/lists/l1` (loader gives `Core holdings`), `/import-export`, `/nope`.
- **Expected:** breadcrumb `Stocks`, `Stocks › New`, `Stocks › NVDA`, `Stocks › NVDA › Edit`, `Lists`, `Lists › Core holdings`, `Import / export`, not-found page; `document.title` = `<Title> · Investhesis`; the `h1` receives focus after navigation; each view is a separate lazy chunk (the route exports `Component`).
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-008, FR-013, NFR-008.

### TC-C-102
**api-client multipart and retry** | Level: Component | P1 | ST, EG
- **Input:** `api.postForm('/imports', formData)` with a `File`; `fetch` first returns 401, `refresh()` yields token T2, then 200; separate run where the second answer is also 401.
- **Expected:** no manual `content-type` header (the browser sets the boundary); URL `/api/imports`; first call has the bearer token; the retry sends the **same** `FormData` with `Authorization: Bearer T2` and the file still readable (not a consumed stream); after a second 401 the User Auth sign-out path runs; a `409` problem becomes `ApiError` with `code`, not a retry.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-022 (confirm resilience), NFR-004.

### TC-C-103
**Navigation active states** | Level: Component | P3 | EP
- **Input:** navigate to `/stocks/new`, `/stocks/s1/edit`, `/lists/l1`, `/import-export`.
- **Expected:** in the main navigation, `Stocks` is current on the first two, `Lists` on the third, `Import / export` on the last; tapping a nav item on a phone closes the sheet (existing behaviour kept).
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-008, FR-013.

### Stocks table

### TC-C-110
**Table structure, caption and aria-sort** | Level: Component | P1 | EP
- **Input:** `/stocks` with 3 stocks; click `Sort by Name`, `Sort by Market`, `Sort by Sector`.
- **Expected:** columns Ticker, Name, Market, Exchange, Sector, Size, Style, Lists in that order; only Ticker, Name, Market, Sector headers have a sort button named `Sort by <Column>` and `aria-sort`; exactly one header has `ascending` or `descending`, others `none`; the sr-only caption reads `Saved stocks, sorted by Name ascending` (and updates); native table roles; Market cell is an outline badge, ticker is `font-medium tabular-nums`.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-008, NFR-008.

### TC-C-111
**Lists column badges** | Level: Component | P2 | BVA
- **Input:** stocks in 0, 1, 2, 3 and 5 lists; one list named 80 characters long; Thai list name.
- **Expected:** 0 lists → a dash with sr-only `no lists`; up to 2 badges then `+N` (`+1`, `+3`); long name truncated by CSS but available in full (`title` or accessible name); Thai name exact.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-008, NFR-009.

### TC-C-112
**Row navigation by mouse and keyboard** | Level: Component | P1 | EP
- **Input:** click a row; focus and press Enter on the ticker link; Tab order from the page start.
- **Expected:** both go to `/stocks/:id`; the ticker is a real link with the right `href`; the focus order is Import → Add stock → sort buttons → each row's ticker link (no other tab stops in rows); the row `onClick` does not fire when clicking the link twice (one navigation).
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-008, NFR-008.

### TC-C-113
**Header, count text, loading and error states** | Level: Component | P2 | EP
- **Input:** 35 stocks; 1 stock; 0 stocks (TC-U-081 covers the empty card); loader pending; loader rejects with 500.
- **Expected:** `35 stocks`, `1 stock`; skeleton rows ×5 while pending; 500 shows `RouteError` with a retry or link, not a blank page; header actions `Import` and `Add stock` have correct `href`s and are full-width below `sm`.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-008.

### TC-C-114
**Render and re-sort 200 stocks** | Level: Component | P2 | BVA
- **Input:** 200 generated stocks (mixed markets, Thai names, 0..4 lists each); render, then click `Sort by Name` twice.
- **Expected:** after data is loaded, initial render and each re-sort take < 200 ms by `performance.now()` around `act` (median of 5 runs, jsdom budget with a documented factor; the real-browser check is TC-E-126); all 200 rows present.
- **Mock needed:** FakeAuth, StubApi. **Covers:** NFR-003.

### Stock detail

### TC-C-120
**Identity line and classification list** | Level: Component | P1 | EP
- **Input:** S-NVDA, S-PTTEP, S-MSFT (no lenses).
- **Expected:** identity `US · NASDAQ · USD · S&P 500, Nasdaq-100`; TH: `TH · SET · THB · SET50`; description list shows all lenses (Sector with SET group for TH, Value chain with position, Business model customers and revenue types, Themes as tags, Volatility); each unset one shows `—` with sr-only `not set`; MSFT shows `—` everywhere and no badge; terms/definitions are real `dt`/`dd`.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-003, FR-008, NFR-008.

### TC-C-121
**Delete stock dialog behaviours** | Level: Component | P1 | ST, EG
- **Input:** stock in 2 lists, in 1 list, in 0 lists; open More → Delete; press Esc; reopen and Cancel; confirm with DELETE 204; confirm with DELETE 500; double-click Confirm.
- **Expected:** text `Delete NVDA? It will be removed from 2 lists. This can't be undone.` (`1 list`; for 0 lists a sentence without the list part, see G-17); focus starts on Cancel; Esc and Cancel close with no request and return focus to the More button; confirm calls `DELETE /stocks/{id}` once even on double click, then navigates to `/stocks` with a toast; on 500 the dialog shows an alert (or toast), the stock stays, the button is usable again; confirm button is `variant="destructive"` with a loading state.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-007, NFR-008.

### TC-C-122
**Add to list popover edge states** | Level: Component | P2 | EP, EG
- **Input:** stock in every list; no lists exist; filter text with no match; choose a list while POST answers 409 `already_in_list` (stale page); POST answers 404; choose by keyboard (arrow, Enter); Esc.
- **Expected:** `In every list` and, with no lists at all, a message linking to `/lists`; `CommandEmpty` text for no match; a 409 refreshes the list and shows a message (no crash); 404 shows an error message; keyboard selection calls the same POST; Esc closes and focus returns to the trigger.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-012, NFR-008.

### TC-C-123
**Remove from list and Undo failure paths** | Level: Component | P2 | EG
- **Input:** remove from `Core holdings` (DELETE 204) then Undo (POST 201); Undo where POST answers 409 (re-added elsewhere) and 500; remove where DELETE answers 404 (already removed).
- **Expected:** buttons are named `Remove from Core holdings`; Undo success shows the list again; 409 on undo is treated as success (stock is in the list); 500 shows an error toast and the list stays removed; DELETE 404 refreshes without a crash; no more than one request per click.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-012.

### TC-C-124
**Default badge explanation** | Level: Component | P3 | EP
- **Input:** stock with `lensSources.economicCycle = "default"`; hover and keyboard-focus the badge.
- **Expected:** tooltip `Set from the sector. Pick a value to override.`; the badge is reachable by keyboard or the explanation is in its accessible description; no badge on manual lenses.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-004, NFR-008.

### Stock form

### TC-C-130
**Every control has a label; required fields are marked** | Level: Component | P1 | EP
- **Input:** render `/stocks/new` and `/stocks/s1/edit`; query every control by label.
- **Expected:** Market (radiogroup in fieldset+legend), Ticker, Exchange, Company name, each index checkbox, Sector, SET industry group (TH), Economic cycle, Size, Style, Volatility, Lynch type, Life cycle, Moat, Value chain, Position, each customer and revenue checkbox, `Add theme`, each list checkbox are found by accessible name; Market, Ticker, Exchange and Name have `aria-required` and a visible `*` with sr-only `required`; no unlabeled `input`, `select` or `button` (axe-lite assertion over the form).
- **Mock needed:** FakeAuth, StubApi. **Covers:** NFR-008, FR-001, FR-003.

### TC-C-131
**Ticker input behaviour** | Level: Component | P1 | BVA, EG
- **Input:** type `brk.b`, ` pt tep `, 13 characters, `ＡＡＰＬ`, paste `aapl\n`.
- **Expected:** field shows upper case as typed (`BRK.B`); `maxLength` 12 stops typing at 12; submit sends the normalised value (`BRK.B`, `PTTEP`); full-width or space-containing value shows the ticker field error and blocks submit; a pasted trailing newline does not submit the form.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-001.

### TC-C-132
**Market switching: sector and SET group rules** | Level: Component | P1 | DT, ST
- **Input:** (a) TH: choose SET group `Resources` and leave GICS empty, Save; (b) choose GICS `Energy` too, Save; (c) US with sector IT chosen, switch to TH; (d) TH with group and GICS set, switch to US; (e) edit mode on a TH stock.
- **Expected:** (a) client error on the GICS field (and a hint that both are required) and no request; (b) body has `setIndustryGroup` and `gicsSector`; (c) the GICS value is kept, SET group appears empty, exchange and index reset (TC-U-090); (d) SET group hidden and cleared, not sent; (e) SET group shown and editable.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-001, FR-003, FR-005.

### TC-C-133
**Position and value chain interplay** | Level: Component | P2 | DT
- **Input:** open Position with an empty chain; choose `None`; type a chain name; select `Upstream`; clear the chain name; submit with chain 60 and 61 chars.
- **Expected:** with an empty chain every option except `None` is disabled (or the control is disabled and `None` is the only choice, per ux); typing a name enables all; clearing the name after `Upstream` leaves the form valid by resetting the position to `Not set` or by showing a field error on Value chain (pinned, see G-10), never submitting an invalid pair; 61 characters is stopped by `maxLength` 60.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-003.

### TC-C-134
**"Not set" maps to null and never leaks as a value** | Level: Component | P1 | EG
- **Input:** every `Select` set to a value then back to `Not set` in create and in edit; submit.
- **Expected:** body never contains `__none__` or `""`; on create the key is omitted or `null`; on edit it is `null` for fields that had a value and absent otherwise (TC-U-095); `Not set` text is styled muted and is announced as `Not set`.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-003, FR-006.

### TC-C-135
**Economic cycle returns to the default after "Not set"** | Level: Component | P1 | ST
- **Input:** choose sector `Energy` (cycle shows `Sensitive` + Default badge); choose `Cyclical` (badge gone); choose `Not set`; change sector to `Utilities`.
- **Expected:** after `Not set` the select again shows the sector default with the badge (`Sensitive`); after the sector change it shows `Defensive` with the badge; with no sector the select shows `Not set` and no badge; a submit with the default displayed sends no `economicCycle` (the server defaults it) and one with `Cyclical` sends `Cyclical`.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-005, FR-004.

### TC-C-136
**TagInput limits, IME and Enter** | Level: Component | P1 | BVA, EG
- **Input:** add 20 tags then try a 21st; type a 41-character tag; add `Energy security` (inner space); Enter with the empty input; press Enter inside the input while the form is otherwise valid; compose Thai text with `isComposing = true` and press Enter mid-composition; Backspace on tag removal; click a tag's remove button.
- **Expected:** at 20 tags the input is disabled and shows `20 themes max`; a 41-char tag is rejected with a message (or truncated by `maxLength`, pinned) and not added; the inner-space tag is added; empty Enter adds nothing; Enter in the tag input never submits the form; Enter during IME composition does not add a half-composed tag, the committed text is added by the next Enter; remove buttons are named `Remove theme AI`; the list is a `ul` named `Themes`.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-003, NFR-008, NFR-009.

### TC-C-137
**Lists card on the add form** | Level: Component | P2 | EP
- **Input:** 0 lists; 3 lists (tick 2); submit.
- **Expected:** with 0 lists the text `No lists yet — you can create one on the Lists page` with a link; with lists, checkboxes named by list name; the POST body has `listIds` of exactly the ticked lists (order irrelevant), `[]` or omitted when none; Thai list name shown exactly.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-014.

### TC-C-138
**Submit lifecycle** | Level: Component | P1 | ST, EG
- **Input:** valid form; click Save twice quickly; API 201; API 500; API network failure; API 400 with two paths; slow response.
- **Expected:** while pending the Save button shows a spinner and `Saving…`, is disabled and exactly one POST is sent; on 201 toast `NVDA added` and navigation to `/stocks/{id}` from the response id; on 500 and network failure the form alert (`role="alert"`) shows a readable message, values stay, Save is usable again and focus moves to the alert; on 400 each message is next to its field.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-001, NFR-008.

### TC-C-139
**Focus and error association** | Level: Component | P1 | EP
- **Input:** submit an empty form; submit with a server error on `valueChain`; submit with 409.
- **Expected:** focus moves to the first invalid field in DOM order (Market radio first); each invalid control has `aria-invalid="true"` and `aria-describedby` pointing at its `FieldError` text; errors appear inside a live region or have `role="alert"` so a screen reader announces them; 409 focuses the form alert whose link reaches `/stocks/{existingStockId}`; after the user fixes a field its error and `aria-invalid` clear.
- **Mock needed:** FakeAuth, StubApi. **Covers:** NFR-008, FR-002.

### TC-C-140
**Edit mode specifics** | Level: Component | P1 | EP
- **Input:** `/stocks/s1/edit` for S-NVDA.
- **Expected:** title `Edit NVDA`; Market and Ticker are plain text (no textbox or radio named Ticker/Market) with the hint `To change market or ticker, delete this stock and add it again.`; no Lists card; every lens prefilled including multi-values and tags; cycle shows the stored value with a Default badge only when its source is `default`; Save with no change sends no PATCH or an empty one (pinned, see G-12) and leaves the page usable; Save success → toast `NVDA updated`, navigate to `/stocks/s1`.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-006, FR-004.

### TC-C-141
**Edit failure paths** | Level: Component | P2 | EG
- **Input:** loader 404 for `/stocks/x/edit`; PATCH 404 (deleted meanwhile); PATCH 400 `exchange`; PATCH 500.
- **Expected:** `RouteError` with a link to `/stocks`; 404 on save shows an alert with a link to `/stocks`; 400 appears at the exchange field; 500 alert; the form never loses typed values.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-006, FR-025.

### Lists pages

### TC-C-150
**Lists table** | Level: Component | P1 | EP
- **Input:** lists `Watching` (11), `Core holdings` (22), `หุ้นหลัก` (0); 0 lists (empty state); 1 list.
- **Expected:** rows ordered by name with counts right aligned (`tabular-nums`); name is a link to `/lists/:id`; row menu button named `Actions for Core holdings` offering `Rename…` and `Delete…` and operable by keyboard; empty state `No lists yet` with `New list`; header count text; Thai name exact.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-013, FR-009, NFR-009.

### TC-C-151
**Create list dialog** | Level: Component | P1 | BVA, ST
- **Input:** open; submit empty; type 61 chars; type 60; Enter to submit; Esc; slow response; double Enter.
- **Expected:** dialog `aria-labelledby` its title and the name field is focused; empty or blank name shows a field error and no request; 61 chars shows an error (or `maxLength` blocks input); Enter submits; one POST even on double Enter; spinner and disabled button while pending; Esc closes with no request and focus returns to `New list`; success toast `List created` (copy pinned), dialog closes.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-009, NFR-008.

### TC-C-152
**Rename list dialog** | Level: Component | P1 | EP
- **Input:** open `Rename…` on `Core holdings`; submit unchanged; change to `Core`; clash 409; 404 (deleted meanwhile).
- **Expected:** prefilled with the current name; unchanged submit closes without error or a request; PATCH `{ name: "Core" }` and toast `List renamed`; 409 → field error `A list with this name already exists.` and dialog stays open with focus on Name; 404 → error message and list refresh.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-010.

### TC-C-153
**Delete list dialog wording and failures** | Level: Component | P2 | BVA, EG
- **Input:** lists with 22, 1 and 0 stocks; confirm with 204, 404, 500; Esc.
- **Expected:** `Delete Core holdings? Its 22 stocks stay saved.`; `Its 1 stock stays saved.`; 0-stock wording defined (see G-17); focus starts on Cancel; Esc returns focus to the row menu button; 204 removes the row (and, from the detail page, navigates to `/lists`); 404 refreshes; 500 shows an error and keeps the dialog usable; the confirm button is destructive.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-011, NFR-008.

### TC-C-154
**List detail page** | Level: Component | P1 | EP
- **Input:** list with 22 stocks, with 1, with 0; unknown id.
- **Expected:** `h1` is the list name, text `22 stocks` / `1 stock`; the same stock table component without the Lists column and with a trailing remove button per row (named `Remove <ticker> from <list>`); header actions Add stock, Rename, Delete (Rename and Delete move into a `⋯` menu below `sm`); unknown id → `RouteError` with a link to `/lists`; breadcrumb shows the list name.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-013, FR-012.

### TC-C-155
**Add-stock picker details** | Level: Component | P2 | EP, EG
- **Input:** type `apple` (name), `ปตท` (Thai), `pt`; all saved stocks already in the list; no saved stocks at all; POST 409 (stale); choose by keyboard.
- **Expected:** search matches ticker and company name, case-insensitive, Thai substring works; messages `All saved stocks are in this list` and, with no stocks at all, a message linking to `/stocks/new`; 409 refreshes the table without a crash; ↑/↓, Enter and Esc work; each option shows ticker, name and market.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-012, NFR-008, NFR-009.

### TC-C-156
**Remove with Undo from the list page** | Level: Component | P2 | ST
- **Input:** click remove on a row; Undo; second run: ignore the toast.
- **Expected:** DELETE then, on Undo, POST with the same stock id; row returns after revalidation; the count text updates each time (`22 → 21 → 22 stocks`); ignoring the toast leaves it removed.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-012, FR-013.

### Import wizard

### TC-C-160
**Wizard structure, step headings and live regions** | Level: Component | P1 | ST
- **Input:** go through steps 1 → 2 → 3 with StubApi; go back with `Choose another`, `Cancel`, `Import another`.
- **Expected:** the step indicator is an `ol` and the current item has `aria-current="step"`; each step change moves focus to that step's `h2` (`tabIndex=-1`); `Checking file…` and `Importing…` appear in an `aria-live="polite"` region; returning to step 1 drops the file (file input empty, no preview data in the DOM); the Export card still shows `Coming later`.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-020, NFR-008.

### TC-C-161
**Template links** | Level: Component | P1 | EP
- **Input:** render step 1.
- **Expected:** two links `CSV template` and `Excel template` with `href` `/api/imports/template.csv` and `/api/imports/template.xlsx` and the `download` attribute; both keyboard focusable. (Whether a plain link can authenticate in `supabase` mode is the subject of G-2 and TC-E-115.)
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-015.

### TC-C-162
**File-level error alerts** | Level: Component | P1 | EP (one per code)
- **Input:** preview rejects with 413, 415, 422 `file_too_many_rows`, 422 `file_empty`, 422 `file_missing_headers` (`ticker`, `name`), 400 `file_missing`, network failure, 500; then choose a valid file.
- **Expected:** TC-U-135 messages appear in an `Alert variant="destructive"` with `role="alert"`; the wizard stays on step 1 and the drop zone remains usable; choosing the same file again re-triggers the request (input value reset); a following valid file clears the alert and moves to step 2.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-016, FR-017, NFR-008.

### TC-C-163
**File input and drag and drop** | Level: Component | P2 | EG
- **Input:** choose a `.csv` through the input; drop a `.xlsx`; drag over then leave; drop text (no file); drop two files; file named F-28's hostile name; focus the input with the keyboard.
- **Expected:** both paths POST `file` once to `/imports/preview`; drag-over adds the highlighted style and leaving removes it; a non-file drop is ignored; two files use the first or show a message (pinned); the hostile file name is rendered as text (no HTML injection: `<img>` count is 0); the input is a labelled control (`Choose file`) with `accept=".csv,.xlsx"` reachable by Tab.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-016, NFR-008.

### TC-C-164
**Review header and starting over** | Level: Component | P2 | EP
- **Input:** preview of `holdings.xlsx` with counts 31/3/1; click `Choose another`.
- **Expected:** header `holdings.xlsx · 35 rows` (rows = new + duplicate + error); `Choose another` returns to step 1 without a request; the long file name wraps without overflow; Thai file name exact.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-020.

### TC-C-165
**Status filter and caption** | Level: Component | P1 | EP
- **Input:** preview rows of all three statuses; choose each filter radio by keyboard (arrow keys); filter with no matches (no duplicates).
- **Expected:** All shows all rows; New, Duplicates, Errors show only that status; the caption reads `Rows in holdings.xlsx, showing <filter>`; `Duplicates` with count 0 shows a clear empty message instead of an empty table; the radios form a labelled group; badges show `31 new`, `3 duplicate`, `1 error`.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-020, NFR-008.

### TC-C-166
**Row rendering and error details** | Level: Component | P1 | EP
- **Input:** rows: new, duplicate, error with 3 failed paths and a very long message; Thai names.
- **Expected:** status is icon **and** text (`New`, `Duplicate`, `Error`), never colour alone; error details list every failed field as `field: message`, all visible, long text wraps; duplicate row shows `Already saved`; row number is the file row number; error rows carry the tint class while keeping text readable; the status badge text has an accessible name.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-019, FR-020, NFR-008.

### TC-C-167
**Header warnings** | Level: Component | P3 | EP
- **Input:** `headerWarnings` of 0, 1 and 3 entries.
- **Expected:** no alert for 0; otherwise an `Alert` (default variant) listing each warning text exactly (`Unknown column "notes" ignored`); the alert is not `role="alert"` (it is not an error) and does not block import.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-017, FR-020.

### TC-C-168
**Target list selection** | Level: Component | P1 | DT
- **Input:** lists loaded; choose an existing list; choose `New list…` and type empty / `Swing study` / 61 chars / a name that exists; open with `?listId=` of an existing list, an unknown id, and without it.
- **Expected:** the select offers lists, a separator and `New list…`; choosing `New list…` shows the name input; confirm stays disabled with no list or an empty new name; 61-char name shows a field error (or `maxLength`); `?listId=` pre-selects that list (TC-U-116), an unknown id leaves nothing selected without error; the select is labelled `Add to list` and marked required.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-021, FR-009, NFR-008.

### TC-C-169
**Duplicates option group** | Level: Component | P1 | DT
- **Input:** duplicate counts 0 and 3; choose `Update`; leave default.
- **Expected:** group absent at 0; at 3 `Skip` is selected by default and `Update` chooses overwrite; each option has its description (`Keep saved stocks as they are` / `Overwrite with this file's non-empty values`); the chosen value is sent as `duplicateMode`; the group is a labelled radiogroup.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-021, NFR-008.

### TC-C-170
**Confirm request composition and button state** | Level: Component | P1 | EG
- **Input:** counts new 31 / duplicate 3 / error 1; choose existing list; Import; also counts new 1 / duplicate 0; double-click Import.
- **Expected:** label `Import 34 stocks` (`Import 1 stock`); one POST to `/imports` as `FormData` whose first keys are `duplicateMode` and exactly one of `targetListId` or `newListName`, **before** the `file` key, and `file` is the very same `File` object chosen in step 1; while pending the button shows `Importing…` and is disabled, so a double click sends one request; no other fields are sent.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-021, FR-022, NFR-008.

### TC-C-171
**Confirm failures keep the user on step 2** | Level: Component | P1 | EG
- **Input:** confirm answers 404 (list deleted), 413, 422 `nothing_to_import`, 500, network failure, then success on retry.
- **Expected:** each failure shows an `Alert` on step 2 (404 mentions the list is gone and refreshes the list select), the file and choices are kept, the button works again and a retry succeeds and moves to step 3; no summary is shown after a failure.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-022, NFR-006.

### TC-C-172
**Summary step** | Level: Component | P1 | EP
- **Input:** summary with failed 0 and failed 1; target list `Core holdings`; `Import another`.
- **Expected:** `role="status"` alert; text `31 created · 3 skipped · 0 updated · 1 failed`; `Open Core holdings` links to `/lists/{id}`; the download button exists only when `failed > 0`; `Import another` returns to a clean step 1.
- **Mock needed:** FakeAuth, StubApi. **Covers:** FR-023.

### Cross-cutting

### TC-C-180
**Contrast rule: muted text never on bg-muted** | Level: Static | P2 | EP
- **Input:** scan `apps/web/src` JSX/TSX class strings of the new features and pages.
- **Expected:** no element combines `text-muted-foreground` with `bg-muted` (or a descendant of a `bg-muted` element with that text class); table headers use `bg-background`; the test lists offenders by file and line; allowed hover tint `hover:bg-muted/50` on rows keeps foreground text only.
- **Mock needed:** none. **Covers:** NFR-008.

### TC-C-181
**Thai text renders unchanged in table, detail and preview** | Level: Component | P2 | EG
- **Input:** S-PTTEP with name `บมจ. ปตท. สำรวจและผลิตปิโตรเลียม`, theme `พลังงาน`, list `หุ้นหลัก`; preview row with the same name.
- **Expected:** `textContent` equals the input in every place (no normalisation, truncation by characters inside a cluster, or `?`/replacement characters); long Thai text wraps inside its cell; the form fields echo it in edit mode and submit it unchanged.
- **Mock needed:** FakeAuth, StubApi. **Covers:** NFR-009.

---

## 10. End-to-end cases (TC-E)

Shared setup: Playwright (Chromium), web and API in `supabase` mode through `scripts/e2e-servers.mjs`,
local Supabase running, a fresh confirmed `@example.test` user per test created through AdminAPI and
signed in (storage state), data seeded through SeedAPI where the case is not about creating it.
Mock-mode cases say so.

### Stocks

### TC-E-101
**Add a US stock with lenses into a list** | Level: E2E | P1 | UC (UC-001)
- **Preconditions:** user with list `Core holdings`.
- **Input:** `/stocks` → `Add stock`; market US, ticker `nvda` (shows `NVDA`), exchange NASDAQ, name `NVIDIA Corporation`, indexes S&P 500 and Nasdaq-100, sector Information Technology, style Growth, size Mega, themes `AI` and `Data center`, tick `Core holdings`; Save.
- **Expected:** toast `NVDA added`; `/stocks/{id}` shows identity line `US · NASDAQ · USD · S&P 500, Nasdaq-100`, economic cycle `Sensitive` with a `Default` badge, the lenses and the list; `/stocks` lists NVDA with `Core holdings`; reload keeps everything.
- **Mock needed:** AdminAPI. **Covers:** FR-001, FR-003, FR-004, FR-005, FR-008, FR-014.

### TC-E-102
**Add a TH stock with Thai text** | Level: E2E | P1 | UC, EP
- **Input:** market TH, ticker `pttep`, exchange SET, name `บมจ. ปตท. สำรวจและผลิตปิโตรเลียม`, index SET50, SET group Resources, GICS Energy, theme `พลังงาน`; Save; then `GET /api/stocks`.
- **Expected:** currency text `THB` on the form and `THB` on the detail page; table sector cell shows `Energy` and `Resources` on a second line; Thai name identical on the detail page, table and in the API JSON (same code points); exchange options offered were only SET and mai before saving.
- **Mock needed:** AdminAPI. **Covers:** FR-001, FR-003, FR-008, NFR-009.

### TC-E-103
**Duplicate stock and same ticker in the other market** | Level: E2E | P1 | EP
- **Preconditions:** user has US/AAPL.
- **Input:** add `aapl` US again; follow the alert link; add `AAPL`... as TH SET; add `TRUE` US then `TRUE` TH.
- **Expected:** alert `AAPL (US) is already saved.` with focus on it and an `Open AAPL` link to the existing stock; nothing new in `/stocks`; the TH `AAPL` and both `TRUE` stocks are created; the table shows two separate `TRUE` rows with markets US and TH.
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** FR-002, FR-001.

### TC-E-104
**Edit a stock; default and manual cycle** | Level: E2E | P1 | UC (UC-002), ST
- **Preconditions:** NVDA from TC-E-101.
- **Input:** `/stocks/:id` → Edit; confirm Market and Ticker are text; change sector to Utilities (cycle becomes Defensive with badge); Save; edit again, set cycle `Cyclical` (no badge), Save; edit again, change sector to Energy, Save; clear Moat.
- **Expected:** after step 1 the detail page shows `Defensive` + `Default`; after step 2 `Cyclical` without the badge; after step 3 the cycle is still `Cyclical` (manual survives); cleared moat shows `—`; toast `NVDA updated` each time; `/api/stocks/{id}` `lensSources` agrees; the Lists card is absent on the edit page.
- **Mock needed:** AdminAPI. **Covers:** FR-004, FR-005, FR-006.

### TC-E-105
**Delete a stock after confirmation** | Level: E2E | P1 | UC, ST
- **Preconditions:** NVDA in 2 lists.
- **Input:** More → Delete → Cancel; Delete again → Esc; Delete → Confirm.
- **Expected:** Cancel and Esc leave the stock and return focus to the More button; the dialog text names the 2 lists; Confirm lands on `/stocks` with a toast, NVDA gone; both list counts on `/lists` are one lower; `/stocks/{id}` now shows the not-found page.
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** FR-007, FR-013.

### TC-E-106
**Manage lists end to end** | Level: E2E | P1 | UC (UC-003), ST
- **Input:** `/lists` empty state → New list `Core holdings`; New list `core HOLDINGS`; Rename to `Core`; open it → Add stock (picker) AAPL and MSFT; remove MSFT then Undo; Delete the list.
- **Expected:** duplicate-name dialog error `A list with this name already exists.` with the dialog still open; the table shows `Core` with counts 0 → 2 → 2 after undo; stocks survive list deletion and `/stocks` still shows both with no list badge; delete dialog text `Delete Core? Its 2 stocks stay saved.`
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** FR-009, FR-010, FR-011, FR-012, FR-013.

### TC-E-107
**Same stock in several lists from the stock page** | Level: E2E | P2 | EP
- **Input:** on `/stocks/:id` use `Add to list` for `Core holdings` and `Watching`; try the popover again; remove one via `[×]`; open `/lists`.
- **Expected:** both lists appear in the card, the popover afterwards says `In every list` (or offers only the third list); counts on `/lists` and badges on `/stocks` agree after each step; removing shows an Undo toast and works.
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** FR-012, FR-013, FR-008.

### TC-E-108
**Browse: sorting, list view and empty states** | Level: E2E | P1 | UC (UC-004)
- **Preconditions:** 8 stocks (US and TH, Thai names, some without sector); one list with 3 of them.
- **Input:** new empty user opens `/stocks` and `/lists`; seeded user sorts by Ticker, Name, Market, Sector (asc and desc); opens the list from `/lists`.
- **Expected:** empty states link to `/stocks/new`, `/import-export` and `New list`; `aria-sort` and visible arrow follow each click; unsorted-by-sector stocks sort last; list page shows exactly its 3 stocks with no Lists column; counts match.
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** FR-008, FR-013.

### Import

### TC-E-109
**Import a CSV from the downloaded template into a new list** | Level: E2E | P1 | UC (UC-005)
- **Input:** download the CSV template from the page; edit it (keep the header, add 4 rows: US, TH with Thai name, one `Growth`/`growth` casing, one with `;` themes); choose it; review; `New list…` `Swing study`; Import; open the list.
- **Expected:** step 2 shows `4 new` (the two example rows were removed), no errors; confirm button `Import 4 stocks`; summary `4 created · 0 skipped · 0 updated · 0 failed` with `Open Swing study`; the list page shows the 4 stocks; canonical values (`Growth`) and the Thai name are exact; cycle defaults show the `Default` badge when a sector was given.
- **Mock needed:** AdminAPI. **Covers:** FR-015, FR-016, FR-018, FR-020, FR-021, FR-022, FR-023, FR-024, NFR-009.

### TC-E-110
**Import XLSX with duplicates in update mode** | Level: E2E | P1 | UC, DT
- **Preconditions:** saved NVDA (style Value) and AAPL; list `Core holdings`.
- **Input:** XLSX with NVDA (style Growth, cycle empty), AAPL (moat Brand), MSFT (new) and one error row; Duplicates → Update; target `Core holdings`.
- **Expected:** preview shows `1 new`, `2 duplicate`, `1 error`; summary `1 created · 0 skipped · 2 updated · 1 failed`; NVDA style `Growth` and its cycle behaviour per FR-024; AAPL gains moat; all three are in `Core holdings`; the error row is not saved.
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** FR-019, FR-020, FR-021, FR-022, FR-024.

### TC-E-111
**Error rows: preview, filter, download** | Level: E2E | P1 | UC
- **Input:** file with 3 valid rows and 2 invalid (one with three failed fields); filter `Errors`; import; click `Download error rows (CSV)` and read the downloaded file.
- **Expected:** `Errors` filter shows exactly 2 rows each with every failed `field: message`; summary `3 created … 2 failed`; the download starts with a UTF-8 BOM, has the original columns plus `errors`, exactly 2 data lines with the original cell text (Thai intact) and the messages; the error rows are not in the app.
- **Mock needed:** AdminAPI. **Covers:** FR-019, FR-020, FR-023, NFR-009.

### TC-E-112
**File-level problems and recovery** | Level: E2E | P1 | EP
- **Input:** choose in turn F-08 (1.1 MB), F-12 (`.txt`), F-07 (1,001 rows), F-09 (header only), F-22 (missing columns), F-10 (fake xlsx), then F-02 (valid).
- **Expected:** each time an alert with the message of TC-U-135 and the page stays on step 1; F-22's alert names `exchange, name`; the last valid file moves to step 2 and clears the alert; nothing was saved at any point (`/stocks` empty).
- **Mock needed:** AdminAPI, Fixtures. **Covers:** FR-016, FR-017.

### TC-E-113
**Skip versus update on the same file** | Level: E2E | P2 | DT
- **Input:** import file X (NVDA new, AAPL saved with style Quality) with `Skip`; then a file with AAPL style `Growth` with `Skip`, then with `Update`.
- **Expected:** skip keeps AAPL `Quality` but still adds it to the chosen list (summary `skipped 1`); update changes it to `Growth` (`updated 1`); the `Duplicates` group is shown only when the preview has duplicates (absent for the first file).
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** FR-021, FR-022, FR-024.

### TC-E-114
**Import into a list from its page** | Level: E2E | P2 | EP
- **Input:** `/lists/:id` of an empty list → `Import into it`; choose a file; look at step 2; then open `/import-export?listId=<other user's id>` as a different test.
- **Expected:** the URL is `/import-export?listId=<id>`; step 2 shows that list pre-selected; after confirm the stocks are in it; a foreign or unknown `listId` leaves the target empty (nothing selected, no error page).
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** FR-021, FR-013.

### TC-E-115
**Template downloads work with real sign-in** | Level: E2E | P1 | EG
- **Preconditions:** `supabase` mode, signed-in user (access token held by supabase-js, no cookie).
- **Input:** click `CSV template` and `Excel template` on `/import-export` and read each download.
- **Expected:** both downloads succeed with the correct file names and content (19 headers, BOM on the CSV, valid XLSX) and a `200` response; no `401` is seen on `/api/imports/template.*`. If the plain `<a download>` link cannot send the bearer token, this case fails and exposes defect/gap G-2 (the design requires an identity on every import endpoint and the UX specifies a plain link).
- **Mock needed:** AdminAPI. **Covers:** FR-015, NFR-004.

### Isolation, session and resilience

### TC-E-116
**Two users, same app, nothing shared** | Level: E2E | P1 | UC, EG
- **Preconditions:** user A (own browser context) has NVDA, list `Core holdings` with NVDA; user B signs in in a second context with nothing.
- **Input:** B opens `/stocks`, `/lists`; B opens A's `/stocks/{id}`, `/stocks/{id}/edit`, `/lists/{id}` by URL; B creates `NVDA` and `Core holdings`; B imports a file that contains NVDA; A reloads.
- **Expected:** B sees empty states; A's urls show the not-found page (404 behaviour, no stock name anywhere in the DOM or network responses); B's NVDA and `Core holdings` are created without any duplicate or name-taken message, and B's preview marks NVDA `new`; A's data, counts and list membership are exactly as before.
- **Mock needed:** AdminAPI, TwoUsers. **Covers:** NFR-004, FR-025, FR-002, FR-009.

### TC-E-117
**Signed-out deep links and expired token during import** | Level: E2E | P2 | ST
- **Input:** signed-out visit to `/stocks/new`, `/lists/x`, `/import-export`; sign in; then, while on import step 2, make the access token expire (`page.clock` or a route that returns 401 once on `POST /api/imports`) and click Import.
- **Expected:** each deep link goes to `/auth/sign-in?next=…` and returns to the page after sign-in; the 401 triggers one silent refresh and the retry re-sends the **same** file, ending on the summary with a single set of stocks created (no duplicates).
- **Mock needed:** AdminAPI, PwRoute. **Covers:** FR-022, FR-025, NFR-004.

### TC-E-131
**Reload, Back and double submit** | Level: E2E | P2 | EG
- **Input:** reload on `/stocks/:id/edit` and `/lists/:id`; add a stock, then press Back; double-click `Save stock`; double-click `Import`.
- **Expected:** reload restores the page with data; Back after create does not resubmit and does not show a stale form with a second save possible; one stock created for a double click; one import executed (summary counts equal the file once).
- **Mock needed:** AdminAPI. **Covers:** FR-001, FR-022, FR-002.

### TC-E-132
**Same ticker from two tabs** | Level: E2E | P3 | EG
- **Input:** two pages of the same user fill the add form for `US/NVDA`; submit one, then the other.
- **Expected:** the first succeeds; the second shows the duplicate alert linking to the first one's stock; one row in `/stocks`.
- **Mock needed:** AdminAPI. **Covers:** FR-002.

### TC-E-133
**Network failure on save and on confirm** | Level: E2E | P1 | ST
- **Input:** abort `POST /api/stocks` once; abort `POST /api/imports` once (then, separately, answer it 500); retry each.
- **Expected:** the form keeps its values and shows a readable alert, retry saves exactly one stock; import stays on step 2 with the file and options kept, the database is unchanged after the failure (`/stocks` count and lists via API), retry completes the import once; no partial state is visible.
- **Mock needed:** AdminAPI, PwRoute. **Covers:** FR-022, NFR-006.

### TC-E-134
**Navigation, breadcrumb and titles across pages** | Level: E2E | P3 | EP
- **Input:** sidebar to each of Stocks, Lists, Import / export; visit new, detail, edit, list detail.
- **Expected:** correct active nav item, breadcrumb with ticker and list name, tab title `<Title> · Investhesis`, h1 focused after each route change, no console errors.
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** FR-008, FR-013, NFR-008.

### Privacy, size and data integrity

### TC-E-127
**1,000-row import through the UI** | Level: E2E | P3 | BVA
- **Input:** choose F-06 then F-07 (1,001 rows) then F-06 again; import into a new list.
- **Expected:** 1,000 rows preview inside a scrolling container (no page-level scroll, sticky header), the UI stays responsive (a click on the filter responds within 1 s); confirm finishes and the summary shows `1000 created`; F-07 shows the row-limit alert and nothing is created for it; `/stocks` with 1,000 stocks still loads.
- **Mock needed:** AdminAPI, Fixtures. **Covers:** FR-016, NFR-002.

### TC-E-128
**Thai text through import and back** | Level: E2E | P1 | EG
- **Input:** import F-03 as CSV (BOM) and the same data as XLSX in a second run; view table, detail, edit form; `GET /api/stocks`.
- **Expected:** names and themes are identical in file, API JSON, table, detail and edit form (compare code points); the XLSX and CSV runs give identical stored values; no mojibake in the template round trip (download template CSV, open the Thai example row).
- **Mock needed:** AdminAPI, Fixtures. **Covers:** NFR-009, FR-016, FR-018.

### TC-E-129
**Mock-mode smoke** | Level: E2E | P3 | EP
- **Preconditions:** web `VITE_AUTH_MODE=mock` on :5273 and API `AUTH_MODE=mock` on :3100 (as in the Investhesis gate).
- **Input:** add a stock, create a list, add the stock to it, import F-02 once.
- **Expected:** all four actions work with no sign-in and no token header; the data belongs to the mock user (`/api/me` id equals the rows' owner).
- **Mock needed:** MockAdapter. **Covers:** FR-025, FR-001, FR-009, FR-022.

### TC-E-130
**Import data never leaves the app** | Level: E2E | P1 | EG
- **Input:** run a full import (preview, confirm) and, separately, abandon one at step 2 (close the page); record every request with `page.on('request')` and the API's temp directory.
- **Expected:** every request goes to the app origin (`/api/*`) or the local Supabase Auth host; none to another host; the file bytes appear only in the two multipart bodies to `/api/imports/preview` and `/api/imports`; after the abandoned import the database holds no stock, list or other row from it, and no file remains on the API host; API logs do not contain cell values.
- **Mock needed:** AdminAPI, NetBlock (server side) and Playwright request log. **Covers:** NFR-005.

### Responsive and keyboard

### TC-E-118
**360 px layout on every screen** | Level: E2E | P1 | BVA
- **Input:** viewport 360×640 (and 320×568 smoke); visit `/stocks` (empty and with 35 stocks), `/stocks/new` (also with validation errors and the 409 alert), `/stocks/:id`, `/stocks/:id/edit`, `/lists`, the create-list dialog, `/lists/:id` (menu open), `/import-export` at steps 1, 2 (with 100 rows, all three statuses) and 3.
- **Expected:** `document.documentElement.scrollWidth <= clientWidth` on every page and state (only the stock table and the preview table scroll inside their own container); on `/stocks` the Ticker column is sticky; header actions stack full width under the title; form columns collapse to one; action bars are full width with Save last; dialogs fit inside the viewport; preview shows Row, Ticker, Status with Market, Name and Details on a second line; on list detail Rename and Delete are inside the `⋯` menu; all buttons fully visible when scrolled into view.
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** NFR-007.

### TC-E-119
**Complete the main tasks at 360 px** | Level: E2E | P1 | UC
- **Input:** at 360×640: add a stock (identity, three lenses, list) and save; create a list; add the stock to it; import a CSV into the list and read the summary, using touch (tap) events.
- **Expected:** each task completes without horizontal page scroll or hidden controls; the on-screen keyboard viewport (360×360) still lets the focused field and Save be scrolled into view; summary and download button usable.
- **Mock needed:** AdminAPI, Fixtures. **Covers:** NFR-007, FR-001, FR-009, FR-022.

### TC-E-120
**Keyboard only: add a stock** | Level: E2E | P1 | UC
- **Input:** from the stocks page press Tab to `Add stock`, Enter; fill the form with the keyboard only (arrow keys on Market, type in text fields, open and pick Select options with Enter/arrows, Space on checkboxes, Enter/`,` in the tag input, Tab to Save, Enter).
- **Expected:** focus order equals visual order (Identity → Classification → Lists → Cancel → Save); every control reachable and operable; a visible focus ring everywhere; Enter in a text input submits, in the tag input adds a tag; after a failed submit focus lands on the first invalid field; the stock is saved and the detail page `h1` is focused.
- **Mock needed:** AdminAPI. **Covers:** NFR-008, FR-001, FR-003.

### TC-E-121
**Keyboard only: lists and dialogs** | Level: E2E | P1 | UC
- **Input:** Tab to `New list`, Enter, type a name, Enter; open row menu with Enter, `Rename…`, Esc; `Delete…`, Tab between Cancel and confirm, Esc; open a list, `Add stock` picker with ↑/↓/Enter.
- **Expected:** dialogs trap focus, start on the name input (create/rename) or on Cancel (delete), Esc closes and returns focus to the trigger, Enter submits; the picker selects by keyboard; the remove button and Undo toast action are reachable (toast shortcut Alt+T or F6).
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** NFR-008, FR-009, FR-010, FR-011, FR-012.

### TC-E-122
**Keyboard only: import** | Level: E2E | P1 | UC
- **Input:** Tab to the file input (drop zone) and attach a file with the file chooser interception (Space/Enter opens it); on step 2 Tab through Choose another → status filter (arrow keys) → Target list → Duplicates → Cancel → Import; choose `New list…` with the keyboard and type a name; Enter on Import; Tab to `Download error rows`.
- **Expected:** the tab order is exactly as in ux-design.md (table rows are not stops); radio groups use arrow keys; step headings take focus on each step; the summary is announced (`role="status"`); download works from the keyboard; no mouse event is used anywhere.
- **Mock needed:** AdminAPI, Fixtures. **Covers:** NFR-008, FR-020, FR-021, FR-023.

### TC-E-123
**Keyboard only: stock detail actions** | Level: E2E | P2 | UC
- **Input:** Tab to Edit, More menu (Enter), Delete item, Cancel; `Add to list` popover with arrow keys; `[×]` remove with Enter, Undo with the toast shortcut.
- **Expected:** the tab order is Edit → More → list remove buttons → Add to list; the AlertDialog starts on Cancel and returns focus to the More button; list add, remove and undo all work without a mouse.
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** NFR-008, FR-007, FR-012.

### TC-E-124
**Axe on every screen and state, light and dark** | Level: E2E | P1 | EP
- **Input:** for each screen/state, emulate `prefers-color-scheme` light then dark and run axe (`wcag2a`, `wcag2aa`, `wcag21aa`): `/stocks` (data, empty), `/stocks/new` (clean, with field errors, with the 409 alert), `/stocks/:id` (with Default badge), delete AlertDialog open, `/stocks/:id/edit`, `/lists` (data, empty), create dialog with a 409 error, delete list dialog, `/lists/:id` (with the add popover open), `/import-export` step 1 (clean and with a file error alert), step 2 (all three badges, header warning, error rows, duplicate group, new-list input), step 3 (with the download button).
- **Expected:** zero violations, including `color-contrast`; any `incomplete` contrast result on a semi-transparent tint is not accepted silently, it is verified by TC-E-125.
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** NFR-008.

### TC-E-125
**Measured contrast of tinted destructive controls** | Level: E2E | P1 | BVA
- **Input:** in light and dark themes, for each element below read the computed text colour and the effective background (composite the alpha tint over its real parent colour in the browser, not the page background) and compute the WCAG contrast ratio: the destructive confirm button in the delete-stock and delete-list AlertDialogs (rest, hover, focus-visible); the destructive menu item (`Delete`, highlighted); the `error` status badge and the `1 error` count badge in the import preview; the destructive `Alert` text; the error row tint with foreground text; field error text on a card; `muted-foreground` hint on `card`.
- **Expected:** every ratio ≥ 4.5:1 (3:1 only for large text and non-text parts of the focus ring); results logged per element and theme. If the tinted badge or button falls short, the fix recorded in ux-design.md (use `text-foreground` with the icon carrying the colour, or darken the token) is applied and this case passes on the fixed version; a failure goes back to the owning web task (T-011 for the badge, T-008/T-010 for the button), as T-013's notes say.
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** NFR-008.

### TC-E-126
**Stocks table with 200 stocks in a real browser** | Level: E2E | P2 | BVA
- **Preconditions:** 200 stocks seeded through the API.
- **Input:** open `/stocks`; after the table is visible measure render time with `performance.mark` around the first paint of the rows; click `Sort by Name` and `Sort by Sector` and measure click to updated DOM (`requestAnimationFrame` after the click).
- **Expected:** initial render after data load and each re-sort < 200 ms (median of 5, throttled CPU factor documented, flaky runs are fixed not retried); 200 rows present; no long task above 200 ms during the sort.
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** NFR-003.

---

## 11. Coverage

### 11.1 Coverage matrix

Counts of new cases per series; the dev-plan `TC-U` cases are listed under Unit/Component/API as
in section 6.

| Test area | Unit | Component | Integration / DB | API | E2E | Covered |
|---|---|---|---|---|---|---|
| Happy path | U-040, U-060 | U-100, U-115 | U-005 | A-107, A-139 | E-101, E-102, E-106, E-109 | Yes |
| Validation and boundaries | U-010..U-014, U-120..U-131 | C-131, C-133, C-136, U-092 | U-001, U-002 | A-108..A-113, A-120, A-129, A-141 | E-112 | Yes |
| Business rules (cycle, sector, duplicates) | U-015, U-016, U-124, U-126 | C-135, C-132, U-091 | U-002 | A-111, A-114..A-117, A-133, A-140 | E-103, E-104, E-110, E-113 | Yes |
| State transitions (list membership, wizard, cycle source) | U-124 | C-123, C-156, C-160 | U-005 | A-115, A-121, A-142 | E-104, E-106, E-107 | Yes |
| Auth and authorization | n/a | n/a | A-106 | A-101 | E-117 | Yes |
| Two-user isolation | n/a | n/a | U-004, A-106 | A-102, A-103, A-104, A-105, U-035, U-066 | E-116 | Yes |
| Error and failure | U-135 | C-138, C-141, C-162, C-171 | n/a | A-123, A-142, A-143, A-144, A-148 | E-112, E-133 | Yes |
| Concurrency and idempotency | n/a | C-138, C-170 | U-002 | A-122, A-147, A-143 | E-131, E-132 | Yes |
| File handling and parsing | U-132 | C-163 | n/a | A-127..A-136, U-050..U-058 | E-109..E-112, E-127 | Yes |
| Atomicity | n/a | C-171 | n/a | A-142, A-148 | E-133 | Yes |
| Privacy | n/a | n/a | n/a | A-137, A-136 | E-130 | Yes |
| Unicode and data integrity | U-121, U-127, U-129 | C-181, C-136 | n/a | A-126, A-130, A-145, U-048, U-056 | E-102, E-128 | Yes |
| Performance | n/a | C-114 | n/a | A-125, A-138, A-146 | E-126, E-127 | Yes (timed) |
| Responsive (360 px) | n/a | n/a | n/a | n/a | E-118, E-119 | Yes |
| Accessibility (keyboard, ARIA, contrast) | n/a | C-110, C-112, C-130, C-139, C-160, C-180 | n/a | n/a | E-120..E-125 | Yes |
| Contract (OpenAPI, problem+json) | n/a | n/a | U-006 | A-123, A-124 | n/a | Yes |
| Security (injection, abuse) | U-131 | C-163 | A-106 | A-105, A-135, A-136 | E-115 | Yes |

New cases per level: Unit 16 (`TC-U-120..135`), API/Integration 48 (`TC-A-101..148`),
Component/Static 47 (`TC-C-101..103, 110..114, 120..124, 130..141, 150..156, 160..172, 180, 181`),
E2E 34 (`TC-E-101..134`). Existing dev-plan cases kept: 80 `TC-U`.

### 11.2 Traceability

| Requirement | Test cases |
|---|---|
| FR-001 | U-010, U-011, U-040, U-042, U-090, U-092, U-120, U-121, U-122, U-131, A-107, A-108, A-109, A-124, C-130, C-131, C-132, C-138, E-101, E-102, E-120 |
| FR-002 | U-002, U-041, U-042, U-093, A-102, A-117, A-122, C-139, E-103, E-116, E-131, E-132 |
| FR-003 | U-012, U-013, U-014, U-017, U-045, U-096, U-123, U-125, U-126, U-130, A-110, A-111, A-112, A-113, C-130, C-132, C-133, C-134, C-136, E-101, E-102, E-120 |
| FR-004 | U-040, U-045, U-083, U-124, U-131, A-105, A-114, A-115, A-139, A-140, C-124, C-135, C-140, E-101, E-104 |
| FR-005 | U-015, U-016, U-044, U-091, U-124, A-114, A-115, A-139, A-140, C-132, C-135, E-101, E-104 |
| FR-006 | U-043, U-095, U-130, A-115, A-116, C-134, C-140, C-141, E-104 |
| FR-007 | U-005, U-046, A-121, C-121, E-105, E-123 |
| FR-008 | U-047, U-080, U-081, U-082, U-133, U-134, A-119, C-101, C-103, C-110, C-111, C-112, C-113, C-114, C-120, E-101, E-107, E-108, E-134 |
| FR-009 | U-003, U-030, U-031, U-032, U-100, U-101, U-129, A-103, A-120, A-122, C-150, C-151, C-168, E-106, E-116, E-121, E-129 |
| FR-010 | U-031, U-129, A-120, C-152, E-106, E-121 |
| FR-011 | U-005, U-034, U-102, A-121, C-153, E-106, E-121 |
| FR-012 | U-033, U-035, U-084, U-085, U-103, A-103, A-121, A-122, A-147, C-122, C-123, C-154, C-155, C-156, E-106, E-107, E-121, E-123 |
| FR-013 | U-036, U-104, A-119, A-121, C-101, C-103, C-150, C-154, C-156, E-105, E-106, E-107, E-108, E-114, E-134 |
| FR-014 | U-004, A-107, A-117, A-118, C-137, E-101 |
| FR-015 | U-058, U-128, A-127, A-128, C-161, E-109, E-115 |
| FR-016 | U-053, U-054, U-055, U-056, U-057, U-135, A-129, A-130, A-134, A-135, A-136, A-144, C-162, C-163, E-109, E-112, E-127, E-128 |
| FR-017 | U-050, U-051, U-111, U-125, U-126, U-135, A-131, A-144, C-162, C-167, E-112 |
| FR-018 | U-017, U-018, U-020, U-123, U-125, U-127, A-132, A-134, A-139, E-109, E-128 |
| FR-019 | U-019, U-052, U-125, U-126, A-129, A-132, A-133, C-166, E-110, E-111 |
| FR-020 | U-050, U-052, U-110, A-104, A-129, A-130, A-132, A-133, A-137, C-160, C-164, C-165, C-166, C-167, E-109, E-110, E-111, E-122 |
| FR-021 | U-060, U-062, U-112, U-114, U-116, A-140, A-141, A-147, C-168, C-169, C-170, E-109, E-110, E-113, E-114, E-122 |
| FR-022 | U-060, U-061, U-062, U-063, U-064, U-065, A-104, A-122, A-139, A-141, A-142, A-143, A-144, A-147, A-148, C-102, C-170, C-171, E-109, E-110, E-113, E-117, E-119, E-129, E-131, E-133 |
| FR-023 | U-115, U-132, A-143, A-145, C-172, E-109, E-111, E-122 |
| FR-024 | U-061, A-139, A-140, E-109, E-110, E-113 |
| FR-025 | U-004, U-006, U-035, U-066, U-131, A-101..A-106, C-141, E-116, E-117, E-129 |
| NFR-001 | A-125 |
| NFR-002 | A-135, A-138, A-146, E-127 |
| NFR-003 | C-114, E-126 |
| NFR-004 | U-035, U-066, A-101, A-102, A-103, A-104, A-105, A-106, A-123, A-124, C-102, E-115, E-116, E-117 |
| NFR-005 | A-136, A-137, E-130 |
| NFR-006 | A-142, A-144, A-148, C-171, E-133 |
| NFR-007 | E-118, E-119 |
| NFR-008 | C-101, C-110, C-112, C-122, C-124, C-130, C-136, C-138, C-139, C-151, C-153, C-155, C-160, C-162, C-163, C-165, C-166, C-168, C-169, C-170, C-180, E-120, E-121, E-122, E-123, E-124, E-125, E-134 |
| NFR-009 | U-017, U-048, U-056, U-121, U-127, U-132, A-126, A-127, A-130, A-139, A-145, C-111, C-136, C-150, C-155, C-181, E-102, E-109, E-111, E-128 |

Use-case coverage: UC-001 (E-101, E-102, E-103, E-120), UC-002 (E-104, E-105), UC-003 (E-106,
E-107, E-121), UC-004 (E-108, E-118), UC-005 (E-109..E-114, E-122). The destructive-button and badge
contrast checks flagged in ux-design.md are TC-E-125 (measured) and TC-E-124 (axe); the
`muted-foreground` on `bg-muted` rule is TC-C-180. The T-005 fixtures list is section 5.4 and
TC-A-129.

## 12. Gaps, ambiguities and risks

Every FR and NFR has at least one case. These need an owner or developer decision (the proposed
default is what the case currently expects):

- **G-1: TC-id collision with User Auth.** The dev plans of both features use `TC-U-001..042`.
  The requirement to keep the plan ids makes them collide in test titles, `test-report.md` anchors
  and `-t` filters. Proposal: automation prefixes every Stock Lists title with `[stock-lists]`
  (for example `[stock-lists] TC-U-001: ...`) and keeps one report per feature folder. New ids
  start at 101 (120 for unit) to avoid further clashes.
- **G-2: template download needs an identity but is a plain link.** design.md and NFR-004 require a
  token on every import endpoint, while ux-design.md specifies `<a href="/api/imports/template.csv"
  download>`, which carries no `Authorization` header in `supabase` mode. Either the link must
  become a fetch-and-save button, or the template routes become public (they contain no user data).
  TC-E-115 will fail until one is chosen; TC-A-101 currently asserts that the routes need a token.
- **G-3: row count in the "too many rows" message.** ux-design.md shows `The file has 1,248 rows;
  the limit is 1,000`, but the `422 file_too_many_rows` contract carries no count. Proposal: add
  `rows` (or put it in `detail`); TC-U-135 accepts the generic form until then.
- **G-4: "update" semantics for multi-value cells.** FR-021 says non-empty values overwrite; for
  `themes`, `customers`, `revenue_types` and `index_membership` it is not stated whether the row's
  list replaces or merges with the saved one. TC-A-140 expects replace.
- **G-5: whitespace-only and padded names.** FR-001 trims only the ticker. Names of spaces,
  or ` Apple Inc `, are untested by the requirement; the cases expect rejection and trimming
  (TC-U-121, TC-U-127). Confirm with the owner.
- **G-6: cycle when the sector is cleared.** FR-005 does not say what happens to a `default` cycle
  when the sector is cleared. design.md's algorithm ("otherwise → none") removes it; TC-A-115 and
  TC-U-124 expect that.
- **G-7: empty (0-byte) file.** Neither `file_empty` nor `file_unsupported` is defined for a 0-byte
  CSV; F-15 expects `422 file_empty`.
- **G-8: duplicate or blank header names.** FR-017 is silent; TC-A-131 only requires a defined
  non-500 outcome (error or first-wins with a warning). Pick one.
- **G-9: name length in characters.** Zod's `.max(200)` counts UTF-16 units, Postgres `char_length`
  counts code points, FR-001 says characters. A 200-emoji name could be rejected by the API although
  valid by the DB rule (TC-U-121). The HTML `maxLength` also counts units (TC-C-133).
- **G-10: value chain name without a position, and clearing the chain after choosing one.**
  FR-003 says a position needs a name but not the reverse; the cases accept a name alone (position
  null). What the form does when the name is cleared after a position was chosen is a UX decision
  (reset position or show an error); TC-C-133 pins either, not a silent invalid pair.
- **G-11: sort of unset sectors and of Thai text.** Not specified; the cases expect unset last and a
  deterministic order for Thai.
- **G-12: empty PATCH and no-change Save.** `{}` may be 200 or 400; the edit form may skip the
  request or send an empty patch. Pin one.
- **G-13: renaming a list to a case-only variant of its own name** is allowed by the
  uniqueness rule in principle (it is the same list) but not stated in FR-010; TC-A-120 expects 200.
- **G-14: blank lines and the 1,000-row limit.** FR-016 says "data rows"; blank lines are assumed
  not to count. **G-15:** `rowNumber` for records that span several physical lines (quoted
  newline) and after blank lines is not defined; TC-A-130 pins a rule.
- **G-17: copy for zero** (delete a stock in no list; delete an empty list) is not in ux-design.md.
- **Untestable or only partly testable.** NFR-008 "errors are announced to screen readers" is
  verified by roles, `aria-live` and focus (TC-C-139, TC-C-160), not by a real screen reader.
  "Constraint: all UI text easy to extract later" has no executable test; at most a review item.
  NFR-001 to NFR-003 are timed on the developer's machine against single-user local Supabase and are
  noisy on CI: assert the percentile named in the requirement, log the rest, fix flakiness rather
  than retry. Hosted-Supabase behaviour (pooler mode, RLS exposure through the REST API) is covered
  locally by TC-A-106 only.
- **Risk: CSV/formula injection.** The error-rows CSV and the templates echo user text, so a cell
  starting with `=`, `+`, `-` or `@` becomes a formula when opened in Excel. NFR-009 demands
  byte-for-byte text, which conflicts with the usual `'` prefix mitigation. No case pins either;
  decide and add one.
- **Risk: file uploaded twice** (preview and confirm) means the confirm re-validates; a file edited
  on disk between the two calls changes what is imported although the user reviewed the old
  preview. The browser keeps the same `File` object, so a changed on-disk file is only read at
  upload time; TC-C-170 pins that the same object is sent, not that the content is unchanged.
- **Risk: XLSX decompression** (design Risks) is covered by TC-A-135 with a file under 1 MB; real
  attack sizes are not tested.
- **Execution notes for T-013.** API, DB and TC-A integration cases need Docker (`pnpm db:start`,
  `pnpm db:reset`) and share the User Auth Playwright setup (`pnpm test:e2e`, ports 5173 and 3000);
  fixtures F-13..F-31 must be generated by a script, not committed as large binaries (F-06, F-07,
  F-08, F-13, F-14, F-24, F-30 are generated at test time); coverage targets are in T-013's criteria.
