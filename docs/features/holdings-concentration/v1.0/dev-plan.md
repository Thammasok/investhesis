---
version: 1.0
status: active
date: 2026-11-23
requires: design.md
ux-design: ux-design.md
---

# Development Plan: Holdings and Concentration

Builds [requirements.md](requirements.md) per [design.md](design.md) and
[ux-design.md](ux-design.md). Every engineering task follows the test gate (green before, green
after, then human review). The gate is the **Investhesis gate** in `CLAUDE.md` (Tests and the
Investhesis gate), run from the repo root: `pnpm db:start && pnpm db:reset`, `pnpm test:supabase`,
`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (with `E2E_WEB_PORT`
when 5173 is taken). `.claude/rules/test-gate.md` still lists Pacta's commands (carried work in
`docs/todo.md`).

**Before T-001.** The baseline gate needs a clean `main`. On 2026-11-23 `main` had an uncommitted
change that turns Add stock and Import into route-backed dialogs, with 39 stock-lists E2E tests
still to update for it. That change is finished and committed (or set aside) before this plan
starts, so the baseline is green.

**Test ids.** This slice uses the 400 range: `TC-U-4xx` in the task contracts below, and
`TC-A-4xx`, `TC-C-4xx`, `TC-E-4xx` from [T-009](#t-009--design-test-cases--holdings-and-concentration).
Every test title starts with its id.

## Summary

- **Total tasks** — 10 (8 engineering, 1 test design, 1 test automation)
- **Estimated effort** — about 9 days of agent work (S ≈ 0.4 day, M ≈ 0.75 day, L ≈ 1.5 days);
  about 5 days elapsed with the API and web lanes in parallel
- **Critical path** — [T-002](#t-002--domain-holding-settings-and-grouping) →
  [T-005](#t-005--holding-in-the-stock-form-and-the-held-column) →
  [T-007](#t-007--concentration-page) → [T-008](#t-008--concentration-settings-dialog) →
  [T-010](#t-010--automate-tests--holdings-and-concentration)
- **Parallel lanes** — [T-001](#t-001--database-holdings-and-settings-tables) runs alongside
  T-002. API: T-003 and T-004 need T-001 and T-002. Web: T-005 to T-008 need only T-002; they
  build against the contracts in `design.md` with `StubApi`, and T-010 proves them against the
  real API. [T-009](#t-009--design-test-cases--holdings-and-concentration) starts at once.

## Tasks

### T-001 — Database: holdings and settings tables

```yaml
- title: Add app.holdings and app.user_settings with typings and drift coverage
- description: >
  One Supabase CLI migration (supabase/migrations/*_holdings.sql) creating app.holdings and
  app.user_settings exactly as design.md §Data Model: numeric(18,4) shares (> 0) and average_cost
  (>= 0), cost_currency USD|THB, composite FK (stock_id, user_id) → app.stocks (id, user_id) on
  delete cascade, holdings_user index; user_settings with threshold smallint 1..100 default 40,
  usd_thb_rate numeric(18,6) > 0, usd_thb_rate_updated_at, updated_at; RLS enabled with no
  policies on both. Hand-written Drizzle typings in apps/api/src/db/schema/holdings.ts (numeric
  as string), exported from the schema index and covered by schema.drift.test.ts. Extend the
  database-exposure checks in scripts/ (as TC-A-106 does) to both tables. Covers FR-001, FR-002,
  FR-011, NFR-003.
- agent: software-engineer-backend
- depends_on: []
- status: done
- size: S
```

#### Acceptance criteria

- [ ] `pnpm db:reset` applies the migration on a fresh stack and on one with Stock Lists data
- [ ] `schema.drift.test.ts` passes with both new tables in the comparison
- [ ] The exposure check proves `anon` and `authenticated` cannot read either table through the Data API
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-400
    scenario: a holding belongs to its stock and goes with it
    given: user U with stock S and a holding on S
    when: delete S
    then: the holding row is gone
    test_data:
      input: { stock: S, holding: { shares: "10", average_cost: "1.5", cost_currency: USD } }
      expected: { holdingsForS: 0 }
  - id: TC-U-401
    scenario: a holding cannot point at another user's stock
    given: user U's stock S; user V
    when: insert holding (stock_id S, user_id V)
    then: foreign key violation (23503)
    test_data:
      input: { stock_id: S, user_id: V }
      expected: 23503
  - id: TC-U-402
    scenario: database checks guard the amounts
    given: user U's stock S
    when: insert shares 0; insert average_cost -1; insert cost_currency EUR
    then: each is a check violation (23514)
    test_data:
      input: [{ shares: "0" }, { average_cost: "-1" }, { cost_currency: EUR }]
      expected: [23514, 23514, 23514]
  - id: TC-U-403
    scenario: settings bounds
    given: user U
    when: insert threshold 0; threshold 101; usd_thb_rate 0; threshold 100 with rate 36.25
    then: three check violations, the last row inserts
    test_data:
      input: [{ t: 0 }, { t: 101 }, { rate: "0" }, { t: 100, rate: "36.250000" }]
      expected: [23514, 23514, 23514, ok]
```

**Notes** — Constraint tests go in a `*.constraints.test.ts` like Stock Lists, with random user ids per file.

### T-002 — Domain: holding, settings and grouping

```yaml
- title: Add HoldingInput, SettingsPatch, CONCENTRATION_LENSES and groupConcentration to @investhesis/domain
- description: >
  In packages/domain per design.md §Shared vocabulary and rules: HoldingInput and SettingsPatch
  (Zod, decimal strings only, unknown keys rejected with the key as path, messages in
  messages.ts naming the limit), CONCENTRATION_LENSES (key, label, kind, getter) in FR-006
  order, and the pure groupConcentration({ stocks, lens, usdThbRate, threshold }) returning
  { groups, leftOut, multiValue } with scaled-BigInt arithmetic (ADR-003), exact flag test by
  cross-multiplication (ADR-007), "Not set" last and never flagged, valueShare null on a zero
  total. Also a small decimal helper module (parse a decimal string to scaled BigInt, format a
  scaled BigInt as a fixed-decimal string, percent to one decimal half up) used by the web for
  display. Erasable syntax only; relative imports end in .ts. Covers FR-002, FR-003, FR-006 to
  FR-011, NFR-005.
- agent: software-engineer-backend
- depends_on: []
- status: done
- size: M
```

#### Acceptance criteria

- [ ] `pnpm --filter @investhesis/domain test:coverage` stays at or above 95% lines
- [ ] No `number` arithmetic on money, shares or the rate anywhere in the new code (review check)
- [ ] `groupConcentration` on 200 stocks with a multi-value lens runs in under 20 ms in a Vitest timing test
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-410
    scenario: HoldingInput accepts decimal strings and nulls
    given: HoldingInput
    when: parse { shares "120.5", averageCost "412.33", costCurrency USD }; parse {}; parse { shares null, averageCost "0" }
    then: all succeed; averageCost "0" is allowed
    test_data:
      input: [{ shares: "120.5", averageCost: "412.33", costCurrency: USD }, {}, { shares: null, averageCost: "0" }]
      expected: [ok, ok, ok]
  - id: TC-U-411
    scenario: HoldingInput boundaries
    given: HoldingInput
    when: shares "0"; shares "1.23456"; shares "123456789012345"; averageCost "-1"; shares 10 (a number); costCurrency EUR; extra key "price"
    then: each fails with the path shares, shares, shares, averageCost, shares, costCurrency, price
    test_data:
      input: [{ shares: "0" }, { shares: "1.23456" }, { shares: "123456789012345" }, { averageCost: "-1" }, { shares: 10 }, { costCurrency: EUR }, { price: "1" }]
      expected: [shares, shares, shares, averageCost, shares, costCurrency, price]
  - id: TC-U-412
    scenario: largest allowed values pass
    given: HoldingInput
    when: shares "99999999999999.9999"; averageCost "0.0001"
    then: success
    test_data:
      input: { shares: "99999999999999.9999", averageCost: "0.0001" }
      expected: ok
  - id: TC-U-413
    scenario: SettingsPatch bounds
    given: SettingsPatch
    when: threshold 1, 100, 0, 101, 40.5; usdThbRate "36.250000", null, "0", "1.1234567", 36.25 (a number)
    then: 1, 100, "36.250000", null pass; the others fail on their field
    test_data:
      input: [1, 100, 0, 101, 40.5, "36.250000", null, "0", "1.1234567", 36.25]
      expected: [ok, ok, fail, fail, fail, ok, ok, fail, fail, fail]
  - id: TC-U-420
    scenario: count shares for a single-value lens, Not set last and never flagged
    given: A gicsSector IT, B IT, C Energy, D null; threshold 40
    when: groupConcentration(lens gicsSector)
    then: IT 2 / 50.0% countFlag true; Energy 1 / 25.0% false; Not set 1 / 25.0% false and last
    test_data:
      input: { stocks: [A:IT, B:IT, C:Energy, D:null], threshold: 40 }
      expected: [{ IT: 2, share: "50.0", flag: true }, { Energy: 1, share: "25.0", flag: false }, { NotSet: 1, share: "25.0", flag: false }]
  - id: TC-U-421
    scenario: multi-value lens counts a stock in each of its groups
    given: A themes [AI, EV], B [AI], C []
    when: groupConcentration(lens themes)
    then: AI 2 / 66.7%, EV 1 / 33.3%, Not set 1 / 33.3%; multiValue true
    test_data:
      input: { A: [AI, EV], B: [AI], C: [] }
      expected: { AI: "66.7", EV: "33.3", NotSet: "33.3", multiValue: true }
  - id: TC-U-422
    scenario: value at cost converts USD with the rate
    given: A US held shares "10" averageCost "100" USD; B TH held shares "1000" averageCost "20.5" THB; rate "36.25"
    when: groupConcentration(lens market)
    then: US value 36250.00 THB / 63.9%; TH 20500.00 / 36.1%
    test_data:
      input: { A: { shares: "10", averageCost: "100", costCurrency: USD }, B: { shares: "1000", averageCost: "20.5", costCurrency: THB }, rate: "36.25" }
      expected: { US: { value: "36250.00", share: "63.9" }, TH: { value: "20500.00", share: "36.1" } }
  - id: TC-U-423
    scenario: stocks left out of value shares
    given: A USD holding with no rate; B held with shares null; C not held; D THB holding "1" × "5"
    when: groupConcentration with usdThbRate null
    then: leftOut { needsRate [A], noAmount [B], notHeld [C] }; total value 5.00 from D only; counts still include A, B, C, D
    test_data:
      input: { rate: null }
      expected: { needsRate: [A], noAmount: [B], notHeld: [C], totalValue: "5.00" }
  - id: TC-U-424
    scenario: the flag uses the exact share, not the shown one
    given: group X value 3996 THB, group Y value 6004 THB; threshold 40
    when: groupConcentration(measure value)
    then: X shown "40.0" with valueFlag false; Y "60.0" flagged
    test_data:
      input: { X: "3996", Y: "6004", threshold: 40 }
      expected: { X: { share: "40.0", flag: false }, Y: { share: "60.0", flag: true } }
  - id: TC-U-425
    scenario: a share equal to the threshold is flagged
    given: 2 of 5 stocks in group X; threshold 40
    when: groupConcentration(measure count)
    then: X 40.0% countFlag true
    test_data:
      input: { X: 2, total: 5, threshold: 40 }
      expected: { share: "40.0", flag: true }
  - id: TC-U-426
    scenario: a zero total value has no value shares
    given: two held THB stocks with averageCost "0"
    when: groupConcentration
    then: valueShare null and valueFlag false for every group
    test_data:
      input: { costs: ["0", "0"] }
      expected: { valueShare: null, valueFlag: false }
  - id: TC-U-427
    scenario: decimal sums are exact
    given: held THB stocks with shares "1" and costs "0.1" and "0.2", same group
    when: groupConcentration
    then: the group's value is "0.30", not a float approximation
    test_data:
      input: ["0.1", "0.2"]
      expected: "0.30"
```

**Notes** — `CONCENTRATION_LENSES` labels are English UI copy kept beside the validation messages, ready for i18n. The function sorts by count; the web re-sorts by value for the value measure.

### T-003 — Stocks API: holding on every stock

```yaml
- title: Read and write a holding through the stocks module, and keep it out of the logs
- description: >
  Per design.md §Changes to the stocks module: CreateBody and PatchBody take `holding` out
  before StockInput / StockPatch parse the rest, and parse it with HoldingInput (paths keep the
  holding. prefix); POST writes stock, memberships and holding in one transaction; PATCH holding
  omitted = unchanged, null = delete, object = replace (costCurrency defaulting to the stock's
  currency), a body with only holding is valid; the repository `columns` gain `holding` as a
  correlated json subquery so every returned Stock carries it; StockOut gains
  holding: HoldingOut.nullable(); OpenAPI shows it. Import insert and update never touch
  holdings. Per design.md §Logging: REDACT_PATHS add averageCost, usdThbRate, holding and drop
  costBasis; an `err` serializer keeps code, constraint, table, message of a Postgres error and
  drops detail and where. Update every whole-stock assertion in the API tests for
  `holding: null`. Covers FR-001 to FR-004, NFR-002, NFR-003, NFR-004.
- agent: software-engineer-backend
- depends_on: [T-001, T-002]
- status: doing
- size: L
```

#### Acceptance criteria

- [ ] `GET /stocks`, `GET /stocks/{id}`, `POST /stocks`, `PATCH /stocks/{id}` and the import's returned rows all carry `holding`
- [ ] A two-user test shows V cannot read, set or clear U's holding (404) through POST listIds tricks, PATCH or GET
- [ ] p95 of 50 sequential `PATCH /stocks/{id} { holding }` calls is under 500 ms (NFR-002), measured in `stocks.latency.test.ts`
- [ ] A captured-log test posts a holding and a settings rate and finds none of the values; a forced check violation on `app.holdings` is logged without `detail`
- [ ] `pnpm --filter @investhesis/api test:coverage` stays at or above 85% for `src/modules/stocks`
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-430
    scenario: create a held stock in one call
    given: user U, list L
    when: POST /stocks { ticker NVDA, market US, exchange NASDAQ, name NVIDIA, listIds [L], holding { shares "120.5", averageCost "412.33" } }
    then: 201; holding { shares "120.5000", averageCost "412.3300", costCurrency USD }; in L
    test_data:
      input: { holding: { shares: "120.5", averageCost: "412.33" } }
      expected: { status: 201, holding: { shares: "120.5000", averageCost: "412.3300", costCurrency: USD } }
  - id: TC-U-431
    scenario: a bad holding saves nothing
    given: user U
    when: POST /stocks with holding { shares "0" }
    then: 400 validation_failed with path holding.shares; no stock was created
    test_data:
      input: { holding: { shares: "0" } }
      expected: { status: 400, path: holding.shares, stocksAfter: 0 }
  - id: TC-U-432
    scenario: patch holding semantics
    given: U's stock S (TH, THB) not held
    when: PATCH { holding: {} }; then PATCH { holding: { shares "50" } }; then PATCH { name "X" }; then PATCH { holding: null }
    then: held with nulls and costCurrency THB; shares "50.0000" averageCost null; holding unchanged by the name patch; holding null
    test_data:
      input: [{ holding: {} }, { holding: { shares: "50" } }, { name: X }, { holding: null }]
      expected: [{ shares: null, costCurrency: THB }, { shares: "50.0000", averageCost: null }, unchanged, null]
  - id: TC-U-433
    scenario: holding is not a lens and cannot sneak into StockPatch
    given: U's stock S
    when: PATCH { holding: { shares "1" }, ticker "Y" }
    then: 400 with path ticker; holding not written
    test_data:
      input: { holding: { shares: "1" }, ticker: Y }
      expected: { status: 400, path: ticker, holding: null }
  - id: TC-U-434
    scenario: an import update keeps the holding
    given: U's held stock US/AAPL with shares "10"
    when: POST /imports with an AAPL row and duplicateMode update
    then: AAPL's lenses updated; holding still shares "10.0000"
    test_data:
      input: { duplicateMode: update }
      expected: { shares: "10.0000" }
  - id: TC-U-435
    scenario: another user's stock
    given: U's stock S; user V
    when: V sends PATCH /stocks/S { holding: { shares "1" } } and GET /stocks/S
    then: both 404 not_found; U's holding unchanged
    test_data:
      input: { as: V }
      expected: [404, 404]
```

**Notes** — The json subquery returns `numeric` as text inside JSON; keep it a string end to end (no `::float`).

### T-004 — Settings API

```yaml
- title: Add the settings module with GET and PATCH /settings
- description: >
  apps/api/src/modules/settings/ (routes → service → repository, as the other modules) per
  design.md §API Contracts › Settings: GET answers the stored row or the defaults
  { concentrationThreshold 40, usdThbRate null, usdThbRateUpdatedAt null } without writing;
  PATCH validates with SettingsPatch and upserts on user_id; usd_thb_rate_updated_at is set when
  a rate is saved and set to null when it is cleared; scoped by requireIdentity. OpenAPI shows
  both routes with bearerAuth. Covers FR-011, NFR-003, NFR-004.
- agent: software-engineer-backend
- depends_on: [T-001, T-002]
- status: doing
- size: S
```

#### Acceptance criteria

- [ ] Both routes appear in `/openapi.json` and need a bearer token (401 without)
- [ ] Two users' settings are independent (a test changes U's and reads V's defaults)
- [ ] `pnpm --filter @investhesis/api test:coverage` covers the new module at or above 85%
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-440
    scenario: defaults without a row
    given: user U with no settings row
    when: GET /settings
    then: 200 { concentrationThreshold 40, usdThbRate null, usdThbRateUpdatedAt null }; still no row
    test_data:
      input: {}
      expected: { concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null, rows: 0 }
  - id: TC-U-441
    scenario: upsert and partial patch
    given: user U with no row
    when: PATCH { usdThbRate "36.25" }; then PATCH { concentrationThreshold 35 }
    then: rate "36.250000" with a date; then threshold 35 and the rate unchanged
    test_data:
      input: [{ usdThbRate: "36.25" }, { concentrationThreshold: 35 }]
      expected: [{ usdThbRate: "36.250000", threshold: 40 }, { usdThbRate: "36.250000", threshold: 35 }]
  - id: TC-U-442
    scenario: clearing the rate clears its date
    given: U has rate "36.25" saved
    when: PATCH { usdThbRate: null }
    then: usdThbRate null, usdThbRateUpdatedAt null
    test_data:
      input: { usdThbRate: null }
      expected: { usdThbRate: null, usdThbRateUpdatedAt: null }
  - id: TC-U-443
    scenario: invalid values
    given: user U
    when: PATCH { concentrationThreshold 0 }; PATCH { usdThbRate 36.25 } (number); PATCH { theme "dark" }
    then: 400 validation_failed with paths concentrationThreshold, usdThbRate, theme
    test_data:
      input: [{ concentrationThreshold: 0 }, { usdThbRate: 36.25 }, { theme: dark }]
      expected: [concentrationThreshold, usdThbRate, theme]
```

**Notes** — Settings have no id, so there is no cross-user 404 case; isolation is proved by reading the other user's defaults.

### T-005 — Holding in the stock form and the Held column

```yaml
- title: Add the holding fields to StockForm and a Held column to StockTable
- description: >
  apps/web per ux-design.md §Holding fields in the stock form and §Held column. Stock gains
  `holding: Holding | null` (types.ts, makeStock default null, StubApi fixtures). StockForm gets
  the Holding card (checkbox, shares, average cost with $/฿ prefix, cost currency radio that
  follows the market until chosen), validated with HoldingInput through the form model
  (holdingShares, holdingAverageCost in FieldName and FIELD_ORDER; splitServerErrors maps
  holding.shares and holding.averageCost); create sends `holding` only when ticked; edit sends the
  whole holding only when it changed, null when unticked. StockTable gets a sortable Held column
  (held first, then shares descending) on /stocks and /lists/:id. Money and shares formatting
  helpers in lib/ (Intl.NumberFormat on the decimal string, via the domain decimal helper).
  Covers FR-001 to FR-004.
- agent: react-vite-developer
- depends_on: [T-002]
- status: doing
- size: M
```

#### Acceptance criteria

- [ ] Add stock dialog and Edit stock show the Holding card per ux-design.md, two columns from `md`
- [ ] The existing stock-form, stocks-page and list-detail tests still pass with `holding` added to fixtures
- [ ] `pnpm --filter @investhesis/web test:coverage` stays at or above 70% for `src/features`
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-450
    scenario: unticked sends no holding; ticked sends strings
    given: Add stock dialog with identity filled
    when: save unticked; then tick, type shares "120.5" and cost "412.33", save
    then: first body has no holding key; second has holding { shares "120.5", averageCost "412.33", costCurrency "USD" }
    test_data:
      input: { shares: "120.5", averageCost: "412.33" }
      expected: [no holding, { shares: "120.5", averageCost: "412.33", costCurrency: USD }]
  - id: TC-U-451
    scenario: currency follows the market until chosen
    given: Add stock dialog, Held ticked
    when: choose TH; then choose USD by hand; then switch market to US and back to TH
    then: currency THB after TH; stays USD after the manual pick and the market changes
    test_data:
      input: [TH, pick USD, US, TH]
      expected: [THB, USD, USD, USD]
  - id: TC-U-452
    scenario: client-side errors focus the first holding field
    given: Held ticked
    when: shares "0", cost "1.23456", save
    then: no request; errors under both fields; focus on Shares
    test_data:
      input: { shares: "0", averageCost: "1.23456" }
      expected: { requests: 0, focus: holdingShares }
  - id: TC-U-453
    scenario: a server path lands on its field
    given: POST answers 400 errors [{ path holding.averageCost, message "must have up to 4 decimal places" }]
    when: save
    then: the message shows under Average cost and it has aria-invalid
    test_data:
      input: { path: holding.averageCost }
      expected: averageCost invalid
  - id: TC-U-454
    scenario: edit sends only a changed holding, whole, or null when unticked
    given: Edit NVDA held with shares "120.5", cost "412.33"
    when: change name only; then change shares to "130"; then untick Held
    then: bodies { name } ; { holding { shares "130", averageCost "412.33", costCurrency USD } } ; { holding null }
    test_data:
      input: [name, shares 130, untick]
      expected: [{ name: X }, { holding: { shares: "130", averageCost: "412.33", costCurrency: USD } }, { holding: null }]
  - id: TC-U-455
    scenario: the Held column
    given: NVDA held 120.5, PTTEP held without shares, AAPL not held
    when: render /stocks and sort by Held
    then: NVDA shows Held 120.5, PTTEP Held, AAPL "—" with sr-only "Not held"; order NVDA, PTTEP, AAPL
    test_data:
      input: [NVDA 120.5, PTTEP held, AAPL none]
      expected: [NVDA, PTTEP, AAPL]
```

### T-006 — Holding card and dialog on the stock page

```yaml
- title: Show and edit the holding on the stock page
- description: >
  apps/web per ux-design.md §Holding card and dialog on the stock page: a Holding card above
  Lists (not held / held without amount / held with figures, cost = shares × average cost in the
  cost currency), Mark as held and Edit opening a dialog that reuses the T-005 holding fields,
  Stop holding with an Undo toast that restores the previous holding. The stock detail action
  gains the intents set-holding and clear-holding (PATCH /stocks/{id} { holding }), returning
  { ok: false, message } for problems the user can act on; focus returns to the opener, and to
  Mark as held after Stop holding. Covers FR-001, FR-002, FR-004.
- agent: react-vite-developer
- depends_on: [T-005]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] The card shows each of its three states per ux-design.md, and the dialog's focus rules hold
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-460
    scenario: mark as held with no amounts
    given: stock page of AAPL, not held
    when: Mark as held, Save with empty fields
    then: PATCH body { holding: { shares null, averageCost null, costCurrency "USD" } } (empty fields are null; the dialog always sends the whole holding); card shows Held and "Amount not entered."; toast "AAPL marked as held"
    test_data:
      input: { shares: "", averageCost: "" }
      expected: { body: { holding: { shares: null, averageCost: null, costCurrency: USD } }, card: Held, note: Amount not entered. }
  - id: TC-U-461
    scenario: the card shows cost
    given: NVDA held shares "120.5000", averageCost "412.3300", USD
    when: render /stocks/NVDA
    then: Shares 120.5, Average cost $412.33, Cost $49,685.77
    test_data:
      input: { shares: "120.5000", averageCost: "412.3300" }
      expected: { shares: "120.5", averageCost: "$412.33", cost: "$49,685.77" }
  - id: TC-U-462
    scenario: stop holding and undo
    given: NVDA held as above
    when: Edit, Stop holding, then the toast's Undo
    then: PATCH { holding: null }; card Not held; focus on Mark as held; Undo sends the old holding back and the card shows it again
    test_data:
      input: [stop, undo]
      expected: [{ holding: null }, { holding: { shares: "120.5000", averageCost: "412.3300", costCurrency: USD } }]
  - id: TC-U-463
    scenario: a failed save keeps the dialog
    given: PATCH answers 500
    when: Save in the dialog
    then: dialog stays open with the values and an Alert "Couldn't save the holding. Try again."
    test_data:
      input: { status: 500 }
      expected: dialog open, values kept
```

### T-007 — Concentration page

```yaml
- title: Build /concentration with scope, lens, measure, flags and notes
- description: >
  apps/web/src/features/concentration/ and views/concentration.tsx per ux-design.md
  §Concentration and design.md §Web: concentration-routes.tsx attaches a loader (GET /stocks,
  /lists, /settings in parallel) and an action (intent save-settings) to the lazy view; scope,
  lens and measure live in search params with replace navigation and fall back with a note
  (unknown lens or measure, list id not among the loaded lists); measure value is disabled with
  the reason when nothing in scope can be valued; groupConcentration from @investhesis/domain
  feeds the flagged summary, the group table with share bars and expandable stock links, the
  left-out note (with Set rate, wired in T-008), the multi-value note and the advice note; empty
  states for no stocks and an empty scope; phone layout per the responsive spec. Covers FR-005 to
  FR-010, FR-012 to FR-014, NFR-001, NFR-006, NFR-007.
- agent: react-vite-developer
- depends_on: [T-002, T-005]
- status: backlog
- size: L
```

#### Acceptance criteria

- [ ] Every state wireframed in ux-design.md §Concentration renders, with the copy given there
- [ ] Changing scope, lens or measure with 200 stocks regroups in under 200 ms in a timed test (NFR-001)
- [ ] Router tests cover `/concentration` with and without search params
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-470
    scenario: defaults and the address
    given: stocks in two sectors
    when: open /concentration, then choose Group by Style and Measure Value
    then: starts on All stocks / Sector (GICS) / Count; the address becomes ?scope=all&lens=style&measure=value with history length unchanged
    test_data:
      input: [lens style, measure value]
      expected: "?scope=all&lens=style&measure=value"
  - id: TC-U-471
    scenario: flagged summary and flag badge
    given: 5 stocks, 3 in Information Technology; threshold 40
    when: render count view
    then: summary lists "Information Technology — 60.0%"; that row has "Over 40%"; Not set has no flag
    test_data:
      input: { IT: 3, other: 2, threshold: 40 }
      expected: { summary: ["Information Technology — 60.0%"] }
  - id: TC-U-472
    scenario: value measure unavailable
    given: scope Held with held stocks that have no amounts
    when: render
    then: Value at cost radio disabled with "No held stock in this scope has shares and cost."; count view shown
    test_data:
      input: { held: [noAmount, noAmount] }
      expected: value disabled
  - id: TC-U-473
    scenario: a deleted list in the address
    given: ?scope=<id not in GET /lists>
    when: render
    then: status note "That list no longer exists. Showing all stocks."; scope All stocks
    test_data:
      input: { scope: missing-list-id }
      expected: { scope: all, note: shown }
  - id: TC-U-474
    scenario: left-out note in the value view
    given: one USD holding without a rate, one held stock without shares, two not held
    when: measure value
    then: note names the stock without amounts, says "1 USD holding needs a rate" with a Set rate button, and "2 stocks not held"
    test_data:
      input: { needsRate: 1, noAmount: 1, notHeld: 2 }
      expected: note shown
  - id: TC-U-475
    scenario: expand a group
    given: Energy holds PTTEP and PTT
    when: activate "Show stocks in Energy"
    then: aria-expanded true; links PTTEP and PTT to their stock pages
    test_data:
      input: Energy
      expected: [PTTEP, PTT]
  - id: TC-U-476
    scenario: multi-value note
    given: lens themes
    when: render
    then: the note "A stock with several themes counts in each of them, so the shares add up to more than 100%." is shown; not shown for gicsSector
    test_data:
      input: [themes, gicsSector]
      expected: [shown, hidden]
  - id: TC-U-477
    scenario: no stocks at all
    given: GET /stocks returns []
    when: render
    then: empty card "Nothing to group yet" with Add stock and Import links; no controls
    test_data:
      input: []
      expected: empty state
```

### T-008 — Concentration settings dialog

```yaml
- title: Edit the threshold and the USD to THB rate in a dialog
- description: >
  apps/web per ux-design.md §Concentration settings dialog: opened from the header Settings
  button and from Set rate (focus in the rate field then); threshold with % addon, "1 USD =" rate
  with THB addon, saved date or the no-rate help, Clear rate; validated with SettingsPatch; Save
  submits the route action's save-settings intent (only changed fields, usdThbRate null after
  Clear), closes, toasts "Settings saved", and the page regroups from the revalidated loader;
  errors stay in the dialog; focus returns to the opener. Covers FR-010, FR-011.
- agent: react-vite-developer
- depends_on: [T-007]
- status: backlog
- size: S
```

#### Acceptance criteria

- [ ] The dialog renders per ux-design.md with and without a saved rate
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-480
    scenario: save a rate and see USD join the value
    given: value view with one USD holding left out for the rate
    when: Set rate, type "36.25", Save
    then: PATCH /settings { usdThbRate "36.25" }; toast "Settings saved"; the holding is in the table; the needs-rate note is gone
    test_data:
      input: { usdThbRate: "36.25" }
      expected: { body: { usdThbRate: "36.25" }, needsRate: 0 }
  - id: TC-U-481
    scenario: a new threshold changes the flags
    given: a group at 35.0%; threshold 40
    when: Settings, threshold 35, Save
    then: PATCH { concentrationThreshold 35 }; the group shows "Over 35%" and the summary lists it
    test_data:
      input: { concentrationThreshold: 35 }
      expected: flagged
  - id: TC-U-482
    scenario: invalid values stay in the dialog
    given: dialog open
    when: threshold "0", rate "1.1234567", Save
    then: no request; both fields show errors; focus on Threshold
    test_data:
      input: { threshold: "0", rate: "1.1234567" }
      expected: { requests: 0, focus: threshold }
  - id: TC-U-483
    scenario: clear the rate
    given: rate "36.250000" saved on 2026-11-23
    when: Clear rate, Save
    then: PATCH { usdThbRate: null }; help reads "No rate saved. USD holdings are left out of value weights until you add one."
    test_data:
      input: { usdThbRate: null }
      expected: no-rate help
```

### T-009 — Design test cases — holdings and concentration

```yaml
- title: Design test cases — holdings and concentration
- description: >
  Using the software-tester-design skill, produce structured TC-xxx test cases covering
  all test levels: unit boundaries, API (happy path + error paths + auth), frontend
  component, and E2E flows. Run Steps 0–4 (SUT definition → business flow → field specs
  → scenarios → test data). Output must be in TC-xxx format for software-tester-automation.
  Inputs: requirements.md, design.md, ux-design.md of this slice. Ids in the 400 range
  (TC-A-4xx API, TC-C-4xx component, TC-E-4xx E2E). Must cover every FR and NFR, the two-user
  isolation proof for holdings and settings, the log-privacy proof (NFR-004), the exact-decimal
  and rounding cases (NFR-005), the 360 px and keyboard-only paths, and the contrast points
  ux-design.md leaves to E2E (flag icon in dark mode, outline badge border). Save as
  docs/features/holdings-concentration/v1.0/test-cases.md.
- agent: software-tester-design
- depends_on: []
- status: done
- size: M
```

#### Acceptance criteria

- [ ] SUT definition documented
- [ ] TC-xxx cases cover happy path, boundaries, error paths, and business rules
- [ ] Each TC includes Level, Input, Expected Output, Preconditions, and Mock needed
- [ ] A traceability table maps every FR-001–FR-014 and NFR-001–NFR-008 to at least one TC

**Notes** — Runs in parallel with engineering tasks; depends only on requirements/design, not on code.

### T-010 — Automate tests — holdings and concentration

```yaml
- title: Automate tests — holdings and concentration
- description: >
  Using the software-tester-automation skill, convert the TC-xxx cases from T-009 into
  runnable scripts at the appropriate levels (Unit, API, Frontend Component, E2E).
  Run the full suite against the implementation. E2E specs are e2e/hc-*.spec.ts on the existing
  Playwright setup (admin-created users through e2e/lib/sl.ts helpers, real API, local Supabase):
  mark a holding from the form and the stock page, the Held column, /concentration through every
  control, set the rate and watch a USD holding join the value, axe in light and dark (extending
  e2e/lib/states.ts), 360 px with no horizontal scroll, keyboard-only use. Update the E2E apiAs
  helpers for `holding`. Add the slice's TC ids to the test report script and write
  docs/features/holdings-concentration/v1.0/test-report.md; update CLAUDE.md for the new module,
  routes and commands.
- agent: software-tester-automation
- depends_on: [T-001, T-002, T-003, T-004, T-005, T-006, T-007, T-008, T-009]
- status: backlog
- size: L
```

#### Acceptance criteria

- [ ] All TC-* from T-009 automated and passing (findings pinned with `test.fail` and a finding id only with the owner's agreement)
- [ ] Coverage >= 95% lines for `packages/domain`; >= 85% for `apps/api/src/modules/{stocks,settings}`; >= 70% for `apps/web/src/features`
- [ ] Test report produced with pass/fail per TC-id
- [ ] The full Investhesis gate is green

**Notes** — Report "T-010 done" with the full test report when all TCs pass. Any contrast failure found here goes back to the owning web task as a fix.

## Status Legend

| Status | Changed By | Meaning |
|--------|-----------|---------|
| `backlog` | Orchestrator | Ready, waiting to be picked up |
| `doing` | Orchestrator / Agent | Agent actively working |
| `blocked` | Agent | Stuck, needs human intervention |
| `test` | Agent | Dev done, needs testing |
| `review` | Agent / Tester | Human must review before advancing |
| `done` | Human | Approved and complete |
