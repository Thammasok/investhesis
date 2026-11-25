---
version: 1.0
status: active
date: 2026-11-24
requires: design.md
ux-design: ux-design.md
---

# Development Plan: Thesis Log

Builds [requirements.md](requirements.md) per [design.md](design.md) and
[ux-design.md](ux-design.md). Every engineering task follows the test gate (green before, green
after, then human review). The gate is the **Investhesis gate** in `CLAUDE.md` (Tests and the
Investhesis gate), run from the repo root: `pnpm db:start && pnpm db:reset`, `pnpm test:supabase`,
`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (with `E2E_WEB_PORT`
when 5173 is taken). `.claude/rules/test-gate.md` still lists Pacta's commands (carried work in
`docs/todo.md`).

**Test ids.** This slice uses the 700 range (the 600 range is partly taken by Search, Filter and
Export's web tasks): `TC-U-7xx` in the task contracts below, and `TC-A-7xx`, `TC-C-7xx`,
`TC-E-7xx` from [T-008](#t-008--design-test-cases--thesis-log). Every test title starts with its id.

## Summary

- **Total tasks** — 9 (7 engineering, 1 test design, 1 test automation)
- **Estimated effort** — about 6 days of agent work (S ≈ 0.4 day, M ≈ 0.75 day, L ≈ 1.5 days);
  about 4 days elapsed with the API and web lanes in parallel
- **Critical path** — [T-001](#t-001--domain-thesis-schemas-and-backup-v2) →
  [T-005](#t-005--thesis-section-on-the-stock-page) →
  [T-006](#t-006--thesis-entry-dialog-add-and-edit) →
  [T-007](#t-007--delete-with-undo-and-the-stock-delete-wording) →
  [T-009](#t-009--automate-tests--thesis-log)
- **Parallel lanes** — [T-002](#t-002--database-theses-table) runs alongside T-001. API: T-003,
  then T-004. Web: T-005 to T-007 need only T-001; they build against the contracts in
  `design.md` with `StubApi`, and T-009 proves them against the real API.
  [T-008](#t-008--design-test-cases--thesis-log) starts at once.

## Tasks

### T-001 — Domain: thesis schemas and backup v2

```yaml
- title: Add THESIS_TYPES, thesisInput/thesisPatch, latestThesisDate and BackupV2 to the domain
- description: >
  In packages/domain/src/theses.ts (exported from index.ts) implement design.md §Shared vocabulary
  and rules: THESIS_TYPES with labels; schema factories thesisInput({ today }) and
  thesisPatch({ today }) (strict, unknown keys fail with the key as the path); note and
  invalidation normalise CRLF to LF, trim, count code points (10,000 / 2,000), empty invalidation
  becomes null; date is YYYY-MM-DD, a real calendar date, not after today; targetPrice is a
  string ^\d{1,14}(\.\d{1,4})?$ greater than 0, numbers rejected, '' and null mean not set;
  latestThesisDate(now) = UTC date of now + 14 h. Messages in messages.ts. In export.ts add the
  Thesis shape and BackupV2 (BackupV1 plus theses, formatVersion 2, same unknown-key rule) and
  export a `Backup` alias for the current version. Covers FR-001, FR-004, FR-010, NFR-006.
