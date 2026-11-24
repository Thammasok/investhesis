---
version: 1.0
status: approved
date: 2026-11-24
source: Multi-Market Stock Watchlist Brief.md (UC-011; FR-019, FR-020; NFR-009, NFR-011)
---

# Requirements: Thesis Log

The investor keeps a dated log of why they bought, sold, or changed their mind about each stock:
buy thesis, sell thesis, update and review entries, each with optional target price and
invalidation conditions, shown newest first on the stock page. The brief's goal is "a dated
buy/sell thesis log per stock, so the reason for each decision is kept". It builds on
[Stock Lists v1.0](../../stock-lists/v1.0/requirements.md) (the stock and its page) and adds the
entries to the JSON backup of
[Search, Filter and Export v1.0](../../search-filter-export/v1.0/requirements.md).

## Decisions taken for this slice

- **Each entry carries a date the investor chooses** (owner, 2026-11-24). It defaults to today and
  can be backdated, so the theses behind existing holdings can be logged. The app also keeps when
  the entry was created and last edited.
- **Editing overwrites the entry and marks it "Edited"** (owner, 2026-11-24). No revisions are
  stored. A changed view is logged as a new `update` entry; that is what keeps the history.
- **Entries are shown on the stock page only** (owner, 2026-11-24): no cross-stock journal page
  and no new column on the stocks table.
- **Entry text is plain text** with its line breaks kept (owner, 2026-11-24). No Markdown and no
  rich text.
- **Entries go into the JSON backup** (owner, 2026-11-24), as a new backup format version. The
  stock CSV (export and backup) is unchanged.

## Actors

