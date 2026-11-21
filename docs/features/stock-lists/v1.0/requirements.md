---
version: 1.0
status: approved
date: 2026-11-21
source: Multi-Market Stock Watchlist Brief.md (UC-001, UC-002 partly, UC-007, UC-009)
---

# Requirements: Stock Lists

The investor saves US and Thai stocks to their account, classifies them on the 10 lenses while
adding them, organises them into named lists, and loads many at once from a CSV or Excel file.
Everything is stored in the Investhesis database (Supabase Postgres, reached only through the API).

This slice is the foundation the later slices (concentration, value chains, financials, thesis,
data-provider lookup and refresh, export) build on, so its data model must leave room for them
without building them.

## Decisions taken for this slice

These were agreed with the owner on 2026-11-21 and shape the requirements below.

- A stock holds its **identity and all 10 lens values**. A richer classify and edit experience
  can come later; this slice already stores and edits every lens.
- **Manual entry only.** No market-data provider is called. Provider lookup and daily refresh are
  a later slice, once providers are chosen.
- **Import duplicates are resolved in the preview.** The user chooses, per import, whether rows
  that match an already-saved stock are skipped or update it.
- **Investhesis defines its own import template** (headers and values from the brief's lens
  table). The prototype's data is converted to that template.

## Actors

- **Investor (owner)** — the signed-in user: a Supabase Auth account per
  [User Auth v1.0](../../user-auth/v1.0/requirements.md), or the API's mock user (`AUTH_MODE=mock`)
  in development and tests. They own every stock, list and import they create, and can see only
  their own.

## Use Cases

### UC-001

**Add a stock** — The investor enters a ticker and market (US or TH), the company's identity
details and any lens values, and optionally picks lists to put it in. The stock is saved to their
account.

### UC-002

**Edit or delete a stock** — The investor corrects a saved stock's details or lens values, or
deletes it. Deleting removes it from every list.

### UC-003

**Manage lists** — The investor creates, renames and deletes named lists (e.g. Core holdings,
Watching, Swing study). They add saved stocks to a list and remove them from it. One stock can be
in several lists.

### UC-004

**Browse stocks** — The investor sees all their saved stocks, or one list's stocks, in a table.

### UC-005

**Import stocks from a file** — The investor downloads the template, fills it (or converts the
prototype data to it), uploads a `.csv` or `.xlsx` file, picks a target list, reviews a preview
with per-row errors and duplicates, chooses how to treat duplicates, and confirms. The valid rows
are saved and added to the target list.

## Functional Requirements

### Stocks

#### FR-001

The system SHALL let the investor add a stock with these identity fields:

| Field | Rule |
|---|---|
| Ticker | Required. 1–12 characters from `A–Z`, `0–9`, `.` and `-`. Lower-case input is upper-cased and surrounding spaces are trimmed before validation (`brk.b` → `BRK.B`). |
| Market | Required. `US` or `TH`. |
| Exchange | Required. `NYSE` or `NASDAQ` when market is `US`; `SET` or `mai` when market is `TH`. |
| Trading currency | Set by the system from the market: `USD` for `US`, `THB` for `TH`. Not user-editable. |
| Company name | Required. 1–200 characters. Any Unicode text, including Thai. |
| Index membership | Optional, zero or more. `S&P 500`, `Nasdaq-100` for `US`; `SET50`, `SET100` for `TH`. |

#### FR-002

The system SHALL reject adding a stock whose (market, ticker) is already saved by the same
investor, and say which saved stock it duplicates. The same ticker in a different market is a
different stock.

#### FR-003

The system SHALL let the investor set any of the 10 lenses when adding or editing a stock. Every
lens is optional. Values outside the allowed set are rejected.

| # | Lens | Allowed values |
|---|---|---|
| 1 | Sector | `US`: one GICS sector (Communication Services, Consumer Discretionary, Consumer Staples, Energy, Financials, Health Care, Industrials, Information Technology, Materials, Real Estate, Utilities). `TH`: one SET industry group (Agro & Food Industry, Consumer Products, Financials, Industrials, Property & Construction, Resources, Services, Technology) **and** one mapped GICS sector. |
| 2 | Value chain position | Chain name (free text, 1–60 characters) and one position: Upstream, Midstream, Downstream, Integrated, None. A position needs a chain name, except None. |
| 3 | Size | One of Mega, Large, Mid, Small, Micro. |
| 4 | Style | One of Growth, Value, Dividend, Quality. |
| 5 | Economic cycle | One of Cyclical, Sensitive, Defensive. |
| 6 | Peter Lynch type | One of Fast Grower, Stalwart, Slow Grower, Cyclical, Turnaround, Asset Play. |
| 7 | Business life cycle | One of Growth, Mature, Turnaround, Decline. |
| 8 | Business model | Customers: zero or more of B2B, B2C, Government. Revenue types: zero or more of Subscription, Transaction fee, Product sale, Ads, Rent, Interest. |
| 9 | Moat | One of Brand, Network effect, Switching cost, Cost advantage, Efficient scale, Intangibles, Unclear. |
| 10 | Theme and volatility | Themes: zero or more free-text tags (each 1–40 characters, duplicates ignored case-insensitively, at most 20). Volatility: one of High, Mid, Low. |

