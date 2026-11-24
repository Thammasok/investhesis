---
version: 1.0
status: approved
date: 2026-11-24
source: Multi-Market Stock Watchlist Brief.md (UC-004, UC-005, UC-008; FR-007, FR-008, FR-012; NFR-001, NFR-009)
---

# Requirements: Search, Filter and Export

The investor finds stocks quickly on the stocks table and list pages by searching (ticker, name,
theme) and filtering (market, held status, any lens), carries the same filters to the
concentration view, and takes their data out: the filtered rows as CSV (download or copy), and a
full backup of everything as CSV and JSON so nothing is locked in. It builds on
[Stock Lists v1.0](../../stock-lists/v1.0/requirements.md), which stores the stocks, lenses and
lists and already sorts the table, and on
[Holdings and Concentration v1.0](../../holdings-concentration/v1.0/requirements.md), which adds
holdings, settings and the concentration page.

## Decisions taken for this slice

- **Filters reach three pages** (owner, 2026-11-24, [OQ-1](#oq-1)): the same search and filters on
  `/stocks` and `/lists/:id`, and carried to `/concentration`, which applies them inside its scope
  (brief FR-008 "group the filtered list").
- **The filtered CSV has the import-template columns, then lists and holdings** (owner, 2026-11-24,
  [OQ-2](#oq-2)), so the file re-imports, and the import skips the extra columns quietly.
- **Exported cells are written as typed** (owner, 2026-11-24, [OQ-3](#oq-3)): no formula escaping,
  the same as the import error CSV (Stock Lists TC-A-149).
- **The full backup is export only** (owner, 2026-11-24, [OQ-4](#oq-4)): CSV and JSON, no restore.
  The JSON carries a format version so a restore can come later.

## Actors

- **Investor (owner)** — the signed-in user. Searches, filters and exports cover only their own
  stocks, lists, holdings and settings ([NFR-003](#nfr-003)).

## Use Cases

### UC-001

**Search** — On the stocks table (`/stocks` or a list page) the investor types part of a ticker,
company name or theme and sees only the stocks that match.

### UC-002

**Filter** — The investor narrows the table by market, held status and any lens value (for
example "TH, held, Cyclical"), sees how many stocks match, and removes filters one by one or all
at once.

### UC-003

**Keep a view** — The investor reloads, bookmarks or goes Back to a searched, filtered and sorted
table and gets the same view.

### UC-004

**Concentration of what I filtered** — From a filtered table the investor opens the concentration
view for exactly those stocks, and can change the filters there.

### UC-005

**Export the filtered list** — The investor downloads the rows they see as a CSV file, or copies
them to paste into a spreadsheet.

### UC-006

**Back up everything** — On `/import-export` the investor downloads all their data as one CSV of
stocks and one JSON file with stocks, lists, holdings and settings.

## Functional Requirements

### FR-001

The system SHALL offer a search box on `/stocks` and `/lists/:id` that keeps the stocks whose
ticker, company name or any theme contains the typed text, ignoring case and surrounding spaces.
Thai text is matched as typed. An empty search keeps every stock.

### FR-002

The system SHALL offer filters on `/stocks` and `/lists/:id` for: market, exchange, held status
(held, not held), and every lens the concentration view groups by (Holdings and Concentration
[FR-006](../../holdings-concentration/v1.0/requirements.md#fr-006)): GICS sector, SET industry
group, value-chain name, value-chain position, size, style, economic cycle, Lynch type, life
cycle, customers, revenue types, moat, themes, volatility and index membership.

### FR-003

The system SHALL let the investor pick one or more values per filter, including "Not set" for a
stock with no value for that field. A stock matches a filter when it has any of the picked values
(for a multi-value field: any of its values is picked; "Not set" matches an empty list). A stock
is shown when it matches the search and every active filter.

### FR-004

The system SHALL list, for each filter, the values of the fixed vocabulary (`@investhesis/domain`)
and, for free-text fields (value-chain name, themes), the values present in the investor's saved
stocks, each with the number of stocks on the page that have it.

### FR-005

The system SHALL show the active search and filters as removable items with a "Clear all"
action, and the result count as "N of M stocks".

### FR-006

The system SHALL keep the search, the filters and the sort column and direction in the page
address, so a view can be reloaded, bookmarked and reached with the browser's Back button
(brief FR-020). Typing in the search box SHALL NOT add a history entry per keystroke. An address
with an unknown filter or value, or an unknown sort column, drops that part, shows one note per
dropped part, and is not rewritten (as on the concentration page, Holdings and Concentration
[FR-012](../../holdings-concentration/v1.0/requirements.md#fr-012)).

### FR-007

The system SHALL apply the search, filters and sort on a list page to that list's stocks only.

### FR-008

The system SHALL tell an empty result apart from an empty account or list: when no stock matches,
it says so and offers "Clear all"; the existing empty states stay for no stocks at all.

### FR-009

The system SHALL offer, on `/stocks` and `/lists/:id`, a link to the concentration view of the
stocks shown. It opens `/concentration` with the same search and filters, and with the scope set to
that list from a list page (all stocks from `/stocks`).

### FR-010

The system SHALL apply the search and filters on `/concentration` inside the chosen scope, show
the same filter controls and active filters there, and state how many stocks of the scope are
counted ("N of M stocks in scope"). Count and value shares are shares of the filtered stocks.
Filters live in the address next to scope, lens and measure.

### FR-011

The system SHALL let the investor download the stocks shown on `/stocks` or `/lists/:id`, in the
shown order, as a CSV file named `investhesis-stocks-YYYY-MM-DD.csv` (from `/stocks`) or
`investhesis-<list name>-YYYY-MM-DD.csv` (from a list, with characters a file name cannot hold
replaced by `-`), dated in the investor's local time.

### FR-012

The system SHALL write the CSV as UTF-8 with a byte-order mark, CRLF line ends and RFC 4180
quoting, with a header row and these columns in order:

| Column | Content |
|---|---|
| The 19 import-template columns | As in Stock Lists [FR-015](../../stock-lists/v1.0/requirements.md#fr-015): same headers, values in their canonical spelling, multi-value cells `;`-separated, `sector` holding GICS for `US` and the SET industry group for `TH` |
| `lists` | The names of the lists the stock is in, `;`-separated, by name |
| `held` | `yes` or `no` |
| `shares` | Shares as stored (exact decimal, no thousands separator), empty when unknown or not held |
| `average_cost` | Average cost per share as stored, empty when unknown or not held |
| `cost_currency` | `USD` or `THB`, empty when not held |

Cell text is written exactly as stored; cells starting with `=`, `+`, `-` or `@` are not escaped
([OQ-3](#oq-3)).

### FR-013

The system SHALL let the investor copy the same rows and columns to the clipboard as
tab-separated text, so they paste into spreadsheet columns, and SHALL confirm the copy. When the
browser refuses clipboard access, it SHALL say so and point to the download.

### FR-014

The system SHALL import a file written by [FR-012](#fr-012) through the existing import with no
errors and no unknown-column warnings: `lists`, `held`, `shares`, `average_cost` and
`cost_currency` are recognised and not imported (lists are not created, holdings are not set),
and the preview says so once.

### FR-015

The system SHALL offer, on `/import-export`, a full backup of all the investor's stocks as CSV
(`investhesis-backup-YYYY-MM-DD.csv`): the columns of [FR-012](#fr-012), every saved stock
whatever the filters or lists, ordered by market, then ticker.

### FR-016

The system SHALL offer, on `/import-export`, a full backup as JSON
(`investhesis-backup-YYYY-MM-DD.json`) holding: a format name and format version (`1`), the export
time in UTC; every stock with all its stored fields (id, ticker, market, exchange, name, every
lens value, lens sources, holding, created and updated times); every list with its id, name, times
and member stock ids; and the settings (threshold, USD to THB rate and its update time). Decimals
are strings. It SHALL NOT include the internal user id or any sign-in data.

### FR-017

The system SHALL still allow exports with nothing in them: a CSV with only the header row, and a
JSON backup with empty arrays and the current settings (defaults when none are saved).

## Non-Functional Requirements

### NFR-001

**Performance** — With 200 stocks, a keystroke in the search box or a filter change updates the
table, counts and concentration view in under 200 ms in the browser, with no API request
(brief NFR-001).

### NFR-002

**Performance** — With 1,000 stocks with holdings and 20 lists, the filtered CSV is ready in under
1 s in the browser, and a full backup (CSV or JSON) responds within 2 s (API p95, local Supabase).

### NFR-003

**Security** — Every export needs a signed-in user and holds only that user's rows (brief
NFR-003). Backup downloads send the bearer token, as the import templates do.

### NFR-004

**Privacy** — Search text, filters and exported data are never sent to a third party (brief
NFR-004, NFR-011). The API SHALL NOT log backup response bodies, and the existing log redaction of
holdings and the rate still applies.

### NFR-005

**Accuracy** — Exported decimals are exactly the stored values. Exporting all stocks and
importing the CSV into an account with no stocks gives stocks with the same ticker, market,
exchange, name and lens values.

### NFR-006

**Accessibility** — Search and every filter are labelled and keyboard-operable, each removable
filter item has an accessible name, the result count is announced politely when it changes, and
the controls meet WCAG 2.1 AA contrast in light and dark themes (brief NFR-008).

### NFR-007

**Usability** — The pages work on a 360 px wide phone without horizontal page scrolling; the
filters may collapse behind one control there (brief FR-015).

### NFR-008

**Portability** — The JSON backup format is documented (field names, types, format version) so
another tool can read it, and a later version keeps reading older format versions when restore
is built (brief NFR-009).

## Constraints

- Stock, list, holding and settings data and their vocabulary are those of Stock Lists v1.0 and
  Holdings and Concentration v1.0; this slice adds no new stored fields.
- The web already loads all the investor's stocks for `/stocks`, list pages and `/concentration`;
  search and filters run in the browser on that data.
- Reached only through the API; Supabase Postgres via Drizzle, any migration under
  `supabase/migrations/`.
- UI copy is English only until the i18n slice (brief NFR-007).

## Out of Scope

- Restoring from a JSON backup, and importing holdings or list memberships from CSV.
- Saved or named views, a column picker, and XLSX export.
- Fuzzy or typo-tolerant search, search over fields other than ticker, name and theme, and
  numeric range filters (shares, cost, value).
- A filter by list on `/stocks` (each list has its own page).
- Thesis notes and financials in the backup (not built yet; they join the JSON in a later format
  version).
- Scheduled or automatic backups.
- Thai UI labels.

## Open Questions

### OQ-1

Where do search and filters apply? **Proposed:** `/stocks` and list pages, carried to
`/concentration`. Alternatives: `/stocks` and list pages only; `/stocks` only.
**Resolved 2026-11-24:** all three pages.

### OQ-2

Which columns does the filtered CSV have? **Proposed:** the import-template columns, then lists
and holdings, with the import skipping the extra columns. Alternative: template columns only,
holdings only in the JSON backup.
**Resolved 2026-11-24:** template columns, then lists and holdings.

### OQ-3

Are cells starting with `=`, `+`, `-` or `@` escaped on export? **Proposed:** no, written as typed
for an exact round trip, as the import error CSV does. Alternative: prefix with `'`.
**Resolved 2026-11-24:** written as typed. This also settles the carried item "spreadsheet
formula escaping" in `docs/todo.md` for exports.

### OQ-4

Does this slice restore from the JSON backup? **Proposed:** no, export only, with a format
version. Alternative: export and restore (merge or replace, preview, conflicts).
**Resolved 2026-11-24:** export only.
