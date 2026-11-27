---
version: 1.0
status: draft
date: 2026-11-27
requires: requirements.md, design.md, ux-design.md, dev-plan.md
task: T-009
---

# Test Cases: Thai and English UI

Test design for [requirements.md](requirements.md), [design.md](design.md) and
[ux-design.md](ux-design.md). It keeps the 62 `TC-U-1000..1061` cases already written into tasks
T-001 to T-008 of [dev-plan.md](dev-plan.md) (same ids, none renumbered or redefined; section 3
indexes them), adds seven unit cases for gaps (`TC-U-1062..1068`), and adds three series:
`TC-A-10xx` (API, database, scripts, emails), `TC-C-10xx` (web component and static) and
`TC-E-10xx` (end to end). `software-tester-automation` (T-010) turns every case into a test whose
title starts with its id.

**ID scheme.** Stock Lists owns 1xx, Holdings and Concentration 4xx, Search, Filter and Export 5xx
and 6xx, Thesis Log 7xx, Value Chains 9xx. This slice uses the 1000 range with one numbering per
series (`TC-A-1000..`, `TC-C-1000..`, `TC-E-1000..`), so no id collides with `TC-U-10xx`.

## 0. Inputs, assumptions and conventions

| Source | Used for |
|---|---|
| requirements.md | FR-001..FR-014, NFR-001..NFR-007, UC-001..UC-005, OQ-1..OQ-3 (resolved) |
| design.md | store, catalogues, rule ids, `GET /me`, `PATCH /settings`, `?lang=`, font, emails, ADR-001..009 |
| ux-design.md | the switch in two places, save-failure toast, Instructions sheet, emails, Thai typography rules, glossary |
| dev-plan.md T-001..T-008 | the 62 `TC-U-10xx` cases (extended, not duplicated) |
| Earlier slices' test cases | house format and reused fixtures (`StubApi`, `makeStock`, `apiAs`, `states.ts`, `contrast.ts`, `trackPointer`, `buildTestApp`/`appFor`, Mailpit helpers) |

Levels: **Unit** (domain and web pure logic, in the task contracts), **API** (`app.inject` on the
real local database), **Script** (against the running local Supabase stack: `scripts/*.test.ts`,
Mailpit), **Component** (Testing Library, `StubApi`, jsdom), **Static** (source or build scan),
**E2E** (Playwright, real web + API + local Supabase, admin-created users, Chromium). Priority: P1
smoke, P2 regression, P3 edge. Technique: BVA, EP, DT (decision table), ST (state transition), EG
(error guessing), UC (use case), 2U (two users), CC (concurrency), PO (property or data-driven over
a whole catalogue).

**Case anatomy.** Level, Priority, Technique, covers, then **Pre** (preconditions), **Input**,
**Expected** (expected output) and **Mock** (mock needed). Where the three documents are silent the
expected value is marked **(proposed)** and listed in section 9.

**Conventions the cases rely on** (from design.md and the code that exists today):

- English is the test default: `test/setup.ts` puts the store on `en` before each test. A "Thai"
  case says so (`renderApp(path, api, { language: 'th' })`, or the switch).
- "Canonical" means the English spelling stored in the database, sent by the API, written to the
  address and to every exported file.
- The **Thai residue scan** used by several cases takes a rendered container and returns every
  text node, and the `aria-label`, `placeholder`, `title`, `alt` and `aria-description`
  attributes, that contain a run of 3 or more Latin letters, after removing the **allow-list**:
  the brand `Investhesis`, tickers, company names, market codes (`US`, `TH`), exchanges
  (`NASDAQ`, `NYSE`, `SET`, `mai`), index names, currency codes (`USD`, `THB`), `GICS`, `CSV`,
  `XLSX`, `JSON`, `B2B`, `B2C`, `Moat` where the glossary keeps it, themes, list names, chain
  names, thesis text and the stored company names of the dataset. An empty result passes.
- **Switch** = account menu, radio item `ไทย` or `English`. The auth-page switch is the inline
  button pair.
- Dates in cases use the fixed tables (`27 พ.ย. 2026`), never `Intl`.

**Test data sets.**

| Set | Content |
|---|---|
| I18N-A | User U, language null. Stocks (ticker, market/exchange, name, lens values): AAPL US/NASDAQ "Apple Inc." Information Technology, Quality, Mega, Brand, B2C, theme "AI", held 10 x 150.00 USD. JPM US/NYSE "JPMorgan Chase & Co." Financials, Value, Mega. XOM US/NYSE "Exxon Mobil Corporation" Energy, Dividend, Cost advantage, chain "Oil & Gas" Upstream. PTT TH/SET "PTT Public Company Limited" gics Energy, SET group Resources, Value, Large, theme "พลังงาน", chain "Oil & Gas" Midstream, held with shares and cost unknown. KBANK TH/SET "ธนาคารกสิกรไทย" gics Financials, SET group Financials, Dividend, held 100 x 150.00 THB. NEE US/NYSE "NextEra Energy" Utilities, Defensive, chain "Upstream" Downstream (a chain whose name equals a lane label). NOLENS US/NYSE "No Lens Corp" with every optional lens empty. Lists: "Energy" = {XOM, PTT}; "Core" = {AAPL, KBANK}. Thesis entries on AAPL: buy 2026-01-01, update 2026-02-28, review 2026-11-27 (this one edited later, so it shows the Edited marker). Rate `36.500000` saved 2026-11-20. |
| I18N-A order | Thai collation of the GICS Thai labels (to confirm by running, ICU Thai): การเงิน (Financials), เทคโนโลยีสารสนเทศ (Information Technology), พลังงาน (Energy), สาธารณูปโภค (Utilities); English order: Energy, Financials, Information Technology, Utilities. "Not set" last in both. |
| I18N-B | Two users for isolation. U (saves `th`), V (never saves; a fresh account with no `user_settings` row). |
| I18N-C | 200 stocks, 11 GICS sectors cycled, 8 SET groups on the 60 Thai stocks, 50 held (THB and USD), 12 lists, 20 chains; written through the API. |
| I18N-D | Dates: 2026-01-01, 2026-02-28, 2028-02-29 (leap day, valid when `today` is later in the test through a clock set), 2026-04-15, 2026-12-31, 2026-11-27, plus invalid `2026-02-30`, `2026-13-01`, `26-1-1`, empty. Months: all twelve Thai abbreviations (ม.ค. ก.พ. มี.ค. เม.ย. พ.ค. มิ.ย. ก.ค. ส.ค. ก.ย. ต.ค. พ.ย. ธ.ค.). |
| I18N-E | Browser language lists: `['th-TH']`, `['th']`, `['en-US']`, `['en-GB','th']`, `['th','en']`, `['fr','th']`, `['fr']`, `[]`, `['TH']`, `['zh-TH']`. Stored values: `th`, `en`, `fr`, `TH`, ``, `null`, `{"a":1}`. |
| I18N-F | Problem codes seen by the web: `validation_failed`, `stock_exists`, `list_name_taken`, `already_in_list`, `chain_exists`, `chain_not_found`, `thesis_exists`, `not_found`, `file_too_many_rows`, `unauthenticated`, `auth_unavailable`, `db_unavailable`, plus the unknown `future_code`. Rules: every key of `MESSAGES`, plus unknown `futureRule`. |
| Sentinels | A server `detail` text `ENGLISH-DETAIL-SENTINEL-77` and a thesis note, list name and chain name containing Thai and Latin text, used to prove what is and is not translated. |
| Clock | Real clock for the web; `deps.now` fixed for API cases that need a date. E2E specs of dates run in `Asia/Bangkok`, `America/Los_Angeles` and `Pacific/Kiritimati`. |

## 1. SUT definition

**System under test.** The Thai and English UI slice: the domain vocabulary and rule ids
(`packages/domain/src/i18n/`), the language setting (`app.user_settings.language`, `GET /me`,
`GET|PATCH /settings`), rule ids on problem bodies, the template `?lang=` and its Instructions
sheet, the web i18n layer (`apps/web/src/i18n/`, the switch, `features/settings/save-language.ts`,
every translated page), the Thai font and typography, and the bilingual Supabase email templates.

| Part | Inputs | Outputs | Boundaries and invariants |
|---|---|---|---|
| Domain vocabulary | rule id, params, lens, value, language | text, label, order | `formatRule(...,'en')` equals today's text byte for byte; every `LENS_VALUES` value has a Thai label; free text passes through; default order unchanged |
| `GET /me`, `GET|PATCH /settings` | bearer identity, `{ language: 'en' \| 'th' }` | `language` `en`, `th` or `null` | `null` without a row or value; only the two values; an empty patch writes no row; one user's value never reaches another; a settings read failure does not fail `/me` |
| Problem bodies | any invalid request | `errors[]` with `path`, English `message`, `rule`, optional `params` | `rule` always present (`invalid` when none); top-level `code`s unchanged; API stays English whatever the headers |
| `GET /imports/template.xlsx?lang=` | `en` (default) or `th` | workbook with `Stocks` and `Instructions` or `คำแนะนำ` | Stocks sheet identical in both; `lang` anything else is 400; CSV template ignores `lang`; bearer token still needed |
| i18n store and `t` | detection inputs, saved language, key, params | text, `html lang`, `localStorage` | order: account setting, last used, Thai before English in browser list, English; missing Thai key falls back to English; no key or blank shown; no reload, no navigation, no request other than the save |
| Switch and save | menu or auth-page choice | page in new language, one `PATCH /settings` | current choice sends nothing; failure keeps the language, 10 s toast with Retry; auth pages send nothing |
| Translated pages | any route, dialog, sheet, toast | Thai text, Thai lens labels, Thai dates, plural-free counts | stored, exported, addressed values stay canonical; names, tickers, user text unchanged; AA contrast; 360 px; no clipped Thai marks |
| Thai font | Thai code points | Noto Sans Thai Variable from the app's own origin | Thai subset only; no third-party request; `:lang(th)` line heights |
| Auth emails | recovery and confirmation | one message, Thai then English, same link | each part in `div lang`; subject pair; template variables unchanged |

## 2. Business flow map

- **Happy path (UC-001, UC-002).** Sign in, open the account menu, pick ไทย, see the page change
  at once, keep working in Thai (add and classify a stock, filter, review a thesis), sign in on
  another device and see Thai.
- **Alternative flows (UC-003, UC-004, UC-005).** First visit from a Thai browser; switch on the
  sign-in page; switch with a form half filled; import, export, back up and download templates in
  Thai; read the recovery and confirmation emails.
- **Exception flows.** Save fails (500, network); Thai chunk fails to load; server answers an
  unknown problem code or rule or no `rule` (older API); `localStorage` blocked; `/me` without a
  `language`; two quick switches; second tab; a user with no saved setting on a shared browser.
- **Edge cases.** Same value spelled in a Thai label and a user text (list "Energy", theme
  "พลังงาน", chain "Upstream"); Thai collation against English order; "Not set" last; zero, one
  and many counts; leap day and year-end dates; months 1..12; time zones around midnight; Thai
  marks in truncated select triggers, badges and 360 px headers; 200 stocks; a Thai-label CSV
  upload; `lang=TH`.

## 3. Existing coverage (TC-U-1000..1061 in dev-plan.md, kept as written)

| Task | Ids | What they cover |
|---|---|---|
| T-001 domain | TC-U-1000..1010 | rule encode/decode, English text unchanged, Thai labels for every value, `lensValueLabel` pass-through, ordering with and without `order`, tie order, `SettingsPatch.language`, import rules |
| T-002 API | TC-U-1011..1019 | `/me` null language, save and read back, invalid language 400, empty patch no row, per-user value, `/me` survives a read failure, `rule`/`params` on stock errors, `invalid` for Zod built-ins, import row rules |
| T-003 API | TC-U-1020..1024 | English and Thai Instructions sheets, unknown `lang`, CSV ignores `lang`, Thai template round trip |
| T-004 web foundation | TC-U-1025..1034 | detection, store and Thai chunk, `t` plurals and fallback, `Rich`, `formatDate`, `formatTimestamp`, `describeIssue`, crumbs and titles, English test default, static literal scan |
| T-005 web switch | TC-U-1035..1042 | switch and save, same choice sends nothing, failed save and Retry, account language before render, null account language, form input kept, auth-page switch, `lang` on items and announcement |
| T-006 web shell, auth, stocks | TC-U-1043..1050 | Thai table with English `title`, canonical form values, client and server errors in Thai, Thai sort, holding card counts, auth errors, not-found and error pages |
| T-007 web lists to theses | TC-U-1051..1059 | filter sheet and find box, canonical filter links, concentration labels and tie order, export bytes, template `lang`, import row problems, thesis type and dates, chain lanes, list toasts and Undo |
| T-008 emails | TC-U-1060..1061 | recovery and confirmation email carry both parts and one link |

New unit cases for gaps found while mapping the requirements (section 4):
`TC-U-1062..1068`.

Reused unchanged: the whole existing English suites (they must stay green through every task),
`TC-A-106` Data API checks, the generic motion and contrast suites.

## 4. Unit cases added for gaps (TC-U-1062..1068)

### TC-U-1062
**Unit** · **P1** · PO · covers FR-014, NFR-006, FR-008.
**Pre** `MESSAGES_EN`, `MESSAGES_TH` and the rule parameter list of each key. **Input** iterate
every key. **Expected** both maps have the same keys; each Thai text is non-empty and not equal to
the English text unless the rule has none to translate (listed allow-list is empty); each text
contains exactly the placeholders of its params (`{values}`, `{market}`, `{allowed}`, `{row}`...) in
both languages; no text contains a raw key name. **Mock** none.