- agent: software-engineer-backend
- depends_on: []
- status: done
- size: M
```

#### Acceptance criteria

- [ ] Web and API can import every new name from `@investhesis/domain`; the code is erasable syntax with `.ts` relative imports
- [ ] `BackupV1` is unchanged; `BackupV2` parses a v2 sample and rejects an unknown key with its path
- [ ] `pnpm --filter @investhesis/domain test:coverage` stays at or above 95% lines
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-700
    scenario: a complete valid entry parses and normalises
    given: thesisInput({ today: "2026-11-24" })
    when: parse { type: "buy", date: "2026-11-24", note: "  Capex up\r\nMargins hold  ", targetPrice: "180", invalidation: "  " }
    then: success with note trimmed and LF line ends, invalidation null
    test_data:
      input: { type: buy, date: "2026-11-24", note: "  Capex up\r\nMargins hold  ", targetPrice: "180", invalidation: "  " }
      expected: { type: buy, date: "2026-11-24", note: "Capex up\nMargins hold", targetPrice: "180", invalidation: null }
  - id: TC-U-701
    scenario: type must be one of the four
    given: thesisInput({ today: "2026-11-24" })
    when: parse with type "hold", then with no type
    then: both fail on path "type"
    test_data:
      input: [{ type: hold }, {}]
      expected: [{ path: [type] }, { path: [type] }]
  - id: TC-U-702
    scenario: date boundaries
    given: thesisInput({ today: "2026-11-24" })
    when: parse dates 2026-11-24, 2026-11-25, 2024-02-29, 2025-02-29, 2026-13-01, "24/11/2026"
    then: only the first and third pass; the rest fail on path "date"
    test_data:
      input: ["2026-11-24", "2026-11-25", "2024-02-29", "2025-02-29", "2026-13-01", "24/11/2026"]
      expected: [ok, fail, ok, fail, fail, fail]
  - id: TC-U-703
    scenario: note length counts code points after trimming
    given: thesisInput({ today: "2026-11-24" })
    when: parse notes of "   ", 1 char, 10,000 emoji (20,000 UTF-16 units), 10,001 chars
    then: fail, ok, ok, fail
    test_data:
      input: ["   ", "a", "😀×10000", "a×10001"]
      expected: [fail, ok, ok, fail]
  - id: TC-U-704
    scenario: invalidation length and empty handling
    given: thesisInput({ today: "2026-11-24" })
    when: parse invalidation of 2,000 chars, 2,001 chars, "", null
    then: ok, fail on path "invalidation", null, null
    test_data:
      input: ["a×2000", "a×2001", "", null]
      expected: [ok, fail, null, null]
  - id: TC-U-705
    scenario: target price is an exact positive decimal string
    given: thesisInput({ today: "2026-11-24" })
    when: parse targetPrice "0", "0.0001", "12345678901234.5678", "123456789012345", "1.23456", 180, "", null
    then: fail, ok, ok, fail, fail, fail (number), null, null
    test_data:
      input: ["0", "0.0001", "12345678901234.5678", "123456789012345", "1.23456", 180, "", null]
      expected: [fail, ok, ok, fail, fail, fail, null, null]
  - id: TC-U-706
    scenario: unknown keys are rejected with the key as the path
    given: thesisInput and thesisPatch
    when: parse a valid entry plus { userId: "x" }
    then: fail on path "userId"
    test_data:
      input: { userId: x }
      expected: { path: [userId] }
  - id: TC-U-707
    scenario: patch fields are optional and null clears
    given: thesisPatch({ today: "2026-11-24" })
    when: parse {}, { targetPrice: null, invalidation: null }, { note: "" }
    then: ok (empty), ok (clears), fail on path "note"
    test_data:
      input: [{}, { targetPrice: null, invalidation: null }, { note: "" }]
      expected: [ok, ok, fail]
  - id: TC-U-708
    scenario: latestThesisDate is the latest calendar date anywhere
    given: now values in UTC
    when: latestThesisDate(2026-11-24T09:59:59Z), (2026-11-24T10:00:00Z), (2026-12-31T23:00:00Z)
    then: 2026-11-24, 2026-11-25, 2027-01-01
    test_data:
      input: ["2026-11-24T09:59:59Z", "2026-11-24T10:00:00Z", "2026-12-31T23:00:00Z"]
      expected: ["2026-11-24", "2026-11-25", "2027-01-01"]
  - id: TC-U-709
    scenario: BackupV2 accepts theses and keeps the strict rule
    given: a v1 backup sample with formatVersion 2 and one thesis
    when: parse with BackupV2; then add theses.0.userId; then parse the original with BackupV1
    then: ok; fail on path theses.0.userId; fail (version 2 is not 1)
    test_data:
      input: { formatVersion: 2, theses: [{ id, stockId, type: buy, date: "2026-11-20", note: "x", targetPrice: null, invalidation: null, createdAt, updatedAt }] }
      expected: [ok, { path: [theses, 0, userId] }, fail]
```

