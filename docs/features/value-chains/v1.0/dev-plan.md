---
version: 1.0
status: done
date: 2026-11-25
requires: design.md
ux-design: ux-design.md
---

# Development Plan: Value Chains

Builds [requirements.md](requirements.md) per [design.md](design.md) and
[ux-design.md](ux-design.md). Every engineering task follows the test gate (green before, green
after, then human review). The gate is the **Investhesis gate** in `CLAUDE.md` (Tests and the
Investhesis gate), run from the repo root: `pnpm db:start && pnpm db:reset`, `pnpm test:supabase`,
`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (with `E2E_WEB_PORT`
when 5173 is taken). `.claude/rules/test-gate.md` still lists Pacta's commands (carried work in
`docs/todo.md`).

**Test ids.** This slice uses the 900 range (600 to 899 are taken by Search, Filter and Export and
Thesis Log): `TC-U-9xx` in the task contracts below, and `TC-A-9xx`, `TC-C-9xx`, `TC-E-9xx` from
[T-007](#t-007--design-test-cases--value-chains). Every test title starts with its id.

**No migration.** Chains are derived from `app.stocks.value_chain` and `value_chain_position`
([ADR-001](design.md#key-decisions)); no task touches `supabase/migrations/`.

## Summary

- **Total tasks** — 8 (6 engineering, 1 test design, 1 test automation)
- **Estimated effort** — about 5 days of agent work (S ≈ 0.4 day, M ≈ 0.75 day, L ≈ 1.5 days);
  about 3.5 days elapsed with the API and web lanes in parallel
- **Critical path** — [T-001](#t-001--domain-chain-grouping-and-rename-schema) →
  [T-005](#t-005--value-chains-page) →
  [T-006](#t-006--rename-and-merge-a-chain) →
  [T-008](#t-008--automate-tests--value-chains)
- **Parallel lanes** — [T-004](#t-004--web-shared-scope-portfolio-loader-and-concentration-link)
  (web refactor) starts at once. After T-001: API [T-003](#t-003--chains-api-module-rename),
  domain [T-002](#t-002--concentration-value-chain-lens-folds-case), and web T-005 then T-006
  (built against the contract in `design.md` with `StubApi`; T-008 proves them against the real
  API). [T-007](#t-007--design-test-cases--value-chains) starts at once.

## Tasks

### T-001 — Domain: chain grouping and rename schema

```yaml
- title: Add chainKey, CHAIN_AREAS, groupChains, ChainRename and extract valueAtCost
- description: >
  In packages/domain implement design.md §Shared rules. Extract valueAtCost(holding, usdThbRate)
  from groupConcentration in concentration.ts (returns the value as a BigInt at VALUE_SCALE or a
  reason: 'not-held' | 'no-amount' | 'needs-rate') and make groupConcentration use it with no
  behaviour change (its existing tests stay green unchanged). Move the free-text fold of
  filters.ts into an exported foldText and define chainKey(name) = foldText(name.trim()), with
  filters.ts using foldText. New chains.ts: CHAIN_AREAS; groupChains({ stocks, usdThbRate }) over
  GroupableStock & { ticker, name, createdAt } returning ChainsResult exactly as design.md
  specifies (chain order, title = earliest createdAt then id, spellings, the three lanes always
  present, Integrated and NoPosition only when non-empty, FR-003 order inside an area, counts,
  THB values with two decimals, area valueShare of the chain value with one decimal, left-out
  counts, noChainIds, needsRate). ChainRename Zod schema (strict). Messages chainNotFound and
  chainExists(name, count) in messages.ts. Export everything from index.ts. Covers FR-001..FR-006,
  FR-009, FR-010, NFR-005.