### TC-U-1063
**Unit** · **P1** · PO · covers FR-014, NFR-006.
**Pre** the web catalogues `en` and `th`, flattened. **Input** compare. **Expected** identical key
sets (no key in one only); each `{name}` placeholder set equal per key; every plural entry in `en`
has `one` and `other`, in `th` at least `other`; no empty string; no value equal to its own key.
**Mock** none.

### TC-U-1064
**Unit** · **P2** · EP · covers FR-007.
**Pre** the web `collate.ts` with `lang = th`. **Input** compare the Thai labels of I18N-A order,
a Thai label against a Latin label (`พลังงาน` vs `Apple`), identical labels, and "Not set"
(`ยังไม่ระบุ`) against each. **Expected** the four labels order as in I18N-A order; the mixed
comparison is stable and antisymmetric (`compare(a,b) = -compare(b,a)`); "Not set" is placed last
by the helper that wraps `compare` in both directions of a sort; `en` compare unchanged from code
unit order for canonical values. **(proposed)** mixed Thai/Latin order follows the engine's
collator; expectations derive from `new Intl.Collator('th')`, not literals, except the Chromium
fixture of TC-E-1018. **Mock** none.

### TC-U-1065
**Unit** · **P2** · PO · covers NFR-007.
**Pre** the glossary of ux-design.md transcribed as a table in the test (term id, English, Thai).
**Input** look up each term at its catalogue keys (`common.add`, `common.undo`, `nav.stocks`,
`holdings.shares`, ... listed in the test) and in the domain lens maps. **Expected** the Thai
catalogue uses the glossary Thai exactly at those keys; no glossary English term maps to two
different Thai strings across keys of the same concept (for example every "Undo" is `เลิกทำ`, every
"Not set" is `ยังไม่ระบุ`); the tone rule holds: no `ครับ` or `ค่ะ` in any Thai text. **Mock** none.

### TC-U-1066
**Unit** · **P2** · EG · covers FR-005, NFR-007.
**Pre** `LENS_VALUE_LABELS_TH`. **Input** for each lens, collect the Thai labels of its values.
**Expected** labels are unique within a lens, so two stored values never show the same text (for
example GICS `Financials` is `การเงิน` and the SET group `Financials` is `ธุรกิจการเงิน`, in two
lenses); the same English word may map to different Thai in different lenses where the glossary
says so (`Growth` style `เติบโต`, `Cyclical` economic cycle and Lynch both `วัฏจักร`). **Mock** none.

### TC-U-1067
**Unit** · **P2** · PO · covers FR-005.
**Pre** `LENS_LABELS_EN/TH` and `STOCK_FILTERS`. **Input** iterate every key of
`CONCENTRATION_LENSES`, every filter key of `STOCK_FILTERS` (18) and the 16 lens names of the
glossary. **Expected** each has a Thai and an English name; English equals today's name; the 16
glossary names match the glossary Thai exactly; thesis type labels `Buy Sell Update Review` have
Thai `ซื้อ ขาย อัปเดต ทบทวน`. **Mock** none.

### TC-U-1068
**Unit** · **P3** · BVA · covers FR-009.
**Pre** `formatDate` from I18N-D. **Input** `2026-01-01`, `2026-12-31`, `2026-02-28`, `2028-02-29`
in `th` and `en`; then `2026-02-30`, `2026-13-01`, `26-1-1`, `""`. **Expected** `1 ม.ค. 2026` /
`1 Jan 2026`, `31 ธ.ค. 2026` / `31 Dec 2026`, `28 ก.พ. 2026`, `29 ก.พ. 2028` / `29 Feb 2028`;
the year is never `+543` (no `2569`); day has no leading zero; the invalid inputs return the input
text unchanged and never throw **(proposed)**. **Mock** none.

## 5. API, database, script and email cases (TC-A-10xx)

All API cases run through `buildTestApp`/`appFor` (`apps/api/test/db.ts`) on the real local
database with their own random user ids, unless a case says "script" (against the running stack,
`scripts/*.test.ts`). The API never reads a language: every response is English.

### TC-A-1000
**API** · **P1** · EP · covers FR-002, NFR-003.
**Pre** `pnpm db:reset` applied the migration; a `user_settings` row exists from before the
migration for user U (threshold 55, rate `36.500000`). **Input** query `information_schema` and the
row. **Expected** `app.user_settings.language` exists, type `text`, nullable, no default; U's row
reads `language = null` and keeps threshold and rate; a direct `update ... set language = 'xx'`
fails the check constraint (23514); `'en'` and `'th'` succeed; RLS is still on with no policy.
**Mock** none.

### TC-A-1001
**API** · **P1** · EP · covers FR-002.
**Pre** the Drizzle typings. **Input** run `src/db/schema.drift.test.ts`. **Expected** the typing
`language: text('language')` matches `information_schema` (name, type, nullability); removing the
column from the typing makes the drift test fail (mutation check). **Mock** none.

### TC-A-1002
**Script** · **P1** · EP · covers FR-002, NFR-003.
**Pre** local stack, a signed-in user token. **Input** read `app.user_settings` through the Data API
(PostgREST) with the anon key and with the user's token. **Expected** both refuse the table (as
`TC-A-106`); the `language` column is not selectable; only the API's owner role reads it. **Mock**
none.

### TC-A-1003
**API** · **P1** · EP · covers FR-002, FR-003.
**Pre** user U, no row. **Input** `GET /me`; `GET /settings`. **Expected** 200 with `language:
null` in both; `GET /settings` writes no row (count stays 0); a row that exists with `language =
null` (set only the threshold) also reads `null`. **Mock** none.

### TC-A-1004
**API** · **P1** · EP · covers FR-002, FR-003.
**Pre** user U. **Input** `PATCH /settings { language: "th" }`, then `GET /me`, `GET /settings`,
then `PATCH { language: "en" }` and read again. **Expected** the PATCH answers 200 with `language:
"th"` and the existing defaults (`concentrationThreshold: 40`, rate `null`); `/me` and `/settings`
return `th`, then `en` after the second patch; one `user_settings` row exists. **Mock** none.

### TC-A-1005
**API** · **P1** · BVA/EP · covers FR-002, FR-008.
**Pre** user U. **Input** `PATCH /settings` with `language` set to: `"xx"`, `"TH"`, `"En"`,
`" th"`, `"th "`, `""`, `null`, `1`, `true`, `["th"]`, `{}`. **Expected** each is 400
`validation_failed`, `errors[0].path = "language"`, `errors[0].rule = "oneOf"` (for `null` the rule
is `oneOf` or `invalid`, **proposed `oneOf`**: design.md says `null` is not accepted) with `params`
`{ values: ["en","th"] }` where the rule has them, `message` English; no row is created; a stored
value stays as it was. **Mock** none.

### TC-A-1006
**API** · **P2** · EP · covers FR-002.
**Pre** user U with no row. **Input** `PATCH /settings {}`; `PATCH /settings { language: undefined }`
(key absent); `PATCH /settings { language: "th" }`. **Expected** the first two: 200, still no row,
`/me` `language: null`; the third creates the row with the defaults threshold 40 and rate null
(`usdThbRateUpdatedAt` null). **Mock** none.

### TC-A-1007
**API** · **P2** · EP · covers FR-002.
**Pre** user U with threshold 55, rate `36.500000`. **Input** `PATCH { language: "th" }`; then
`PATCH { concentrationThreshold: 60 }`; then `PATCH { usdThbRate: null }`. **Expected** the
language patch changes neither threshold, rate nor `usdThbRateUpdatedAt`; the later patches do not
reset `language` (stays `th`). **Mock** none.

### TC-A-1008
**API** · **P1** · 2U · covers FR-002, NFR-003.
**Pre** users U and V (I18N-B). **Input** U saves `th`; V reads `/me` and `/settings`; V saves
`en`; U reads again. **Expected** V reads `null` before saving and `en` after; U still reads `th`;
two rows; no endpoint accepts a user id. **Mock** none.

### TC-A-1009
**API** · **P1** · EP · covers NFR-003, FR-002.
**Pre** supabase auth mode with locally signed tokens (`test/auth.ts`). **Input** `GET /me`, `GET
/settings`, `PATCH /settings { language: "th" }` and `GET /imports/template.xlsx?lang=th` with: no
header; `Basic x`; garbage bearer; expired token; wrong audience; `anon` role; unknown key.
**Expected** 401 `unauthenticated` each with `WWW-Authenticate: Bearer`, body `requestId`; no row
written; a JWKS outage with no cached key is 503 `auth_unavailable` with `Retry-After: 5`.
**Mock** `createLocalJWKSet`, unreachable JWKS URL for the outage row.

### TC-A-1010
**API** · **P1** · EG · covers FR-002, FR-003.
**Pre** `AppDeps` with the settings repository's `findLanguage` replaced to throw (also a case
with the connection closed). **Input** `GET /me`. **Expected** 200 with the identity fields,
`language: null`, a warning in the log naming the request id and no email or token; `GET /settings`
in the same situation is a 5xx/503 problem (it is not cosmetic). **Mock** repository stub.

### TC-A-1011
**API** · **P1** · EP · covers FR-008, NFR-003.
**Pre** user U. **Input** `GET /openapi.json`. **Expected** `/me` response has `language` enum
`en`,`th` nullable; `/settings` GET and PATCH too; `SettingsPatch` has `language` optional;
`FieldError` schema has `rule` (required) and `params` (optional); `/imports/template.xlsx` has the
query `lang` enum `en`,`th`; every non-public route still declares `bearerAuth`; the document text
stays English. **Mock** none.

### TC-A-1012
**API** · **P1** · PO · covers FR-008.
**Pre** user U. **Input** for each validating stock rule send a request that breaks it:
`POST /stocks` with ticker `""`, `"a b"`, 13 chars; market `XX`; exchange `NASDAQ` for market `TH`;
a lens value not in `LENS_VALUES`; negative shares; unknown key `foo`; name 201 characters;
themes with 41-character tag. **Expected** 400 `validation_failed`; each `errors[]` entry has
`path`, English `message` equal to today's text (`MESSAGES_EN`), `rule` the matching key,
`params` exactly where the rule takes some (`exchangeForMarket`: `{ market, allowed }`, `oneOf`:
`{ values }`); an unknown key reports `path` = that key. **Mock** none.

### TC-A-1013
**API** · **P1** · PO · covers FR-008.
**Pre** user U. **Input** one invalid request for each other validating route: `PATCH /stocks/{id}`
(merged stock invalid), `POST /lists` name `""` and 101 chars, `POST /lists/{id}/stocks` bad body,
`PATCH /settings` threshold 0 and 101 and rate `-1`, `POST/PATCH /stocks/{id}/theses` (note empty,
future date, target price `0`, `"abc"`), `POST /chains/rename` empty `to` and 61 characters, `POST
/imports` options. **Expected** every `errors[]` entry carries `rule` (never absent) and the
English message is unchanged; thesis restore paths keep the `entry.` prefix. **Mock** none.

### TC-A-1014
**API** · **P2** · EG · covers FR-008.
**Pre** user U. **Input** `POST /stocks` with `ticker: 5` (wrong type) and body `[]` and `null`.
**Expected** 400 each, the type issue has `rule: "invalid"` and no `params`; `message` is the
unchanged English Zod text; no stack, no `params` key at all (not `null`). **Mock** none.

### TC-A-1015
**API** · **P1** · PO · covers FR-008.
**Pre** the codes of I18N-F. **Input** trigger each: duplicate stock (409 `stock_exists` with
`existingStockId`), duplicate list name, add twice to a list, rename to an existing chain, restore
twice, other user's id (404), 1,001-row file, missing file, no token. **Expected** every top-level
`code`, `status`, `title` and `detail` equals what the unchanged English suites assert; `rule` only
appears inside `errors[]`; `requestId` present. **Mock** none.

### TC-A-1016
**API** · **P1** · EP · covers FR-008, FR-006.
**Pre** user U with `language` saved as `th`. **Input** repeat TC-A-1012's request with
`Accept-Language: th-TH,th;q=0.9`, and `GET /stocks`, `GET /openapi.json`. **Expected** identical
bodies to the English run (the saved language and the header are ignored): English `message`,
`detail` and `title`; the stock's stored lens values are canonical. **Mock** none.

### TC-A-1017
**API** · **P1** · EP · covers FR-006, FR-011.
**Pre** user U. **Input** `POST /stocks` with `gicsSector: "การเงิน"` (a Thai label) and with
`gicsSector: "Financials"`; `PATCH` with `style: "เติบโต"`; the same through an import file row.
**Expected** the Thai-label requests are 400 with rule `oneOf` and `params.values` holding the
canonical list; the canonical ones are 201/200 and `GET` returns `"Financials"` unchanged; an
import row with a Thai label is a row error (rule `oneOf`) with no row written. **Mock** none.

### TC-A-1018
**API** · **P1** · EP · covers FR-008, FR-011.
**Pre** user U. **Input** `POST /imports/preview` with CSV A missing the `market` column; CSV B with
`AAPL` on rows 2 and 4; CSV C with an unknown column `colour`. **Expected** preview errors `rule:
"columnMissing"` (params `{ column: "market" }` **proposed**), `rule: "repeatsRow"` with `params:
{ row: 2 }`; English `message` equals today's `column is missing` / `repeats row 2 in this file`;
the unknown column is a warning with its own rule and appears in `ignoredColumns` as before.
**Mock** CSV fixtures (`apps/api/test/fixtures/imports/`).