**Notes** — The `today` factory argument keeps the schemas pure and testable; never read the clock inside the domain.

### T-002 — Database: theses table

```yaml
- title: Add app.theses with typings, drift and exposure coverage
- description: >
  One Supabase CLI migration (supabase/migrations/*_theses.sql) creating app.theses exactly as
  design.md §Data Model: type check, entry_date date, note 1..10,000 chars, target_price
  numeric(18,4) > 0, invalidation 1..2,000 chars, created_at/updated_at, composite FK
  (stock_id, user_id) → app.stocks (id, user_id) on delete cascade, the ordering index, RLS
  enabled with no policy. Hand-written Drizzle typing in apps/api/src/db/schema/theses.ts
  (numeric and date as string), exported from the schema index and covered by
  schema.drift.test.ts. Extend the database-exposure checks in scripts/ (as TC-A-106) to
  app.theses. Covers FR-001, FR-007, NFR-003, NFR-006.
- agent: software-engineer-backend
- depends_on: []
- status: done
- size: S
```

#### Acceptance criteria

- [ ] `pnpm db:reset` applies the migration on a fresh stack and on one with existing data
- [ ] `schema.drift.test.ts` passes with `app.theses` in the comparison
- [ ] The exposure check proves `anon` and `authenticated` cannot read `app.theses` through the Data API
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-720
    scenario: entries go with their stock
    given: user U with stock S and two entries on S
    when: delete S
    then: no entry of S remains
    test_data:
      input: { stock: S, entries: 2 }
      expected: { thesesForS: 0 }
  - id: TC-U-721
    scenario: an entry cannot point at another user's stock
    given: user U's stock S; user V
    when: insert entry (stock_id S, user_id V)
    then: foreign key violation
    test_data:
      input: { stock_id: S, user_id: V }
      expected: 23503
  - id: TC-U-722
    scenario: database checks guard the fields
    given: user U's stock S
    when: insert type "hold"; note ""; note of 10,001 chars; target_price 0; invalidation ""
    then: each is a check violation
    test_data:
      input: [{ type: hold }, { note: "" }, { note: "a×10001" }, { target_price: "0" }, { invalidation: "" }]
      expected: [23514, 23514, 23514, 23514, 23514]
  - id: TC-U-723
    scenario: date and numeric come back as strings
    given: an entry with entry_date 2024-02-29 and target_price 180.5
    when: read it through Drizzle
    then: entryDate is "2024-02-29" and targetPrice is "180.5000", no Date or number
    test_data:
      input: { entry_date: "2024-02-29", target_price: "180.5" }
      expected: { entryDate: "2024-02-29", targetPrice: "180.5000" }
```

**Notes** — Constraint tests go in a `*.constraints.test.ts`, with random user ids per file. Check that the `pg` date parser is not turned into a `Date` anywhere in `db/client.ts`.

### T-003 — Theses API module

```yaml
- title: Serve /stocks/{stockId}/theses (list, create, patch, delete, restore)
- description: >
  New modules/theses (theses.routes.ts → theses.service.ts → theses.repository.ts) per
  design.md §API Contracts: GET list ordered by date desc, created_at desc, id; POST with
  thesisInput({ today: latestThesisDate(deps.now()) }); PATCH merges into the stored entry,
  re-parses with thesisInput and writes (bumping updated_at) only when something differs; DELETE
  returns the deleted entry; POST …/restore re-inserts a whole entry with its id and times
  (stockId must match the path, createdAt <= updatedAt <= now, 409 thesis_exists on a taken id).
  Every query is scoped by identity.userId; another user's stock or entry is 404 not_found;
  validation is 400 validation_failed with field paths. Response schemas in Zod so OpenAPI
  documents them and the serializer drops user_id. Add note, invalidation and targetPrice to
  SECRET_KEYS in lib/logger.ts. Export listThesesForUser(db, userId) for the backup. Add
  src/modules/theses/ to the 85% coverage config. Covers FR-001, FR-002, FR-004, FR-005,
  FR-007, FR-009, NFR-001, NFR-003, NFR-004.
