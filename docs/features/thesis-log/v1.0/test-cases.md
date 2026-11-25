---
version: 1.0
status: draft
date: 2026-11-25
requires: requirements.md, design.md, ux-design.md, dev-plan.md
task: T-008
---

# Test Cases: Thesis Log

Test design for [requirements.md](requirements.md), [design.md](design.md) and
[ux-design.md](ux-design.md). It keeps the 56 `TC-U-7xx` cases already written into tasks T-001 to
T-007 of [dev-plan.md](dev-plan.md) (same ids, none renumbered; section 3 indexes them) and adds
three series: `TC-A-7xx` (API, database, backup, privacy), `TC-C-7xx` (web component and static)
and `TC-E-7xx` (end to end). `software-tester-automation` (T-009) turns every case into a test
whose title starts with its id.

**ID scheme.** Stock Lists owns 1xx, Holdings and Concentration 4xx, Search, Filter and Export
5xx and 6xx (web tasks), User Auth 0xx. This slice uses the 700 range only. `TC-A-700..702` are
adopted from the placeholders already in `scripts/theses-integration.test.ts` (T-002), so nothing
collides. The Data API exposure of `app.theses` is the existing `TC-A-106` extended in T-002 and is
traced as such.

## 0. Inputs, assumptions and conventions

| Source | Used for |
|---|---|
| requirements.md | FR-001..FR-011, NFR-001..NFR-008, UC-001..UC-004, OQ-1..OQ-3 (resolved) |
| design.md | data model, `thesisInput`/`thesisPatch`/`latestThesisDate`, API contracts, ADR-001..008 |
| ux-design.md | exact copy, focus order, ARIA names, responsive rules, contrast points left to E2E |
| dev-plan.md T-001..T-007 | the 56 `TC-U-7xx` cases (extended, not duplicated) |
| implemented API (`apps/api/src/modules/theses/`) | order, error paths, NUL rule, restore rules (below) |

Levels: **Unit** (domain, database constraints), **API** (`app.inject`, local Supabase; also
script-level checks against the stack), **Component** (Testing Library, `StubApi`, jsdom),
**Static** (source scan), **E2E** (Playwright, real web + API + local Supabase). Priority: P1
smoke, P2 regression, P3 edge. Technique: BVA, EP, DT (decision table), ST (state transition),
EG (error guessing), UC (use case).

**Behaviour of the built API that the cases rely on** (confirmed in code):

- List order is `date` desc, then `createdAt` desc, then `id` desc (ids are UUIDv7, so the newest
  wins a tie).
- Bodies are validated in the service, not by a static route schema, because the date bound uses
  the injected clock (`latestThesisDate(deps.now())`).
- `note` or `invalidation` containing U+0000 is `400 validation_failed` on that path (Postgres
  text cannot hold NUL).
- Restore errors are prefixed with the body path: `entry.stockId`, `entry.updatedAt`, `entry.id`,
  `entry.<unknown key>`, `entry.note` and so on; a missing or non-object `entry` is path `entry`.
- A real patch writes `updatedAt` as `max(now, createdAt + 1 ms)` so the Edited marker
  (`updatedAt > createdAt`) cannot be lost to a same-millisecond edit.
- Restore: `createdAt <= updatedAt <= now`, `stockId` equals the path, id taken is
  `409 thesis_exists`, a foreign-key failure (stock gone) is 404.
- The JSON backup is `BackupV2`: `formatVersion: 2`, `theses` sorted by `stockId` then list order,
  no user id; `backup.csv` unchanged (T-004).

**Case anatomy.** Level, Priority, Technique, covers, Preconditions, Input, Expected Output, Mock
needed. Where the three documents are silent, the expected value is marked **(proposed)** and
listed in section 9.

**Test data sets.**

| Set | Content |
|---|---|
| TL-A | Users U and V (random ids per file). U: stock NVDA (US, USD), stock PTT (TH, THB), no entries. V: stock AAPL (US, USD). |
| TL-B | U's NVDA with three entries: Buy 2026-11-20 "Capex keeps rising.\nMargins hold." target "180" invalidation "Gross margin below 65%."; Update 2026-10-03 edited (updatedAt 2026-10-05); Buy 2025-03-14 with a 700-character note. |
| TL-C | U's NVDA with 200 entries of 2,000 characters (dates descending one day apart). |
| Clock | Fixed `now` where stated, else the real clock. Web tests use fake timers for "today". |

## 1. SUT definition

**System under test.** The Thesis Log slice: `app.theses`; `modules/theses` serving five routes
under `/stocks/{stockId}/theses`; the domain schemas `thesisInput`, `thesisPatch`,
`latestThesisDate` and `BackupV2`; the backup writer; and the Thesis section, entry dialog,
delete flow and stock-delete wording on `/stocks/:id`.

| Part | Inputs | Outputs | Boundaries and invariants |
|---|---|---|---|
| Domain schema | `type`, `date`, `note`, `targetPrice?`, `invalidation?`, `today` | normalised entry or issues with paths | type in 4; date real, `<= today`; note 1..10,000 code points after trim, CRLF to LF; invalidation 0..2,000, empty to `null`; target string `^\d{1,14}(\.\d{1,4})?$` and `> 0`, numbers refused; unknown key fails with the key as path |
| API | bearer identity, `stockId`, `thesisId`, JSON body | `Thesis`, `{ items }`, problem JSON | every query scoped by `userId`; another user's stock or entry is 404; response never has `userId`; date bound is UTC+14 |
| Database | rows | rows | composite FK to the owner's stock, cascade on delete, checks on type, lengths and target; RLS on, no policy |
| Backup | user | `BackupV2` | every entry of the user, none of another; no user id; snapshot-consistent |
| Section | entries, stock currency | list, count, states | newest first; text only; Edited when `updatedAt > createdAt`; own loading and error state |
| Dialog | field values | POST or PATCH | validates before send; keeps values on failure; edit sends changed fields only |
| Delete | entry | DELETE then restore | 5 s Undo restores the same entry; stock delete names the count |

## 2. Business flow map

- **Happy path (UC-001, UC-002).** Open a stock, see its cards at once, the Thesis section loads,
  Add entry, choose type, keep today, write the thesis, optionally target and invalidation, save;
  the entry shows first with its fields.
- **Alternative flows.** Backdate an entry; four types; target price in THB vs USD; edit one field;
  edit with no change; show more on a long note; load error then Retry; first entry from the empty
  state; delete then Undo (UC-003); download the backup (UC-004); delete the stock with entries.
