---
version: 1.0
status: approved
date: 2026-11-27
source: Multi-Market Stock Watchlist Brief.md (NFR-007; FR-015, FR-020; NFR-008, NFR-009)
---

# Requirements: Thai and English UI

The investor uses Investhesis in Thai or in English and can switch at any time. Every screen,
message, date and classification label is shown in the chosen language, while what is stored,
imported and exported keeps one canonical English spelling so the prototype data, CSV files and
backups keep working. The brief's requirement is "Thai and English UI labels; numbers show the
right currency symbol (USD, THB)" (NFR-007). It covers every page built so far:
[User Auth v1.2](../../user-auth/v1.2/requirements.md),
[Stock Lists v1.0](../../stock-lists/v1.0/requirements.md),
[Holdings and Concentration v1.0](../../holdings-concentration/v1.0/requirements.md),
[Search, Filter and Export v1.0](../../search-filter-export/v1.0/requirements.md),
[Thesis Log v1.0](../../thesis-log/v1.0/requirements.md) and
[Value Chains v1.0](../../value-chains/v1.0/requirements.md).

## Decisions taken for this slice

- **The language is an account setting** (owner, 2026-11-27). A Thai / English switch in the
  account menu saves the choice with the investor's settings, so it follows them to every device.
  Before sign-in the browser's language decides ([FR-003](#fr-003)).
- **Classification values are translated on screen only** (owner, 2026-11-27). Lens values
  (GICS sectors, SET industry groups, Lynch types, moat, style and the rest) are shown in the
  chosen language; stored values, CSV import and export, and the backups keep the canonical
  English spelling, so the 35-stock prototype and earlier exports import unchanged.
- **Thai dates use Thai month names and the Common Era year** (owner, 2026-11-27): `27 พ.ย. 2026`,
  not the Buddhist Era `2569`. Digits stay Arabic and numbers keep the `1,234.56` grouping.
- **In scope beyond the screens** (owner, 2026-11-27): validation and API error messages, the
  auth emails, a Thai web font, and the import template's instructions.

## Actors

- **Investor (owner)** — the signed-in user, who reads Thai and English and picks one for the UI.
- **Visitor** — someone on the sign-in, forgot-password or email-link pages, not yet signed in.
- **Email recipient** — the investor reading a confirmation or password-reset email sent by
  Supabase Auth.

## Use Cases

### UC-001

**Switch language** — From the account menu the investor picks ไทย or English; the page they are
on changes language at once, and the choice is remembered on every device they sign in from.

### UC-002

**Work in Thai** — The investor adds, classifies, filters and reviews stocks with every label,
message, date and lens value in Thai, while tickers, company names and their own text stay as
typed.

### UC-003

**Sign in in my language** — A visitor reaches the sign-in page and sees it in the language of
their last visit, or of their browser; they can switch it there.

### UC-004

**Exchange data unchanged** — The investor imports a CSV, downloads a template, exports the list
or takes a backup while the UI is in Thai, and the files are the same as in English (canonical
column names and values), so they round-trip.

### UC-005

**Read an auth email** — A recipient opens a confirmation or reset email and can read it whether
they prefer Thai or English.

## Functional Requirements

### FR-001

The system SHALL offer a language switch with two choices, each named in its own language
(`ไทย`, `English`), in the account menu of the signed-in area and on the auth pages. Choosing one
SHALL change every visible text of the current page to that language without a full page reload,
without changing the address, and without losing what the investor has typed in an open form or
dialog.

### FR-002

The system SHALL save the signed-in investor's choice as an account setting (with the settings of
Holdings and Concentration) and apply it on every device after sign-in. A failed save SHALL keep
the new language on screen for this session, tell the investor it could not be saved, and offer
to retry.

### FR-003