- **Investor (owner)** — the signed-in user. Thesis entries are private to their account, like
  every other row ([NFR-003](#nfr-003)).

## Use Cases

### UC-001

**Write a thesis entry** — On a stock's page the investor adds an entry: picks its type (buy,
sell, update or review) and date, writes the text, and optionally adds a target price and the
conditions that would prove the thesis wrong.

### UC-002

**Read a stock's history** — On a stock's page the investor reads every entry for that stock,
newest first, to see why they hold it and how their view changed.

### UC-003

**Correct or remove an entry** — The investor edits an entry to fix a mistake, or deletes one,
with a short chance to undo the delete.

### UC-004

**Keep a copy** — The investor downloads the JSON backup and finds their thesis entries in it.

## Functional Requirements

### FR-001

The system SHALL let the investor add a thesis entry to a saved stock with these fields:

| Field | Rule |
|---|---|
| Type | Required: `buy`, `sell`, `update` or `review` (shown as Buy, Sell, Update, Review). |
| Date | Required calendar date (no time). Defaults to today in the investor's browser time zone. Not later than today ([OQ-2](#oq-2)). |
| Thesis | Required plain text, 1 to 10,000 characters after trimming leading and trailing white space. Line breaks are kept. |
| Target price | Optional, greater than 0, up to 4 decimal places, in the stock's trading currency ([OQ-1](#oq-1)). |
| Invalidation conditions | Optional plain text, up to 2,000 characters after trimming; empty is stored as not set. Line breaks are kept. |

Lengths count characters (Unicode code points), as Stock Lists does.

### FR-002

The system SHALL show a stock's entries on its page (`/stocks/:id`) in a Thesis section, sorted
by date, newest first; entries with the same date are sorted by creation time, newest first. Each
entry shows its type as a text label, its date, its text with line breaks, and its target price
(with the currency symbol and the decimals it was entered with) and invalidation conditions when
set. The section shows how many entries the stock has.

### FR-003

The system SHALL show an empty state in the Thesis section when the stock has no entries, with
the action to add the first one.

### FR-004

The system SHALL let the investor edit every field of an entry under the rules of
[FR-001](#fr-001). An entry whose fields were changed after it was created SHALL show "Edited"
with the date of the last change. Saving an edit that changes nothing SHALL not mark the entry
as edited.

### FR-005

The system SHALL let the investor delete an entry, and SHALL offer an Undo for 5 seconds after
the delete that restores the same entry (same fields, dates and edited marker), as Stop holding
does in Holdings and Concentration.

### FR-006

The system SHALL keep the stock's trading currency as the target price's currency. If the target
price is shown on a stock whose currency the investor later changes, it SHALL be shown in the
stock's current currency (the number is not converted).

### FR-007

The system SHALL delete a stock's entries when the stock is deleted, and the delete confirmation
SHALL say how many thesis entries will be deleted with it when there are any.

### FR-008

The system SHALL keep the stock page usable while entries load or fail to load: the stock's
details and holding still show, and the Thesis section shows its own loading state and an error
with a Retry action.

### FR-009

The system SHALL show validation problems next to the field they belong to, keep what the
investor typed when a save fails (validation, conflict, network or server error), and say what
went wrong. A stock that no longer exists answers as not found, and the page says the stock was
deleted.

### FR-010

The system SHALL include every thesis entry in the JSON backup (`GET /exports/backup.json`) as a
new backup format version: each entry with its id, stock id, type, date, text, target price,
invalidation conditions, created and updated times, and no user id. The documented backup schema
SHALL describe the new version. The CSV backup and the stock CSV export are unchanged.

### FR-011

The system SHALL show, next to the Thesis section, the brief's note that classifications and
theses are the investor's own judgment, not advice (brief constraint).

## Non-Functional Requirements

### NFR-001

**Performance** — Adding, editing or deleting an entry responds within 500 ms (API p95, local
Supabase, single user), the same bar as Stock Lists
[NFR-001](../../stock-lists/v1.0/requirements.md#nfr-001). Reading a stock's entries with 200
entries of 2,000 characters each responds within 500 ms (API p95).

### NFR-002

**Performance** — The stock page with 200 entries renders the Thesis section within 1 s after the
entries arrive, measured in the browser test environment.

### NFR-003

**Security** — Every thesis call needs a signed-in user, and each user reads and writes only their
own entries (brief NFR-003). Another user's stock or entry answers 404, as in Stock Lists. The new
table has row-level security on and no policy, like `app.holdings`.

### NFR-004

**Privacy** — Thesis text, invalidation conditions and target prices are never sent to a third
party and never written to logs or error reports (brief NFR-011). The API SHALL NOT log request
bodies that carry them, its log redaction SHALL cover those fields by name, and a logged database
error SHALL NOT include the failing row's values.

### NFR-005

**Safety** — Entry text is rendered as text, never as HTML, so markup or script typed into an
entry is shown as typed. Line breaks are the only formatting.

### NFR-006

**Accuracy** — The target price is an exact decimal (sent as a string, stored as `numeric`),
never a floating-point number, as holdings are.

### NFR-007

**Accessibility** — The Thesis section and its add, edit and delete flows are operable by
keyboard, focus moves to the dialog on open and back to the button that opened it on close (or to
the section heading after a delete), the entry type is conveyed by text (never colour alone), and
the section meets WCAG 2.1 AA contrast in light and dark themes (brief NFR-008).

### NFR-008

**Usability** — The Thesis section and its dialog work on a 360 px wide phone without horizontal
scrolling; long words and URLs in entry text wrap (brief FR-015).

## Constraints

- Stocks and their pages are those of Stock Lists v1.0; this slice adds a Thesis section to
  `/stocks/:id` and no new route (brief FR-020 already places thesis on the stock page).
- Reached only through the API; the database is Supabase Postgres via Drizzle, with a migration
  under `supabase/migrations/` (Stock Lists ADR-001) and a `user_id` on every new row.
- Shared validation lives in `@investhesis/domain`, so web and API apply the same rules.
- UI copy is English only until the i18n slice (brief NFR-007). Dates are shown in the browser's
  locale format.

## Out of Scope

- Revisions or an audit trail of edits, and locking entries against later edits.
- A cross-stock journal page, a "last thesis" column, search or filter by thesis text or type,
  and reminders to review a thesis.
- Markdown, rich text, attachments, images and links rendered as links.
- Linking an entry to a holding change (shares bought or sold), price at the time of the entry,
  and alerts when a target price is reached (no live prices in v1).
- Thesis columns in the CSV import template or the stock CSV export, and restoring a backup.
- Thai UI labels.

## Open Questions

### OQ-1

What currency is the target price in? **Proposed:** always the stock's trading currency (USD or
THB), not chosen per entry, so a US stock's target is in USD. Alternative: a currency per entry
like the holding's cost currency, which adds a field for a case that rarely happens.

**Resolved 2026-11-24:** always the stock's trading currency.

### OQ-2

May an entry be dated in the future? **Proposed:** no; the date is not later than today in the
investor's time zone, since an entry records a decision already taken. A future review is out of
scope (reminders). Alternative: allow any date.

**Resolved 2026-11-24:** not later than today in the investor's time zone.

### OQ-3

Should the stock's delete confirmation stop the delete when entries exist? **Proposed:** no; it
names the number of entries that go with the stock ([FR-007](#fr-007)) and the investor confirms
as today. The JSON backup is the way to keep them. Alternative: require deleting the entries
first, which protects the log but makes removing a stock slower.

**Resolved 2026-11-24:** the delete is not blocked; the confirmation names the number of entries.