- agent: software-engineer-backend
- depends_on: [T-001, T-002]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] The five routes answer as design.md describes and appear in `/openapi.json` with `bearerAuth`
- [ ] No route returns or accepts `userId`; two-user isolation holds on every route
- [ ] Sentinel text in note, invalidation and target price never appears in captured log lines, including on a forced check violation
- [ ] p95 of POST, PATCH, DELETE and GET (200 entries of 2,000 chars) is under 500 ms, logged by a latency test
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-740
    scenario: create and list in order
    given: user U's stock S
    when: POST entries dated 2026-01-10, 2026-11-20, 2026-11-20 (in that order), then GET
    then: 201 each; GET lists the two 2026-11-20 entries newest-created first, then 2026-01-10
    test_data:
      input: ["2026-01-10", "2026-11-20 (A)", "2026-11-20 (B)"]
      expected: ["B", "A", "2026-01-10"]
  - id: TC-U-741
    scenario: validation errors carry field paths
    given: user U's stock S
    when: POST { type: "hold", date: "2999-01-01", note: "" , targetPrice: 5 }
    then: 400 validation_failed with paths type, date, note, targetPrice
    test_data:
      input: { type: hold, date: "2999-01-01", note: "", targetPrice: 5 }
      expected: { status: 400, paths: [type, date, note, targetPrice] }
  - id: TC-U-742
    scenario: a no-op patch writes nothing
    given: an entry E created at T
    when: PATCH E with its own note
    then: 200, updatedAt equals createdAt
    test_data:
      input: { note: "<same>" }
      expected: { updatedAt: "== createdAt" }
  - id: TC-U-743
    scenario: a real patch moves updatedAt and null clears
    given: an entry with targetPrice "180" and invalidation "x"
    when: PATCH { targetPrice: null, invalidation: null, type: "update" }
    then: 200 with both null, type update, updatedAt > createdAt
    test_data:
      input: { targetPrice: null, invalidation: null, type: update }
      expected: { targetPrice: null, invalidation: null, type: update, edited: true }
  - id: TC-U-744
    scenario: delete returns the entry and restore puts it back unchanged
    given: an edited entry E
    when: DELETE E, then POST restore { entry: <deleted body> }, then POST restore again
    then: 200 with E; 201 deep-equal to E; 409 thesis_exists
    test_data:
      input: { entry: E }
      expected: [200, 201, 409]
  - id: TC-U-745
    scenario: restore refuses a foreign stock or a future time
    given: user U's stocks S1, S2 and a deleted entry E of S1
    when: restore E on S2's path; restore E with updatedAt one hour ahead of now
    then: 400 validation_failed on stockId; 400 on updatedAt
    test_data:
      input: [{ path: S2 }, { updatedAt: "now + 1h" }]
      expected: [400, 400]
  - id: TC-U-746
    scenario: another user's stock and entry are not found
    given: user U's stock S with entry E; user V
    when: V calls GET, POST, PATCH E, DELETE E and restore on S
    then: 404 not_found each, and U's entry is unchanged
    test_data:
      input: { caller: V }
      expected: [404, 404, 404, 404, 404]
  - id: TC-U-747
    scenario: date bound uses the latest date anywhere
    given: deps.now = 2026-11-24T18:00:00Z (Bangkok 25 Nov 01:00)
    when: POST date 2026-11-25, then 2026-11-26
    then: 201, then 400 on date
    test_data:
      input: ["2026-11-25", "2026-11-26"]
      expected: [201, 400]
  - id: TC-U-748
    scenario: no private text in logs
    given: a captured log stream
    when: POST, PATCH and restore with sentinel note/invalidation/targetPrice; force a check violation through the repository
    then: no log line contains a sentinel
    test_data:
      input: { note: "SENTINEL-NOTE", invalidation: "SENTINEL-INV", targetPrice: "987654.3210" }
      expected: { logLinesWithSentinel: 0 }