### TC-A-1019
**API** · **P1** · EP · covers FR-012, FR-011.
**Pre** user U signed in. **Input** `GET /imports/template.xlsx` and `?lang=en`. **Expected** 200,
the xlsx content type; two sheets `Stocks` and `Instructions`; the Instructions header row is `Column,
Required, What it takes, Allowed values`, bold and frozen; one row per `TEMPLATE_COLUMNS` entry in
order; allowed values listed as plain canonical values joined by `; `, taken from `LENS_VALUES`
(every enumerated value of every lens column appears); free-text columns say so; the closing note
tells the user to use the English values; both responses are cell-for-cell equal. **Mock** none.

### TC-A-1020
**API** · **P1** · EP · covers FR-012.
**Pre** user U. **Input** `GET /imports/template.xlsx?lang=th`. **Expected** sheets `Stocks` and
`คำแนะนำ`; header `คอลัมน์, จำเป็น, ใส่อะไร, ค่าที่ใช้ได้`; `market` row shows `US — สหรัฐฯ; TH — ไทย`;
`gics_sector` shows `Energy — พลังงาน; Financials — การเงิน; ...` for all 11 values with the
glossary Thai; required column `ใช่`, optional `ไม่`; free text `ข้อความอิสระ`; the note in the
glossary wording; column D wraps; the first sheet in the workbook is `Stocks`. **Mock** none.

### TC-A-1021
**API** · **P1** · EP · covers FR-011, FR-012.
**Pre** the committed CSV template and the XLSX of `lang` default, `en`, `th`. **Input** read the
`Stocks` sheet of each and the CSV template. **Expected** the three Stocks sheets are cell-for-cell
equal (headers, example rows, types) and equal to the CSV template; each imports through
`POST /imports` with 0 errors and the same stocks; the `Instructions` sheets differ only in text.
**Mock** none.

### TC-A-1022
**API** · **P2** · BVA/EP · covers FR-012.
**Pre** user U. **Input** `?lang=` with `xx`, `TH`, `En`, `""`, `th,en`, `th&lang=en`, `%00`, and
`lang=th` twice. **Expected** 400 `validation_failed` for each invalid value with `path: "lang"`,
rule `oneOf`, params `{ values: ["en","th"] }`; no workbook is produced; the repeated valid
parameter follows the framework's rule (**proposed**: 400, as an array is not an enum value).
**Mock** none.

### TC-A-1023
**API** · **P2** · EP · covers FR-011, FR-012.
**Pre** user U. **Input** `GET /imports/template.csv`, `?lang=th`, `?lang=xx`. **Expected** three
byte-identical bodies (BOM and CRLF as today), 200 each (the CSV route ignores the query, even an
invalid one **proposed**); content-disposition filename unchanged. **Mock** none.

### TC-A-1024
**API** · **P1** · EP · covers FR-011.
**Pre** user U with I18N-A (all stocks) and `language` saved as `th` for one run and `en` for the
other (same data in two users with identical rows, or the same user switched between runs).
**Input** `GET /exports/backup.json` and `.csv`. **Expected** the two runs are byte-identical
except the export timestamp field (and the file name date): same columns, canonical values; the
JSON has no `language` key anywhere (settings object has threshold and rate only) and parses with
`Backup` (`formatVersion` 2); the CSV has the 24 `EXPORT_COLUMNS` with English headers. **Mock**
fixed `deps.now`.

### TC-A-1025
**API** · **P2** · EP · covers FR-011.
**Pre** user U. **Input** `GET /exports/backup.json` and `.csv` with `Accept-Language: th`.
**Expected** `Content-Disposition` file names are exactly as before this slice
(`investhesis-backup-<UTC date>.json|csv`); `cache-control: no-store`; no new response headers
about language (no `Content-Language: th`). **Mock** none.

### TC-A-1026
**API** · **P2** · EP · covers NFR-003.
**Pre** user U; an HTTP-intercepting stub on global fetch, `http`, `https` and `net`. **Input** call
`GET /me`, `PATCH /settings { language: "th" }`, `GET /imports/template.xlsx?lang=th` and a
validation failure. **Expected** no outbound connection other than the database (as in
`TC-A-4xx` privacy suites); no translation or font request. **Mock** outbound-call guard.

### TC-A-1027
**API** · **P2** · EP · covers NFR-003, FR-002.
**Pre** logger writing to an in-memory stream. **Input** `PATCH /settings { language: "th" }`, a 400
language error, and a `/me` read failure (TC-A-1010). **Expected** log lines carry the request id,
route and status; they never contain the bearer token, email, threshold or rate; the failure
warning is `warn` level. **Mock** `logStream`.

### TC-A-1028
**API** · **P2** · CC · covers FR-002.
**Pre** user U. **Input** fire `PATCH { language: "th" }` and `PATCH { language: "en" }`
concurrently 20 times, then once more sequentially `th`. **Expected** every call is 200; the stored
value is always one of the two values (never invalid, never a duplicate row); the sequential last
write is what `/me` returns. **Mock** none.

### TC-A-1029
**API** · **P3** · EP · covers FR-002.
**Pre** `AUTH_MODE=mock`, `MOCK_USER_ID` set. **Input** `PATCH /settings { language: "th" }` then
`GET /me`. **Expected** the mock user's row holds `th`; a second mock-mode app instance with another
`MOCK_USER_ID` reads `null`. **Mock** `baseEnv`.

### TC-A-1030
**API** · **P2** · EP · covers NFR-001.
**Pre** a user with I18N-C loaded. **Input** 100 sequential `GET /me` and 100 `PATCH /settings
{ language }`. **Expected** p95 below 200 ms each (logged, brand NFR-001 bar); `/me` adds one
primary-key read (statement count measured with the query log: at most 2 reads in total for `/me`).
**Mock** none.

### TC-A-1031
**Script** · **P1** · UC · covers FR-013, UC-005.
**Pre** local stack restarted with the new `config.toml` (`db:stop`, `db:start`); a confirmed
admin-created user. **Input** request a password recovery for the user, read the message from
Mailpit (`http://127.0.0.1:54324`). **Expected** the subject equals the configured pair
(`รีเซ็ตรหัสผ่าน Investhesis / Reset your Investhesis password`); the HTML has two `div` parts with
`lang="th"` first and `lang="en"` second, each with its own `h2` and a button text; both parts link
to the same URL (the single `{{ .ConfirmationURL }}` value, 2 anchors with identical `href`); the
plain-text part (if any) carries the link once or twice, identical. **Mock** Mailpit.

### TC-A-1032
**Script** · **P1** · UC · covers FR-013, UC-005.
**Pre** an admin-created unconfirmed user. **Input** resend the confirmation, read the email.
**Expected** same structure as TC-A-1031 with the confirmation headings and subject pair; the link
is a `token_hash` link of type `signup`/`email`. **Mock** Mailpit.

### TC-A-1033
**Script** · **P1** · UC · covers FR-013.
**Pre** the emails of TC-A-1031 and 1032. **Input** follow the link from the Thai part and, in a new
user, the link from the English part. **Expected** both complete the flow exactly as the existing
email-link tests (the account is confirmed, the recovery lets the password be reset); the links are
equal strings. **Mock** none.

### TC-A-1034
**Script** · **P2** · EP · covers FR-013, NFR-003.
**Pre** `supabase/templates/confirmation.html`, `recovery.html`, `supabase/config.toml`,
`supabase/README.md`. **Input** read the files. **Expected** the only template variable is
`{{ .ConfirmationURL }}` (or the ones the files used before); no `<img>`, `<link>`, `@import` or
`http(s)://` URL to a third-party host (no remote font or image); both `lang` divs present; the
subjects in `config.toml` are the Thai / English pairs; the hosted checklist in `supabase/README.md`
has the step "paste the same templates and subjects". **Mock** none.

### TC-A-1035
**Script** · **P2** · EG · covers FR-013, FR-010.
**Pre** the HTML of the recovery email. **Input** parse it. **Expected** the Thai text is not
mojibake (UTF-8 charset declared, round-trips through Mailpit); `<html>` has no conflicting `lang`;
heading order is `h2` Thai then `h2` English; the Thai wording follows the glossary
(`รีเซ็ตรหัสผ่าน`). **Mock** Mailpit.

### TC-A-1036
**Script** · **P3** · EP · covers FR-002, NFR-003.
**Pre** a migration test database populated with users, stocks, holdings, theses and settings
(the pattern of `scripts/theses-integration.test.ts`). **Input** apply the language migration to
it. **Expected** it succeeds on the populated data, every existing row keeps its values, new
column null everywhere, a second `db:reset` is idempotent, the earlier API suites pass unchanged.
**Mock** none.

## 6. Component and static cases (TC-C-10xx)

Component cases use Testing Library with `renderApp(path, stubApi, { language })`, `StubApi`
(`src/test/stub-api.ts`, default `/me` `language: null`), `FakeAuthClient`, `FakeStorage` for
`localStorage`, and a request log on `StubApi` (every call). "Thai" means the store set to `th`
before the render. The static cases scan sources or the build output.

#### Detection, storage and boot

### TC-C-1000
**Component** · **P1** · DT · covers FR-003, UC-003.
**Pre** `App` booted with `FakeStorage` and a stubbed `navigator.languages` (I18N-E), signed out.
**Input** boot with each row: storage `null` and `['th-TH']`; `['th']`; `['en-US']`; `['en-GB','th']`;
`['th','en']`; `['fr','th']`; `['fr']`; `[]`; `['TH']`; `['zh-TH']`; storage `th` with `['en-US']`;
storage `en` with `['th']`. **Expected** language shown: Thai, Thai, English, English, Thai, Thai
(first Thai/English tag decides, others skipped **proposed**), English, English, Thai, English,
Thai, English; `html lang` equals it; the sign-in heading reads `เข้าสู่ระบบ` or `Sign in`. **Mock**
`FakeStorage`, `navigator.languages`.

### TC-C-1001
**Component** · **P2** · EG · covers FR-003.
**Pre** storage values `fr`, `TH`, empty string, `null`, `{"a":1}`, a 10 KB string. **Input** boot
with browser `['th']` for each. **Expected** every invalid stored value is ignored (Thai from the
browser, not the stored junk); nothing throws; the bad value is replaced by a valid one on the next
switch. **Mock** `FakeStorage`.

### TC-C-1002
**Component** · **P2** · EG · covers FR-003, FR-001.
**Pre** `localStorage.getItem` and `setItem` both throw (blocked storage), browser `['th']`.
**Input** boot, sign in (fake), switch to English, switch to Thai. **Expected** no error reaches the
user or the console as an unhandled exception; boot uses the browser list; switches work for the
session; reload starts from the browser list again. **Mock** throwing storage.

### TC-C-1003
**Component** · **P1** · DT · covers FR-003, UC-001.
**Pre** signed-in `FakeAuthClient`, `/me` stub answers `language` `th` | `en` | `null`; storage `en`
| `th` | empty; browser `['en-US']` | `['th']`. **Input** open `/stocks` for each combination.
**Expected** a non-null account language always wins and is written to storage; `null` keeps what
detection gave and writes nothing to storage or the API; the page never renders in the losing
language first (render log). **Mock** `StubApi`, `FakeStorage`.

### TC-C-1004
**Component** · **P2** · ST · covers FR-003, UC-003.
**Pre** signed in with account `th`. **Input** sign out through the menu, then open `/auth/sign-in`.
**Expected** the sign-in page is in Thai (the last language stays in storage); then switch to
English on the page and reload: English. **Mock** `FakeAuthClient`.

### TC-C-1005
**Component** · **P2** · ST · covers FR-003 (OQ-1).
**Pre** user A signed in with account `th`, signs out; user B (account `null`) signs in on the same
browser. **Input** open `/stocks`. **Expected** B sees Thai (the language shown before sign-in), no
`PATCH` sent; B's first switch to English sends one `PATCH { language: "en" }`. **(proposed)** a
shared browser leaks the previous user's choice only as a display language. **Mock** `StubApi` per
user.

### TC-C-1006
**Component** · **P1** · EP · covers FR-003, FR-002.
**Pre** older API: `/me` answers no `language` key at all; and a `/me` answering `language: "fr"`.
**Input** open `/stocks`. **Expected** both are treated as `null`: the browser-derived language is
kept, no crash, nothing written. **Mock** `StubApi`.

### TC-C-1007
**Component** · **P1** · EP · covers FR-003, FR-010.
**Pre** Thai chosen at boot. **Input** record every render and the `document.documentElement.lang`
at the first paint. **Expected** the first rendered tree is already Thai (the chunk is awaited
before the first render; no English flash, ADR-004); `html lang` is `th` before the first paint.
**Mock** render spy.

#### The switch

### TC-C-1008
**Component** · **P1** · EP · covers FR-001, NFR-004.
**Pre** `/stocks` signed in, English. **Input** open the account menu. **Expected** after the
Account item and a separator the group label `ภาษา · Language` (always bilingual, `text-xs`,
muted), then two `menuitemradio` items `ไทย` (`lang="th"`) and `English` (`lang="en"`) with
`aria-checked` true on the current one; Sign out follows after a separator; the item texts are the
same in both UI languages. **Mock** `StubApi`.

