---
version: 1.0
status: draft
date: 2026-11-23
requires: requirements.md, design.md, ux-design.md, dev-plan.md
task: T-009
---

# Test Cases: Holdings and Concentration

Test design for [requirements.md](requirements.md), [design.md](design.md) and
[ux-design.md](ux-design.md). It keeps the 41 `TC-U-4xx` cases already written into tasks T-001 to
T-008 of [dev-plan.md](dev-plan.md) (same IDs, none renumbered; section 6 indexes them) and adds
three new series: `TC-A-4xx` (API, database and Supabase level), `TC-C-4xx` (web component and
static) and `TC-E-4xx` (end to end). `software-tester-automation` (T-010) turns every case into a
test whose title starts with its ID.

**ID scheme.** Stock Lists owns `TC-A-101..149`, `TC-C-101..181`, `TC-E-101..133` and
`TC-U-120..135`; User Auth owns `TC-x-001..05x`. This slice uses the 400 range only, so no id
collides. Each series starts at 400 and is contiguous (`TC-A-400..428`, `TC-C-400..436`,
`TC-E-400..422`).

## 0. Inputs, assumptions and conventions

| Source | Used for |
|---|---|
| requirements.md | FR-001..FR-014, NFR-001..NFR-008, UC-001..UC-004, OQ-1..OQ-3 (resolved) |
| design.md | tables and constraints, `HoldingInput`/`SettingsPatch`, `groupConcentration`, API contracts, logging changes, ADR-001..008 |
| ux-design.md | exact copy, focus order, ARIA, responsive rules, the contrast points left to E2E |
| dev-plan.md T-001..T-008 | the 41 `TC-U-4xx` cases (extended, not duplicated) |
| stock-lists v1.0 test-cases.md | house format, mock legend, helpers (`test/db.ts`, `e2e/lib/sl.ts`, `e2e/lib/contrast.ts`, `e2e/lib/states.ts`) |

Levels: **Unit** (pure functions, domain package), **Integration** (real Postgres, no HTTP),
**API** (`app.inject` against local Supabase), **Component** (Testing Library, `StubApi`, jsdom),
**Static** (source scan), **E2E** (Playwright, real web + API + local Supabase).
Priority: P1 smoke, P2 regression, P3 edge. Technique: BVA, EP, DT (decision table), ST (state
transition), EG (error guessing), UC (use case).

**Case anatomy.** Every case lists Level, Preconditions, Input, Expected Output and Mock needed,
and the FR/NFR it covers. "Expected" is the exact copy and values from the three input documents;
where a document is silent the expected value is marked **(proposed)** and listed in section 11.

**Mock legend** (column "Mock needed"; names as in Stock Lists where they exist).

| Name | Meaning |
|---|---|
| none | real code, nothing replaced |
| DB | local Supabase from `pnpm db:start && pnpm db:reset` |
| LocalJWKS | jose ES256 key pair + `createLocalJWKSet`, `signTestToken` (`test/auth.ts`), `AUTH_MODE=supabase` |
| TwoUsers | identities U and V, each with own token (API) or own browser context (E2E) and own rows |
| SeedRepo | rows inserted through repository functions or `test/seed.ts` (stocks, lists) plus a new `seedHolding` helper |
| SeedAPI | data created through the real API with the user's token (`apiAs` in `e2e/lib/sl.ts`, updated for `holding`) |
| StubApi | `src/test/stub-api.ts` scripted statuses and bodies; `makeStock` with `holding` |
| FakeAuth | `FakeAuthClient.signedIn()` with `createRoutes(...)` |
| FakeTimers | Vitest fake timers |
| LogCapture | `buildApp` with a capturing `logStream`, log level `trace` |
| NetBlock | undici `MockAgent` with `disableNetConnect()`; any outbound HTTP fails the test |
| ConstraintProbe | test-only `ALTER TABLE app.holdings ADD CONSTRAINT hc_probe CHECK (average_cost is distinct from 7777.7777)`, dropped in `afterAll`. Lets a value that passes `HoldingInput` reach a real Postgres check violation, without a test seam in product code (see G-12) |
| PwRoute | Playwright `page.route`, `context.setOffline`, `page.clock` |
| AdminAPI | GoTrue admin API with the service key to create confirmed `@example.test` users (`confirmedUser`, `adminCreateUser`) |
| TZ | process time zone pinned (`TZ=Asia/Bangkok`) for date text |

---

## 1. System under test

### 1.1 Scope

| Part | Unit under test | Where |
|---|---|---|
| Schema | `app.holdings` (one row = held; `numeric(18,4)` shares > 0, average cost >= 0, `cost_currency` USD/THB, composite FK with cascade, index) and `app.user_settings` (threshold 1..100 default 40, rate `numeric(18,6)` > 0, rate date), RLS on, no policies, Drizzle drift | `supabase/migrations/*_holdings.sql`, `apps/api/src/db/schema/holdings.ts` |
| Domain package | `HoldingInput`, `SettingsPatch`, `CONCENTRATION_LENSES`, `groupConcentration`, decimal helpers (parse, format, percent half up) | `packages/domain` (cases `TC-U-410..427`, not repeated) |
| Stocks API (changed) | `holding` on `GET /stocks`, `GET /stocks/{id}`, `POST /stocks`, `PATCH /stocks/{id}`; import never touches holdings | `apps/api/src/modules/stocks`, `modules/imports` |
| Settings API (new) | `GET /settings`, `PATCH /settings` | `apps/api/src/modules/settings` |
| Logging | `REDACT_PATHS` (`averageCost`, `usdThbRate`, `holding`; `costBasis` dropped), `err` serializer dropping Postgres `detail` and `where` | `apps/api/src/lib/logger.ts` |
| Web: holding in stock UI | Holding card in `StockForm`, Held column in `StockTable`, Holding card and dialog on `/stocks/:id` (`set-holding`, `clear-holding`, Undo) | `apps/web/src/features/stocks`, `views/` |
| Web: concentration | `/concentration` loader and action, controls, group table, flagged summary, left-out and multi-value and advice notes, address state, settings dialog | `apps/web/src/features/concentration`, `views/concentration.tsx` |
| Whole flow | web + API in `supabase` mode against the local stack as admin-created users | Playwright (`e2e/hc-*.spec.ts`) |

Not under test: Supabase Auth and sign-in (User Auth plan), Stock Lists behaviours that this slice
does not change (their suite keeps running as regression), export itself (NFR-008 is structural
only), exchange-rate providers, Thai labels (all out of scope in requirements.md).

### 1.2 Inputs

| Input | Type and boundaries |
|---|---|
| `shares` | decimal **string** `^\d{1,14}(\.\d{1,4})?$`, > 0 (so `"0"`, `"0.0000"` fail), or `null`/omitted. Boundaries: `"0.0001"` ok, `"99999999999999.9999"` ok, `"100000000000000"` (15 digits) fail, `"1.23456"` fail |
| `averageCost` | same pattern, >= 0 (`"0"` ok), or `null`/omitted |
| `costCurrency` | `USD` \| `THB`; defaults to the stock's trading currency (US stock USD, TH stock THB); a TH stock may hold USD cost |
| `holding` on POST | omitted or `null` = not held; `{}` = held, amount unknown; object = held |
| `holding` on PATCH | omitted = unchanged, `null` = delete, object = **replace** (omitted fields become `null`), `{}` = held unknown; alone is a valid patch |
| `concentrationThreshold` | integer 1..100, default 40; boundaries 0, 1, 100, 101, 40.5 |
| `usdThbRate` | decimal string `^\d{1,12}(\.\d{1,6})?$` > 0, or `null` (clears); boundaries `"0"`, `"0.000001"`, `"1.1234567"`, 13 integer digits |
| Page address | `?scope=all\|held\|<listId>`, `?lens=<key>`, `?measure=count\|value`; defaults `all`, `gicsSector`, `count` |
| Scope / lens / measure | 3 scope kinds x 16 lenses x 2 measures |
| Stored data seen by the page | `GET /stocks` (with `holding`, lenses, `listIds`), `GET /lists`, `GET /settings` |
| Identity | bearer token; the user id comes only from the verified identity |

### 1.3 Outputs

- API: `Stock.holding` (`null` or `{ shares, averageCost, costCurrency }` with decimal strings or `null`), settings JSON, problem+json (`code`, `errors[].path` such as `holding.shares`, `requestId`), `404 not_found` for another user's stock, `401 unauthenticated`.
- Database: rows in `app.holdings` and `app.user_settings`; unchanged state after any failed write.
- Logs: captured pino lines (method, URL, headers, `err` objects); never a holding value or the rate.
- Web: Held badge and shares, card text, money text (`฿1,234,567.89`, `$412.33`, shares `120.5`), group table rows (count, value, share one decimal, flag badge), summaries and notes, address, toasts, focus target, `document.title`, outgoing requests.

### 1.4 Invariants

1. A holding exists only for a stock of the same user; another user's stock, and so its holding, answers `404`; settings are reachable only as the caller's own row (NFR-003).
2. Shares, average cost and the rate are decimal strings end to end; no float is created at any point (FR-003, NFR-005).
3. A stock without a holding row is not held; deleting the stock deletes the holding; an import never creates, changes or clears a holding.
4. A holding write is atomic with its stock write (ADR-004).
5. Flag test: group measure x 100 >= threshold x total, computed exactly; display rounding (one decimal, half up) never affects it; `Not set` is never flagged (ADR-007).
6. A stock is counted once per group it has; a multi-value lens can exceed 100% and the page says so; the value total counts each valued stock once.
7. Value shares use only valued stocks: held, with shares and cost, and (for USD) a saved rate; everything else is named as left out.
8. Shares, cost and the rate never reach a log line, an error response, the page address, browser storage or a third party (NFR-004).
9. Concentration regroups in the browser with no request; the address is the only view state (ADR-002, ADR-008).
10. The shipped UI works at 360 px with no page-level horizontal scroll, by keyboard alone, and meets WCAG 2.1 AA contrast in both themes (NFR-006, NFR-007).

## 2. Business flows

| Flow | Path |
|---|---|
| Mark a holding (happy) | Add stock form: tick "I hold this stock", shares, cost → `POST /stocks {holding}` → toast → stock page Holding card (UC-001) |
| Mark (alt) | Held without amounts; TH stock (THB default); USD cost on a TH stock; mark later from the stock page dialog; edit; stop holding then Undo |
| Mark (exceptions) | client validation; server `400` with `holding.*` path; foreign list id; network or 5xx; double submit; stock deleted elsewhere |
| See what I hold | Held column on `/stocks` and `/lists/:id`; sort by Held; card on the stock page (UC-002) |
| See concentration | `/concentration`: scope x lens x measure; flagged summary; expand group; left-out note; multi-value note (UC-003) |
| Settings | threshold and rate dialog from Settings or Set rate; clear rate; persists across reload and devices (UC-004) |
| Address | reload, link in a new tab, Back; deleted list, another user's list id, unknown lens or measure |
| Empty and edge | no stocks; empty list; no held stock; held without amounts only; zero total value; USD without a rate |
| Isolation | user V uses the same endpoints and URLs as U and sees none of U's holdings, rate or threshold |
| Cross-feature | import update leaves holdings; deleting a stock removes its holding; list operations leave holdings |

## 3. Field specifications (equivalence classes and boundaries)

### 3.1 Holding fields

| Field | Valid classes | Invalid classes | Boundaries |
|---|---|---|---|
| shares | `"120.5"`, `"1"`, `null`, omitted | `"0"`, `"0.0000"`, `"-1"`, `"abc"`, `"1e3"`, `"1,5"`, `"+1"`, `".5"`, `"5."`, `""`, `" 1"` (API), number `10`, `true`, `[]` | `"0.0001"` ok; `"99999999999999.9999"` ok; 15 integer digits fail; 5 decimals fail |
| averageCost | `"412.33"`, `"0"`, `"0.0000"`, `null` | `"-1"`, `"1.23456"`, number `1.5`, as for shares | `"0"` ok; `"0.0001"` ok; 14.4 digits ok; 15.0 fail |
| costCurrency | `USD`, `THB`, omitted (default) | `EUR`, `usd`, `""`, `null` | n/a |
| extra keys | none | `price`, `userId`, `stockId`, `lensSources` inside `holding` | rejected with the key as path (`holding.price`) |

### 3.2 Settings fields

| Field | Valid classes | Invalid classes | Boundaries |
|---|---|---|---|
| concentrationThreshold | `1`, `35`, `40`, `100` | `0`, `101`, `-5`, `40.5`, `"40"`, `null`, `NaN` | 0 / 1 / 100 / 101 |
| usdThbRate | `"36.25"`, `"36"`, `"0.000001"`, `null` | `"0"`, `"0.0"`, `"-1"`, `"1.1234567"`, `"36,25"`, `""`, number `36.25` | 6 decimals ok, 7 fail; 12 integer digits ok, 13 fail |
| other keys | none | `theme`, `userId`, `baseCurrency` | rejected with the key as path |

### 3.3 Page address

