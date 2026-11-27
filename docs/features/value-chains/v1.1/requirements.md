---
version: 1.1
status: approved
date: 2026-11-27
requires: ../v1.0/requirements.md
source: owner request 2026-11-27 ("Value chains style display node graph (reactflow) by show category on left-side and show each node and group by upstream, midstream, downstream")
---

# Requirements: Value Chains — Graph view

Value Chains [v1.0](../v1.0/requirements.md) (released as v0.7.0) shows each chain on `/chains`
as a card with Upstream, Midstream and Downstream lanes. This slice adds a second way to look at
the same chains: a **Graph** view drawn with React Flow. A list of chains sits on the left. When
the investor picks one, the canvas shows that chain's stocks as nodes inside Upstream, Midstream
and Downstream groups, joined by arrows that show the flow from one stage to the next.

The graph is another view of the data v1.0 already groups. It adds no new stored data and no new
API call. Every v1.0 requirement still holds unless this file changes it.

## Decisions taken for this slice

- **Chain picker on the left** (owner, 2026-11-27). The left column lists the chains in view. The
  canvas shows one chain at a time. It is not one canvas with a row per chain, and it is not a
  breakdown by another lens.
- **Stage arrows only** (owner, 2026-11-27). Arrows run from the Upstream group to the Midstream
  group to the Downstream group. There are no links between individual stocks and no new table.
  Supplier and customer links stay out of scope, as in v1.0.
- **A Lanes | Graph switch on `/chains`** (owner, 2026-11-27). The v1.0 cards stay as the default
  view. The graph is the second view, and the chosen view is kept in the address.
- **Read-only canvas** (owner, 2026-11-27). The investor can pan, zoom and fit the view, and a
  node opens its stock page. The layout is computed, not saved. Nodes cannot be dragged to another
  place or stage.

## Actors

