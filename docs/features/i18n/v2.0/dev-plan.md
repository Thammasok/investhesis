---
version: 2.0
status: active
date: 2026-11-27
requires: design.md
ux-design: ux-design.md
---

# Development Plan: Thai and English UI (react-i18next)

Builds [requirements.md](requirements.md) per [design.md](design.md) and
[ux-design.md](ux-design.md). Every engineering task follows the test gate (green before, green
after, then human review). The gate is the **Investhesis gate** in `CLAUDE.md` (Tests and the
Investhesis gate), run from the repo root: `pnpm db:start && pnpm db:reset`, `pnpm test:supabase`,
`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (with `E2E_WEB_PORT`
when 5173 is taken). `.claude/rules/test-gate.md` still lists Pacta's commands (carried work in
`docs/todo.md`).

**Fresh start.** i18n v1.0 was reverted in 613aaec; nothing of it is in the tree. Its code at
84b4a04 may be read for ideas but is not copied back: this slice keeps the API and domain
language-free ([design.md](design.md#key-decisions)).

**Test ids.** This slice uses the 1000 range (`TC-[UACE]-10xx`; every three-digit range is taken
by an earlier slice): `TC-U-10xx` in the task contracts below, and `TC-A-10xx`, `TC-C-10xx`,
`TC-E-10xx` from [T-007](#t-007--design-test-cases--thai-and-english-ui). Every test title starts
with its id.

**Tests stay in English.** `test/setup.ts` starts every web test in English
([ADR-012](design.md#key-decisions)); a task that moves a component's text into a catalogue keeps
the English wording identical, so existing tests and E2E specs pass unchanged. A change of English
wording is a defect of the task unless `ux-design.md` asks for it.

**Thai wording.** The lens catalogue is the approved table in
[ux-design.md](ux-design.md#thai-catalogue-for-lens-values-oq-1). Other Thai copy is written by the
task that moves the text; the owner reviews it at each task's review.

## Summary

- **Total tasks** — 8 (6 engineering, 1 test design, 1 test automation)
- **Estimated effort** — about 6.5 days of agent work (S ≈ 0.4 day, M ≈ 0.75 day, L ≈ 1.5 days);
  about 5.5 days elapsed
- **Critical path** — [T-002](#t-002--web-i18n-foundation) →
  [T-004](#t-004--web-shared-lookups-lenses-validation-problems-dates-crumbs) →
  [T-005](#t-005--web-translate-shell-auth-and-stocks) →
  [T-006](#t-006--web-translate-lists-imports-exports-filters-concentration-chains-and-theses) →
  [T-008](#t-008--automate-tests--thai-and-english-ui)
- **Parallel lanes** — [T-001](#t-001--api-language-setting) (API) and
  [T-002](#t-002--web-i18n-foundation) (web) start at once;
  [T-003](#t-003--web-language-switch-and-saved-language) runs beside T-004 and T-005 once T-001
  and T-002 are done. T-005 and T-006 are sequential on purpose: both edit the shared `common`
  catalogue and many shared components. [T-007](#t-007--design-test-cases--thai-and-english-ui)
  starts at once.

## Tasks

### T-001 — API: language setting

```yaml
- title: Store and serve the language setting
- description: >
  Per design.md §Data Model and §API Contracts. New migration
  supabase/migrations/20261127000000_user_language.sql adds app.user_settings.language text
  check (language in ('en','th')), nullable, no default. Drizzle typing in
  src/db/schema/holdings.ts (text with $type<'en' | 'th'>()); schema.drift.test.ts stays green.
  packages/domain SettingsPatch gains language: oneOf(['en','th']) .nullable().optional() (the
  existing oneOf message, so a bad value reads "must be one of: en, th"). modules/settings:
  language in SettingsOut, SettingsView (null without a row), SettingsRow, SettingsChange and the
  upsert; the empty-patch shortcut treats language like the other fields. buildBackup and BackupV2
  are not changed (ADR-007): a test proves the backup's settings object has no language key.
  Covers FR-002, NFR-006.
