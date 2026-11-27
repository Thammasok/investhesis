---
version: 2.0
status: approved
date: 2026-11-27
source: Multi-Market Stock Watchlist Brief.md (NFR-007)
supersedes: i18n v1.0 (reverted in 613aaec; its documents remain in history at 84b4a04)
---

# Requirements: Thai and English UI (react-i18next)

The investor uses Investhesis in Thai or in English and can switch at any time. The web app is
translated with react-i18next; the chosen language is saved with the investor's account settings
so it follows them across devices. What is stored, imported and exported keeps one canonical
English spelling, so the prototype data, CSV files, addresses and backups behave the same in both
languages. The brief's requirement is "Thai and English UI labels; numbers show the right currency
symbol (USD, THB)" (NFR-007).

This is a smaller, fresh slice after v1.0 was reverted. Unlike v1.0, the **API and domain do not
learn about languages** beyond storing the setting: the API keeps answering in English and the web
translates by code.

## Decisions taken for this slice

- **Scope is the web plus one account setting** (owner, 2026-11-27). The API stores and returns
  `language`; nothing else in the API or the domain changes behaviour.
- **Classification values are translated on screen only** (owner, 2026-11-27). Stored values,
  filter addresses, CSV import and export and the backups keep the canonical English spelling.
- **Errors are translated by the web from codes** (owner, 2026-11-27). The web maps its own
  client-side validation rules and the known API problem codes to catalogue entries; the API's
  English `detail` text is a fallback only.
- **Thai dates use Thai month names and the Common Era year** (owner, 2026-11-27):
  `27 พ.ย. 2026`, never Buddhist Era `2569`. Digits stay Arabic; numbers keep `1,234.56` grouping.
- **A self-hosted Thai web font** (owner, 2026-11-27), loaded from the app bundle, never a
  third-party font CDN.

## Actors

- **Investor** — the signed-in user, who reads Thai and English and picks one for the UI.
- **Visitor** — someone on the auth pages (sign-in, forgot password, email-link pages), not yet
  signed in.

## Use Cases

### UC-001

**Switch language** — From the account menu the investor picks ไทย or English; the page they are
on changes language at once and the choice is saved to their account.

### UC-002

**Work in Thai** — The investor adds, classifies, filters, imports, reviews concentration and value
chains and writes thesis entries with every label, message, date and lens value in Thai, while
their own text (tickers, names, themes, list and chain names, notes) stays as typed.

### UC-003

**Sign in in my language** — A visitor reaches the auth pages in the language of their last visit
in this browser, or else of their browser, and can switch it there.

### UC-004

**Exchange data unchanged** — The investor imports, exports, copies a table or takes a backup while
the UI is in Thai, and the files and addresses are the same as in English.

## Functional Requirements

### FR-001

The system SHALL offer a language switch with two choices, each named in its own language
(`ไทย`, `English`), in the account menu of the signed-in area and on every auth page. Choosing one
SHALL change every visible text of the current page to that language without a full page reload,
without changing the address, and without losing what is typed in an open form or dialog.

### FR-002

The system SHALL save the signed-in investor's choice as an account setting (`language`, next to
the concentration threshold and the USD/THB rate in `GET|PATCH /settings`) and apply it after
sign-in on any device. A failed save SHALL keep the new language on screen for this session, show
a message that it could not be saved, and offer Retry.

### FR-003

The system SHALL choose the language before the account setting is known (auth pages, first load,
after sign-out) in this order: the last language used in this browser; else Thai when the
browser's preferred languages list a Thai tag (`th`, `th-TH`, …) before any English tag; else
English. After sign-in a saved account setting wins and becomes the browser's last language. An
investor with no saved setting keeps the language on screen; nothing is written until they switch.

### FR-004

The system SHALL translate every text the web shows: navigation, page and tab titles, breadcrumbs,
headings, field labels, placeholders, help text, buttons, menus, table headers, empty states,
loading text, toasts (including Undo), dialogs, confirmations, the not-found and error pages, and
text read only by assistive technology (`aria-label`, screen-reader-only text, live-region
announcements). Counts SHALL read correctly in both languages ("1 stock" / "2 stocks"; Thai has no
plural form).

### FR-005

The system SHALL show, in the chosen language, wherever they appear (tables, stock page, form
options, Filters sheet, concentration groups, value-chain lanes): the lens names, every enumerated
lens value (GICS sector, SET industry group, value chain position, size, style, economic cycle,
Lynch type, life cycle, customers, revenue types, moat, volatility), thesis entry types, holding
states and "Not set". It SHALL NOT translate tickers, company names, market codes (`US`, `TH`),
exchanges, index names, currency codes, themes, value chain names, list names or thesis text.

### FR-006

The system SHALL keep data language-neutral: requests to the API carry canonical values, filter and
sort parameters in the address are canonical, and CSV and clipboard exports, import templates, the
error-rows CSV and backups are byte-identical in both languages (apart from the date in a file
name, which keeps its current `YYYY-MM-DD` form). An address copied from a Thai session SHALL open
the same view in an English one.