```

**Notes** — Routes take the Drizzle handle from `deps.db.db` (503 `db_unavailable` without one), as `lists` does. 401 cases and the sentinel test also run with real Supabase tokens in a `theses.supabase.test.ts`.

### T-004 — Backup v2 with thesis entries

```yaml
- title: Write thesis entries into the JSON backup as format version 2
- description: >
  In modules/exports, read listThesesForUser inside the existing repeatable-read, read-only
  snapshot transaction and return BackupV2 (formatVersion 2, theses sorted by stockId then the
  GET order, no user id). backup.csv is unchanged. Update the search-filter-export tests that
  pin formatVersion 1 (TC-A-50x, TC-U-5xx on the backup) to version 2 without loosening them,
  and the OpenAPI response schema. Covers FR-010, NFR-009 (brief).
- agent: software-engineer-backend
- depends_on: [T-003]
- status: backlog
- size: S
```

#### Acceptance criteria

- [ ] `GET /exports/backup.json` parses with `BackupV2` and contains every entry of the user, none of another user
- [ ] `GET /exports/backup.csv` is byte-identical to before for the same data
- [ ] The snapshot mutation check (TC-A-508) still passes with an entry committed mid-export
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-760
    scenario: backup holds every entry in order
    given: user U with stocks S1, S2; S1 has entries dated 2026-01-01 and 2026-11-01; S2 has one
    when: GET /exports/backup.json
    then: formatVersion 2; theses grouped by stockId (sorted), within a stock newest date first
    test_data:
      input: { S1: ["2026-01-01", "2026-11-01"], S2: ["2026-05-05"] }
      expected: { formatVersion: 2, order: "by stockId, then date desc" }
  - id: TC-U-761
    scenario: no user id and no other user's entries
    given: users U and V each with entries
    when: U downloads the backup
    then: only U's entries; no key named userId or user_id anywhere in the file
    test_data:
      input: { U: 2, V: 3 }
      expected: { theses: 2, userIdKeys: 0 }
  - id: TC-U-762
    scenario: a user with no entries
    given: user U with stocks and no entries
    when: GET /exports/backup.json
    then: theses is []
    test_data:
      input: { entries: 0 }
      expected: { theses: [] }
```

**Notes** — Nothing restores backups yet, so no reader of v1 needs to stay working.

### T-005 — Thesis section on the stock page

