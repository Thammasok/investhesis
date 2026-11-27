---
version: 1.0
status: active
date: 2026-11-27
requires: design.md
ux-design: ux-design.md
---

# Development Plan: Thai and English UI

Builds [requirements.md](requirements.md) per [design.md](design.md) and
[ux-design.md](ux-design.md). Every engineering task follows the test gate (green before, green
after, then human review). The gate is the **Investhesis gate** in `CLAUDE.md` (Tests and the
Investhesis gate), run from the repo root: `pnpm db:start && pnpm db:reset`, `pnpm test:supabase`,
`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (with `E2E_WEB_PORT`
when 5173 is taken). `.claude/rules/test-gate.md` still lists Pacta's commands (carried work in
`docs/todo.md`).

**Test ids.** This slice uses the 1000 range (900 is Value Chains): `TC-U-10xx` in the task
contracts below, and `TC-A-10xx`, `TC-C-10xx`, `TC-E-10xx` from
[T-009](#t-009--design-test-cases--thai-and-english-ui). Every test title starts with its id.

**English stays the test language.** `test/setup.ts` puts the i18next language on `en` before each test
([T-004](#t-004--web-i18n-foundation-store-catalogues-formatting-font)), so every existing test
keeps its English assertions and must pass unchanged in every task. Thai coverage is added, not
swapped in.

**Catalogue files are split by feature** (`apps/web/src/i18n/catalogue/{en,th}/<area>.ts`,
assembled in `index.ts`), so [T-006](#t-006--web-translate-shell-auth-and-stocks) and
[T-007](#t-007--web-translate-lists-imports-exports-filters-concentration-chains-theses) edit
different files and can run in parallel.

**Thai copy review.** Thai text follows the approved glossary in
[ux-design.md](ux-design.md#glossary-thai-copy-for-owner-approval). Each web task's review
includes the owner reading its Thai catalogue files; the slice is not tagged until the owner has
read all of them.

## Summary

- **Total tasks** — 10 (8 engineering, 1 test design, 1 test automation)
- **Estimated effort** — about 7.5 days of agent work (S ≈ 0.4 day, M ≈ 0.75 day, L ≈ 1.5
  days); about 5 days elapsed with the API and web lanes in parallel
- **Critical path** — [T-001](#t-001--domain-rule-ids-message-and-label-catalogues-ordering) →
  [T-004](#t-004--web-i18n-foundation-store-catalogues-formatting-font) →
  [T-007](#t-007--web-translate-lists-imports-exports-filters-concentration-chains-theses) →
  [T-010](#t-010--automate-tests--thai-and-english-ui)
- **Parallel lanes** — [T-008](#t-008--bilingual-auth-emails) and
  [T-009](#t-009--design-test-cases--thai-and-english-ui) start at once. After T-001: API
  [T-002](#t-002--api-language-setting-me-and-rule-ids-on-problems) and
  [T-003](#t-003--api-xlsx-template-instructions-sheet), web T-004. After T-004: web
  [T-005](#t-005--web-language-switch-and-saved-language), T-006 and T-007 in parallel (built
  against the contract in `design.md` with `StubApi`; T-010 proves them against the real API).

## Tasks

### T-001 — Domain: rule ids, message and label catalogues, ordering

```yaml
- title: Add rule ids to domain issues, en/th message and lens label catalogues, language-aware ordering
- description: >
  In packages/domain implement design.md §Shared vocabulary and rules. New src/i18n/:
  LANGUAGES = ['en','th'] and Language; MESSAGES_EN (today's MESSAGES text, byte for byte) and
  MESSAGES_TH typed with the same keys and parameter signatures; rule(key, params?) that encodes
  an issue message ("key" or "key|<json params>"); issueRule(message) → { rule, params } with
  'invalid' for any message the domain did not encode; formatRule(rule, params, lang).
  Every schema (StockInput, StockPatch, HoldingInput, SettingsPatch, thesisInput/thesisPatch,
  ChainRename, ListName, canonicaliseRow) sets messages through rule(). Keep MESSAGES as an alias
  of MESSAGES_EN for callers not yet moved. Add the import rules columnMissing and repeatsRow
  ({ row }). Labels: LENS_VALUE_LABELS_EN/TH for every LENS_VALUES value, MARKET_LABELS, NOT_SET
  label, LENS_LABELS_EN/TH, THESIS_TYPE_LABELS_EN/TH, lensValueLabel(lens, value, lang) (free text
  and unknown values return the value). Thai text from ux-design.md §Glossary. Ordering: optional
  `order: { label(lens, value), compare(a, b) }` on filterOptions and groupConcentration (tie
  order); default keeps today's order. SettingsPatch gains language: z.enum(LANGUAGES) optional.
  Export everything from index.ts. Covers FR-005, FR-007, FR-008, FR-014 (domain part), NFR-006,
  NFR-007.
- agent: software-engineer-backend
- depends_on: []
- status: done
- size: L
```

#### Acceptance criteria

- [ ] `formatRule(issueRule(m).rule, issueRule(m).params, 'en')` equals today's English text for every message the schemas produce, so API `message` values do not change
- [ ] A missing Thai message or lens label fails `pnpm typecheck`
- [ ] Every existing domain test passes unchanged except where it read `issue.message` text directly, which now goes through `formatRule(..., 'en')`
- [ ] No new dependency; code stays erasable syntax with `.ts` relative imports
- [ ] `pnpm --filter @investhesis/domain test:coverage` stays at or above 95% lines
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1000
    scenario: a parameterless rule round-trips and renders in both languages
    given: StockInput
    when: parsed with ticker "!!"
    then: the ticker issue decodes to rule tickerFormat with no params; en text is today's; th text is the Thai catalogue entry
    test_data:
      input: { market: "US", ticker: "!!", name: "X", exchange: "NYSE" }
      expected: { rule: "tickerFormat", en: 'must be 1-12 characters from A-Z, 0-9, "." and "-", starting with a letter or digit', th: MESSAGES_TH.tickerFormat }
  - id: TC-U-1001
    scenario: a parameterised rule carries its params
    given: StockInput
    when: parsed with market TH and exchange NYSE
    then: rule exchangeForMarket, params { market "TH", allowed ["SET","mai"] }, en "must be SET or mai for market TH"
    test_data:
      input: { market: "TH", ticker: "PTT", name: "PTT", exchange: "NYSE" }
      expected: { rule: "exchangeForMarket", params: { market: "TH", allowed: ["SET", "mai"] }, en: "must be SET or mai for market TH" }
  - id: TC-U-1002
    scenario: a message the domain did not encode decodes to invalid
    given: issueRule
    when: called with "Invalid input: expected string, received number" and with ""
    then: rule invalid, no params, for both
    test_data:
      input: ["Invalid input: expected string, received number", ""]
      expected: [{ rule: invalid }, { rule: invalid }]
  - id: TC-U-1003
    scenario: English rendering is unchanged for every rule
    given: a fixture of today's MESSAGES output for every key with sample params
    when: formatRule(key, params, 'en') for each
    then: identical strings
    test_data:
      input: every key of MESSAGES_EN with params e.g. oneOf { values: ["US","TH"] }, chainExists { name: "Oil", count: 1 }
      expected: today's text, e.g. "must be one of: US, TH", 'A chain named "Oil" already exists with 1 stock.'
  - id: TC-U-1004
    scenario: every lens value has a Thai label and English labels equal the canonical value
    given: LENS_VALUES and LENS_VALUE_LABELS_EN/TH
    when: iterating every lens and value
    then: Thai label is a non-empty string different from the key for words (codes like B2B may keep Latin inside); English label === value
    test_data:
      input: all lenses
      expected: e.g. lensValueLabel("gicsSector","Energy","th") = "พลังงาน"; lensValueLabel("size","Mega","en") = "Mega"
  - id: TC-U-1005
    scenario: free-text and unknown values pass through
    given: lensValueLabel
    when: called for themes "AI", valueChain "Oil & Gas", and gicsSector "Bogus"
    then: returns the value unchanged in both languages
    test_data:
      input: [[themes, "AI", th], [valueChain, "Oil & Gas", th], [gicsSector, "Bogus", th]]
      expected: ["AI", "Oil & Gas", "Bogus"]
  - id: TC-U-1006
    scenario: filterOptions orders by the given label and collator, Not set last
    given: stocks with gicsSector Energy, Financials, Utilities, null; order = Thai labels + Intl.Collator('th')
    when: filterOptions(stocks, { order })
    then: options sorted by Thai label (การเงิน, พลังงาน, สาธารณูปโภค) then Not set
    test_data:
      input: [Energy, Financials, Utilities, null]
      expected: [Financials, Energy, Utilities, null]
  - id: TC-U-1007
    scenario: without order, filterOptions and groupConcentration keep today's order
    given: the existing filters and concentration fixtures
    when: called with no order
    then: results deep-equal today's snapshots
    test_data:
      input: existing fixtures
      expected: unchanged output
  - id: TC-U-1008
    scenario: groupConcentration breaks size ties by the displayed label
    given: two groups of equal count, Energy and Financials, Thai order
    when: groupConcentration with order
    then: Financials (การเงิน) before Energy (พลังงาน)
    test_data:
      input: 1 Energy stock, 1 Financials stock, lens gicsSector
      expected: [Financials, Energy]
  - id: TC-U-1009
    scenario: SettingsPatch accepts the two languages only
    given: SettingsPatch
    when: parsed with { language: "th" }, { language: "en" }, { language: "fr" }, { language: null }
    then: first two pass; "fr" and null fail at path language with rule oneOf, params { values: ["en","th"] }
    test_data:
      input: [th, en, fr, null]
      expected: [ok, ok, oneOf, oneOf]
  - id: TC-U-1010
    scenario: import rules render with their params
    given: formatRule
    when: called with columnMissing and repeatsRow { row: 4 } in en and th
    then: en "column is missing" and "repeats row 4 in this file"; th from the catalogue with 4 inserted
    test_data:
      input: [columnMissing, [repeatsRow, { row: 4 }]]
      expected: ["column is missing", "repeats row 4 in this file"]
```

**Notes** — Zod 4 carries only a string `message` reliably across built-in and custom checks,
hence the encoding ([ADR-002](design.md#key-decisions)). Thai rule text should read after a
field label: `สัญลักษณ์หุ้น ต้องมี …`.

### T-002 — API: language setting, /me and rule ids on problems

```yaml
- title: Add user_settings.language, language in /me and /settings, rule and params on field errors
- description: >
  Migration supabase/migrations/<ts>_user_language.sql per design.md §Data Model (nullable
  language text with check en|th); Drizzle typing and the drift test. modules/settings:
  SettingsView gains language (null without a row); PATCH accepts language through the domain
  SettingsPatch; the empty-patch rule counts language. modules/me: reads language from
  user_settings by primary key (repository function findLanguage(db, userId)); on a database
  error answers language null and logs a warning without failing; response schema gains
  language: enum | null. Problem bodies: FieldError becomes { path, message, rule, params? };
  the error handler and every place that builds FieldError (route schema validation, services
  that run the domain schemas, imports preview row errors) fill rule/params from issueRule and
  keep message = formatRule(..., 'en'). Import module texts "column is missing" and "repeats row
  N in this file" use the new domain rules. OpenAPI regenerated. Covers FR-002, FR-003 (API
  part), FR-008 (API part), NFR-003.
- agent: software-engineer-backend
- depends_on: [T-001]
- status: doing
- size: M
```

#### Acceptance criteria

- [ ] `pnpm db:reset` applies the migration; the schema drift test passes
- [ ] Every existing API test passes unchanged (messages and codes are the same; `rule` is an added field)
- [ ] `/me` still answers 200 when the settings read throws
- [ ] Coverage thresholds for `src/modules/{settings,imports,stocks}` hold
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1011
    scenario: /me returns null language for a user with no settings row
    given: a new user with no user_settings row
    when: GET /me
    then: 200 with language null
    test_data:
      input: fresh user id
      expected: { language: null }
  - id: TC-U-1012
    scenario: PATCH /settings saves the language and /me returns it
    given: a user
    when: PATCH /settings { language: "th" } then GET /me and GET /settings
    then: PATCH 200 with language "th"; /me language "th"; /settings language "th", threshold 40 unchanged
    test_data:
      input: { language: "th" }
      expected: { language: "th", concentrationThreshold: 40 }
  - id: TC-U-1013
    scenario: an invalid language is a 400 with rule and params
    given: a user
    when: PATCH /settings { language: "fr" }
    then: 400 validation_failed, errors [{ path "language", message "must be one of: en, th", rule "oneOf", params { values ["en","th"] } }]; no row created
    test_data:
      input: { language: "fr" }
      expected: 400, rule oneOf
  - id: TC-U-1014
    scenario: an empty patch still creates no row
    given: a user with no row
    when: PATCH /settings {}
    then: 200 with defaults; select count from app.user_settings for the user is 0
    test_data:
      input: {}
      expected: row count 0
  - id: TC-U-1015
    scenario: the language belongs to one user only
    given: users A and B; A saves "th"
    when: B calls GET /me
    then: B's language is null
    test_data:
      input: A { language: "th" }
      expected: B language null
  - id: TC-U-1016
    scenario: /me survives a settings read failure
    given: findLanguage stubbed to throw
    when: GET /me
    then: 200 with id and email, language null; one warn log line without the error detail values
    test_data:
      input: repository throws Error("boom")
      expected: 200, language null
  - id: TC-U-1017
    scenario: stock validation errors carry rule and params next to the unchanged message
    given: a user
    when: POST /stocks { market: "TH", ticker: "PTT", name: "PTT", exchange: "NYSE" }
    then: 400 errors include { path "exchange", message "must be SET or mai for market TH", rule "exchangeForMarket", params { market "TH", allowed ["SET","mai"] } }
    test_data:
      input: TH stock on NYSE
      expected: rule exchangeForMarket
  - id: TC-U-1018
    scenario: a Zod error with no domain rule reports rule invalid
    given: a user
    when: POST /stocks with ticker 42 (a number)
    then: 400, the ticker error has rule "invalid" and no params
    test_data:
      input: { ticker: 42 }
      expected: rule invalid
  - id: TC-U-1019
    scenario: import preview row errors carry rules
    given: a CSV missing the market column, and one with the same ticker on rows 2 and 4
    when: POST /imports/preview for each
    then: the first has { path "market", message "column is missing", rule "columnMissing" }; the second row 4 has { path "ticker", rule "repeatsRow", params { row 2 } }
    test_data:
      input: [csv without market, csv with AAPL twice]
      expected: [columnMissing, repeatsRow { row: 2 }]
```

**Notes** — The language is not added to the JSON backup
([ADR-007](design.md#key-decisions)); `exports.*` tests must stay green unchanged.

### T-003 — API: XLSX template instructions sheet

```yaml
- title: Add the Instructions sheet and ?lang to GET /imports/template.xlsx
- description: >
  In modules/imports/imports.template.ts implement design.md §GET /imports/template.xlsx and
  ux-design.md §XLSX template. Optional query lang = en | th (default en; other values 400
  validation_failed with rule oneOf). The Stocks sheet is unchanged. A second sheet named
  "Instructions" (en) or "คำแนะนำ" (th) with a bold frozen header row (Column, Required, What it
  takes, Allowed values / Thai equivalents) and one row per TEMPLATE_COLUMNS entry: allowed
  values from LENS_VALUES / vocabulary, written "Value — Thai label" in th and "Value" in en,
  "; " separated, column D wrapped; free-text columns say so; a closing note that values must be
  the English ones. Column descriptions live in a small en/th map in the module (or domain if
  the web reuses them). template.csv ignores lang. Covers FR-012 (API part).
- agent: software-engineer-backend
- depends_on: [T-001]
- status: doing
- size: S
```

#### Acceptance criteria

- [ ] The XLSX Stocks sheet is byte-for-byte the same content (headers and rows) as today in both languages, and still imports with zero errors
- [ ] Every TEMPLATE_COLUMNS entry has an instructions row; every enumerated value appears
- [ ] The route still needs a bearer token
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1020
    scenario: default template has an English Instructions sheet
    given: a signed-in user
    when: GET /imports/template.xlsx
    then: sheets ["Stocks", "Instructions"]; row 1 bold and frozen; the gics_sector row lists "Communication Services; ...; Utilities"
    test_data:
      input: no lang
      expected: sheet names ["Stocks", "Instructions"]
  - id: TC-U-1021
    scenario: Thai template labels values next to the canonical ones
    given: a signed-in user
    when: GET /imports/template.xlsx?lang=th
    then: sheets ["Stocks", "คำแนะนำ"]; the gics_sector row contains "Energy — พลังงาน"; the Stocks sheet equals the English one
    test_data:
      input: lang=th
      expected: contains "Energy — พลังงาน"
  - id: TC-U-1022
    scenario: an unknown lang is refused
    given: a signed-in user
    when: GET /imports/template.xlsx?lang=fr
    then: 400 validation_failed with errors [{ path "lang", rule "oneOf" }]
    test_data:
      input: lang=fr
      expected: 400
  - id: TC-U-1023
    scenario: the CSV template ignores lang
    given: a signed-in user
    when: GET /imports/template.csv?lang=th and GET /imports/template.csv
    then: identical bodies
    test_data:
      input: [lang=th, none]
      expected: equal bytes
  - id: TC-U-1024
    scenario: a Thai template round-trips through import
    given: the Stocks sheet of the Thai XLSX template
    when: POST /imports/preview with that file
    then: no row errors and the Instructions sheet is ignored (first sheet only)
    test_data:
      input: template.xlsx?lang=th
      expected: errors []
```

### T-004 — Web: i18n foundation (store, catalogues, formatting, font)

```yaml
- title: Build the i18next setup, typed catalogues, formatting helpers, detection, Thai font and line heights
- description: >
  Implement design.md §Web (Store and lookup, Formatting, Font and layout, Testing seams) and
  ux-design.md §Thai on every screen (Layout) on i18next + react-i18next (ADR-001; the owner chose
  the library on 2026-11-27, the in-house layer first built was reverted). Use Context7 for the
  current i18next and react-i18next APIs and pin the versions. apps/web/src/i18n/: i18n.ts (one
  instance: English resources bundled, fallbackLng 'en', single namespace, escapeValue false,
  synchronous init), language.ts (getLanguage; setLanguage awaits the lazy Thai chunk once,
  registers it with addResourceBundle, calls changeLanguage, sets documentElement.lang, writes
  localStorage 'investhesis.language' in try/catch), detect.ts (FR-003 order, own code, no
  detector plugin), i18next.d.ts (CustomTypeOptions: typed keys from the English resources),
  catalogue/en/*.ts per area + index.ts (as const) with plural keys as key_one/key_other and
  {{name}} placeholders, catalogue/th/*.ts typed so that a missing or extra key fails typecheck
  (a Catalogue mapped type derived from the English resources, plural _one optional, Thai needs
  _other) plus a key-parity unit test, format-date.ts (formatDate(ymd, lang) from fixed month
  tables, formatTimestamp(iso, lang)), collate.ts (collator and the domain `order` object for
  the current language), describe-issue.ts (field label + formatRule; server errors from
  rule/params, missing or unknown rule -> errors.invalidField). Components use useTranslation and
  Trans (components prop, transKeepBasicHtmlNodesFor={[]}); loaders, actions and toasts use
  i18n.t. main.tsx awaits init(detect()) before render. RouteHandle.crumb becomes key |
  (params, data, t) => string; PageHeader, AuthHeading, PagePlaceholder and the account page
  title go through t. index.css: @fontsource-variable/noto-sans-thai/thai.css, font stack,
  :root:lang(th) line-height tokens; the four leading-none/leading-tight uses on translatable text
  become leading-snug. test/setup.ts resets the language to 'en' and clears localStorage;
  renderApp gains { language }; StubApi's default /me gains language null. Add the static
  English-literal scan test (JSX text and aria-label, placeholder, title, alt) with an allow-list
  of files still to move, which T-006 and T-007 empty. Covers FR-004 (mechanism), FR-009,
  FR-010, FR-014, NFR-002, NFR-003, NFR-006.
- agent: react-vite-developer
- depends_on: [T-001]
- status: backlog
- size: L
```

#### Acceptance criteria

- [ ] Removing a key from any Thai catalogue file, or using a key the English catalogue lacks in `t()`, fails `pnpm typecheck`
- [ ] The Thai catalogue is its own chunk in `pnpm build` output; the main chunk (English catalogue plus i18next and react-i18next) grows by at most 40 KB gzipped against `main` before the task (NFR-002, measured and reported in the review with the library's share)
- [ ] The font is bundled by Vite (no request to a third-party host)
- [ ] Every existing web test passes unchanged
- [ ] The static scan passes with the allow-list
- [ ] i18next is used only under `apps/web/src/i18n/` and through `react-i18next` hooks and `Trans` in components (an oxlint `no-restricted-imports` rule or a scan test)
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1025
    scenario: detect follows saved choice, then browser languages, then English
    given: detect(storage, languages)
    when: called with the matrix below
    then: the expected language
    test_data:
      input: [[th, [en-US]], [null, [th-TH, en]], [null, [en-GB, th]], [null, [fr, th]], [null, [fr]], [bogus, [th]], [storage throws, [th]]]
      expected: [th, th, en, th, en, th, th]
  - id: TC-U-1026
    scenario: setLanguage loads Thai once, sets html lang and storage, and emits languageChanged
    given: i18next on en with a languageChanged listener
    when: setLanguage('th') twice
    then: the Thai chunk import runs once; document.documentElement.lang is "th"; localStorage holds "th"; the listener was called once (the second call changes nothing)
    test_data:
      input: [th, th]
      expected: { imports: 1, lang: "th", notifications: 1 }
  - id: TC-U-1027
    scenario: t interpolates, pluralises and falls back
    given: catalogue entries common.stockCount_one "{{count}} stock", common.stockCount_other "{{count}} stocks" (th only _other "{{count}} หุ้น") and a key missing from th at runtime
    when: t('common.stockCount', { count: 1 }) and { count: 2 } in en and th; the missing key in th
    then: "1 stock", "2 stocks", "1 หุ้น", "2 หุ้น"; the missing key returns the English text
    test_data:
      input: counts 1, 2
      expected: ["1 stock", "2 stocks", "1 หุ้น", "2 หุ้น"]
  - id: TC-U-1028
    scenario: Trans renders tagged parts with components and no HTML parsing
    given: a message "Read the <link>guide</link> <b>now</b>" and a message containing "<img src=x>"
    when: rendered with Trans and components { link, b } (transKeepBasicHtmlNodesFor empty)
    then: an anchor with text guide and a strong with now; the second renders the literal text "<img src=x>"
    test_data:
      input: ["Read the <link>guide</link> <b>now</b>", "<img src=x>"]
      expected: [a + strong, text]
  - id: TC-U-1029
    scenario: formatDate uses CE years and Thai abbreviated months
    given: formatDate
    when: called with "2026-11-27", "2026-01-01", "2024-02-29" in en and th
    then: en "27 Nov 2026", "1 Jan 2026", "29 Feb 2024"; th "27 พ.ย. 2026", "1 ม.ค. 2026", "29 ก.พ. 2024"
    test_data:
      input: ["2026-11-27", "2026-01-01", "2024-02-29"]
      expected: ["27 พ.ย. 2026", "1 ม.ค. 2026", "29 ก.พ. 2024"]
  - id: TC-U-1030
    scenario: formatTimestamp takes the browser-local date
    given: TZ Asia/Bangkok
    when: formatTimestamp("2026-11-26T18:30:00Z", "th")
    then: "27 พ.ย. 2026"
    test_data:
      input: "2026-11-26T18:30:00Z"
      expected: "27 พ.ย. 2026"
  - id: TC-U-1031
    scenario: describeIssue translates server errors from rule and degrades safely
    given: field ticker; errors { rule tickerFormat }, { rule "futureRule" }, { message only, no rule }
    when: describeIssue in th
    then: Thai label + Thai rule text; the other two give the generic errors.invalidField text with the Thai label
    test_data:
      input: [tickerFormat, futureRule, none]
      expected: [label + MESSAGES_TH.tickerFormat, invalidField, invalidField]
  - id: TC-U-1032
    scenario: crumbs and tab titles follow the language
    given: renderApp('/stocks', emptyApi(), { language: 'th' })
    when: the page renders
    then: document.title is "หุ้น · Investhesis" and the breadcrumb shows หุ้น
    test_data:
      input: /stocks in th
      expected: "หุ้น · Investhesis"
  - id: TC-U-1033
    scenario: tests start in English
    given: a test that switched to th
    when: the next test starts
    then: getLanguage() is en, html lang is en and localStorage has no language
    test_data:
      input: two tests in sequence
      expected: en
  - id: TC-U-1034
    scenario: the static scan catches a new English literal
    given: a fixture component with <p>Hello</p>, aria-label="Close" and one with {t('x')}, data-testid="y", "Investhesis"
    when: the scan runs on the fixtures
    then: the first two are reported with file and line; the rest pass
    test_data:
      input: fixtures
      expected: 2 findings
```

**Notes** — If `Trans` cannot render a stray tag such as `<img src=x>` as literal text, report it as a blocker
instead of loosening TC-U-1028. Do not use `Intl.DateTimeFormat('th')` for dates: its default calendar is Buddhist
([ADR-005](design.md#key-decisions)). Keep `lib/number-format.ts` as it is (FR-009).

### T-005 — Web: language switch and saved language

```yaml
- title: Add the language switch to the account menu and auth pages; apply and save the account language
- description: >
  Implement design.md §Choosing the language and ux-design.md §Language switch.
  i18n/language-switch.tsx: menu variant (DropdownMenuLabel "ภาษา · Language" +
  DropdownMenuRadioGroup with ไทย / English items carrying lang) used in nav-user.tsx after the
  Account group; inline variant (role=group, two Buttons with aria-pressed and lang) in the
  AuthLayout brand row (justify-between). Choosing the current language does nothing. A polite
  live region announces the new language's name once. features/auth/current-user.ts: the app
  loader reads language from GET /me and, when not null and different, awaits setLanguage before
  returning; null leaves the store as is (OQ-1). features/settings/save-language.ts: after a
  menu switch, PATCH /settings { language }; on failure toast.error (10 s) with Retry that
  repeats the PATCH; no toast on success. Auth-page switch only sets the store. Sign-out keeps
  localStorage. Covers FR-001, FR-002, FR-003, NFR-001, NFR-004.
- agent: react-vite-developer
- depends_on: [T-004]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] Switching changes the page in place: same URL, no navigation, no loader re-run, typed form input kept
- [ ] The only request a menu switch sends is `PATCH /settings`; an auth-page switch sends none
- [ ] Keyboard: the menu items work with arrows and Enter; focus returns to the menu trigger; inline buttons keep focus
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1035
    scenario: choosing Thai in the account menu changes the page and saves
    given: renderApp('/stocks', stub with one stock) in en
    when: open Account menu, choose ไทย
    then: the h1 reads หุ้น, html lang "th", the stub received exactly one PATCH /settings { language "th" } and no other request after the click
    test_data:
      input: menu → ไทย
      expected: PATCH { language: "th" }
  - id: TC-U-1036
    scenario: choosing the current language sends nothing
    given: renderApp in en
    when: choose English
    then: no request, no toast
    test_data:
      input: menu → English
      expected: 0 requests
  - id: TC-U-1037
    scenario: a failed save keeps the language and offers Retry
    given: PATCH /settings answers 500 then 200
    when: choose ไทย, then press Retry in the toast
    then: the page stays Thai; toast.error shown with duration 10000 and Retry; Retry sends a second PATCH; no success toast
    test_data:
      input: [500, 200]
      expected: 2 PATCH calls, page th
  - id: TC-U-1038
    scenario: the saved account language applies before the page renders
    given: store on en; GET /me answers language "th"
    when: renderApp('/stocks')
    then: the first rendered h1 is หุ้น (no English h1 ever rendered); localStorage becomes "th"
    test_data:
      input: /me { language: "th" }
      expected: first h1 "หุ้น"
  - id: TC-U-1039
    scenario: a null account language leaves the browser's choice and writes nothing
    given: store on th from detection; /me language null
    when: renderApp('/stocks')
    then: page in Thai; no PATCH sent
    test_data:
      input: /me { language: null }
      expected: th, 0 PATCH
  - id: TC-U-1040
    scenario: typed form input survives a switch
    given: /stocks/new with ticker "AAPL" typed and a Thesis dialog with a typed note
    when: switch to ไทย via the store
    then: the ticker field still holds "AAPL" and the dialog note is unchanged; labels are Thai
    test_data:
      input: ticker "AAPL"
      expected: value kept
  - id: TC-U-1041
    scenario: the auth-page switch changes language without a request
    given: FakeAuthClient.signedOut(), /auth/sign-in in en
    when: press ไทย
    then: heading เข้าสู่ระบบ, aria-pressed true on ไทย, localStorage "th", no API call
    test_data:
      input: inline ไทย
      expected: เข้าสู่ระบบ
  - id: TC-U-1042
    scenario: switch items carry their own lang and the change is announced
    given: the open menu
    when: inspected and then English is chosen from Thai
    then: the ไทย item has lang="th", English lang="en"; the live region text becomes "English"
    test_data:
      input: th → en
      expected: live region "English"
```

### T-006 — Web: translate shell, auth and stocks

```yaml
- title: Move every user-facing string of the shell, auth pages, views, shared components and the stocks feature into the catalogue
- description: >
  Translate per ux-design.md §Thai on every screen and the glossary: components/layout (sidebar,
  nav-items labels as keys, breadcrumb, header, AuthLayout panel), components (page header,
  skeleton, placeholders, advice note), views (not-found, route error, account and every page
  shell), features/auth (forms, password rules messages, map-supabase-error text, toasts,
  check-email, link-expired, reset), features/stocks (StockTable headers and Held column, sort
  labels, stock detail, StockForm labels/options/help/toasts with lens options from
  lensValueLabel and canonical value in title, HoldingCard, HoldingDialog, delete dialog,
  format.ts counts via plurals). Field errors: checkValues and splitServerErrors use
  describeIssue (client issues decoded with issueRule, server errors with rule/params).
  sortStocks sorts lens columns by the displayed label with the language's collator ("Not set"
  last). Badges get whitespace-nowrap; table headers may wrap (ux-design.md §Wrapping). Dates
  through formatDate/formatTimestamp. Remove these files from the static-scan allow-list.
  Covers FR-004, FR-005, FR-007, FR-008, FR-009 for these areas.
- agent: react-vite-developer
- depends_on: [T-004]
- status: backlog
- size: L
```

#### Acceptance criteria

- [ ] No file of these areas remains in the static-scan allow-list
- [ ] Every existing test of these areas passes unchanged in English
- [ ] Stored values are unchanged: the stock form still sends canonical values in Thai
- [ ] The owner has read `catalogue/th/{common,nav,auth,stocks,holdings,errors}.ts`
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1043
    scenario: the stocks table shows Thai lens labels with the English value on hover
    given: a stock with gicsSector Energy, style Growth, holding null, language th
    when: renderApp('/stocks')
    then: cells show พลังงาน and เติบโต; the badge title is "Energy"; the ticker and company name are as stored
    test_data:
      input: { ticker: "PTT", name: "PTT PCL", gicsSector: "Energy", style: "Growth" }
      expected: ["พลังงาน", "เติบโต"], title "Energy"
  - id: TC-U-1044
    scenario: the stock form sends canonical values while showing Thai
    given: /stocks/new in th
    when: fill market TH, exchange SET, ticker PTT, name PTT, pick style เติบโต, save
    then: POST body has style "Growth"
    test_data:
      input: style option "เติบโต"
      expected: body.style = "Growth"
  - id: TC-U-1045
    scenario: client validation errors read in Thai
    given: /stocks/new in th
    when: save with ticker "!!"
    then: the ticker field error is the Thai label followed by MESSAGES_TH.tickerFormat
    test_data:
      input: ticker "!!"
      expected: Thai text
  - id: TC-U-1046
    scenario: server validation errors are translated from rule
    given: stub POST /stocks answers 400 with errors [{ path "exchange", message "must be SET or mai for market TH", rule "exchangeForMarket", params {...} }]
    when: save in th
    then: the exchange field shows the Thai text, not the English message
    test_data:
      input: 400 body as given
      expected: Thai rule text
  - id: TC-U-1047
    scenario: sorting a lens column follows the Thai label
    given: stocks with gicsSector Energy, Financials, Utilities and one unset, language th
    when: sort by sector ascending
    then: order Financials (การเงิน), Energy (พลังงาน), Utilities (สาธารณูปโภค), unset last
    test_data:
      input: 4 stocks
      expected: [Financials, Energy, Utilities, unset]
  - id: TC-U-1048
    scenario: counts and the holding card read in Thai
    given: a stock held { shares "10", averageCost "12.5", costCurrency THB } in th
    when: open /stocks/:id
    then: the card shows ถืออยู่, จำนวนหุ้น 10, ต้นทุนเฉลี่ย ฿12.50; the list count reads "1 หุ้น"
    test_data:
      input: holding THB 10 x 12.5
      expected: ["ถืออยู่", "฿12.50", "1 หุ้น"]
  - id: TC-U-1049
    scenario: auth errors read in Thai
    given: FakeAuthClient.signedOut() whose sign-in fails with invalid credentials, language th
    when: submit the sign-in form
    then: the form error is the Thai catalogue text for invalid credentials
    test_data:
      input: wrong password
      expected: Thai invalid-credentials text
  - id: TC-U-1050
    scenario: the not-found page and error boundary are translated
    given: language th
    when: renderApp('/nope') and a loader that throws 500
    then: Thai headings and the Thai link/reload labels
    test_data:
      input: ["/nope", throwing loader]
      expected: Thai text
```

### T-007 — Web: translate lists, imports, exports, filters, concentration, chains, theses

```yaml
- title: Move every user-facing string of the remaining features into the catalogue
- description: >
  Translate per ux-design.md §Thai on every screen and the glossary: features/lists (pages,
  dialogs, picker, membership toasts and Undo, list-name counts), features/imports (wizard,
  problemMessage, template help text "XLSX includes an Instructions sheet", the XLSX download
  calls /imports/template.xlsx?lang=<current>; error-rows CSV unchanged), features/exports
  (menu labels and toasts only: csvOfRows, tableOfRows and exportRow keep canonical values,
  OQ-2), features/stock-filters (toolbar, Filters sheet section titles = lens names, option
  labels via lensValueLabel with canonical title, find box matching label and canonical value,
  result line, address notes, scope select; filterOptions called with the language order),
  features/concentration (page, lens names, groups by Thai label with the order object,
  Over N% badge, settings dialog, notes, rate date via formatTimestamp), features/chains (lane
  names, counts, rename dialog and toasts; chain names untouched), features/theses (section,
  dialog, type labels, Edited date, delete and Undo, entry count plurals, character counter,
  advice note; dates via formatDate). Remove these files from the static-scan allow-list, which
  must then be empty. Covers FR-004 to FR-009, FR-011, FR-012 (web part).
- agent: react-vite-developer
- depends_on: [T-004]
- status: backlog
- size: L
```

#### Acceptance criteria

- [ ] The static-scan allow-list is empty
- [ ] Every existing test of these areas passes unchanged in English
- [ ] Exported CSV, clipboard text and backups are byte-identical in en and th
- [ ] A query change (filter, regroup, scope) still sends no request in Thai
- [ ] The owner has read `catalogue/th/{lists,imports,exports,filters,concentration,chains,theses}.ts`
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1051
    scenario: the filter sheet shows Thai options and its find box matches both spellings
    given: stocks with gicsSector Financials and Energy, language th, Filters sheet open
    when: type "การเงิน", then clear and type "Financials"
    then: each time only the Financials option is shown, labelled การเงิน, with the count "1 หุ้น" in its name
    test_data:
      input: ["การเงิน", "Financials"]
      expected: one option, value Financials
  - id: TC-U-1052
    scenario: filter links stay canonical
    given: language th
    when: tick การเงิน in the sector filter
    then: the address holds gicsSector=Financials
    test_data:
      input: tick การเงิน
      expected: "?gicsSector=Financials"
  - id: TC-U-1053
    scenario: concentration groups show Thai labels and tie order by Thai label
    given: one Energy and one Financials stock, lens gicsSector, language th
    when: open /concentration
    then: rows การเงิน then พลังงาน, each 50.0%, both with the Over 40% badge in Thai (เกิน 40%)
    test_data:
      input: 2 stocks
      expected: ["การเงิน", "พลังงาน"], badge "เกิน 40%"
  - id: TC-U-1054
    scenario: export bytes do not depend on the language
    given: the same two stocks
    when: export CSV and copy table once in en and once in th
    then: saved blob text and clipboard text are identical between languages and contain "Energy"
    test_data:
      input: en vs th
      expected: identical, canonical
  - id: TC-U-1055
    scenario: the template download sends the current language
    given: /import-export in th
    when: press the XLSX template button
    then: api.download called with "/imports/template.xlsx?lang=th"; the CSV button calls "/imports/template.csv"
    test_data:
      input: th
      expected: "?lang=th"
  - id: TC-U-1056
    scenario: import row problems read in Thai from rules
    given: preview stub with a row error { path "ticker", rule "repeatsRow", params { row 2 } }, language th
    when: the review step renders
    then: the row shows the Thai repeats-row text with 2
    test_data:
      input: repeatsRow { row: 2 }
      expected: Thai text containing "2"
  - id: TC-U-1057
    scenario: thesis entries show Thai type and dates
    given: an entry { type buy, date "2026-11-27", updated after creation } in th
    when: open the stock page
    then: badge ซื้อ, date "27 พ.ย. 2026", the Edited marker in Thai with its date; entry text as typed
    test_data:
      input: buy, 2026-11-27
      expected: ["ซื้อ", "27 พ.ย. 2026"]
  - id: TC-U-1058
    scenario: value chain lanes are translated, chain names are not
    given: chain "Oil & Gas" with an Upstream stock, language th
    when: open /chains
    then: the card title is "Oil & Gas"; lanes ต้นน้ำ, กลางน้ำ, ปลายน้ำ
    test_data:
      input: Oil & Gas, Upstream
      expected: ["Oil & Gas", "ต้นน้ำ", "กลางน้ำ", "ปลายน้ำ"]
  - id: TC-U-1059
    scenario: list toasts and Undo are translated
    given: a list with one stock, language th
    when: remove the stock from the list
    then: the toast text is Thai and its action is เลิกทำ
    test_data:
      input: remove member
      expected: action "เลิกทำ"
```

### T-008 — Bilingual auth emails

```yaml
- title: Make the confirmation and recovery email templates Thai then English
- description: >
  Per ux-design.md §Emails and ADR-009: rewrite supabase/templates/confirmation.html and
  recovery.html with a Thai part then an English part, each in a div with lang, each with its
  heading, sentence and the same link (unchanged URL and template variables); set the subjects in
  supabase/config.toml to "ไทย / English" pairs. Add the hosted-project step (paste the same
  templates and subjects) to supabase/README.md's hosted checklist. Extend
  scripts/supabase-auth.test.ts to read a recovery and a confirmation email from Mailpit and
  check both parts and the link. Covers FR-013.
- agent: software-engineer-backend
- depends_on: []
- status: doing
- size: S
```

#### Acceptance criteria

- [ ] `pnpm db:stop && pnpm db:start`, then `pnpm test:supabase` passes, including the existing email-link tests (the link is unchanged)
- [ ] The E2E auth specs that follow email links still pass
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1060
    scenario: the recovery email carries both languages and one link
    given: a confirmed admin-created user
    when: request a password reset and read the email in Mailpit
    then: the HTML has a lang="th" part with "รีเซ็ตรหัสผ่าน" before a lang="en" part with "Reset password"; both anchors have the same href containing token_hash and type=recovery; the subject contains "/"
    test_data:
      input: recovery for user@example.test
      expected: th part, en part, 2 equal hrefs
  - id: TC-U-1061
    scenario: the confirmation email carries both languages and one link
    given: an unconfirmed admin-created user
    when: resend the confirmation and read it
    then: Thai part first, English second, same href with type=email
    test_data:
      input: confirmation resend
      expected: th part, en part, 2 equal hrefs
```

### T-009 — Design test cases — Thai and English UI

```yaml
- title: Design test cases — Thai and English UI
- description: >
  Using the software-tester-design skill, produce structured TC-xxx test cases covering
  all test levels: unit boundaries, API (happy path + error paths + auth), frontend
  component, and E2E flows. Run Steps 0–4 (SUT definition → business flow → field specs
  → scenarios → test data). Output must be in TC-xxx format for software-tester-automation.
  Inputs: requirements.md, design.md, ux-design.md of this slice. Ids in the 1000 range
  (TC-A-10xx API, TC-C-10xx component, TC-E-10xx E2E), after the TC-U-1000..1061 of the tasks.
  Must cover every FR and NFR, the detection matrix (stored, browser, fallback, storage
  blocked), the account language following the investor to a second browser context, two-user
  isolation of the setting, the save-failure path, form input kept across a switch, every
  route and dialog state in Thai (axe light and dark, 360 px, clipped Thai marks by
  scrollHeight vs clientHeight on truncated text), canonical values in the address, exports,
  backups and template Stocks sheet, the no-request rule for query changes in Thai, NFR-001
  switch timing with 200 stocks, the NFR-002 bundle budget, the self-hosted font (no
  third-party request), the static English scan, and the bilingual emails. Save as
  docs/features/i18n/v1.0/test-cases.md.
- agent: software-tester-design
- depends_on: []
- status: done
- size: M
```

#### Acceptance criteria

- [ ] SUT definition documented
- [ ] TC-xxx cases cover happy path, boundaries, error paths, and business rules
- [ ] Each TC includes Level, Input, Expected Output, Preconditions, and Mock needed
- [ ] A traceability table maps every FR-001–FR-014 and NFR-001–NFR-007 to at least one TC

**Notes** — Runs in parallel with engineering tasks; depends only on requirements/design, not on code.

### T-010 — Automate tests — Thai and English UI

```yaml
- title: Automate tests — Thai and English UI
- description: >
  Using the software-tester-automation skill, convert the TC-xxx cases from T-009 into
  runnable scripts at the appropriate levels (Unit, API, Frontend Component, E2E).
  Run the full suite against the implementation. E2E specs are e2e/i18n-*.spec.ts on the
  existing Playwright setup (admin-created users, real API, local Supabase): switch in the menu
  and see it on a fresh browser context after sign-in; first visit with locale th-TH; auth-page
  switch; save failure (route the PATCH to 500); every state of e2e/lib/states.ts in Thai with
  axe in light and dark, 360 px with no horizontal scroll and the clipped-text check; export,
  backup and template Stocks sheet byte-equal across languages; Thai XLSX Instructions sheet;
  NFR-001 timing of a switch on /stocks with 200 stocks; no request to a host other than the
  app and Supabase; a build-size check for NFR-002. Add apiAs(...).saveLanguage and
  e2e/lib/i18n.ts helpers. Add the slice's TC ids to a report script (pnpm test:report:i18n) and
  write docs/features/i18n/v1.0/test-report.md; update CLAUDE.md (i18n layer, catalogue layout,
  rule ids on problems, language setting, Thai font, test defaults, commands) and remove the
  "UI copy is English only" note.
- agent: software-tester-automation
- depends_on: [T-001, T-002, T-003, T-004, T-005, T-006, T-007, T-008, T-009]
- status: backlog
- size: L
```

#### Acceptance criteria

- [ ] All TC-* from T-009 automated and passing (findings pinned with `test.fail` and a finding id only with the owner's agreement)
- [ ] Coverage >= 95% lines for `packages/domain`; >= 85% for `apps/api/src/modules/{settings,imports}`; >= 70% for `apps/web/src/features` and `apps/web/src/i18n`
- [ ] Test report produced with pass/fail per TC-id
- [ ] The full Investhesis gate is green

**Notes** — Report "T-010 done" with the full test report when all TCs pass. Contrast or
clipped-text failures found here go back to T-006 or T-007 as fixes.

## Status Legend

| Status | Changed By | Meaning |
|--------|-----------|---------|
| `backlog` | Orchestrator | Ready, waiting to be picked up |
| `doing` | Orchestrator / Agent | Agent actively working |
| `blocked` | Agent | Stuck, needs human intervention |
| `test` | Agent | Dev done, needs testing |
| `review` | Agent / Tester | Human must review before advancing |
| `done` | Human | Approved and complete |