- **Exception flows.** Validation errors (client and server); network, 500, 400, 409 and 404 on
  save; Undo of an id that exists; restore after the stock is gone; session expiry mid-save; another
  user's stock; unauthenticated.
- **Edge cases.** 10,000 and 10,001 code points; emoji and Thai combining marks; CRLF; NUL; target
  `0`, `0.0001`, 14 and 15 integer digits; leap day; UTC+14 and UTC-12 clocks; same-date entries;
  200 entries; markup, URLs and 5,000-character words in text; two tabs editing the same entry.

## 3. Existing coverage (TC-U-7xx in dev-plan.md, kept as written)

| Task | Ids | What they cover |
|---|---|---|
| T-001 domain | TC-U-700..709 | parse and normalise, type, dates, note and invalidation lengths, target price, unknown keys, patch, `latestThesisDate`, `BackupV2` |
| T-002 database | TC-U-720..723 | cascade, foreign key to own stock, check constraints, strings for date and numeric |
| T-003 API | TC-U-740..748 | order, validation paths, no-op patch, real patch and null clear, delete and restore, restore refusals, two-user 404, date bound by latest date anywhere, no private text in logs |
| T-003 extras | TC-U-749..751 | p95 latency (NFR-001), 401 on all five routes, valid-token scoping with log sentinels |
| T-004 backup | TC-U-760..762 | entries in order, no user id and no other user's entries, empty `theses` |
| T-005 section | TC-U-780..786 | no wait on entries, load error and Retry, empty state, fields, edited marker without zone shift, markup as text, show more rule |
| T-006 dialog | TC-U-800..806 | add, client validation, date max, edit changed fields, no change, failures keep input, code-point counter |
| T-007 delete | TC-U-820..823 | delete then Undo, 5 s toast, restore failure, stock delete wording |

Also existing and reused: `TC-A-106` (Data API cannot read `app.theses`, extended in T-002),
`TC-A-508` (backup snapshot, re-run with entries), `TC-E-023` (API output has no token), the
`schema.drift` test (`TC-U-006`) with `app.theses`.

## 4. API, database, backup and privacy cases (TC-A-7xx)

### TC-A-700
**Level** API (script) · **P1** · **EG** · covers NFR-003.
**Pre** stack up, migration applied, one entry inserted by `psql`. **Input** read `pg_class`,
`pg_policies` and the entry as the API role. **Expected** `relrowsecurity = t`; 0 policies on
`app.theses`; owner reads `private note|180.5000|2026-11-20`. **Mock** none. *(Implemented as
placeholder in `scripts/theses-integration.test.ts`.)*

### TC-A-701
**Level** API (script) · **P2** · EP · covers FR-001, NFR-006.
**Input** `information_schema.columns` of `app.theses`. **Expected** `target_price numeric 18,4`
nullable; `entry_date date`; `note text` not null; `invalidation text` nullable; `type text`;
`created_at`/`updated_at` timestamptz not null; `user_id`, `stock_id` uuid not null. **Mock** none.

### TC-A-702
**Level** API (script) · **P2** · EG · covers NFR-003 (migration safety).
**Pre** populated stocks and one entry. **Input** replay the migration in a rolled-back
transaction after dropping the table. **Expected** no error; stocks count and md5 unchanged;
`count(theses) = 0` inside; after rollback the entry is back. **Mock** none.

### TC-A-703
**Level** API (script) · **P1** · EG · covers NFR-003.
Existing `TC-A-106`, extended: REST (`/rest/v1/theses`, profile `app`) with the publishable key
and a signed-in token answers not-ok and never returns the sentinel note; `SET ROLE anon` and
`authenticated` then `select * from app.theses` fail with `permission denied for schema app`.
**Mock** none.

### TC-A-704
**Level** API · **P1** · EP · covers FR-002, FR-003.
**Pre** TL-A, no entries. **Input** `GET /stocks/{NVDA}/theses`. **Expected** 200 `{ items: [] }`.

### TC-A-705
**Level** API · **P1** · EP · covers FR-001.
**Input** four POSTs, one per type `buy|sell|update|review`, date `2026-01-10`, note "n".
**Expected** 201 each, `type` echoed, `targetPrice` and `invalidation` `null`, `createdAt ==
updatedAt`, `id` UUID, `stockId` the path's, no `userId`.

### TC-A-706
**Level** API · **P1** · EP · covers FR-001.
**Input** minimal body `{type, date, note}`; full body with `targetPrice "42.25"` and
`invalidation "x"`. **Expected** 201 with nulls for the minimal; full stored and returned, target
`"42.2500"`.

### TC-A-707
**Level** API · **P1** · BVA · covers FR-001, NFR-006.
**Input** targetPrice `"180"`, `"0.0001"`, `"12345678901234.5678"`, `"0"`, `"123456789012345"`,
`"1.23456"`, `"-1"`, `"1e3"`, `" 180"`, `180` (number), `""`, `null`.
**Expected** 201 with `"180.0000"`, `"0.0001"`, `"12345678901234.5678"`; 400 on `targetPrice`
for `"0"`, 15 digits, 5 decimals, `"-1"`, `"1e3"`, `" 180"`, the number; `""` and `null` store
`null`. The stored value read straight from Postgres has no float artefact.

### TC-A-708
**Level** API · **P1** · BVA · covers FR-001.
**Input** note of 1 char, 10,000 `a`, 10,000 emoji (20,000 UTF-16 units), 10,001 `a`, Thai text
with combining marks totalling 10,000 code points, `"   "`, `""`, missing. **Expected** 201 for the
first four valid shapes; 400 on `note` for 10,001, whitespace only, empty, missing. Same for
`invalidation` at 0/2,000/2,001: 2,001 is 400 on `invalidation`; `"   "` is stored `null`.

### TC-A-709
**Level** API · **P2** · EP · covers FR-001.
**Input** note `"  Capex up\r\nMargins hold  "`. **Expected** stored and returned
`"Capex up\nMargins hold"`; a lone `\r` is kept as typed **(proposed)**.

### TC-A-710
**Level** API · **P1** · BVA · covers FR-001.
**Pre** clock fixed at `2026-11-24T09:59:59Z`, then `2026-11-24T10:00:00Z`. **Input** dates
`2026-11-24`, `2026-11-25`, `2024-02-29`, `2025-02-29`, `2026-13-01`, `24/11/2026`, `2026-1-5`,
`""`, a number. **Expected** at 09:59:59: 201 for 24 Nov and 29 Feb 2024; 400 on `date` for 25 Nov
and the rest. At 10:00:00: 25 Nov becomes 201.