```yaml
- title: Show a stock's thesis entries, streamed in, on /stocks/:id
- description: >
  Implement ux-design.md §Thesis section (lo-fi and hi-fi). createStockDetailLoader returns
  theses: api.get('/stocks/:id/theses') unawaited (design.md ADR-004); the page renders
  Suspense + Await with ThesisSkeleton and ThesisLoadError (Retry = revalidate) so a failure
  never reaches RouteError. New features/theses/ with types.ts (Thesis), ThesisSection (card,
  heading with count, advice note, empty state, Add entry placeholder wired in T-006),
  ThesisEntryCard (type badge, local date without time-zone shift, Edited marker, pre-wrap note
  with the 8-line / 600-char Show more rule, target price via formatUnitMoney with the stock's
  currency, invalidation), and the last-resolved-list state so revalidation shows no skeleton
  flash. A static test proves features/theses/ never uses dangerouslySetInnerHTML. Extend
  StubApi/makeThesis for deferred GETs. Covers FR-002, FR-003, FR-006, FR-008, FR-011,
  NFR-002, NFR-005, NFR-007, NFR-008.
- agent: react-vite-developer
- depends_on: [T-001]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] The stock's cards render before the entries arrive; a failed entries call shows the section error and Retry, and the rest of the page works
- [ ] Entries show in API order with the fields, marker and formatting of ux-design.md
- [ ] 200 entries render within 1 s after they arrive (timing test logged)
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-780
    scenario: page does not wait for entries
    given: GET /stocks/S resolves; GET /stocks/S/theses never resolves
    when: render /stocks/S
    then: Classification and Holding show; Thesis shows aria-busy skeleton and no count
    test_data:
      input: { theses: pending }
      expected: { headingVisible: true, ariaBusy: true }
  - id: TC-U-781
    scenario: load error and retry
    given: GET theses fails with 500, then succeeds with one entry
    when: render, then click Retry
    then: role=alert "Couldn't load the thesis entries." then the entry
    test_data:
      input: [500, [E1]]
      expected: [alert, "1 entry"]
  - id: TC-U-782
    scenario: empty state
    given: GET theses returns []
    when: render
    then: "No thesis yet" and one "Add first entry" button; no "Add entry" in the header
    test_data:
      input: []
      expected: { buttons: [Add first entry] }
  - id: TC-U-783
    scenario: an entry shows its fields
    given: entry { type: buy, date: "2026-11-20", note: "A\nB", targetPrice: "180.5000", invalidation: "x" } on a USD stock
    when: render
    then: badge "Buy", date "20 Nov 2026", two lines A and B, "$180.50", "x"; no "Edited"
    test_data:
      input: { targetPrice: "180.5000", currency: USD }
      expected: { target: "$180.50", lines: [A, B] }
  - id: TC-U-784
    scenario: edited marker and date without zone shift
    given: entry date "2026-01-01", createdAt 2026-01-01T00:00Z, updatedAt 2026-01-05T00:00Z; TZ America/Los_Angeles
    when: render
    then: date shows 1 Jan 2026 (not 31 Dec 2025); "Edited" shows
    test_data:
      input: { tz: America/Los_Angeles }
      expected: { date: "1 Jan 2026", edited: true }
  - id: TC-U-785
    scenario: markup is shown as text
    given: note "<img src=x onerror=alert(1)><b>bold</b>"
    when: render
    then: the literal text shows; no img or b element in the section
    test_data:
      input: "<img src=x onerror=alert(1)><b>bold</b>"
      expected: { imgElements: 0, text: "<img src=x onerror=alert(1)><b>bold</b>" }
  - id: TC-U-786
    scenario: show more follows the text rule
    given: notes of 600 chars on one line, 601 chars, and 9 short lines
    when: render
    then: no Show more; Show more; Show more (aria-expanded toggles)
    test_data:
      input: ["a×600", "a×601", "9 lines"]
      expected: [false, true, true]
```

**Notes** — Mock `sonner` as the other page tests do. `TC-U-784` sets `process.env.TZ` in its own test file.

### T-006 — Thesis entry dialog (add and edit)

