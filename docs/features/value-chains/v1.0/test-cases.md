---
version: 1.0
status: draft
date: 2026-11-25
requires: requirements.md, design.md, ux-design.md, dev-plan.md
task: T-007
---

# Test Cases: Value Chains

Test design for [requirements.md](requirements.md), [design.md](design.md) and
[ux-design.md](ux-design.md). It keeps the 45 `TC-U-900..944` cases already written into tasks
T-001 to T-006 of [dev-plan.md](dev-plan.md) (same ids, none renumbered or redefined; section 3
indexes them) and adds three series: `TC-A-9xx` (API, database, privacy, performance),
`TC-C-9xx` (web component and static) and `TC-E-9xx` (end to end). `software-tester-automation`
(T-008) turns every case into a test whose title starts with its id.

**ID scheme.** Stock Lists owns 1xx, Holdings and Concentration 4xx, Search, Filter and Export 5xx
and 6xx, Thesis Log 7xx. This slice uses the 900 range, one numbering per series
(`TC-A-900..929`, `TC-C-900..942`, `TC-E-900..928`), so no id collides with `TC-U-9xx`.

## 0. Inputs, assumptions and conventions

| Source | Used for |
|---|---|
| requirements.md | FR-001..FR-013, NFR-001..NFR-007, UC-001..UC-004, OQ-1..OQ-5 (resolved) |
| design.md | `chainKey`, `groupChains`, `ChainRename`, `POST /chains/rename`, ADR-001..008 |
| ux-design.md | exact copy, focus order, ARIA structure, responsive rules, contrast points left to E2E |
| dev-plan.md T-001..T-006 | the 45 `TC-U-9xx` cases (extended, not duplicated) |
| Holdings, Search/Filter, Thesis Log test cases | house format, reused fixtures (`StubApi`, `makeStock`, `apiAs`, `trackPointer`, `contrast.ts`) |

Levels: **Unit** (domain, in the task contracts), **API** (`app.inject` on the real local database,
or script level against the stack), **Component** (Testing Library, `StubApi`, jsdom), **Static**
(source scan), **E2E** (Playwright, real web + API + local Supabase, admin-created users).
Priority: P1 smoke, P2 regression, P3 edge. Technique: BVA, EP, DT (decision table), ST (state
transition), EG (error guessing), UC (use case), 2U (two-user), CC (concurrency).

**Case anatomy.** Level, Priority, Technique, covers, Preconditions (**Pre**), Input, Expected
Output (**Expected**), **Mock needed**. Where the three documents are silent the expected value is
marked **(proposed)** and listed in section 9.

**Behaviour the cases rely on** (from design.md and the code that exists today):

- `chainKey(name) = foldText(name.trim())` where the fold is `toLocaleLowerCase('en')`: case and
  surrounding spaces are ignored; inner spaces, Unicode normal form and non-letter characters are
  kept. Thai has no case, so a Thai name matches only itself.
- The value-chain name field is trimmed text of 1 to 60 code points (`boundedText(60)`); a stock
  with a position other than `None` must have a name (`StockInput`), so a chain's lanes never hold
  an unnamed stock.
- Rename: rows of the caller with a chain name are selected `for update`; `from` not found is 404
  before any merge check; `to` on another chain without `merge: true` is 409 `chain_exists`;
  only rows whose stored name differs from `to` are written; `changed` counts those rows.
- The page reads `GET /stocks`, `/lists`, `/settings` once per visit and again after a form submit;
  a query-string change sends nothing.

**Test data sets.**

| Set | Content |
|---|---|
| VC-A | User U, rate `36.500000`, list "Core" = {ASML, TSM, PTTEP}. Stocks in creation order (ticker, market/currency, chain, position, holding): ASML US/USD "AI & Semis" Upstream held 2 x 850.00 USD; AMAT US/USD "ai & semis" Upstream not held; TSM US/USD "AI & Semis" Midstream held 10 x 100.00 USD; NVDA US/USD "AI & Semis" Midstream held 5 x 120.00 USD; MSFT US/USD "AI & Semis" Downstream held 5 x 300.00 USD; INTC US/USD "AI & Semis" Integrated not held; PTTEP TH/THB "Oil & Gas" Upstream held 1000 x 100.00 THB; PTT TH/THB "Oil & Gas" Midstream held, shares and cost unknown; BCP TH/THB "Oil & Gas" None not held; AAPL, KO (held 10 x 60.00 USD), JNJ with no chain. |
| VC-A figures | Chain "AI & Semis" (also spelled "ai & semis"): 6 stocks, 4 held, value ฿175,200.00; Upstream 2 stocks, 1 held, ฿62,050.00, 35.4%; Midstream 2 stocks, 2 held, ฿58,400.00, 33.3% (TSM ฿36,500.00 before NVDA ฿21,900.00); Downstream 1 stock, 1 held, ฿54,750.00, 31.3% (31.25 half up); Integrated 1 stock none held. Chain "Oil & Gas": 3 stocks, 2 held, ฿100,000.00, 1 held stock left out; areas Upstream (PTTEP), Midstream (PTT), Downstream empty, No position (BCP). No chain: 3 stocks. Chains order: AI & Semis (6), Oil & Gas (3). |
| VC-B | Two users for isolation. U: "Banks" x1, "Oil" none. V: "Banks" x5, "Finance" x2, "Oil" x1. |
| VC-C | 200 stocks in 20 chains of 10 (names "Chain 01".."Chain 20", three lanes used), 100 held (THB), written through the API. |
| VC-D | Names: "AI &  Semis" (two inner spaces), " AI & Semis " (outer spaces), "น้ำมัน" (Thai), "น้ำมัน" typed in NFD form, 60 x "😀", 60 Thai characters with combining marks, one 60-character word without spaces, `<img src=x onerror=alert(1)>`, `A&B/C?d=e#f%20+g`, "İstanbul Oil", "ΟΔΟΣ". |
| Clock | Real clock; no case depends on dates. |

## 1. SUT definition

**System under test.** The Value Chains slice: `chainKey`, `groupChains`, `ChainRename` and the
changed `valueChain` concentration lens (`packages/domain`); `POST /chains/rename`
(`apps/api/src/modules/chains/`); the shared scope helpers, `readPortfolio` and
`concentrationHref(…, lens)`; and the `/chains` page with its rename dialog
(`apps/web/src/features/chains/`).

| Part | Inputs | Outputs | Boundaries and invariants |
|---|---|---|---|
| `chainKey` / `groupChains` | stocks (chain, position, holding, `createdAt`, ticker, name), `usdThbRate` | chains, areas, counts, THB values, shares, left-out counts, `noChainIds`, `needsRate` | same name ignoring case and outer spaces is one chain; title = earliest-created spelling (ties by id); three lanes always; Integrated and No position only when used; exact BigInt values, half up; no stock counted twice |
| `POST /chains/rename` | bearer identity, `{ from, to, merge? }` | 200 `{ name, changed, merged }`, 400, 401, 404, 409, 503 | `to` is 1..60 code points trimmed; only the caller's rows; all-or-nothing; rows locked at save time decide; no body logged; no network call |
| Concentration lens | stocks, lens `valueChain` | groups | folds like `chainKey`, labels like the chain title; other lenses unchanged |
| `/chains` page | address (`scope`, filters, `q`), loader data | sections, lanes, notes, links | regroup in the browser with no request; address written with `replace`, bad parts noted not rewritten; text only; AA contrast; stacks at 360 px |
| Rename dialog | typed name | one request, toast, re-read, focus | hint counts all the investor's stocks of the chain; merge asks first; failure keeps text |

## 2. Business flow map

- **Happy path (UC-001, UC-002).** Open `/chains`; see each chain with upstream, midstream and
  downstream lanes, Held markers, counts and THB value per lane; follow a ticker to its page.
- **Alternative flows (UC-003, UC-004).** Scope to held or a list; filter and search; bookmark the
  address; **Stocks →**, **Show them**, **See concentration**, **Set position**; rename a chain;
  case-only rename; unify spellings; merge into an existing chain; set a rate on `/concentration`
  and return.
- **Exception flows.** Missing list in the address; bad filter values; load failure and Retry;
  rename 400, 404 (chain gone), 409 (stale page), 5xx, network, 401 mid-save; another tab changes
  the data first; no rate saved; held stock with unknown amounts; two users with the same names.
- **Edge cases.** Names of 1, 60, 61 characters, emoji and combining marks; inner spaces; Thai;
  NFC vs NFD; `<`, `&`, `/`, `#`, `%` in names; 200 stocks in 20 chains; a chain whose every held
  stock is unvalued; chains of equal size; a list with no stocks; chain whose stocks are all
  filtered out; renaming while a filter on the old name is in the address.

## 3. Existing coverage (TC-U-9xx in dev-plan.md, kept as written)

| Task | Ids | What they cover |
|---|---|---|
| T-001 domain | TC-U-900..910 | `chainKey` fold (Thai, inner spaces), `valueAtCost`, chain grouping and order, title and spellings, areas, in-area order, exact counts, values and shares, left-out and `needsRate`, `noChainIds`, `ChainRename` parse |
| T-002 concentration | TC-U-911..912 | `valueChain` lens folds case with the chain title, themes stay exact |
| T-003 API | TC-U-913..923 | rename rewrite, case-folded `from`, case-only, 409 and merge, 404, other user's chain, 400 paths, 401 and 503, rollback, no names in logs |
| T-004 refactor | TC-U-924..926 | `readScope`, `concentrationHref` with a lens, `readPortfolio` |
| T-005 page | TC-U-927..937 | render order, areas, counts, scope and filters without a request, no-chain links, chain and concentration links, empty states, notes, spellings, bad scope, 200-stock timing |
| T-006 rename | TC-U-938..944 | plain rename, merge with Back, 409 stale, case-only, errors, no-change and empty name, Escape focus |