### TC-A-711
**Level** API · **P2** · EG · covers FR-009, NFR-004.
**Input** `note: "a\u0000b"`; `invalidation: "x\u0000"`; patch with NUL; restore with NUL in
`entry.note`. **Expected** 400 `validation_failed` with path `note` / `invalidation` / `entry.note`;
no row written; no 500; no log line with the text.

### TC-A-712
**Level** API · **P2** · EG · covers FR-009.
**Input** body `null`, `[]`, `"text"`, `{}`, empty body, `{..., "userId": "x"}`, `{..., "id": "x"}`
on POST. **Expected** 400 `validation_failed`; for the extra keys the path is the key (`userId`,
`id`); problem JSON has `requestId`.

### TC-A-713
**Level** API · **P2** · EP · covers NFR-003.
**Input** `stockId` or `thesisId` not a UUID (`abc`, `123`); well-formed unknown UUIDs.
**Expected** 400 for malformed on all five routes; 404 `not_found` for unknown stock and for
unknown entry.

### TC-A-714
**Level** API · **P1** · DT · covers FR-004.
**Pre** entry E (all fields set). **Input** one PATCH per field: `type`, `date`, `note`,
`targetPrice` (new, null, `""`), `invalidation` (new, null, `""`). **Expected** 200; only that
field changes (others deep-equal the original); `updatedAt > createdAt`; `createdAt` and `id`
unchanged.

### TC-A-715
**Level** API · **P2** · EP · covers FR-004.
**Input** PATCH `{targetPrice: "", invalidation: ""}` on E with both set. **Expected** both `null`.
PATCH `{targetPrice: "180.00"}` on E with `"180.0000"`: no change, `updatedAt == createdAt`
(numeric equality, not text).

### TC-A-716
**Level** API · **P1** · EG · covers FR-004, FR-009.
**Input** PATCH `{note: ""}`, `{date: "2999-01-01"}`, `{type: "hold"}`, `{targetPrice: 0}`,
`{userId: "x"}`, `{note: "ok", date: "bad"}`. **Expected** 400 each with the right paths (both
paths for the last); the stored entry is unchanged afterwards (GET deep-equals the earlier read).

### TC-A-717
**Level** API · **P2** · ST · covers FR-004.
**Pre** clock fixed so `now == createdAt`. **Input** PATCH `{note: "changed"}`. **Expected**
`updatedAt == createdAt + 1 ms` (still "Edited"); a second PATCH moves it forward again; a no-op
PATCH moves nothing. `updatedAt` never goes backward.

### TC-A-718
**Level** API · **P1** · ST · covers FR-005.
**Input** DELETE E; GET list; DELETE E again; PATCH E. **Expected** 200 with E; list lacks E; 404;
404. An entry id under the wrong stock's path (S2) is 404 on PATCH and DELETE and E stays.

### TC-A-719
**Level** API · **P1** · ST · covers FR-005.
**Pre** TL-B. **Input** DELETE the middle entry, then restore its returned body. **Expected** 201
deep-equals the deleted body; GET returns the original order of three entries; `createdAt` and
`updatedAt` identical to before (edited marker kept).

### TC-A-720
**Level** API · **P2** · EG · covers FR-005, NFR-003.
**Input** restore an entry whose `id` is held by another user's entry. **Expected** 409
`thesis_exists` **(proposed: acceptable, UUIDs are unguessable; see section 9)**; the other user's
entry is unchanged; no row for U.

### TC-A-721
**Level** API · **P2** · BVA · covers FR-005.
**Pre** clock fixed `now`. **Input** restore with `updatedAt = now` and `createdAt = updatedAt`;
with `updatedAt = now + 1 ms`; `createdAt = updatedAt + 1 ms`; `createdAt` without a zone;
`updatedAt: "yesterday"`. **Expected** 201 for the first; 400 on `entry.updatedAt` for the
second and third; 400 on `entry.createdAt` / `entry.updatedAt` for the zone-less and text values.

### TC-A-722
**Level** API · **P2** · EP · covers FR-005, FR-009.
**Input** restore with no `entry`; `entry: null`; `entry: []`; `entry` with the future date
`2999-01-01`; with `targetPrice: "0"`; with `type: "hold"`; with unknown key `userId`; with an
`id` that is not a UUID. **Expected** 400 each; paths `entry`, `entry`, `entry`, `entry.date`,
`entry.targetPrice`, `entry.type`, `entry.userId`, `entry.id`; nothing inserted.

### TC-A-723
**Level** API · **P2** · ST · covers FR-005, FR-009.
**Input** delete the stock, then restore an entry of it. **Expected** 404 `not_found`; no entry
appears for any stock.

### TC-A-724
**Level** API · **P2** · EG · covers FR-005.
**Input** two simultaneous restores of the same deleted entry. **Expected** exactly one 201 and one
409 `thesis_exists`; one row in the table.

### TC-A-725
**Level** API · **P1** · ST · covers FR-007.
**Pre** TL-B. **Input** `DELETE /stocks/{NVDA}`. **Expected** 204; `GET` of its theses is 404;
`select count(*) from app.theses where stock_id = NVDA` is 0; the other stock's entries remain.

### TC-A-726
**Level** API · **P1** · EP · covers NFR-003.
**Pre** TL-A, U and V each with entries on their own stocks. **Input** U lists NVDA; V lists AAPL;
U lists AAPL. **Expected** each sees only their own; U on AAPL is 404 (not an empty list).

### TC-A-727
**Level** API · **P2** · EG · covers NFR-003.
**Input** U calls the five routes with V's stock id and with a random unknown id. **Expected** the
two responses are the same status and body apart from `requestId` (no existence leak).

### TC-A-728
**Level** API · **P3** · EP · covers NFR-003.
**Pre** app built without a database. **Input** the five routes with a valid token. **Expected**
503 `db_unavailable` on each.

### TC-A-729
**Level** API · **P2** · EP · covers FR-010, NFR-003.
**Input** `GET /openapi.json`. **Expected** the five operations exist with `bearerAuth`; the
`Thesis` response schema lists exactly `id, stockId, type, date, note, targetPrice, invalidation,
createdAt, updatedAt`; `type` enum has four values; `BackupV2` response of `/exports/backup.json`
documents `theses` and `formatVersion` 2.