- **Investor (owner)**: the signed-in user. The graph shows only their own stocks, as in v1.0
  [NFR-003](../v1.0/requirements.md#nfr-003).

## Use Cases

### UC-101

**See a chain as a flow.** The investor switches `/chains` to Graph, picks a chain on the left,
and sees its stocks laid out from Upstream through Midstream to Downstream. This shows at a glance
which stages they own and which are empty.

### UC-102

**Move between chains.** The investor goes through the chains in the left column, with a mouse or
the keyboard. Each pick redraws the canvas without a request. The investor can bookmark or share
the address of the chain they are looking at.

### UC-103

**Go from a node to the stock.** The investor opens a stock's page from its node to check or edit
its position.

## Functional Requirements

### FR-101

The system SHALL offer on `/chains` a view switch with two options, **Lanes** (the v1.0 cards, the
default) and **Graph**. The chosen view SHALL live in the address as `view=graph`. Lanes is the
view when the parameter is absent, and it is never written to the address. A bad `view` value
falls back to Lanes with one note, and the address is not rewritten, as for the other `/chains`
parameters ([v1.0 FR-007](../v1.0/requirements.md#fr-007)). Changing the view uses `replace` and
keeps the scope, search and filters.

### FR-102

In the Graph view, the system SHALL show a **chain list** on the left with one entry per chain in
view. The entries use the same chains, titles and order as the Lanes view
([v1.0 FR-001](../v1.0/requirements.md#fr-001)): most stocks first, then by name. Each entry shows
the chain's title, its number of stocks in view and its number held. The entry for the selected
chain is marked as the current one with text or an icon as well as colour.

### FR-103

The system SHALL keep the selected chain in the address as `chain=<chain key>` (the domain's
`chainKey`). When the parameter is absent, the first chain in the list is selected and nothing is
written. When the parameter names a chain that is not in view (renamed, filtered out, or out of
scope), the first chain is selected and a note says the chosen chain is not in the current view
([OQ-101](#oq-101)). Picking a chain writes `chain` with `replace`. Changing the scope, search or
filters keeps `chain` when that chain is still in view.

### FR-104

The system SHALL draw the selected chain on a React Flow canvas with these groups, from left to
right:

| Group | Stocks | Shown |
|---|---|---|
| Upstream | Position `Upstream` | always, with "No stocks" when empty |
| Midstream | Position `Midstream` | always, with "No stocks" when empty |
| Downstream | Position `Downstream` | always, with "No stocks" when empty |
| Integrated | Position `Integrated` | only when it holds a stock, as one group below the three spanning their width ([OQ-102](#oq-102)) |
| No position | Position `None` or not set | only when it holds a stock, apart from the flow ([OQ-102](#oq-102)) |

Each group is a labelled container (a React Flow group or parent node). Its header shows the
stage name, the number of stocks, the number held and the value at cost in THB with its share of
the chain's value, with the same figures and rounding as the Lanes view
([v1.0 FR-005](../v1.0/requirements.md#fr-005)).

### FR-105

The system SHALL draw one directed arrow from Upstream to Midstream and one from Midstream to
Downstream. The arrows are drawn even when a group is empty, because they show the stage order,
not a link between stocks. Integrated and No position have no arrows.

### FR-106

The system SHALL show each stock as a node inside its group. A node shows the ticker, the name
(cut short with the full name available), the market, a "Held" text label for held stocks (never
colour alone), and the value at cost in THB when it is known. Nodes in a group are stacked in the
order of [v1.0 FR-003](../v1.0/requirements.md#fr-003): held by value most first, then held with
the value unknown, then the rest, each by ticker.

### FR-107

The system SHALL lay out the canvas automatically from the grouping: fixed column widths for the
three stages, group heights that grow with the number of nodes, and Integrated and No position
placed below. Positions are computed again on every change of chain, scope, search or filters,
and are never saved. The canvas SHALL fit the chain into view when it first draws and each time
the selected chain changes.

### FR-108

The system SHALL let the investor pan, zoom (with a minimum and maximum) and fit the view, through
the canvas controls and the usual gestures. Nodes SHALL NOT be draggable or connectable, and no
edge can be added, moved or removed.

### FR-109

The system SHALL open the stock page (`/stocks/:id`) when the investor activates a node by click,
tap, or Enter while it has focus.

### FR-110

The system SHALL show, above the canvas, the selected chain's title with the same actions as its
Lanes card: **Stocks** (the link of [v1.0 FR-008](../v1.0/requirements.md#fr-008)) and **Rename**
(the v1.0 rename and merge dialog, [v1.0 FR-009..FR-011](../v1.0/requirements.md#fr-009)). It also
shows the chain's totals and its left-out note. After a rename the address moves to the new
chain's key, so the same chain stays selected. After a merge the merged chain is selected.

### FR-111

The system SHALL keep the page-level parts of v1.0 in the Graph view: the scope select, the search
and Filters toolbar, the count of stocks with no chain name and its link
([v1.0 FR-006](../v1.0/requirements.md#fr-006)), the link to `/concentration`, the missing-rate
note and the advice note ([v1.0 FR-013](../v1.0/requirements.md#fr-013)).

### FR-112

The system SHALL show the v1.0 empty states ([v1.0 FR-012](../v1.0/requirements.md#fr-012)) in
place of the chain list and canvas when no chain is in view: no saved stocks, no chain names in
view, or filters that match nothing. The view switch stays visible.

### FR-113

On screens narrower than the `md` breakpoint, the system SHALL show the Lanes view even when the
address says `view=graph`, with a short note that the graph needs a wider screen. The address is
not rewritten, so the graph comes back when the screen widens ([OQ-103](#oq-103)).

## Non-Functional Requirements

### NFR-101

**Performance.** With 200 stocks in 20 chains (dataset VC-C of v1.0), switching to Graph,
picking a chain, or changing the scope, a filter or the search SHALL redraw the canvas within
300 ms in the browser and send **no request**, in line with
[v1.0 NFR-001](../v1.0/requirements.md#nfr-001). A chain of 60 stocks SHALL pan and zoom without
visible stutter (no long task over 50 ms while panning).

### NFR-102

**Bundle size.** React Flow SHALL load only with the Graph view (a lazy chunk). The Lanes view and
every other route SHALL not download it, and the size of the initial chunk SHALL not grow.

### NFR-103

**Accessibility.** The Graph view SHALL meet WCAG 2.1 AA in light and dark themes (brief NFR-008),
and in particular:

- The chain list is a list of buttons or links with the current one marked by `aria-current`, and
  it can be used with the keyboard alone.
- Every node can take keyboard focus, has an accessible name (ticker, name, "held" and value when
  shown, and its stage), and opens the stock page with Enter.
- The canvas has an accessible label and a description that points to the Lanes view as the
  equivalent text view. The zoom and fit controls have names.
- Contrast is at least 4.5:1 for text and 3:1 for group borders, node borders, arrows and focus
  rings, measured in both themes.
- Motion such as the animated fit view is turned off under `prefers-reduced-motion`.

### NFR-104

**Accuracy.** Counts, values and shares in the graph SHALL come from the same domain
`groupChains` result as the Lanes view, so both views always show the same figures, with no
floating point ([v1.0 NFR-005](../v1.0/requirements.md#nfr-005)).

### NFR-105

**Privacy.** No new data leaves the browser. React Flow SHALL make no network request of its own,
and its attribution link is either kept as a plain link or removed in line with its licence
([OQ-104](#oq-104)). Shares, cost and the rate stay out of logs, as in
[v1.0 NFR-004](../v1.0/requirements.md#nfr-004).

## Constraints

- No API, schema or domain-rule change. The graph is drawn from the `ChainsResult` of the domain
  `groupChains` that `planChains` already computes. Turning that result into nodes, groups and
  edges is a pure function in `features/chains/` with its own unit tests.
- The library is `@xyflow/react` (React Flow 12 or later), added to `apps/web` only. The exact
  version and its React 19 support are checked against current docs in the design phase.
- The canvas uses the theme tokens in `src/index.css` (via React Flow's CSS variables), not React
  Flow's default colours, so dark mode and the contrast suite still hold.
- UI copy follows the state of the i18n slice ([Thai and English UI v2.0](../../i18n/v2.0/)): if
  that slice has landed when this one starts, every new string goes through it. Otherwise the copy
  is English and is added to the i18n work.
- Reuse the v1.0 pieces: `ChainRenameDialog`, `ScopeSelect`, `FilterToolbar`, `useStockFilters`,
  `chainStocksHref`, `concentrationHref`, `leftOutText`, `readScope`.

## Out of Scope

- Links between individual stocks (supplier and customer), edges the user draws, and any new
  table or API route.
- Dragging nodes, saving a layout, or moving a stock to another stage or chain on the canvas.
- Showing all chains on one canvas, or a breakdown of a chain by another lens.
- A graph on phones narrower than `md` ([FR-113](#fr-113)).
- A minimap, export of the graph as an image, and threshold flags on the graph.
- Changes to the Lanes view, apart from adding the view switch.

## Open Questions

### OQ-101

When `chain=` names a chain that is not in view, what happens? **Proposed:** select the first
chain, show one note ("The chosen chain is not in this view"), and leave the address as it is, as
the other bad parameters do. Alternative: show an empty canvas with "Chain not found" until the
investor picks one.

**Resolved 2026-11-27:** as proposed.

### OQ-102

Where do Integrated and No position go on the canvas? **Proposed:** Integrated is one group below
the three stages, spanning their width, with no arrows, matching v1.0
[OQ-1](../v1.0/requirements.md#oq-1). No position is a smaller group below Integrated, labelled
"No position", with no arrows. Alternative: put No position in the chain list entry only, as a
count, and leave it off the canvas.

**Resolved 2026-11-27:** as proposed.

### OQ-103

What does the Graph view do on a phone (< `md`)? **Proposed:** show the Lanes view with a note,
and keep `view=graph` in the address. Alternative: a full-screen canvas on phones with touch pan
and zoom, with the chain list as a select above it.

**Resolved 2026-11-27:** as proposed.

### OQ-104

React Flow shows a "React Flow" attribution link in the corner unless `proOptions.hideAttribution`
is set. Its MIT licence allows removing it, and the authors ask that projects which remove it
support them. **Proposed:** keep the attribution, styled with the theme so it passes contrast.
Alternative: hide it.

**Resolved 2026-11-27:** as proposed.

### OQ-105

Should the chain list show anything beyond the title, stock count and held count, for example the
chain's value at cost in THB, to make where the money sits visible before a pick? **Proposed:**
title, stocks and held only, to keep the list narrow. Alternative: add the value as a second line.

**Resolved 2026-11-27:** as proposed.