- agent: software-engineer-backend
- depends_on: []
- status: backlog
- size: S
```

#### Acceptance criteria

- [ ] `pnpm db:reset` applies the migration; `schema.drift.test.ts` passes
- [ ] `GET /settings` returns `language` (`null` for a user with no row or no choice)
- [ ] `PATCH /settings { language }` saves `en`, `th`, clears with `null`, and leaves the threshold and rate alone
- [ ] Any other value is `400 validation_failed` with the error on path `language`
- [ ] `GET /exports/backup.json` is unchanged (no `language`; still validates as `BackupV2`)
- [ ] OpenAPI at `/openapi.json` shows `language` on the settings schemas
- [ ] Coverage of `src/modules/settings/` stays at or above 85%; all TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1000
    scenario: SettingsPatch accepts the two languages and null
    given: SettingsPatch
    when: parsing { language: "th" }, { language: "en" }, { language: null }, {}
    then: each parses; the output keeps the value (absent stays absent)
    test_data:
      input: ["th", "en", null, absent]
      expected: ["th", "en", null, undefined]
  - id: TC-U-1001
    scenario: SettingsPatch rejects any other language
    given: SettingsPatch
    when: parsing { language: "TH" }, { language: "th-TH" }, { language: "fr" }, { language: 1 }
    then: each fails with one issue on path ["language"] and the domain oneOf message
    test_data:
      input: ["TH", "th-TH", "fr", 1]
      expected: { path: ["language"], message: "must be one of: en, th" }
  - id: TC-U-1002
    scenario: a user with no settings row reads language null
    given: a fresh user id with no app.user_settings row
    when: GET /settings
    then: 200 with language null, threshold 40, rate null; no row is created
    test_data:
      input: fresh user
      expected: { concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null, language: null }
  - id: TC-U-1003
    scenario: saving the language keeps the other settings
    given: settings { threshold 25, rate "35.500000" }
    when: PATCH /settings { language: "th" }, then GET /settings
    then: language "th", threshold 25, rate "35.500000", usdThbRateUpdatedAt unchanged
    test_data:
      input: { language: "th" }
      expected: { concentrationThreshold: 25, usdThbRate: "35.500000", language: "th" }
  - id: TC-U-1004
    scenario: null clears the language; an invalid value is a 400
    given: settings with language "th"
    when: PATCH { language: null }; then PATCH { language: "jp" }
    then: first answers language null; second answers 400 validation_failed, errors[0].path "language", and the stored value stays null
    test_data:
      input: [{ language: null }, { language: "jp" }]
      expected: [200 language null, 400 validation_failed]
  - id: TC-U-1005
    scenario: one user's language is invisible to another
    given: user A saves language "th"; user B has none
    when: B calls GET /settings
    then: B reads language null
    test_data:
      input: two users
      expected: B.language null
  - id: TC-U-1006
    scenario: the backup leaves the language out
    given: a user with language "th", threshold 30
    when: GET /exports/backup.json
    then: settings is exactly { concentrationThreshold, usdThbRate, usdThbRateUpdatedAt }; BackupV2.parse succeeds
    test_data:
      input: language "th"
      expected: no "language" key in settings
```

**Notes** — The database check and the domain enum carry the same two values; the `CHECK`
violation can't be reached through the API, only through SQL (covered in T-008 by a constraints
test).

### T-002 — Web: i18n foundation