### TC-A-730
**Level** API · **P1** · EG · covers NFR-003.
**Input** every response body of TC-A-705..725 scanned. **Expected** no key named `userId` or
`user_id` anywhere, including list items, delete and restore bodies and problem details.

### TC-A-731
**Level** API · **P2** · BVA · covers NFR-001.
**Pre** TL-C (200 entries of 2,000 chars). **Input** `EXPLAIN` of the list query. **Expected** the
plan uses `theses_user_stock_order` (no sequential scan of other users' rows) **(proposed
assertion)**. Latency itself is `TC-U-749`.

### TC-A-732
**Level** API · **P1** · EP · covers FR-010, UC-004.
**Pre** TL-B plus one entry on PTT; user V with one entry. **Input** `GET /exports/backup.json`.
**Expected** parses with `BackupV2`; `formatVersion` 2; `theses` has 4 items equal (field by field)
to the GET lists; ordered by `stockId` then date desc, createdAt desc, id desc; stocks, lists and
settings sections unchanged from v1; no V entry.

### TC-A-733
**Level** API · **P1** · EP · covers FR-010.
**Input** `GET /exports/backup.csv` for a user before and after adding three entries (same stocks
and lists). **Expected** byte-identical bodies (BOM, 24 columns, CRLF); filename pattern unchanged.

### TC-A-734
**Level** API · **P1** · EG · covers FR-010.
Extends `TC-A-508`. **Pre** the snapshot test's mock that commits a row mid-export. **Input**
commit a new entry and a new stock between the backup's reads. **Expected** the file shows either
none of the late rows or all of its own snapshot, and every `theses[].stockId` appears in
`stocks[]` (no orphan entry).

### TC-A-735
**Level** API · **P2** · ST · covers FR-007, FR-010.
**Input** delete a stock with entries, then download the backup. **Expected** no entry of that
stock; no orphan `stockId`.

### TC-A-736
**Level** API · **P1** · EG · covers FR-010, NFR-004.
**Input** backup with sentinel entry text, captured logs. **Expected** the response has the
sentinel; no log line has it (as `TC-A-509`); the log line for the request has status 200 and no
body.

### TC-A-737
**Level** API · **P2** · EP · covers FR-010.
**Input** backup of TL-C (200 entries of 2,000 chars) and of a user with 200 entries of 10,000
chars. **Expected** 200, valid `BackupV2`, all entries present, `content-disposition` filename
`investhesis-backup-<UTC date>.json`.

### TC-A-738
**Level** API · **P1** · EG · covers NFR-004.
**Input** pino with the app's `REDACT_PATHS` logs `{note}`, `{x:{invalidation}}`,
`{x:{y:{targetPrice}}}`, `{entry:{note}}`. **Expected** every value is `[redacted]` at depths 0 to
2; keys `note`, `invalidation`, `targetPrice` are in `SECRET_KEYS`.

### TC-A-739
**Level** API · **P1** · EG · covers NFR-004.
**Input** run TC-A-705..724 with outbound `http.request`, `https.request` and `fetch` spied (as
`TC-A-425`). **Expected** no outbound request to any host other than the test database.

### TC-A-740
**Level** API · **P1** · EG · covers NFR-004.
**Input** forced check violation (`23514`) and a unique violation (`23505` on restore) with sentinel
text. **Expected** the 500 or 409 body and the log line carry the constraint name and code only; no
`detail`, `where`, parameter list or sentinel (extends `TC-U-748`, adds the 409 path).

### TC-A-741
**Level** API · **P2** · ST · covers NFR-003.
**Input** U's session token for a deleted user / token with `aud: anon` / expired token on each
route. **Expected** 401 `unauthenticated` with `WWW-Authenticate: Bearer`; no row changes (extends
`TC-U-750` with expiry).

## 5. Component and static cases (TC-C-7xx)

All use `renderApp(path, stubApi)` with `StubApi`/`makeStock`/`makeThesis`, `vi.mock('sonner')`.
"Mock" names what the `StubApi` script must supply.

### Section

### TC-C-700
**Component** · **P1** · EP · covers FR-002, NFR-007.
**Input** four entries, one per type. **Expected** each shows its type as text (Buy, Sell, Update,
Review) with an `aria-hidden` icon, in the same secondary badge classes; nothing relies on colour
(no `text-red`/`destructive` class on Sell). **Mock** GET theses `[E1..E4]`.

### TC-C-701
**Component** · **P1** · EP · covers FR-002.
**Input** 3 entries, then 1, then loading, failed, empty. **Expected** heading "Thesis" is
described by "3 entries"; "1 entry"; no count while loading, failed or empty; list is an `ol`
named by the heading; each entry an `article`; entries appear in API order.

### TC-C-702
**Component** · **P1** · EP · covers FR-011.
**Input** the section in loading, error, empty and filled states. **Expected** the line "Your own
reasoning, not advice." is present in empty and filled states and not duplicated; in loading and
error states the page still carries it or the section does not (match ux: first line of
`CardContent`) **(proposed: asserted for empty and filled only)**.

### TC-C-703
**Component** · **P1** · EP · covers FR-006, NFR-006.
**Input** target `"180.0000"` on a USD stock; `"42.2500"` on a THB stock; `"0.1234"`; `"1000.5000"`;
`"180.0000"` rendered again after the stock's currency is `THB`. **Expected** `$180`, `฿42.25`,
`$0.1234`, `$1,000.50`; the last shows `฿180` (same number, no conversion).

### TC-C-704
**Component** · **P2** · EP · covers FR-002.
**Input** entry with `targetPrice null, invalidation null`; with only target; only invalidation.
**Expected** the `dl` rows appear only for set values; no empty labels.

### TC-C-705
**Component** · **P2** · BVA · covers FR-004.
**Input** `updatedAt == createdAt`; `updatedAt = createdAt + 1 ms`; `updatedAt` on a later date.
**Expected** no "Edited" for the first; "Edited <date of updatedAt>" for the others, in the browser
zone; the entry date is unchanged by the zone.

### TC-C-706
**Component** · **P2** · EP · covers NFR-007.
**Input** entry Buy 20 Nov 2026. **Expected** buttons named "Edit Buy entry of 20 Nov 2026" and
"Delete Buy entry of 20 Nov 2026"; tab order Add entry, Edit, Delete, (Show more).

### TC-C-707
**Component** · **P1** · UC · covers FR-003.
**Input** empty state, click Add first entry, save one entry. **Expected** dialog opens from the
empty button; after save the empty state is replaced by the list with count "1 entry" and the
header shows Add entry (the empty button is gone).

