---
version: 1.0
status: approved
date: 2026-11-23
source: Multi-Market Stock Watchlist Brief.md (UC-003, UC-005; FR-006, FR-008, FR-009)
---

# Requirements: Holdings and Concentration

The investor marks which saved stocks they actually hold, with shares and average cost, and then
sees where the portfolio is concentrated: any lens, any list, by number of stocks and by value,
with a warning when one group reaches the threshold (40% by default). This is the brief's headline
problem ("nothing shows the combined picture by sector, value-chain position, style or cycle"),
and it builds on [Stock Lists v1.0](../../stock-lists/v1.0/requirements.md), which already stores
every stock and its 10 lenses.

## Decisions taken for this slice

- **Total shares and average cost per stock** (owner, 2026-11-23). No purchase lots; lots can be
  added later by a migration. This is brief open question "holdings lots vs average cost".
- **Value is shares × average cost** ("value at cost"). Live prices are out of scope for v1, so a
  market value does not exist; every value in this slice is labelled "at cost".
- **Base currency is THB** (brief default). USD holdings are converted with an exchange rate the
  investor enters (see [OQ-1](#oq-1)); no exchange-rate provider is called.

## Actors

- **Investor (owner)** — the signed-in user. Holdings, the exchange rate and the threshold are
  private to their account, like every other row ([NFR-003](#nfr-003)).

## Use Cases

### UC-001

**Mark a holding** — On a stock's page (and in the Add / Edit stock form) the investor flags the
stock as held and optionally enters shares, average cost and the cost currency. They can change
or clear it later.

### UC-002

**See what I hold** — The investor sees at a glance which saved stocks are held, on the stocks
table and on the stock page.

### UC-003

**See concentration** — On `/concentration` the investor picks a scope (all saved stocks, one
list, or held stocks only) and a lens, and sees each group's count and share, with groups at or
above the threshold flagged.

### UC-004

**Set the warning threshold and the exchange rate** — The investor changes the concentration
threshold and the USD to THB rate used for value weights.

## Functional Requirements

### FR-001

The system SHALL let the investor mark a saved stock as held and clear that mark. A stock that is
not held has no shares, cost or currency.

### FR-002

The system SHALL accept, for a held stock, optional **shares** (greater than 0, up to 4 decimal
places) and optional **average cost per share** (greater than or equal to 0, up to 4 decimal
places) in a **cost currency** of USD or THB, which defaults to the stock's trading currency. A
held stock with no shares or no cost is allowed ("held, amount unknown").

### FR-003

The system SHALL keep shares and cost as exact decimals, never as floating-point numbers. It SHALL
show a total value with the right currency symbol and two decimals, and an average cost per share
with its currency symbol and the decimals it was entered with (up to 4).

### FR-004

The system SHALL show a **Held** marker (with shares when known) on the stocks table, the list
page and the stock page, and SHALL let the investor edit the holding from the stock page and from
the Add / Edit stock form.

### FR-005

The system SHALL let the investor choose the **scope** of the concentration view: all saved
stocks, one named list, or held stocks only, and the **measure**: count (number of stocks) or
value (value at cost). Value is unavailable while no stock in the scope can be valued
([FR-008](#fr-008)); the view then says why.

### FR-006

The system SHALL let the investor choose the **lens** to group by from the lens fields stored on
a stock: sector (GICS, which every stock has, Thai stocks through their mapped GICS sector),
SET industry group (Thai stocks; other stocks fall in "Not set"), value-chain position, value-chain name, size, style, economic cycle, Lynch type, life cycle, customers,
revenue types, moat, themes and volatility, plus market and index membership.

### FR-007

The system SHALL show, per group, the **number of stocks** and its **share of the stocks in scope**,
largest first. A stock with no value for the lens is counted in a group named "Not set". A stock
with several values for a multi-value lens (customers, revenue types, themes, index membership)
counts once in each of its groups, so those shares can add up to more than 100%, and the view
SHALL say so ([OQ-2](#oq-2)).

### FR-008

The system SHALL, when the scope contains held stocks with a known shares and cost, also show per
group the **value at cost in THB** and its **share of the total value**. Each stock's value is
shares × average cost, converted to THB with the investor's exchange rate when the cost currency
is USD. The total is the sum of the valued stocks in scope, each counted once, so for a
multi-value lens the value shares can also add up to more than 100%.

### FR-009

The system SHALL state which stocks are left out of the value shares: held stocks with no shares
or no cost, and stocks that are not held. It SHALL show their number and let the investor open
them ([OQ-3](#oq-3)).

### FR-010

The system SHALL flag a group whose share of the chosen measure is **equal to or above the
threshold**, with a visible text label and an icon (never colour alone), and SHALL list the
flagged groups in a summary above the table. With no flagged group it SHALL say so. The "Not set"
group is never flagged (it is missing data, not a concentration); it is shown with its share.

### FR-011

The system SHALL let the investor change the threshold (a whole number from 1 to 100, default 40)
and the USD to THB rate (greater than 0, up to 6 decimal places), and SHALL apply the new values
to the view at once and keep them for later visits. Until a rate is entered, USD holdings are not
converted: the view says so, counts them in the left-out stocks of [FR-009](#fr-009) and offers a
link to set the rate.

### FR-012

The system SHALL keep the chosen scope, lens and measure in the page address, so that a
concentration view can be linked, reloaded and reached with the browser's Back button. An address
naming a list that no longer exists, or an unknown lens or measure, falls back to the default
and says so.

### FR-013

The system SHALL show an empty state on `/concentration` when the investor has no saved stocks,
and a note when the scope has no held stocks (value shares are unavailable, count shares still
work).

### FR-014

The system SHALL show a note on the concentration page that groupings and values are the
investor's own classifications and costs, not advice (brief constraint).

## Non-Functional Requirements

### NFR-001

**Performance** — With 200 stocks, changing the scope, lens or measure regroups and redraws in
under 200 ms in the browser (brief NFR-001).

### NFR-002

**Performance** — Saving or clearing a holding, alone or with a stock, responds within 500 ms
(API p95, local Supabase, single user), the same bar as Stock Lists
[NFR-001](../../stock-lists/v1.0/requirements.md#nfr-001).

### NFR-003

**Security** — Every holdings and settings call needs a signed-in user, and each user reads and
writes only their own rows (brief NFR-003). Another user's stock, and so its holding, answers 404
as in Stock Lists; settings have no id, so a user can only ever reach their own.

### NFR-004

**Privacy** — Shares, average cost and the exchange rate are never sent to a third party and never
written to logs or error reports (brief NFR-004). The API SHALL NOT log request bodies that carry
a holding or the rate, its log redaction SHALL cover those fields by name, and a logged database
error SHALL NOT include the failing row's values.

### NFR-005

**Accuracy** — Value arithmetic is exact decimal arithmetic. Shares of the total are shown to one
decimal place, rounded half up, and flagged groups use the unrounded share, so 39.96% shown as
40.0% is not flagged.

### NFR-006

**Accessibility** — The concentration view is operable by keyboard, a group and its flag are
conveyed by text, and the page meets WCAG 2.1 AA contrast in light and dark themes, including
the flag colours (brief NFR-008). Any chart has a table with the same figures next to it.

### NFR-007

**Usability** — The page works on a 360 px wide phone without horizontal scrolling
(brief FR-015).

### NFR-008

**Portability** — Holdings and settings are included when export is built (brief NFR-009); this
slice only keeps them in tables an export can read.

## Constraints

- Stock, list and lens data and their vocabulary are those of Stock Lists v1.0
  (`@investhesis/domain`); this slice adds no new lens values.
- Reached only through the API; the database is Supabase Postgres via Drizzle, with a migration
  under `supabase/migrations/` (Stock Lists ADR-001) and a `user_id` on every new row.
- UI copy is English only until the i18n slice (brief NFR-007).
- No live prices, so no market value, no gain or loss, and no weight "at market".

## Out of Scope

- Purchase lots, sells, realised or unrealised gain, dividends, and holdings history.
- Live prices, market value, price charts, and an exchange-rate provider (the rate is typed in).
- A base currency other than THB.
- Search and filter by lens and held status (brief FR-007), value-chain lanes (brief FR-010),
  export, financials, thesis notes and data-provider lookup.
- Holdings columns in the CSV import template. A held stock is marked in the app after import.
- Concentration across two lenses at once (cross-tabs) and saved views.
- Thai UI labels.

## Open Questions

### OQ-1

Where does the USD to THB rate come from? **Proposed:** the investor types it in on the
concentration page, once, and updates it when they want (no provider, nothing sent out).
Alternative: a provider fetch, which waits for the data-provider slice and needs an owner choice
of provider.
**Resolved 2026-11-23:** the investor types the rate in; no provider.

### OQ-2

How should a multi-value lens (themes, customers, revenue types, index membership) be counted?
**Proposed:** a stock counts in every group it has, shares can exceed 100% in total, and the view
says so. Alternative: split each stock's weight equally across its values, so totals stay 100%
but a "30% AI" figure no longer means "30% of stocks are AI".
**Resolved 2026-11-23:** a stock counts in every group it has; the view says shares can exceed 100%.

### OQ-3

Held stocks with no shares or cost cannot have a value. **Proposed:** leave them out of value
shares, name them in a note with a link, and still count them in count shares. Alternative:
block the held mark until shares and cost are filled in, which is stricter but makes marking a
holding slower.
**Resolved 2026-11-23:** left out of value shares, named in a note with a link; still counted in count shares.