```yaml
- title: Add i18next, catalogues, typed keys, detection, html lang and the Thai font
- description: >
  Per design.md §Components rows i18n.ts, locales, i18next.d.ts, language.ts, index.css and
  test/setup.ts, following Pacta's apps/web/src/locales/i18n.ts with English as default and
  fallback. Add i18next ^26.7, react-i18next ^17.1, @fontsource-variable/noto-sans-thai ^5.3 to
  apps/web. Create src/i18n/i18n.ts (LANGUAGES, Language, isLanguage, resources, initI18n with
  initAsync false, the i18n singleton), the namespace JSON files listed in design.md for en and
  th (each with at least the keys this task uses: common.language.*, common.appName), and
  src/types/i18next.d.ts. src/i18n/language.ts: detectLanguage({ stored, languages }) (FR-003
  order), readStoredLanguage/storeLanguage on localStorage key "investhesis.language" inside
  try/catch, applyLanguage(lng) (changeLanguage, document.documentElement.lang, store). main.tsx
  initialises before render with detectLanguage(readStoredLanguage(), navigator.languages) and
  imports the Thai subset CSS; index.css puts 'Noto Sans Thai Variable' after Geist in
  --font-sans. test/setup.ts initialises English and resets to English after each test; add
  renderInThai / withLanguage helpers in src/test/. Add src/i18n/bundles.test.ts (parity of keys
  per namespace allowing _one/_other vs _other plural suffixes, same {{vars}}, no empty string)
  and the catalogue size check of NFR-002 (sum of gzipped JSON <= 40 kB). No screen text moves in
  this task. Covers FR-003, FR-012, FR-013, NFR-002, NFR-003 (parity), NFR-005, NFR-006.
- agent: react-vite-developer
- depends_on: []
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] `t('common:nope')` (an unknown key) fails `pnpm typecheck`; a known key with a missing `{{var}}` option fails it too
- [ ] First paint is in the detected language; no request is made for catalogues (checked in the built `dist/`: catalogues in the entry chunk)
- [ ] `<html lang>` matches the language after init and after every change
- [ ] Thai text renders in Noto Sans Thai from the app's own origin; the font CSS imports only the Thai subset
- [ ] A blocked `localStorage` (getter throws) does not break start-up; detection falls back to the browser's languages
- [ ] Every existing web test passes unchanged; all TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1010
    scenario: a stored language wins over the browser
    given: stored "en", navigator.languages ["th-TH", "en-US"]
    when: detectLanguage
    then: "en"
    test_data:
      input: { stored: "en", languages: ["th-TH", "en-US"] }
      expected: "en"
  - id: TC-U-1011
    scenario: Thai before English in the browser picks Thai
    given: no stored language
    when: detectLanguage with each list
    then: Thai only when a Thai tag comes before any English tag
    test_data:
      input: [["th-TH","en-US"], ["th"], ["fr-FR","th","en"], ["en-GB","th-TH"], ["fr-FR"], []]
      expected: ["th", "th", "th", "en", "en", "en"]
  - id: TC-U-1012
    scenario: an invalid stored value is ignored
    given: stored "TH", "jp", "" or null
    when: detectLanguage with languages ["th"]
    then: "th" each time (falls through to the browser)
    test_data:
      input: ["TH", "jp", "", null]
      expected: "th"
  - id: TC-U-1013
    scenario: storage that throws is survived
    given: localStorage.getItem and setItem throw SecurityError
    when: readStoredLanguage(); storeLanguage("th")
    then: readStoredLanguage returns null; storeLanguage does not throw
    test_data:
      input: throwing storage
      expected: null, no throw
  - id: TC-U-1014
    scenario: applyLanguage updates i18next, html lang and storage
    given: i18n in "en"
    when: applyLanguage("th")
    then: i18n.language "th"; document.documentElement.lang "th"; localStorage["investhesis.language"] "th"
    test_data:
      input: "th"
      expected: { language: "th", htmlLang: "th", stored: "th" }
  - id: TC-U-1015
    scenario: the bundle parity check catches drift
    given: the real catalogues, then a copy with a key removed from th, a key added to th, a {{count}} renamed to {{n}} in th, and an empty th value
    when: the parity checker runs over each
    then: the real catalogues pass; each broken copy fails naming the namespace and key
    test_data:
      input: [real, missing key, extra key, variable mismatch, empty value]
      expected: [pass, fail, fail, fail, fail]
  - id: TC-U-1016
    scenario: plural keys are compared by base key
    given: en { "count_one": "{{count}} stock", "count_other": "{{count}} stocks" }, th { "count_other": "{{count}} หุ้น" }
    when: the parity checker runs
    then: passes; th without count_other fails
    test_data:
      input: en _one/_other, th _other
      expected: pass
  - id: TC-U-1017
    scenario: Thai plural resolves to the single form
    given: i18n in "th" with stocks.count_other "{{count}} หุ้น"
    when: t('stocks:count', { count: 1 }) and { count: 5 }
    then: "1 หุ้น" and "5 หุ้น"; in "en" "1 stock" and "5 stocks"
    test_data:
      input: [1, 5]
      expected: { th: ["1 หุ้น", "5 หุ้น"], en: ["1 stock", "5 stocks"] }
```

### T-003 — Web: language switch and saved language