### TC-C-708
**Component** · **P1** · ST · covers FR-008.
**Input** theses 500, click Retry (held answer), then answer success. **Expected** role=alert text
as ux; during retry the button is `aria-disabled` and the spinner has `motion-reduce:animate-none`;
Classification, Holding and Lists cards stay; `RouteError` is never rendered; the stock page is
usable (Edit stock works) while failed.

### TC-C-709
**Component** · **P2** · ST · covers FR-008.
**Input** save an entry; hold the re-read GET. **Expected** the previous entries stay on screen
during the re-read (no skeleton, no `aria-busy`); the new entry appears when the re-read arrives.

### TC-C-710
**Component** · **P2** · EP · covers FR-008, NFR-007.
**Input** theses pending. **Expected** container `aria-busy="true"`, `sr-only` "Loading thesis
entries", three skeleton lines with `motion-reduce:animate-none`.

### TC-C-711
**Component** · **P2** · BVA · covers NFR-008.
**Input** notes: 8 lines of 10 chars; 9 lines of 10 chars; 600 characters on one line; 601; 8 lines
with CRLF-origin text; invalidation of 2,000 chars. **Expected** Show more only for 9 lines, 601
chars; `aria-expanded` and `aria-controls` toggle with Show less; invalidation is never clamped;
the full text is in the DOM when collapsed (clamp is CSS).

### TC-C-712
**Component** · **P1** · EG · covers NFR-005.
**Input** note and invalidation: `<script>alert(1)</script>`, `<a href="javascript:alert(1)">x</a>`,
`https://example.com/a?b=1&c=2`, `&amp; &lt;b&gt;`, `**bold** _it_ # h1`, `‮` bidi override.
**Expected** each appears as literal text; no `script`, `a`, `img`, `b`, `h1` element inside the
section; the URL is not a link; entities not decoded; Markdown not rendered.

### TC-C-713
**Static** · **P1** · EG · covers NFR-005.
**Input** scan `apps/web/src/features/theses/**` and the stock detail files. **Expected** no
`dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`, `DOMParser`; no `fetch`/`XMLHttpRequest`
outside the `ApiClient`; no `console.log` of entry text.

### TC-C-714
**Component** · **P2** · BVA · covers NFR-002.
**Input** TL-C (200 entries of 2,000 chars) resolved at t0. **Expected** the 200 `article`s are in
the DOM within 1,000 ms (median of 5, timing logged); marked as a timing test (serial pass).

### TC-C-715
**Component** · **P2** · EP · covers NFR-008.
**Input** a note of one 5,000-character word and a URL of 300 characters without spaces.
**Expected** the paragraph has `whitespace-pre-wrap` and `wrap-anywhere`; the entry has no fixed
width class that would force overflow; (pixel overflow is `TC-E-714`).

### TC-C-716
**Component** · **P2** · BVA · covers FR-002.
**Input** entry date `2026-01-01` with `TZ` `Pacific/Kiritimati` (UTC+14), `Etc/GMT+12` (UTC-12),
`UTC`; `2026-12-31`; `2024-02-29`. **Expected** "1 Jan 2026", "31 Dec 2026", "29 Feb 2024" in each
zone; `time[dateTime]` is the stored string.

### TC-C-717
**Component** · **P2** · EP · covers FR-002.
**Input** navigate `/stocks/A` to `/stocks/B` (client-side). **Expected** B never shows A's entries
(not even for a frame); one GET per stock; a query-only change (`?x=1`) sends no theses request.

### TC-C-718
**Component** · **P1** · EP · covers FR-008.
**Input** `GET /stocks/S` answers 404 while theses would answer 200. **Expected** the existing
not-found `RouteError` page; no Thesis section.

### Entry dialog

### TC-C-720
**Component** · **P1** · EP · covers FR-001, NFR-007.
**Input** open Add on a THB stock, on a USD stock. **Expected** title "Add thesis entry · PTT";
Type unset; Date = today (fake timers) with `max` today; counters "0 / 10,000" and "0 / 2,000";
prefix `฿` / `$`; focus on the first Type radio; screen-reader description present.

### TC-C-721
**Component** · **P1** · DT · covers FR-001, FR-009.
**Input** submit with: nothing; only type; type+date, note `"   "`; note 10,001 emoji; target
`"abc"`; invalidation 2,001; date cleared; date `2026-11-25` with today `2026-11-24`. **Expected**
each message sits under its own field (`aria-describedby`, `aria-invalid`), no request, focus on
the first field in error in field order Type, Date, Thesis, Target price, Invalidation; the errors
clear when the field is fixed.

### TC-C-722
**Component** · **P2** · BVA · covers FR-001, NFR-007.
**Input** type 9,999 / 10,000 / 10,001 code points; Thai text with combining vowels; ZWJ emoji.
**Expected** the counter shows code points; at 10,001 the counter has `text-foreground font-medium`
(not a red class) and the limit message shows under the field; submit is refused.

### TC-C-723
**Component** · **P2** · EP · covers FR-001.
**Input** note `"  a\nb  "`, invalidation `"   "`. **Expected** POST body has `note: "a\nb"` or the
raw value normalised by the server, invalidation omitted or `null` **(proposed: web sends the
trimmed value and omits blank optional fields)**; the dialog closes on 201.

### TC-C-724
**Component** · **P1** · BVA · covers FR-001, NFR-006.
**Input** target price typed: `180`, `180.5`, `0.0001`, `0`, `0.00`, `180.`, `.5`, `1,5`, `$180`,
`1e3`, `-1`, `12345678901234.5678`, `123456789012345`, `1.23456`, `" 180 "`, Arabic-Indic `١٨٠`,
empty. **Expected** valid: `180`, `180.5`, `0.0001`, the 14-digit value, empty (no field sent);
invalid with the domain message: the rest (the spaced value is trimmed then valid **(proposed)**).
The request body field is always a string, never a number.

