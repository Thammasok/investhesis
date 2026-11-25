---
version: 1.0
status: approved
date: 2026-11-25
source: Multi-Market Stock Watchlist Brief.md (UC-006; FR-010, FR-020; NFR-001, NFR-008)
---

# Requirements: Value Chains

The investor opens `/chains` and sees their stocks grouped into value chains (for example
AI & Semis, Oil & Gas), each laid out as upstream, midstream and downstream lanes, with held
stocks highlighted and the money at cost in each lane. The brief's problem is that "nothing shows
the combined picture by ... value-chain position", so concentration risk along a chain stays
hidden. This slice fills the `/chains` page, which is a placeholder today.

It reads the value-chain name and position already stored on each stock by
[Stock Lists v1.0](../../stock-lists/v1.0/requirements.md) (lens 2), the holdings and the USD to
THB rate of [Holdings and Concentration v1.0](../../holdings-concentration/v1.0/requirements.md),
and reuses the search and Filters toolbar of
[Search, Filter and Export v1.0](../../search-filter-export/v1.0/requirements.md).

## Decisions taken for this slice

- **The chain name stays free text** (owner, 2026-11-25), answering the brief's open question
  "Is a free-text value-chain name enough, or should chains be a managed list with ordered
  stages?". A chain is the set of the investor's stocks that carry the same name, compared
  ignoring case. There is no chains table, no description and no custom stages; the lanes are the
  fixed positions of lens 2.
- **One chain per stock** (owner, 2026-11-25), as the stock form, the import template, the
  filters and the concentration lens already assume.
- **The page shows chains and can rename one** (owner, 2026-11-25). A stock's chain and position
  are changed on its edit form, which the page links to; there is no moving of stocks between
  lanes on the page.
- **Each chain shows held stocks, counts per lane, value at cost per lane, and the page has the
  scope and Filters toolbar of `/concentration`** (owner, 2026-11-25).

## Actors