Also reused unchanged: the existing concentration and search-filter suites (they must stay green
through the T-002 and T-004 refactors), `TC-A-106` style Data API checks (no new table, so none is
added), and the generic motion and contrast suites.

## 4. API, database, privacy and performance cases (TC-A-9xx)

All run through `buildTestApp`/`appFor` from `apps/api/test/db.ts` on the real local database with
their own random user ids, unless a case says "script" (against the running stack). Seeding uses
`seedStock` with explicit `createdAt` where order matters.

### TC-A-900
**API** · **P1** · EP · covers NFR-003, FR-009 (contract).
**Pre** app built with the OpenAPI plugin. **Input** `GET /openapi.json`. **Expected** the path
`/chains/rename` has `post` with `security: bearerAuth`, a request body with `from`, `to` and
`merge` (boolean, optional), responses 200 (`name`, `changed`, `merged`), 400, 401, 404, 409, 503
documented as problem responses; no other `/chains*` path exists. **Mock** none.

### TC-A-901
**API** · **P1** · EP · covers NFR-003.
**Pre** supabase auth mode with locally signed tokens (`test/auth.ts`). **Input** `POST
/chains/rename { from: "A", to: "B" }` with: no header; `Authorization: Basic x`; `Bearer` garbage;
an expired token; a token with the wrong audience; the `anon` role token; a token signed by an
unknown key. **Expected** 401 `unauthenticated` each, `WWW-Authenticate: Bearer`, body carries
`requestId`, the reason only in the log; no row of any user changed (checked by a seeded chain
"A"). A JWKS outage with no cached key answers 503 `auth_unavailable` with `Retry-After: 5`.
**Mock** `createLocalJWKSet`, an unreachable JWKS URL for the outage row.

### TC-A-902
**API** · **P1** · EP · covers FR-009.
**Pre** user U with VC-A. **Input** `POST /chains/rename { from: "ai & semis", to: "AI & Semis" }`
then `GET /stocks`, `GET /lists`, `GET /stocks?listId=`. **Expected** 200 `changed: 1` (only AMAT
differed); every stock of U reads back identical to before except AMAT's `valueChain` and
`updatedAt`; holdings (shares, cost, currency), positions, list membership (`listIds`), notes,
`createdAt` and every other lens unchanged; stocks of "Oil & Gas" and the no-chain stocks have the
same `updatedAt` as before. **Mock** none.

### TC-A-903
**API** · **P1** · EP/EG · covers FR-001, FR-009, FR-010 (case folding).
**Pre** per row, user U with one stock whose chain is column 1. **Input** rename `from` = column 2,
`to` = "Renamed". **Expected** as in column 3.

| Stored | `from` | Expected | Why |
|---|---|---|---|
| "AI & Semis" | "ai & semis" | 200 changed 1 | case folds |
| "AI & Semis" | "  AI & SEMIS  " | 200 changed 1 | outer spaces ignored in `from` |
| " AI & Semis " (via import write) | "AI & Semis" | 200 changed 1 | stored outer spaces ignored |
| "AI & Semis" | "AI &  Semis" | 404 `chain_not_found` | inner spaces count |
| "AI &  Semis" | "AI & Semis" | 404 | inner spaces count the other way |
| "น้ำมัน" | "น้ำมัน" | 200 changed 1 | Thai matches itself |
| "น้ำมัน" (NFC) | "น้ำมัน" typed in NFD | 404 (proposed, see section 9) | no normalisation in `chainKey` |
| "İstanbul Oil" | "i̇stanbul oil" | 200 changed 1 | `toLocaleLowerCase('en')` of İ is `i` plus U+0307 |
| "ΟΔΟΣ" | "οδοσ" | 404 (proposed) | contextual final sigma: `ος` vs `οσ` are different keys |
| "Straße" | "STRASSE" | 404 | `ß` does not fold to `ss` |

**Mock** none.

### TC-A-904
**API** · **P1** · EP · covers FR-009, FR-010.
**Input** `to` = "  AI &  Semis  " (outer spaces, two inner spaces). **Expected** stored value is
`"AI &  Semis"` (trimmed, inner spaces kept, case as typed); response `name` is the same string; a
second chain keyed `"ai & semis"` is not touched and is not merged (different key).
**Mock** none.

### TC-A-905
**API** · **P1** · BVA · covers FR-009 (name rules).
**Pre** U has "Old". **Input** `to` of: 1 char "A"; 60 `a`; 61 `a`; 60 x "😀" (120 UTF-16 units);
61 x "😀"; 60 Thai code points with combining marks; `""`; `"   "`; `null`; `42`; 60 `a` with 5
outer spaces (65 raw characters). **Expected** 200 for 1, 60, 60 emoji, 60 Thai and the padded 60
(trim before the bound); 400 `validation_failed` with path `to` for 61, 61 emoji, `""`, `"   "`,
`null`, `42`; a failed call writes nothing. The 60-emoji name reads back identical from Postgres
(`char_length` 60). **Mock** none.

### TC-A-906
**API** · **P2** · BVA · covers FR-009.
**Pre** U has a chain named with 60 characters and one named "X". **Input** `from` of the 60
characters; 61 characters; `""`; `"   "`; missing; a number. **Expected** 200 for the first (it
matches); 400 on path `from` for the others (a too-long `from` is a validation error, not a 404).
**Mock** none.