```yaml
- title: Add and edit thesis entries from the stock page
- description: >
  Implement ux-design.md §Thesis entry dialog. ThesisDialog (mode add | edit) mounts its
  fetcher with the dialog and takes returnFocusTo; fields per the hi-fi table (type radios, date
  input with max = local today, note and invalidation textareas with code-point counters,
  target price with the stock's currency prefix); validates with thesisInput({ today }) before
  submit; Ctrl/Cmd+Enter submits. createStockDetailAction gains add-thesis and edit-thesis
  (features/theses/thesis-actions.ts) returning ThesisActionResult; edit sends only changed
  fields and, with none, sends nothing and toasts "No changes to save". Server field errors go
  under their fields, others into the form Alert; a 404 says "This stock no longer exists."
  with a /stocks link; nothing typed is lost on failure. Covers FR-001, FR-004, FR-009,
  NFR-007, NFR-008.
- agent: react-vite-developer
- depends_on: [T-005]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] Add and edit work end to end against `StubApi`, with toasts and focus return as ux-design.md
- [ ] Every domain validation message shows under its field; the first invalid field gets focus
- [ ] A failed save (400, 404, 500, network) keeps the dialog open with every value typed
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-800
    scenario: add an entry
    given: stock S (THB), no entries, POST answers 201
    when: open Add first entry, choose Sell, keep today, type note, target "42.25", submit
    then: POST body { type: sell, date: today, note, targetPrice: "42.25" }; toast "Entry added"; focus on Add entry
    test_data:
      input: { type: sell, note: "Valuation stretched", targetPrice: "42.25" }
      expected: { body: { type: sell, date: "<today>", note: "Valuation stretched", targetPrice: "42.25" } }
  - id: TC-U-801
    scenario: client validation before any request
    given: the add dialog
    when: submit with no type, empty note and target "1.23456"
    then: no request; errors under Type, Thesis and Target price; focus on Type
    test_data:
      input: { type: null, note: "", targetPrice: "1.23456" }
      expected: { requests: 0, errors: [type, note, targetPrice] }
  - id: TC-U-802
    scenario: the date picker stops future dates
    given: today is 2026-11-24 (fake timers)
    when: open the dialog
    then: date input value "2026-11-24" and max "2026-11-24"; typing 2026-11-25 shows "The date can't be in the future."
    test_data:
      input: "2026-11-25"
      expected: { max: "2026-11-24", error: true }
  - id: TC-U-803
    scenario: edit sends only changed fields
    given: entry E { type: buy, note: "x", targetPrice: "180.0000" }
    when: edit, clear target price, save
    then: PATCH body { targetPrice: null }; toast "Entry updated"; focus on E's Edit button
    test_data:
      input: { targetPrice: "" }
      expected: { body: { targetPrice: null } }
  - id: TC-U-804
    scenario: edit with no change
    given: entry E
    when: open edit and save
    then: no request; dialog closes; toast "No changes to save"
    test_data:
      input: {}
      expected: { requests: 0 }
  - id: TC-U-805
    scenario: failures keep the input
    given: POST answers 500, then network error, then 404
    when: submit three times
    then: dialog stays open with values; Alert "Couldn't save the entry. Try again." twice; then "This stock no longer exists."
    test_data:
      input: [500, network, 404]
      expected: { dialogOpen: true, valuesKept: true }
  - id: TC-U-806
    scenario: counter counts code points
    given: the add dialog
    when: type 3 emoji into Thesis
    then: counter "3 / 10,000"
    test_data:
      input: "😀😀😀"
      expected: "3 / 10,000"
```

**Notes** — Radix RadioGroup is driven by `click` on the radio in tests; the date input needs `fireEvent.change` in jsdom.

### T-007 — Delete with Undo and the stock delete wording

```yaml
- title: Delete an entry with a 5 s Undo; name entries in the stock delete dialog
- description: >
  Implement ux-design.md §Delete entry and §Delete stock confirmation. Entry Delete opens an
  AlertDialog (SOLID_DESTRUCTIVE_LIGHT), submits delete-thesis, moves focus to the Thesis
  heading, and raises a sonner toast with Undo for 5000 ms that submits restore-thesis with the
  entry DELETE returned; a failed restore toasts "Couldn't restore the entry.". DeleteStockDialog
  takes thesisCount (number | null) from the resolved entries and adds the sentence of
  ux-design.md (count, none, unknown). Covers FR-005, FR-007, NFR-007.
- agent: react-vite-developer
- depends_on: [T-006]
- status: backlog
- size: S
```

#### Acceptance criteria

- [ ] Delete, Undo and the restore failure behave as ux-design.md, with the same toast duration and focus rules as Stop holding
- [ ] The stock delete dialog shows the right sentence for 0, 1, N and not-loaded entries
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-820
    scenario: delete then undo
    given: entries E1, E2; DELETE E1 answers 200 with E1; restore answers 201
    when: Delete E1, confirm, click Undo in the toast
    then: DELETE sent; focus on the Thesis heading; restore body { entry: E1 }; toast "Entry restored"
    test_data:
      input: { entry: E1 }
      expected: { restoreBody: { entry: E1 } }
  - id: TC-U-821
    scenario: undo is offered for 5 seconds
    given: a deleted entry
    when: inspect the toast call
    then: toast called with duration 5000 and an Undo action
    test_data:
      input: {}
      expected: { duration: 5000, action: Undo }
  - id: TC-U-822
    scenario: restore failure
    given: restore answers 409
    when: click Undo
    then: toast "Couldn't restore the entry."
    test_data:
      input: 409
      expected: "Couldn't restore the entry."
  - id: TC-U-823
    scenario: stock delete names the entries
    given: thesisCount 0, 1, 3 and null
    when: open Delete stock
    then: no sentence; "This also deletes its 1 thesis entry."; "This also deletes its 3 thesis entries."; "Any thesis entries for this stock are deleted too."
    test_data:
      input: [0, 1, 3, null]
      expected: ["", "its 1 thesis entry", "its 3 thesis entries", "Any thesis entries"]