### TC-C-725
**Component** · **P2** · EP · covers NFR-007.
**Input** Enter in a textarea; Ctrl+Enter and Cmd+Enter on a valid form; on an invalid form; Esc.
**Expected** Enter adds a line break and submits nothing; both shortcuts submit once when valid and
show errors when invalid; Esc closes without a request and returns focus to the opener (Add entry
or the entry's Edit button).

### TC-C-726
**Component** · **P1** · ST · covers FR-009.
**Input** click Add entry twice quickly with a held POST. **Expected** one request; the button is
`aria-disabled` with a spinner (`motion-reduce:animate-none`) and still focusable; Cancel stays
usable and does not abort the save silently **(proposed)**.

### TC-C-727
**Component** · **P1** · EP · covers FR-009.
**Input** POST answers 400 with `errors` for `note`, `targetPrice`, `date`, and an unknown path
`entry.x`. **Expected** the first three under their fields with the server text; the unknown path in
the form `Alert`; values kept; focus on the first field with an error.

### TC-C-728
**Component** · **P1** · DT · covers FR-009.
**Input** answers 400 (no `errors`), 401 then success after refresh, 403, 409, 429, 500, 503,
network failure, timeout. **Expected** the dialog stays open with every typed value; `Alert`
"Couldn't save the entry. Try again." for the non-field failures; a second Save after the failure
sends the same body.

### TC-C-729
**Component** · **P1** · EP · covers FR-009.
**Input** POST answers 404. **Expected** "This stock no longer exists." with a link `href="/stocks"`;
values kept; the same for PATCH when the stock is gone **(entry-404: see section 9)**.

### TC-C-730
**Component** · **P1** · EP · covers FR-004.
**Input** Edit on entry E (type Update, date 2026-10-03, note, target `"180.0000"`, invalidation).
**Expected** title "Edit thesis entry · NVDA", button Save; fields prefilled (target shown as
`180`, not `180.0000`, per the decimals-as-entered rule **(proposed)**); focus on the checked
radio.

### TC-C-731
**Component** · **P1** · DT · covers FR-004.
**Input** change exactly one field at a time (type, date, note, set target, clear target, set
invalidation, clear invalidation); then change a field and change it back. **Expected** PATCH body
holds only the changed key (`null` for a cleared optional); change-and-revert sends nothing and
toasts "No changes to save"; toast "Entry updated" on success; focus returns to E's Edit button.

### TC-C-732
**Component** · **P2** · ST · covers FR-001.
**Input** type in Add, Cancel, reopen; edit E, change, Cancel, reopen E; open Add after a
successful add. **Expected** every opening starts clean (stored values for edit, defaults for add);
the fetcher result of a previous failure does not show.

### TC-C-733
**Static** · **P3** · EP · covers NFR-008.
**Input** dialog class list. **Expected** `sm:max-w-lg`, `max-h-[90svh]`, `overflow-y-auto`; Add entry
button shows icon and text.

### TC-C-734
**Component** · **P2** · EP · covers NFR-007.
**Input** `vitest-axe` on the section (filled, empty, error), the add dialog (clean and with
errors), the edit dialog, the delete confirm. **Expected** no violations (contrast is measured in
`TC-E-713`, as jsdom has no layout).

### Delete entry and Undo

### TC-C-740
**Component** · **P1** · EP · covers FR-005, NFR-007.
**Input** click Delete on Buy 20 Nov 2026. **Expected** alert dialog "Delete this entry?" with "The
Buy entry of 20 Nov 2026 will be deleted."; focus on Cancel; Esc cancels, no request, focus back on
that entry's Delete button; Delete button has the `SOLID_DESTRUCTIVE_LIGHT` classes.

### TC-C-741
**Component** · **P1** · ST · covers FR-005.
**Input** Delete the only entry; then Undo. **Expected** the empty state appears and focus is on the
"Thesis" heading; Undo restores the entry in its date position with the same Edited marker and
count; toast "Entry restored"; the second Undo click does nothing (one restore request).

### TC-C-742
**Component** · **P1** · ST · covers FR-005.
**Input** fake timers: delete, advance 4,999 ms, then 5,001 ms. **Expected** the toast action is
live at 4,999 ms and gone after 5,000 ms; no restore request after expiry; the toast was created
with `duration: 5000`.

### TC-C-743
**Component** · **P2** · EP · covers FR-005.
**Input** DELETE answers 500, network error, 404 (entry or stock gone). **Expected** the entry stays
in the list; a toast or alert names the failure **(copy proposed: "Couldn't delete the entry.")**;
the confirm dialog closes or stays per ux **(see section 9)**; focus lands on the entry's Delete
button.

### TC-C-744
**Component** · **P2** · EP · covers FR-005.
**Input** restore answers 409, 404, 400, 500, network failure. **Expected** toast "Couldn't restore
the entry."; the list is unchanged; no retry loop.

### TC-C-745
**Component** · **P2** · ST · covers FR-005.
**Input** delete E1, then E2, then Undo on E1's toast, then on E2's. **Expected** each Undo
restores its own entry (the closure holds its body); order is by date, not by restore order.

### Stock delete wording and page wiring

### TC-C-750
**Component** · **P1** · DT · covers FR-007.
**Input** open Delete stock with entries loaded: 0, 1, 3; still loading; load failed; then entries
resolve while the dialog is open; add an entry then open it. **Expected** no sentence, "its 1 thesis
entry", "its 3 thesis entries", "Any thesis entries for this stock are deleted too." (loading and
failed); the sentence updates when the entries arrive **(proposed)**; a newly added entry counts.

### TC-C-751
**Component** · **P2** · UC · covers FR-007.
**Input** confirm the stock delete. **Expected** redirect to `/stocks` with the existing toast; no
thesis request for the deleted stock afterwards.

### TC-C-752
**Component** · **P2** · EP · covers FR-008.
**Input** edit stock currency path: stock changes THB to USD through the stock form, return to the
page. **Expected** the same entries show `$` for the target price with the same number (FR-006).

## 6. End-to-end cases (TC-E-7xx)

Specs `e2e/tl-*.spec.ts`, a fresh admin-created user per test (`e2e/lib/sl.ts`), real API and local
Supabase, `apiAs` helpers for seeding. Time zone `Asia/Bangkok` unless stated.

### TC-E-700
**E2E** · **P1** · UC · covers FR-001, FR-002, UC-001, UC-002.
**Pre** user with stock NVDA (US). **Input** open `/stocks/:id`; Add first entry; Buy, today, note
"Capex up.\nMargins hold.", target `180`, invalidation "Gross margin below 65%."; save. **Expected**
toast "Entry added"; section shows "1 entry", Buy badge, today's date, two note lines, `$180`,
invalidation; reload shows the same; `apiAs.theses` returns the entry with `"180.0000"`.