- agent: software-engineer-backend
- depends_on: []
- status: done
- size: M
```

#### Acceptance criteria

- [ ] Web and API can import every new name from `@investhesis/domain`; the code is erasable syntax with `.ts` relative imports
- [ ] Every existing domain test passes unchanged (the `valueAtCost` extraction and `foldText` move change no behaviour)
- [ ] No floating-point arithmetic on shares, costs, rates or values (`BigInt` and the decimal helpers only)
- [ ] `pnpm --filter @investhesis/domain test:coverage` stays at or above 95% lines
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-900
    scenario: chainKey folds case and surrounding spaces only
    given: chainKey
    when: called with " AI & Semis ", "ai & semis", "AI &  Semis", "น้ำมัน"
    then: the first two are equal; the third differs (inner spaces kept); Thai is unchanged
    test_data:
      input: [" AI & Semis ", "ai & semis", "AI &  Semis", "น้ำมัน"]
      expected: ["ai & semis", "ai & semis", "ai &  semis", "น้ำมัน"]
  - id: TC-U-901
    scenario: valueAtCost matches what groupConcentration used to compute
    given: holdings THB { shares "10", averageCost "12.5" }, USD { "2", "100.25" } with rate "36.5", USD with rate null, { shares null }, null
    when: valueAtCost is called for each
    then: 125.00 THB, 7318.25 THB, needs-rate, no-amount, not-held
    test_data:
      input: [THB 10 x 12.5, USD 2 x 100.25 @36.5, USD @null, shares null, not held]
      expected: ["125.00", "7318.25", needs-rate, no-amount, not-held]
  - id: TC-U-902
    scenario: stocks group into chains ignoring case, ordered by size then title
    given: stocks A "Oil & Gas", B "AI & Semis", C "ai & semis", D "AI & Semis", E "Banks"
    when: groupChains({ stocks, usdThbRate: null })
    then: chains in order AI & Semis (3), Banks (1), Oil & Gas (1)
    test_data:
      input: 5 stocks as given
      expected: [{ title: "AI & Semis", count: 3 }, { title: Banks, count: 1 }, { title: "Oil & Gas", count: 1 }]
  - id: TC-U-903
    scenario: the earliest-created stock's spelling titles the chain; ties break by id
    given: C "ai & semis" created 2026-01-01, B "AI & Semis" created 2026-02-01; then two stocks created at the same instant with ids "a1" ("x chain") and "b2" ("X Chain")
    when: groupChains
    then: titles "ai & semis" with spellings ["ai & semis", "AI & Semis"]; "x chain" with spellings ["x chain", "X Chain"]
    test_data:
      input: as given
      expected: [{ title: "ai & semis", spellings: ["ai & semis", "AI & Semis"] }, { title: "x chain", spellings: ["x chain", "X Chain"] }]
  - id: TC-U-904
    scenario: areas follow the position; lanes always present, extra areas only when used
    given: one chain with positions Upstream, Downstream, Integrated, None and null
    when: groupChains
    then: areas Upstream (1), Midstream (0), Downstream (1), Integrated (1), NoPosition (2); a second chain with only Midstream stocks has exactly the three lanes
    test_data:
      input: positions [Upstream, Downstream, Integrated, None, null]
      expected: [Upstream 1, Midstream 0, Downstream 1, Integrated 1, NoPosition 2]
  - id: TC-U-905
    scenario: order inside an area is valued held, unvalued held, not held, each by ticker
    given: one lane with MSFT held ฿100, AAPL held ฿300, NVDA held no amount, AMD held no amount, INTC not held, ARM not held
    when: groupChains
    then: AAPL, MSFT, AMD, NVDA, ARM, INTC
    test_data:
      input: as given
      expected: [AAPL, MSFT, AMD, NVDA, ARM, INTC]
  - id: TC-U-906
    scenario: counts, values and shares per area and per chain are exact
    given: chain with Upstream THB holding 1 x 100, Midstream THB 1 x 200 and an unheld stock, Downstream USD 1 x 0.01 at rate "36.123456"
    when: groupChains({ usdThbRate: "36.123456" })
    then: chain value "300.36", held 3, count 4; shares Upstream "33.3", Midstream "66.6", Downstream "0.1" (half up, no float)
    test_data:
      input: as given
      expected: { value: "300.36", areas: { Upstream: { value: "100.00", valueShare: "33.3" }, Midstream: { value: "200.00", count: 2, held: 1, valueShare: "66.6" }, Downstream: { value: "0.36", valueShare: "0.1" } } }
  - id: TC-U-907
    scenario: left-out held stocks are counted, rate need is reported, zero value gives null shares
    given: chain whose held stocks are one with shares null and one USD holding, rate null
    when: groupChains({ usdThbRate: null })
    then: leftOut { noAmount 1, needsRate 1 }, needsRate true, value "0.00", every valueShare null, held 2
    test_data:
      input: as given
      expected: { leftOut: { noAmount: 1, needsRate: 1 }, needsRate: true, value: "0.00", valueShare: null }
  - id: TC-U-908
    scenario: stocks with no chain name are reported, not grouped
    given: three stocks with valueChain null and one with "Banks"
    when: groupChains
    then: one chain; noChainIds lists the three ids
    test_data:
      input: as given
      expected: { chains: 1, noChainIds: 3 }
  - id: TC-U-909
    scenario: ChainRename accepts a valid body and applies the name rules to "to"
    given: ChainRename
    when: parse { from: "AI semis", to: "  AI & Semis  " }, then { to: "" }, { to: 61 chars }, { to: 60 emoji }
    then: ok with to "AI & Semis" and merge false; fail on "to"; fail on "to"; ok
    test_data:
      input: [{ from: "AI semis", to: "  AI & Semis  " }, { from: x, to: "" }, { from: x, to: "a×61" }, { from: x, to: "😀×60" }]
      expected: [{ to: "AI & Semis", merge: false }, fail to, fail to, ok]
  - id: TC-U-910
    scenario: ChainRename rejects a missing from, a non-boolean merge and unknown keys
    given: ChainRename
    when: parse { to: "X" }, { from: "A", to: "X", merge: "yes" }, { from: "A", to: "X", userId: "u" }
    then: fail on paths from, merge, userId
    test_data:
      input: as given
      expected: [[from], [merge], [userId]]
```