```yaml
- title: Add the account-menu and auth-page switches and sync with the account setting
- description: >
  Per design.md §Components (use-language.ts, sync-account-language.ts, language-switch.tsx),
  ADR-003, ADR-004 and ux-design.md §Account menu, §Auth layout, §Language not saved toast. Add
  shadcn toggle-group (fix the cn import afterwards). useLanguage(): { language, setLanguage };
  setLanguage applies at once (applyLanguage), does nothing for the current language, and when
  signed in sends PATCH /settings { language } through the api client; on failure (not a 401,
  which follows the session-ended path) toast.error with Retry that resends. Account menu: the
  Language radio group of ux-design.md, menu button name translated. Auth layout: the toggle in
  the brand row, never emptied; on auth pages nothing is sent to the API. syncAccountLanguage(api,
  userId) runs in the app route's loader in parallel with /me, at most once per user id per tab
  (memo reset on sign-out and on a different user id), applies a non-null saved language, keeps
  the current one on null or failure, and sends nothing on later revalidations (TC-E-406 and
  TC-E-507 stay green). StubApi learns GET/PATCH /settings language. Covers FR-001, FR-002,
  FR-003, NFR-001 (no extra requests), NFR-004 (lang on options).
- agent: react-vite-developer
- depends_on: [T-001, T-002]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] Account menu shows Language with English and ไทย (each with `lang`), the current one checked
- [ ] Auth pages show the English | ไทย toggle; switching keeps typed email and password
- [ ] A switch changes the page without a reload, without changing the address, and keeps an open dialog's input
- [ ] Signed in, a switch sends exactly one `PATCH /settings { language }`; on auth pages it sends nothing
- [ ] Failed save: language stays, error toast with Retry; Retry resends; success shows no toast
- [ ] The saved setting is read once per user per tab; regrouping, filtering and form submits send no `/settings` read
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1020
    scenario: picking Thai in the account menu changes the page and saves
    given: renderApp('/stocks') signed in, language en, StubApi answering PATCH /settings
    when: open Account menu, pick "ไทย"
    then: the page h1 is the Thai stocks title; html lang "th"; one PATCH /settings with { language: "th" }; focus on the menu button
    test_data:
      input: pick ไทย
      expected: { requests: ["PATCH /settings {language:th}"], htmlLang: "th" }
  - id: TC-U-1021
    scenario: picking the current language sends nothing
    given: language en
    when: pick "English"
    then: no request; nothing changes
    test_data:
      input: pick English
      expected: { requests: [] }
  - id: TC-U-1022
    scenario: a failed save keeps the language and offers Retry
    given: PATCH /settings answers 503 once, then 200
    when: pick "ไทย"; then press the toast's Retry
    then: page stays Thai; toast.error with the Thai save-failed text and a Retry action; Retry sends a second PATCH; no second toast
    test_data:
      input: [503, 200]
      expected: { toasts: 1, patches: 2, language: "th" }
  - id: TC-U-1023
    scenario: the saved language applies after sign-in, once
    given: language en in this browser; GET /settings answers language "th"
    when: the app route loads /stocks, then the user changes a filter and submits a list rename
    then: the page is Thai; localStorage holds "th"; GET /settings was read exactly once
    test_data:
      input: saved "th"
      expected: { settingsReads: 1, language: "th" }
  - id: TC-U-1024
    scenario: no saved language keeps the current one and writes nothing
    given: language th from the browser; GET /settings answers language null
    when: the app route loads
    then: page stays Thai; no PATCH
    test_data:
      input: saved null
      expected: { language: "th", patches: 0 }
  - id: TC-U-1025
    scenario: a failed settings read never blocks the area
    given: GET /settings answers 500
    when: the app route loads /stocks
    then: the stocks page renders in the current language; no error page; no toast
    test_data:
      input: 500
      expected: stocks page shown
  - id: TC-U-1026
    scenario: the auth toggle switches without the API and keeps typed values
    given: /auth/sign-in signed out, email "a@example.test" typed
    when: press "ไทย" in the Language group, then press "ไทย" again
    then: the form is Thai, email still typed, no API request; the second press leaves Thai selected
    test_data:
      input: [press ไทย, press ไทย]
      expected: { language: "th", requests: [], email: "a@example.test" }
  - id: TC-U-1027
    scenario: switching keeps an open dialog's input
    given: /lists with the New list dialog open and "Dividend" typed
    when: switch to ไทย through useLanguage (from a test harness button outside the dialog)
    then: the dialog is still open with "Dividend" and Thai labels
    test_data:
      input: typed "Dividend"
      expected: value kept
  - id: TC-U-1028
    scenario: a different user in the same tab is read again
    given: user A synced (language th); sign out; user B signs in with saved "en"
    when: the app route loads for B
    then: GET /settings read again; page is English
    test_data:
      input: A th, B en
      expected: { settingsReads: 2, language: "en" }
```

### T-004 — Web: shared lookups (lenses, validation, problems, dates, crumbs)