#### FR-004

The system SHALL record, for each lens field, whether its value came from the user (`manual`) or
from a system default (`default`). In this slice the only `default` is the economic cycle under
[FR-005](#fr-005). Later slices add `auto` (provider) without changing the existing records.

#### FR-005

The system SHALL default the economic cycle from the (mapped GICS) sector when the investor sets a
sector and has not set the economic cycle:

| Economic cycle | GICS sectors |
|---|---|
| Cyclical | Materials, Consumer Discretionary, Financials, Real Estate |
| Sensitive | Communication Services, Energy, Industrials, Information Technology |
| Defensive | Consumer Staples, Health Care, Utilities |

The defaulted value is marked `default`. A user-set economic cycle (`manual`) is never replaced
by a default, even when the sector changes. If the sector changes and the cycle is still
`default`, the cycle follows the new sector.

#### FR-006

The system SHALL let the investor edit every field of a saved stock except market and ticker.
To change those, the investor deletes the stock and adds it again.

#### FR-007

The system SHALL let the investor delete a saved stock after a confirmation step. Deleting it
removes it from every list.

#### FR-008

The system SHALL show the investor's saved stocks in a table at `/stocks`, with ticker, company
name, market, exchange, sector, size, style and the lists each stock is in. The table SHALL be
sortable by ticker, name, market and sector, and SHALL show an empty state that links to adding a
stock and to importing.

### Lists

#### FR-009

The system SHALL let the investor create a list with a name of 1–60 characters (trimmed). List
names are unique per investor, ignoring case.

#### FR-010

The system SHALL let the investor rename a list, under the same rules as [FR-009](#fr-009).

#### FR-011

The system SHALL let the investor delete a list after a confirmation step. Deleting a list does
not delete its stocks.

#### FR-012

The system SHALL let the investor add a saved stock to a list and remove it from a list. Adding a
stock that is already in that list is rejected with a message, and the list is unchanged.

#### FR-013

The system SHALL show the investor's lists at `/lists`, each with its stock count, and let the
investor open a list to see its stocks in the same table as [FR-008](#fr-008).

#### FR-014

The system SHALL let the investor choose zero or more lists when adding a stock
([FR-001](#fr-001)). A stock in no list is still saved and shown at `/stocks`.

### Import

#### FR-015

The system SHALL offer a downloadable template on `/import-export`, as both `.csv` and `.xlsx`,
with one header row in the column order below and one example row per market.

| Column header | Maps to |
|---|---|
| `ticker` | Ticker |
| `market` | Market |
| `exchange` | Exchange |
| `name` | Company name |
| `index_membership` | Index membership, `;`-separated |
| `sector` | Sector (GICS for `US`, SET industry group for `TH`) |
| `gics_sector` | Mapped GICS sector (`TH` rows; ignored for `US`) |
| `value_chain` | Value chain name |
| `value_chain_position` | Value chain position |
| `size` | Size |
| `style` | Style |
| `economic_cycle` | Economic cycle |
| `lynch_type` | Peter Lynch type |
| `life_cycle` | Business life cycle |
| `customers` | Business model customers, `;`-separated |
| `revenue_types` | Business model revenue types, `;`-separated |
| `moat` | Moat |
| `themes` | Themes, `;`-separated |
| `volatility` | Volatility |

#### FR-016

The system SHALL accept an import file that is `.csv` (UTF-8, with or without a byte-order mark,
comma-separated, RFC 4180 quoting) or `.xlsx` (the first worksheet only), up to 1 MB and up to
1,000 data rows. Any other type, a larger file, more rows, or a file with no data rows is
rejected as a whole with a message saying why.

#### FR-017

The system SHALL match headers by name, ignoring case, surrounding spaces and column order.
`ticker`, `market`, `exchange` and `name` must be present, or the whole file is rejected naming
the missing headers. Unknown headers are ignored and listed as a warning in the preview.

#### FR-018

The system SHALL match enumerated values (market, exchange, every lens value) ignoring case and
surrounding spaces, and store the canonical spelling from [FR-003](#fr-003) (`growth` → `Growth`,
`MAI` → `mai`). Empty cells mean "not set".

#### FR-019

The system SHALL validate every row against the same rules as adding a stock by hand
([FR-001](#fr-001), [FR-003](#fr-003)), and SHALL also flag a row whose (market, ticker) repeats an
earlier row in the same file as an error.

#### FR-020

The system SHALL show a preview before saving anything. The preview lists every data row with its
file row number and one status: **new**, **duplicate** (the investor already saved this
(market, ticker)), or **error** (with every failed field and the reason). It shows the counts of
each status and any header warnings.

#### FR-021

The system SHALL require the investor to pick one target list for the import, either an existing
list or a new one named in the import step (under [FR-009](#fr-009)). When the file has duplicate
rows, the investor also chooses one option for all of them: **skip** (keep the saved stock
unchanged) or **update** (overwrite the saved stock's fields with the row's non-empty values;
empty cells leave the saved value as it is).

#### FR-022

The system SHALL, when the investor confirms, save all new rows, apply the chosen duplicate
option, and add every new and duplicate row's stock to the target list (skipping stocks already
in it). Error rows are not saved. The whole confirm step succeeds or fails as one unit: on any
failure, nothing from that import is saved.

#### FR-023

The system SHALL, after a confirmed import, show a summary with the number of stocks created,
updated, skipped and failed (error rows), and a link to the target list. The error rows and
their reasons can be downloaded as a CSV.

#### FR-024

The system SHALL apply [FR-004](#fr-004) and [FR-005](#fr-005) to imported rows: imported lens
values are `manual`, and the economic cycle is defaulted from the sector when the row leaves it
empty. On **update**, a row's non-empty economic cycle replaces a `default` value and is marked
`manual`.

### Ownership

#### FR-025

The system SHALL store the owning user's id on every stock, list, list membership and import
record, and SHALL read and change only the signed-in investor's rows. A request for another
user's stock or list id answers as if it does not exist (404).

## Non-Functional Requirements

### NFR-001

**Performance** — Adding or editing one stock responds within 500 ms (API p95, local Supabase,
single user).

### NFR-002

**Performance** — A 1,000-row file reaches the preview within 3 s, and confirming it completes
within 5 s (local Supabase, single user).

### NFR-003

**Performance** — The `/stocks` table with 200 stocks renders, and re-sorts, within 200 ms in the
browser after the data has loaded.

### NFR-004

**Security** — Every stock, list and import endpoint requires an identity (the signed-in user's
verified token, or the mock user in development and tests).
An automated test proves that one user can neither read nor change another user's stocks, lists
or list memberships.

### NFR-005

**Privacy** — Import file contents are never sent to a third party. The original file is not kept
after the import completes or is abandoned.

### NFR-006

**Reliability** — A failed or interrupted import confirm leaves the database exactly as it was
before the confirm ([FR-022](#fr-022)).

### NFR-007

**Usability** — The add form, list actions and import flow work on a 360 px wide phone screen and
on desktop, with no horizontal page scroll (the stock table may scroll inside its own container).

### NFR-008

**Accessibility** — The table, forms, dialogs and the import flow are keyboard-operable, every
form field has a label, errors are announced to screen readers, and text meets WCAG 2.1 AA
contrast in light and dark themes.

### NFR-009

**Data integrity** — Thai text in names and themes round-trips byte-for-byte from file to
database to screen.

## Constraints

- The stack is fixed (see `CLAUDE.md`): React + Vite SPA in `apps/web`, Fastify API in
  `apps/api`, Supabase Postgres reached only by the API through Drizzle with `DATABASE_URL`. The
  web never reads or writes data through Supabase; its only Supabase calls are sign-in and session
  calls to Supabase Auth ([User Auth](../../user-auth/v1.0/design.md#key-decisions)).
- Auth comes from the User Auth slice (Supabase Auth, verified by the API); the mock user remains
  for development and tests. Routes read the user with `requireIdentity(req)`, so this feature
  does not depend on which one is active.
- Schema migrations run with the Supabase CLI (`supabase/migrations/`), decided by the owner on
  2026-11-21 ([OQ-1](#oq-1)).
- UI copy is English only for now. Thai and English labels (brief NFR-007) come with the i18n
  slice, so all UI text should be easy to extract later.
- The data model must leave room for later slices without building them: provider-filled values
  (`auto` source, stale marker), market cap in local currency and USD, holdings, financials,
  thesis entries, and markets beyond US and TH.

## Out of Scope

- Market-data provider lookup, daily market-cap refresh, automatic size from market cap, and
  volatility from beta.
- Holdings (held flag, shares, average cost) and value weights.
- Search and filter by lens (brief FR-007), concentration, value chains, financials and thesis.
- Export to CSV/JSON (brief FR-012, NFR-009). The import error report in [FR-023](#fr-023) is the
  only download.
- Reading the prototype's own file format. It is converted to the template outside the app.
- Legacy `.xls`, `.ods`, other worksheets than the first, and Excel formulas (the cached value is
  read; a cell with no value counts as empty).
- Column mapping in the UI (headers must match the template names).
- Thai UI labels and sharing lists with other users. Sign-in is the
  [User Auth](../../user-auth/v1.0/requirements.md) slice.

## Open Questions

### OQ-1

~~How are schema migrations run on Supabase: Supabase CLI migrations, or Liquibase as in Pacta?~~
**Resolved 2026-11-21:** Supabase CLI migrations.

### OQ-2

Phase 3 of the planner expects screen mockups in `.claude/design/`, which do not exist in this
repo (the skill mentions another project's Diatome files). Should Phase 3 build on the existing
shadcn layout and theme tokens in `apps/web/src/index.css` instead?
**Resolved 2026-11-21:** yes, build on the existing shadcn layout and theme tokens.