The system SHALL choose the language before the account setting is known (auth pages, first
load, after sign-out) in this order: the last language used in this browser; else Thai when the
browser's preferred languages put a Thai tag (`th`, `th-TH`, ...) before any English tag; else
English. Once signed in, the account setting wins and becomes the browser's last language. An
investor with no saved setting keeps the language they were shown and it is saved on their first
switch ([OQ-1](#oq-1)).

### FR-004

The system SHALL translate every text it shows: navigation, page and tab titles, breadcrumbs,
headings, field labels, placeholders, help text, buttons, menus, table headers, empty states,
loading text, toasts (including Undo), dialogs, confirmation text, the not-found and error pages,
the advice note, and text read only by screen readers (`aria-label`, screen-reader-only text,
live-region announcements). Plurals and counts SHALL read correctly in both languages ("1 stock"
/ "2 stocks"; Thai has no plural form).

### FR-005

The system SHALL show these values in the chosen language wherever they appear (table, stock
page, form options, filter sheet, concentration groups, value-chain lanes): every enumerated lens
value (GICS sector, SET industry group, value chain position, size, style, economic cycle, Lynch
type, life cycle, customers, revenue types, moat, volatility), the lens names, thesis entry types,
"Not set", and holding states. It SHALL NOT translate tickers, company names, market codes
(`US`, `TH`), exchanges, index names, currency codes, themes, value chain names, list names or
thesis text, which are shown as stored.

### FR-006

The system SHALL keep stored values language-neutral: the API stores and returns the canonical
English lens values whatever the UI language, the address keeps the canonical values in filter
parameters (so a link copied in Thai opens the same view in English). Search keeps matching
ticker, name and themes as typed; it does not search lens labels in either language.

### FR-007

The system SHALL sort and group by what the investor sees: sorting a lens column, the filter
sheet's options and same-size concentration groups SHALL follow the displayed label in the
current language's collation, with "Not set" last as today.

### FR-008

The system SHALL show validation messages in the current language, both those the browser checks
(the shared domain rules) and those the API returns. The web SHALL derive the text from the
problem `code` and the field issue (path and rule) the API sends, not from the API's English
`detail`; a code or rule it does not know SHALL show a generic translated message and keep the
field highlighted. The API's own responses stay in English.

### FR-009

The system SHALL format dates in the chosen language from one rule: English `27 Nov 2026`, Thai
`27 พ.ย. 2026` (Common Era year, Thai abbreviated month), including thesis dates and their
"Edited" date, the rate's updated date and import results. Date inputs keep the `YYYY-MM-DD`
value they send. Numbers keep Arabic digits, the `,` group and `.` decimal separators and the
`$` / `฿` symbols in both languages.

### FR-010

The system SHALL set the document's `lang` attribute to `th` or `en` to match the chosen
language, and SHALL show Thai text in a font with Thai glyphs that matches the Latin font's size
and weight, with a line height that keeps Thai vowel and tone marks from clipping.

### FR-011

The system SHALL keep exchanged files language-neutral: CSV and clipboard export, the JSON and
CSV backups, the import template columns and example rows, and the error-rows CSV use the
canonical English column names and values in both languages ([OQ-2](#oq-2)). Downloaded file
names stay as today.

### FR-012

The system SHALL give the import template instructions in the current language: the XLSX
template gains an instructions sheet (what each column takes and its allowed values, with the
Thai label next to the canonical value), and the import page's guidance text is translated. The
CSV template stays header plus example rows, so it imports as is.

### FR-013

The system SHALL send the confirmation and password-reset emails with both Thai and English text
in one message ([OQ-3](#oq-3)), each part with its own heading and the same link.

### FR-014

The system SHALL fall back to English for any text missing from the Thai catalogue rather than
show a key or a blank, and the build checks SHALL fail when a key exists in one catalogue and not
the other ([NFR-006](#nfr-006)).

## Non-Functional Requirements

### NFR-001

**Performance** — Switching language re-renders the current page within 200 ms with 200 stocks
on `/stocks` (browser test environment, the bar of brief NFR-001) and sends no request other than
saving the setting. Filtering and regrouping in Thai stay within the 200 ms of brief NFR-001.

### NFR-002

**Performance** — The language catalogue and the i18n library runtime add at most 40 KB gzipped to the first page
load (whole app, both languages or the lazy one included), and the Thai font loads only the Thai and
Latin subsets used.

### NFR-003

**Privacy** — The font and catalogues are served by the app itself (no third-party font or
translation service at runtime), so no request reveals the investor's pages to a third party
(brief NFR-004, NFR-011).

### NFR-004

**Accessibility** — Both languages meet WCAG 2.1 AA contrast in light and dark themes, the
language switch is keyboard operable and announces the selected language, and screen readers
read Thai text with a Thai voice because `lang` is set ([FR-010](#fr-010); WCAG 3.1.1). The
switch's options carry `lang` for their own language (WCAG 3.1.2).

### NFR-005

**Usability** — Every page, dialog and sheet works in Thai on a 360 px wide phone without
horizontal scrolling or clipped text; longer Thai labels wrap rather than overflow (brief
FR-015).

### NFR-006

**Maintainability** — All user-facing text lives in per-language catalogues with typed keys, so a
missing or misspelt key fails `pnpm typecheck`; a static test fails on a user-visible English
string literal left in a component (allow-list for brand names, codes and test ids).

### NFR-007

**Quality** — Thai copy follows one glossary of finance terms (lens values, holding, cost,
concentration, thesis types) approved by the owner, used the same way on every page.

## Constraints

- Stack as decided: React 19 + Vite SPA, Fastify API, Supabase Postgres via Drizzle with a
  migration under `supabase/migrations/` for the new setting. The i18n library is i18next
  with react-i18next (design ADR-001).
- Domain rules stay in `@investhesis/domain` (no I/O, Zod only); its `MESSAGES` and
  `LENS_LABELS` maps were kept in one place for this slice and become keyed messages.
- The API stays the only database client and keeps its English problem details and OpenAPI
  contract; error codes and issue rules are the stable interface the web translates.
- Existing behaviour and tests keep passing in English; tests that assert English copy keep
  running with the language set to English.
- Supabase Auth sends the emails, so the template stays a static HTML file per email type.

## Out of Scope

- Languages other than Thai and English, right-to-left layouts, and per-language URLs (`/th/...`).
- Translating user content: company names, themes, chain names, list names, thesis text.
- Buddhist Era years, Thai digits, and changes to number grouping or currency symbols.
- Localised CSV column names or values, and importing files that use Thai lens labels.
- Translating the API's problem `detail`, the OpenAPI document, logs and Supabase Studio.
- Per-recipient email language (would need the language in Supabase user metadata).
- Data provider, financials and live prices (later slices).

## Open Questions

### OQ-1

What language does a signed-in investor with no saved setting get? **Proposed:** the language
they were shown before sign-in (browser-derived, [FR-003](#fr-003)), not written to the account
until they switch, so a first sign-in sends no extra write. Alternative: save it on first
sign-in, so a second device shows the same language even before any switch.

**Resolved 2026-11-27:** language shown before sign-in; nothing written until the first switch.

### OQ-2

Should "Copy to clipboard" on the stocks page copy the labels on screen (Thai) or the canonical
values? **Proposed:** canonical values, like the CSV, so a pasted table can be imported back and
compares across languages. Alternative: the labels as shown, which reads better when pasted into
a Thai document.

**Resolved 2026-11-27:** canonical values, like the CSV.

### OQ-3

How should the auth emails pick a language? **Proposed:** one email with Thai first, then
English, since Supabase sends them from a static template and the app's language setting is not
in Supabase's user record. Alternative: copy the language into the user's Supabase metadata on
every switch and branch the template on it, which adds a write to Supabase Auth on each switch.

**Resolved 2026-11-27:** one email, Thai first, then English.