```yaml
- title: Add lens labels, rule and problem lookups, date formatting and translated crumbs
- description: >
  Per design.md §Components rows labels.ts, messages.ts, format-date.ts, route-handle.ts and
  ADR-005, ADR-006, ADR-008, ADR-009. lenses.json (en and th) from the approved table in
  ux-design.md (lens names, all LENS_VALUES, notSet, thesis types, holding states).
  useLensLabels() and a non-hook lensLabels(t) return lensName/lensValue/notSet; an unknown
  stored value is shown as stored. validation.json has one key per domain MESSAGES key;
  ruleOf(message) returns { rule, params } built from MESSAGES (static map plus sentinel regexes
  for function messages); validationText(message, t) renders it or validation:invalid.
  problems.json has one key per problem code the web handles today (collect from every
  `error.code` / `case '...'` in apps/web/src plus the auth error codes) and generic;
  problemText(error, t, overrides) chooses override, then code, then status-based
  (network_error, 413, 415), then generic. format-date.ts: formatDay and formatInstantDay for
  en and th from text, CE year. RouteHandle.crumb accepts a key or (params, data, t); crumbOf
  takes t; AppBreadcrumb uses useTranslation. No screen is converted yet beyond the breadcrumb;
  nothing sorts by translated text. Covers FR-005, FR-007, FR-008, FR-009, FR-010, FR-011.
- agent: react-vite-developer
- depends_on: [T-002]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] Every `LENS_VALUES` value and every lens name has an entry in both languages (test over the domain's lists, so a new domain value fails the test)
- [ ] Every `MESSAGES` entry resolves through `ruleOf` to its own key, including the function messages
- [ ] Every problem code used in `apps/web/src` has an entry (test scans the sources for codes)
- [ ] Dates format as `27 Nov 2026` / `27 พ.ย. 2026` with no `Date` for `YYYY-MM-DD` input
- [ ] The breadcrumb re-renders in the new language on a switch
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1030
    scenario: lens values translate on screen and fall back to the stored text
    given: language th
    when: lensValue('gicsSector','Information Technology'), lensValue('setIndustryGroup','Agro & Food Industry'), lensValue('moat','Pricing power')
    then: Thai labels for the first two; the unknown value as stored
    test_data:
      input: [IT, Agro & Food Industry, "Pricing power"]
      expected: ["เทคโนโลยีสารสนเทศ", "เกษตรและอุตสาหกรรมอาหาร", "Pricing power"]
  - id: TC-U-1031
    scenario: every domain lens value has both labels and a safe key
    given: LENS_VALUES and LENS_LABELS from @investhesis/domain
    when: each is looked up in en and th lenses.json
    then: every value and lens name has a non-empty label in both; no value contains "." or ":"
    test_data:
      input: 65 values, 16 lens names
      expected: all present
  - id: TC-U-1032
    scenario: ruleOf identifies static messages
    given: MESSAGES.required, MESSAGES.tickerFormat, MESSAGES.thesisDateFuture
    when: ruleOf on each text
    then: { rule: "required" }, { rule: "tickerFormat" }, { rule: "thesisDateFuture" }
    test_data:
      input: ["is required", MESSAGES.tickerFormat, "can't be in the future"]
      expected: [required, tickerFormat, thesisDateFuture]
  - id: TC-U-1033
    scenario: ruleOf identifies function messages and their parameters
    given: MESSAGES.oneOf(["USD","THB"]), MESSAGES.exchangeForMarket("TH", ["SET","mai"]), MESSAGES.chainExists("AI & Semis", 3)
    when: ruleOf on each text
    then: oneOf { values: "USD, THB" }; exchangeForMarket { market: "TH", allowed: "SET or mai" }; chainExists { name: "AI & Semis", count: 3 }
    test_data:
      input: three messages
      expected: rules with params as listed
  - id: TC-U-1034
    scenario: every MESSAGES entry is covered and unknown text is generic
    given: every key of MESSAGES (functions called with sample args)
    when: ruleOf, then validationText in th
    then: each resolves to its own key and a non-empty Thai text; "some new message" gives validation:invalid in Thai, never the English text
    test_data:
      input: all MESSAGES keys + "some new message"
      expected: own keys; generic Thai text
  - id: TC-U-1035
    scenario: problemText prefers the override, then the code, then the status
    given: language th
    when: problemText for ApiError{404,not_found} with override {not_found: 'theses:entryGone'}; ApiError{409,list_name_taken}; ApiError{0,network_error}; ApiError{413,undefined}; ApiError{500,"weird_code"}
    then: entryGone text; list name taken text; network text; file too large text; generic text
    test_data:
      input: five errors
      expected: Thai texts per catalogue, never the API detail
  - id: TC-U-1036
    scenario: dates format per language from text
    given: "2026-11-27", "2026-01-05", "2026-13-01"
    when: formatDay(x,'en') and formatDay(x,'th')
    then: en "27 Nov 2026", "5 Jan 2026"; th "27 พ.ย. 2026", "5 ม.ค. 2026"; the invalid text returned as given
    test_data:
      input: ["2026-11-27", "2026-01-05", "2026-13-01"]
      expected: { en: ["27 Nov 2026", "5 Jan 2026", "2026-13-01"], th: ["27 พ.ย. 2026", "5 ม.ค. 2026", "2026-13-01"] }
  - id: TC-U-1037
    scenario: instant dates use the browser zone and CE year in Thai
    given: TZ Asia/Bangkok, "2026-12-31T18:30:00.000Z"
    when: formatInstantDay(x,'th')
    then: "1 ม.ค. 2027"
    test_data:
      input: "2026-12-31T18:30:00.000Z"
      expected: "1 ม.ค. 2027"
  - id: TC-U-1038
    scenario: crumbs follow the language
    given: /lists/:id with list name "Dividend" in en
    when: switch to th
    then: breadcrumb reads the Thai Lists label then "Dividend" (user text unchanged)
    test_data:
      input: switch
      expected: ["รายการ", "Dividend"]
```