**Notes** — `createdAt` is an ISO string on both API and web rows; compare it as text (ISO 8601
in UTC sorts lexically), not through `Date`. `GroupableStock.createdAt` is added in
[T-002](#t-002--concentration-value-chain-lens-folds-case); here the extra fields are on the
`groupChains` input type only.

### T-002 — Concentration value-chain lens folds case

```yaml
- title: Group the concentration valueChain lens by chainKey with the chain title rule
- description: >
  Per ADR-006, the valueChain lens of CONCENTRATION_LENSES groups stocks by chainKey, and each
  group's label is the chain title rule of groupChains (earliest createdAt, then id), so
  /concentration?lens=valueChain shows the same chains as /chains. GroupableStock gains
  createdAt: string (API and web rows already carry it); update the domain fixtures. Every other
  lens, including themes, keeps exact-label grouping. Covers FR-008 via ADR-006.
- agent: software-engineer-backend
- depends_on: [T-001]
- status: done
- size: S
```

#### Acceptance criteria

- [ ] `groupConcentration` with `lens: 'valueChain'` merges spellings that differ only in case or surrounding spaces
- [ ] Every other lens's result is unchanged (existing concentration tests pass with fixtures that only gain `createdAt`)
- [ ] The web concentration tests still pass (`pnpm --filter @investhesis/web test`)
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-911
    scenario: valueChain groups fold case and use the earliest spelling
    given: stocks "ai & semis" (2026-01-01), "AI & Semis" (2026-02-01), "AI & Semis " (2026-03-01), "Banks"
    when: groupConcentration({ lens: "valueChain", threshold: 40 })
    then: groups "ai & semis" count 3 share "75.0" flagged, "Banks" count 1
    test_data:
      input: as given
      expected: [{ label: "ai & semis", count: 3, countShare: "75.0", countFlag: true }, { label: Banks, count: 1 }]
  - id: TC-U-912
    scenario: themes keep exact-label grouping
    given: stocks with themes ["AI"] and ["ai"]
    when: groupConcentration({ lens: "themes" })
    then: two groups, "AI" and "ai"
    test_data:
      input: as given
      expected: [AI, ai]
```

### T-003 — Chains API module (rename)

```yaml
- title: Add modules/chains with POST /chains/rename
- description: >
  New apps/api/src/modules/chains (chains.routes.ts -> chains.service.ts -> chains.repository.ts),
  registered in app.ts, following design.md §API Contracts: body validated with the domain
  ChainRename (400 validation_failed with paths); one db.transaction that selects the caller's
  rows with a chain name FOR UPDATE, matches with chainKey, answers 404 chain_not_found when no
  row matches from, 409 chain_exists with extensions { existingName, existingCount } when to
  names another chain and merge is not true, otherwise updates value_chain, lens_sources
  (valueChain = manual, other keys kept) and updated_at only for rows whose stored name differs
  from to, and answers 200 { name, changed, merged }. Repository functions take (db, userId, ...)
  and filter by user. OpenAPI documents the route with bearerAuth. 503 db_unavailable without a
  database. No body is logged. Add src/modules/chains/ to the API coverage config at 85%. Covers
  FR-009..FR-011, NFR-002..NFR-004.
- agent: software-engineer-backend
- depends_on: [T-001]
- status: done
- size: M
```

#### Acceptance criteria

- [ ] `POST /chains/rename` appears in `/openapi.json` with request, 200 and problem responses
- [ ] A rename never reads or writes another user's stocks (two-user test on the real database)
- [ ] The rename is atomic: a failure mid-update leaves every stock as it was
- [ ] `pnpm --filter @investhesis/api test:coverage` passes with `src/modules/chains/` at 85% or more
- [ ] All TC-U cases below pass (DB-backed through `test/db.ts` and `test/seed.ts`, own random user ids)

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-913
    scenario: rename rewrites every spelling of the chain and keeps other fields
    given: user U with stocks "AI semis" (Upstream), "ai semis" (Midstream), "Banks"
    when: POST /chains/rename { from: "AI semis", to: "AI & Semis" }
    then: 200 { name: "AI & Semis", changed: 2, merged: false }; both stocks read back with "AI & Semis", same positions, lens_sources.valueChain manual and other lens_sources keys kept, updated_at moved; "Banks" untouched
    test_data:
      input: { from: "AI semis", to: "AI & Semis" }
      expected: { status: 200, body: { name: "AI & Semis", changed: 2, merged: false } }
  - id: TC-U-914
    scenario: from matches ignoring case and surrounding spaces
    given: U with stocks "AI semis"
    when: rename { from: " ai SEMIS ", to: "AI & Semis" }
    then: 200 changed 1
    test_data:
      input: { from: " ai SEMIS ", to: "AI & Semis" }
      expected: { changed: 1 }
  - id: TC-U-915
    scenario: a case-only rename is not a merge and counts only rows that change
    given: U with "AI & Semis" x2 and "ai & semis" x1
    when: rename { from: "ai & semis", to: "AI & Semis" }
    then: 200 { changed: 1, merged: false }; the two already exact rows keep their updated_at
    test_data:
      input: { from: "ai & semis", to: "AI & Semis" }
      expected: { changed: 1, merged: false }
  - id: TC-U-916
    scenario: renaming onto another chain without merge is refused with what the dialog needs
    given: U with "AI semis" x3 and "AI & Semis" x8 (earliest spelling "AI & Semis")
    when: rename { from: "AI semis", to: "ai & semis" }
    then: 409 code chain_exists, existingName "AI & Semis", existingCount 8; nothing written
    test_data:
      input: { from: "AI semis", to: "ai & semis" }
      expected: { status: 409, code: chain_exists, existingName: "AI & Semis", existingCount: 8 }
  - id: TC-U-917
    scenario: a confirmed merge rewrites both chains to the typed name
    given: as TC-U-916
    when: rename { from: "AI semis", to: "ai & semis", merge: true }
    then: 200 { name: "ai & semis", changed: 11, merged: true }; all 11 stocks carry "ai & semis"
    test_data:
      input: { from: "AI semis", to: "ai & semis", merge: true }
      expected: { changed: 11, merged: true }
  - id: TC-U-918
    scenario: unknown chain and other user's chain are not found
    given: U with no "Oil" chain; user V with "Oil"
    when: U renames { from: "Oil", to: "Oil & Gas" }
    then: 404 chain_not_found; V's stock unchanged
    test_data:
      input: { from: Oil, to: "Oil & Gas" }
      expected: { status: 404, code: chain_not_found }
  - id: TC-U-919
    scenario: another user's chain of the same name is never merged or counted
    given: U with "Banks" x1, V with "Banks" x5 and "Finance" x2
    when: U renames { from: "Banks", to: "Finance" }
    then: 200 { changed: 1, merged: false }; V's 7 stocks unchanged
    test_data:
      input: { from: Banks, to: Finance }
      expected: { changed: 1, merged: false }
  - id: TC-U-920
    scenario: validation problems answer 400 with paths
    given: U
    when: rename { from: "A", to: "" }, { to: "X" }, { from: "A", to: "X", extra: 1 }
    then: 400 validation_failed with paths [to], [from], [extra]
    test_data:
      input: as given
      expected: [[to], [from], [extra]]
  - id: TC-U-921
    scenario: no identity is 401 and a missing database is 503
    given: supabase auth mode without a token; an app built without a db
    when: POST /chains/rename
    then: 401 unauthenticated with WWW-Authenticate Bearer; 503 db_unavailable
    test_data:
      input: as given
      expected: [401, 503]
  - id: TC-U-922
    scenario: a failure during the update rolls everything back
    given: U with "AI semis" x3 and an injected repository that throws after the first row
    when: rename { from: "AI semis", to: "AI & Semis" }
    then: 500 problem; all three stocks still read "AI semis"
    test_data:
      input: as given
      expected: { status: 500, unchanged: 3 }
  - id: TC-U-923
    scenario: chain names never reach a log line
    given: logStream captured; names "SENTINEL-FROM-9x" and "SENTINEL-TO-9x"
    when: rename succeeds, then fails with 409
    then: no captured line contains either sentinel
    test_data:
      input: as given
      expected: no match
```

**Notes** — Inject the failure for TC-U-922 the way `imports.confirm.test.ts` does (an
`AppDeps` seam such as `chainsRepo`), not by mocking Drizzle. Measure NFR-002 (200 stocks, p95 ≤
500 ms) in a `chains.latency.test.ts` like `stocks.latency.test.ts`.

### T-004 — Web: shared scope, portfolio loader and concentration link

```yaml
- title: Move scope helpers to stock-filters, share readPortfolio, add a lens to concentrationHref
- description: >
  Behaviour-preserving refactor for ADR-007. Move the scope part of readView (the scope param
  reading and its note), stocksInScope and scopeName from features/concentration/concentration-model.ts
  to features/stock-filters/scope.ts as readScope(params, lists) -> { scope, list, notes },
  stocksInScope, scopeName; move the concentration Scope select to a ScopeSelect component in
  features/stock-filters/. readView keeps its contract by calling readScope. Extract the three
  parallel reads of createConcentrationLoader into readPortfolio(api) -> { stocks, lists, settings }.
  concentrationHref(scope, filters, lens?) takes an optional lens key (default the current
  default lens). Covers FR-007, FR-008 (groundwork).
- agent: react-vite-developer
- depends_on: []
- status: done
- size: S
```

#### Acceptance criteria

- [ ] Every existing concentration and stock-filters test passes without changing what it asserts (imports may change)
- [ ] `/concentration` looks and behaves the same (same address handling, same notes, no extra request)
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-924
    scenario: readScope reads all, held and a list, and notes a missing list
    given: lists [{ id: "L1", name: "Core" }]
    when: readScope with ?scope=held, ?scope=L1, ?scope=L9, ?scope=held&scope=all, no scope
    then: held; L1 with list Core; all + note "That list no longer exists. Showing all stocks."; all + note; all without note
    test_data:
      input: ["scope=held", "scope=L1", "scope=L9", "scope=held&scope=all", ""]
      expected: [held, L1, all+note, all+note, all]
  - id: TC-U-925
    scenario: concentrationHref takes a lens
    given: scope "held", filters { market: [TH] }
    when: concentrationHref("held", filters, "valueChain") and concentrationHref("held", filters)
    then: "/concentration?scope=held&lens=valueChain&measure=count&market=TH" and the default-lens address as today
    test_data:
      input: as given
      expected: ["/concentration?scope=held&lens=valueChain&measure=count&market=TH", "/concentration?scope=held&lens=gicsSector&measure=count&market=TH"]
  - id: TC-U-926
    scenario: readPortfolio reads the three endpoints in parallel
    given: StubApi with GET /stocks, /lists, /settings
    when: readPortfolio(api)
    then: resolves { stocks, lists, settings }; the three requests start before any resolves
    test_data:
      input: stub responses
      expected: 3 requests, parallel
```

### T-005 — Value chains page

```yaml
- title: Build /chains with scope, filters, chain sections, lanes, notes and empty states
- description: >
  Replace the placeholder per ux-design.md §Value chains and design.md §Web. New
  features/chains/: chains-routes.tsx (chainsRoute(api): path chains, crumb Value chains,
  shouldRevalidate revalidateOnSubmitOrPathChange, lazy loader readPortfolio(api) and action
  stub), chains-model.ts (readChainsView = readScope; planChains = stocksInScope ->
  applyStockFilters -> groupChains, memoised; link builders for a chain's stocks, the stocks with
  no chain per scope, and See concentration with lens valueChain), components ChainSection, Lane,
  ChainStockEntry, ChainNotes (fallback, no-chain count, rate), empty states, advice note. Wire it
  in router.tsx. FilterToolbar with keep ['scope'] and sort false; a query change sends no
  request. Money through lib/number-format.ts. No Rename behaviour yet (button present, wired in
  T-006). Covers FR-001..FR-008, FR-012, FR-013, NFR-001, NFR-005..NFR-007.
- agent: react-vite-developer
- depends_on: [T-001, T-004]
- status: done
- size: L
```

#### Acceptance criteria

- [ ] The page matches ux-design.md at 360 px, `md` and `lg` (lanes stacked, then side by side; no horizontal scroll)
- [ ] Changing scope, search or a filter regroups without a request and writes the address with `replace`
- [ ] Every link of [FR-006](requirements.md#fr-006) and [FR-008](requirements.md#fr-008) opens the address the design specifies
- [ ] Held is shown as text; each chain is a labelled region, each lane a labelled list
- [ ] Every spinner and transition has its `motion-reduce` variant
- [ ] All TC-U cases below pass (`renderApp` with `StubApi`, `makeStock`)

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-927
    scenario: chains render in order with their lanes and stocks
    given: stocks in "AI & Semis" (3: Upstream ASML, Midstream TSM held, Downstream MSFT) and "Oil & Gas" (1)
    when: render /chains
    then: two regions named "AI & Semis" then "Oil & Gas"; AI & Semis has lists Upstream, Midstream, Downstream with ASML, TSM (Held), MSFT; each ticker links to /stocks/:id
    test_data:
      input: as given
      expected: regions [AI & Semis, Oil & Gas]
  - id: TC-U-928
    scenario: Integrated and No position areas appear only when used; empty lanes say so
    given: chain with Integrated INTC and a None stock BCP, no Midstream stock
    when: render /chains
    then: "Integrated (spans every stage)" with INTC, "No position" with BCP and a Set position link to /stocks/BCP-id/edit, Midstream shows "No stocks"
    test_data:
      input: as given
      expected: areas shown as described
  - id: TC-U-929
    scenario: lane counts and values are shown as text
    given: Midstream with TSM held 10 x 100 THB and NVDA not held
    when: render /chains
    then: the Midstream counts read "2 stocks · 1 held · ฿1,000.00 · 100.0%" and TSM shows ฿1,000.00
    test_data:
      input: as given
      expected: "2 stocks · 1 held · ฿1,000.00 · 100.0%"
  - id: TC-U-930
    scenario: scope and filters narrow the chains without a request
    given: StubApi counting requests; stocks in two chains, only one held
    when: choose Held stocks in Scope, then filter Market TH
    then: only the held chain shows; the address has scope=held and market=TH; no request after the first load
    test_data:
      input: as given
      expected: { requestsAfterLoad: 0 }
  - id: TC-U-931
    scenario: stocks without a chain are counted and linked by scope
    given: 4 stocks with no chain; scope all, then list L1, then held
    when: render and read the note's link
    then: "4 stocks in view have no value chain."; links /stocks?valueChain=, /lists/L1?valueChain=, /stocks?held=yes&valueChain=
    test_data:
      input: as given
      expected: ["/stocks?valueChain=", "/lists/L1?valueChain=", "/stocks?held=yes&valueChain="]
  - id: TC-U-932
    scenario: chain and concentration links carry scope and filters
    given: scope held, filter market TH, chain "AI & Semis"
    when: read the Stocks link of the chain and See concentration
    then: /stocks with the params market=TH, held=yes, valueChain="AI & Semis" in filterSearch's canonical order, and /concentration?scope=held&lens=valueChain&measure=count&market=TH
    test_data:
      input: as given
      expected: as then
  - id: TC-U-933
    scenario: empty states
    given: emptyApi(); then stocks that all lack a chain; then a search that matches nothing
    when: render /chains
    then: "No value chains yet" with Add stock and Import; "No value chains in this view" with the no-chain link; "0 of N stocks" with Clear all and no empty card
    test_data:
      input: three datasets
      expected: three states
  - id: TC-U-934
    scenario: rate and left-out notes
    given: a held USD stock with amounts and no rate saved; a held stock with no shares
    when: render /chains
    then: a status note about USD holdings with a link to /concentration; the chain says "1 held stock has no shares or cost and is left out of the value."
    test_data:
      input: as given
      expected: two notes
  - id: TC-U-935
    scenario: several spellings are named under the title
    given: stocks "AI & Semis" (earliest) and "ai & semis"
    when: render /chains
    then: one chain titled "AI & Semis" with "Also spelled: ai & semis"
    test_data:
      input: as given
      expected: "Also spelled: ai & semis"
  - id: TC-U-936
    scenario: a bad scope falls back with a note and keeps the address
    given: /chains?scope=missing
    when: render
    then: note "That list no longer exists. Showing all stocks."; location.search still "?scope=missing"
    test_data:
      input: "?scope=missing"
      expected: note shown, address unchanged
  - id: TC-U-937
    scenario: regrouping 200 stocks in 20 chains is fast
    given: 200 stocks in 20 chains, half held
    when: change the scope
    then: the new chains are on screen within 200 ms (NFR-001, measured like TC-C-114)
    test_data:
      input: 200 stocks
      expected: "< 200 ms"
```

**Notes** — The page must render one tree for its empty and filled states where a dialog's
`<Outlet />` or the rename dialog could otherwise change slot (the stocks page lesson). TC-U-937
is a timing test: keep it off the CPU-heavy path the way the existing NFR timing tests are
(carried work item on TC-C-114).

### T-006 — Rename and merge a chain

```yaml
- title: Rename chain dialog with merge step, the rename-chain action and focus handling
- description: >
  Per ux-design.md §Rename chain dialog and design.md §Web. ChainRenameDialog mounts its form
  with the dialog, takes returnFocusTo, starts with the title selected, shows the count of all
  the investor's stocks in the chain (from the loader data, not the view), moves to the merge
  step before sending when chainKey(to) names another chain (Back keeps the text), and handles
  the action results. createChainsAction: JSON { intent: 'rename-chain', from, to, merge } ->
  POST /chains/rename; ok -> toast "Renamed to … · N stocks changed" or "Merged into … · N
  stocks"; 409 chain_exists -> { needsMerge: { name, count } } (dialog moves to the merge step);
  404 -> gone (Alert "This chain no longer exists."); 400 -> field errors; network and 5xx ->
  form Alert, typed name kept. No change -> no request, toast "No changes to save". After a
  plain rename focus goes to the chain's Rename button (data-chain-rename=<key>), after a merge
  to the merged chain's h2. Covers FR-009..FR-012, NFR-006.
- agent: react-vite-developer
- depends_on: [T-005]
- status: done
- size: M
```

#### Acceptance criteria

- [ ] The dialog is keyboard operable end to end; focus lands as specified after cancel, rename and merge
- [ ] A known merge never sends a request before the merge step is confirmed
- [ ] A failed save keeps the dialog open with the typed name
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-938
    scenario: a plain rename posts, toasts, re-reads and returns focus
    given: chain "AI semis" (3 stocks, one outside the current filters); StubApi POST /chains/rename -> { name: "AI & Semis", changed: 3, merged: false }
    when: open Rename, check the hint, type "AI & Semis", submit
    then: hint "Changes the name on 3 stocks, including any outside this view."; body { from: "AI semis", to: "AI & Semis", merge: false }; toast "Renamed to AI & Semis · 3 stocks changed"; GET /stocks re-read; focus on the Rename button of "AI & Semis"
    test_data:
      input: { to: "AI & Semis" }
      expected: as then
  - id: TC-U-939
    scenario: a known merge asks first, Back keeps the text, Merge sends merge true
    given: chains "AI semis" (3) and "AI & Semis" (8)
    when: rename "AI semis" to "ai & semis", submit; press Back; submit again; press Merge 11 stocks
    then: no request until Merge; the merge title is 'Merge into "AI & Semis"?'; after Back the input holds "ai & semis"; the request has merge true; toast "Merged into ai & semis · 11 stocks"; focus on the merged chain's heading
    test_data:
      input: { to: "ai & semis" }
      expected: one request with merge true
  - id: TC-U-940
    scenario: a 409 from a stale page moves to the merge step with the server's figures
    given: StubApi POST /chains/rename -> 409 chain_exists { existingName: "Finance", existingCount: 2 } then 200
    when: rename "Banks" to "Finance" (no Finance chain on the page), submit, then Merge
    then: merge step names "Finance" (2 stocks); the second request has merge true
    test_data:
      input: { to: Finance }
      expected: [409 -> merge step, 200]
  - id: TC-U-941
    scenario: case-only rename is a plain rename
    given: chain "ai & semis" with no other chain of that key
    when: rename to "AI & Semis"
    then: no merge step; request merge false
    test_data:
      input: { to: "AI & Semis" }
      expected: merge false
  - id: TC-U-942
    scenario: errors keep the dialog and the text
    given: StubApi answers 400 { errors: [{ path: "to", message: "Enter a name of 1 to 60 characters." }] }, then 404 chain_not_found, then network failure
    when: submit each time
    then: field error on Chain name with aria-invalid; Alert "This chain no longer exists."; Alert "Couldn't rename the chain. Try again." with the typed name kept
    test_data:
      input: three responses
      expected: three error states
  - id: TC-U-943
    scenario: an unchanged name or an empty name sends nothing
    given: chain "AI & Semis"
    when: submit the title unchanged; clear the input and submit
    then: toast "No changes to save" and the dialog closes; field error "Enter a name of 1 to 60 characters." and no request
    test_data:
      input: ["AI & Semis", ""]
      expected: [no request + toast, no request + field error]
  - id: TC-U-944
    scenario: cancel returns focus to the opener
    given: chain "Banks"
    when: open Rename, press Escape
    then: dialog closed, focus on the Rename button of "Banks", no request
    test_data:
      input: Escape
      expected: focus on Rename
```

### T-007 — Design test cases — value chains

```yaml
- title: Design test cases — value chains
- description: >
  Using the software-tester-design skill, produce structured TC-xxx test cases covering
  all test levels: unit boundaries, API (happy path + error paths + auth), frontend
  component, and E2E flows. Run Steps 0–4 (SUT definition → business flow → field specs
  → scenarios → test data). Output must be in TC-xxx format for software-tester-automation.
  Inputs: requirements.md, design.md, ux-design.md of this slice. Ids in the 900 range
  (TC-A-9xx API, TC-C-9xx component, TC-E-9xx E2E), after the TC-U-900..944 of the tasks. Must
  cover every FR and NFR, the case-folding rules (Thai, inner spaces, spellings), the two-user
  isolation proof, the merge guard against a stale page (two tabs), atomicity, the log-privacy
  proof, the concentration value-chain lens agreeing with /chains (ADR-006), the no-request rule
  for query changes, the 360 px and keyboard-only paths, and the contrast points ux-design.md
  leaves to E2E (Held badge, lane counts, hover state). Save as
  docs/features/value-chains/v1.0/test-cases.md.
- agent: software-tester-design
- depends_on: []
- status: done
- size: M
```

#### Acceptance criteria

- [ ] SUT definition documented
- [ ] TC-xxx cases cover happy path, boundaries, error paths, and business rules
- [ ] Each TC includes Level, Input, Expected Output, Preconditions, and Mock needed
- [ ] A traceability table maps every FR-001–FR-013 and NFR-001–NFR-007 to at least one TC

**Notes** — Runs in parallel with engineering tasks; depends only on requirements/design, not on code.

### T-008 — Automate tests — value chains

```yaml
- title: Automate tests — value chains
- description: >
  Using the software-tester-automation skill, convert the TC-xxx cases from T-007 into
  runnable scripts at the appropriate levels (Unit, API, Frontend Component, E2E).
  Run the full suite against the implementation. E2E specs are e2e/vc-*.spec.ts on the existing
  Playwright setup (admin-created users through e2e/lib/sl.ts helpers, real API, local Supabase):
  see chains with held values; narrow by scope and filters with no request; follow every link;
  rename, case-only rename and merge; merge refused from a stale second tab then confirmed; the
  concentration lens agreeing with /chains; axe in light and dark (extending e2e/lib/states.ts
  with VC states); 360 px with no horizontal scroll; keyboard-only use. Add an apiAs helper for
  the rename and a seedChainsDataset in e2e/lib/vc.ts. Add the slice's TC ids to a test report
  script (pnpm test:report:vc) and write docs/features/value-chains/v1.0/test-report.md; update
  CLAUDE.md for the new module, route, domain names and commands.
- agent: software-tester-automation
- depends_on: [T-001, T-002, T-003, T-004, T-005, T-006, T-007]
- status: done
- size: L
```

#### Acceptance criteria

- [ ] All TC-* from T-007 automated and passing (findings pinned with `test.fail` and a finding id only with the owner's agreement)
- [ ] Coverage >= 95% lines for `packages/domain`; >= 85% for `apps/api/src/modules/chains`; >= 70% for `apps/web/src/features`
- [ ] Test report produced with pass/fail per TC-id
- [ ] The full Investhesis gate is green

**Notes** — Report "T-008 done" with the full test report when all TCs pass. Any contrast failure found here goes back to the owning web task as a fix.

## Status Legend

| Status | Changed By | Meaning |
|--------|-----------|---------|
| `backlog` | Orchestrator | Ready, waiting to be picked up |
| `doing` | Orchestrator / Agent | Agent actively working |
| `blocked` | Agent | Stuck, needs human intervention |
| `test` | Agent | Dev done, needs testing |
| `review` | Agent / Tester | Human must review before advancing |
| `done` | Human | Approved and complete |