### TC-C-1009
**Component** · **P1** · UC · covers FR-001, NFR-004.
**Pre** the menu open. **Input** keyboard only: Tab to the account trigger, Enter, ArrowDown to
`ไทย`, Enter; then reopen and press Escape. **Expected** the language changes on Enter; the menu
closes and focus is on the trigger (the next Tab goes where it would have gone); Escape closes and
returns focus to the trigger; no pointer event is used. **Mock** `userEvent`, no pointer.

### TC-C-1010
**Component** · **P2** · EP · covers NFR-004, FR-001.
**Pre** English page. **Input** switch to Thai, then to English, then pick English again.
**Expected** a polite live region says `ภาษาไทย` once after the first switch and `English` once
after the second; nothing is announced for the repeat pick or on first load; the toaster's region
is not used; `role="status"`. **Mock** none.

### TC-C-1011
**Component** · **P1** · EP · covers FR-001, FR-010.
**Pre** a page open. **Input** switch en to th to en. **Expected** `document.documentElement.lang`
follows (`th`, `en`); `localStorage['investhesis.language']` follows; the address (`location`) is
identical before and after; the router's navigation count is unchanged (no navigation); no loader
ran again; the request log has exactly the one `PATCH /settings` per switch and no `GET`. **Mock**
`StubApi` request log, `FakeStorage`.

### TC-C-1012
**Component** · **P1** · EP · covers FR-001, UC-003.
**Pre** `FakeAuthClient.signedOut()`, `/auth/sign-in`, each of `/auth/forgot-password`,
`/auth/check-email`, `/auth/link-expired`, `/auth/reset-password` (recovery session). **Input**
click `ไทย` then `English` in the inline switch. **Expected** the buttons sit in a `role="group"`
labelled `ภาษา · Language`; the current one has `aria-pressed="true"` and `secondary` style; each
carries its own `lang`; the heading, labels and the decorative panel text change; no request sent;
the email typed into the sign-in field is still there. **Mock** `FakeAuthClient`, request log.

### TC-C-1013
**Component** · **P2** · EP · covers FR-001.
**Pre** mock mode (`VITE_AUTH_MODE=mock`), a user. **Input** switch. **Expected** one `PATCH
/settings` (the mock user), guards never redirect, the session state is untouched. **Mock**
`createRoutes` with the mock client.

#### Saving the choice

### TC-C-1014
**Component** · **P1** · DT · covers FR-002, UC-001.
**Pre** `PATCH /settings` stub answers, in turn: 500; network failure (status 0); 400; 401 then a
refreshed token; 200. **Input** switch to Thai once per answer. **Expected** the Thai page stays in
every case (no rollback), storage holds `th`; the failures raise a toast `บันทึกภาษาไม่สำเร็จ` /
`จะใช้ภาษาไทยบนอุปกรณ์นี้ต่อไป` with a `ลองอีกครั้ง` action, `duration` 10000; the 401 follows the
api-client refresh once and, when the retry succeeds, shows no toast; 200 shows no toast at all.
**Mock** `StubApi` scripted answers, `vi.mock('sonner')`.

### TC-C-1015
**Component** · **P1** · ST · covers FR-002.
**Pre** the first `PATCH` failed, the toast is shown. **Input** press Retry (stub now 200); in a
second case press Retry while the stub still fails twice. **Expected** Retry repeats the same
`PATCH { language: "th" }`; success shows no toast and keeps Thai; a second failure shows a new
failure toast with Retry again; there is never more than one request in flight per press.
**Mock** `StubApi`.

### TC-C-1016
**Component** · **P2** · ST · covers FR-002.
**Pre** a failed save for Thai, toast on screen. **Input** switch to English (stub 200), then press
the old toast's Retry. **Expected** **(proposed)** Retry sends the language now on screen
(`en`), never an old value, so the account ends as the screen shows; the old toast text, if still
visible, stays in its original language. **Mock** `StubApi`.

### TC-C-1017
**Component** · **P2** · CC · covers FR-002, FR-001.
**Pre** the `PATCH` stub resolves after a delay that reverses the order of answers. **Input** switch
th, en, th quickly (3 clicks within one tick pair). **Expected** the screen ends Thai after the
last click at once (not waiting for any answer); the last request sent is `th`; a late answer to an
earlier request does not change the screen, storage or raise a toast. **Mock** delayed `StubApi`.

### TC-C-1018
**Component** · **P2** · EP · covers FR-002.
**Pre** `/me` `null`. **Input** open the app and navigate three pages without switching. **Expected**
no `PATCH` and no write to `/settings` in the request log (OQ-1: nothing written on first sign-in);
the first switch writes one. **Mock** request log.

### TC-C-1019
**Component** · **P2** · EP · covers FR-002.
**Pre** `/settings` read by `/concentration` returns `language`. **Input** open the Settings dialog
and save a new threshold in Thai. **Expected** the `PATCH` body holds only `concentrationThreshold`
(not `language`); the language is unchanged. **Mock** `StubApi`.

#### Typed input is kept (FR-001)

### TC-C-1020
**Component** · **P1** · EP · covers FR-001, UC-002.
**Pre** `/stocks/new` in English. **Input** type ticker `AAPL`, name `Apple Inc.`, pick market `US`,
sector `Energy`, tick `I hold this stock`, type shares `10`, add theme `AI`, scroll; switch to Thai;
switch back. **Expected** every value, the checked box, the chosen options (now showing Thai
labels, same canonical values), the tag, the scroll position, and the focused field survive both
switches; no field is reset; no validation error appears that was not there; field labels and
placeholders are Thai. **Mock** `StubApi`.

### TC-C-1021
**Component** · **P1** · EP · covers FR-001.
**Pre** each dialog open with typed content: Thesis dialog with a 500-character note and a
target price `180.5`; Holding dialog with shares and cost; List name dialog with `Energy`;
Chain rename dialog with `ai & semis`; Settings dialog with threshold `55`; the stock delete
confirm open. **Input** switch language with the dialog open (the menu is outside; use the store or
a second trigger as the page allows). **Expected** the dialog stays open, its typed text and
selection are intact, the focus stays, its labels, buttons and hints change language; the
validation error already shown (if any) is re-rendered in the new language. **Mock** `StubApi`.

### TC-C-1022
**Component** · **P2** · EP · covers FR-001.
**Pre** `/import-export` with a file chosen and the preview step shown (`review`), then the done
step. **Input** switch. **Expected** the chosen `File` object, the duplicate mode, the target list
and the preview table survive; step texts, buttons and the status note change language; no new
preview request is sent. **Mock** `StubApi`, `File`.

### TC-C-1023
**Component** · **P2** · EP · covers FR-001.
**Pre** `/stocks?market=TH&q=pt` with the Filters sheet open and `Financ` typed in its find box,
three options ticked. **Input** switch. **Expected** the address is unchanged; the sheet stays open;
the ticks, the search text and the find text are unchanged; the result line and section headings
change language. **Mock** `StubApi`.

#### Whole-page coverage in Thai

### TC-C-1024
**Component** · **P1** · PO · covers FR-004, NFR-005, UC-002.
**Pre** I18N-A, Thai. **Input** render each signed-in route and run the Thai residue scan:
`/stocks` (filled and empty), `/stocks/new`, `/stocks/:id` (held, not held, with theses, with no
theses), `/stocks/:id/edit`, `/lists` (filled, empty), `/lists/:id` (filled, empty),
`/concentration` (each lens group, empty, rate missing), `/chains` (filled, empty), `/import-export`
(each wizard step), the not-found page, the route error boundary, the page skeleton. **Expected**
the residue list is empty for every page; no text node equals a catalogue key (`stocks.title`);
tab title is `<ชื่อหน้า> · Investhesis`. **Mock** `StubApi`, I18N-A.

### TC-C-1025
**Component** · **P1** · PO · covers FR-004, UC-003.
**Pre** Thai, `FakeAuthClient.signedOut()`. **Input** render `/auth/sign-in` (with an error),
`/auth/forgot-password` (sent and unsent), `/auth/check-email` (with `justSent`), `/auth/link-expired`
(email, recovery, unknown), `/auth/reset-password` (form, invalid, same password), `/auth/confirm`
(the `HydrateFallback` `ConfirmingScreen`), `/auth/anything` (not found). **Expected** the residue
scan is empty (the allow-list holds `Investhesis`); the password strength and match messages are
Thai; the 60 s cooldown text is Thai; `AuthHeading` sets the Thai title and focuses the `h1`.
**Mock** `FakeAuthClient`.