### TC-A-907
**API** · **P2** · EG · covers FR-009 (no-op).
**Pre** U has "Banks" x3, all exactly "Banks", each with a known `updated_at`. **Input** rename
`{ from: "banks", to: "Banks" }` is not a no-op (it matches) but `{ from: "Banks", to: "Banks" }`
is. **Expected** 200 `{ name: "Banks", changed: 0, merged: false }`; no `updated_at` moved; no
row rewritten (the transaction's update affected 0 rows). **Mock** none.

### TC-A-908
**API** · **P2** · DT · covers FR-010.
**Pre** U has "Banks" x2 and no "Finance". **Input** `{ from: "Banks", to: "Finance", merge: true }`.
**Expected** 200 `{ name: "Finance", changed: 2, merged: false }` (`merge: true` with nothing to
merge is not an error and does not claim a merge). **Mock** none.

### TC-A-909
**API** · **P1** · DT · covers FR-010, FR-011.
**Pre** U has "Finance" x2 and no "Ghost". **Input** `{ from: "Ghost", to: "Finance" }` and
`{ from: "Ghost", to: "Finance", merge: true }`. **Expected** 404 `chain_not_found` for both (the
missing `from` is reported before the merge check; the response does not reveal that "Finance"
exists). **Mock** none.

### TC-A-910
**API** · **P1** · EP · covers FR-010, ADR-004.
**Pre** U has "AI semis" x3 and, created in this order, "ai & semis" (2026-01-01), "AI & Semis"
x7 (2026-02-01 and later). **Input** `{ from: "AI semis", to: "AI &  semis" }` is a different key,
so use `{ from: "AI semis", to: "AI & SEMIS" }`. **Expected** 409 `application/problem+json`,
`code: chain_exists`, `status: 409`, `existingName: "ai & semis"` (earliest-created spelling),
`existingCount: 8`, `requestId` present, `Cache-Control: no-store`; nothing written (all 11 rows
unchanged, `updated_at` equal). **Mock** none.

### TC-A-911
**API** · **P2** · EP · covers FR-010.
**Pre** as TC-A-910. **Input** same request with `merge: true`. **Expected** 200 `{ name: "AI &
SEMIS", changed: 11, merged: true }`; all 11 rows read back exactly `"AI & SEMIS"`, each with
`lens_sources.valueChain = manual` and a moved `updated_at`; positions and holdings of all 11
unchanged. **Mock** none.

### TC-A-912
**API** · **P2** · EP · covers FR-010 (unify spellings).
**Pre** U has "AI & Semis" x2, "ai & semis" x1, "Ai & semis" x1 and "Banks" x1. **Input** `{ from:
"ai & semis", to: "AI & Semis" }` (no merge flag). **Expected** 200 `{ changed: 2, merged: false }`;
the two exact rows keep their `updated_at`; "Banks" untouched; no 409 (same key is not another
chain). **Mock** none.

### TC-A-913
**API** · **P1** · 2U · covers NFR-003.
**Pre** VC-B in the real database. **Input** U renames `{ from: "Banks", to: "Finance" }`;
then U renames `{ from: "Oil", to: "Energy" }`; then V (through `appFor`) renames `{ from:
"Banks", to: "Finance", merge: true }`. **Expected** U's first call 200 `changed: 1, merged:
false`, no 409 although V has "Finance"; V's 8 stocks (all columns including `updated_at` and
`lens_sources`) are byte-identical after U's calls; U's second call is 404; V's own call 200
`changed: 5, merged: true`, and U's renamed stock is still "Finance" with its own `updated_at`; a
direct `select` for U's rows shows none of V's names. No response of U carries V's counts or
names. **Mock** none.

### TC-A-914
**API** · **P1** · ST/CC · covers FR-010, ADR-004 (stale page, API level).
**Pre** U has "Banks" x3. The "page" captures `chains = {Banks}`. **Input** another request
creates a stock "Finance" (`POST /stocks`, value chain "finance", Downstream). Then the stale
client sends `{ from: "Banks", to: "Finance", merge: false }`; the user confirms and it sends the
same with `merge: true`. **Expected** first answer 409 `existingName: "finance"`, `existingCount:
1`, rows untouched; second 200 `{ changed: 4, merged: true }`; all 4 rows read "Finance". **Mock**
none.

### TC-A-915
**API** · **P1** · ST · covers FR-011.
**Pre** U has "AI semis" x3 (S1..S3). **Input** the page saw 3; before the save: `PATCH /stocks/S3`
sets valueChain "Other" (and position stays), `POST /stocks` adds S4 "ai semis"; then rename `{
from: "AI semis", to: "AI & Semis" }`. **Expected** 200 `changed: 3` (S1, S2, S4); S3 is still
"Other"; a rename whose chain vanished entirely (all three PATCHed away) answers 404
`chain_not_found`. **Mock** none.

### TC-A-916
**API** · **P2** · CC · covers FR-011.
**Pre** U has "Alpha" x10. **Input** `Promise.all` of `{ from: "Alpha", to: "Beta" }` and `{ from:
"Alpha", to: "Gamma" }` sent on one app instance, repeated 20 times with fresh data each time.
**Expected** exactly one 200 with `changed: 10` and one 404 `chain_not_found` each time; the ten
rows end with one name (never a mix of Beta and Gamma); no 500, no deadlock. **Mock** none.

### TC-A-917
**API** · **P3** · CC/EG · covers FR-011 (risk, design.md step 1 has no `order by`).
**Pre** U has "Left" x5 and "Right" x5, interleaved in insertion order, plus 50 other stocks.
**Input** `Promise.all` of `{ from: "Left", to: "Right", merge: true }` and `{ from: "Right", to:
"Left", merge: true }`, 30 rounds. **Expected** no 500 and no `deadlock detected` in any round;
each round ends consistent: all ten rows share one name, one call answered 200 `merged: true` and
the other 200 or 404. If a deadlock ever appears the finding is "lock rows in id order"
(section 9). **Mock** none.

### TC-A-918
**API** · **P1** · EG · covers FR-011 (atomicity).
**Pre** U has "AI semis" x4 and "AI & Semis" x7. **Input** inject `chainsRepo` (the `AppDeps`
seam, as `imports.confirm.test.ts`) whose update throws after the 6th row, then `POST
/chains/rename { from: "AI semis", to: "ai & semis", merge: true }`. **Expected** 500 problem body
without any chain name or row data; afterwards all 11 rows have their old `value_chain`,
`lens_sources` and `updated_at`; the same request without the fault then succeeds with `changed:
11`. Also: killing the transaction (`pg_terminate_backend` of its backend) before commit leaves all
rows as before. **Mock** `chainsRepo` fault; `pg_terminate_backend` through a second connection.

### TC-A-919
**API** · **P2** · EP · covers FR-009 (`lens_sources`).
**Pre** four stocks in chain "Old" with `lens_sources` of `{}`, `{"valueChain":"manual"}`,
`{"economicCycle":"default","valueChain":"manual"}` and `{"economicCycle":"manual","size":"manual"}`.
**Input** rename to "New". **Expected** every row's `lens_sources` equals its old object plus
`valueChain: manual` (other keys, including `economicCycle: default`, kept; no key removed). **Mock**
none.

### TC-A-920
**API** · **P2** · EP · covers FR-009 (same rules as a stock PATCH).
**Pre** VC-A. **Input** rename "Oil & Gas" to "Energy"; read every stock back; re-parse each with
the domain `StockInput`; then `PATCH /stocks/{PTTEP}` with `{ valueChainPosition: "Downstream" }`.
**Expected** every renamed stock still parses (a position other than `None` still has a name);
the PATCH answers 200 and keeps "Energy"; `GET /stocks` returns the new name for the 3 stocks.
**Mock** none.

### TC-A-921
**API** · **P1** · EG · covers NFR-004.
**Pre** logger writing to a captured `logStream` at level `trace`, supabase auth mode, stocks with
chain names `SENTINEL-FROM-9x` / `SENTINEL-TO-9x` and holdings with shares `98765.4321`, cost
`12345.6789` and rate `36.123456`. **Input** run: success, 400 (`to` = sentinel + 61 chars), 404,
409, a merge, a 500 (fault injected as TC-A-918) and a 401. **Expected** no captured line (request,
response, error, pg error serialiser output, `detail`, `where`) contains either name sentinel or
any amount; the 400 problem `detail` and `errors[].message` do not echo the submitted value. **Mock**
`logStream`, `chainsRepo` fault.

### TC-A-922
**API** · **P1** · EG · covers NFR-004 (no third party).
**Pre** as TC-A-921, with `fetch`, `http.request`, `https.request`, `net.connect` (non-database)
and undici spied. **Input** run the rename, merge and 409 paths with a cached JWKS. **Expected** no
outbound call other than the database socket; the Supabase JWKS endpoint is not hit when the key
is cached. **Mock** network spies.

### TC-A-923
**API** · **P2** · EP · covers NFR-004, NFR-003.
**Pre** VC-A with holdings. **Input** every success and error response of the rename routes
(200, 400, 404, 409). **Expected** the 200 body has exactly the keys `name`, `changed`, `merged`
(no stock, id, user id, holding, rate); problem bodies have only `type`, `title`, `status`, `code`,
`detail`, `errors`, `requestId` and, for 409, `existingName` and `existingCount`. **Mock** none.

### TC-A-924
**API** · **P1** · BVA · covers NFR-002.
**Pre** U has 200 stocks in one chain with three spellings; real database, single user. **Input**
20 renames that each change 200 stocks (alternating two names), then 20 merges of 100 + 100.
**Expected** p95 of the response time of each series is at most 500 ms; the figures are logged;
`chains.latency.test.ts` is a timing test run serially after the other API suites. **Mock** none.

### TC-A-925
**API** · **P2** · EP · covers FR-009, NFR-003.
**Pre** U has "Banks". **Input** success and each error response. **Expected** `Content-Type:
application/json` for 200 and `application/problem+json` for errors; `Cache-Control: no-store`;
security headers of the plugin present; `X-Request-Id` echoed; the 200 is not cacheable. **Mock**
none.

### TC-A-926
**API** · **P3** · EG · covers ADR-002, ADR-003.
**Input** `GET /chains`, `GET /chains/rename`, `PUT`/`PATCH`/`DELETE /chains/rename`, `POST
/chains/Banks`, `POST /chains/rename/` (trailing slash). **Expected** 404 (or 405) problem
responses for all; no handler other than `POST /chains/rename` exists; a trailing slash is treated
like the Fastify default of the other modules. **Mock** none.

### TC-A-927
**API** · **P2** · EG · covers FR-009 (validation), NFR-003.
**Input** malformed JSON; empty body; `Content-Type: text/plain`; a JSON array; `{}`; `{ from:
"A", to: "B", merge: null }`; `{ from: "A", to: "B", merge: "true" }`; `{ from: "A", to: "B",
userId: "x" }`; `{ from: {}, to: [] }`; a 2 MB body. **Expected** 400 `validation_failed` (or 413
for the oversized body, as the other modules) with a path for each field problem; never 500; the
`userId` key fails with path `userId` and cannot choose the owner. **Mock** none.

### TC-A-928
**API** · **P3** · EP · covers FR-009 (exports unchanged), Constraints.
**Pre** VC-A, rename "Oil & Gas" to "Energy". **Input** `GET /exports/backup.json`, `GET
/exports/backup.csv`. **Expected** JSON `stocks[].valueChain` is "Energy" for the three stocks and
the CSV `value_chain` column too; `formatVersion` and every other field unchanged; an import of
that CSV in update mode leaves chain names as written. **Mock** none.

### TC-A-929
**API** · **P3** · EG · covers Constraints (no new table, ADR-001).
**Input** list tables of schema `app`; list `supabase/migrations/*`; run the schema drift test.
**Expected** no `chains` table or column; the newest migration is still the thesis-log one; the
drift test passes unchanged; `src/db/schema/` has no new file. **Mock** none.

## 5. Component and static cases (TC-C-9xx)

Vitest and Testing Library with `renderApp(path, stubApi)`, `StubApi`, `makeStock`, `makeList`;
the rename cases extend the T-006 fixtures. Layout cannot be measured in jsdom, so layout cases
check classes and DOM order, and E2E checks pixels. Timing cases are serial.

### Page structure and content

### TC-C-900
**Component** · **P1** · EP · covers FR-001, FR-013, UC-001.
**Pre** VC-A in `StubApi`. **Input** open `/chains` from the sidebar. **Expected** breadcrumb
"Value chains", `document.title` contains "Value chains", h1 "Value chains" is focused, the sidebar
item is `aria-current`, the description "Your stocks along each chain, from upstream to
downstream." is shown, a link "See concentration" is in the header. **Mock** `StubApi`.

### TC-C-901
**Component** · **P1** · EP · covers NFR-006.
**Pre** VC-A. **Input** inspect the accessibility tree. **Expected** each chain is a `region`
named by its `h2` ("AI & Semis", "Oil & Gas"); inside, three `region`s (or labelled sections)
named by `h3` Upstream, Midstream, Downstream, each containing a `list` of `listitem`s; the counts
line sits after the heading in the same section; Integrated and No position are labelled
sections; notes are `role="status"`; no heading level is skipped (h1, h2, h3). **Mock** none.

### TC-C-902
**Component** · **P1** · EP · covers FR-004, FR-005, FR-003, UC-002.
**Pre** VC-A, scope all. **Input** render. **Expected** AI & Semis summary "6 stocks · 4 held ·
฿175,200.00"; Upstream "2 stocks · 1 held · ฿62,050.00 · 35.4%"; Midstream "2 stocks · 2 held ·
฿58,400.00 · 33.3%"; Downstream "1 stock · 1 held · ฿54,750.00 · 31.3%"; Integrated "1 stock ·
none held"; ASML entry shows ฿62,050.00 (2 x 850.00 USD at 36.5); Oil & Gas "3 stocks · 2 held ·
฿100,000.00"; Upstream of Oil & Gas "1 stock · 1 held · ฿100,000.00 · 100.0%"; singular and plural
as written (singular is proposed, section 9). **Mock** none.

### TC-C-903
**Component** · **P1** · BVA · covers NFR-005, FR-005.
**Pre** chains with: THB held 3 x 0.1 (value `0.30`); THB held 9007199254740993 x 1 (above 2^53);
USD held 1 x 0.01 at rate `36.123456` (value `0.36`); two lanes of 1/16 and 15/16 of the chain
value (6.25 and 93.75). **Input** render. **Expected** ฿0.30 (not 0.30000000000000004),
฿9,007,199,254,740,993.00, ฿0.36 (6 rate decimals kept, half up display), shares "6.3" and "93.8"
(half up; they sum to 100.1, which is accepted); no `NaN`, `e+`, or rounding drift anywhere. **Mock**
none.

### TC-C-904
**Component** · **P1** · EP · covers FR-004, NFR-006.
**Pre** VC-A. **Input** read every entry's text. **Expected** the text "Held" is in the accessible
name of exactly the 6 held stocks that have a chain (ASML, TSM, NVDA, MSFT, PTTEP, PTT; KO is held but
has no chain and is not shown), and in none of the not held ones; it is a `Badge` rendering text, not an icon or
colour class alone; a held stock with unknown amounts still shows "Held" and no value. **Mock** none.

### TC-C-905
**Component** · **P1** · EP · covers FR-003.
**Pre** VC-A. **Input** read the DOM order of entries per lane. **Expected** AI & Semis Upstream:
ASML (held, valued) then AMAT; Midstream: TSM (฿36,500.00) then NVDA (฿21,900.00); Oil & Gas
Midstream: PTT (held, unvalued); each entry shows ticker, name and market ("ASML Holding · US")
and links to exactly `/stocks/<id>`; the name is not a second link target. **Mock** none.

### TC-C-906
**Component** · **P2** · EG · covers NFR-007, NFR-005 (text only).
**Pre** chains named with the VD names: 60 x "😀", a 60-character word, `<img src=x
onerror=alert(1)>`, `A&B/C?d=e#f%20+g`; stocks with 120-character names and a 60-character word as
ticker-less name. **Input** render. **Expected** names appear as literal text (`querySelector('img')`
is null, no `onerror` side effect, `&` and `%20` shown literally); headings, entries and the
rename hint have `break-words` (or `wrap-anywhere`) and no fixed width or `whitespace-nowrap`;
no `title` attribute needed to read a name. **Mock** none.

### TC-C-907
**Component** · **P1** · DT · covers FR-005, NFR-006.
**Pre** (a) a chain with 2 held stocks with null shares and 1 USD held with amounts, no rate saved;
(b) the same with a rate saved; (c) USD held without amounts and no rate. **Input** render each.
**Expected** (a) the chain says how many were left out (proposed wording "2 held stocks have no
shares or cost, 1 needs a rate, and they are left out of the value." with singular for 1), value
shows only valued stocks; one `role="status"` page note "USD holdings are left out of values until
you save a rate." with a link to `/concentration` (shown once, not per chain); (b) no rate note,
USD stock valued; (c) no rate note (nothing needs a rate), only the unvalued count. **Mock** none.

### TC-C-908
**Component** · **P2** · DT · covers FR-005, FR-004.
**Pre** chains: C1 no held stock; C2 held stocks all unvalued; C3 valued held stocks. **Input**
render. **Expected** C1 "3 stocks · none held", no ฿, no %; C2 "2 stocks · 2 held", no "฿0.00" and
no share (the value line and shares show only when a held stock is valued; the domain's `"0.00"`
is not displayed); C3 as TC-C-902. **Mock** none.

### TC-C-909
**Component** · **P1** · DT · covers FR-002, ux "Annotations".
**Pre** chains: X with Upstream only; Y with Integrated and No position (None and null position);
Z with no Integrated and no No position. **Input** render. **Expected** every chain has exactly
three lanes; empty lanes read "No stocks" in `text-muted-foreground`; "Integrated (spans every
stage)" and "No position" appear only in Y, with no empty versions in X and Z; both None and null
land in No position without telling them apart; "Set position" links to `/stocks/<id>/edit`
appear only in the No position area, one per stock. **Mock** none.

### TC-C-910
**Component** · **P2** · EP · covers FR-001 (OQ-4).
**Pre** chains with 1 spelling, 2 spellings and 3 spellings ("Oil", "oil", "OIL "). **Input**
render. **Expected** no "Also spelled" for one; "Also spelled: ai & semis" for two; "Also spelled:
oil, OIL" for three (comma-separated, title excluded, outer spaces trimmed); the title is the
earliest-created stock's spelling even when a later stock sorts first by ticker. **Mock** none.

### TC-C-911
**Component** · **P1** · EP/EG · covers FR-001, case folding.
**Pre** stocks named: "AI & Semis", "ai & semis", " AI & Semis ", "AI &  Semis", "น้ำมัน" x2 (one
NFC, one NFD), "ΟΔΟΣ", "οδοσ". **Input** render. **Expected** one chain for the first three (3
stocks); a separate chain "AI &  Semis"; "น้ำมัน" as one chain only when both stocks use the same
normal form (the NFC and NFD stocks are two chains, proposed, section 9); "ΟΔΟΣ" and "οδοσ"
separate; all regions have distinct accessible names or are told apart by position. **Mock** none.

### TC-C-912
**Component** · **P2** · EP · covers FR-001.
**Pre** chains "banks" (2), "Autos" (2), "Zinc" (2), "Oil" (5), "Ünits" (2), "น้ำมัน" (2).
**Input** render. **Expected** Oil first; then the size-2 chains in case-insensitive name order
(proposed: "Autos", "banks", "Ünits", "Zinc", then Thai after Latin); the order is stable across
reloads and does not change when a filter is toggled and cleared. **Mock** none.

### Scope, filters, search and the no-request rule

### TC-C-913
**Component** · **P1** · EP · covers FR-007, UC-003.
**Pre** VC-A. **Input** open the Scope select; read options; choose "Held stocks"; choose "Core";
open `/chains?scope=<Core id>` directly; open `/chains?scope=held&scope=all`. **Expected** options
"All stocks (N)", "Held stocks (H)" and a "Lists" group with "Core (3)"; held scope shows only
held stocks (chains with no held stock disappear, AMAT and INTC drop out of AI & Semis); Core
shows ASML, TSM, PTTEP; the address is written with `replace` (history length unchanged); a
repeated `scope` falls back to all with one note; selecting All removes `scope` from the address.
**Mock** none.

### TC-C-914
**Component** · **P1** · DT · covers FR-007, UC-003.
**Pre** VC-A. **Input** (a) Filter Position (value chain position) = Upstream; (b) Market = TH and
search "PTT"; (c) filter Market = US and Clear all; (d) filter Value chain position "Not set";
(e) search "  asml  ". **Expected** (a) only Upstream lanes hold stocks, the other lanes "No stocks",
chains with no Upstream stock disappear; (b) "Oil & Gas" with PTTEP and PTT only, result line "2 of
13 stocks"; (c) Clear all restores 13; (d) the No position area of Oil & Gas shows BCP only and
chains without such a stock disappear; (e) trimmed search finds ASML (the box keeps the spaces,
the address `q=asml`). Notes about filters follow `FilterToolbar` unchanged. **Mock** none.

### TC-C-915
**Component** · **P1** · EP · covers NFR-001, FR-007.
**Pre** `StubApi` counting every request including `/me`. **Input** after the first load: Scope to
Held, to Core, to All; toggle Market TH, TH+US, clear; type "ASML" into the search; Clear all;
change `?scope=` by navigating the address. **Expected** the recorded requests stay exactly `GET
/stocks`, `GET /lists`, `GET /settings` (and the app route's one `GET /me`) once each; every
state change is on screen without awaiting a request; the address uses `replace`. **Mock**
`StubApi` request log.

### TC-C-916
**Component** · **P1** · ST · covers NFR-001 ("after a rename").
**Pre** as TC-C-915 and a stubbed rename 200. **Input** rename a chain. **Expected** after the
form submit the loader re-reads `GET /stocks`, `GET /lists`, `GET /settings` exactly once each and
nothing else (no second read from `shouldRevalidate` of the app route); a query-only change after
that sends nothing again. **Mock** `StubApi`.

### TC-C-917
**Component** · **P2** · BVA · covers NFR-001 (timing).
**Pre** VC-C (200 stocks, 20 chains), fake clock off. **Input** (a) change scope All to Held; (b)
toggle one Filters checkbox; (c) type one letter into the search; each repeated 5 times.
**Expected** median time from the event to the new chains on screen is under 200 ms for each; the
figures are logged; serial timing test (as TC-C-114 and TC-U-937). **Mock** none.

### Links and notes

### TC-C-918
**Component** · **P1** · DT · covers FR-006.
**Pre** 4 stocks with no chain in view, plus current filters Market = TH and `q=oil`; scopes all,
list L1, held; also 1 stock with no chain; 0 stocks with no chain; the filter Value chain is
"AI & Semis" (so none lacks a chain). **Input** render and read the note. **Expected** "4 stocks in
view have no value chain." with a button "Show them" linking `/stocks?…valueChain=` (and `/lists/L1`
or `held=yes` for the other scopes) carrying `market=TH` and `q=oil`; singular "1 stock in view has
no value chain."; no note at all for 0; with a value-chain filter active the link replaces the
value-chain picks with "Not set"; the count only counts stocks in view (scope and filters). **Mock**
none.

### TC-C-919
**Component** · **P1** · EP/EG · covers FR-008.
**Pre** chains named `A&B/C?d=e#f%20+g`, "น้ำมัน", 60 x "😀", `İstanbul Oil`, "AI &  Semis";
filters Market = US; scope held. **Input** read each chain's **Stocks →** link. **Expected** each
is `/stocks` with the current filters, `held=yes` for the held scope, and `valueChain=` carrying the
chain's title, percent-encoded; parsing the link with `readFilters` returns exactly the title (round
trip, no double encoding, `+`, `#` and `%20` survive); an existing `valueChain` pick in the address
is replaced, not appended; a list scope uses the list base `/lists/<id>` (proposed, section 9). **Mock**
none.

### TC-C-920
**Component** · **P1** · EP · covers FR-008, ADR-006.
**Pre** VC-A with scope held and Market filter US. **Input** read **See concentration**, follow
it in the router. **Expected** href `/concentration?scope=held&lens=valueChain&measure=count&market=US`;
the destination renders Group by "Value chain name" with the scope and filter chips restored and no
`lens` or `measure` fallback note. **Mock** none.

### TC-C-921
**Component** · **P1** · EP · covers ADR-006, ADR-007, FR-008.
**Pre** VC-A plus VC-D-style names (one stock "AI & Semis ", Thai chain) in one `StubApi`. **Input**
render `/chains` and `/concentration?lens=valueChain&measure=count`, and again with `measure=value`;
repeat with `scope=held` and with Market = US. **Expected** the set of (label, count) of the
concentration groups equals the set of (chain title, stocks in view) of the page, spellings merged
the same way (label "AI & Semis" from the earliest-created stock); with `measure=value` each
group's value equals the chain's value line (฿175,200.00) and the left-out notes agree (same
number of held stocks left out); the stocks with no chain are the "Not set" group of concentration
and the page's no-chain count. **Mock** none.

### TC-C-922
**Component** · **P2** · EP · covers ADR-006.
**Pre** stocks with themes ["AI"] and ["ai"] and value chains "x", "X". **Input** `/concentration?lens=themes`
and `lens=valueChain`. **Expected** themes shows two groups "AI" and "ai"; value chain shows one
group; no other lens label changed against the same data before the slice (snapshot of all 16
lenses on the VC-A data equals the pre-change output except `valueChain`). **Mock** none.

### Empty, error and loading states

### TC-C-923
**Component** · **P1** · DT · covers FR-012.
**Pre** (a) `emptyApi()`; (b) 14 stocks none with a chain; (c) 1 stock with no chain; (d) a list
with no stocks and `scope=<list>`; (e) a search that matches nothing; (f) a scope list that was
deleted. **Input** render each. **Expected** (a) "No value chains yet" with **Add stock** (`/stocks/new`)
and **Import** (`/import-export`), no chain cards, no filter toolbar errors; (b) "No value chains
in this view" with the explanation of name and position and a button "Show the 14 stocks with no
chain"; (c) singular "Show the 1 stock with no chain" (proposed); (d) empty state without the
button (it would read "0 stocks", proposed, section 9); (e) the result line "0 of 14 stocks" and
**Clear all**, no chain cards and no empty card; (f) the note "That list no longer exists. Showing
all stocks." and all stocks shown. Each empty state has a `role="status"` or heading with focusable
actions. **Mock** none.

### TC-C-924
**Component** · **P1** · EP · covers FR-012.
**Pre** `StubApi` answering 500 for `/stocks`, then 200; separately 500 for `/settings` only;
separately a network failure. **Input** open `/chains`, press **Retry**. **Expected** the app's
`RouteError` with Retry (no partial page when one of the three reads fails); Retry re-requests the
three reads and shows the page; no stock data or chain names in the error text. **Mock** `StubApi`
failures.

### TC-C-925
**Component** · **P3** · ST · covers FR-012 (loading).
**Pre** `StubApi` that resolves the three reads after a manual release. **Input** navigate to
`/chains`. **Expected** `PageSkeleton` is on screen (`HydrateFallback`); no chain, empty state or
note appears before the data; once released the page replaces it in one commit. **Mock** deferred
`StubApi`.

### TC-C-926
**Component** · **P2** · DT · covers FR-013.
**Pre** states: chains shown; filtered to nothing; no chain in view; no saved stocks. **Input**
render each. **Expected** "These chains and costs are your own classifications, not advice." is
shown whenever at least one chain is shown, and is not shown in the no-saved-stocks state; for the
other two states it is shown only if the concentration page does the same (proposed, section 9);
the text is not inside an element that hides it from assistive tech. **Mock** none.

### Static, responsive and motion

### TC-C-927
**Static** · **P1** · EG · covers NFR-004, NFR-005.
**Input** scan `apps/web/src/features/chains/**` and the changed concentration and stock-filter
files. **Expected** no `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`,
`DOMParser`, markdown library; no `fetch`/`XMLHttpRequest`/`navigator.sendBeacon` outside the
`ApiClient`; no `console.*` of names or amounts; no `parseFloat`, `parseInt`, `Number(` on holding
strings, `.toFixed`, `Math.round` or `* ` on money (domain helpers and `lib/number-format.ts` only);
no import of `@supabase/supabase-js`. **Mock** none.

### TC-C-928
**Component** · **P1** · EP · covers NFR-007.
**Pre** VC-A. **Input** inspect classes and DOM order. **Expected** the lanes' wrapper has
`grid gap-4 md:grid-cols-3`, each lane `md:rounded-lg md:border md:p-3` (no border below `md`);
Integrated and No position are full-width siblings after the lanes in the order Upstream,
Midstream, Downstream, Integrated, No position; `Separator`s between stacked lanes carry `md:hidden`;
the chain header actions are `flex flex-wrap gap-2`; the controls row is `flex flex-wrap`; no
`overflow-x-*`, `min-w-[`, `w-[…px]` wider than 320 px or `whitespace-nowrap` in the folder.
**Mock** none.

### TC-C-929
**Component** · **P2** · EG · covers NFR-006 (motion).
**Pre** none. **Input** scan the folder. **Expected** every `animate-spin` is paired with
`motion-reduce:animate-none` and every `transition-*` with a `motion-reduce:` variant (the same
rule as the Holdings motion test). **Mock** none.

### Rename dialog (extends TC-U-938..944)

### TC-C-930
**Component** · **P1** · EP · covers FR-009, NFR-006.
**Pre** chain "AI semis" with 3 stocks, 1 of them outside the filters, 1 stock in chain "Oil" only.
**Input** open Rename on each. **Expected** title "Rename chain"; field "Chain name" with the
title as value, `maxLength` 60, `autocomplete="off"`, text fully selected and focused; hint
"Changes the name on 3 stocks, including any outside this view." (count from the loader's stocks,
not the view), singular "Changes the name on 1 stock, …" (proposed); the dialog is labelled by its
title and described by the hint; Cancel and Rename buttons. **Mock** none.

### TC-C-931
**Component** · **P1** · DT · covers FR-010.
**Pre** chains "AI semis" (3), "AI & Semis" (8, spellings "AI & Semis" and "ai & semis"), "AI &
Semis x" (1). **Input** type: "ai & semis"; "  AI & SEMIS  "; "AI &  Semis" (two inner spaces);
"ai semis"; "AI semis" (same as title); "ai SEMIS" (case-only); "AI & Semis x". **Expected** merge
step (no request) for the 1st, 2nd and last; plain rename (request sent, merge false) for "AI &
 Semis" (a different chain) and for the 3rd typed variant "ai SEMIS" (case-only of the own chain);
"AI semis" sends nothing ("No changes to save"); the merge step text names "AI semis" (3 stocks)
and the other chain with its stock count including every spelling (8) and says it can't be split
again automatically; button "Merge 11 stocks"; the dialog title and body follow TC-U-939 and name the
typed name as the result (proposed, section 9). **Mock** `StubApi`.

### TC-C-932
**Component** · **P1** · ST · covers FR-010, NFR-006.
**Pre** as TC-C-931. **Input** go to the merge step, press **Back**, press **Merge**, then repeat and
press Escape in the merge step. **Expected** focus moves to the merge title (`tabIndex=-1`) on the
step change; Back restores the name step with the typed text and focus in the input; Escape in the
merge step closes the dialog with no request and focus on the Rename button of the chain; Tab
stays inside the dialog (trap). **Mock** none.

### TC-C-933
**Component** · **P2** · EG · covers FR-009 (saving state).
**Pre** a deferred rename response. **Input** press Enter, then click Rename, then Enter again
while pending. **Expected** exactly one request; the input and buttons are disabled
(`aria-disabled` or `disabled`), the spinner has `motion-reduce:animate-none`; Escape and the close
button while saving do not drop the response (the toast still arrives and focus returns after);
after the response the dialog closes. **Mock** deferred `StubApi`.

### TC-C-934
**Component** · **P1** · BVA · covers FR-009, FR-012.
**Pre** chain "Banks". **Input** submit: empty; "   "; 60 characters; paste 100 characters; 60
emoji; a 61st typed character at the limit. **Expected** empty and whitespace-only show the field
error "Enter a name of 1 to 60 characters." with `aria-invalid`, `aria-describedby`, focus on the
input and no request; the 100-character paste is cut to 60 by `maxLength`; 60 characters and 60
emoji send; the error clears on the next keystroke. **Mock** none.

### TC-C-935
**Component** · **P2** · EP · covers FR-009.
**Pre** chain "AI & Semis". **Input** submit "  AI & Semis  "; "ai & semis"; "AI & Semis" after
having typed something else and restored it. **Expected** the first sends nothing and toasts "No
changes to save" (trimmed equals title); the second sends `{ from: "AI & Semis", to: "ai & semis",
merge: false }` (a case-only change is a change); the third sends nothing. **Mock** none.

### TC-C-936
**Component** · **P2** · ST · covers FR-012.
**Pre** chains "Banks" and "Oil". **Input** open Banks, type "xyz", Cancel; open Oil; open Banks
again; trigger a field error, close, reopen. **Expected** each opening starts with the chain's title
selected, no previous text, no error, the name step (never the merge step); the two chains' dialogs
do not share state. **Mock** none.

### TC-C-937
**Component** · **P1** · EP · covers FR-011, FR-012.
**Pre** `StubApi` rename answers, in turn: 400 `errors:[{path:"from"}]`; 400 `errors:[{path:"to"}]`;
404 `chain_not_found`; 500; network failure; then 200. **Input** submit repeatedly in one dialog
(reopening after 404). **Expected** a `from` problem is a form Alert (not a field error);
a `to` problem is the field error; 404 shows "This chain no longer exists." with "It may have been
renamed elsewhere." and only **Close**, and closing re-reads the data so the gone chain disappears
(proposed, section 9); 500 and network show "Couldn't rename the chain. Try again." with the typed
name kept and the buttons enabled; the retry succeeds; no error text contains response internals.
**Mock** `StubApi`.

### TC-C-938
**Component** · **P2** · ST · covers NFR-003.
**Pre** `api-client` with a refreshable session; the first rename answers 401. **Input** submit a
rename. **Expected** one token refresh, the request is resent once with the identical JSON body
and the new bearer token, the rename succeeds; when the refresh fails the session-ended handler
goes to sign-in and the typed name is not kept in the URL. **Mock** `FakeAuthClient`.

### TC-C-939
**Component** · **P1** · ST · covers NFR-006, FR-009, FR-010.
**Pre** chains "Banks", "Oil" and "Finance"; the rename re-sorts them. **Input** (a) rename "Banks"
to "Banks & Co"; (b) case-only rename "oil" to "Oil"; (c) merge "Banks" into "Finance"; (d) open
`/chains?valueChain=Banks` filter and rename "Banks"; (e) Escape. **Expected** (a) focus on the
Rename button of "Banks & Co" (found by `data-chain-rename=<new key>` after the re-render and the
re-order); (b) the key is unchanged and focus returns to that chain's Rename button; (c) focus on
the merged chain's `h2` (`tabIndex=-1`); (d) the filter on the old name stays in the address
(not rewritten), the chain is no longer in view, and focus falls back to the page h1 (proposed,
section 9); (e) focus returns to the Rename button of the chain. Focus is never lost to `body`.
**Mock** none.

### TC-C-940
**Component** · **P2** · EP · covers NFR-006.
**Pre** VC-A. **Input** query buttons by role. **Expected** each chain's Rename and **Stocks →**
controls can be told apart by accessible name, "Rename chain AI & Semis" and "Stocks in AI &
Semis" (proposed `aria-label`s; the visible text stays "Rename" and "Stocks", which keeps the label
in the name per WCAG 2.5.3); each carries `data-chain-rename=<key>` where relevant. **Mock** none.

### TC-C-941
**Component** · **P1** · EP · covers NFR-006, UC-003.
**Pre** VC-A with a filter active so chips show. **Input** `userEvent.tab()` through the page.
**Expected** order: See concentration, Scope, search, Filters, active filter chips, then per chain
**Stocks →**, **Rename**, the stock links lane by lane (Upstream, Midstream, Downstream,
Integrated, No position), **Set position** links after their entry, then the next chain; no
element with positive `tabindex`; Enter on Rename opens the dialog; Esc closes it. **Mock** none.

### TC-C-942
**Component** · **P1** · EG · covers NFR-004.
**Pre** VC-A with holdings; spies on `StubApi` requests and on `toast`. **Input** rename, merge and
fail paths. **Expected** the POST body keys are exactly `from`, `to`, `merge` (the action's `intent`
is not sent to the API, since `ChainRename` is strict); no request body, toast text, error text or
dialog text contains shares, costs or the rate; no request goes to any origin but the API client's.
**Mock** `StubApi` request log.

## 6. End-to-end cases (TC-E-9xx)

Specs `e2e/vc-*.spec.ts` (T-008), a fresh admin-created user per test (`e2e/lib/sl.ts`), real web and
API on local Supabase, `seedChainsDataset` (VC-A and VC-C) in `e2e/lib/vc.ts`, `apiAs` with a new
`renameChain` helper, `trackPointer` for keyboard-only runs, `VC_STATES` in `e2e/lib/states.ts`. Time
zone `Asia/Bangkok` unless stated.

### TC-E-900
**E2E** · **P1** · UC · covers FR-001..FR-005, FR-013, UC-001, UC-002.
**Pre** VC-A seeded through the API. **Input** sign in, click **Value chains** in the sidebar.
**Expected** two regions in order "AI & Semis" then "Oil & Gas"; the figures of TC-C-902 on screen
(฿175,200.00, 35.4% / 33.3% / 31.3%); six "Held" labels; "Also spelled: ai & semis"; Oil & Gas
has the left-out line; the advice note; the page is ready in under 2 s with no console error.
**Mock** none.

### TC-E-901
**E2E** · **P1** · UC · covers FR-006, FR-008, FR-003.
**Pre** VC-A. **Input** click ASML (back); **Stocks →** of AI & Semis; **Show them**; **Set position**
of BCP; **See concentration**. **Expected** the stock page of ASML; `/stocks?valueChain=AI %26
Semis` listing exactly the 6 stocks (both spellings); `/stocks?valueChain=` listing AAPL, KO, JNJ;
the BCP edit form open (change position to Downstream, save, return: BCP is in Downstream);
`/concentration?scope=all&lens=valueChain&measure=count` showing "AI & Semis" 6, "Oil & Gas" 3 and
Not set 3.

### TC-E-902
**E2E** · **P1** · UC · covers FR-007, NFR-001, UC-003.
**Pre** VC-A; request listener on the page. **Input** after load choose Held stocks, then Core, then
filter Market TH, search "ptt", Clear all; reload on a filtered address; open the same address in a
new browser context signed in as the same user. **Expected** zero API requests between the first
load and the last interaction; the address shows `scope`, `market`, `q` as set; a reload restores
the same view; the second context shows the same chains (bookmark and share); Back after these
changes leaves `/chains` (they used `replace`).

### TC-E-903
**E2E** · **P2** · EG · covers FR-007.
**Pre** VC-A. **Input** open `/chains?scope=does-not-exist&market=XX&utm_source=mail&sort=ticker`.
**Expected** the note "That list no longer exists. Showing all stocks.", one note for the bad
filter value, no note for `utm_source`, all chains shown, the address text is unchanged; deleting
list "Core" in another tab then reloading `?scope=<Core id>` shows the fallback note.

### TC-E-904
**E2E** · **P1** · UC · covers FR-009, FR-005 (rename keeps values), UC-004.
**Pre** VC-A, with MSFT changed to market TH so that AI & Semis has one stock outside the filter
Market = US. **Input** with the filter active open
Rename on "AI & Semis", read the hint, rename to "AI and Semis" (via the keyboard or clicks).
**Expected** the hint counts all 6 stocks (5 in view); toast "Renamed to AI and Semis · 6 stocks changed"
(the count is `changed`); the chain shows its new title with the same lane figures; `apiAs.stocks`
shows all six with the new name, positions and holdings unchanged and "Oil & Gas" untouched;
reload keeps it.

### TC-E-905
**E2E** · **P1** · UC · covers FR-010, OQ-4.
**Pre** VC-A. **Input** rename "AI & Semis" to "ai & semis" (case-only), then to "AI & Semis"
again. **Expected** no merge step either time; after the first all 6 stocks read "ai & semis", the
"Also spelled" line is gone and the title is "ai & semis"; the second returns the title to "AI &
Semis"; `changed` in the toasts is 5 then 6; no stock outside the chain changed.

### TC-E-906
**E2E** · **P1** · UC · covers FR-010, UC-004.
**Pre** user with "AI semis" x3 and "AI & Semis" x8 (VC-A plus 3). **Input** rename "AI semis" to "AI
& Semis"; read the merge step; press Back, then Merge. **Expected** the merge step names both
chains with 3 and 8 stocks, the button "Merge 11 stocks", and the text that it cannot be split
again; before **Merge** `apiAs` shows no change; after it one region "AI & Semis" with 11 stocks,
toast "Merged into AI & Semis · N stocks" (N per section 9), focus on the merged chain's heading;
lanes are the union of both chains' positions.

### TC-E-907
**E2E** · **P1** · CC · covers FR-010, ADR-004 (two tabs).
**Pre** user with "Banks" x3. Tab 1 loads `/chains` (one chain). **Input** in tab 2 (same user,
same session) rename another chain, or add a stock, so that "Finance" x2 exists; in tab 1 rename
"Banks" to "Finance" and submit; then press Back, change the name, change back and **Merge**. **Expected**
tab 1 did not know "Finance", sent `merge: false`, got 409 and the dialog moved to the merge step
naming "Finance" and 2 stocks (the server's figures); nothing changed until Merge; after Merge the
API shows 5 stocks named "Finance" and tab 1 shows one chain "Finance" (the loader re-read). A
variant where tab 1 cancels leaves both chains separate.

### TC-E-908
**E2E** · **P1** · CC · covers FR-011.
**Pre** tab 1 shows chain "Alpha" (3). **Input** tab 2 renames "Alpha" to "Beta"; tab 1 renames
"Alpha" to "Gamma". **Expected** tab 1's dialog stays open with "This chain no longer exists." and
only **Close**; the API shows the stocks named "Beta" (not "Gamma"); after Close tab 1 shows "Beta".

### TC-E-909
**E2E** · **P2** · CC · covers FR-011.
**Pre** tab 1 shows "Alpha" with 3 stocks. **Input** tab 2 adds a fourth stock to "alpha" and
moves one of the three to "Other"; tab 1 renames "Alpha" to "Omega". **Expected** the dialog hint
said 3; the toast says 3 stocks changed (S1, S2 and the new one), the moved one stays "Other"; the
API agrees.

### TC-E-910
**E2E** · **P1** · EG · covers FR-012, FR-009.
**Pre** VC-A. **Input** (a) abort `POST /chains/rename` (network error); (b) answer 500 via
`page.route`; (c) answer 400 for `to`; then let it through and press Rename again. **Expected** the
dialog stays open with the typed name and the "Couldn't rename the chain. Try again." alert for (a)
and (b), the field error for (c); no toast of success; the retry succeeds once; no duplicated
change.

### TC-E-911
**E2E** · **P2** · BVA · covers FR-009, NFR-007.
**Pre** VC-A. **Input** rename to: 60 x "😀"; a 60-character word without spaces; 61 pasted
characters; `<b>x</b>`; "น้ำมันและก๊าซ"; `A&B/C?d=e#f`. **Expected** each valid name is saved and shown
as text in the heading, the toast, **Stocks →** and the stock page's chain field; the 61-character
paste is cut to 60; the page has no horizontal scroll at 360 px with these names; the API
returns each exactly as typed.

### TC-E-912
**E2E** · **P1** · 2U · covers NFR-003, FR-009.
**Pre** users U and V each created through the Admin API; both have chains "Banks" and "Oil & Gas"
(V also "Finance"). **Input** U renames "Banks" to "Finance" in the UI and merges nothing; V's
browser (another context) stays open. **Expected** U sees one chain "Finance" with only U's stocks;
no V stock, name or count appears on U's page or in its dialog; V's API data is identical before and
after (`apiAs(V).stocks` deep-equals the snapshot) and V's page after reload still shows "Banks";
U cannot call V's chain even by guessing its name (404 shown as the gone alert).

### TC-E-913
**E2E** · **P1** · EP · covers NFR-003.
**Pre** signed out. **Input** open `/chains`; sign in; then, signed in, delete the Supabase session
storage and press Rename on a chain and submit. **Expected** the visit redirects to sign-in with
`next=/chains` and lands back on `/chains` after sign-in; the rename with a dead session ends at the
sign-in page (refresh failed) with no stock changed; no API data leaks before sign-in.

### TC-E-914
**E2E** · **P1** · EP · covers ADR-006, FR-008.
**Pre** VC-A with the mixed spellings. **Input** compare `/chains` with `/concentration?lens=valueChain`
for measure count and value, for scope all, held and Core, and with Market = US; then rename
"Oil & Gas" to "Energy" and compare again. **Expected** the same chains with the same counts and the
same labels and values in all views; after the rename both pages show "Energy"; "Not set" equals
the page's no-chain count; no group reads a different spelling from the chain title.

### TC-E-915
**E2E** · **P1** · UC · covers FR-004, FR-005, FR-008.
**Pre** VC-A. **Input** on `/concentration` open Settings, change the rate to 40.000000, save; return to
`/chains`; then clear the rate; then set it back through the page's note link. **Expected** the
USD values scale (ASML ฿68,000.00 at 40); with no rate the USD stocks are Held with no value, the
chain value drops to the THB stocks, the status note appears with a link to `/concentration`, and the
left-out count says the USD stocks need a rate; the link opens the Concentration page (the settings
dialog is available there).

### TC-E-916
**E2E** · **P1** · UC · covers FR-002, FR-004, UC-001.
**Pre** VC-A. **Input** on a stock's page mark AMAT as held (3 x 200.00 USD); edit NVDA's position to
Downstream through its form; delete INTC; delete the list Core; return to `/chains` each time.
**Expected** AMAT shows Held with ฿21,900.00 and the chain value and shares update; NVDA is in
Downstream and the Midstream lane shows only TSM; after deleting INTC the Integrated area is gone;
deleting Core leaves chains unchanged and a stale `?scope=<Core>` shows the fallback note; deleting
the last stock of a chain removes the chain.

### TC-E-917
**E2E** · **P2** · EP · covers FR-012.
**Pre** (a) new user with no stocks; (b) user with only stocks lacking a chain; (c) VC-A with a
search for "zzzz". **Input** open `/chains`. **Expected** (a) "No value chains yet", **Add stock** and
**Import** lead to their pages; (b) "No value chains in this view" and the **Show the N stocks**
button opens `/stocks?valueChain=` with exactly those stocks; (c) "0 of 13 stocks", Clear all
restores the view.

### TC-E-918
**E2E** · **P1** · EP · covers NFR-006.
**Pre** VC-A, user signed in. **Input** run axe (WCAG 2.1 A and AA) in light and dark on the
`VC_STATES`: filled page; page with rate note and left-out lines; fallback-note page; no-chain
note; empty state (no stocks); empty state (no chains in view); filtered to none; rename dialog name
step; merge step; field error; 404 alert; 500 alert; Filters sheet open on `/chains`; the page at
`md` and at 360 px. **Expected** no violations; no region or list without a name; headings in
order.

### TC-E-919
**E2E** · **P1** · EP · covers NFR-006 (contrast points of ux-design.md).
**Pre** VC-A in light and dark. **Input** with `e2e/lib/contrast.ts` measure the computed colours
(tints composited over their real parent): the **Held** secondary badge; the lane counts line
(`muted-foreground` on `card`); the "Also spelled" text-xs hint; the value text and share; "No
stocks"; the entry name/market text normal and under `:hover` (`bg-accent`); **Stocks →** ghost and
**Rename** outline buttons in default and hover; link buttons in the notes; the keyboard focus ring
of an entry and of the Rename button (non-text 3:1); the left-out line; the rename dialog hint, field
error and alert text; the merge primary button. **Expected** text pairs reach 4.5:1 (3:1 for large
text and non-text UI); a failure goes back to the owning web task as a fix (T-008 note).

### TC-E-920
**E2E** · **P1** · EP · covers NFR-007.
**Pre** VC-A and the VC-D names, viewport 360 x 740, then 320 x 640. **Input** open `/chains`; open
the Filters sheet; open the rename dialog and the merge step; scroll the page. **Expected** no
horizontal scroll (`documentElement.scrollWidth <= clientWidth`) in any state; lanes are stacked in
order Upstream, Midstream, Downstream, Integrated, No position (increasing `y`, equal `x`); chain
header buttons wrap under the title; long names wrap; the dialog fits and its footer buttons are
full width; every control is at least 24 x 24 CSS px; the page remains usable at 200% zoom.

### TC-E-921
**E2E** · **P1** · EP · covers NFR-007, FR-002.
**Pre** VC-A. **Input** measure the lane boxes at 767, 768, 1024 and 1440 px. **Expected** at 767 the
lanes are stacked; from 768 the three lanes share one `y` with increasing `x` and equal widths;
Integrated and No position are full width below them; the sidebar collapse state does not break
the grid; no overlap between lanes, entries and buttons.

### TC-E-922
**E2E** · **P1** · UC · covers NFR-006, FR-009, FR-010.
**Pre** VC-A, `trackPointer` proving no pointer event occurs. **Input** keyboard only: Tab to the
Scope select and choose Held with the arrow keys and Enter; Tab to Search and type; open Filters
with Enter, tick a box with Space, close with Escape; Tab to **Rename** of a chain, Enter, type a
name that exists, Enter (merge step), Tab to **Merge**, Enter; Tab to a **Set position** link and
open it. **Expected** every action works; focus is visible at each step and lands as in TC-C-939
(Rename button after a plain rename, the chain heading after the merge); Escape returns focus to
the Rename button; no focus trap outside the dialog; tab order as in TC-C-941; no pointer event
recorded.

### TC-E-923
**E2E** · **P1** · BVA · covers NFR-001, NFR-002.
**Pre** VC-C (200 stocks, 20 chains) seeded in one batch. **Input** time in the page (`performance.now`
around the click and a `MutationObserver` on the chains container) the change of scope, one filter
toggle and one search letter, 5 times each; then rename a 10-stock chain, and rename all 200 into
one name by merge. **Expected** median regroup time under 200 ms and no API request; the rename
requests finish within 500 ms each as measured by the browser's response timing (soft bound 1 s in
E2E, the p95 bound is TC-A-924); the page shows the final state without a full reload.

### TC-E-924
**E2E** · **P1** · EG · covers NFR-004.
**Pre** VC-A with holdings shares `98765.4321` and cost `12345.6789`, a rate `36.123456`, chain
names `SENTINEL-CHAIN-9x`. **Input** run the page, a rename, a merge and the failure paths with all
requests, console messages and the `dev-server.log` (without `[vite]` lines) and the API log
captured. **Expected** every request goes to the web origin, the API, or the local Supabase auth;
none to a third party; no amount, rate or name sentinel in any URL query, request body of a
non-rename request, console line or API log line; chain names appear only in the page, in the
rename body and in filter links the user opens; the `GET` URLs the page calls carry no stock data.

### TC-E-925
**E2E** · **P2** · EP · covers FR-001, FR-009, case folding.
**Pre** chains with Thai names "น้ำมัน" (3 spellings differing by case in a Latin suffix) and "น้ำมันและก๊าซ".
**Input** open the page, **Stocks →**, rename to "พลังงาน", reload, use the filter link. **Expected**
Thai names render, sort, link (percent-encoded) and round trip through the address and the API
unchanged; `ไ`, `ำ` and combining marks are not split; the title and "Also spelled" show the
original spellings; browser locale `th-TH` does not change the `฿1,234.00` number format.

### TC-E-926
**E2E** · **P3** · ST · covers FR-007, FR-009.
**Pre** VC-A. **Input** change filters three times, rename a chain, press Back twice. **Expected**
query changes are `replace` (Back leaves `/chains`), the rename does not add a history entry, and
after Back and Forward the view is the one in the address with fresh data.

### TC-E-927
**E2E** · **P3** · EP · covers Constraints (exports unchanged), FR-009.
**Pre** VC-A, rename "Oil & Gas" to "Energy". **Input** download the backup JSON and CSV from
`/import-export` and the stock CSV from `/stocks`. **Expected** the files carry "Energy" for the
three stocks and nothing else differs; re-importing the CSV in update mode keeps "Energy".

### TC-E-928
**E2E** · **P3** · EP · covers FR-012, NFR-006.
**Pre** VC-A. **Input** reload `/chains` ten times with the network slowed (Slow 3G) and once with
the API stopped. **Expected** the skeleton shows while loading; the layout does not jump (no
layout shift beyond the skeleton swap); with the API down the route error with Retry appears and
Retry works when the API returns; no unhandled promise rejection or console error beyond the
expected failed request.

## 7. Traceability

TC-U ids come from the task contracts in [dev-plan.md](dev-plan.md).

| Requirement | Cases |
|---|---|
| FR-001 chains, folding, title, order | TC-U-900, 902, 903, 935; TC-A-903, 904, 910; TC-C-902, 910, 911, 912; TC-E-900, 905, 925 |
| FR-002 lanes, Integrated, No position | TC-U-904, 928; TC-C-901, 909, 928; TC-E-900, 916, 921 |
| FR-003 entries, links, order | TC-U-905, 927; TC-C-902, 905, 941; TC-E-900, 901 |
| FR-004 Held marker, value at cost | TC-U-901, 929; TC-C-902, 904; TC-E-900, 915, 916 |
| FR-005 counts, values, shares, left-out, rate | TC-U-906, 907, 934; TC-C-902, 903, 907, 908; TC-E-900, 915 |
| FR-006 no-chain count and link | TC-U-908, 931; TC-C-918, 921; TC-E-901, 917 |
| FR-007 scope, search, filters, address | TC-U-924, 930, 936; TC-C-913, 914, 915; TC-E-902, 903, 926 |
| FR-008 links to stocks and concentration | TC-U-925, 932; TC-C-919, 920, 921; TC-E-901, 914 |
| FR-009 rename all stocks of a chain | TC-U-909, 910, 913, 914, 938; TC-A-902, 904, 905, 906, 907, 919, 920; TC-C-930, 934, 935; TC-E-904, 911 |
| FR-010 merge and case-only rename | TC-U-915, 916, 917, 939, 941; TC-A-908, 909, 910, 911, 912, 914; TC-C-931, 932; TC-E-905, 906, 907 |
| FR-011 atomic, save-time truth, 404 | TC-U-922; TC-A-909, 915, 916, 917, 918; TC-C-937; TC-E-908, 909 |
| FR-012 empty and error states | TC-U-933, 942, 943; TC-C-923, 924, 925, 937; TC-E-910, 917, 928 |
| FR-013 not-advice note | TC-C-926; TC-E-900 |
| NFR-001 regroup under 200 ms, no request | TC-U-930, 937; TC-C-915, 916, 917; TC-E-902, 923 |
| NFR-002 rename of 200 stocks within 500 ms | TC-A-924; TC-E-923 |
| NFR-003 auth and isolation | TC-U-918, 919, 921; TC-A-900, 901, 913, 923; TC-C-938; TC-E-912, 913 |
| NFR-004 privacy, logs, no third party | TC-U-923; TC-A-921, 922, 923; TC-C-927, 942; TC-E-924 |
| NFR-005 exact decimals | TC-U-901, 906; TC-C-903, 927 |
| NFR-006 accessibility | TC-U-944; TC-C-901, 932, 939, 940, 941; TC-E-918, 919, 922 |
| NFR-007 phone layout, wrapping | TC-C-906, 928; TC-E-911, 920, 921 |
| ADR-006 concentration agrees | TC-U-911, 912, 925; TC-C-920, 921, 922; TC-E-914 |
| ADR-001 / ADR-002 no table, no endpoint | TC-A-926, 929 |

## 8. Coverage matrix

| Area | Unit | API/DB | Component | E2E | Covered |
|---|---|---|---|---|---|
| Happy path | yes | yes | yes | yes | yes |
| Validation and boundaries | yes | yes | yes | yes | yes |
| Case folding (Thai, inner spaces, spellings) | yes | yes | yes | yes | yes |
| Auth and two-user isolation | yes | yes | no | yes | yes |
| Merge guard, stale page (two tabs) | no | yes | yes | yes | yes |
| State transitions (rename, merge, gone) | yes | yes | yes | yes | yes |
| Atomicity | yes | yes | no | no | yes |
| Concurrency | no | yes | no | yes | yes |
| Error and failure paths | yes | yes | yes | yes | yes |
| Privacy, logs, third parties | yes | yes | static | yes | yes |
| Concentration lens agreement (ADR-006) | yes | no | yes | yes | yes |
| No-request rule | yes | no | yes | yes | yes |
| Performance | yes (timing) | yes | yes | yes | yes |
| Accessibility, contrast | no | no | structure | axe, contrast, keyboard | yes |
| Responsive, 360 px | no | no | classes | yes | yes |
| Time zones, locale | no | no | no | yes (Thai, `th-TH`) | partial |
| Security (injection, markup) | no | yes | yes | yes | yes |

Counts: existing `TC-U-9xx` 45 (`900..944`); new `TC-A` 30 (`900..929`); new `TC-C` 43
(`900..942`); new `TC-E` 29 (`900..928`). Total new 102.

## 9. Gaps, ambiguities and decisions for the owner

1. **Order of equal-sized chains (FR-001 "then by name").** The comparison is not defined:
   case-insensitive or exact, locale, and where Thai sorts. TC-C-912 proposes case-insensitive
   with the `en` locale, Thai after Latin.
2. **Merge dialog names a different spelling than it creates.** FR-010 says both sets carry the
   name exactly as typed, but the merge title in ux-design and TC-U-939 is `Merge into "AI &
   Semis"?` (the existing chain's title) while the typed name is "ai & semis". TC-C-931 proposes
   that the body states the typed name as the result and the title keeps the existing chain's name;
   decide which one the title shows.
3. **List scope and the chain link.** design.md gives the base of the no-chain link (`/lists/:id`
   for a list scope) but says the chain's **Stocks →** is `/stocks`. A list-scoped page would then
   open stocks outside the list. TC-C-919 proposes the same base rule for both.
4. **Plurals and wording.** ux-design shows only plural lines; singular ("1 stock", "Show the 1
   stock", "1 held stock has…") and the wording for held stocks that need a rate are not given
   (TC-C-902, 907, 923, 930 propose them). The left-out line is specified only for "no shares or
   cost".
5. **Value line with no valued stock.** The domain returns `"0.00"` and null shares, ux-design says
   the line shows "only when the chain has a valued held stock". TC-C-908 pins that `฿0.00` is
   hidden; a held stock whose figures multiply to zero is not covered by the documents.
6. **Rounded shares need not sum to 100.0** (6.3 + 93.8 = 100.1). Accepted by TC-C-903; say if it
   should be adjusted.
7. **Unicode normalisation.** `chainKey` does not normalise, so NFC and NFD Thai (or accented Latin)
   look identical but are two chains, and `toLocaleLowerCase('en')` treats Greek final sigma and
   `İ` as in TC-A-903. Tests pin the current behaviour as "distinct"; the alternative is NFC in
   `chainKey` (and in the filters, the lens and the API together). Decide before T-001 is merged.
8. **Lock order.** design.md step 1 locks rows with no `order by`; two simultaneous merges in
   opposite directions could deadlock. TC-A-917 looks for it; the safe fix is `order by id`.
9. **Toast count of a merge.** The dialog says "Merge 11 stocks" (all stocks) and the toast says "N
   stocks"; the API only returns `changed` (the rows whose name differed from `to`), which is
   smaller when some already carry the typed name exactly. TC-E-906 and TC-C-939 use `changed`;
   decide whether the API should also return the total stocks of the merged chain.
10. **After 404 (gone).** Whether closing the dialog re-reads the page is not stated; TC-C-937
    proposes that it does, so the vanished chain disappears.
11. **Filter on the old name after a rename.** A `valueChain=` pick in the address is not rewritten
    and the renamed chain leaves the view; the focus target is unspecified (TC-C-939 proposes the
    page h1).
12. **Empty list scope.** The no-chain button would read "0 stocks" (TC-C-923 proposes omitting it).
13. **Advice note in empty states (FR-013).** "As the concentration page does" does not say which
    states; TC-C-926 pins shown with chains, hidden with no saved stocks, rest proposed.
14. **Repeated button names.** Every chain has a **Rename** and a **Stocks →** button with the same
    visible name; TC-C-940 proposes `aria-label` with the chain title (label in name preserved).
15. **`intent` in the rename body.** design.md shows the action reading `{ intent: 'rename-chain',
    … }` while `ChainRename` is strict; TC-C-942 pins that the web does not send `intent` to the
    API.
16. **Timing in jsdom.** NFR-001 (200 ms) is measured in jsdom by TC-C-917 and TC-U-937 and in a
    real browser by TC-E-923; only the second is a faithful measurement. NFR-002 is the API p95
    (TC-A-924); TC-E-923 is a soft end-to-end bound.
17. **Not tested.** Thai UI labels (out of scope), undo of a rename (out of scope), supplier or
    graph views, a chains table, more than one chain per stock, drag between lanes, and rate
    limiting (no limiter on the route). A stock count above 200 per chain is untested beyond
    TC-A-924.
