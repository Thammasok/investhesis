---
version: 1.0
status: active
date: 2026-11-21
requires: design.md
ux-design: ux-design.md
---

# Development Plan: Stock Lists

Builds [requirements.md](requirements.md) per [design.md](design.md) and
[ux-design.md](ux-design.md). Every engineering task follows the test gate (green before, green
after, then human review). The gate's command table in `.claude/rules/test-gate.md` is still
Pacta's; until the owner approves the replacement proposed in
[T-001](#t-001--database-foundation), the gate for this plan is, from the repo root:
`pnpm db:start && pnpm db:reset` (from T-001 on), `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm build`.

**Ordering with User Auth.** Both plans create `supabase/` (this T-001 / its T-001), a migration
needing schema `app` (this T-001 / its T-009), `apps/web/src/lib/api-client.ts` (this T-007 / its
T-003) and Playwright (this T-013 / its T-008). Whichever task runs second extends the existing
files instead of recreating them, and says so in its review note. Once User Auth T-003 lands,
web tests here render routes with its signed-in `FakeAuthClient`, and loaders need no auth checks
of their own (its `app` route middleware runs before them). See
[User Auth's dev plan](../../user-auth/v1.0/dev-plan.md).

## Summary

- **Total tasks** — 13 (11 engineering, 1 test design, 1 test automation)
- **Estimated effort** — about 15 days of agent work (M ≈ 0.75 day, L ≈ 1.5 days); about 8 days
  elapsed with backend and frontend tasks running in parallel
- **Critical path** — [T-002](#t-002--shared-domain-package) → [T-003](#t-003--lists-api) →
  [T-004](#t-004--stocks-api) → [T-005](#t-005--import-preview-and-template-api) →
  [T-006](#t-006--import-confirm-api) → [T-013](#t-013--automate-tests--stock-lists)
- **Parallel lanes** — [T-001](#t-001--database-foundation) runs alongside T-002. Web tasks
  [T-007](#t-007--web-foundation)–[T-011](#t-011--import-wizard) need only T-002 and T-007: they
  build against the API contracts in `design.md` with a stubbed `api-client`, and T-013 proves
  them against the real API. [T-012](#t-012--design-test-cases--stock-lists) starts at once.

## Tasks

### T-001 — Database foundation

```yaml
- title: Set up Supabase CLI migrations, the stock-lists schema and Drizzle typings
- description: >
  Add the Supabase CLI project (`supabase init` at the repo root, `supabase` as a root dev
  dependency) and root scripts `db:start`, `db:reset`, `db:stop`. Write the first migration,
  `supabase/migrations/<timestamp>_stock_lists.sql`, exactly as design.md §Data Model: schema
  `app`, usage revoked from anon/authenticated, tables `stocks`, `lists`, `list_stocks` with their
  CHECKs, unique keys, composite foreign keys, cascades, index and RLS enabled without policies.
  Add hand-written Drizzle tables in `apps/api/src/db/schema/` (pgSchema 'app'), a drift test
  comparing them with information_schema, and a test helper that builds the app against the
  local database with a given user id (design.md §Testing approach). Starts with a short audit of
  the existing API skeleton so later tasks reuse its patterns (ADR-001, ADR-002, ADR-003).
- agent: software-engineer-backend
- depends_on: []
- status: done
- size: M
```

#### Acceptance criteria

- [ ] `pnpm db:start && pnpm db:reset` from the repo root applies the migration to a fresh local Supabase with no errors
- [ ] `supabase/migrations/` holds exactly one migration for this feature; no drizzle-kit config or migrations exist
- [ ] Tables `app.stocks`, `app.lists`, `app.list_stocks` exist with the columns, constraints and indexes listed in design.md §Data Model
- [ ] The `anon` and `authenticated` roles cannot select from any `app` table (test asserts the permission error)
- [ ] The drift test passes, and fails when a Drizzle column is renamed (checked once by hand, reverted)
- [ ] `test/db.ts` (or equivalent) gives tests a `buildApp` with a real DB handle and a chosen user id, and deletes that user's rows in `afterAll`
- [ ] `apps/api/.env.example` and `CLAUDE.md` describe the new scripts
- [ ] A replacement command table for `.claude/rules/test-gate.md` is proposed to the owner in the review note (not applied without approval)

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-001
    scenario: stock row with an exchange from the other market is refused
    given: migrated database, user U
    when: insert into app.stocks (market 'TH', exchange 'NYSE', currency 'THB', ticker 'PTT', name 'PTT')
    then: the insert fails with check violation stocks_exchange_market
    test_data:
      input: { market: TH, exchange: NYSE, currency: THB, ticker: PTT }
      expected: "SQLSTATE 23514, constraint stocks_exchange_market"
  - id: TC-U-002
    scenario: same market and ticker twice for one user is refused, for two users is allowed
    given: user U has US/AAPL
    when: insert US/AAPL for U, then US/AAPL for user V
    then: first fails with stocks_user_market_ticker; second succeeds
    test_data:
      input: [{ user: U, market: US, ticker: AAPL }, { user: V, market: US, ticker: AAPL }]
      expected: ["SQLSTATE 23505", "1 row inserted"]
  - id: TC-U-003
    scenario: list name uniqueness ignores case
    given: user U has list "Core holdings"
    when: insert list "core HOLDINGS" for U
    then: fails on index lists_user_name_ci
    test_data:
      input: "core HOLDINGS"
      expected: "SQLSTATE 23505"
  - id: TC-U-004
    scenario: membership cannot join one user's list to another user's stock
    given: list L owned by U, stock S owned by V
    when: insert into app.list_stocks (list_id L, stock_id S, user_id U)
    then: foreign key violation
    test_data:
      input: { list: L(U), stock: S(V), user_id: U }
      expected: "SQLSTATE 23503"
  - id: TC-U-005
    scenario: deleting a stock or a list cascades only memberships
    given: stock S in list L for U
    when: delete S; then (in a new setup) delete L
    then: membership rows gone in both cases; deleting L leaves S in app.stocks
    test_data:
      input: { delete: [stock, list] }
      expected: { list_stocks: 0, stocks_after_list_delete: 1 }
  - id: TC-U-006
    scenario: Drizzle schema matches the database
    given: migrated database
    when: drift test reads information_schema.columns for schema app
    then: every Drizzle column exists with the same name, type and nullability, and vice versa
    test_data:
      input: "app.stocks, app.lists, app.list_stocks"
      expected: "no differences"
```

**Notes** — Start the migration with `create schema if not exists app` so it runs before or after User Auth's allowlist migration. If User Auth T-001 is already in, `pnpm db:start` also generates the local signing key; nothing else changes here. Use the session-mode or direct connection (`127.0.0.1:54322` locally). `updated_at` is maintained by repositories, not triggers. If `supabase` npm install is unsuitable for pnpm 12, use the Homebrew CLI and document it.

### T-002 — Shared domain package

```yaml
- title: Create @investhesis/domain with the vocabulary, rules and row canonicaliser
- description: >
  New workspace package `packages/domain` (`@investhesis/domain`, exports `./src/index.ts`, Zod
  only, erasable TypeScript syntax only, own Vitest + oxlint + tsc). Contents per design.md
  §Shared vocabulary and rules: markets, exchanges, currencies and indexes by market; LENS_VALUES
  in the canonical spelling of FR-003; normaliseTicker and TICKER_PATTERN; CYCLE_BY_GICS and
  resolveEconomicCycle (FR-005); Zod StockInput, StockPatch, ListName; TEMPLATE_COLUMNS
  (FR-015); canonicaliseRow (FR-017–FR-019 per-row part). First prove ADR-005: import the package
  from `apps/api` under `node --watch` (type stripping) and Vitest, and from `apps/web` under
  Vite, before writing the rest; if Node refuses, add a tsc build to dist and record it in
  design.md ADR-005.
- agent: software-engineer-backend
- depends_on: []
- status: done
- size: L
```

#### Acceptance criteria

- [ ] `pnpm --filter @investhesis/api dev` starts with a route-free import of `@investhesis/domain` in `src/app.ts`, and `pnpm build` succeeds for api and web
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` at the root include the new package
- [ ] Every enumerated value in requirements FR-003 appears exactly once in LENS_VALUES with the same spelling (table-driven test)
- [ ] All TC-U cases below pass; line coverage of `packages/domain/src` ≥ 95%

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-010
    scenario: ticker is trimmed and upper-cased, then validated
    given: raw ticker input
    when: normaliseTicker then TICKER_PATTERN.test
    then: valid tickers normalise; invalid ones fail
    test_data:
      input: [" brk.b ", "pttep", "ADVANC-R", ".ABC", "ABCDEFGHIJKLM", "A B"]
      expected: ["BRK.B valid", "PTTEP valid", "ADVANC-R valid", "invalid", "invalid (13 chars)", "invalid"]
  - id: TC-U-011
    scenario: exchange must belong to the market; currency is derived
    given: StockInput.safeParse
    when: input { market TH, exchange NASDAQ, ticker PTT, name PTT }
    then: fails with path exchange; valid TH/SET input yields currency THB
    test_data:
      input: [{ market: TH, exchange: NASDAQ }, { market: TH, exchange: SET }]
      expected: ["error path exchange", "currency THB"]
  - id: TC-U-012
    scenario: TH sector needs both SET group and GICS sector; US must not have a SET group
    given: StockInput.safeParse
    when: TH with setIndustryGroup Resources and no gicsSector; US with setIndustryGroup Services
    then: both fail (paths gicsSector and setIndustryGroup)
    test_data:
      input: [{ market: TH, setIndustryGroup: Resources }, { market: US, setIndustryGroup: Services }]
      expected: ["error path gicsSector", "error path setIndustryGroup"]
  - id: TC-U-013
    scenario: value chain position needs a chain name except None
    given: StockInput.safeParse
    when: position Upstream with no valueChain; position None with no valueChain
    then: first fails at valueChain; second passes
    test_data:
      input: [{ valueChainPosition: Upstream }, { valueChainPosition: None }]
      expected: ["error path valueChain", "ok"]
  - id: TC-U-014
    scenario: themes are de-duplicated case-insensitively and capped
    given: StockInput.safeParse
    when: themes ["AI", "ai", " EV "]; then 21 distinct themes; then a 41-char theme
    then: first yields ["AI", "EV"]; second and third fail at themes
    test_data:
      input: [["AI", "ai", " EV "], "21 themes", "41 chars"]
      expected: [["AI", "EV"], "error themes", "error themes.0"]
  - id: TC-U-015
    scenario: economic cycle default follows sector until set manually
    given: resolveEconomicCycle
    when: (a) gics Utilities, no cycle, no prior; (b) prior Defensive/default, gics -> Energy; (c) prior Cyclical/manual, gics -> Utilities; (d) prior Sensitive/default, input cycle Cyclical; (e) cycle cleared (null) with gics Energy
    then: (a) Defensive default (b) Sensitive default (c) Cyclical manual (d) Cyclical manual (e) Sensitive default
    test_data:
      input: [a, b, c, d, e]
      expected: ["Defensive/default", "Sensitive/default", "Cyclical/manual", "Cyclical/manual", "Sensitive/default"]
  - id: TC-U-016
    scenario: every GICS sector maps to one cycle
    given: CYCLE_BY_GICS
    when: iterate the 11 GICS sectors
    then: each has exactly one of Cyclical, Sensitive, Defensive as in FR-005
    test_data:
      input: "11 GICS sectors"
      expected: "4 Cyclical, 4 Sensitive, 3 Defensive"
  - id: TC-U-017
    scenario: canonicaliseRow matches values ignoring case and spaces and maps sector by market
    given: canonicaliseRow
    when: cells { ticker " pttep", market "th", exchange "set", name "ปตท.สผ.", sector "resources", gics_sector "energy", style " DIVIDEND ", themes "Energy; energy ;LNG" }
    then: ok with ticker PTTEP, market TH, exchange SET, setIndustryGroup Resources, gicsSector Energy, style Dividend, themes ["Energy", "LNG"], name unchanged bytes
    test_data:
      input: "cells above"
      expected: "ok input as described; name === 'ปตท.สผ.'"
  - id: TC-U-018
    scenario: MAI spelling is canonicalised to mai
    given: canonicaliseRow
    when: exchange "MAI", market "TH"
    then: exchange "mai"
    test_data:
      input: "MAI"
      expected: "mai"
  - id: TC-U-019
    scenario: every failed field is reported, not only the first
    given: canonicaliseRow
    when: cells { ticker "", market "JP", exchange "SET", name "", size "Huge" }
    then: errors for ticker, market, name and size, each with a message
    test_data:
      input: "cells above"
      expected: "4+ errors with paths ticker, market, name, size"
  - id: TC-U-020
    scenario: empty cells mean not set
    given: canonicaliseRow
    when: cells with moat "", customers "", volatility "  "
    then: moat null, customers [], volatility null; no errors
    test_data:
      input: { moat: "", customers: "", volatility: "  " }
      expected: { moat: null, customers: [], volatility: null }
```

**Notes** — No I/O in this package. Error messages are English strings now but kept in one map so i18n can replace them.

### T-003 — Lists API

```yaml
- title: Build the lists module with membership routes
- description: >
  `apps/api/src/modules/lists/` (routes → service → repository) for GET/POST /lists,
  GET/PATCH/DELETE /lists/{id}, POST /lists/{id}/stocks, DELETE /lists/{id}/stocks/{stockId}
  exactly as design.md §API Contracts › Lists. Every repository call takes userId (ADR-003);
  another user's ids answer 404. 409 codes list_name_taken and already_in_list map from the
  unique violations. Expose repository functions the stocks and import modules will reuse
  (findOwnedList, createList, addMemberships). Covers FR-009–FR-013, FR-025.
- agent: software-engineer-backend
- depends_on: [T-001, T-002]
- status: done
- size: M
```

#### Acceptance criteria

- [ ] All seven routes appear in `/openapi.json` with request and response schemas
- [ ] Each route answers per design.md, including every listed error code, in `application/problem+json`
- [ ] A two-user test shows user V gets 404 for every route on user U's list ids and cannot add U's stock to V's list
- [ ] `stockCount` is correct after add, remove and stock deletion
- [ ] All TC-U cases below pass as `app.inject` tests against local Supabase

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-030
    scenario: create a list with a trimmed name
    given: user U with no lists
    when: POST /lists { name: "  Core holdings  " }
    then: 201 with name "Core holdings", stockCount 0
    test_data:
      input: { name: "  Core holdings  " }
      expected: { status: 201, name: "Core holdings", stockCount: 0 }
  - id: TC-U-031
    scenario: duplicate name ignoring case is refused on create and rename
    given: U has "Core holdings" and "Watching"
    when: POST /lists { name: "CORE holdings" }; PATCH Watching { name: "core holdings" }
    then: both 409 code list_name_taken
    test_data:
      input: ["CORE holdings", "core holdings"]
      expected: [409 list_name_taken, 409 list_name_taken]
  - id: TC-U-032
    scenario: name length bounds
    given: user U
    when: POST names "", "   ", 60 chars, 61 chars
    then: 400, 400, 201, 400
    test_data:
      input: ["", "   ", "a×60", "a×61"]
      expected: [400, 400, 201, 400]
  - id: TC-U-033
    scenario: add a stock twice to the same list
    given: U's list L and stock S
    when: POST /lists/L/stocks { stockId S } twice
    then: 201 then 409 already_in_list; stockCount 1
    test_data:
      input: { stockId: S }
      expected: [201, "409 already_in_list"]
  - id: TC-U-034
    scenario: deleting a list keeps its stocks
    given: list L with stocks S1, S2
    when: DELETE /lists/L
    then: 204; GET /stocks/S1 still 200
    test_data:
      input: L
      expected: { delete: 204, stock: 200 }
  - id: TC-U-035
    scenario: another user's ids are invisible
    given: U owns list L and stock S; V is signed in
    when: V calls GET/PATCH/DELETE /lists/L, POST /lists/L/stocks, POST /lists/V_list/stocks { stockId S }
    then: every call 404 not_found; U's data unchanged
    test_data:
      input: "5 calls as V"
      expected: "5 × 404"
  - id: TC-U-036
    scenario: lists are ordered by name with counts
    given: U has "Watching" (1 stock), "Core holdings" (2 stocks)
    when: GET /lists
    then: items in order Core holdings (2), Watching (1)
    test_data:
      input: none
      expected: [{ name: "Core holdings", stockCount: 2 }, { name: "Watching", stockCount: 1 }]
```

**Notes** — Seed stocks in tests with direct repository inserts until T-004 lands.

### T-004 — Stocks API

```yaml
- title: Build the stocks module with create, read, update and delete
- description: >
  `apps/api/src/modules/stocks/` for GET /stocks (optional listId), POST /stocks (with listIds),
  GET/PATCH/DELETE /stocks/{id} per design.md §API Contracts › Stocks. Uses StockInput/StockPatch
  and resolveEconomicCycle from @investhesis/domain so create and update apply FR-004/FR-005;
  maintains lens_sources (set field → manual, defaulted cycle → default, cleared field → no
  entry). 409 stock_exists carries existingStockId (extend lib/problem.ts with problem extension
  members if needed). Expose repository functions for the import module (findByMarketTickers,
  insertMany with on conflict do nothing, update). Covers FR-001–FR-008, FR-014, FR-025, NFR-001.
- agent: software-engineer-backend
- depends_on: [T-001, T-002, T-003]
- status: done
- size: L
```

#### Acceptance criteria

- [ ] All five routes appear in `/openapi.json` and answer per design.md, including errors
- [ ] Response shape matches the `Stock` example in design.md (null for unset single values, [] for unset arrays)
- [ ] A two-user test shows V gets 404 for U's stock on GET, PATCH, DELETE and cannot filter by U's listId
- [ ] POST /stocks with listIds adds memberships in the same transaction; a foreign listId gives 404 and saves nothing
- [ ] p95 of 50 sequential POST /stocks calls against local Supabase is under 500 ms (NFR-001), measured in a test
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-040
    scenario: create a US stock with lenses and a defaulted cycle
    given: user U, no stocks
    when: POST /stocks { ticker "nvda", market US, exchange NASDAQ, name "NVIDIA", gicsSector "Information Technology", style "Growth" }
    then: 201, ticker NVDA, currency USD, economicCycle Sensitive, lensSources { gicsSector manual, style manual, economicCycle default }
    test_data:
      input: { ticker: nvda, market: US, exchange: NASDAQ, name: NVIDIA, gicsSector: Information Technology, style: Growth }
      expected: { status: 201, ticker: NVDA, currency: USD, economicCycle: Sensitive, lensSources: { gicsSector: manual, style: manual, economicCycle: default } }
  - id: TC-U-041
    scenario: duplicate market and ticker is refused with the existing id
    given: U has US/AAPL with id A
    when: POST /stocks { ticker "aapl", market US, exchange NASDAQ, name "Apple Inc" }
    then: 409 code stock_exists, existingStockId A
    test_data:
      input: { ticker: aapl, market: US }
      expected: { status: 409, code: stock_exists, existingStockId: A }
  - id: TC-U-042
    scenario: same ticker in another market is a different stock
    given: U has US/TRUE
    when: POST /stocks { ticker TRUE, market TH, exchange SET, name "True Corporation" }
    then: 201
    test_data:
      input: { ticker: TRUE, market: TH, exchange: SET }
      expected: 201
  - id: TC-U-043
    scenario: market and ticker cannot be patched
    given: U's stock S (US/MSFT)
    when: PATCH /stocks/S { ticker "MSFT2" }; PATCH /stocks/S { market "TH" }
    then: both 400 validation_failed; stock unchanged
    test_data:
      input: [{ ticker: MSFT2 }, { market: TH }]
      expected: [400, 400]
  - id: TC-U-044
    scenario: manual cycle survives a sector change; default cycle follows it
    given: S1 gics Utilities with cycle Defensive/default; S2 gics Utilities with cycle Cyclical/manual
    when: PATCH both { gicsSector "Energy" }
    then: S1 cycle Sensitive/default; S2 cycle Cyclical/manual
    test_data:
      input: { gicsSector: Energy }
      expected: [{ economicCycle: Sensitive, source: default }, { economicCycle: Cyclical, source: manual }]
  - id: TC-U-045
    scenario: null clears a lens and removes its source; omitted fields are untouched
    given: S with moat Brand (manual), style Value (manual)
    when: PATCH /stocks/S { moat: null }
    then: moat null, lensSources has no moat key, style still Value
    test_data:
      input: { moat: null }
      expected: { moat: null, style: Value, lensSourcesHasMoat: false }
  - id: TC-U-046
    scenario: delete removes the stock from every list
    given: S in lists L1 and L2
    when: DELETE /stocks/S
    then: 204; GET /lists shows both counts reduced by 1; GET /stocks/S 404
    test_data:
      input: S
      expected: { delete: 204, get: 404 }
  - id: TC-U-047
    scenario: filter by list and order by ticker
    given: U has AAPL, MSFT, PTTEP; list L contains PTTEP and AAPL
    when: GET /stocks?listId=L
    then: items AAPL, PTTEP with listIds containing L
    test_data:
      input: { listId: L }
      expected: ["AAPL", "PTTEP"]
  - id: TC-U-048
    scenario: Thai name round-trips byte-for-byte
    given: user U
    when: POST a TH stock with name "บมจ. ปตท. สำรวจและผลิตปิโตรเลียม" then GET it
    then: name is identical (same code points, same UTF-8 bytes)
    test_data:
      input: "บมจ. ปตท. สำรวจและผลิตปิโตรเลียม"
      expected: "identical"
```

**Notes** — GET /stocks returns all of the user's stocks (no pagination); 200 is the planning size (NFR-003) and import caps at 1,000 per file.

### T-005 — Import preview and template API

```yaml
- title: Build file reading, import preview and template downloads
- description: >
  `apps/api/src/plugins/multipart.ts` (@fastify/multipart: fileSize 1 MB, files 1, small field
  limits) and `apps/api/src/modules/imports/`: `file-reader.ts` turning CSV (csv-parse, BOM
  aware, UTF-8 checked with a fatal TextDecoder) or XLSX (exceljs, first worksheet, cached
  formula results, ZIP signature check) into a header row plus string cells; header mapping
  (FR-017); POST /imports/preview using canonicaliseRow, in-file duplicate detection and a lookup
  of the user's saved (market, ticker) pairs (FR-016–FR-020); GET /imports/template.csv and
  .xlsx generated from TEMPLATE_COLUMNS with one example row per market and a UTF-8 BOM on the
  CSV (FR-015, ADR-010). Nothing is written to the database or disk (NFR-005). Covers NFR-002
  for the preview half.
- agent: software-engineer-backend
- depends_on: [T-002, T-004]
- status: done
- size: L
```

#### Acceptance criteria

- [ ] Fixtures exist in `apps/api/test/fixtures/imports/`: template CSV with BOM, CSV without BOM, Thai names, XLSX with a formula cell, XLSX with two sheets, 1,000 and 1,001 data rows, 1.1 MB file, header-only file, PNG renamed to .xlsx, Latin-1 CSV
- [ ] Each fixture produces the response or error code in design.md §API Contracts › Imports
- [ ] Preview of the 1,000-row fixture completes in under 3 s against local Supabase (NFR-002)
- [ ] Downloaded templates re-imported through preview give 2 rows with status new and no errors
- [ ] No file or row data is written to disk or database during preview (asserted by table counts and a temp-dir check)
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-050
    scenario: headers match ignoring case, spaces and order; unknown headers warn
    given: CSV header " Name ,TICKER,exchange,market,notes"
    when: POST /imports/preview
    then: 200; rows mapped correctly; headerWarnings ["Unknown column \"notes\" ignored"]
    test_data:
      input: " Name ,TICKER,exchange,market,notes"
      expected: { status: 200, headerWarnings: 1 }
  - id: TC-U-051
    scenario: missing required headers reject the whole file
    given: CSV header "ticker,market"
    when: POST /imports/preview
    then: 422 file_missing_headers with errors paths exchange and name
    test_data:
      input: "ticker,market"
      expected: { status: 422, code: file_missing_headers, paths: [exchange, name] }
  - id: TC-U-052
    scenario: row statuses new, duplicate and error with file row numbers
    given: U has saved US/AAPL; file rows 2 NVDA US, 3 AAPL US, 4 XYZ JP, 5 nvda us
    when: POST /imports/preview
    then: row 2 new; row 3 duplicate with existingStockId; row 4 error (market); row 5 error (ticker repeats row 2); counts { new 1, duplicate 1, error 2 }
    test_data:
      input: "4 data rows as above"
      expected: { counts: { new: 1, duplicate: 1, error: 2 } }
  - id: TC-U-053
    scenario: size and row limits
    given: fixtures 1.1 MB, 1,001 rows, 1,000 rows, header only
    when: POST /imports/preview each
    then: 413 file_too_large, 422 file_too_many_rows, 200 with 1,000 rows, 422 file_empty
    test_data:
      input: [1.1MB, 1001 rows, 1000 rows, header only]
      expected: [413, "422 file_too_many_rows", 200, "422 file_empty"]
  - id: TC-U-054
    scenario: unsupported files
    given: report.txt, png renamed holdings.xlsx, Latin-1 encoded CSV
    when: POST /imports/preview each
    then: 415 file_unsupported for all three
    test_data:
      input: [report.txt, fake.xlsx, latin1.csv]
      expected: [415, 415, 415]
  - id: TC-U-055
    scenario: xlsx reads only the first sheet and formula results
    given: XLSX whose first sheet has name cell =CONCAT("Ad","vanc") and a second sheet with 5 rows
    when: POST /imports/preview
    then: one row; name "Advanc"; second sheet ignored
    test_data:
      input: two-sheets-formula.xlsx
      expected: { rows: 1, name: Advanc }
  - id: TC-U-056
    scenario: CSV with BOM and Thai text
    given: UTF-8 CSV with BOM, name "ปตท."
    when: POST /imports/preview
    then: first header is "ticker" (BOM stripped); name "ปตท." exact
    test_data:
      input: thai-bom.csv
      expected: { firstHeader: ticker, name: "ปตท." }
  - id: TC-U-057
    scenario: missing file part
    given: multipart body with no file part
    when: POST /imports/preview
    then: 400 file_missing
    test_data:
      input: "multipart without file"
      expected: "400 file_missing"
  - id: TC-U-058
    scenario: templates list the columns in order
    given: none
    when: GET /imports/template.csv and /imports/template.xlsx
    then: content-disposition attachment; header row equals TEMPLATE_COLUMNS headers in order; CSV starts with EF BB BF
    test_data:
      input: none
      expected: "19 headers ticker..volatility; BOM present"
```

**Notes** — XLSX decompression size is a known risk (design.md §Risks); check the worksheet row count right after load and before reading cells.

### T-006 — Import confirm API

```yaml
- title: Build the transactional import confirm
- description: >
  POST /imports per design.md §API Contracts › Imports and its confirm algorithm: re-parse with
  the T-005 reader, resolve or create the target list, lock the user's duplicates, insert new
  rows (on conflict do nothing; late conflicts become duplicates), apply skip or update (merge
  non-empty values as manual, resolveEconomicCycle), add memberships, all in one transaction;
  return counts and errorRows with original cells. Covers FR-021–FR-024, NFR-002 (confirm half),
  NFR-006.
- agent: software-engineer-backend
- depends_on: [T-005]
- status: done
- size: M
```

#### Acceptance criteria

- [ ] Confirm of the 1,000-row fixture completes in under 5 s against local Supabase (NFR-002)
- [ ] A forced failure in the middle of the transaction (test-only repository stub throwing after 500 inserts) leaves stocks, lists and memberships exactly as before (NFR-006)
- [ ] Options are validated: missing duplicateMode, both or neither of targetListId/newListName → 400
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-060
    scenario: skip keeps saved stocks and still adds them to the list
    given: U has US/AAPL (style Value) not in list L; file rows AAPL style Growth, NVDA, XYZ JP
    when: POST /imports { duplicateMode skip, targetListId L }
    then: created 1, skipped 1, updated 0, failed 1, addedToList 2; AAPL style still Value
    test_data:
      input: { duplicateMode: skip, rows: [AAPL, NVDA, XYZ] }
      expected: { created: 1, skipped: 1, updated: 0, failed: 1, addedToList: 2 }
  - id: TC-U-061
    scenario: update overwrites only non-empty cells and marks them manual
    given: AAPL saved with style Value, moat Brand, cycle Sensitive/default (gics IT)
    when: import row AAPL with style Growth, moat empty, economic_cycle Defensive, duplicateMode update
    then: style Growth/manual, moat Brand unchanged, economicCycle Defensive/manual; updated 1
    test_data:
      input: { style: Growth, moat: "", economic_cycle: Defensive }
      expected: { style: Growth, moat: Brand, economicCycle: Defensive, cycleSource: manual }
  - id: TC-U-062
    scenario: new list is created with the import and refused if the name exists
    given: U has list "Watching"
    when: POST /imports { newListName "Swing study" }; then POST /imports { newListName "watching" }
    then: first 200 with targetList.name "Swing study"; second 409 list_name_taken and nothing saved
    test_data:
      input: ["Swing study", "watching"]
      expected: [200, "409 list_name_taken"]
  - id: TC-U-063
    scenario: a stock saved between preview and confirm becomes a duplicate
    given: preview showed NVDA as new; then U adds NVDA by hand
    when: POST /imports with duplicateMode skip
    then: created 0 for NVDA, skipped 1; no 409, no second NVDA
    test_data:
      input: NVDA
      expected: { created: 0, skipped: 1 }
  - id: TC-U-064
    scenario: all rows invalid
    given: file with 3 error rows
    when: POST /imports
    then: 422 nothing_to_import; no list created when newListName was given
    test_data:
      input: { rows: 3 errors, newListName: "Temp" }
      expected: { status: 422, listsCreated: 0 }
  - id: TC-U-065
    scenario: stocks already in the target list are not counted twice
    given: AAPL already in L
    when: import AAPL (skip) and MSFT (new) into L
    then: addedToList 1; L has AAPL and MSFT once each
    test_data:
      input: [AAPL, MSFT]
      expected: { addedToList: 1, listSize: 2 }
  - id: TC-U-066
    scenario: target list of another user
    given: list L owned by U; V signed in
    when: V POST /imports { targetListId L }
    then: 404 not_found; nothing saved for V or U
    test_data:
      input: { targetListId: L }
      expected: 404
```

### T-007 — Web foundation

```yaml
- title: Add the API client, shadcn components, toasts, routes and data-aware breadcrumb
- description: >
  In apps/web: add @investhesis/domain and zod; `lib/api-client.ts` (JSON + multipart, /api
  prefix, problem+json → ApiError { status, code, detail, errors, existingStockId? }); add the
  shadcn components listed in ux-design.md (re-apply the `@/lib/utils` import fix); mount the
  sonner Toaster in AppLayout; register routes /stocks/new, /stocks/:id/edit, /lists/:id (lazy,
  placeholders until their tasks); extend RouteHandle.crumb to (params, data) so crumbs can show a
  ticker or list name (design.md §Web, ux-design.md §Shared patterns).
- agent: react-vite-developer
- depends_on: [T-002]
- status: done
- size: M
```

#### Acceptance criteria

- [ ] Every component named in ux-design.md's install list exists under `src/components/ui/` and imports `cn` from `@/lib/utils`
- [ ] The new routes render and appear correctly in the breadcrumb; existing router tests still pass
- [ ] `api-client` has unit tests for success, 204, problem responses, network failure and multipart
- [ ] If User Auth T-003 is already in, the existing bearer header and 401 → refresh → retry behaviour still pass their tests, and multipart bodies are `FormData` so the retry can resend them
- [ ] `pnpm build` produces separate chunks for the new views

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-070
    scenario: problem response becomes an ApiError
    given: fetch stub returns 409 application/problem+json { code stock_exists, existingStockId "A" }
    when: api.post("/stocks", body)
    then: rejects with ApiError status 409, code stock_exists, existingStockId "A"
    test_data:
      input: { status: 409, body: { code: stock_exists, existingStockId: A } }
      expected: "ApiError(409, stock_exists, A)"
  - id: TC-U-071
    scenario: requests are prefixed with /api and send JSON
    given: fetch spy
    when: api.patch("/stocks/1", { moat: null })
    then: fetch called with "/api/stocks/1", method PATCH, content-type application/json, body {"moat":null}
    test_data:
      input: { moat: null }
      expected: "PATCH /api/stocks/1"
  - id: TC-U-072
    scenario: 204 resolves to undefined
    given: fetch stub returns 204
    when: api.delete("/lists/1")
    then: resolves undefined without parsing a body
    test_data:
      input: 204
      expected: undefined
  - id: TC-U-073
    scenario: network failure becomes ApiError network
    given: fetch rejects with TypeError
    when: api.get("/stocks")
    then: rejects with ApiError status 0, code network_error
    test_data:
      input: TypeError
      expected: "ApiError(0, network_error)"
  - id: TC-U-074
    scenario: crumb can use loader data
    given: route /stocks/:id with crumb (params, data) => data.ticker and loader returning { ticker "NVDA" }
    when: navigate to /stocks/abc
    then: breadcrumb shows "Stocks › NVDA"
    test_data:
      input: /stocks/abc
      expected: "Stocks › NVDA"
```

### T-008 — Stocks table and stock detail pages

```yaml
- title: Build the stocks table page and the stock detail page
- description: >
  Implement per ux-design.md §Stocks and §Stock detail: loader-driven sortable table with empty
  state and sticky ticker column on phones; detail page with identity line, classification
  description list with Default badges, list membership add (Popover + Command) and remove with
  Undo toast, Edit link and Delete AlertDialog. Uses api-client and React Router loaders/actions
  (ADR-008). Covers FR-007, FR-008, FR-012 (from the stock side), NFR-003, NFR-007, NFR-008.
- agent: react-vite-developer
- depends_on: [T-007]
- status: done
- size: L
```

#### Acceptance criteria

- [ ] Table columns, sorting, aria-sort and caption match ux-design.md §Stocks
- [ ] Rendering and re-sorting 200 stocks takes under 200 ms in a jsdom benchmark test (NFR-003)
- [ ] At 360 px width there is no page-level horizontal scroll (Playwright check added in T-013)
- [ ] Delete flow: AlertDialog focuses Cancel, confirm calls DELETE then navigates to /stocks with a toast
- [ ] All TC-U cases below pass with a stubbed api-client

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-080
    scenario: default sort by ticker, toggle on click
    given: stocks MSFT, AAPL, PTTEP
    when: render /stocks; click "Sort by Ticker"
    then: order AAPL, MSFT, PTTEP with aria-sort ascending; after click PTTEP, MSFT, AAPL, descending
    test_data:
      input: [MSFT, AAPL, PTTEP]
      expected: [[AAPL, MSFT, PTTEP], [PTTEP, MSFT, AAPL]]
  - id: TC-U-081
    scenario: empty state
    given: api returns { items: [] }
    when: render /stocks
    then: "No stocks yet" with links to /stocks/new and /import-export; no table
    test_data:
      input: []
      expected: "empty state with 2 links"
  - id: TC-U-082
    scenario: TH sector shows SET group as secondary text
    given: PTTEP gicsSector Energy, setIndustryGroup Resources
    when: render /stocks
    then: sector cell shows "Energy" and "Resources"
    test_data:
      input: PTTEP
      expected: ["Energy", "Resources"]
  - id: TC-U-083
    scenario: default badge only on defaulted lenses
    given: stock with economicCycle Sensitive, lensSources.economicCycle default, style Growth manual
    when: render /stocks/:id
    then: one "Default" badge, next to Economic cycle
    test_data:
      input: { economicCycle: default, style: manual }
      expected: "1 Default badge"
  - id: TC-U-084
    scenario: add to list offers only lists the stock is not in
    given: lists Core (contains stock), Watching, Swing
    when: open "Add to list"
    then: options Watching and Swing; choosing Watching calls POST /lists/Watching/stocks
    test_data:
      input: { lists: [Core*, Watching, Swing] }
      expected: { options: [Watching, Swing], call: "POST /lists/{Watching}/stocks" }
  - id: TC-U-085
    scenario: remove from list with undo
    given: stock in Core
    when: click "Remove from Core holdings", then toast Undo
    then: DELETE /lists/Core/stocks/S, then POST /lists/Core/stocks { stockId S }
    test_data:
      input: Core
      expected: ["DELETE", "POST"]
  - id: TC-U-086
    scenario: unknown stock id
    given: api GET /stocks/x returns 404
    when: navigate to /stocks/x
    then: RouteError shows not found with a link to /stocks
    test_data:
      input: x
      expected: "not found + link"
```

### T-009 — Stock form for add and edit

```yaml
- title: Build the shared stock form for adding and editing stocks
- description: >
  One StockForm (features/stocks) with create and edit modes per ux-design.md §Add stock and
  §Edit stock, plus TagInput for themes. Market drives exchange, index and SET group options and
  the currency text; economic cycle shows the default from the sector via resolveEconomicCycle;
  position disabled without chain name; "Not set" maps to null; client validation with the
  domain StockInput/StockPatch schemas; server errors mapped to fields by path; 409 stock_exists
  alert linking to the existing stock. Pages /stocks/new and /stocks/:id/edit with actions.
  Covers FR-001–FR-006, FR-014, NFR-007, NFR-008.
- agent: react-vite-developer
- depends_on: [T-007]
- status: done
- size: L
```

#### Acceptance criteria

- [ ] All fields, groupings and responsive columns match ux-design.md §Add stock
- [ ] Every control has a label; required fields have aria-required; errors are linked with aria-describedby
- [ ] After a failed submit, focus moves to the first invalid field (or the form alert for 409/5xx)
- [ ] Edit mode shows market and ticker as text, hides the Lists card, sends only changed fields
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-090
    scenario: switching market resets dependent fields
    given: form with market US, exchange NASDAQ, index S&P 500 checked
    when: choose market TH
    then: exchange empty with options SET, mai; index options SET50, SET100 unchecked; currency text THB; SET industry group visible
    test_data:
      input: { from: US, to: TH }
      expected: { exchangeOptions: [SET, mai], indexOptions: [SET50, SET100], currency: THB }
  - id: TC-U-091
    scenario: economic cycle default shown and overridden
    given: create form, cycle not set
    when: choose sector Utilities; then choose cycle Cyclical
    then: cycle shows Defensive with Default badge; after choosing, Cyclical with no badge; submitted body has economicCycle "Cyclical"
    test_data:
      input: [Utilities, Cyclical]
      expected: ["Defensive + Default", "Cyclical, no badge"]
  - id: TC-U-092
    scenario: client validation blocks submit
    given: empty form
    when: click Save
    then: errors on market, ticker, exchange, name; no API call; focus on Market
    test_data:
      input: {}
      expected: { errors: [market, ticker, exchange, name], apiCalls: 0 }
  - id: TC-U-093
    scenario: duplicate stock alert
    given: api POST /stocks rejects 409 stock_exists existingStockId A
    when: submit valid AAPL
    then: alert "AAPL (US) is already saved." with link to /stocks/A
    test_data:
      input: AAPL
      expected: "alert + link /stocks/A"
  - id: TC-U-094
    scenario: TagInput behaviour
    given: themes empty
    when: type "AI" Enter, "ai" Enter, "EV," then Backspace in empty input
    then: tags after each step [AI], [AI], [AI, EV], [AI]
    test_data:
      input: ["AI⏎", "ai⏎", "EV,", "⌫"]
      expected: [[AI], [AI], [AI, EV], [AI]]
  - id: TC-U-095
    scenario: edit sends only changed fields and null for cleared ones
    given: edit form for stock with moat Brand, style Value
    when: set moat "Not set", leave the rest, Save
    then: PATCH body equals { moat: null }
    test_data:
      input: { moat: "Not set" }
      expected: { moat: null }
  - id: TC-U-096
    scenario: server field errors map to fields
    given: api rejects 400 validation_failed errors [{ path "valueChain", message "required" }]
    when: submit
    then: Value chain field shows "required" and has aria-invalid
    test_data:
      input: valueChain
      expected: "field error shown"
```

### T-010 — Lists pages

```yaml
- title: Build the lists page and the list detail page
- description: >
  Implement per ux-design.md §Lists and §List detail: lists table with counts and row actions,
  create/rename Dialog, delete AlertDialog, empty state; list detail with the shared stock table,
  add stock (Popover + Command over saved stocks not in the list), remove with Undo, rename and
  delete, and "Import into it" linking to /import-export?listId=. Covers FR-009–FR-013, NFR-007,
  NFR-008.
- agent: react-vite-developer
- depends_on: [T-007, T-008]
- status: done
- size: M
```

#### Acceptance criteria

- [ ] Screens and states match ux-design.md §Lists and §List detail
- [ ] Dialogs trap focus, close on Esc and return focus to their trigger
- [ ] The stock table component from T-008 is reused, not copied
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-100
    scenario: create list success
    given: no lists
    when: New list → type "Core holdings" → Create
    then: POST /lists { name "Core holdings" }; dialog closes; toast; row appears after revalidation
    test_data:
      input: "Core holdings"
      expected: "row Core holdings, 0"
  - id: TC-U-101
    scenario: duplicate name shows a field error and keeps the dialog open
    given: api rejects 409 list_name_taken
    when: Create "watching"
    then: field error "A list with this name already exists."; dialog stays open; focus on Name
    test_data:
      input: watching
      expected: "field error, dialog open"
  - id: TC-U-102
    scenario: delete list message mentions stocks stay
    given: list Core holdings with 22 stocks
    when: choose Delete…
    then: AlertDialog text "Delete Core holdings? Its 22 stocks stay saved."; confirm calls DELETE
    test_data:
      input: Core holdings
      expected: "DELETE /lists/{id}"
  - id: TC-U-103
    scenario: add stock picker excludes members and filters by text
    given: saved AAPL, MSFT, PTTEP; list has AAPL
    when: open Add stock, type "pt"
    then: only PTTEP shown; selecting it calls POST /lists/{id}/stocks
    test_data:
      input: pt
      expected: [PTTEP]
  - id: TC-U-104
    scenario: empty list state
    given: list with no stocks
    when: render /lists/:id
    then: "This list is empty." with Add stock and a link to /import-export?listId={id}
    test_data:
      input: empty list
      expected: "empty state + link"
```

### T-011 — Import wizard

```yaml
- title: Build the three-step import wizard on the import-export page
- description: >
  Implement per ux-design.md §Import: template download links, drop zone with file input,
  file-level error alerts by problem code, preview with counts, status filter and scrollable
  table, target list select with "New list…", duplicate mode (shown only when duplicates > 0,
  otherwise skip is sent), confirm with the same File, summary with counts, list link and the
  error-rows CSV built in the browser (FR-023), ?listId= pre-selection, live-region status and
  focus management. Export card stays "Coming later". Covers FR-015–FR-024 (UI side), NFR-007,
  NFR-008.
- agent: react-vite-developer
- depends_on: [T-007]
- status: done
- size: L
```

#### Acceptance criteria

- [ ] All three steps, their states and copy match ux-design.md §Import
- [ ] Each file-level problem code maps to its message: file_too_large, file_unsupported, file_too_many_rows, file_empty, file_missing_headers (names the headers)
- [ ] The confirm request re-sends the same File object chosen in step 1
- [ ] The error CSV has the original columns plus an `errors` column, starts with a UTF-8 BOM, and quotes per RFC 4180
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-110
    scenario: preview shows counts and filters rows
    given: preview response counts { new 31, duplicate 3, error 1 }
    when: choose a file; then select filter Errors
    then: badges "31 new", "3 duplicate", "1 error"; table shows only the error row
    test_data:
      input: counts above
      expected: "1 row visible"
  - id: TC-U-111
    scenario: missing headers message
    given: preview rejects 422 file_missing_headers errors [ticker, name]
    when: choose a file
    then: stays on step 1; alert "Missing columns: ticker, name" with role alert
    test_data:
      input: [ticker, name]
      expected: "Missing columns: ticker, name"
  - id: TC-U-112
    scenario: confirm disabled until a list is chosen; duplicates option hidden when none
    given: preview with 5 new, 0 duplicate
    when: render step 2
    then: Duplicates group absent; Import button disabled; after choosing a list, "Import 5 stocks" enabled and sends duplicateMode skip
    test_data:
      input: { new: 5, duplicate: 0 }
      expected: { duplicatesGroup: absent, sent: { duplicateMode: skip } }
  - id: TC-U-113
    scenario: all rows are errors
    given: preview counts { new 0, duplicate 0, error 4 }
    when: render step 2
    then: Import disabled with "Nothing to import — fix the file and choose it again"
    test_data:
      input: { error: 4 }
      expected: "disabled + message"
  - id: TC-U-114
    scenario: new list name conflict stays on step 2
    given: confirm rejects 409 list_name_taken
    when: choose "New list…", name "Watching", Import
    then: field error on new list name; still step 2; file retained
    test_data:
      input: Watching
      expected: "step 2, field error"
  - id: TC-U-115
    scenario: summary and error CSV
    given: confirm returns created 31, skipped 3, updated 0, failed 1, errorRows [row 4 XYZ JP]
    when: step 3 renders; click Download error rows
    then: text "31 created · 3 skipped · 0 updated · 1 failed"; CSV blob first line "﻿row,ticker,market,name,...,errors"
    test_data:
      input: summary above
      expected: "summary text + CSV with 1 data row"
  - id: TC-U-116
    scenario: listId query pre-selects the target list
    given: URL /import-export?listId=L where L is "Core holdings"
    when: reach step 2
    then: Add to list shows "Core holdings"
    test_data:
      input: ?listId=L
      expected: "Core holdings selected"
```

### T-012 — Design test cases — stock lists

```yaml
- title: Design test cases — stock lists
- description: >
  Using the software-tester-design skill, produce structured TC-xxx test cases covering
  all test levels: unit boundaries, API (happy path + error paths + auth), frontend
  component, and E2E flows. Run Steps 0–4 (SUT definition → business flow → field specs
  → scenarios → test data). Output must be in TC-xxx format for software-tester-automation.
  Inputs: requirements.md, design.md, ux-design.md of this slice. Must cover every FR and NFR,
  the two-user isolation proof (NFR-004), the import fixtures list from T-005, the 360 px and
  keyboard-only E2E paths, and contrast checks for the destructive button and badge flagged in
  ux-design.md. Save as docs/features/stock-lists/v1.0/test-cases.md.
- agent: software-tester-design
- depends_on: []
- status: done
- size: M
```

#### Acceptance criteria

- [ ] SUT definition documented
- [ ] TC-xxx cases cover happy path, boundaries, error paths, and business rules
- [ ] Each TC includes Level, Input, Expected Output, Preconditions, and Mock needed
- [ ] A traceability table maps every FR-001–FR-025 and NFR-001–NFR-009 to at least one TC

**Notes** — Runs in parallel with engineering tasks; depends only on requirements/design, not on code.

### T-013 — Automate tests — stock lists

```yaml
- title: Automate tests — stock lists
- description: >
  Using the software-tester-automation skill, convert the TC-xxx cases from T-012 into
  runnable scripts at the appropriate levels (Unit, API, Frontend Component, E2E).
  Run the full suite against the implementation. Adds Playwright to apps/web (or an e2e
  workspace), or extends User Auth T-008's setup, for the end-to-end flows against the real API
  and local Supabase, signed in as a seeded `@example.test` account (User Auth T-009): add stock,
  manage lists, import CSV and XLSX, phone width 360 px, keyboard-only import, axe contrast
  checks in light and dark themes. New suites join the test gate.
- agent: software-tester-automation
- depends_on: [T-001, T-002, T-003, T-004, T-005, T-006, T-007, T-008, T-009, T-010, T-011, T-012]
- status: done
- size: L
```

#### Acceptance criteria

- [ ] All TC-* from T-012 automated and passing
- [ ] Coverage >= 85% lines for `packages/domain` and `apps/api/src/modules/{stocks,lists,imports}`; >= 70% for `apps/web/src/features`
- [ ] Test report produced with pass/fail per TC-id
- [ ] E2E runs with one root command documented in CLAUDE.md

**Notes** — Report "T-013 done" with the full test report when all TCs pass. Any contrast failure found here goes back to the owning web task as a fix.

## Status Legend

| Status | Changed By | Meaning |
|--------|-----------|---------|
| `backlog` | Orchestrator | Ready, waiting to be picked up |
| `doing` | Orchestrator / Agent | Agent actively working |
| `blocked` | Agent | Stuck, needs human intervention |
| `test` | Agent | Dev done, needs testing |
| `review` | Agent / Tester | Human must review before advancing |
| `done` | Human | Approved and complete |