### T-005 — Web: translate shell, auth and stocks

```yaml
- title: Move the shell, auth pages and stock screens into catalogues
- description: >
  Move every user-visible text (FR-004 list, including aria-label, sr-only text, toasts, tab
  titles) of components/layout (sidebar, nav items, breadcrumb, app and auth layouts), views
  for not-found and RouteError, PageHeader, PageSkeleton, features/auth (all pages, forms,
  password rules, auth error messages), features/stocks (table, detail page, stock form, holding
  card and dialog, delete dialog, actions' toasts and results) into the common, auth and stocks
  namespaces, with Thai written in the same task. Lens names and values through useLensLabels
  (T-004); dates through format-date; validation and problems through validationText/problemText.
  Route actions and loaders use i18n.t. English text stays identical (existing tests unchanged).
  Sorting stays on canonical values. Tab titles via the existing PageHeader. Covers FR-004,
  FR-005, FR-007, FR-008, FR-009, FR-010, FR-012 for these screens.
- agent: react-vite-developer
- depends_on: [T-004]
- status: backlog
- size: L
```

#### Acceptance criteria

- [ ] In Thai, the shell, every `/auth/*` page and `/stocks`, `/stocks/new`, `/stocks/:id`, `/stocks/:id/edit` show no English UI text (user data, codes and numbers excepted)
- [ ] Every existing web test and E2E spec for these screens passes unchanged
- [ ] Stock table order by a lens column is the same in both languages
- [ ] Stock form validation and 409 `stock_exists` show Thai text in Thai
- [ ] Thai at 360 px: no clipped tone marks or overflow on these screens (checked by hand at review; automated in T-008)
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1040
    scenario: the stocks page in Thai
    given: renderInThai('/stocks') with makeStock({ ticker: "PTT", gicsSector: "Energy", moat: "Brand" })
    when: rendered
    then: h1, column headers, Add stock button and count line are Thai; cells show "พลังงาน" and "แบรนด์"; ticker "PTT" as typed
    test_data:
      input: one TH stock
      expected: ["พลังงาน", "แบรนด์", "PTT"]
  - id: TC-U-1041
    scenario: sorting by a lens is canonical in both languages
    given: stocks with gicsSector Utilities, Energy, Financials
    when: sort by Sector ascending in en, then switch to th
    then: order Energy, Financials, Utilities in both (rows do not move on the switch)
    test_data:
      input: [Utilities, Energy, Financials]
      expected: [Energy, Financials, Utilities]
  - id: TC-U-1042
    scenario: client-side validation shows Thai
    given: renderInThai('/stocks/new')
    when: submit with ticker "@@" and no name
    then: the ticker and name errors are the Thai texts of tickerFormat and required; no request sent
    test_data:
      input: { ticker: "@@", name: "" }
      expected: Thai tickerFormat, Thai required
  - id: TC-U-1043
    scenario: the stock_exists problem shows Thai with its link
    given: POST /stocks answers 409 stock_exists with existingStockId "s1"
    when: submit a valid form in Thai
    then: the Thai stock-exists message with a link to /stocks/s1; the API detail text is not shown
    test_data:
      input: 409 stock_exists
      expected: Thai message, link /stocks/s1
  - id: TC-U-1044
    scenario: the sign-in page and its errors in Thai
    given: FakeAuthClient.signedOut() failing sign-in with invalid_credentials, language th
    when: submit sign-in
    then: labels, button and the invalid-credentials error are Thai
    test_data:
      input: invalid_credentials
      expected: Thai error text
  - id: TC-U-1045
    scenario: holding card and dialog in Thai keep number formats
    given: holding { shares "1250.5", averageCost "35.25", costCurrency THB }
    when: renderInThai('/stocks/s1')
    then: labels Thai; numbers "1,250.5" and "฿35.25" exactly as in English
    test_data:
      input: holding as given
      expected: ["1,250.5", "฿35.25"]
  - id: TC-U-1046
    scenario: toasts with Undo are Thai
    given: stock detail in Thai, stock in list "Dividend"
    when: remove from the list
    then: the toast text and the Undo action are Thai; the list name stays "Dividend"
    test_data:
      input: remove-from-list
      expected: Thai toast with "เลิกทำ"
  - id: TC-U-1047
    scenario: the not-found page and tab title follow the language
    given: renderInThai('/nope')
    when: rendered
    then: Thai not-found heading and link; document.title is Thai
    test_data:
      input: /nope
      expected: Thai title