| Param | Valid | Falls back with a note |
|---|---|---|
| scope | `all`, `held`, id of a list in `GET /lists` | id not among loaded lists (deleted, another user's, malformed), `ALL`, empty, repeated param |
| lens | one of the 16 keys | unknown key, wrong case, empty, repeated |
| measure | `count`, `value` | `VALUE`, `sum`, empty |

## 4. Scenarios and techniques

| Area | Technique | Cases |
|---|---|---|
| Decimal limits, settings bounds | BVA + EP, error guessing (exponent, comma, sign, whitespace, float) | A-407, A-417, C-402, C-429 |
| PATCH holding semantics (omitted / null / object / `{}`) | Decision table | A-410, A-411 |
| Default currency by market and manual pick | Decision table | A-406, C-403 |
| Scope x lens x measure | Pairwise on the page; full enumeration of the 16 lenses | C-413..C-416, E-406 |
| Flag rule | BVA on share vs threshold (39.96 / 40.00 / 40.01; threshold 1 and 100) | C-417, E-412 |
| Value eligibility (held, amount, rate) | Decision table (3 inputs, 8 combinations) | C-416, C-419, C-420 |
| Holding lifecycle (not held, held unknown, held with amounts, stopped, undone) | State transition | A-410, C-406..C-409, E-403 |
| Settings lifecycle (no row, row, rate cleared) | State transition | A-415, A-416, A-418 |
| Isolation, privacy | Error guessing, two-user proof, log capture | A-400..A-403, A-422..A-427, E-413, E-414 |
| Responsive, keyboard, contrast | Use-case walk-through, measured computed styles | E-415..E-418, C-426 |

## 5. Test data

### 5.1 Dataset HC-A (concentration basics, used by C-414..C-421, E-406, E-407, E-408)

Rate `36.25` THB per USD when set; threshold 40 unless stated. Sectors are GICS.

| # | Ticker | Market | Sector | Holding | List | Value at cost (THB, rate 36.25) |
|---|---|---|---|---|---|---|
| 1 | NVDA | US | Information Technology | 10 x 100.00 USD | Core holdings | 36,250.00 |
| 2 | MSFT | US | Information Technology | 20 x 50.00 USD | Core holdings | 36,250.00 |
| 3 | PTTEP | TH | Energy | 1000 x 20.50 THB | Core holdings | 20,500.00 |
| 4 | KBANK | TH | Financials | 100 x 150.00 THB | none | 15,000.00 |
| 5 | AAPL | US | Information Technology | held, no shares, no cost | none | left out (no amount) |
| 6 | JNJ | US | Health Care | not held | none | left out (not held) |
| 7 | SCB | TH | Financials | not held | none | left out (not held) |
| 8 | ZZZ | US | (no sector) | not held | none | left out (not held) |

Derived, exact:

| View | Expected |
|---|---|
| Count, scope all, lens sector (8 stocks) | IT 3 = 37.5%, Financials 2 = 25.0%, Energy 1 = 12.5%, Health Care 1 = 12.5%, Not set 1 = 12.5%; nothing flagged at 40; IT flagged at 35 |
| Count, scope held (5 stocks) | IT 3 = 60.0% flagged; Energy 1 = 20.0%; Financials 1 = 20.0% |
| Count, scope list Core holdings (3 stocks) | IT 2 = 66.7% flagged; Energy 1 = 33.3% |
| Value, scope all, rate 36.25 | total 108,000.00: IT 72,500.00 = 67.1% flagged; Energy 20,500.00 = 19.0%; Financials 15,000.00 = 13.9%; Health Care and Not set 0.00 = 0.0% (proposed, G-5) |
| Value, scope all, **no rate** | total 35,500.00 (PTTEP, KBANK): Energy 57.7% flagged; Financials 42.3% flagged; IT 0.00; left out: needs rate 2 (NVDA, MSFT), no amount 1 (AAPL), not held 3 (JNJ, SCB, ZZZ) |

### 5.2 Other datasets

| Id | Content | Used by |
|---|---|---|
| HC-B (rounding) | THB held stocks X (Energy) 1 x `3996.0000`, Y (Utilities) 1 x `6004.0000`; threshold 40. X 39.96% shows `40.0%`, not flagged; Y 60.04% shows `60.0%`, flagged. Edit X to `4000.0000`, Y to `6000.0000`: X exactly 40.0% flagged | C-417, E-412 |
| HC-C (half up) | 16 count-stocks: group A 1, group B 3, group C 12 → `6.3%` (6.25), `18.8%` (18.75), `75.0%`. Banker's rounding would give `6.2%` | C-400, C-417 |
| HC-D (float traps) | THB held `1 x 0.1000` and `1 x 0.2000` in one group → value `฿0.30`; shares `1.0000` x cost `1.0050` → `$1.01` (a float gives 1.00); shares `0.0001` x cost `0.0001` → `$0.00`; shares `99999999999999.9999` x cost `99999999999999.9999` → `฿9,999,999,999,999,999,980,000,000,000.00` | A-405, C-400, C-407, E-412 |
| HC-E (large) | 200 stocks, 100 held (60 USD, 40 THB, 10 held without amounts), themes 0..3 values each, 12 lists | C-427, E-419 |
| HC-F (isolation) | U: NVDA held 7351.2468 x 9182.7364 USD, list `U core`, settings threshold 25 and rate `36.482917`. V: AAPL held 1 x 1, list `V list`, no settings row | A-401, A-402, E-413 |
| HC-G (log sentinels) | shares `7351.2468`, averageCost `9182.7364`, rate `36.482917`, DB probe cost `7777.7777`; none occurs in any other test data, so a substring search is conclusive | A-422..A-424, E-414 |
| HC-H (multi-value) | themes `[AI, EV]`, `[AI]`, `[]` as TC-U-421; plus customers, revenue types, index membership with 2 values | C-421, E-411 |

---

## 6. Cases from the dev plan (IDs kept, not repeated)

| Id | Level it needs | Covers | Extended by |
|---|---|---|---|
| TC-U-400..403 | Integration (DB) | FR-001, FR-002, FR-011, NFR-003 | A-428 (export read), A-427 |
| TC-U-410..413 | Unit (domain) | FR-002, FR-003, FR-011 | A-407, A-417, C-402, C-429 |
| TC-U-420..427 | Unit (domain) | FR-006..FR-010, NFR-005 | C-413..C-421, E-412 |
| TC-U-430..435 | API | FR-001..FR-004, NFR-003 | A-401, A-403, A-406..A-414 |
| TC-U-440..443 | API | FR-011, NFR-003 | A-415..A-419 |
| TC-U-450..455 | Component | FR-001..FR-004 | C-401..C-405, C-411 |
| TC-U-460..463 | Component | FR-001, FR-002, FR-004 | C-406..C-410 |
| TC-U-470..477 | Component | FR-005..FR-010, FR-012..FR-014 | C-414..C-426 |
| TC-U-480..483 | Component | FR-010, FR-011 | C-428..C-431 |

---

## 7. API, database and Supabase cases (TC-A)

Shared setup unless stated: `buildApp` on local Supabase (`pnpm db:reset`), `AUTH_MODE=supabase` with
LocalJWKS tokens, each file with its own random user ids and `afterAll` cleanup (`cleanup()` also
removes `app.user_settings` rows of those users; `test/db.ts` needs that addition).

### Security and isolation

### TC-A-400
**Every new or changed route needs an identity** | Level: API | P1 | EP (table-driven, 8 rows)
- **Preconditions:** app in `supabase` mode; LocalJWKS.
- **Input:** no `Authorization`, then an invalid token (wrong signature) and an expired token, for `GET /stocks`, `GET /stocks/{id}`, `POST /stocks` (with `holding`), `PATCH /stocks/{id}` (with `holding`), `GET /settings`, `PATCH /settings`, and the existing `DELETE /stocks/{id}`.
- **Expected:** every row `401 unauthenticated`, `WWW-Authenticate: Bearer`, `application/problem+json`; table counts of `app.stocks`, `app.holdings`, `app.user_settings` unchanged after the `POST` and `PATCH` rows.
- **Mock needed:** LocalJWKS, DB. **Covers:** NFR-003.

### TC-A-401
**Two-user proof: holdings** | Level: API | P1 | EP, EG
- **Preconditions:** dataset HC-F: U owns S-NVDA (held 7351.2468 x 9182.7364 USD) in list `U core`, and S-PTTEP (not held); V owns S-AAPL held 1 x 1 and list `V list`; TwoUsers.
- **Input (as V):** `GET /stocks`; `GET /stocks/{S-NVDA}`; `PATCH /stocks/{S-NVDA} { holding: { shares: "1" } }`; `PATCH /stocks/{S-NVDA} { holding: null }`; `PATCH /stocks/{S-PTTEP} { holding: {} }`; `POST /stocks { ticker: "NVDA", market: "US", exchange: "NASDAQ", name: "N", listIds: [U core], holding: { shares: "5" } }`; `POST /stocks { ticker: "NVDA", ..., holding: { shares: "5", averageCost: "2" } }` (V's own NVDA).
- **Expected:** the list holds only V's AAPL with its own holding; the GETs and PATCHes of U's ids answer `404 not_found` with a body identical to an id that never existed (apart from `requestId`); the `listIds` call is `404` and V saved no stock and no holding; V's own `NVDA` with a holding is `201` (no `409`, no hint that U has it) and its holding is V's `5` and `2`, not U's; afterwards U's NVDA still has `7351.2468`, `9182.7364`, USD and PTTEP is still `holding: null`; `app.holdings` has exactly 3 rows (U NVDA, V AAPL, V NVDA), each with the owner's `user_id`.
- **Mock needed:** LocalJWKS, TwoUsers, DB, SeedRepo. **Covers:** FR-001, NFR-003.

### TC-A-402
**Two-user proof: settings** | Level: API | P1 | EP, EG
- **Preconditions:** U has settings threshold 25 and rate `36.482917` saved; V has no settings row; TwoUsers.
- **Input:** as V: `GET /settings`; `PATCH /settings { concentrationThreshold: 90 }`; `GET /settings`. Then as U: `GET /settings`. Also as V: `PATCH /settings { userId: <U>, concentrationThreshold: 10 }`.
- **Expected:** V's first read is `{ 40, null, null }`; after V's patch V reads `{ 90, null, null }` and U still reads `{ 25, "36.482917", <date> }`; the call carrying `userId` is `400 validation_failed` with path `userId` and changes nothing for U or V; `app.user_settings` has exactly two rows after V's first patch, each with its owner's `user_id`; V's first `GET` wrote no row.
- **Mock needed:** LocalJWKS, TwoUsers, DB. **Covers:** FR-011, NFR-003.

### TC-A-403
**The owner comes from the token, never from the body** | Level: API | P1 | EG
- **Input (as U):** `POST /stocks` with `holding: { shares: "1", userId: <V>, stockId: <V's stock> }`; `PATCH /stocks/{U stock} { holding: { shares: "1", user_id: <V> } }`; `POST /stocks` with top-level `userId: <V>` and a valid holding; header `x-user-id: <V>` on a valid holding patch.
- **Expected:** the first two are `400 validation_failed` with paths `holding.userId` / `holding.stockId` / `holding.user_id`, nothing written; the third is `400` with path `userId` and the stock is not created; the header is ignored and the holding is saved for U; V's rows and counts are unchanged in every row.
- **Mock needed:** LocalJWKS, TwoUsers, DB. **Covers:** NFR-003, FR-001.

### Reading and writing holdings

### TC-A-404
**Every route that returns a stock carries `holding`** | Level: API | P1 | EP
- **Preconditions:** U owns A (held 120.5 x 412.33 USD), B (held with `{}`), C (not held), all in list L.
- **Input:** `GET /stocks`; `GET /stocks?listId=L`; `GET /stocks/{A}`; `POST /stocks` (a new D, no holding); `PATCH /stocks/{C} { name: "X" }`; the stocks returned by `POST /imports` preview for an existing ticker.
- **Expected:** A `holding: { shares: "120.5000", averageCost: "412.3300", costCurrency: "USD" }`; B `{ shares: null, averageCost: null, costCurrency: <stock currency> }`; C, D and the patched C `holding: null` (the key is present, never missing and never `{}`); no other `Stock` field changed shape (`lensSources`, `listIds`, `updatedAt` as before); the OpenAPI response serializer does not strip `holding`.
- **Mock needed:** LocalJWKS, DB, SeedRepo. **Covers:** FR-001, FR-004.

### TC-A-405
**Decimals are exact strings from the database to the JSON** | Level: API | P1 | BVA, EG
- **Input:** `POST /stocks` ... with holdings `{ shares: "0.0001", averageCost: "0" }`; `{ shares: "99999999999999.9999", averageCost: "99999999999999.9999" }`; `{ shares: "120.50", averageCost: "412.3" }`; `{ shares: "0.1000", averageCost: "0.2000" }` (HC-D); read each back with `GET /stocks/{id}`.
- **Expected:** responses `"0.0001"/"0.0000"`, `"99999999999999.9999"/"99999999999999.9999"`, `"120.5000"/"412.3000"`, `"0.1000"/"0.2000"`; every value is a JSON **string** (assert on the raw payload text with a regex such as `"shares":"` and that no `shares` or `averageCost` is a JSON number); the stored `numeric` equals the input (`select shares::text`), with no `e` notation and no float artefact (`0.1000` never becomes `0.10000000000000001`); the same strings come back from `GET /stocks` (json subquery path) and `GET /stocks/{id}`.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-003, NFR-005.

### TC-A-406
**Cost currency defaults to the stock's trading currency** | Level: API | P1 | DT
- **Input rows (create and patch-replace):** US stock + no `costCurrency`; TH stock + no `costCurrency`; TH stock + `USD`; US stock + `THB`; US stock + `{}`; TH stock + `{}`.
- **Expected:** `USD`, `THB`, `USD`, `THB`, `USD`, `THB` respectively; cross-currency holdings are accepted and returned as sent; `EUR`, `usd` and `null` are `400` with path `holding.costCurrency`.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-002.

### TC-A-407
**Holding validation table on create** | Level: API | P1 | BVA, EP, EG (table-driven)
- **Input rows (shares / averageCost):** `"0"`/-; `"0.0000"`/-; `"0.0001"`/-; `"99999999999999.9999"`/-; `"100000000000000"`/-; `"1.23456"`/-; `-1` as string/-; `10` (number)/-; `"1e3"`/-; `"1,5"`/-; `" 1"`/-; `""`/-; `".5"`/-; `"5."`/-; `-`/`"0"`; `-`/`"-0.0001"`; `-`/`1.5` (number); `-`/`"1.23456"`; unknown key `holding.price`; `holding: "yes"` (not an object); `holding: []`.
- **Expected:** accepted rows are `201`; every other row `400 validation_failed` with `errors[].path` equal to `holding.shares`, `holding.averageCost` or `holding.price` (or `holding` for the last two), a message naming the limit ("up to 4 decimal places", "greater than 0", as in `messages.ts`) that does **not** repeat the submitted value, `requestId` present; for each `400` no stock was created (`stocksAfter` equals `stocksBefore`).
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-002, FR-003.

### TC-A-408
**POST with `holding` omitted, `null` and `{}`** | Level: API | P2 | EP
- **Input:** three creates with `holding` absent, `null`, `{}`.
- **Expected:** `holding: null`, `holding: null`, and `{ shares: null, averageCost: null, costCurrency: <default> }`; `app.holdings` has one row (the third); the rest of the stock is identical across the three.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-001, FR-002.

### TC-A-409
**A create with a holding is atomic** | Level: API | P1 | EG
- **Preconditions:** U has no stock `US/ATOM`; V owns list `LV`.
- **Input:** (a) `POST /stocks { ticker: "ATOM", ..., listIds: [LV], holding: { shares: "5", averageCost: "1" } }` as U. (b) With ConstraintProbe installed, `POST /stocks { ticker: "ATOM", ..., holding: { shares: "5", averageCost: "7777.7777" } }`. (c) `POST /stocks` for an existing `US/AAPL` with a holding.
- **Expected:** (a) `404 not_found`, no stock, no membership and no holding row; (b) `500` problem (generic `detail`, no row values), no `ATOM` stock and no holding row (rolled back together); (c) `409 stock_exists` with `existingStockId`, and the existing AAPL's holding is not created or changed.
- **Mock needed:** LocalJWKS, TwoUsers, DB, ConstraintProbe. **Covers:** FR-001, FR-002.

### TC-A-410
**PATCH holding is replace, with `null`, omitted and `{}`** | Level: API | P1 | DT, ST
- **Preconditions:** U's TH stock S (THB), not held.
- **Input (in order):** `{ holding: { shares: "10", averageCost: "5", costCurrency: "USD" } }`; `{ holding: { shares: "20" } }`; `{ name: "Renamed" }`; `{ holding: {} }`; `{ holding: { shares: "30", averageCost: "1" } }` twice; `{ holding: null }`; `{ holding: null }` again; `{ holding: { shares: "1" } }` on a stock whose `PATCH` also sets `style`.
- **Expected:** step 1 USD with 10 and 5; step 2 **replaces**: shares `20.0000`, `averageCost` null, currency back to the stock's `THB` (not the previous `USD`); step 3 leaves the holding exactly as in step 2; step 4 `{ null, null, THB }`; step 5 identical twice (idempotent; one row); step 6 `holding: null` and the row is gone; step 7 `200` with `null` (deleting nothing is not an error); step 8 writes the style and the holding in one call. `app.holdings` never has more than one row for S.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-001, FR-002.

### TC-A-411
**PATCH atomicity and shape rules** | Level: API | P1 | EG
- **Preconditions:** U's held stock S (shares 10, cost 5, name `Old`).
- **Input:** (a) `{ name: "New", holding: { shares: "0" } }`; (b) `{ holding: { shares: "1" } }` only (no stock field); (c) `{ ticker: "Y", holding: { shares: "1" } }`; (d) an empty body `{}`; (e) `{ name: "New", holding: { shares: "9" } }` with ConstraintProbe and cost `7777.7777`.
- **Expected:** (a) `400` path `holding.shares`, name still `Old`, holding unchanged; (b) `200`, holding replaced, the stock's other fields and `lensSources` unchanged; (c) `400` path `ticker` (as TC-U-433), nothing written; (d) `200` unchanged (empty PATCH as before this slice); (e) `500` generic, name still `Old`, holding unchanged (one transaction).
- **Mock needed:** LocalJWKS, DB, ConstraintProbe. **Covers:** FR-001, FR-002.

### TC-A-412
**Holdings and lists are independent; delete cascades** | Level: API | P1 | ST
- **Preconditions:** U's held stock S in list L and list M.
- **Input:** `DELETE /lists/L/stocks/S`; `POST /lists/L/stocks { stockId: S }`; `DELETE /lists/M`; `PATCH` S's lenses; then `DELETE /stocks/S`; then `POST /stocks` for the same ticker without a holding.
- **Expected:** after each of the first four calls the holding is unchanged (`holding` equal to the original); after `DELETE /stocks/S` `204` and `app.holdings` has no row for S; the re-created stock is `holding: null` (no resurrected holding); other stocks' holdings are untouched.
- **Mock needed:** LocalJWKS, DB, SeedRepo. **Covers:** FR-001, FR-004.

### TC-A-413
**Imports never create, change or clear a holding** | Level: API | P1 | EG
- **Preconditions:** U has US/AAPL held 10 x 150 USD and TH/PTTEP not held; fixture F-02 contains AAPL, PTTEP and a new stock.
- **Input:** `POST /imports/preview` (F-02); `POST /imports { duplicateMode: "skip", newListName: "A" }`; `POST /imports { duplicateMode: "update", newListName: "B" }`.
- **Expected:** preview and both confirms leave AAPL's holding `10.0000`/`150.0000`/USD and PTTEP `null`; the new stock has `holding: null`; the preview rows do not contain `holding` or any amount; `app.holdings` row count is unchanged by the import; updated AAPL lenses reflect the file (`update` mode) or not (`skip`).
- **Mock needed:** LocalJWKS, DB, Fixtures, SeedRepo. **Covers:** FR-001, FR-004.

### TC-A-414
**The holdings join returns the right holding for the right stock** | Level: API | P2 | EP
- **Preconditions:** HC-E-like set: 200 stocks for U, every third held with a distinct sentinel shares value (`n.0001`), the rest not held; 30 stocks for V with holdings.
- **Input:** `GET /stocks`; `GET /stocks?listId=L`; `GET /stocks/{id}` for 10 random ids.
- **Expected:** 200 stocks, each with `holding` equal to its own seeded value (matched by id), `null` where none; none of V's holdings appear; no duplicated stock (a left join must not multiply rows); response order is as before the slice (unchanged `orderBy`).
- **Mock needed:** LocalJWKS, TwoUsers, DB, SeedRepo. **Covers:** FR-004, NFR-003.

### Settings

### TC-A-415
**Defaults without a row, and nothing is written by a read** | Level: API | P1 | EP
- **Preconditions:** U has no `app.user_settings` row.
- **Input:** `GET /settings` three times.
- **Expected:** `200 { concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null }` each time; `select count(*) from app.user_settings where user_id = U` is 0 afterwards.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-011.

### TC-A-416
**Upsert, partial patch and exact rate text** | Level: API | P1 | ST, EP
- **Input (in order):** `PATCH { usdThbRate: "36.25" }`; `PATCH { usdThbRate: "36" }`; `PATCH { usdThbRate: "0.000001" }`; `PATCH { usdThbRate: "999999999999.999999" }`; `PATCH { concentrationThreshold: 35 }`; `PATCH { concentrationThreshold: 100, usdThbRate: "36.123457" }`; then `GET /settings`.
- **Expected:** rates come back `"36.250000"`, `"36.000000"`, `"0.000001"`, `"999999999999.999999"` (strings, exact); the threshold patch leaves the rate as it was and the rate patch leaves the threshold; the last `GET` equals the last `PATCH` answer `{ 100, "36.123457", <ISO date> }`; one row only for U (upsert on `user_id`).
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-011, FR-003.

### TC-A-417
**Settings validation table** | Level: API | P1 | BVA, EG (table-driven)
- **Input rows:** threshold `0`, `1`, `100`, `101`, `-5`, `40.5`, `"40"`, `null`, `1e2`; rate `"0"`, `"0.000000"`, `"0.0000001"`, `"1.1234567"`, `"1000000000000"` (13 digits), `"-36"`, `"36,25"`, `""`, `" 36"`, `36.25` (number), `null`; unknown key `theme`; body not an object.
- **Expected:** accepted: threshold `1`, `100`, rate `"0.000001"`, `null`; `1e2` is parsed by JSON as the number 100 and accepted (note in the case: JSON has no distinct form); every other row `400 validation_failed` with the path of the field (`concentrationThreshold`, `usdThbRate`, `theme`, or empty path for the non-object), `requestId`, message naming the limit and not echoing the value; settings unchanged after each `400`.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-011.

### TC-A-418
**The rate date: set on save, null on clear, untouched by other changes** | Level: API | P2 | ST
- **Input:** save rate `"36.25"` (note `d1`); wait 20 ms; `PATCH { concentrationThreshold: 30 }`; wait 20 ms; `PATCH { usdThbRate: "36.25" }` (same value again, `d2`); `PATCH { usdThbRate: null }`; `PATCH { usdThbRate: "37" }` (`d3`).
- **Expected:** after the threshold patch the date still equals `d1`; the re-save of the same value moves the date to `d2 > d1` (a save is a save; proposed, G-13); after the clear the date is `null` and the rate `null`; `d3 > d2`; the dates are valid ISO-8601 UTC strings; `updated_at` of the row moves on every write.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-011.

### TC-A-419
**First save is safe under concurrency** | Level: API | P2 | EG
- **Preconditions:** U has no settings row.
- **Input:** `Promise.all` of 8 `PATCH /settings` with different thresholds (1..8) and two with different rates.
- **Expected:** all `200`, none `500` or `409`/23505; exactly one row; its values are the ones of one of the requests (no half mix is asserted beyond both fields valid); a following `GET` equals the stored row.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-011, NFR-003.

### Concurrency, performance and operations

### TC-A-420
**Concurrent holding writes leave one consistent row** | Level: API | P2 | EG
- **Input:** on one stock, in parallel: 10 `PATCH { holding: { shares: "n" } }` with n = 1..10 plus 3 `PATCH { holding: null }`; separately two parallel `POST /stocks` for the same new ticker, both with a holding.
- **Expected:** every `PATCH` is `200` (no `500`, no deadlock, no `23505`); the final state is either no row or exactly one row whose values equal one request's body; the parallel `POST` gives one `201` and one `409 stock_exists`, one stock and at most one holding row, and the winner's holding is the winner's body.
- **Mock needed:** LocalJWKS, DB. **Covers:** FR-001, NFR-002.

### TC-A-421
**Holding writes respond within 500 ms (p95)** | Level: API | P2 | performance
- **Preconditions:** local Supabase, single user, 200 stocks saved, warm connection; in `stocks.latency.test.ts`.
- **Input:** 50 sequential `PATCH /stocks/{id} { holding: {shares, averageCost} }`; 50 sequential `PATCH { holding: null }` (clear); 50 sequential `POST /stocks` with a holding; 50 `PATCH /settings` (informational).
- **Expected:** p95 of each of the first three groups under 500 ms, logged with the percentile table like the Stock Lists latency test; the settings p95 is logged and must be under 500 ms too (not a requirement of the NFR; informational).
- **Mock needed:** LocalJWKS, DB. **Covers:** NFR-002.

### Privacy and logs

### TC-A-422
**No holding value or rate reaches a log line (accepted and rejected requests)** | Level: API | P1 | EG
- **Preconditions:** `buildApp` with LogCapture at level `trace`; HC-G sentinels.
- **Input:** `POST /stocks { ..., holding: { shares: "7351.2468", averageCost: "9182.7364" } }` (201); `PATCH /stocks/{id} { holding: { shares: "7351.2468" } }` (200); `PATCH /stocks/{id}` with `holding: { shares: "7351.2468", averageCost: "1.23456" }` (400); `PATCH /settings { usdThbRate: "36.482917" }` (200); `PATCH /settings { usdThbRate: "36.4829171" }` (400); the same calls with an invalid token (401); a `POST` to a foreign list (404); `GET /stocks` and `GET /settings` after.
- **Expected:** concatenate all captured log lines (JSON text): the strings `7351.2468`, `9182.7364`, `36.482917`, `36.4829171` appear **nowhere**; request log lines have no body field; the `authorization` header is `[redacted]`; none of the 400/404 problem responses echoes a sentinel (assert on response bodies too); each request still has a log line with method, URL, status and `requestId` (logging is not simply turned off).
- **Mock needed:** LocalJWKS, DB, LogCapture. **Covers:** NFR-004.

### TC-A-423
**A logged database error has no row values (`detail` dropped)** | Level: API | P1 | EG
- **Preconditions:** LogCapture; ConstraintProbe installed; HC-G probe value `7777.7777`.
- **Input:** `POST /stocks` with `holding: { shares: "7351.2468", averageCost: "7777.7777" }` (a valid body that Postgres rejects with `23514`); also `PATCH` of an existing stock with the same holding.
- **Expected:** `500` problem+json with a generic `detail` and a `requestId` that contains neither `7777.7777` nor `7351.2468`; exactly one error log line per request with `err.code = "23514"`, `err.constraint = "hc_probe"`, `err.table = "holdings"` and `err.message`; the line has **no** `detail` and **no** `where` key, and its text does not contain `Failing row contains`, `7777.7777` or `7351.2468`; a non-Postgres error logged afterwards (a thrown `Error("boom")`) still keeps its `message` and `stack` (the serializer is not too greedy).
- **Mock needed:** LocalJWKS, DB, LogCapture, ConstraintProbe. **Covers:** NFR-004.

### TC-A-424
**Redaction covers the wire names and drops the stale one** | Level: Integration | P2 | EP
- **Input:** log objects through the app's logger: `{ holding: { shares: "7351.2468" } }`, `{ req: { body: { holding: {...} } } }`, `{ averageCost: "9182.7364" }`, `{ usdThbRate: "36.482917" }`, `{ shares: "7351.2468" }`, `{ costBasis: "1" }`; and `REDACT_PATHS` itself.
- **Expected:** every sentinel value prints as `[redacted]` (top-level and the nested `body` forms that the config lists); `REDACT_PATHS` contains `averageCost`, `usdThbRate`, `holding`, `shares` and does not contain `costBasis`; a non-sensitive key (`ticker`) is not redacted.
- **Mock needed:** LogCapture. **Covers:** NFR-004.

### TC-A-425
**No third party is contacted while holdings and settings are used** | Level: API | P1 | EG
- **Preconditions:** NetBlock (any outbound HTTP fails the test); JWKS served from the local set.
- **Input:** the full sequence: create a held stock, patch, clear, read all, save and clear settings, read `/openapi.json`.
- **Expected:** every call succeeds; NetBlock records zero outbound requests (database traffic over `pg` is not HTTP and is allowed); no provider, analytics or exchange-rate host is resolved.
- **Mock needed:** LocalJWKS, DB, NetBlock. **Covers:** NFR-004.

### Contract and exposure

### TC-A-426
**OpenAPI describes the new contract** | Level: API | P2 | EP
- **Input:** `GET /openapi.json`.
- **Expected:** `Stock` has `holding` (nullable object of `shares`, `averageCost` strings nullable, `costCurrency` enum `USD`/`THB`); `POST /stocks` and `PATCH /stocks/{id}` request bodies document an optional `holding`; `/settings` has `get` and `patch` with the three response fields and `bearerAuth` on both; no `/concentration` path exists; no `shares` or `averageCost` is typed as `number`.
- **Mock needed:** none. **Covers:** FR-003, NFR-003.

### TC-A-427
**The Data API cannot reach the new tables** | Level: Supabase | P1 | EG
- **Preconditions:** `pnpm test:supabase` stack; `scripts/lib/stack.ts` helpers; a user with a holding and settings (created through the API).
- **Input:** with the anon key and with a user's access token: `GET /rest/v1/holdings` and `/rest/v1/user_settings` using `Accept-Profile: app` and also the default profile; `POST`, `PATCH`, `DELETE` on both; `psql` as `anon` and `authenticated`: `select * from app.holdings`, `select * from app.user_settings`.
- **Expected:** every REST call is `401`, `403` or `404` (never `200` with rows); SQL as `anon`/`authenticated` fails with `permission denied`; `pg_tables`/`pg_class` show `rowsecurity = true` for both tables and `pg_policies` has no rows for them; the same query as the API's database role succeeds (so the exposure check proves refusal, not a broken table). Extends the Stock Lists TC-A-106 check.
- **Mock needed:** DB. **Covers:** NFR-003, NFR-004.

### TC-A-428
**Migration on a populated database, and tables an export can read** | Level: Integration | P2 | EP
- **Preconditions:** `db:reset` to the Stock Lists migrations with sample stocks, then apply `*_holdings.sql`.
- **Input:** apply the migration; `select column_name, data_type, numeric_precision, numeric_scale, is_nullable from information_schema.columns` for both tables; `select s.ticker, h.shares, h.average_cost, h.cost_currency from app.stocks s join app.holdings h using (...)`; the drift test; rerun `db:reset`.
- **Expected:** the migration applies with existing stock rows untouched; columns match design.md (`shares numeric(18,4)`, `average_cost numeric(18,4)`, `cost_currency text not null`, rate `numeric(18,6)`, threshold `smallint default 40`); a plain SQL join exposes every holding with its ticker and user (the shape an export needs, NFR-008); `schema.drift.test.ts` is green with both tables; a second `db:reset` succeeds (idempotent from scratch).
- **Mock needed:** DB. **Covers:** NFR-008, FR-001, FR-011.

---

## 8. Web component and static cases (TC-C)

Shared setup: Testing Library with jsdom, `createRoutes(FakeAuthClient.signedIn(), stubApi.client())`
and `renderApp(path, stubApi)`; `makeStock` has `holding: null` by default; user-event with real
keyboard events; `TZ=Asia/Bangkok` where dates appear; toasts through the mocked `sonner`.

### Formatting

### TC-C-400
**Money, shares and percent formatting from decimal strings** | Level: Unit | P1 | BVA, EG (table-driven)
- **Input rows:** total value `"1234567.8900"` THB; `"12345.6700"` USD; `"0.0000"` THB; HC-D `1.0000 x 1.0050` USD; `0.0001 x 0.0001` USD; `99999999999999.9999 x 99999999999999.9999` THB; average cost `"412.3300"`, `"412.3000"`, `"5.0000"`, `"0.1234"`; shares `"120.5000"`, `"10.0000"`, `"0.0001"`; percent of 1/16, 3/16, 12/16, 1/3, 39.96 (as 3996/10000), 99.95 (9995/10000), 0.04 (4/10000).
- **Expected:** `฿1,234,567.89`; `$12,345.67`; `฿0.00`; `$1.01` (half up, exact; a float would give `$1.00`); `$0.00`; `฿9,999,999,999,999,999,980,000,000,000.00`; average cost `$412.33`, `$412.30`, `$5.00`, `$0.1234` (trailing zeros trimmed down to a minimum of two decimals, up to 4; proposed, G-2); shares `120.5`, `10`, `0.0001`; percents `6.3`, `18.8`, `75.0`, `33.3`, `40.0`, `100.0`, `0.0` (one decimal, half up: 6.25 is `6.3`, never banker's `6.2`). All numbers carry `tabular-nums`; no output contains `e+`, `NaN` or `Infinity`; the helper never calls `Number()` or `parseFloat` on its input (see C-435).
- **Mock needed:** none. **Covers:** FR-003, NFR-005.

### Holding in the stock form

### TC-C-401
**The Holding card reveals its fields on tick, focus stays** | Level: Component | P1 | ST
- **Preconditions:** `/stocks/new` (create) and `/stocks/:id/edit` of a not-held stock.
- **Input:** read the card; tick "I hold this stock" with Space; Tab; untick.
- **Expected:** unticked: heading `Holding` (`h2`) and the checkbox only, no shares, cost or currency controls in the DOM (so not in the tab order); after ticking, focus is still on the checkbox, Shares, Average cost and the currency radio group appear, and Tab goes checkbox → Shares → Average cost → currency radios; unticking removes the fields again; the card sits after the lens cards and before Lists (create) or last (edit).
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-001, FR-004.

### TC-C-402
**Decimal inputs: attributes and client validation table** | Level: Component | P1 | BVA, EG (table-driven)
- **Input rows (shares / average cost):** `0` / -; `0.0001` / -; `99999999999999.9999` / -; `100000000000000` / -; `1.23456` / -; `1,5` / -; `1e3` / -; `abc` / -; ` 12 ` / -; `-1` / -; - / `0`; - / `-0.5`; - / `1.23456`; - / `99999999999999.9999`; both empty; then Save.
- **Expected:** both inputs are `type="text"`, `inputMode="decimal"`, `autoComplete="off"`, `tabular-nums`; accepted rows send the strings exactly as typed (trimmed: ` 12 ` sends `"12"`; proposed, G-8); every invalid row sends no request, shows the message under the field (linked by `aria-describedby`, `aria-invalid`), the message names the limit ("up to 4 decimal places", "greater than 0") and focus goes to the first invalid field (`data-field="holdingShares"` before `holdingAverageCost`); both empty is valid ("held, amount unknown") and sends `holding: { shares: null, averageCost: null, costCurrency: "USD" }` for a US stock in create mode (proposed shape, G-3).
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-002, FR-003.

### TC-C-403
**Cost currency radio and the cost prefix** | Level: Component | P2 | DT
- **Input:** Held ticked: US market; switch to TH; pick USD by hand; switch market US, TH again; operate the radios with arrow keys.
- **Expected:** US shows `$` prefix and USD checked; TH shows `฿` and THB checked; after the manual USD pick the radio stays USD through market changes and the prefix is `$`; arrow keys move between USD and THB and update the prefix at once; the radios have a legend ("Cost currency") and the group is one tab stop.
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-002.

### TC-C-404
**Edit form: prefill, no change, untick** | Level: Component | P1 | ST
- **Preconditions:** NVDA held `"120.5000"`, `"412.3300"`, USD, and PTTEP held with `{}`.
- **Input:** open `/stocks/NVDA/edit`; read the fields; Save with no change; then untick and Save; then (new load) tick and untick on a not-held stock and Save.
- **Expected:** fields show `120.5` and `412.33` (trailing zeros trimmed), USD checked; Save with no change sends no request and toasts "No changes to save"; unticking sends `{ holding: null }` only; on PTTEP the card is ticked with empty fields; tick-then-untick on a not-held stock sends no `holding` key and no request when nothing else changed.
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-001, FR-004.

### TC-C-405
**Saving state and server errors in the form** | Level: Component | P2 | EG
- **Input:** hold the `POST` pending and press Enter twice; then answers `400 errors [{ path "holding.shares", message }]`, `400` with `holding.averageCost`, `409`, `500`, network failure (status 0).
- **Expected:** one request only for the double submit; Shares, Average cost, currency and Save are `disabled` while saving and the Save spinner has `motion-reduce:animate-none`; a `holding.*` path shows under its field with `aria-invalid` and takes focus; `500` and network show the existing form alert with all typed values (including the holding) kept; after an error a second Save works.
- **Mock needed:** StubApi, FakeAuth, FakeTimers. **Covers:** FR-002, FR-004.

### Holding card and dialog on the stock page

### TC-C-406
**The Holding card in each state** | Level: Component | P1 | EP, ST
- **Input:** `/stocks/:id` for: not held; held with `{}`; held with shares and cost; held with shares only; held with cost only; THB holding on a TH stock; USD cost on a TH stock.
- **Expected:** not held: `Not held` text and a **Mark as held** button (no Edit, no figures); held with no amounts: `Held` badge, `Edit`, "Amount not entered." and "Add shares and cost to include it in value weights."; held with both: rows Shares `120.5`, Average cost `$412.33`, Cost `$49,685.77` (the card never converts to THB); shares only: Shares row only, no Cost row, and the include-it hint (proposed, G-3); cost only: Average cost row only plus the hint; USD cost on a TH stock shows `$`; the card is `h2` "Holding" in the right column above Lists at `lg` classes and between Classification and Lists below.
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-001, FR-002, FR-004.

### TC-C-407
**Card cost is exact** | Level: Component | P1 | BVA, EG
- **Input:** holdings from HC-D: `1.0000 x 1.0050` USD, `0.0001 x 0.0001` USD, `1000.0000 x 20.5000` THB, `120.5000 x 412.3300` USD, `99999999999999.9999 x 99999999999999.9999` THB.
- **Expected:** Cost `$1.01`, `$0.00`, `฿20,500.00`, `$49,685.77` (49,685.765 rounds half up), `฿9,999,999,999,999,999,980,000,000,000.00`; no `NaN` or exponent text; the long number wraps or fits without breaking the card width (`overflow-wrap` set; no horizontal scroll at the container).
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-003, NFR-005.

### TC-C-408
**Dialog keyboard and focus rules** | Level: Component | P1 | ST
- **Input:** keyboard only: focus **Mark as held**, Enter; read focus; Tab through; Esc; reopen via **Edit**; Cancel; Save; open on a held stock and press **Stop holding**.
- **Expected:** the dialog is labelled "Holding · NVDA"; focus starts in Shares; focus is trapped (Tab cycles inside, Shift+Tab from Shares reaches the close button); Esc closes and focus returns to the button that opened it (**Mark as held** or **Edit**); Cancel discards typed values (reopening shows the stored values); after Save focus returns to the opener; after Stop holding focus goes to **Mark as held** (the opener is gone); **Stop holding** is shown only when the stock is held, is a plain button without destructive classes and sits at the left of the footer.
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-001, FR-004, NFR-006.

### TC-C-409
**Stop holding, Undo, and the Undo window** | Level: Component | P2 | ST
- **Input:** (a) NVDA held fully: Stop holding, press Undo. (b) PTTEP held `{}`: stop, Undo. (c) stop, wait 5 s and 1 ms with FakeTimers, look for Undo. (d) stop, Undo while `PATCH` answers `500`.
- **Expected:** (a) `PATCH { holding: null }` then `PATCH { holding: { shares: "120.5000", averageCost: "412.3300", costCurrency: "USD" } }`; card back to figures; toast "NVDA no longer held" with **Undo**; (b) Undo restores the held-unknown state, `{ shares: null, averageCost: null, costCurrency: "THB" }`; (c) the toast and its Undo are gone after 5 s; (d) an error toast or alert says it could not restore and the card stays Not held.
- **Mock needed:** StubApi, FakeAuth, FakeTimers. **Covers:** FR-001.

### TC-C-410
**Dialog save failures keep the dialog and values** | Level: Component | P2 | EG
- **Input:** `set-holding` answered `400 holding.shares`, `404` (stock deleted elsewhere), `500`, network failure; `clear-holding` answered `500`; Save pending then Enter again.
- **Expected:** `400` shows the message under Shares (`aria-invalid`, focus); `404` shows an Alert at the top of the dialog (copy proposed: "This stock no longer exists.", G-11); `500` shows "Couldn't save the holding. Try again."; network failure the same alert; the dialog stays open with all values; one request for the double Enter; Save shows `Loader2Icon` with `motion-reduce:animate-none` and all controls are disabled while saving; the card is unchanged after a failure.
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-002, FR-004.

### Held column

### TC-C-411
**Held column display and exact sort** | Level: Component | P1 | EP, BVA
- **Preconditions:** `/stocks` with NVDA held `"120.5000"`, TSLA held `"9.0000"`, MSFT held `"10.0000"`, BIG1 held `"99999999999999.9999"`, BIG2 held `"99999999999999.9998"`, PTTEP held without shares, AAPL not held.
- **Input:** read the column; click the Held sort header up to three times.
- **Expected:** a held stock shows the `Held` badge and shares (`120.5`, `9`, `10`); PTTEP shows `Held` alone; AAPL shows `—` with `sr-only` "Not held"; the sort header has `aria-sort` cycling none → one direction → the other; the default Held order is held first, then shares descending: BIG1, BIG2, NVDA, MSFT, TSLA (exact comparison: 10 > 9, BIG1 > BIG2, where a string or float compare fails), then PTTEP (held, no shares), then AAPL; the sorted order is stable for ties (tie-break proposed: by ticker, G-15); the table caption mentions Held when it is the sort key.
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-004, FR-003.

### TC-C-412
**Held marker on the list page and the stock page** | Level: Component | P2 | EP
- **Input:** `/lists/:id` with held and not-held members; `/stocks/:id` of a held stock.
- **Expected:** the same Held column and badge appear on the list page (columns: Held after Sector, `showLists` unaffected); the stock page header area or card shows `Held` with shares when known; the Remove-from-list action and undo still work with the new column (regression).
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-004.

### Concentration page

### TC-C-413
**Lens catalogue: 16 lenses in order, with labels and groups** | Level: Component | P1 | EP (table-driven, 16 rows)
- **Preconditions:** a fixture of 3 stocks with distinct values in every lens field.
- **Input:** open the Group by select; choose each lens in turn.
- **Expected:** exactly 16 options in the order of FR-006: Sector (GICS), SET industry group, Value chain position, Value chain name, Size, Style, Economic cycle, Lynch type, Life cycle, Customers, Revenue types, Moat, Themes, Volatility, Market, Index membership (order and labels come from `CONCENTRATION_LENSES`; mismatch with design.md's list order is G-1); each lens groups by the right stock field (value chain name vs position not swapped; SET industry group shows `Not set` for US stocks; `market` gives `US`/`TH`; `indexMembership` gives a group per index); an unset single value or `[]` goes to `Not set`.
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-006.

### TC-C-414
**Scope select and scope filtering** | Level: Component | P1 | EP
- **Preconditions:** HC-A with lists `Core holdings` (NVDA, MSFT, PTTEP) and `Empty list` (none).
- **Input:** open Scope; read options; choose each.
- **Expected:** options `All stocks (8)`, `Held stocks (5)`, then a group labelled "Lists" with `Core holdings (3)` and `Empty list (0)`; All = 8 stocks, Held = 5, list = its 3; the count view and the stocks in each group follow; counts update when the stub data changes after a revalidation.
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-005.

### TC-C-415
**Count view: columns, order, Not set last** | Level: Component | P1 | EP, BVA
- **Input:** HC-A, scope all, lens sector, measure count; then a lens where `Not set` is the largest group; then two groups with equal counts.
- **Expected:** columns Group, Stocks, Share, Flag (no Value column, no left-out note); rows IT 3 `37.5%`, Financials 2 `25.0%`, Energy 1, Health Care 1 (tie ordered by label), Not set 1 last; with `Not set` largest it is still last; shares are of the stocks in scope (denominator 8); one decimal; the `Stocks` cell is a number, right aligned.
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-007.

### TC-C-416
**Value view with and without a rate (decision table)** | Level: Component | P1 | DT (8 rows: held x amount x currency/rate)
- **Input:** HC-A, scope all, measure value, with rate `"36.250000"`; the same with `usdThbRate: null`; plus HC-D `0.1 + 0.2` in one group.
- **Expected:** with rate: columns Group, Value (THB), Share, Stocks; IT `฿72,500.00` `67.1%`, Energy `฿20,500.00` `19.0%`, Financials `฿15,000.00` `13.9%`, Health Care and Not set `฿0.00` `0.0%` (proposed, G-5); ordered by value, `Not set` last; without rate: total 35,500.00, Energy `57.7%`, Financials `42.3%`, IT `฿0.00`; each valued stock counted once; HC-D group shows `฿0.30`; a THB-cost USD-market stock converts correctly; the numbers come from the same `groupConcentration` as TC-U-422.
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-005, FR-008.

### TC-C-417
**The flag uses the exact share (BVA around the threshold)** | Level: Component | P1 | BVA
- **Input:** HC-B (X 39.96%, Y 60.04%) in the value view at threshold 40; X edited to exactly 40.00; share 40.01; threshold 1 with every group; threshold 100 with a single-group scope; HC-C (6.25, 18.75) in the count view; `Not set` at 100%.
- **Expected:** X shows `40.0%` with **no** badge and is absent from the summary; exactly 40.00 is flagged (equal or above); 40.01 flagged; threshold 1 flags every non-`Not set` group with "Over 1%"; threshold 100 flags a group of 100.0% only; `6.3%` and `18.8%` (half up); `Not set` is never flagged, even at 100%, and still shows its share; the badge text is `Over 40%` and reads `Over 35%` at threshold 35; count and value measures each use their own flag (a group flagged by count can be unflagged by value after switching).
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-010, NFR-005.

### TC-C-418
**Flagged summary: text, icon, plural, none, live region** | Level: Component | P1 | EP, ST
- **Input:** HC-A scope held (IT flagged); scope all count (none flagged); value with rate (IT flagged); a case with two flagged groups; switch measure and threshold while watching the summary.
- **Expected:** `1 group at 40% or more of value at cost` / `2 groups at 40% or more of the stocks` (singular and plural; wording of the measure follows the measure); the list reads `Information Technology — 52.0%`-style (name, em dash, share), largest first; none flagged shows `No group at 40% or more of the stocks` (or "of value at cost") with a check icon; the flag badge is `Badge variant="outline"` with the text in `text-foreground` and a `TriangleAlertIcon` with `aria-hidden="true"` and `text-destructive`; text is always present (flag never by colour alone); the summary has `role="status"`, no element has `role="alert"`; the summary footer repeats the threshold and the rate.
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-010, NFR-006.

### TC-C-419
**Left-out note names who is not in the value** | Level: Component | P1 | DT
- **Input:** HC-A, measure value, no rate; then with a rate; scope held; a dataset with nothing left out; singular and plural variants (1 vs 2 USD holdings, 1 vs 3 not held); count measure.
- **Expected:** no rate: "Not in the value: 1 held stock without shares or cost (AAPL) · 2 USD holdings need a rate [Set rate] · 3 stocks not held" with the tickers as links to `/stocks/:id` (the not-held count links to `/stocks`; proposed, G-18); singular "1 USD holding needs a rate"; with a rate the needs-rate part disappears; scope held omits "not held"; nothing left out shows no note; the count measure shows no note; **Set rate** is a button (`variant="link"`) that opens the settings dialog (C-428); USD holdings are in the left-out count when no rate exists and are counted in count shares.
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-009, FR-011.

### TC-C-420
**Value measure availability** | Level: Component | P1 | DT
- **Input:** scope held with held stocks that have no amounts; scope with held USD stocks only and no rate; scope with only not-held stocks; scope with held stocks all of cost `"0"` (total 0); `?measure=value` in the address for each.
- **Expected:** no valued stock in scope: the Value radio is `disabled` with the reason "No held stock in this scope has shares and cost. Mark holdings on a stock's page." (link to `/stocks`) and the page shows the count view; with `measure=value` in the address it still shows count and says why (address not rewritten); USD-only without a rate: the reason names the rate and offers Set rate; zero total value: Share cells show `—` (value shares null), no value flags, and a note "Every valued stock has a cost of 0, so there are no shares." (proposed, G-4); a scope with held stocks that have no amounts but others valued stays enabled.
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-005, FR-013.

### TC-C-421
**Multi-value lenses: counted in each group, note shown** | Level: Component | P1 | EP (table-driven over the 16 lenses)
- **Input:** HC-H, each lens; themes count view and value view.
- **Expected:** for `customers`, `revenueTypes`, `themes`, `indexMembership` the note "A stock with several themes counts in each of them, so the shares add up to more than 100%." is shown (the lens name in the text follows the lens, e.g. "customers"); for the other 12 lenses it is hidden; themes shows AI `66.7%`, EV `33.3%`, Not set `33.3%` (sum 133.3%); the value view counts a stock's value once in the total but in every group it has (shares above 100% in total); a stock with two index memberships appears in two sub-rows.
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-007, FR-008.

### TC-C-422
**Address state: defaults, `replace`, restore, fallbacks** | Level: Component | P1 | EP, EG (table-driven)
- **Input:** open `/concentration` without params; change each control; reload (`createMemoryRouter` with `initialEntries`) `?scope=held&lens=moat&measure=value`; press Back; rows: `?scope=<list id>`, `?scope=<deleted id>`, `?scope=<another user's list id>`, `?scope=ALL`, `?lens=banana`, `?lens=STYLE`, `?measure=VALUE`, `?measure=sum`, `?scope=a&scope=b`, `?lens=`, `?scope=%3Cscript%3E`, three bad params together.
- **Expected:** defaults All stocks / Sector (GICS) / Count with no params in the address until a control changes; a control change navigates with `replace` (history length unchanged; Back leaves the page, not the previous tweak) and the address becomes the exact canonical form `?scope=all&lens=style&measure=value`; the restored address restores every control; a valid list id selects it; a deleted list, another user's list id and a malformed id all give the same status note "That list no longer exists. Showing all stocks." (no hint that the id belongs to someone else); unknown or wrongly cased lens and measure fall back to the default with a note (copy proposed: "That grouping isn't available. Showing Sector (GICS).", G-6) in a `role="status"` Alert with `InfoIcon`; several bad params give one note per problem; a script string is rendered as text or ignored, never as HTML; none of these causes a request.
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-012.

### TC-C-423
**Empty states and the advice note** | Level: Component | P1 | EP
- **Input:** `GET /stocks` returns `[]`; scope = a list with no stocks; scope held with no held stock and count measure; a normal page.
- **Expected:** no stocks: Card "Nothing to group yet" ("Add stocks to see how they are spread across each lens."), links `Add stock` (`/stocks/new`) and `Import` (`/import-export`), no controls; an empty list: "Core holdings has no stocks yet." with an "Open Core holdings" link; held scope with none held and count measure: a note that no stock is marked as held yet with a link to `/stocks` (proposed, G-5); the advice note "These groupings and costs are your own classifications, not advice." is present on the page in every state that shows the table, and in the empty states (proposed, G-19) it is present as well; it is `text-xs text-muted-foreground`.
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-013, FR-014.

### TC-C-424
**Expand a group** | Level: Component | P1 | ST
- **Input:** HC-A: activate "Show stocks in Information Technology" by mouse; Enter; Space; open two groups; a multi-value stock in two groups; collapse.
- **Expected:** each expand button has the accessible name "Show stocks in <Group>", `aria-expanded` and `aria-controls` pointing at an existing sub-row id; expanded shows ticker links (`/stocks/:id`) wrapping with `flex-wrap`; several groups can be open at once; collapsed content is removed from the tab order; `Not set` can be expanded and lists ZZZ; the chevron has `data-[state=open]:rotate-90` and `motion-reduce:transition-none`.
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-007, NFR-006.

### TC-C-425
**Table semantics, bar and phone columns** | Level: Component | P2 | EP
- **Input:** HC-A, each measure.
- **Expected:** a native `table` with an `sr-only` caption "Stocks grouped by Sector (GICS), by value at cost, all stocks" (measure and scope names follow the controls; "list Core holdings" for a list); `th` header cells; numeric cells `text-right tabular-nums`; the share bar is a `div` with `aria-hidden="true"`, no role, no text, width equal to the share; the percentage text is the only figure carrier; the Stocks and Value cells have `hidden sm:table-cell`, and the Group cell shows a secondary line (`text-xs text-muted-foreground`, "8 stocks" or the value) for the narrow layout; the flag badge sits under the share on narrow screens.
- **Mock needed:** StubApi, FakeAuth. **Covers:** NFR-006, NFR-007.

### TC-C-426
**Keyboard order and focus stability** | Level: Component | P1 | UC
- **Input:** from the page start press Tab repeatedly with a value view, a left-out note and one open group; operate Scope and Group by with Enter, Space, arrows and type-ahead; change the measure with arrow keys; change each control and read `document.activeElement`.
- **Expected:** order Settings → Scope → Group by → Measure (one stop, arrows between options) → each expand button → ticker links inside an open group → Set rate → advice-note links; selects open with Enter or Space, arrow keys move, Enter selects, type-ahead jumps (`S` → Sector); regrouping never moves focus away from the control that was used; the summary regroup is announced through its `role="status"`, not by moving focus.
- **Mock needed:** StubApi, FakeAuth. **Covers:** NFR-006.

### TC-C-427
**Regrouping 200 stocks is under 200 ms and sends no request** | Level: Component | P2 | performance
- **Preconditions:** HC-E (200 stocks, multi-value lenses); production-like build of the component is not required; jsdom timing is a loose upper bound (G-17); `StubApi` counts calls.
- **Input:** 20 alternating changes each of scope, lens (including themes) and measure, timing each from the event to the updated table in the DOM.
- **Expected:** the p95 of each control's change is under 200 ms; the stub saw no `GET` after the loader's three; the groups are correct after the last change (checked against `groupConcentration` directly).
- **Mock needed:** StubApi, FakeAuth. **Covers:** NFR-001.

### Settings dialog

### TC-C-428
**Settings dialog: openers, focus, content** | Level: Component | P1 | ST
- **Input:** open from the header **Settings** button; close with Esc; open from **Set rate**; with a rate saved on `2026-11-23T10:00:00.000Z` and with none.
- **Expected:** title "Concentration settings"; Threshold input (`inputMode="numeric"`, `%` addon, `w-28`), "Exchange rate, THB per 1 USD" input (`inputMode="decimal"`, `THB` addon), "1 USD =" label; focus starts in Threshold from the header button and in the Rate field from Set rate; Esc closes and focus returns to the opener; with a rate the help reads "Used to add USD costs to THB values. Saved 23 Nov 2026." and the field shows `36.25` (from `"36.250000"`); with none "No rate saved. USD holdings are left out of value weights until you add one." and **Clear rate** is disabled when the field is empty; the header Settings button is `w-full sm:w-auto`.
- **Mock needed:** StubApi, FakeAuth, TZ. **Covers:** FR-011.

### TC-C-429
**Settings validation table** | Level: Component | P1 | BVA, EG (table-driven)
- **Input rows (threshold / rate):** `0`; `1`; `100`; `101`; `40.5`; `4e1`; `-5`; ` 40 `; empty; - / `0`; - / `0.000001`; - / `999999999999.999999`; - / `1000000000000`; - / `1.1234567`; - / `36,25`; - / `abc`; `0` and `1.1234567` together.
- **Expected:** valid rows send only the changed fields as strings (`usdThbRate: "0.000001"`), threshold as a number; every invalid row sends no request, shows an error under its field (`aria-invalid`, `aria-describedby`) naming the limit ("a whole number from 1 to 100", "up to 6 decimal places"), keeps the dialog open and focuses the first invalid field (Threshold before Rate); an empty threshold is invalid; an empty rate is "no change" when none was saved and a clear when one was (see C-430).
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-011.

### TC-C-430
**Settings save, clear, no change and failure** | Level: Component | P1 | ST
- **Input:** change the threshold only; change the rate only; Clear rate then Save; Save with nothing changed; Save answered `400` with path `usdThbRate`; `500`; network failure; double Enter while saving.
- **Expected:** `PATCH /settings` body has only the changed field; clear sends `usdThbRate: null` and the help text becomes the no-rate text; success closes the dialog, toasts "Settings saved" (mocked `sonner`) and the page regroups from the revalidated loader (no manual refetch in the component); no change closes without a request and with the toast "No changes to save" (proposed, G-10); `400` shows under the field, dialog open; `500` and network show an Alert in the dialog with the typed values kept; one request for the double Enter; the Save spinner has `motion-reduce:animate-none`; all controls disabled while saving.
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-011.

### TC-C-431
**Summary footer: threshold, rate and its date** | Level: Component | P2 | EP
- **Input:** settings `{ 40, "36.250000", "2026-11-23T10:00:00.000Z" }`; `{ 35, null, null }`; `{ 40, "36.123457", "2026-11-23T20:00:00.000Z" }` with `TZ=Asia/Bangkok`.
- **Expected:** "Threshold 40% · 1 USD = 36.25 THB, saved 23 Nov 2026"; with no rate "Threshold 35% · No exchange rate saved" (proposed); a six-decimal rate shows all six decimals (`36.123457`); the date is the browser's local date (the third row reads `24 Nov 2026` in Bangkok; G-9); the footer appears in the flagged and the none-flagged states and in the left-out note's rate part.
- **Mock needed:** StubApi, FakeAuth, TZ. **Covers:** FR-010, FR-011.

### Route, loading, errors and privacy

### TC-C-432
**Loader: loading state, failures, expired session** | Level: Component | P2 | EG
- **Input:** hold the loader pending; `GET /settings` `500` with the other two `200`; `GET /stocks` network failure; `GET /lists` `404`; a `401` on first call then success after refresh; `401` twice.
- **Expected:** while pending the route `HydrateFallback` (`PageSkeleton`) shows; any one failing request shows `RouteError` (no half-rendered page, no partial numbers); the requests are issued in parallel (all three started before the first resolves); a `401` is handled by the api client's one refresh and retry, then sign-in via `sessionEndedHandler`; no stack trace or request body appears in the UI.
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-005, NFR-003.

### TC-C-433
**Route table, title, breadcrumb, nav** | Level: Component | P2 | EP
- **Input:** `createRoutes(...)`: `/concentration`, `/concentration?scope=held`, `/concentration?lens=banana`, `/stocks` in the sidebar.
- **Expected:** `/concentration` renders the lazy view with the loader and action attached (no longer `PagePlaceholder`); `document.title` and the focused `h1` read "Concentration"; the breadcrumb is `Concentration`; the nav item "Concentration" is active; the `save-settings` intent is the only action intent and an unknown intent returns `{ ok: false }` without a request; each param variant renders without throwing.
- **Mock needed:** StubApi, FakeAuth. **Covers:** FR-012.

### TC-C-434
**Web privacy: values stay out of the address, storage and third parties** | Level: Component | P1 | EG
- **Input:** use the form, the dialog and the settings dialog with HC-G sentinels; walk `/concentration` through all controls.
- **Expected:** `location` (path, search, hash) and router state never contain a sentinel (the address carries only `scope`, `lens`, `measure`); `localStorage`, `sessionStorage` and cookies contain none; `document.title` contains none; every `fetch` goes to a relative `/api/...` URL (no other host) and the sentinel appears only in the body of the `POST`/`PATCH` that sets it; no `console.error` or `console.log` call contains a sentinel (spied).
- **Mock needed:** StubApi, FakeAuth. **Covers:** NFR-004.

### TC-C-435
**No floating-point arithmetic on money** | Level: Static | P1 | EG
- **Input:** a Vitest file reads `packages/domain/src/concentration*.ts`, `decimal*.ts`, `apps/web/src/features/concentration/**`, the holding files under `apps/web/src/features/stocks/**` and `apps/web/src/lib/format-*.ts`.
- **Expected:** none of these files calls `parseFloat`, `Number(`, unary `+` on shares, cost or rate, `toFixed`, `Math.round`, or types `shares`, `averageCost`, `usdThbRate` as `number`; an explicit allowlist (`Number.isInteger` for the threshold, `Number(threshold)` for the integer threshold only, `Intl.NumberFormat` fed with strings) is the only exception and is listed in the test; the oxlint rule set for these paths is part of `pnpm lint`.
- **Mock needed:** none. **Covers:** FR-003, NFR-005.

### TC-C-436
**Motion preferences on the new animations** | Level: Component | P3 | EG
- **Input:** render every new spinner (holding dialog Save, settings Save, form Save) and the group chevron.
- **Expected:** each `Loader2Icon animate-spin` has `motion-reduce:animate-none`; the chevron has `motion-reduce:transition-none`; the existing "every spinner needs motion-reduce" test still passes with the new files.
- **Mock needed:** StubApi, FakeAuth. **Covers:** NFR-006.

---

## 9. End-to-end cases (TC-E)

Shared setup: Playwright (Chromium), web and API in `supabase` mode through `scripts/e2e-servers.mjs`,
local Supabase, a fresh confirmed `@example.test` user per test (AdminAPI) signed in through storage
state, data seeded through SeedAPI (`apiAs`, updated to send and read `holding`). Mock-mode cases
say so. Dataset HC-A is seeded by a helper `seedHoldingsDataset(user)` in `e2e/lib/hc.ts`.

### Holdings in the stock UI

### TC-E-400
**Mark a US stock as held while adding it** | Level: E2E | P1 | UC (UC-001)
- **Preconditions:** user with list `Core holdings`.
- **Input:** `/stocks` → Add stock; market US, ticker `nvda`, exchange NASDAQ, name `NVIDIA Corporation`, sector Information Technology; tick "I hold this stock"; shares `120.5`, average cost `412.33`, currency USD (default); Save; reload.
- **Expected:** toast `NVDA added`; `/stocks/{id}` Holding card shows `Held`, Shares `120.5`, Average cost `$412.33`, Cost `$49,685.77`; `/stocks` shows NVDA with `Held 120.5`; `GET /api/stocks/{id}` returns `holding { "120.5000", "412.3300", "USD" }`; everything survives reload.
- **Mock needed:** AdminAPI. **Covers:** FR-001, FR-002, FR-003, FR-004.

### TC-E-401
**TH stock held with unknown amount; currency follows the market** | Level: E2E | P1 | UC, DT
- **Input:** add TH SET `pttep` with the Holding card ticked and both fields empty; then another TH stock `kbank` with shares `100`, cost `150` and currency changed to USD by hand.
- **Expected:** the cost prefix is `฿` and THB is checked for TH; PTTEP is saved, card shows "Amount not entered."; KBANK shows `$150.00` and `Cost $15,000.00`; API shows `{ shares: null, averageCost: null, costCurrency: "THB" }` for PTTEP and USD for KBANK.
- **Mock needed:** AdminAPI. **Covers:** FR-001, FR-002, FR-004.

### TC-E-402
**Edit the holding in the form; unrelated edits leave it alone** | Level: E2E | P1 | ST
- **Preconditions:** NVDA held as in TC-E-400.
- **Input:** Edit; change name only, Save; Edit; change shares to `130`, Save; Edit; untick Held, Save.
- **Expected:** after step 1 the holding is unchanged; after step 2 shares `130`, cost `$412.33`; after step 3 the card shows `Not held` and `GET /api/stocks/{id}` has `holding: null`; the toast reads `NVDA updated` each time.
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** FR-001, FR-004.

### TC-E-403
**Stock page dialog: mark, edit, stop, Undo (keyboard only)** | Level: E2E | P1 | UC, ST
- **Preconditions:** AAPL not held.
- **Input:** using only the keyboard: focus **Mark as held**, Enter; Save with empty fields; **Edit**, type shares `10` and cost `150`, Save; **Edit**, **Stop holding**; Tab to the toast Undo and press Enter; reload.
- **Expected:** toasts "AAPL marked as held", then saved, then "AAPL no longer held" with Undo; focus lands as in TC-C-408 (opener, then **Mark as held** after stopping); Undo restores `10`/`150`/USD in the card and the API; after reload the holding is still there; no mouse event was used (test fails on any `click` call).
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** FR-001, FR-002, FR-004, NFR-006.

### TC-E-404
**Held column on stocks and list pages, sort and reload** | Level: E2E | P2 | EP
- **Preconditions:** HC-A with lists.
- **Input:** `/stocks`, sort by Held; `/lists/{Core holdings}`; reload.
- **Expected:** NVDA, MSFT, PTTEP, KBANK show `Held` with shares, AAPL `Held` only, the other three `—`; Held sort puts held with larger shares first, then AAPL, then not held; the list page shows the same marker for its three members; reload keeps the data (the sort is view state only).
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** FR-004.

### TC-E-405
**Deleting a stock removes its holding; re-adding does not resurrect it** | Level: E2E | P2 | ST
- **Input:** delete NVDA (held) from its page; open `/concentration` scope held; add `NVDA` again without a holding.
- **Expected:** after the delete the Held count and the concentration view no longer include NVDA; the re-added NVDA is `Not held`; `GET /api/stocks` shows `holding: null` for it.
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** FR-001.

### Concentration

### TC-E-406
**Concentration: default views, scopes, lenses, expand** | Level: E2E | P1 | UC (UC-003), pairwise
- **Preconditions:** HC-A seeded; threshold 40, no rate.
- **Input:** open `/concentration`; read; Scope held; Scope `Core holdings`; Group by Market, Style, Economic cycle, SET industry group; expand `Information Technology`; click a ticker; return with Back.
- **Expected:** default is All stocks / Sector (GICS) / Count with HC-A's figures (IT `37.5%`, Financials `25.0%`, Energy, Health Care `12.5%`, Not set `12.5%`), "No group at 40% or more of the stocks"; scope held shows IT `60.0%` flagged with `Over 40%` and the summary "1 group at 40% or more of the stocks"; `Core holdings` shows IT `66.7%`; each lens regroups with no network request (assert via request log); expanding shows NVDA, MSFT, AAPL links; the ticker opens `/stocks/{id}`; Back returns to the same view (same params); the advice note and the "Not set" row (never flagged) are visible.
- **Mock needed:** AdminAPI, SeedAPI, PwRoute (request counting). **Covers:** FR-005, FR-006, FR-007, FR-010, FR-012, FR-014.

### TC-E-407
**Value at cost: left-out note, then set the rate and USD joins** | Level: E2E | P1 | UC (UC-004), ST
- **Preconditions:** HC-A seeded; no rate.
- **Input:** Measure Value at cost; read the note; **Set rate**; type `36.25`; Save; read the table; open Settings, Clear rate, Save.
- **Expected:** before the rate: total 35,500.00, Energy `57.7%` flagged, Financials `42.3%` flagged ("2 groups at 40% or more of value at cost"), note "1 held stock without shares or cost (AAPL) · 2 USD holdings need a rate · 3 stocks not held"; focus starts in the rate field; after saving: toast "Settings saved", IT `฿72,500.00` `67.1%` flagged, Energy `19.0%`, Financials `13.9%`, the needs-rate note gone and the footer "1 USD = 36.25 THB, saved <today's date>"; after Clear the view returns to the no-rate numbers; `GET /api/settings` agrees at each step (`"36.250000"`, then `null` with a `null` date).
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** FR-005, FR-008, FR-009, FR-011.

### TC-E-408
**Threshold and rate persist across reload and across devices** | Level: E2E | P2 | ST
- **Input:** set threshold `35` and rate `36.25`; reload; open a second browser context signed in as the same user.
- **Expected:** `Over 35%` appears on a 37.5% group in the count view in both contexts; the rate and its date show in both; the second context needed no local state (empty storage); setting the threshold to `100` then removes every flag; `1` flags every non-`Not set` group.
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** FR-010, FR-011.

### TC-E-409
**The address: reload, new tab, Back, stale list, foreign list** | Level: E2E | P1 | EG
- **Preconditions:** HC-A seeded; user V (second context) owns list `V list`.
- **Input:** choose scope `Core holdings`, lens Moat, measure Value; reload; copy the URL into a new tab; press Back; then delete the list through the API and reload; then open `/concentration?scope=<V's list id>`, `?lens=banana`, `?measure=sum`.
- **Expected:** the URL reads `?scope=<id>&lens=moat&measure=value` and the reload and new tab show the same view; Back leaves `/concentration` (it does not step through each tweak); the deleted list and V's list id both show "That list no longer exists. Showing all stocks." with identical text (no leak); unknown lens and measure show their notes and the defaults; no uncaught error in the console.
- **Mock needed:** AdminAPI, SeedAPI, TwoUsers. **Covers:** FR-012, NFR-003.

### TC-E-410
**Empty states** | Level: E2E | P1 | EP
- **Input:** a user with no stocks; a user with an empty list as scope; a user with stocks and none held, scope held, measure value.
- **Expected:** "Nothing to group yet" with working `Add stock` and `Import` links; "Core holdings has no stocks yet." with the open link; Value at cost is disabled with "No held stock in this scope has shares and cost." and the `/stocks` link, while the count view still works; the advice note is present where the table or the explanation is.
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** FR-013, FR-014, FR-005.

### TC-E-411
**Multi-value lens: counted in each group, and the note** | Level: E2E | P2 | EP
- **Preconditions:** stocks with themes `[AI, EV]`, `[AI]`, `[]` (HC-H).
- **Input:** lens Themes, then Index membership; measure count.
- **Expected:** AI `66.7%`, EV `33.3%`, Not set `33.3%` and the note that shares add up to more than 100%; the note is absent for Sector.
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** FR-007.

### TC-E-412
**Exact decimals and rounding end to end** | Level: E2E | P1 | BVA
- **Preconditions:** dataset HC-B and HC-D through the real API; threshold 40.
- **Input:** `/concentration` value view; then edit X's cost to `4000` through the stock form and revisit; add `0.1`/`0.2` stocks in one sector; a stock with `99999999999999.9999 x 99999999999999.9999` on the stock page.
- **Expected:** X `฿3,996.00` shows `40.0%` with no flag, absent from the summary, Y `60.0%` flagged; after X = 4000 X is flagged (exactly 40); the `0.1 + 0.2` group shows `฿0.30`; the large stock's card shows `฿9,999,999,999,999,999,980,000,000,000.00` and the page does not overflow; the API still returns strings.
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** FR-003, FR-008, FR-010, NFR-005.

### Isolation, privacy and resilience

### TC-E-413
**Two-user isolation in the browser** | Level: E2E | P1 | EP, EG
- **Preconditions:** dataset HC-F: U (holdings, list, threshold 25, rate `36.482917`) and V (own AAPL holding, no settings), each in its own browser context.
- **Input:** as V: `/stocks`, `/concentration` (all lenses/scopes), Settings dialog, `/stocks/{U NVDA id}`, `/stocks/{U NVDA id}/edit`, `/concentration?scope={U's list id}`; V's `fetch('/api/stocks/{U id}', { method: 'PATCH', body holding })` from the page context; `GET /api/settings` as V.
- **Expected:** V sees only AAPL; threshold 40 and no rate in the dialog; U's ticker, list name, shares, cost and rate appear nowhere in V's DOM (`page.content()` search), V's network responses (recorded) or V's storage; U's stock URLs show the not-found page; U's list id falls back with the standard note; the direct PATCH is `404`; U's data and settings are unchanged afterwards; the reverse (U unaffected by V's session) holds.
- **Mock needed:** AdminAPI, SeedAPI, TwoUsers. **Covers:** NFR-003.

### TC-E-414
**Privacy: no third party, no leak to URLs or logs** | Level: E2E | P1 | EG
- **Preconditions:** HC-G sentinels; API log at `e2e/.output/` captured by `scripts/e2e-servers.mjs`.
- **Input:** record every request of a session: add a held stock with shares `7351.2468` and cost `9182.7364`, open its page, edit, open `/concentration`, save rate `36.482917`, change every control; then read the API log files.
- **Expected:** every request URL host is the web origin (or its `/api` proxy) (the local Supabase auth host appears only on sign-in calls from earlier setup, not in this session); no request URL, `Referer`, `document.title` or storage entry contains a sentinel; the sentinels appear only in the bodies of the `POST`/`PATCH` stock and `PATCH /settings` requests and their responses; the API log files contain none of `7351.2468`, `9182.7364`, `36.482917`; no third-party script or image is requested.
- **Mock needed:** AdminAPI, PwRoute (request recording). **Covers:** NFR-004.

### TC-E-421
**Resilience: save fails offline and recovers; loader fails** | Level: E2E | P2 | EG
- **Input:** open the holding dialog and the settings dialog, `context.setOffline(true)`, Save; go online, Save again; abort `GET /api/settings` with `page.route` and open `/concentration`; fulfil `PATCH /stocks/{id}` with `500`.
- **Expected:** the dialog stays open with its values and shows its alert; the retry saves once (no duplicate rows, one holding); the failing loader shows the route error page with a way back, no partial figures; after `500` the card is unchanged and no toast says "marked as held".
- **Mock needed:** AdminAPI, SeedAPI, PwRoute. **Covers:** FR-002, FR-011.

### Accessibility, responsive, performance

### TC-E-415
**axe in light and dark on every new screen state** | Level: E2E | P1 | EP (table-driven)
- **Preconditions:** `e2e/lib/states.ts` gains the states below; data HC-A.
- **Input:** run axe (wcag2a, wcag2aa, wcag21a, wcag21aa) in light and dark for: `/stocks/new` with Holding ticked and with errors; `/stocks/:id/edit` held; stock page card (not held, held unknown, held with figures) and its dialog open and with an error; `/stocks` and `/lists/:id` with the Held column; `/concentration` count, value flagged, none flagged, no stocks, empty scope, left-out note, expanded group, multi-value note, fallback note; the settings dialog with and without a rate and with errors.
- **Expected:** zero violations, including `color-contrast`; an `incomplete` contrast result on a semi-transparent tint is not accepted silently and is settled by TC-E-416; all landmarks and the table caption present; no duplicate ids (aria-controls targets unique).
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** NFR-006.

### TC-E-416
**Contrast points left open in ux-design.md** | Level: E2E | P1 | measured
- **Input:** with `e2e/lib/contrast.ts` (`measureContrast`, tints composited over their real parent) in light and dark: (1) the flag icon (`TriangleAlertIcon`, `text-destructive`) against the badge background; (2) the outline badge border against the page background; (3) the flag text `Over 40%` against the badge; (4) the summary Alert icon and text; (5) `muted-foreground` notes (multi-value, advice, left-out, summary footer) against `background`; (6) `Held` secondary badge text; (7) shares text `text-muted-foreground`; (8) **Set rate** link button text; (9) field `FieldDescription` hints.
- **Expected:** text at least 4.5:1 (items 3 to 9) in both themes; the flag icon and the badge border at least 3:1 (non-text, WCAG 1.4.11); where the dark-mode icon is below 3:1 the case **fails and records the ratio**, and the fix is the one ux-design.md names (`text-foreground` for the icon, T-007 owner), after which the case passes; the share bar is excluded (decorative, `aria-hidden`); the measured ratios are written to the report.
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** NFR-006.

### TC-E-417
**360 px: no horizontal scroll, folded columns, dialogs fit** | Level: E2E | P1 | EP (table-driven)
- **Preconditions:** viewport 360 x 740, touch emulation on.
- **Input:** visit `/stocks/new` (Holding ticked), `/stocks/:id` (all card states), `/stocks` and `/lists/:id` (Held column), `/concentration` in all states of TC-E-415, the holding dialog and the settings dialog (open, with errors); a stock with `99999999999999.9999` shares and cost.
- **Expected:** for every state `document.documentElement.scrollWidth <= window.innerWidth` and no element's right edge exceeds the viewport (excluding a table's own scroll container, which is the only allowed horizontal scroll and exists only for `StockTable`, as in Stock Lists); Scope, Group by and Settings are full width and stacked; Value and Stocks columns are hidden and the Group cell carries "8 stocks" or the value; the flag badge is visible under the share; dialogs fit within 360 px and their footer buttons are reachable; the big number wraps; nothing is clipped (text not cut off).
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** NFR-007, NFR-006.

### TC-E-418
**Keyboard-only journeys, with a visible focus ring** | Level: E2E | P1 | UC
- **Input:** no mouse (any `click`, `hover` or `mouse.*` call fails the test): (a) Add stock with a holding from the form; (b) the stock page dialog (TC-E-403); (c) `/concentration`: Tab to Settings, Scope (Enter, arrows, Enter), Group by (type-ahead `Mo`), Measure (arrow), expand a group with Space, follow a ticker with Enter, Back; (d) Settings dialog: set rate, Save, Esc on a second opening; (e) hold Shift+Tab through the page in reverse.
- **Expected:** every step reachable and operable; the Tab order matches ux-design.md (Settings → Scope → Group by → Measure → expand buttons → ticker links → Set rate → advice links); dialogs trap focus and return it (opener, or **Mark as held**); no keyboard trap on the page; every focused element has a computed outline or ring that is not `none` and at least 3:1; regrouping keeps focus on the used control; after saving settings focus returns to the opener.
- **Mock needed:** AdminAPI, SeedAPI. **Covers:** NFR-006, FR-001, FR-005, FR-011.

### TC-E-419
**Regroup 200 stocks in under 200 ms in a real browser** | Level: E2E | P2 | performance
- **Preconditions:** HC-E seeded through SeedAPI (200 stocks, 100 held, themes up to 3); warm page; Chromium.
- **Input:** 20 changes each of scope, lens (including Themes) and measure; time each with a `MutationObserver` on the table and `performance.now()` from the `change`/`click` event to the DOM update (including paint through `requestAnimationFrame`).
- **Expected:** the p95 of each control is under 200 ms; no request is made by any change (request log); the final table equals the dataset's expected groups; timings are logged to `e2e/.output/`.
- **Mock needed:** AdminAPI, SeedAPI, PwRoute. **Covers:** NFR-001.

### Cross-feature and environment

### TC-E-420
**Import interplay** | Level: E2E | P2 | UC
- **Preconditions:** NVDA held 10 x 100 USD.
- **Input:** import a CSV with an NVDA row in `update` mode and two new stocks into a new list; open `/stocks`, NVDA's page and `/concentration` scope all.
- **Expected:** NVDA's lenses are updated and its holding is still `10`/`$100.00`; the two imported stocks are `Not held` and counted in count shares and in "not held" in the value view; the import wizard's summary is unchanged.
- **Mock needed:** AdminAPI, SeedAPI, Fixtures. **Covers:** FR-001, FR-004, FR-005.

### TC-E-422
**Mock-mode smoke and global setup** | Level: E2E | P3 | EP
- **Preconditions:** the mock-mode pair on :5273/:3100 (`AUTH_MODE=mock`).
- **Input:** `global-setup.ts` visits `/concentration` (added to its route list); open `/concentration`, save a rate, add a held stock.
- **Expected:** the page loads with no sign-in redirect (guards never redirect in mock mode), settings and a holding save and read back for the single mock user; the visit in `global-setup.ts` prevents a Vite dependency re-optimisation reload during the first test (no `page.reload` observed by the test).
- **Mock needed:** none (mock pair). **Covers:** FR-005, FR-011.

---

## 10. Coverage

### 10.1 Traceability (every FR and NFR to at least one TC)

| Requirement | Cases (new) | Dev-plan unit cases |
|---|---|---|
| FR-001 Mark and clear a holding | A-401, A-403, A-404, A-408, A-409, A-410, A-411, A-412, A-413, A-420, A-428, C-401, C-404, C-406, C-408, C-409, E-400, E-402, E-403, E-405, E-418, E-420 | U-400, U-430, U-432, U-450, U-454, U-460, U-462 |
| FR-002 Shares, cost, currency | A-406, A-407, A-408, A-409, A-410, A-411, C-402, C-403, C-405, C-406, C-410, E-400, E-401, E-403, E-421 | U-402, U-410..412, U-430..433, U-452, U-453, U-460 |
| FR-003 Exact decimals and display | A-405, A-416, A-426, C-400, C-402, C-407, C-411, C-435, E-400, E-412 | U-410, U-412, U-427, U-461 |
| FR-004 Held marker and editing | A-404, A-412, A-413, A-414, C-401, C-404, C-405, C-406, C-408, C-410, C-411, C-412, E-400, E-401, E-402, E-403, E-404, E-420 | U-454, U-455, U-460..463 |
| FR-005 Scope and measure | C-414, C-416, C-420, C-432, E-406, E-407, E-410, E-418, E-420, E-422 | U-472 |
| FR-006 Lenses | C-413, E-406 | U-420, U-421 |
| FR-007 Count, share, Not set, multi-value | C-415, C-421, C-424, E-406, E-411 | U-420, U-421, U-475, U-476 |
| FR-008 Value in THB, share of total | C-416, C-421, E-407, E-412 | U-422, U-426, U-427 |
| FR-009 Left-out stocks | C-419, E-407 | U-423, U-474 |
| FR-010 Flag and summary | C-417, C-418, C-431, E-406, E-408, E-412 | U-420, U-424, U-425, U-471, U-481 |
| FR-011 Threshold and rate | A-402, A-415, A-416, A-417, A-418, A-419, A-428, C-419, C-428, C-429, C-430, C-431, E-407, E-408, E-418, E-421, E-422 | U-403, U-413, U-440..443, U-480..483 |
| FR-012 View state in the address | C-422, C-433, E-406, E-409 | U-470, U-473 |
| FR-013 Empty states | C-420, C-423, E-410 | U-472, U-477 |
| FR-014 Advice note | C-423, E-406, E-410 | |
| NFR-001 Regroup under 200 ms | C-427, E-419 | |
| NFR-002 Holding saves under 500 ms | A-421 | |
| NFR-003 Own rows only | A-400, A-401, A-402, A-403, A-414, A-419, A-426, A-427, C-432, E-409, E-413 | U-401, U-435, U-443 |
| NFR-004 Privacy | A-422, A-423, A-424, A-425, A-427, C-434, E-413, E-414 | |
| NFR-005 Accuracy and rounding | A-405, C-400, C-407, C-417, C-435, E-412 | U-424, U-425, U-427 |
| NFR-006 Accessibility | C-408, C-418, C-424, C-425, C-426, C-436, E-403, E-415, E-416, E-417, E-418 | |
| NFR-007 360 px | C-425, E-417 | |
| NFR-008 Portability | A-428 | |

### 10.2 Coverage matrix

| Test area | Unit (dev plan) | API / DB | Component | E2E | Covered |
|---|---|---|---|---|---|
| Happy path | U-430, U-441, U-461 | A-404, A-416 | C-406, C-415, C-416 | E-400, E-406, E-407 | Yes |
| Validation and boundaries | U-411..413 | A-407, A-417 | C-402, C-429 | E-412 | Yes |
| Business rules (replace, default currency, flag, value eligibility) | U-432, U-423 | A-406, A-410, A-411 | C-416..C-420 | E-407, E-412 | Yes |
| State transitions | U-432, U-462 | A-410, A-418 | C-401, C-408, C-409, C-430 | E-402, E-403, E-405 | Yes |
| Auth and authorization | n/a | A-400 | C-432 | E-413 | Yes |
| Two-user isolation | U-401, U-435 | A-401, A-402, A-403, A-414 | C-422 | E-409, E-413 | Yes |
| Error and failure | U-431, U-463 | A-409, A-411, A-423 | C-405, C-410, C-430, C-432 | E-421 | Yes |
| Concurrency | n/a | A-419, A-420 | C-405, C-410 | E-421 | Yes |
| Atomicity | U-431 | A-409, A-411 | n/a | E-421 | Yes |
| Exact decimals and rounding | U-424, U-427 | A-405 | C-400, C-407, C-411, C-417, C-435 | E-412 | Yes |
| Privacy and logs | n/a | A-422..A-425, A-427 | C-434 | E-414 | Yes |
| Contract (OpenAPI, problem+json) | n/a | A-426, A-407, A-417 | n/a | n/a | Yes |
| Performance | U-420 (domain timing) | A-421 | C-427 | E-419 | Yes (timed) |
| Responsive (360 px) | n/a | n/a | C-425 | E-417 | Yes |
| Accessibility (keyboard, ARIA, contrast) | n/a | n/a | C-408, C-424, C-426, C-436 | E-415, E-416, E-418 | Yes |
| Address and view state | U-470, U-473 | n/a | C-422, C-433 | E-409 | Yes |
| Cross-feature (import, lists, delete) | U-400, U-434 | A-412, A-413 | C-412 | E-405, E-420 | Yes |

### 10.3 Counts

New cases per level: **API / Integration / Supabase 29** (`TC-A-400..428`), **Component, Unit-helper
and Static 37** (`TC-C-400..436`: 35 component, 1 unit helper (C-400), 1 static (C-435)), **E2E 23** (`TC-E-400..422`); **89 new cases** plus the 41 existing
`TC-U-4xx`. By priority: P1 61, P2 26, P3 2.

---

## 11. Gaps, ambiguities and risks

Every FR and NFR has at least one case. The items below need an owner or developer decision; the
expected value written into the case is the **proposed** default.


**Owner decision, 2026-11-23: the proposed defaults for G-1 to G-19 are accepted.** Each case keeps
its proposed expected value as final. Where a proposal changes requirements.md, design.md or
ux-design.md wording (G-1, G-2, G-14), the web and API tasks follow this file until those documents
are updated.
- **G-1: lens order differs between documents.** FR-006 lists sector, SET industry group,
  value-chain position, value-chain name, size, ...; design.md lists `valueChain` before
  `valueChainPosition`. C-413 expects the FR-006 order. Decide one; also decide whether the label is
  "Value chain name" or "Value chain".
- **G-2: number display rules are partly implied.** The API always returns 4 decimals
  (`"412.3300"`), so "the decimals it was entered with" (FR-003) cannot be known; ux-design.md only
  shows `$412.33` and `120.5`. Proposed: trim trailing zeros, minimum two decimals for money
  (`$412.30`, `$5.00`), none for shares. The rate display (`36.250000` shown as `36.25`) follows the
  same rule. C-400 pins it.
- **G-3: partial holdings (shares only, cost only).** ux-design.md shows only "held, no amounts"
  and "held with both". Proposed: show the figures that exist, no Cost row, and the hint to add the
  missing part; such a stock counts as `noAmount` in the left-out note. Also the empty-field body
  from the stock page dialog is the whole holding with `null`s (TC-U-460), while TC-U-450 (form)
  says an unticked form sends no `holding`; the form with both fields empty is assumed to send
  `{ shares: null, averageCost: null, costCurrency }` (C-402).
- **G-4: zero total value.** Held stocks with `averageCost "0"` are valued (value 0), so FR-005
  makes Value available but every share is null (design.md). No copy is given. Proposed: Share `—`,
  a short note (C-420).
- **G-5: value view groups with no value and the empty held scope.** Groups whose stocks are all
  left out have value 0; whether they are listed (`฿0.00`, `0.0%`) or hidden is unspecified
  (C-416 expects listed, last). Likewise scope held with no held stock and measure count: FR-013 only
  names the value case; proposed a note with a link to `/stocks` (C-423).
- **G-6: address corrections.** Copy for an unknown lens or measure is not specified (only the
  deleted-list text is). Also: several bad params at once, repeated params, and whether the
  corrected state rewrites the address (proposed: not rewritten, one note per problem).
- **G-7: `PATCH /settings` with `{}` and `PATCH /stocks/{id}` with `{}`.** Proposed: `200`, no
  change, no row created for `{}` on settings; A-411(d) and C-430 assume it. Not stated in design.md.
- **G-8: whitespace and formats in the decimal inputs.** Proposed: trim, reject comma, exponent and
  a leading or trailing dot (`.5`, `5.`) with the limit message. Users commonly type `.5`; consider
  accepting it. The API (strict regex) rejects all of these (A-407).
- **G-9: time zone of "saved 23 Nov 2026".** `usdThbRateUpdatedAt` is UTC; the page should show the
  browser's local date (C-431); a rate saved at 20:00 UTC shows the next day in Thailand.
- **G-10: settings Save with no change.** Proposed: close without a request and toast "No changes to
  save" as the stock form does.
- **G-11: stock-page dialog on `404` and Undo conflicts.** Copy for a stock that disappeared
  ("This stock no longer exists.") and what Undo does if the holding changed in between are
  unspecified (C-410, C-409).
- **G-12: no seam for forcing database failures in the stocks module.** Atomicity (ADR-004) and the
  Postgres `detail` serializer (NFR-004) need a failing write or a check violation on
  `app.holdings` for a value that passes validation. Imports have `ImportRepo`; stocks have none.
  The cases use a test-only `ConstraintProbe` (a temporary CHECK on one unlikely cost value, added
  and dropped by the test file) which needs no product seam. If the owner prefers a seam, A-409,
  A-411(e) and A-423 get simpler. Parallel test files must not insert `7777.7777`.
- **G-13: re-saving the same rate.** Proposed: the date moves (a save is a save); the alternative
  (date only changes when the value changes) would also be defensible (A-418).
- **G-14: where the 40% means.** FR-010 says "equal to or above"; the summary and badge copy "at 40%
  or more" and "Over 40%" disagree slightly ("Over" suggests greater than). Tests follow the
  requirement (equal flags). Consider "At 40%+" or "40% or more" on the badge.
- **G-15: Held sort tie-break and held-without-shares order.** Proposed: held with shares
  (descending, exact comparison), held without shares, not held; ties by ticker (C-411).
- **G-16: summary footer without a rate.** Copy for the no-rate footer is unspecified (proposed
  "No exchange rate saved").
- **G-17: NFR-001 in jsdom vs a browser.** jsdom is slower and unlike real layout; C-427 is a
  regression guard and E-419 (Chromium) is the authority.
- **G-18: "let the investor open them" (FR-009).** Held stocks without amounts and USD holdings
  link to their stock pages, but 23 not-held stocks have no natural target; proposed a link to
  `/stocks` (C-419). A held-only filter on `/stocks` is out of scope.
- **G-19: advice note in the empty state.** FR-014 says "on the concentration page"; whether the
  no-stocks empty card also carries it is unspecified. C-423 expects it everywhere.
- **G-20: "error reports" in NFR-004.** The repo has no error-reporting service; the cases cover
  logs, responses, URLs, storage and third-party requests. Add a case if one is introduced.
- **G-21: NFR-008 is structural.** Only the table shape and readability are testable now (A-428);
  the export itself is a later slice.
- **Risk: the whole-stock assertions.** Adding `holding` to `Stock` breaks existing `toEqual`
  assertions and `apiAs` helpers (design.md Risks); T-003 and T-005 fix them, T-010 re-checks with
  the Stock Lists suite as regression.
- **Risk: flaky timing cases.** A-421, C-427 and E-419 use p95 over many samples; run them on a quiet
  machine, and never loosen the bound to pass (test gate).
- **Risk: contrast fix may be needed.** E-416 is designed to fail with a recorded ratio when the dark
  flag icon is under 3:1; the fix belongs to the T-007 owner as ux-design.md says.