### TC-E-701
**E2E** · **P1** · UC · covers FR-001, FR-002.
**Input** add entries dated 2026-11-20 (A), 2025-03-14, 2026-11-20 (B) in that order of creation.
**Expected** the list order is B, A, 2025-03-14; future date cannot be picked or typed (error
"The date can't be in the future."); the date field defaults to local today.

### TC-E-702
**E2E** · **P1** · UC · covers FR-004, UC-003.
**Input** edit an entry's note; then open edit and save without change. **Expected** toast "Entry
updated" and "Edited <date>" appears; the second save toasts "No changes to save" and the marker
date does not move; the API's `updatedAt` equals after the second save.

### TC-E-703
**E2E** · **P1** · UC · covers FR-005, UC-003.
**Input** delete an edited entry; click Undo within 5 s. **Expected** the entry is back in place
with the same fields and the "Edited" text; reload keeps it; the API entry deep-equals the one read
before the delete.

### TC-E-704
**E2E** · **P1** · ST · covers FR-005.
**Input** delete an entry and wait 6 s. **Expected** the toast disappears; Undo is no longer
offered; reload: the entry is gone; the API list lacks it.

### TC-E-705
**E2E** · **P1** · UC · covers FR-007.
**Pre** NVDA with 3 entries. **Input** Delete stock. **Expected** dialog says "its 3 thesis
entries"; after confirm, redirect to `/stocks`; the API entries route for that id is 404; the
backup JSON has none of those entries; other stocks' entries remain.

### TC-E-706
**E2E** · **P1** · UC · covers FR-010, UC-004.
**Input** on `/import-export` click download JSON backup (and CSV). **Expected** the JSON parses with
`BackupV2`, `formatVersion` 2, `theses` equals the API data, no user id key anywhere; the CSV has 24
columns and the same bytes as before the entries existed.

### TC-E-707
**E2E** · **P1** · EG · covers NFR-003.
**Pre** users A and B; A has entries. **Input** B opens A's `/stocks/:id`; B calls the five thesis
routes with A's ids through `apiAs`. **Expected** the web shows the not-found page; the API answers
404 each; A's entries unchanged; B's backup has none of A's entries.

### TC-E-708
**E2E** · **P1** · EG · covers NFR-003.
**Input** signed out: open `/stocks/:id`; call a thesis route with no token; expire the access
token before saving (session refresh path). **Expected** redirect to sign-in; 401 on the route; with
an expired token the client refreshes once and the save succeeds without losing the dialog values.

### TC-E-709
**E2E** · **P1** · EG · covers FR-008, FR-009.
**Input** `page.route` aborts the list GET, then passes through; aborts the POST once, then passes
through. **Expected** stock details and holding stay; section shows "Couldn't load the thesis
entries." and Retry works; the save failure keeps the dialog and every typed value, the retry saves
once (one row in the API).

### TC-E-710
**E2E** · **P1** · EG · covers NFR-005.
**Input** add an entry whose note is `<img src=x onerror="window.__x=1"><script>window.__x=2</script>`
and a link-like `https://example.com`. **Expected** the text is visible as typed; `window.__x` is
undefined; no `dialog` event fired; the DOM has no `img` in the section; the URL is not a link.

### TC-E-711
**E2E** · **P1** · EG · covers NFR-004.
**Input** add, edit, delete, undo with sentinel text; record every request via `page.on('request')`;
read `e2e/.output/` API logs. **Expected** no request to an origin other than the web and API
origins; no log line contains a sentinel (extends `TC-E-023`).

### TC-E-712
**E2E** · **P1** · EP · covers NFR-007.
**Input** axe (wcag2a/aa) in light and dark on the `TL_STATES` added to `e2e/lib/states.ts`: filled
section, empty, loading (held request), load error, add dialog clean, add dialog with errors, edit
dialog, delete confirm, stock delete confirm, undo toast visible. **Expected** zero violations in
each state and theme.

### TC-E-713
**E2E** · **P1** · EP · covers NFR-007.
Contrast points that ux-design leaves to E2E (`e2e/lib/contrast.ts`, light and dark). **Input**
measure: secondary badge text for each of the four types; the counter when over the limit; the
solid destructive confirm text on its fill; `muted-foreground` of count, advice note, Edited text
and `dl` labels on `card`. **Expected** each at least 4.5:1 (3:1 for the counter icon if any); the
over-limit counter is distinguished by weight and text, not by red alone.

### TC-E-714
**E2E** · **P1** · EP · covers NFR-008.
**Input** viewport 360 × 740, entries with a 300-character URL, a 5,000-character word, 8+ lines;
add dialog open on a short viewport (360 × 500). **Expected** `document.scrollWidth <= innerWidth`
on the page and in the dialog; the long text wraps; the dialog body scrolls inside; Add entry sits
beside "Thesis"; every action reachable.

### TC-E-715
**E2E** · **P1** · UC · covers NFR-007.
**Input** keyboard only (`trackPointer` proves no pointer): Tab to Add entry, Enter, arrow keys pick
Sell, Tab through fields, type, Ctrl+Enter; Tab to the entry's Edit, Enter, Esc; Delete, Enter on
Delete, Tab to the toast Undo (or Alt+T) and activate. **Expected** focus lands on the first radio
on open and on the opener after save and after Esc; on the Thesis heading after delete; the whole
flow completes without a pointer event.

### TC-E-716
**E2E** · **P1** · BVA · covers FR-001.
**Input** browser time zones `Asia/Bangkok` at a clock of 06:30 local, `Pacific/Kiritimati` (UTC+14)
near its midnight, `America/Los_Angeles` late evening; add an entry with the default date. **Expected**
the default date and `max` are the browser's local today; the API accepts it (bound is UTC+14); the
list shows that date without a day shift.

### TC-E-717
**E2E** · **P2** · EP · covers FR-003, FR-011.
**Input** new stock with no entries, then add and delete the last one. **Expected** the empty state
text and one Add first entry button; the advice line is visible in every state; after deleting the
last entry the empty state returns without a reload.

### TC-E-718
**E2E** · **P2** · BVA · covers NFR-001, NFR-002.
**Pre** 200 entries of 2,000 chars seeded through the API (TL-C). **Input** open the stock page.
**Expected** the stock cards show before the section; the section is complete within 1 s after the
GET resolves (performance mark logged); adding the 201st entry works; the page scrolls with no
layout error.

### TC-E-719
**E2E** · **P2** · EP · covers FR-006.
**Input** NVDA (US, USD) with target `180`; edit the stock to market TH (currency THB). **Expected**
the entry shows `฿180` after the change; the stored number is unchanged in the API.