```

### T-006 — Web: translate lists, imports, exports, filters, concentration, chains and theses

```yaml
- title: Move the remaining screens into catalogues and turn on the literal scan
- description: >
  Same rules as T-005 for features/lists, features/imports (wizard, problem messages, row errors
  via validationText, ignored-columns note), features/exports (menu, backup card; file contents
  and names unchanged), features/stock-filters (toolbar, Filters sheet with "<value>, <N> stocks"
  names, address notes), features/concentration (lens select from LENS order, groups, notes,
  settings dialog, Over N% badge), features/chains (cards, lanes, counts line, rename dialog,
  merge text, toasts) and features/theses (entries, dialogs, types, dates, Undo, load error).
  Exports, templates, the error-rows CSV and clipboard text keep canonical values (FR-006).
  Then add the static literal scan of NFR-003 and ADR-010 (oxc-parser dev dependency,
  src/i18n/literal-scan.test.ts, allowlist file reviewed at the task's review) and make it pass.
  Covers FR-004..FR-011 for these screens, FR-006, NFR-003.
- agent: react-vite-developer
- depends_on: [T-005]
- status: backlog
- size: L
```

#### Acceptance criteria

- [ ] In Thai, `/lists`, `/lists/:id`, `/import-export`, `/concentration`, `/chains` and the stock page's Thesis section show no English UI text
- [ ] CSV export, clipboard copy, templates, error-rows CSV and backups are byte-identical in en and th
- [ ] Filter addresses hold canonical values; an address made in Thai opens the same view in English
- [ ] Filters sheet options and concentration groups keep their order across a switch
- [ ] The literal scan passes with a short allowlist; adding `<p>Hello</p>` to a component makes it fail
- [ ] Every existing web test and E2E spec passes unchanged; all TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1050
    scenario: the Filters sheet in Thai with canonical address
    given: renderInThai('/stocks') with stocks in Energy and Utilities
    when: open Filters, tick the Thai "พลังงาน" option
    then: checkbox name "พลังงาน, 1 หุ้น"; the address holds ?gicsSector=Energy
    test_data:
      input: tick พลังงาน
      expected: { name: "พลังงาน, 1 หุ้น", search: "?gicsSector=Energy" }
  - id: TC-U-1051
    scenario: CSV export is the same in both languages
    given: the same three stocks
    when: Export CSV in en, then in th (saveFile mocked)
    then: both blobs are byte-identical, headers and lens values in English
    test_data:
      input: three stocks
      expected: identical bytes
  - id: TC-U-1052
    scenario: import row errors are Thai
    given: /imports/preview answers a row error with message MESSAGES.oneOf([...markets])
    when: the review step renders in Thai
    then: the row error shows the Thai oneOf text with the allowed values; the downloaded error CSV keeps the English message
    test_data:
      input: row 3 market "JP"
      expected: Thai on screen, English in the file
  - id: TC-U-1053
    scenario: import file problems are Thai
    given: /imports/preview answers 422 file_too_many_rows
    when: in Thai
    then: the Thai text naming the 1,000 limit
    test_data:
      input: file_too_many_rows
      expected: Thai text with "1,000"
  - id: TC-U-1054
    scenario: concentration in Thai keeps group order and numbers
    given: dataset with Energy 3 stocks, Utilities 3 stocks, threshold 40
    when: Group by Sector in en, then switch to th
    then: groups in the same order; labels Thai; "Over 40%" becomes "เกิน 40%"; percentages unchanged
    test_data:
      input: two equal groups
      expected: same order, Thai labels
  - id: TC-U-1055
    scenario: chains page lanes and merge text in Thai
    given: one chain "AI & Semis" with Upstream and Downstream stocks; rename to an existing chain answers 409 chain_exists
    when: in Thai, open Rename and save the clashing name
    then: lanes "ต้นน้ำ", "กลางน้ำ", "ปลายน้ำ"; the merge question is Thai with the chain name and count; chain names unchanged
    test_data:
      input: rename clash
      expected: Thai lanes and merge text
  - id: TC-U-1056
    scenario: thesis entries in Thai
    given: entries buy 2026-11-20 and review 2026-10-05 with target "180.0000"
    when: renderInThai('/stocks/s1')
    then: types "ซื้อ" and "ทบทวน"; dates "20 พ.ย. 2026" and "5 ต.ค. 2026"; target "180"; note text as typed
    test_data:
      input: two entries
      expected: ["ซื้อ", "ทบทวน", "20 พ.ย. 2026", "5 ต.ค. 2026"]
  - id: TC-U-1057
    scenario: the literal scan finds untranslated text
    given: a fixture component with JSX text "Hello", aria-label="Close", toast.success('Saved') and t('common:ok')
    when: the scanner runs over it
    then: three findings with line numbers; t() calls and allowlisted literals pass
    test_data:
      input: fixture
      expected: 3 findings
```

### T-007 — Design test cases — Thai and English UI

```yaml
- title: Design test cases — Thai and English UI
- description: >
  Using the software-tester-design skill, produce docs/features/i18n/v2.0/test-cases.md with
  TC-A-10xx (API: settings language, auth, isolation, backup unchanged, constraint), TC-C-10xx
  (web component: switch, sync, every screen in Thai, errors, dates, order, files unchanged,
  catalogue completeness, literal scan) and TC-E-10xx (E2E in a real browser: switch on the
  account menu and auth pages, language follows the account to a second browser context, Thai
  axe and contrast over the *_STATES screens, Thai at 360 px for overflow and clipped marks,
  keyboard use of both switches, no third-party request for fonts or catalogues, switch timing
  p95 <= 200 ms on 50 stocks, export files identical). Run Steps 0-4 (SUT definition, business
  flow, field specs, scenarios, test data). Cover every FR and NFR of requirements.md.
- agent: software-tester-design
- depends_on: []
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] SUT definition documented
- [ ] TC-xxx cases cover happy path, boundaries, error paths, and business rules
- [ ] Each TC includes Level, Input, Expected Output, Preconditions, and Mock needed
- [ ] A traceability table maps every FR-001..FR-013 and NFR-001..NFR-006 to at least one case

**Notes** — Runs in parallel with engineering tasks; depends only on requirements/design, not on code.

### T-008 — Automate tests — Thai and English UI

```yaml
- title: Automate tests — Thai and English UI
- description: >
  Using the software-tester-automation skill, convert the TC-xxx cases from T-007 into runnable
  tests: API (apps/api/src/modules/settings/settings.language*.test.ts, a constraints test for
  the CHECK), web component (features/*/ and src/i18n/ *-cases tests), and E2E
  (e2e/i18n-*.spec.ts with e2e/lib/i18n.ts; Thai variants of the a11y, responsive and keyboard
  checks over the existing *_STATES). Add scripts/i18n-report.mjs and the root script
  test:report:i18n (ids TC-[UACE]-10\d\d), and write docs/features/i18n/v2.0/test-report.md.
  Run the full Investhesis gate.
- agent: software-tester-automation
- depends_on: [T-001, T-002, T-003, T-004, T-005, T-006, T-007]
- status: backlog
- size: L
```

#### Acceptance criteria

- [ ] All TC-* from T-007 automated and passing (or pinned with `test.fail` and a finding id listed in the report)
- [ ] Coverage: `src/i18n/` at or above 90% lines; `src/features/` stays at or above 70%; `src/modules/settings/` at or above 85%
- [ ] Test report produced with pass/fail per TC-id (`pnpm test:report:i18n`)
- [ ] `CLAUDE.md` updated: i18n section in `apps/web`, the setting in `apps/api`, the commands and test files

**Notes** — Report "T-008 done" with the full test report when all TCs pass.

## Status Legend

| Status | Changed By | Meaning |
|--------|-----------|---------|
| `backlog` | Orchestrator | Ready, waiting to be picked up |
| `doing` | Orchestrator / Agent | Agent actively working |
| `blocked` | Agent | Stuck, needs human intervention |
| `test` | Agent | Dev done, needs testing |
| `review` | Agent / Tester | Human must review before advancing |
| `done` | Human | Approved and complete |