### TC-C-1026
**Component** · **P1** · PO · covers FR-004.
**Pre** Thai, I18N-A. **Input** open each dialog, sheet, menu, popover and command list the app
has (add stock, delete stock, add to list, holding, thesis add/edit/delete, list create, rename,
delete, add-stock picker, chain rename and merge, concentration settings, filter sheet, export
menu, account menu, sidebar sheet at phone width, the wizard's confirm). **Expected** the residue
scan is empty for every one, including the title, description, close button label and
`aria-label`; the empty-picker text and `ไม่พบตัวเลือก` for a no-match find. **Mock** `StubApi`.

### TC-C-1027
**Component** · **P1** · PO · covers FR-004, NFR-004.
**Pre** Thai. **Input** collect every `aria-label`, `aria-description`, `aria-valuetext`,
`placeholder`, `title`, `alt`, screen-reader-only text (`.sr-only`) and every `role="status"` /
`aria-live` message on the pages of TC-C-1024 and 1026. **Expected** none contains an English
sentence (residue scan); the Filters button name is `ตัวกรอง 2 รายการที่ใช้อยู่` style (the visible
word plus the Thai screen-reader suffix); sort buttons, the sidebar trigger, `Close` and pagination
labels are Thai. **Mock** `StubApi`.

### TC-C-1028
**Component** · **P2** · PO · covers FR-004.
**Pre** each toast source, Thai (`vi.mock('sonner')` capturing calls). **Input** run: stock saved,
"No changes to save", stock deleted with Undo, added to list with Undo, removed from list with
Undo, list created, renamed, deleted, import done, thesis saved, deleted with Undo, holding
cleared with Undo, chain renamed, merged, settings saved, backup downloaded, clipboard copied,
sign-in session ended, language save failed. **Expected** every message and action label is Thai
(`เลิกทำ` for Undo, `ลองอีกครั้ง` for Retry) with the right counts; the language in force when the
action ran decides the text; a toast already on screen keeps its text when the language changes
**(proposed)**. **Mock** `vi.mock('sonner')`.

### TC-C-1029
**Component** · **P1** · PO · covers FR-004.
**Pre** both languages. **Input** render the count and plural strings for 0, 1, 2, 12, 1,000 and
1,000,000 in: stock count, list count, thesis entries, groups, "stocks changed", import results,
filter result line, "N held", delete stock "also deletes its N thesis entries", chain counts.
**Expected** English `0 stocks`, `1 stock`, `2 stocks`, `1,000 stocks` (group separator);
Thai `0 หุ้น`, `1 หุ้น`, `2 หุ้น`, `1,000 หุ้น` with one form only; units follow the glossary
(`3 รายการ` for lists items); never `1 stocks`, never `{count}` left in the text. **Mock** none.

### TC-C-1030
**Component** · **P2** · PO · covers FR-004.
**Pre** Thai. **Input** render the breadcrumb and tab title of every route with params: `/stocks/:id`
(ticker), `/stocks/:id/edit`, `/lists/:id` (list name), `/chains`, `/import-export`, not found.
**Expected** the crumb is the translated label or the stored ticker or list name, never the Thai
translation of those; `document.title` is `<page> · Investhesis`; after a language switch on the
page the crumb and title change without re-running the loader. **Mock** `StubApi`.

#### Values, labels and what is not translated

### TC-C-1031
**Component** · **P1** · PO · covers FR-005, NFR-007.
**Pre** a stock for each value of each lens, Thai. **Input** for every `LENS_VALUES` value render:
the stocks table cell, the stock page card, the form option, the filter sheet option, the
concentration group name, the value chain lane (position values), the thesis type. **Expected** each
shows the glossary Thai label (`LENS_VALUE_LABELS_TH`); table badges and form options carry the
canonical English value in `title` (hover text); the English page shows the canonical value and no
`title`; `Not set` is `ยังไม่ระบุ`, italic and last in the sheet. **Mock** `StubApi`.

### TC-C-1032
**Component** · **P1** · EG · covers FR-005, UC-002.
**Pre** I18N-A with the list `Energy`, the theme `พลังงาน`, the chain `Upstream` (position
Downstream), a company name `ธนาคารกสิกรไทย`, a thesis note `Buy more พลังงาน`, Thai. **Input**
render table, list page, chains page, thesis log. **Expected** the list name, theme, chain name,
company name and note appear exactly as stored; the lane headers are `ต้นน้ำ`, `กลางน้ำ`,
`ปลายน้ำ` while the chain named `Upstream` keeps that name; the market badges show `US`/`TH`,
exchanges `NASDAQ`, `SET`, currency `USD`, `THB`, index names as stored; user text carries no `lang`
attribute. **Mock** `StubApi`.

### TC-C-1033
**Component** · **P2** · EP · covers FR-005, FR-004.
**Pre** Thai. **Input** a stock with every holding state: not held, held with unknown amounts, held
with figures, USD and THB cost. **Expected** the card says `ไม่ได้ถือ`, `ถืออยู่`, with
`จำนวนหุ้น`, `ต้นทุนเฉลี่ย`, `ต้นทุน`, `สกุลเงินต้นทุน` labels; figures `10`, `฿12.50`, `$150.00`,
cost `฿1,250.00` are byte-identical to English; the "Held" column sorts the same. **Mock**
`StubApi`.

### TC-C-1034
**Component** · **P1** · BVA · covers FR-007, UC-002.
**Pre** I18N-A order, Thai. **Input** sort the GICS column ascending and descending, with a stock
with no sector. **Expected** ascending: การเงิน, เทคโนโลยีสารสนเทศ, พลังงาน, สาธารณูปโภค, then Not
set; descending reverses the four and keeps Not set last **(proposed: Not set stays last in both
directions, as today's behaviour)**; ties break by ticker; English order is Energy, Financials,
Information Technology, Utilities. Expected order derives from `Intl.Collator('th')` (TC-U-1064).
**Mock** `StubApi`.

### TC-C-1035
**Component** · **P1** · EP · covers FR-007, FR-005.
**Pre** Thai, `/stocks` with `gicsSector` options. **Input** open the filter sheet. **Expected** the
GICS options are ordered by Thai label and collator, each checkbox named `<ป้ายกำกับ>, <N> หุ้น`;
`ยังไม่ระบุ, N หุ้น` last and italic; the 18 sections are in `STOCK_FILTERS` order with Thai
headings; the find box placeholder is `ค้นหาตัวเลือก`; typing `การเงิน`, `Financials` and `fin`
each leaves the Financials option; `xyz` shows `ไม่พบตัวเลือก`; the find is case-insensitive for
Latin. **Mock** `StubApi`.

### TC-C-1036
**Component** · **P2** · EP · covers FR-007.
**Pre** `/concentration` Thai, lens GICS, two groups of equal count (Energy, Financials).
**Input** render. **Expected** the tie order follows the Thai label (`การเงิน` before `พลังงาน`);
otherwise groups are ordered by size first; `Over 40%` is `เกิน 40%`; the `groupChains` order on
`/chains` is unchanged by language (chain names are not translated). **Mock** `StubApi`.

### TC-C-1037
**Component** · **P1** · EP · covers FR-006, UC-004.
**Pre** Thai; `/stocks`. **Input** tick `พลังงาน` (Energy) and `ยังไม่ระบุ` in the sheet; tick a market;
sort the table. **Expected** the address holds canonical values only: `gicsSector=Energy` and
`gicsSector=` (empty = Not set), `market=US`, `sort=gicsSector&dir=desc`; no Thai text and no `%E0`
percent-encoded Thai appears in `location.search`; the link in the concentration and chains pages
(`concentrationHref`, `chainStocksHref`, the no-chain link) is canonical too; loading that address
in English selects the same options. **Mock** `StubApi`.

### TC-C-1038
**Component** · **P2** · EG · covers FR-006.
**Pre** Thai. **Input** open `/stocks?gicsSector=พลังงาน&gicsSector=Energy&utm_source=x`. **Expected**
the Thai value is a bad part of the address: dropped with one translated note (`AddressNotes`),
`Energy` is applied, the address is not rewritten, `utm_source` is ignored silently. **Mock**
`StubApi`.

### TC-C-1039
**Component** · **P1** · EP · covers FR-006.
**Pre** I18N-A, Thai, `/stocks`. **Input** search `AAPL`, `apple`, `พลังงาน`, `AI`, `Energy`,
`การเงิน`, `Financials`. **Expected** ticker, name and themes match as typed (`AAPL`, `apple`, `AI`
and the theme `พลังงาน` match PTT); `Energy` and `Financials` as text match only stocks whose ticker,
name or themes contain them, never by sector label; `การเงิน` matches only if a name or theme has
it (KBANK's name does not contain it); the result line is Thai and a no-match state is Thai.
**Mock** `StubApi`.

### TC-C-1040
**Component** · **P1** · PO · covers FR-009.
**Pre** I18N-D, both languages. **Input** render a thesis entry and its `Edited` date, the settings
dialog's rate updated date, and the import result date line for each date; and a timestamp
`2026-11-27T17:30:00Z` and `2026-11-27T23:59:59Z` under `TZ=Asia/Bangkok` and `TZ=America/Los_Angeles`.
**Expected** `27 พ.ย. 2026` / `27 Nov 2026` style for every date; the Thai month for 1..12 is
correct; no year `2569`; timestamps use the browser-local date (`28 พ.ย. 2026` at 17:30Z in
Bangkok, `27 พ.ย. 2026` in Los Angeles); the `<input type="date">` value stays `YYYY-MM-DD` in
both languages. **Mock** `TZ`, fixed clock.

### TC-C-1041
**Component** · **P2** · EP · covers FR-009.
**Pre** Thai and English. **Input** render shares `1234.5`, cost `1234567.8912`, value `฿175,200.00`,
price `$1,234.56`, rate `36.500000`, percent `35.4%`, threshold `40`. **Expected** Arabic digits,
`,` group and `.` decimal, `$` and `฿` in both languages, no Thai digits, and the same strings as
English (`lib/number-format.ts` unchanged); no float conversion (a 20-digit decimal keeps every
digit). **Mock** none.

#### Errors in the chosen language (FR-008)

### TC-C-1042
**Component** · **P1** · PO · covers FR-008, NFR-007.
**Pre** Thai. **Input** drive each client check to every rule of `MESSAGES` in its forms: stock form
(ticker, name, market, exchange for market, lens values, tags), holding (shares, cost, currency),
thesis (note, date, target price, invalidation), list name, chain rename, settings (threshold,
rate), the new password rules. **Expected** the field error is `<Thai field label> <Thai rule
text>` from `describeIssue`, in the glossary terms, with the field `aria-invalid` and the message
linked by `aria-describedby`; the Thai text equals `MESSAGES_TH` with its params filled; switching
language re-renders the same error in the other language without clearing it. **Mock** none.

### TC-C-1043
**Component** · **P1** · PO · covers FR-008.
**Pre** Thai, stubs answering with the codes of I18N-F (and the actions' own messages). **Input**
trigger each code in the place the app handles it (stock create, list create/rename, add twice,
chain rename, thesis restore, file upload, session end, API down). **Expected** each shows its Thai
catalogue text (for `stock_exists` the link to the existing stock stays), never the English
`detail`; `validation_failed` shows the per-field messages from `rule`. **Mock** `StubApi`.

### TC-C-1044
**Component** · **P1** · EG · covers FR-008, NFR-005.
**Pre** Thai. **Input** the API answers 400 with `errors[]` entries: an unknown `rule: "futureRule"`;
no `rule` (older API); `rule: "invalid"`; an unknown top-level `code: "future_code"`; a body that
is not a problem document; `detail: "ENGLISH-DETAIL-SENTINEL-77"` in each. **Expected** the field
shows the generic Thai message (`errors.invalidField`) and stays highlighted (`aria-invalid`); the
unknown code shows the generic Thai problem text; the sentinel text never appears in the DOM; the
form keeps the typed values. **Mock** `StubApi`.

### TC-C-1045
**Component** · **P2** · EP · covers FR-008, UC-004.
**Pre** Thai, `/import-export`. **Input** preview stubs: row errors with each rule (`repeatsRow`
`{ row: 2 }`, `columnMissing`, `oneOf`, `tickerFormat`), warnings, `ignoredColumns` and the 422
`file_too_many_rows`; then confirm results. **Expected** every row problem, warning, status note
and result count is Thai with the params filled (`แถวที่ 2`); the error-rows CSV built by
`buildErrorCsv` is byte-identical to the English run (canonical headers, English messages as the
file's text **proposed**: the file stays language-neutral per FR-011). **Mock** `StubApi`.

#### Fallback, loading and failure (FR-014)

### TC-C-1046
**Component** · **P1** · EG · covers FR-014, NFR-006.
**Pre** Thai, with the Thai catalogue mocked to lack the key `stocks.emptyTitle`, a nested key and a
plural entry. **Input** render `/stocks` (empty). **Expected** the English text appears in place of
each missing one; never the key, `undefined`, `[object Object]` or an empty string; no exception;
the rest of the page is Thai. **Mock** catalogue override.

### TC-C-1047
**Component** · **P2** · EG · covers FR-014, FR-001.
**Pre** the `import('./catalogue/th.ts')` promise rejects (chunk fails). **Input** switch to Thai;
boot with stored `th`. **Expected** **(proposed)** the language stays English, the store does not
flip to a half-loaded state, `html lang` stays `en`, a failed save is not attempted for a language
that did not apply, the app does not crash and the switch can be retried; boot with stored `th`
falls back to English without a blank screen. **Mock** failing dynamic import.

### TC-C-1048
**Component** · **P1** · EP · covers FR-014, NFR-006.
**Pre** the catalogues. **Input** run the parity checks of TC-U-1063 and 1062 as part of `pnpm test`,
and a negative check: a temporary fixture file that adds a key to `en` only, one that adds a key to
`th` only, and one with a misspelt key at a call site, compiled with `tsc -b --noEmit`. **Expected**
the real catalogues pass; each fixture makes `tsc` fail with an error naming the key (typed keys,
`satisfies Catalogue`); the fixtures are removed after the run. **Mock** temp files.

#### Exports and files (FR-011, FR-012)

### TC-C-1049
**Component** · **P1** · EP · covers FR-011, UC-004.
**Pre** the same two stocks (I18N-A subset). **Input** in English then in Thai: the export menu CSV
(`csvOfRows`), the clipboard (`tableOfRows`, `navigator.clipboard.writeText` mock) and the backup
buttons (`/exports/backup.json|.csv` via the stub). **Expected** the CSV bytes, clipboard text and
requests are identical across the languages (BOM, CRLF, canonical headers and values, `lists`
column canonical); file names unchanged (`investhesis-stocks-<local date>.csv`); only the menu
items, the toast and the card text are Thai. **Mock** `StubApi`, clipboard mock.

### TC-C-1050
**Component** · **P1** · EP · covers FR-012, UC-004.
**Pre** `/import-export` Thai. **Input** read the template card; click `ดาวน์โหลด XLSX` and the CSV
button. **Expected** the help text says `ไฟล์ XLSX มีชีตคำแนะนำ`; the XLSX request is `GET
/imports/template.xlsx?lang=th`; after switching to English it is `?lang=en`; the CSV request has
no `lang` and the same URL in both languages; `saveFile` names are unchanged. **Mock** `StubApi`
(`"DOWNLOAD /path"`).

### TC-C-1051
**Component** · **P2** · EP · covers FR-004, FR-005.
**Pre** Thai; stock page with theses. **Input** add an entry of each type, edit one, delete with
Undo. **Expected** types show `ซื้อ ขาย อัปเดต ทบทวน`; the `แก้ไขแล้ว` marker with a Thai date; the
note and invalidation are shown as typed (a Thai/English note round-trips); the dialog body sends
the canonical `type` (`buy`) in `payload`; the focus rules are unchanged. **Mock** `StubApi`.

### TC-C-1052
**Component** · **P2** · EP · covers FR-004, FR-005, FR-007.
**Pre** Thai, VC-A like data. **Input** open `/chains` and the rename dialog (plain and merge).
**Expected** headings, counts, lane names, the `Also spelled:` line, left-out line, the hint with
the stock count, the merge question and Back are Thai; the chain titles and spellings are as stored;
`/chains` order of equal-size chains is the same in both languages. **Mock** `StubApi`.

#### No-request rule and speed (NFR-001)

### TC-C-1053
**Component** · **P1** · EP · covers NFR-001, FR-006.
**Pre** I18N-A, Thai, request log reset after load. **Input** on `/stocks`, `/lists/:id`,
`/concentration` and `/chains` change: search text, a filter tick, the sort, the scope, the lens
and measure; switch language. **Expected** the request log gains nothing for the first group
(`revalidateOnSubmitOrPathChange`); the language switch adds exactly one `PATCH /settings` and no
`GET`. **Mock** request log.

### TC-C-1054
**Component** · **P2** · EP · covers NFR-001.
**Pre** I18N-C (200 stocks) loaded in `StubApi`, `/stocks`. **Input** switch `en` to `th` five
times, measuring from the dispatch of `setLanguage` to the commit with the Thai header text
present (`performance.now` around `flushSync`). **Expected** every sample below 200 ms; the median
and max are logged; jsdom is slower than a browser, so this is a regression guard, and TC-E-1032 is
the faithful measure. **Mock** none.

### TC-C-1055
**Component** · **P2** · EP · covers NFR-001.
**Pre** I18N-C, Thai. **Input** type a search, tick a filter, change the lens on `/concentration`.
**Expected** each change commits in under 200 ms (logged); the table renders 200 rows or the
virtual window as before; labels come from the memoised lookup (the `lensValueLabel` call count per
render does not exceed the number of distinct values × lens, **proposed**). **Mock** none.

#### Static checks

### TC-C-1056
**Static** · **P1** · PO · covers FR-004, NFR-006.
**Pre** `apps/web/src/**` excluding tests and `components/ui/` generated parts. **Input**
run `features/**/i18n-static.test.ts`, which scans JSX text, string-literal children and the
attributes `aria-label`, `aria-description`, `placeholder`, `title`, `alt`, `label`, `description`,
and call arguments of `toast*`, `document.title` and `new Error` shown to users. **Expected** no
English literal outside the allow-list (brand, codes, `data-testid`, class names, route paths,
`lang` values, CSS values); a fixture with `<p>Hello</p>` and `aria-label="Close"` fails the scan
(TC-U-1034); the allow-list file is small and each entry has a comment. **Mock** none.

### TC-C-1057
**Static** · **P2** · EP · covers FR-009.
**Pre** the web sources. **Input** scan for `toLocaleDateString`, `toLocaleTimeString`,
`toLocaleString(` on dates, `Intl.DateTimeFormat`, `th-TH`, `-u-ca-`, `getFullYear() + 543`.
**Expected** none outside `format-date.ts`; every date shown goes through `formatDate` or
`formatTimestamp`; number formatting still goes through `lib/number-format.ts`. **Mock** none.

### TC-C-1058
**Static** · **P1** · EP · covers NFR-003, FR-010.
**Pre** `index.css`, `package.json`, `index.html`, the sources. **Input** scan. **Expected** the
font comes only from `@fontsource-variable/noto-sans-thai` imported through `thai.css`; no
`fonts.googleapis.com`, `fonts.gstatic.com`, `@import url(http`, `<link rel="preconnect">` to a
third party, `https://` in `font-src`; no translation service import; the only outbound hosts in
the sources are the API base and Supabase (`filter-static.test.ts` style); `--font-sans` is
`Geist, 'Noto Sans Thai Variable', ui-sans-serif, sans-serif, system-ui`. **Mock** none.

### TC-C-1059
**Static** · **P1** · EP · covers FR-010, NFR-005.
**Pre** `index.css` and the components named in ux-design.md. **Input** read the CSS custom
properties under `:root:lang(th)`. **Expected** line heights `xs 1.125rem`, `sm 1.375rem`,
`base 1.625rem`, `lg 1.875rem`, `2xl 2.25rem`; the four `leading-none`/`leading-tight` uses on
text that can be Thai (card titles, sidebar user summary, badges) are `leading-snug`; `TableHead`
has `whitespace-normal`; badges `whitespace-nowrap`; truncating selects and sidebar items have a
`title` with the full text. **Mock** none.

### TC-C-1060
**Static** · **P2** · EP · covers NFR-002, FR-014.
**Pre** the build graph. **Input** parse the Vite manifest after `pnpm build`. **Expected** the Thai
catalogue is a separate dynamic chunk not referenced by the entry's static imports; the English
catalogue is in the main graph; the Thai font CSS and woff2 files are separate assets; the entry
chunk list for the first load does not include `th-*.js`. **Mock** none.

### TC-C-1061
**Component** · **P3** · EP · covers FR-001, NFR-004.
**Pre** the `Rich` component with messages that contain a link and a user-supplied name
`<img src=x onerror=alert(1)>` as a parameter. **Input** render in Thai and English. **Expected**
only the catalogue's tag names (`link`, `b`) become elements; the parameter text is shown as text
(no `img` element, no `alert`); the link is a real `Link` reachable by Tab with its accessible name;
`thesis-static`-style scan finds no `dangerouslySetInnerHTML`. **Mock** none.

## 7. End-to-end cases (TC-E-10xx)

Specs are `e2e/i18n-*.spec.ts` on the existing Playwright setup: a fresh admin-created user per
test (`confirmedUser`/`adminCreateUser`), the real API and local Supabase, `apiAs(...)` to seed and
read back (plus the new `apiAs(...).saveLanguage` and helpers in `e2e/lib/i18n.ts`), the screen
states of `e2e/lib/states.ts`. A **fresh context** is a new `browser.newContext()` with empty
storage. "Every state" means all of `states.ts` (stock lists, `HC_STATES`, `TL_STATES`,
`VC_STATES`, `SFE` states) and the auth states. Mock-mode specs use the :5273/:3100 pair with its
one fixed user, so they read the current language and switch to the other one.

#### Choosing and saving the language

### TC-E-1000
**E2E** · **P1** · UC · covers FR-001, FR-002, FR-004, UC-001.
**Pre** I18N-A seeded; signed in, English. **Input** open the account menu, pick `ไทย`. **Expected**
the page is Thai at once: sidebar, breadcrumb, `h1`, table headers, buttons; the address and the
navigation count are unchanged (no reload: a marker set on `window` survives); exactly one `PATCH
/settings` with `{ language: "th" }` returns 200 and `apiAs.settings()` reads `th`; reloading the
page shows Thai from the first paint. **Mock** none.

### TC-E-1001
**E2E** · **P1** · UC · covers FR-002, FR-003, UC-001.
**Pre** user U switched to Thai in context 1. **Input** open a fresh context 2 (empty storage,
browser language `en-US`), sign in as U on the sign-in page. **Expected** the sign-in page is
English (no stored language), after sign-in `/stocks` renders in Thai with no English flash (a
`MutationObserver` log from the first load shows no English `h1` on the signed-in page); `localStorage`
then holds `th`; signing out shows the sign-in page in Thai. **Mock** none.

### TC-E-1002
**E2E** · **P1** · DT · covers FR-003, FR-002.
**Pre** user U with account `th`. **Input** sign in from contexts with (browser `en-US`, storage
`en`), (browser `th-TH`, no storage), and for user V with `null`: (browser `th-TH`) and (browser
`en-US`). **Expected** U sees Thai in both; V sees Thai from `th-TH` and English from `en-US`
and V's account stays `null` (`apiAs(V).settings().language` null) after browsing; the first switch
by V writes it. **Mock** none.

### TC-E-1003
**E2E** · **P1** · 2U · covers FR-002, NFR-003.
**Pre** users U and V (I18N-B), two contexts. **Input** U switches to Thai; V (new account) signs in
on another context with an English browser and then switches to English; U reloads. **Expected**
V never sees Thai; U still sees Thai; `apiAs(U)` reads `th`, `apiAs(V)` reads `en`; U's request
cannot read or write V's value (a PATCH with V's id in the body is rejected as unknown key).
**Mock** none.

### TC-E-1004
**E2E** · **P1** · DT · covers FR-003, UC-003.
**Pre** fresh contexts with `locale` and an init script setting `navigator.languages`, signed out.
**Input** open `/auth/sign-in` with `['th-TH']`, `['th']`, `['en-US']`, `['en-GB','th']`,
`['th','en']`, `['fr','th']`, `['fr']`. **Expected** Thai, Thai, English, English, Thai, Thai, English;
`html lang` matches; the inline switch shows the current one pressed; the sign-in heading is
`เข้าสู่ระบบ` or `Sign in`. **Mock** none.

### TC-E-1005
**E2E** · **P1** · UC · covers FR-001, FR-003, FR-002, UC-003.
**Pre** a fresh context, browser `en-US`, user V (account `null`) and user U (account `en`).
**Input** on the sign-in page click `ไทย`; sign in as V; then (second run) sign in as U.
**Expected** while signed out no request is sent by the switch (network log); V lands on `/stocks`
in Thai and no `PATCH /settings` is sent on sign-in (OQ-1); U lands in English (account wins) and
storage becomes `en`. **Mock** none.

### TC-E-1006
**E2E** · **P2** · ST · covers FR-003, UC-003.
**Pre** signed in with Thai. **Input** sign out, then open `/auth/forgot-password`, then the sign-in
page in a new tab of the same context. **Expected** all in Thai; after switching to English there and
signing in as a user with `th` saved, the app is Thai again. **Mock** none.

### TC-E-1007
**E2E** · **P1** · ST · covers FR-002, UC-001.
**Pre** signed in, English; Playwright `route` fulfils `PATCH **/settings` with 500, later with
`abort`. **Input** pick `ไทย`; wait for the toast; press `ลองอีกครั้ง` with the route still failing;
then remove the route and press it again. **Expected** the page stays Thai throughout; the toast
reads `บันทึกภาษาไม่สำเร็จ` with `จะใช้ภาษาไทยบนอุปกรณ์นี้ต่อไป` and stays about 10 s (visible at 9 s,
gone by 11 s); after success no toast, `apiAs.settings().language` is `th`, and a fresh context
signing in shows Thai; with the route removed before any retry, reload shows Thai from storage while
the account value is still the old one **(documented behaviour: this device only)**. **Mock** route
fulfilment.

### TC-E-1008
**E2E** · **P1** · EP · covers FR-001, UC-002.
**Pre** `/stocks/new`, then a stock's thesis dialog, then `/stocks/:id/edit`. **Input** type into the
form (ticker, name, selects, tags, holding), switch to Thai and back while the form is dirty; open
the thesis dialog, type 300 characters, switch. **Expected** nothing typed is lost, the dialog stays
open with the same focus; no validation error appears because of the switch; saving afterwards
creates the stock with the canonical values typed (`apiAs.getStock`). **Mock** none.

### TC-E-1009
**E2E** · **P2** · ST · covers FR-001, FR-002.
**Pre** signed in with Thai chosen. **Input** navigate three pages, press Back twice and Forward
once; open the same account in a second tab, switch to English there, reload the first tab.
**Expected** language does not change with history (it is not in the address); the history length
does not grow on a switch; after the reload the first tab shows English (the account setting, since
the other tab saved it); before the reload the first tab keeps Thai **(proposed, section 9)**.
**Mock** none.

### TC-E-1010
**E2E** · **P3** · EP · covers FR-001, FR-002.
**Pre** the mock-mode pair (:5273/:3100). **Input** read the current language, switch to the other,
reload, switch back. **Expected** the page follows each switch without a sign-in redirect; the mock
user's saved value follows (read through the mock API); leave the pair in the language found.
**Mock** none.

#### Accessibility, layout and typography

### TC-E-1011
**E2E** · **P1** · PO · covers NFR-004, FR-004, NFR-005.
**Pre** language Thai, theme light, every state of `states.ts` and the auth states (sign-in with
error, forgot-password, check-email, link-expired, reset-password, not found). **Input** visit each
and run axe (WCAG 2.1 A and AA tags, as `sl-a11y`). **Expected** zero violations in every state
(the account menu content stays out as in finding F-5, but the language group is checked in
TC-E-1013); `color-contrast` included; `html-has-lang` and `valid-lang` pass. **Mock** none.

### TC-E-1012
**E2E** · **P1** · PO · covers NFR-004.
**Pre** as TC-E-1011 with the dark theme (`colorScheme: 'dark'` or the theme toggle). **Input** the
same run. **Expected** zero axe violations in every state; the computed contrast of the Thai text
in badges, muted text, toasts and the switch items is at least 4.5:1 (3:1 for large text and
borders) using `contrast.ts`, tints composited over the real parent. **Mock** none.

### TC-E-1013
**E2E** · **P1** · EP · covers NFR-004, FR-010.
**Pre** the account menu open on `/stocks`; the sign-in page. **Input** read the accessibility tree
and run axe scoped to the language group (menu) and the inline switch. **Expected** the group is
named `ภาษา · Language`; the radio items are `menuitemradio` with `ไทย` checked (`lang="th"`) and
`English` (`lang="en"`); no axe violation in the group in light and dark and in both languages; the
auth buttons have `aria-pressed`; `valid-lang` passes for the items. **Mock** none.

### TC-E-1014
**E2E** · **P2** · EP · covers NFR-004.
**Pre** Thai, the save-failure toast on screen, the filter sheet, the stock form with errors.
**Input** measure the computed colour contrast of the toast text, the Retry action, field errors,
the muted group label and the `เกิน 40%` badge in light and dark. **Expected** all pairs at least
4.5:1, as the English ones (same tokens); the badge text uses `text-foreground` with the destructive
icon (as the English page). **Mock** none.

### TC-E-1015
**E2E** · **P1** · PO · covers NFR-005.
**Pre** viewport 360 x 740, Thai, every state of `states.ts` plus the open dialogs, the Filters
sheet (bottom sheet), the account menu and the sidebar sheet. **Input** visit each. **Expected**
`document.documentElement.scrollWidth <= clientWidth` (no horizontal scroll) and no element wider
than the viewport (excluding intentionally scrollable regions such as the table's own container);
dialogs and sheets fit inside the viewport; buttons keep a 24 x 24 px target. **Mock** none.

### TC-E-1016
**E2E** · **P1** · EG · covers NFR-005, FR-010.
**Pre** Thai at 360 px and 1280 px, and again with the root font size at 200 % (text resize), data
with long labels (`ได้เปรียบด้านต้นทุน`, `เกษตรและอุตสาหกรรมอาหาร`, `ตำแหน่งในห่วงโซ่คุณค่า`, a 40-char
Thai theme, `ค่าธรรมเนียมธุรกรรม`) and a Thai company name. **Input** for every element matched by
`.truncate`, `[class*="line-clamp"]`, `overflow:hidden` text, table headers, badges, buttons, select
triggers and the sidebar items, compare `scrollHeight` to `clientHeight` (and `scrollWidth` to
`clientWidth` for badges and buttons). **Expected** no element has `scrollHeight > clientHeight`
(vowel and tone marks not clipped); truncated elements have the full text in `title`; badges do not
wrap and do not overflow their cell; headers may wrap to two lines; the sort icon stays on the last
line. **Mock** none.

### TC-E-1017
**E2E** · **P2** · EP · covers FR-010, FR-001.
**Pre** English and Thai pages. **Input** read the computed `line-height` and `font-size` of `h1`,
`text-xs`, `text-sm`, `text-base` samples, and the heights of a button, an input and the inline
switch. **Expected** English values equal the pre-slice ones (Tailwind defaults: 1.333, 1.429, 1.5);
Thai values equal ux-design.md (1.5, 1.571, 1.625); fixed-height controls (`h-8`, `h-9`, `h-7`)
contain their Thai text with no change of height from the English control. **Mock** none.

### TC-E-1018
**E2E** · **P1** · UC · covers FR-007, UC-002.
**Pre** I18N-A order via the API, Chromium. **Input** in Thai sort the GICS column ascending and
descending on `/stocks`; open the filter sheet's GICS section; open `/concentration` lens GICS with
two groups of equal count. **Expected** the row and option order is `การเงิน`, `เทคโนโลยีสารสนเทศ`,
`พลังงาน`, `สาธารณูปโภค`, `ยังไม่ระบุ` last (Chromium's ICU Thai collation, fixed in the spec);
descending reverses the four and keeps Not set last; equal-count concentration groups tie by the
Thai label; in English the order is Energy, Financials, Information Technology, Utilities, Not set.
**Mock** none.

### TC-E-1019
**E2E** · **P2** · UC · covers NFR-004, FR-001.
**Pre** `trackPointer` active (no pointer events allowed). **Input** with the keyboard only: Tab to
the account trigger, open, choose `ไทย`, Escape; on the sign-in page Tab to `English`, press Enter;
open the filter sheet in Thai and tick an option with Space. **Expected** every step works; the focus
returns to the trigger after the menu; focus stays on the pressed inline button; no keyboard trap;
tab order is identical in both languages (the list of focused element roles matches). **Mock** none.

### TC-E-1020
**E2E** · **P1** · EP · covers FR-010, NFR-002, NFR-003.
**Pre** Thai, network log, fresh context with the cache disabled. **Input** load `/stocks` and the
sign-in page; read `document.fonts` and the computed `font-family`. **Expected** the font files
load from the app's own origin (`/assets/*.woff2`); only the Thai and Latin subsets of the variable
font are requested (no Cyrillic, Vietnamese or Latin-extended file); `document.fonts.check('1em
"Noto Sans Thai Variable"', 'ก')` is true and the Thai text computes to a family that starts with
Geist and includes the Thai face; a Latin ticker still renders in Geist; an English first visit
(no Thai code points) requests no Thai font file **(proposed, unicode-range behaviour)**. **Mock**
none.

### TC-E-1021
**E2E** · **P1** · EP · covers NFR-003.
**Pre** a request listener on the context, signed in. **Input** walk every route and the dialogs in
Thai and English, switch language, sign in and out, import and export. **Expected** every request's
host is the web origin, the API origin or the local Supabase origin; none to `fonts.googleapis.com`,
`fonts.gstatic.com`, a CDN, a translation or analytics host; the console has no CSP or blocked
font warning. **Mock** none.

#### Canonical data

### TC-E-1022
**E2E** · **P1** · UC · covers FR-006, UC-004.
**Pre** I18N-A, Thai. **Input** tick `การเงิน` and `ยังไม่ระบุ` and a market on `/stocks`, copy the
address, open it in a fresh English context signed in as U (account `en`); then open
`/stocks?gicsSector=พลังงาน`. **Expected** the address holds `gicsSector=Financials&gicsSector=`
(canonical, no percent-encoded Thai); the English context shows the same rows and ticks; the Thai
value in the hand-typed address is one translated note and ignored; links from `/concentration`
and `/chains` (See concentration, Stocks, Show them) carry canonical values. **Mock** none.

### TC-E-1023
**E2E** · **P2** · EP · covers FR-006.
**Pre** I18N-A, Thai. **Input** search `AAPL`, `apple`, `AI`, `พลังงาน`, `Energy`, `การเงิน`.
**Expected** ticker, name and theme text match as typed; `Energy` and `การเงิน` do not match by
sector label; the results and the result line are Thai; clearing restores all rows; no request is
sent per keystroke (network log). **Mock** none.

### TC-E-1024
**E2E** · **P1** · UC · covers FR-005, FR-006, UC-002.
**Pre** Thai, a signed-in user with one list. **Input** create a stock choosing Thai-labelled
options (sector `การเงิน`, style `เติบโต`, size `ใหญ่`, moat `แบรนด์`, customers `ผู้บริโภค (B2C)`),
then edit it and change the style; read through `apiAs.getStock`. **Expected** the API holds
`Financials`, `Growth`, `Large`, `Brand`, `B2C` then the new canonical style; the detail page shows
Thai labels with the English value in `title`; the `PATCH` body contains only the changed canonical
field; the Thai edit page shows the stored value selected. **Mock** none.

### TC-E-1025
**E2E** · **P1** · EP · covers FR-008.
**Pre** Thai, I18N-A. **Input** add a duplicate stock (409 `stock_exists`), a list with an existing
name (409), add a stock to a list twice, rename a chain onto an existing chain (409 `chain_exists`),
a 1,001-row import, and force a field-level 400 by posting a value the client check misses
(`route` rewrite of one request to an invalid ticker). **Expected** every message is Thai from the
code or `rule` and params (for example ticker rule text with `1-12`), the English `detail` text
never appears, the offending field is highlighted with `aria-invalid`, the link to the existing
stock works, and switching to English re-renders the same error in English. **Mock** `route` rewrite
for the field case.

### TC-E-1026
**E2E** · **P1** · EP · covers FR-004, UC-002.
**Pre** Thai, I18N-A. **Input** run the destructive and Undo paths: delete a stock and press `เลิกทำ`
inside 5 s, remove from a list, delete a list, clear a holding, delete a thesis entry and Undo,
rename and merge a chain, save settings, create and rename a list. **Expected** every dialog title,
body, button and toast is Thai with correct counts (`1 หุ้น`, `3 รายการ`), Undo restores the data
(API read-back), the Undo toast lasts 5 s, the failure toast 10 s, and focus rules are the same
as in English. **Mock** none.

### TC-E-1027
**E2E** · **P1** · BVA · covers FR-009, UC-002.
**Pre** theses on AAPL dated 2026-01-01, 2026-02-28, 2026-04-15, 2026-11-27, 2026-12-31 (clock
after the last, or the last two skipped) and a rate saved; contexts with `timezoneId`
`Asia/Bangkok`, `America/Los_Angeles`, `Pacific/Kiritimati`; both languages. **Input** open the
stock page, an edited entry, the Settings dialog and an import result. **Expected** `1 ม.ค. 2026`,
`28 ก.พ. 2026`, `15 เม.ย. 2026`, `27 พ.ย. 2026` / `1 Jan 2026` ... in every zone (the entry date is
taken from the text, no shift); the `Edited` and rate-updated dates use the browser-local date and
may differ across zones near midnight but never show year 2569; the date input keeps `YYYY-MM-DD`.
**Mock** none.

### TC-E-1028
**E2E** · **P1** · EP · covers FR-005, FR-009, NFR-007.
**Pre** I18N-A with a rate. **Input** open `/concentration` (each lens, count and value measure,
scope held) and `/chains` in both languages and read every number. **Expected** counts, THB values,
percentages, shares of lanes and the `฿` and `$` symbols are identical strings in both languages
(compare the extracted numbers); group names, lane names, `เกิน 40%`, notes, left-out line and the
advice note `การจัดกลุ่มและเหตุผลการลงทุนเป็นความเห็นของคุณเอง ไม่ใช่คำแนะนำการลงทุน` are Thai; Thai
glossary terms are used consistently (`การกระจุกตัว`, `ห่วงโซ่คุณค่า`, `มูลค่าตามต้นทุน`). **Mock**
none.

### TC-E-1029
**E2E** · **P1** · UC · covers FR-011, UC-004.
**Pre** I18N-A, `timezoneId: 'Asia/Bangkok'`. **Input** in English, then in Thai (after a switch),
export the stocks CSV, copy to the clipboard (grant permission and read it), and export a list's
CSV. **Expected** the CSV bytes of the two languages are identical (BOM, CRLF, canonical headers,
`lists` column, canonical values); the clipboard texts are identical and tab-separated; the
download names are `investhesis-stocks-<local date>.csv` and `investhesis-<list>-<local date>.csv`
unchanged; the export toast is Thai in Thai. **Mock** clipboard permission.

### TC-E-1030
**E2E** · **P1** · UC · covers FR-011, UC-004.
**Pre** I18N-A. **Input** download `/exports/backup.json` and `.csv` through the `BackupCard` in
each language. **Expected** the files are byte-identical across languages except the timestamp and
file name date; the JSON has no `language` key and parses as `Backup` v2; the CSV has English
headers; a backup taken in Thai imports back without any error (round trip through `/imports`).
**Mock** none.

### TC-E-1031
**E2E** · **P1** · UC · covers FR-012, FR-011, UC-004.
**Pre** Thai, `/import-export`. **Input** download both templates in Thai and in English and open
the XLSX files with `exceljs`. **Expected** the Thai XLSX has sheets `Stocks` and `คำแนะนำ`, the
English `Stocks` and `Instructions`; the `Stocks` sheets are cell-for-cell equal and equal to the CSV
template; the Thai rows show `Canonical — ไทย` for every enumerated value of every lens; the CSV
templates are byte-identical in both languages; each downloaded template imports with zero errors;
the Thai `Instructions` note says to use the English values. **Mock** none.

### TC-E-1032
**E2E** · **P1** · EP · covers NFR-001, FR-001.
**Pre** I18N-C (200 stocks) via the API, `/stocks` loaded, Chromium, network log reset. **Input**
switch to Thai and back 10 times, measuring in the page from the click dispatch to the first
animation frame in which the table header reads in the new language (`performance.mark`,
`requestAnimationFrame`, `MutationObserver`). **Expected** every sample at most 200 ms and the p95
logged; the only request per switch is `PATCH /settings` (no `GET /stocks`, `/lists`, `/me`); no
long task above 200 ms during a switch. **Mock** none.

### TC-E-1033
**E2E** · **P1** · EP · covers NFR-001, FR-006.
**Pre** I18N-C, Thai. **Input** on `/stocks`, `/concentration` and `/chains` type a search, tick a
filter, sort a lens column, change lens, measure from the action to the updated view.
**Expected** each at most 200 ms (logged); no network request for any of them; the rows shown are
those of the filter. **Mock** none.

### TC-E-1034
**E2E** · **P1** · EP · covers NFR-002.
**Pre** `pnpm build` output in `apps/web/dist`, and the recorded size of the same build with the
English catalogue only at the commit before this slice (stored in the spec as a constant measured
on the commit `523351f`). **Input** gzip every JS and CSS file the first page load requests
(English visit) and the lazy Thai chunk; compare to the baseline. **Expected** the growth of the
first-load JS and CSS (the English catalogue plus the i18n layer plus the font CSS) plus the Thai
chunk is at most 40 KB gzipped; the Thai chunk is not requested on an English first load; the font
files are not counted in the 40 KB but only the Thai and Latin subset files exist for the Thai font
(no other subset in `dist/assets`). **Mock** none.

### TC-E-1035
**E2E** · **P1** · UC · covers FR-011, FR-008, FR-012, UC-004.
**Pre** Thai, the prototype CSV (35 stocks, canonical, from `apps/api/test/fixtures/imports/`), a
CSV with Thai lens labels, a CSV with two repeats. **Input** import the prototype file through the
wizard in Thai; then the Thai-label file; then the repeats file and download the error-rows CSV.
**Expected** all steps, previews, notes and results are Thai; the 35 stocks are stored with canonical
values (`apiAs`); the Thai-label file gives row errors in Thai (the value is not accepted) and writes
nothing; the error-rows CSV is byte-identical to the one downloaded in English; the same import in
English gives the same stored data. **Mock** none.

### TC-E-1036
**E2E** · **P1** · UC · covers FR-013, UC-005.
**Pre** local stack with the new templates, an admin-created unconfirmed user and a confirmed one,
Mailpit. **Input** request a recovery email and a confirmation resend; read the messages; open the
link from each in a context with browser language `en-US` and another with `th-TH`. **Expected**
each message has a Thai part (`lang="th"`) then an English part, one link in both; the links work
(recovery shows the reset form; confirmation signs in or goes to `safeNext`); the landing page
language follows FR-003 (not the email's order): English for `en-US`, Thai for `th-TH`; the reset
page is translated either way. **Mock** Mailpit.

### TC-E-1037
**E2E** · **P3** · EG · covers FR-014, FR-001.
**Pre** `route` aborts the Thai catalogue chunk request. **Input** open the app with stored `th`;
then, in a fresh context, switch to Thai. **Expected** **(proposed)** the app renders in English,
`html lang` is `en`, no blank page or console error beyond the failed request, the switch can be
retried after the route is removed and then works; no `PATCH` is sent for a language that did not
apply. **Mock** `route.abort`.

### TC-E-1038
**E2E** · **P1** · UC · covers UC-002, FR-004, FR-005, FR-009, FR-010.
**Pre** a fresh user, Thai from the first switch. **Input** the whole journey in Thai: create a
list, add a stock with classification, import two rows, filter by sector, mark a holding, write a
thesis entry, view concentration and chains, export, back up, rename the list, delete and undo,
sign out. **Expected** every step reads in Thai, nothing in English except stored names, tickers,
codes and the brand (residue scan at each step), tab titles are Thai, no console error, no request
to a third party, stored data is canonical (API read-back) and the account still holds `th` after
the walk. **Mock** none.


## 8. Traceability

TC-U-1000..1061 come from the task contracts in [dev-plan.md](dev-plan.md); TC-U-1062..1068 are in section 4.

| Requirement | Cases |
|---|---|
| FR-001 language switch, no reload, input kept | TC-C-1002, TC-C-1008, TC-C-1009, TC-C-1010, TC-C-1011, TC-C-1012, TC-C-1013, TC-C-1017, TC-C-1020, TC-C-1021, TC-C-1022, TC-C-1023, TC-C-1047, TC-C-1061, TC-E-1000, TC-E-1005, TC-E-1008, TC-E-1009, TC-E-1010, TC-E-1017, TC-E-1019, TC-E-1032, TC-E-1037, TC-U-1035, TC-U-1040, TC-U-1041 |
| FR-002 saved account setting, failed save | TC-A-1000, TC-A-1001, TC-A-1002, TC-A-1003, TC-A-1004, TC-A-1005, TC-A-1006, TC-A-1007, TC-A-1008, TC-A-1009, TC-A-1010, TC-A-1027, TC-A-1028, TC-A-1029, TC-A-1036, TC-C-1006, TC-C-1014, TC-C-1015, TC-C-1016, TC-C-1017, TC-C-1018, TC-C-1019, TC-E-1000, TC-E-1001, TC-E-1002, TC-E-1003, TC-E-1005, TC-E-1007, TC-E-1009, TC-E-1010, TC-U-1009, TC-U-1011, TC-U-1012, TC-U-1015, TC-U-1037, TC-U-1038, TC-U-1039 |
| FR-003 choice before the setting is known | TC-A-1003, TC-A-1004, TC-A-1010, TC-C-1000, TC-C-1001, TC-C-1002, TC-C-1003, TC-C-1004, TC-C-1005, TC-C-1006, TC-C-1007, TC-E-1001, TC-E-1002, TC-E-1004, TC-E-1005, TC-E-1006, TC-U-1011, TC-U-1025, TC-U-1038, TC-U-1039 |
| FR-004 every text translated, plurals, a11y text | TC-C-1024, TC-C-1025, TC-C-1026, TC-C-1027, TC-C-1028, TC-C-1029, TC-C-1030, TC-C-1033, TC-C-1051, TC-C-1052, TC-C-1056, TC-E-1000, TC-E-1011, TC-E-1026, TC-U-1027, TC-U-1028, TC-U-1032, TC-U-1043, TC-U-1048, TC-U-1050, TC-U-1057, TC-U-1058, TC-U-1059 |
| FR-005 values translated, names not | TC-C-1031, TC-C-1032, TC-C-1033, TC-C-1035, TC-C-1051, TC-C-1052, TC-E-1024, TC-E-1028, TC-U-1004, TC-U-1005, TC-U-1043, TC-U-1053, TC-U-1057, TC-U-1058, TC-U-1066, TC-U-1067 |
| FR-006 stored and addressed values canonical, search as typed | TC-A-1016, TC-A-1017, TC-C-1037, TC-C-1038, TC-C-1039, TC-C-1053, TC-E-1022, TC-E-1023, TC-E-1024, TC-E-1033, TC-U-1044, TC-U-1052 |
| FR-007 sort and group by displayed label | TC-C-1034, TC-C-1035, TC-C-1036, TC-C-1052, TC-E-1018, TC-U-1006, TC-U-1007, TC-U-1008, TC-U-1047, TC-U-1053, TC-U-1064 |
| FR-008 validation and API error text from code and rule | TC-A-1005, TC-A-1011, TC-A-1012, TC-A-1013, TC-A-1014, TC-A-1015, TC-A-1016, TC-A-1018, TC-C-1042, TC-C-1043, TC-C-1044, TC-C-1045, TC-E-1025, TC-E-1035, TC-U-1000, TC-U-1001, TC-U-1002, TC-U-1003, TC-U-1010, TC-U-1013, TC-U-1017, TC-U-1018, TC-U-1019, TC-U-1031, TC-U-1045, TC-U-1046, TC-U-1049, TC-U-1056, TC-U-1062 |
| FR-009 dates and numbers | TC-C-1040, TC-C-1041, TC-C-1057, TC-E-1027, TC-E-1028, TC-U-1029, TC-U-1030, TC-U-1057, TC-U-1068 |
| FR-010 html lang, Thai font, line height | TC-A-1035, TC-C-1007, TC-C-1011, TC-C-1058, TC-C-1059, TC-E-1013, TC-E-1016, TC-E-1017, TC-E-1020, TC-U-1026 |
| FR-011 language-neutral files | TC-A-1017, TC-A-1018, TC-A-1019, TC-A-1021, TC-A-1023, TC-A-1024, TC-A-1025, TC-C-1049, TC-E-1029, TC-E-1030, TC-E-1031, TC-E-1035, TC-U-1022, TC-U-1023, TC-U-1024, TC-U-1054 |
| FR-012 template instructions | TC-A-1019, TC-A-1020, TC-A-1021, TC-A-1022, TC-A-1023, TC-C-1050, TC-E-1031, TC-E-1035, TC-U-1020, TC-U-1021, TC-U-1022, TC-U-1024, TC-U-1055 |
| FR-013 bilingual emails | TC-A-1031, TC-A-1032, TC-A-1033, TC-A-1034, TC-A-1035, TC-E-1036, TC-U-1060, TC-U-1061 |
| FR-014 English fallback, key parity | TC-C-1046, TC-C-1047, TC-C-1048, TC-C-1060, TC-E-1037, TC-U-1027, TC-U-1034, TC-U-1062, TC-U-1063 |
| NFR-001 switch and regroup within 200 ms, no request | TC-A-1030, TC-C-1053, TC-C-1054, TC-C-1055, TC-E-1032, TC-E-1033 |
| NFR-002 40 KB gzip budget, font subsets | TC-C-1060, TC-E-1020, TC-E-1034 |
| NFR-003 privacy, self-hosted font and catalogues, isolation | TC-A-1000, TC-A-1002, TC-A-1008, TC-A-1009, TC-A-1011, TC-A-1026, TC-A-1027, TC-A-1034, TC-A-1036, TC-C-1058, TC-E-1003, TC-E-1020, TC-E-1021, TC-U-1011, TC-U-1015 |
| NFR-004 WCAG AA, keyboard, lang | TC-C-1008, TC-C-1009, TC-C-1010, TC-C-1027, TC-C-1061, TC-E-1011, TC-E-1012, TC-E-1013, TC-E-1014, TC-E-1019, TC-U-1042 |
| NFR-005 360 px, no clipping | TC-C-1024, TC-C-1044, TC-C-1059, TC-E-1011, TC-E-1015, TC-E-1016 |
| NFR-006 typed keys, static scan | TC-C-1046, TC-C-1048, TC-C-1056, TC-U-1034, TC-U-1062, TC-U-1063 |
| NFR-007 one glossary | TC-C-1031, TC-C-1042, TC-E-1028, TC-U-1065, TC-U-1066 |
| UC-001 switch language | TC-U-1035, TC-C-1014, TC-E-1000, TC-E-1001, TC-E-1007 |
| UC-002 work in Thai | TC-C-1024, TC-E-1008, TC-E-1018, TC-E-1024, TC-E-1026, TC-E-1038 |
| UC-003 sign in in my language | TC-C-1000, TC-C-1012, TC-E-1004, TC-E-1005, TC-E-1006 |
| UC-004 exchange data unchanged | TC-E-1022, TC-E-1029, TC-E-1030, TC-E-1031, TC-E-1035 |
| UC-005 read an auth email | TC-A-1031, TC-A-1032, TC-A-1033, TC-E-1036 |

## 9. Gaps, ambiguities and decisions for the owner

1. **Collation across scripts (FR-007).** The documents say "the current language's collation" but
   not how Thai and Latin labels interleave in one column (a Thai page shows a Thai label for every
   enumerated value, but free text such as themes and chain names stay Latin or Thai). Expected
   orders derive from `Intl.Collator` and Chromium's ICU; TC-U-1064 and TC-E-1018 pin the four
   GICS labels only. Node and Chromium ICU versions can differ, so the jsdom and E2E expectations
   are computed or fixed per environment.
2. **Sort direction and "Not set".** "Not set last as today" is read as last in both ascending and
   descending order (TC-C-1034, TC-E-1018); say if descending should put it first.
3. **NFR-002 measurement.** "At most 40 KB gzipped added to the first page load" needs a baseline
   and a rule for what counts. TC-E-1034 compares with the size of the build before the slice
   (commit `523351f`), counts JS and CSS gzip (not font files) and adds the lazy Thai chunk. Decide
   whether the Thai font CSS counts and whether the baseline is stored in the repo.
4. **NFR-007 approval is a human gate.** The owner's approval of the glossary cannot be tested. The
   cases check consistency (TC-U-1065, 1066, 1067, TC-E-1028), not correctness of the Thai.
5. **NFR-004 "Thai voice" is untestable by automation.** Only `lang` on the page and on the switch
   items is checked (TC-E-1011, 1013); no screen reader is driven.
6. **Save failure kinds (FR-002).** Only "a failed save" is specified. TC-C-1014 treats 400, 401
   after refresh, 500 and a network failure the same; a 401 follows the api-client refresh once.
7. **Retry after a later switch (FR-002).** A Retry for `th` pressed after the investor chose `en`:
   TC-C-1016 proposes sending the language on screen. Decide.
8. **Two tabs (FR-001, FR-003).** Nothing says the other tab follows a switch. TC-E-1009 pins "no,
   until reload". A `storage` event listener would change this.
9. **Thai chunk fails to load (FR-014).** The design awaits the chunk before the first render but
   not what happens when it rejects. TC-C-1047 and TC-E-1037 propose staying in English without a
   crash and without a save.
10. **Toasts already on screen (FR-001).** "Every visible text of the current page" does not say
    whether a visible toast re-renders. TC-C-1028 proposes it keeps the text it was raised with.
11. **Browser list with other languages (FR-003).** "A Thai tag before any English tag" with `fr`
    between them (`['fr','th']`): TC-C-1000 and TC-E-1004 read it as Thai (other tags are skipped).
12. **Shared browser (OQ-1).** A user with no saved setting inherits the previous user's language
    shown on that browser (TC-C-1005). It is a display value only; confirm it is acceptable.
13. **`null` in `PATCH /settings`.** The design says `null` is not accepted; the rule id for it
    (`oneOf` or `invalid`) is not given (TC-A-1005 proposes `oneOf`).
14. **`lang` on the CSV template and repeated `lang`.** The CSV route "ignores `lang`": TC-A-1023
    reads that as ignoring an invalid value too; a repeated `lang=th&lang=th` follows the framework
    and is proposed as 400 (TC-A-1022).
15. **Error-rows CSV text (FR-011).** The CSV is language-neutral, but its message column holds
    text. TC-C-1045 and TC-E-1035 assume the English message so the file is identical in both
    languages; the alternative is the rule id.
16. **Rule param names.** design.md gives `exchangeForMarket { market, allowed }` and `oneOf {
    values }`; `columnMissing` and `repeatsRow { row }` partly; the others (`columnMissing {
    column }`) are proposed in TC-A-1018 and must be confirmed against T-001.
17. **Clipped text on x-axis.** NFR-005 says "clipped text"; ux-design measures `scrollHeight`
    against `clientHeight` only. TC-E-1016 also compares widths for badges and buttons.
18. **Timing in jsdom.** NFR-001 is measured in jsdom by TC-C-1054 and TC-C-1055 as regression
    guards and in a real browser by TC-E-1032 and TC-E-1033; only the second is faithful.
19. **Hosted email templates.** The hosted Supabase project is edited by hand; TC-A-1034 checks the
    checklist step exists, not that the hosted templates match the files.
20. **Not tested.** Languages other than Thai and English, RTL, per-language URLs, Buddhist Era and
    Thai digits (only their absence), localised CSV columns and import of Thai labels (rejection is
    tested), translating the API `detail`, OpenAPI, logs and Studio, per-recipient email language,
    and the quality of the Thai copy itself.

## 10. Coverage matrix

| Area | Unit | API/Script | Component | E2E | Covered |
|---|---|---|---|---|---|
| Happy path (switch, save, read back) | yes | yes | yes | yes | yes |
| Detection matrix, storage blocked, junk values | yes | no | yes | yes | yes |
| Account language follows the investor (second context) | no | yes | yes | yes | yes |
| Two-user isolation of the setting | yes | yes | yes | yes | yes |
| Save failure and Retry, rapid switches | yes | no | yes | yes | yes |
| Form and dialog input kept across a switch | yes | no | yes | yes | yes |
| Rule ids, problem codes, unknown rule or code | yes | yes | yes | yes | yes |
| Canonical values (stored, address, exports, backups, templates) | yes | yes | yes | yes | yes |
| Template Stocks sheet and Instructions sheet | yes | yes | yes | yes | yes |
| Dates, numbers, time zones | yes | no | yes | yes | yes |
| Sort and filter order by displayed label | yes | no | yes | yes | yes |
| Fallback, parity, static English scan | yes | no | yes (static) | no | yes |
| Accessibility: axe light and dark, keyboard, `lang`, contrast | no | no | structure | yes | yes |
| Responsive: 360 px, clipped Thai marks (scrollHeight) | no | no | classes | yes | yes |
| Thai font, no third-party request | no | no | static | yes | yes |
| Performance (switch, regroup, `/me`) | no | yes | jsdom | yes | yes |
| Bundle budget (NFR-002) | no | no | manifest | yes | yes |
| Auth emails | no | yes (script) | no | yes | yes |
| Error and failure paths (chunk, 5xx, network, 401) | yes | yes | yes | yes | yes |
| Security (markup in text, Thai-label injection into the API) | yes | yes | yes | no | yes |

Counts: existing `TC-U-1000..1061` 62; new `TC-U` 7 (`1062..1068`); `TC-A` 37
(`1000..1036`); `TC-C` 62 (`1000..1061`); `TC-E` 39 (`1000..1038`). Total new 145.