- **Investor (owner)** — the signed-in user. Chains are derived from their own stocks only
  ([NFR-003](#nfr-003)).

## Use Cases

### UC-001

**See a chain's stages** — The investor opens `/chains` and, for each chain, sees which of their
stocks sit upstream, midstream and downstream (and which are integrated), to judge where along the
chain they are exposed.

### UC-002

**See where the money sits** — The investor sees, per lane, how many stocks are held and their
value at cost in THB, to spot a chain where all the money is in one stage.

### UC-003

**Narrow the view** — The investor limits the page to held stocks or one named list, and filters
or searches the stocks as on the other pages, and can share or bookmark the address of that view.

### UC-004

**Tidy chain names** — The investor renames a chain (for example `AI semis` to `AI & Semis`), or
merges two chains by renaming one to the other's name, without editing each stock.

## Functional Requirements

### FR-001

The system SHALL show at `/chains` one section per chain present in the stocks in view
([FR-007](#fr-007)). A chain is every stock in view whose value-chain name is equal ignoring case;
the section is titled with the spelling of the earliest-created of those stocks
([OQ-4](#oq-4)). Chains are ordered by number of stocks in view, most first, then by name.

### FR-002

The system SHALL lay out each chain's stocks by value-chain position:

| Area | Stocks |
|---|---|
| Upstream lane | Position `Upstream` |
| Midstream lane | Position `Midstream` |
| Downstream lane | Position `Downstream` |
| Integrated | Position `Integrated`, shown as one area spanning the three lanes ([OQ-1](#oq-1)) |
| No position | Position `None` or not set ([OQ-2](#oq-2)) |

The three lanes are always shown, in that order, even when empty ("No stocks"). The Integrated
and No position areas are shown only when they hold a stock.

### FR-003

The system SHALL show each stock in a lane as an entry with its ticker, name and market, linked to
the stock's page (`/stocks/:id`). Within an area, held stocks come first (by value at cost, most
first, then those whose value is unknown), then the others, each group by ticker.

### FR-004

The system SHALL mark every held stock with a visible "Held" text label (never colour alone), and
show its value at cost in THB when its shares and average cost are known (brief FR-010). Value at
cost and the USD to THB conversion follow Holdings and Concentration
[FR-008](../../holdings-concentration/v1.0/requirements.md#fr-008), with the rate saved there.

### FR-005

The system SHALL show for each area and for the chain as a whole: the number of stocks, the
number held, and the value at cost in THB of the held stocks that can be valued, with each area's
share of the chain's value (one decimal place). Held stocks that cannot be valued (no shares, no
cost, or USD with no rate saved) are counted as held but left out of the value, and the chain says
how many were left out, as the concentration page does. With no rate saved the page says so and
links to the setting.

### FR-006

The system SHALL say how many stocks in view have no value-chain name, and link to `/stocks`
filtered to them (the value-chain name filter set to "Not set", plus the current filters). Stocks
with no chain name are not shown in any chain ([OQ-3](#oq-3)).

### FR-007

The system SHALL let the investor choose the **scope**: all saved stocks, held stocks, or one
named list, and SHALL apply the search and filters of Search, Filter and Export
[FR-001..FR-006](../../search-filter-export/v1.0/requirements.md#fr-001) to the stocks in scope.
The stocks that remain are the stocks **in view**. Scope, search and filters live in the address,
a bad part falls back with a note and the address is not rewritten, as on `/concentration`.

### FR-008

The system SHALL offer from the page a link to `/concentration` grouped by value-chain name with
the same scope and filters, and from each chain a link to `/stocks` filtered to that chain.

### FR-009

The system SHALL let the investor rename a chain from its section. The new name follows the rules
of the value-chain name (trimmed, 1 to 60 characters). The rename applies to **every** stock of
the investor whose chain name equals the old name ignoring case, including stocks outside the
current scope and filters, and the dialog says how many stocks will change. Each changed stock
keeps its position and every other field; its value-chain name stays a manual value.

### FR-010

The system SHALL treat a rename to a name that already exists on another chain (ignoring case) as
a **merge**: the dialog names both chains and the number of stocks of each, and the investor
confirms before anything is saved. After a merge both sets of stocks carry the new name exactly
as typed. A rename that only changes letter case is allowed and rewrites every spelling of the
chain to the new one ([OQ-5](#oq-5)).

### FR-011

The system SHALL apply a rename to all affected stocks together or not at all. If another change
made the old name disappear or the number of stocks differ before the save, the rename SHALL
still apply to the stocks that carry the old name at save time, and the result SHALL say how many
stocks were changed. A rename of a chain that no longer exists answers as not found and the page
says the chain is gone.

### FR-012

The system SHALL show these empty and error states:

| State | Shown |
|---|---|
| No saved stocks | Empty state with a link to add a stock and to import |
| Stocks, but none in view has a chain name | Empty state that explains the value-chain name and position fields, with the link of [FR-006](#fr-006) |
| Filters or search match no stock | The filter result line and the Clear all action, as on `/stocks` |
| The page's data fails to load | The app's route error with a Retry |
| A rename fails (validation, network, server) | The dialog stays open with what was typed and says what went wrong |

### FR-013

The system SHALL show the brief's note that classifications are the investor's own judgment, not
advice (brief constraint), as the concentration page does.

## Non-Functional Requirements

### NFR-001

**Performance** — With 200 stocks in 20 chains, changing the scope, a filter or the search
regroups the page within 200 ms in the browser and sends **no request** (brief NFR-001), as on
`/concentration`. The page reads its data once per visit and after a rename.

### NFR-002

**Performance** — A rename that changes up to 200 stocks responds within 500 ms (API p95, local
Supabase, single user), the bar of Stock Lists
[NFR-001](../../stock-lists/v1.0/requirements.md#nfr-001).

### NFR-003

**Security** — The rename call needs a signed-in user and changes only that user's stocks (brief
NFR-003); another user's stocks with the same chain name are never read or changed.

### NFR-004

**Privacy** — Shares, cost and the exchange rate are never sent to a third party and never written
to logs (brief NFR-004), under the redaction rules of Holdings and Concentration. Chain names are
the investor's own text and are not logged in request bodies either.

### NFR-005

**Accuracy** — Values and shares are computed with the exact decimal helpers of the domain
package (no floating point), rounded half up only for display, as on `/concentration`.

### NFR-006

**Accessibility** — Each chain is a region with a heading; each lane is a list with a heading and
its counts; "Held" and the lane names are text; the rename flow is keyboard operable with focus
moved into the dialog and returned to the Rename button (or to the merged chain's heading after a
merge); WCAG 2.1 AA contrast in light and dark themes (brief NFR-008).

### NFR-007

**Usability** — On a 360 px wide phone the lanes of a chain stack vertically (Upstream, Midstream,
Downstream, Integrated, No position) with no horizontal scrolling; from the `md` breakpoint they
sit side by side (brief FR-015). Long chain names and stock names wrap.

## Constraints

- No new table: chains are derived from `app.stocks.value_chain`. The rename is the only new API
  call; it writes through the same rules as a stock PATCH (domain validation, `lens_sources`,
  `updated_at`).
- The page groups in the browser from data it already reads (`GET /stocks`, `GET /lists`,
  `GET /settings`), as `/concentration` does, and reuses `FilterToolbar`, `useStockFilters` and
  the domain's decimal and value-at-cost helpers rather than new copies.
- Shared rules (chain grouping, name comparison) live in `@investhesis/domain`, so web and API
  agree on which stocks a chain holds.
- UI copy is English only until the i18n slice (brief NFR-007).

## Out of Scope

- A managed chains table, chain descriptions, custom or reorderable stages, and more than one
  chain per stock.
- Moving stocks between lanes or chains on the page (drag and drop or menu); changing a position
  goes through the stock edit form.
- Supplier and customer links between stocks, graphs of the chain, and chain-level thesis notes.
- Threshold flags on the chains page; the concentration page already groups and flags by
  value-chain name and position ([FR-008](#fr-008)).
- Undo of a rename or merge (renaming back undoes a plain rename; a merge cannot be split
  automatically, which the merge confirmation says).
- Changes to the import template, stock CSV export or backup format (they already carry
  `value_chain` and `value_chain_position`).
- Thai UI labels.

## Open Questions

### OQ-1

Where do `Integrated` stocks go? **Proposed:** one area below the three lanes, spanning their
width, titled "Integrated (spans every stage)", since an integrated company works in all three.
Alternative: show the stock in all three lanes, which would count it three times.

**Resolved 2026-11-25:** as proposed.

### OQ-2

Where do stocks with a chain name but position `None` or no position go? **Proposed:** one
"No position" area in the chain, so they are visible and the investor can set one; `None` and
not set are not told apart there. Alternative: hide them from the chain.

**Resolved 2026-11-25:** as proposed.

### OQ-3

Should stocks without a chain name appear on the page? **Proposed:** no; the page states their
number and links to `/stocks` filtered to them ([FR-006](#fr-006)). Alternative: an "Unassigned"
chain section, which would be the largest section for most investors and push real chains down.

**Resolved 2026-11-25:** as proposed.

### OQ-4

Which spelling titles a chain whose stocks spell it differently (`AI & Semis`, `ai & semis`)?
**Proposed:** the spelling of the earliest-created stock, and the section notes that the chain has
several spellings with a Rename action to unify them. Alternative: the most common spelling.

**Resolved 2026-11-25:** as proposed.

### OQ-5

Should the rename offer an Undo, as deletes do? **Proposed:** no ([Out of Scope](#out-of-scope));
a plain rename is undone by renaming back, and a merge asks for confirmation first because the
two chains cannot be told apart afterwards. Alternative: a 5 s Undo that restores each stock's old
spelling, which needs the API to return and accept the old names per stock.

**Resolved 2026-11-25:** as proposed.