```

**Notes** — Reuse the Stop holding toast helper if one exists rather than a second copy.

### T-008 — Design test cases — thesis log

```yaml
- title: Design test cases — thesis log
- description: >
  Using the software-tester-design skill, produce structured TC-xxx test cases covering
  all test levels: unit boundaries, API (happy path + error paths + auth), frontend
  component, and E2E flows. Run Steps 0–4 (SUT definition → business flow → field specs
  → scenarios → test data). Output must be in TC-xxx format for software-tester-automation.
  Inputs: requirements.md, design.md, ux-design.md of this slice. Ids in the 700 range
  (TC-A-7xx API, TC-C-7xx component, TC-E-7xx E2E). Must cover every FR and NFR, the two-user
  isolation proof, the log-privacy proof (NFR-004), markup shown as text (NFR-005), the restore
  rules, the backup v2 shape, the 360 px and keyboard-only paths, and the contrast points
  ux-design.md leaves to E2E (secondary badge text, over-limit counter, solid destructive
  confirm). Save as docs/features/thesis-log/v1.0/test-cases.md.
- agent: software-tester-design
- depends_on: []
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] SUT definition documented
- [ ] TC-xxx cases cover happy path, boundaries, error paths, and business rules
- [ ] Each TC includes Level, Input, Expected Output, Preconditions, and Mock needed
- [ ] A traceability table maps every FR-001–FR-011 and NFR-001–NFR-008 to at least one TC

**Notes** — Runs in parallel with engineering tasks; depends only on requirements/design, not on code.

### T-009 — Automate tests — thesis log

```yaml
- title: Automate tests — thesis log
- description: >
  Using the software-tester-automation skill, convert the TC-xxx cases from T-008 into
  runnable scripts at the appropriate levels (Unit, API, Frontend Component, E2E).
  Run the full suite against the implementation. E2E specs are e2e/tl-*.spec.ts on the existing
  Playwright setup (admin-created users through e2e/lib/sl.ts helpers, real API, local Supabase):
  write, edit, delete and undo an entry; backdate one and see the order; delete the stock and
  see its entries gone from the backup; axe in light and dark (extending e2e/lib/states.ts with
  TL states); 360 px with no horizontal scroll; keyboard-only use. Add apiAs helpers for theses.
  Add the slice's TC ids to a test report script (pnpm test:report:tl) and write
  docs/features/thesis-log/v1.0/test-report.md; update CLAUDE.md for the new module, table,
  route shape, backup version and commands.
- agent: software-tester-automation
- depends_on: [T-001, T-002, T-003, T-004, T-005, T-006, T-007, T-008]
- status: backlog
- size: L
```

#### Acceptance criteria

- [ ] All TC-* from T-008 automated and passing (findings pinned with `test.fail` and a finding id only with the owner's agreement)
- [ ] Coverage >= 95% lines for `packages/domain`; >= 85% for `apps/api/src/modules/{theses,exports}`; >= 70% for `apps/web/src/features`
- [ ] Test report produced with pass/fail per TC-id
- [ ] The full Investhesis gate is green

**Notes** — Report "T-009 done" with the full test report when all TCs pass. Any contrast failure found here goes back to the owning web task as a fix.

## Status Legend

| Status | Changed By | Meaning |
|--------|-----------|---------|
| `backlog` | Orchestrator | Ready, waiting to be picked up |
| `doing` | Orchestrator / Agent | Agent actively working |
| `blocked` | Agent | Stuck, needs human intervention |
| `test` | Agent | Dev done, needs testing |
| `review` | Agent / Tester | Human must review before advancing |
| `done` | Human | Approved and complete |