### FR-007

The system SHALL keep the order of lists that are ordered by canonical value (table sort by a lens
column, Filters sheet options, concentration groups of equal size, the `CONCENTRATION_LENSES`
order) the same in both languages, so switching language never reorders rows or groups. Ties
broken by user text keep their current rule.

### FR-008

The system SHALL show validation messages in the chosen language: every message the web raises
from its client-side checks (the domain `StockInput`, `HoldingInput`, `SettingsPatch`, `ListName`,
thesis and chain-rename rules) is looked up by the rule that failed, not by its English text.

### FR-009

The system SHALL show API problems in the chosen language by their `code` (and field errors by
field and rule where the API reports them): every problem code the web already handles
(`list_name_taken`, `stock_exists`, `already_in_list`, `chain_exists`, `chain_not_found`,
`thesis_exists`, `not_found`, `validation_failed`, the import file codes, `network_error`, auth
errors from Supabase, and the rest) has a catalogue entry in both languages. An unknown code SHALL
show a generic translated message, never a raw code; the API's English `detail` is not shown in
Thai.

### FR-010

The system SHALL format dates in the chosen language: English as today (`27 Nov 2026`), Thai with
abbreviated Thai month names and the Common Era year (`27 พ.ย. 2026`). Thesis dates keep being
read from their `YYYY-MM-DD` text, so no time zone can move the day.

### FR-011

The system SHALL keep number and money formatting the same in both languages (Arabic digits,
`,` grouping, `.` decimals, exact decimal strings, `USD`/`THB` shown as today); only the words
around numbers are translated.

### FR-012

The system SHALL set `<html lang>` to `th` or `en` to match the language on screen, and set each
page's tab title in that language.

### FR-013

The system SHALL render Thai text in a self-hosted Thai web font that sits after Geist in the font
stack, so Latin text keeps Geist and Thai text keeps one consistent face on every device.

## Non-Functional Requirements

### NFR-001

**Performance** — Switching language SHALL update the current page within 200 ms (p95, measured in
a real browser on the stock table with 50 stocks) and SHALL send no request except the one
`PATCH /settings` that saves it. Opening a page SHALL send no extra request for catalogues: both
languages ship in the bundle.

### NFR-002

**Bundle size** — The two catalogues together SHALL add at most 40 kB gzipped to the JavaScript
the app downloads, and the Thai font at most 60 kB per weight file (WOFF2, Thai subset).

### NFR-003

**Completeness** — Every key in the English catalogue SHALL exist in the Thai one and the reverse,
with the same interpolation variables; a test SHALL fail on a missing key, an extra key, a
mismatched variable or an empty value. No user-visible English literal SHALL remain in
`apps/web/src` outside the catalogues (checked by a static test with a short, reviewed allowlist:
product name, codes and test files).

### NFR-004

**Accessibility** — In both languages the pages SHALL keep their current WCAG 2.2 AA results (axe
with no new violation, contrast unchanged), each switch option SHALL carry `lang` for its own
language, and longer Thai labels SHALL not clip or overflow at 360 px width.

### NFR-005

**Type safety** — Translation keys SHALL be type-checked: a misspelled key or a missing
interpolation variable fails `pnpm typecheck`.

### NFR-006

**Privacy** — The language setting is the only new data stored. No catalogue lookup, font or
language detection SHALL reach a third party.

## Constraints

- react-i18next (with i18next) in `apps/web`, per the owner's request. No ICU or server-side
  translation.
- Stack, routing and data-loading patterns stay as in `CLAUDE.md` (Vite SPA, React Router data
  mode, actions return data, toasts through sonner).
- Canonical values and messages in `packages/domain` stay English and unchanged; the domain gains
  no i18n code. The web maps domain rules and values to its catalogues.
- The API's only change is the `language` setting (`'th' | 'en'`, nullable) on `app.user_settings`
  through a new Supabase migration, `SettingsPatch`, and `GET|PATCH /settings`.
- Existing tests keep running in English (the default in tests), so they need no rewrite beyond
  where a component's text source moves.

## Out of Scope

- Translated API `detail` text, domain messages or problem bodies on the server.
- Auth emails from Supabase (confirmation, recovery) and the import template's instructions: both
  stay English.
- Languages other than Thai and English; right-to-left layouts.
- Buddhist Era years and Thai digits.
- Translating user-entered text or the canonical values in files and addresses.
- Thai search for lens values (search keeps matching ticker, name and themes only).

## Open Questions

### OQ-1

The Thai wording of the lens values (GICS sectors, SET industry groups, Lynch types and the rest)
needs the owner's review. Proposal: the design drafts the Thai catalogue from SET's and common Thai
broker usage, and the owner approves it in the UX phase before the screen tasks start.