### TC-E-720
**E2E** · **P3** · EP · covers NFR-007.
**Input** `prefers-reduced-motion: reduce`, dark theme, loading and retry states. **Expected** the
skeleton and spinners have no running animation; the section is readable in dark mode.

### TC-E-721
**E2E** · **P2** · ST · covers FR-009, FR-005.
**Input** two tabs on the same stock: tab A deletes an entry; tab B (still showing it) edits it and
deletes it. **Expected** tab B's save answers 404; the dialog stays with the typed values and says
so **(message: see section 9)**; tab B's delete toasts a failure; no crash; reload shows the entry
gone.

### TC-E-722
**E2E** · **P2** · ST · covers FR-005, NFR-003.
**Input** delete an entry, delete its stock within 5 s, then click Undo. **Expected** the restore
fails with the toast "Couldn't restore the entry."; no entry for any stock in the API.

## 7. Traceability

| Requirement | Cases |
|---|---|
| FR-001 add fields and rules | TC-U-700..707, 740, 741, 747; TC-A-701, 705..712; TC-C-720..724, 730; TC-E-700, 701, 716 |
| FR-002 list, order, fields, count | TC-U-740, 783; TC-A-704, 726; TC-C-700, 701, 703, 704, 716, 717; TC-E-700, 701 |
| FR-003 empty state | TC-U-782; TC-A-704; TC-C-707; TC-E-717 |
| FR-004 edit and Edited | TC-U-742, 743, 784, 803, 804; TC-A-714..717; TC-C-705, 730, 731; TC-E-702 |
| FR-005 delete and Undo | TC-U-744, 745, 820..822; TC-A-718..724; TC-C-740..745; TC-E-703, 704, 721, 722 |
| FR-006 currency of target | TC-U-783; TC-C-703, 752; TC-E-719 |
| FR-007 delete with stock, count | TC-U-720, 823; TC-A-725, 735; TC-C-750, 751; TC-E-705 |
| FR-008 section load and error | TC-U-780, 781; TC-C-708..710, 718; TC-E-709, 718 |
| FR-009 errors, input kept, 404 | TC-U-741, 801, 805; TC-A-711, 712, 716, 722, 723; TC-C-721, 726..729, 732; TC-E-709, 721 |
| FR-010 backup v2 | TC-U-709, 760..762; TC-A-729, 732..737; TC-E-706 |
| FR-011 not-advice note | TC-C-702; TC-E-717 |
| NFR-001 API latency | TC-U-749; TC-A-731, 737; TC-E-718 |
| NFR-002 render 200 entries | TC-C-714; TC-E-718 |
| NFR-003 auth, isolation, RLS | TC-U-721, 746, 750, 751; TC-A-106 (extended), 700, 702, 703, 713, 726..730, 741; TC-E-707, 708, 722 |
| NFR-004 privacy and logs | TC-U-748, 751; TC-A-711, 736, 738..740; TC-C-713; TC-E-711 |
| NFR-005 text, not HTML | TC-U-785; TC-C-712, 713; TC-E-710 |
| NFR-006 exact decimals | TC-U-705, 723; TC-A-701, 707, 715; TC-C-703, 724 |
| NFR-007 accessibility | TC-U-801; TC-C-700, 706, 710, 720, 725, 734, 740; TC-E-712, 713, 715, 720 |
| NFR-008 360 px, wrapping | TC-U-786; TC-C-711, 715, 733; TC-E-714 |

## 8. Coverage matrix

| Area | Unit | API/DB | Component | E2E | Covered |
|---|---|---|---|---|---|
| Happy path | yes | yes | yes | yes | yes |
| Validation and boundaries | yes | yes | yes | partial | yes |
| Auth, isolation | yes | yes | no | yes | yes |
| State transitions (edit, delete, restore) | yes | yes | yes | yes | yes |
| Error and failure paths | yes | yes | yes | yes | yes |
| Privacy, logs, third parties | yes | yes | static | yes | yes |
| Accessibility, contrast | no | no | axe (no layout) | yes | yes |
| Responsive and wrapping | no | no | class checks | yes | yes |
| Time zones | yes | yes | yes | yes | yes |
| Concurrency | no | yes (restore race) | no | yes (two tabs) | partial |
| Performance | no | yes | yes | yes | yes |
| Backup | yes | yes | no | yes | yes |

Counts: existing `TC-U` 56; new `TC-A` 42 (`TC-A-700..741`, of which 700..702 and 703 map to
scripts already written); new `TC-C` 43; new `TC-E` 23. Total new 108.

## 9. Gaps, risks and decisions for the owner

1. **A 404 on edit, delete or restore can mean "entry gone" as well as "stock gone".** ux-design
   says a 404 shows "This stock no longer exists." (TC-C-729, TC-E-721). The API's body code is
   `not_found` for both, so the web cannot tell them apart. Decide: one message for both, or an
   error `detail` that names which.
2. **Restore of an id held by another user answers 409** (primary key is global). It tells the caller
   that UUID exists. Accepted as harmless (UUIDv7 ids are not guessable from outside); say if you
   want a 404 instead. (TC-A-720)
3. **Delete failure copy is not in ux-design.** TC-C-743 proposes "Couldn't delete the entry." and
   leaves the entry in the list.
4. **Whitespace in the target price.** The domain does not trim; TC-C-724 proposes that the web
   trims before validating and sends the trimmed string, and that blank optional fields are omitted.
5. **Edit dialog target price display.** Stored `"180.0000"` shown as `180` in the field (the
   "decimals as entered" rule) is proposed (TC-C-730); the API cannot know the entered decimals.
6. **Restore bound.** design.md says the restore date rule uses the entry's own date; the built
   service uses `latestThesisDate(now)`, which is the same for any entry that was valid when it was
   created. No test depends on the difference.
7. **Known gap by design (ADR-003).** A hand-made request can carry a date one day after the
   investor's local today (the API bound is UTC+14). `TC-U-747`/`TC-A-710` pin it; no case asserts
   the stricter rule.
8. **Not tested.** Backup restore (out of scope), Thai UI, rate limiting (no limiter on these routes),
   and pagination (none; sized to 200 entries). A stock with more than 200 entries is untested
   beyond TC-A-737.
9. **Existing id numbers.** `TC-A-700..702` match placeholder titles already committed in
   `scripts/theses-integration.test.ts`; `TC-A-703` is the extended `TC-A-106`. T-009 should rename
   nothing and keep those titles.
