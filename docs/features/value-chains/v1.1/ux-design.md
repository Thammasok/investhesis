---
version: 1.1
status: approved
date: 2026-11-27
requires: design.md
---

# UX/UI Design: Value Chains — Graph view

There are no mockups for this project. The `.claude/design/` files named by the planner skill
belong to another product, so this spec builds on the live `/chains` page and
[Value Chains v1.0 UX](../v1.0/ux-design.md). It uses the same shell, theme tokens and
`ui/` components, and adds no new colours or radii.

**New shadcn components:** `toggle-group` (and `toggle`, which it uses) for the view switch:
`pnpm dlx shadcn@latest add toggle-group` in `apps/web`, then the `cn` import fix from
`CLAUDE.md`. The rest is already installed: `card`, `badge`, `button`, `alert`, `separator`,
`skeleton`, `tooltip`, plus the v1.0 dialog.

The v1.0 patterns still apply: the **Held marker** (`Badge variant="secondary"` "Held"), the
**lane counts** line (`3 stocks · 2 held · ฿1,020,000.00 · 41.3%`), **Money** (`฿1,234,567.89`,
from the decimal string, `tabular-nums`), and the Stock Lists
[Shared patterns](../../stock-lists/v1.0/ux-design.md#shared-patterns). This slice adds:

- **Strong outline**: `border-muted-foreground` on the stage groups and stock nodes and in the
  chain list's current item, so a boundary reaches 3:1 against `card` and `background`. This is
  the same token the Filters checkboxes use.
- **Graph focus ring**: `focus-visible:outline-2 focus-visible:outline-offset-2
  focus-visible:outline-foreground` on every link inside the canvas. The default `ring` token was
  found faint before (Thesis Log F-6), and a node on a dotted background needs a clear ring.

## Screens in Scope

- **Value chains, view switch**: `/chains`. The Lanes | Graph switch is added under the
  controls ([FR-101](requirements.md#fr-101)). The Lanes view itself is unchanged and specified
  in [v1.0 §Value chains](../v1.0/ux-design.md#value-chains).
- **Value chains, Graph view**: `/chains?view=graph` from `md`, with the chain list, the chain
  header and the canvas ([FR-102](requirements.md#fr-102) to [FR-112](requirements.md#fr-112)).
- **States**: loading the graph chunk, the chunk failing to load, a `chain=` that is not in
  view, a phone below `md` ([FR-113](requirements.md#fr-113)), and the empty states.
- **Rename chain dialog**: reused unchanged from
  [v1.0 §Rename chain dialog](../v1.0/ux-design.md#rename-chain-dialog). Only where focus lands
  afterwards is new ([FR-110](requirements.md#fr-110)).

## Lo-fi Wireframes

### Graph view

Desktop (`lg`). The left column is the chain list and the right column is the selected chain:

<pre>
┌ Sidebar ┬─ ☰ │ Value chains ──────────────────────────────────────────────────────────────┐
│         │ Value chains                                          [◔ See concentration]   │
│         │ Your stocks along each chain, from upstream to downstream.                    │
│         │                                                                                │
│         │ Scope [Held stocks (18) ▾]   [🔍 Search ticker, name, theme     ] [Filters 1]  │
│         │ 14 of 18 stocks · Market: TH ×  · Clear all                                    │
│         │                                                                                │
│         │ View [☰ Lanes | ⑂ Graph]                                                      │
│         │                                                                                │
│         │ ┌ ℹ 4 stocks in view have no value chain. [Show them] ───────────────────────┐ │
│         │                                                                                │
│         │ ┌ Chains ──────────┐ ┌ AI & Semis ───────────────────── [Stocks →] [✎ Rename]┐ │
│         │ │┃AI & Semis     › │ │ 8 stocks · 5 held · ฿2,451,302.10                     │ │
│         │ │┃8 stocks · 5 held│ │ Also spelled: ai & semis                              │ │
│         │ │ Oil & Gas        │ │ ┌ canvas ··········································┐ │ │
│         │ │ 4 stocks · 2 held│ │ │ ┌ Upstream ───────┐     ┌ Midstream ──────┐     ┌ Down┐│ │
│         │ │ EV               │ │ │ │2 · 1 held · 18.0%│────▶│3 · 3 held · 71.5%│────▶│2 · 1││ │
│         │ │ 3 stocks · none  │ │ │ │┌──────────────┐ │     │┌──────────────┐ │     │┌────┐││ │
│         │ │ Cloud            │ │ │ ││ASML [Held] US│ │     ││TSM  [Held] US│ │     ││MSFT│││ │
│         │ │ 2 stocks · 1 held│ │ │ ││ASML Holding  │ │     ││Taiwan Semico…│ │     ││Micr│││ │
│         │ │ …                │ │ │ ││฿441,234.00   │ │     ││฿1,020,000.00 │ │     ││฿257│││ │
│         │ │ (scrolls)        │ │ │ │└──────────────┘ │     │└──────────────┘ │     │└────┘││ │
│         │ │                  │ │ │ │┌──────────────┐ │     │ …               │     │ …   ││ │
│         │ │                  │ │ │ ││AMAT        US│ │     └─────────────────┘     └─────┘│ │
│         │ │                  │ │ │ │└──────────────┘ │                                    │ │
│         │ │                  │ │ │ └─────────────────┘                                    │ │
│         │ │                  │ │ │ ┌ Integrated (spans every stage) ────────────────────┐ │ │
│         │ │                  │ │ │ │ 1 · none held   ┌INTC   US┐                        │ │ │
│         │ │                  │ │ │ └─────────────────└─────────┘────────────────────────┘ │ │
│         │ │                  │ │ │ [+][−][⤢]                              React Flow ↗    │ │
│         │ └──────────────────┘ │ └·····················································┘ │ │
│         │                      │ 1 held stock has no shares or cost and is left out …  │ │
│         │                      └───────────────────────────────────────────────────────┘ │
│         │ Classifications are your own judgment, not investment advice.                  │
└─────────┴────────────────────────────────────────────────────────────────────────────────┘
</pre>

- **Layout notes**: the page header, controls, notes and advice line are the v1.0 page,
  unchanged. Only the body below the view switch changes. The two columns are a CSS grid
  (`md:grid-cols-[13rem_minmax(0,1fr)]`, `lg:grid-cols-[15rem_minmax(0,1fr)]`). The chain list is
  as tall as the chain card and scrolls on its own. The canvas fills the card's width at a fixed
  height (`h-[min(70vh,720px)] min-h-[420px]`), so the page does not grow with the chain. Panning
  and zooming happen inside it.
- **User flow**: open `/chains` → View: Graph → the first chain (most stocks) is drawn and fitted
  → pick another chain in the list → the canvas redraws and fits again, the address gets `chain=`
  → Tab into the canvas → focus walks Upstream → Midstream → Downstream → Integrated → No position,
  the canvas pans to each focused node → Enter opens the stock. Changing the scope or a filter
  redraws the same chain. If the chain leaves the view, the first chain is drawn and the "not in
  view" note shows.
- **Annotations**:
  - **View switch**: two items with icon and text, `Lanes` (`LayoutListIcon`) and `Graph`
    (`WorkflowIcon`), labelled "View". The selected item is pressed (`data-state="on"`, `bg-accent`
    plus `aria-pressed`). Clicking the pressed item does nothing (a single toggle group must not
    become empty).
  - **Chain list**: the current chain has a left bar (`border-l-2 border-foreground`), a `›`
    chevron and `bg-accent`, so it is shown by shape as well as colour. Each item is a link (so
    it can be opened in a new tab or bookmarked) that writes `chain=` with `replace`.
  - **Arrows**: one between Upstream and Midstream and one between Midstream and Downstream,
    mid-height of the header, always drawn. Integrated and No position have no arrows.
  - **Stock node**: line 1 is the ticker, `Held` badge and market (right-aligned). Line 2 is the
    name, cut with an ellipsis (full name on hover through `title`). Line 3 is the THB value when
    known. The whole node is one link.
  - **Controls**: bottom-left (zoom in, zoom out, fit view). The themed attribution is
    bottom-right.

### No position node

<pre>
┌ No position ─────────────────────────────────────────────────────────────┐
│ 1 · none held                                                             │
│ ┌──────────────────────────┐                                              │
│ │ BCP                   TH │                                              │
│ │ Bangchak Corporation     │                                              │
│ │ ฿80,000.00  Set position │                                              │
│ └──────────────────────────┘                                              │
└───────────────────────────────────────────────────────────────────────────┘
</pre>

- **Annotations**: links cannot be nested, so a No position node is a `div` with two links: the
  stock link (ticker, name, value) and `Set position` (to `/stocks/:id/edit`, as in v1.0
  [FR-003](../v1.0/requirements.md#fr-003) Lanes). These are two Tab stops.

### Loading and load failure

<pre>
┌ AI & Semis ───────────────────── [Stocks →] [✎ Rename]┐   ┌ AI & Semis ───────────── [Stocks →] [✎ Rename]┐
│ 8 stocks · 5 held · ฿2,451,302.10                     │   │ 8 stocks · 5 held · ฿2,451,302.10             │
│ ┌──────────────────────────────────────────────────┐ │   │ ┌ ⚠ The graph could not load. ───────────────┐│
│ │░░░░░░░░░░░░░░░░ skeleton, canvas size ░░░░░░░░░░░│ │   │ │ Check your connection and try again, or    ││
│ │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ │   │ │ use the Lanes view.                        ││
│ └──────────────────────────────────────────────────┘ │   │ │ [Try again]  [Show lanes]                  ││
└──────────────────────────────────────────────────────┘   │ └────────────────────────────────────────────┘│
                                                            └───────────────────────────────────────────────┘
</pre>

- **Layout notes**: the chain list and header render at once (they are in the chains chunk).
  Only the canvas area waits for the lazy chunk, so nothing jumps when it arrives. The skeleton
  has the canvas's exact size.
- **User flow**: Try again resets the local error boundary and retries the import (a fresh
  `import()` call, since a failed dynamic import is not cached by Vite in production). Show lanes
  writes the Lanes view (removes `view`). A failure here never reaches `RouteError`.

### Chain not in view

<pre>
View [☰ Lanes | ⑂ Graph]
┌ ℹ The chosen chain is not in this view. Showing AI & Semis. ─────────────────┐
┌ Chains ─────┐ ┌ AI & Semis … ┐
</pre>

- **Annotations**: an `Alert` (`role="status"`) joins the v1.0 address notes (`AddressNotes`). The
  address keeps the old `chain=` until the investor picks a chain ([OQ-101](requirements.md#oq-101)).

### Phone (< `md`)

<pre>
┌ ☰ │ Value chains ─────────────────────┐
│ Value chains                            │
│ [◔ See concentration]                   │
│ Scope [All stocks ▾]                    │
│ [🔍 Search …          ] [Filters]       │
│ View [☰ Lanes | ⑂ Graph]                │
│ ┌ ℹ The graph needs a wider screen. ──┐ │
│ │   Showing lanes.                     │ │
│ └──────────────────────────────────────┘ │
│ ┌ AI & Semis ── (v1.0 lanes, stacked) ┐ │
│ │ …                                   │ │
</pre>

- **Annotations**: the switch still shows `Graph` as pressed (the address says so). Pressing
  `Lanes` removes `view` and the note. The graph chunk is never fetched below `md`. Widening the
  window past 768 px shows the graph without a reload ([FR-113](requirements.md#fr-113)).

### Empty states

<pre>
View [☰ Lanes | ⑂ Graph]
┌──────────────────────────────────────────────┐
│ (v1.0 empty card: no stocks / no chains in   │
│  view / filter result line + Clear all)      │
└──────────────────────────────────────────────┘
</pre>

- **Annotations**: the same v1.0 empty cards replace the whole two-column body. The switch stays,
  so the investor can go back to Lanes ([FR-112](requirements.md#fr-112)).

## Hi-fi Component Specs

### View switch

#### Layout

- **Wrapper**: `div className="flex items-center gap-3"` with a `span id` "View"
  (`text-sm font-medium`) and the group labelled by it. It sits after the controls row and before
  the notes. It is visible in every state, phones included.
- **Responsive**: unchanged across breakpoints (two short items).

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Group | `ToggleGroup type="single"` | outline / sm | `aria-labelledby` the "View" label; `onValueChange` ignores `''` | default |
| Lanes / Graph | `ToggleGroupItem value="lanes" \| "graph"` | outline / sm | `LayoutListIcon` / `WorkflowIcon` (`aria-hidden`) + text; `data-[state=on]:bg-accent data-[state=on]:text-foreground` | default, hover (`bg-muted`), focus (`ring`), on (`aria-pressed="true"`) |

#### Accessibility

- **Contrast**: item text is `foreground` on `background` or `accent` (about 19:1 and 16:1). The
  outline border is the measured `input` border of other outline buttons. The on state is also
  shown by `aria-pressed`, not colour alone.
- **ARIA roles**: Radix Toggle Group gives `role="group"` and `aria-pressed` buttons, with arrow
  keys between items (roving focus). The group is named "View".
- **Keyboard navigation**: one Tab stop. Left and Right move between items, and Space or Enter
  presses. After a switch, focus stays on the pressed item. The body below changes, and no focus
  is moved.

### Graph view

#### Layout

- **Wrapper**: `div className="grid gap-4 md:grid-cols-[13rem_minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)]"`.
- **Chain list column**: `nav aria-label="Chains"` > `ul className="space-y-1"`, in
  `div className="md:sticky md:top-4 md:max-h-[calc(min(70vh,720px)+10rem)] md:overflow-y-auto md:pr-1"`.
  On mount and when the selected chain changes, the current item is scrolled into view
  (`scrollIntoView({ block: 'nearest' })`, no smooth scroll).
- **Chain card**: `Card role="region" aria-labelledby` its `h2`, with the same `CardHeader` as
  v1.0 `ChainSection` (title, `CardAction` with Stocks → and Rename, counts, also-spelled), then
  `CardContent className="space-y-3"` with the canvas box and the left-out line.
- **Canvas box**: `div className="relative h-[min(70vh,720px)] min-h-[420px] overflow-hidden rounded-lg border bg-muted/30"`
  with the `ReactFlow` inside (`className="chain-graph"`).
- **Responsive**: shown only from `md` (768 px). From `md` to `lg` the list is 13rem and the
  canvas gets the rest, and `fitView` handles any width. Below `md` the Lanes view shows
  ([FR-113](requirements.md#fr-113)).

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Chain list item | `li` > `Link replace` | — | `flex items-start gap-2 rounded-md border-l-2 border-transparent px-3 py-2 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring outline-none`; title `text-sm font-medium break-words`; counts `block text-xs text-muted-foreground tabular-nums` | default, hover, focus, current (`aria-current="true"`, `bg-accent border-foreground`, counts `text-foreground`, `ChevronRightIcon` at the end) |
| Chain title | `h2` | — | `font-heading text-base font-semibold break-words outline-none`, `tabIndex={-1}` | static, focus target after merge |
| Stocks → / Rename | as v1.0 | ghost sm / outline sm | `data-chain-rename={key}` on Rename | as v1.0 |
| Counts / Also spelled / left-out | as v1.0 | — | as v1.0 | as v1.0 |
| Canvas | `ReactFlow` (lazy `ChainGraph`) | — | `chain-graph`; `fitView` with `padding: 0.15`, `minZoom 0.2`, `maxZoom 1.5`; the props of [ADR-104](design.md#key-decisions) | loading (skeleton), drawn, failed (alert) |
| Background | `Background variant="dots"` | — | `--xy-background-pattern-dots-color` = `var(--border)`, gap 20 | static |
| Stage group node | custom `stage` node | — | `h-full w-full rounded-lg border border-muted-foreground bg-card px-3 pt-2`; `h3 className="text-sm font-medium"`; counts `text-xs text-muted-foreground tabular-nums`; "No stocks" `text-sm text-muted-foreground` | static, empty |
| Stage arrow | default `smoothstep` edge, `markerEnd: ArrowClosed` | — | `--xy-edge-stroke` = `var(--foreground)`, `--xy-edge-stroke-width` = 2; `aria-hidden` (not focusable) | static |
| Stock node | custom `stock` node > `Link` | — | `nodrag nopan flex h-full flex-col justify-center rounded-md border border-muted-foreground bg-background px-2 py-1 text-left hover:bg-accent outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground`; line 1 `flex items-center gap-2`: ticker `text-sm font-medium`, Held `Badge variant="secondary"`, market `ml-auto text-xs text-muted-foreground`; line 2 name `truncate text-xs text-muted-foreground` with `title`; line 3 value `text-xs tabular-nums` | default, hover, focus |
| Set position (No position only) | `Link` | — | `nodrag nopan ml-auto text-xs underline underline-offset-2 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-foreground`, `aria-label="Set position of {ticker}"` | default, hover, focus |
| Controls | `Controls showInteractive={false} position="bottom-left"` | — | `--xy-controls-button-background-color` = `var(--card)`, `-color` = `var(--foreground)`, `-border-color` = `var(--border)`, hover `var(--accent)`; buttons get the graph focus ring | default, hover, focus, disabled (at min/max zoom) |
| Attribution | default `Attribution` | — | `--xy-attribution-background-color` = `var(--card)`; link `text-foreground underline` | default, focus |
| Loading | `Skeleton` | — | `h-full w-full rounded-lg` in the canvas box | while the chunk loads |
| Load failure | `Alert` | default, `TriangleAlertIcon text-destructive`, `text-foreground` body | actions `Button variant="outline" size="sm"` "Try again" and `Button variant="link" size="sm"` "Show lanes" | after a failed `import()` |
| Phone note / not-in-view note | `Alert role="status"` | default | `InfoIcon` | as specified |

#### Copy

| Key | English |
|---|---|
| View label | View |
| Switch items | Lanes · Graph |
| Chain list label | Chains |
| Chain list counts | `{n} stocks · {m} held`, `1 stock · none held` (the v1.0 count words) |
| Canvas label | `Graph of {chain}` |
| Canvas description (sr-only) | Stages from upstream to downstream. Each stock is a link to its page. The Lanes view shows the same stocks as a list. |
| Stock link name (sr-only suffix) | `, {stage}`, for example "ASML Held ASML Holding US ฿441,234.00, Upstream" |
| Controls (`ariaLabelConfig`) | Graph controls · Zoom in · Zoom out · Fit to view |
| Not in view note | The chosen chain is not in this view. Showing {title}. |
| Bad view note | Unknown view "{value}", showing lanes. |
| Phone note | The graph needs a wider screen. Showing lanes. |
| Load failure | The graph could not load. Check your connection and try again, or use the Lanes view. |
| Stage headings | Upstream · Midstream · Downstream · Integrated (spans every stage) · No position (as v1.0) |

New strings go through the i18n slice if it has landed ([constraint](requirements.md#constraints)).

#### Accessibility

- **Contrast** (light / dark, measured by the E2E contrast helper over the real composited
  background):
  - Text: titles and tickers `foreground` on `card`/`background` (about 19:1). Counts, names and
    market `muted-foreground` on `card` (about 4.7:1 light, 6.9:1 dark) and on `background`
    (higher). Current list item counts move to `foreground` because `accent` is darker than `card`.
  - Non-text 3:1: group and node borders `muted-foreground` on `card` and on the
    `muted/30`-over-`card` canvas (about 4.7:1). Arrows `foreground` at 2 px. The graph focus ring
    `foreground` (outline, about 19:1). Control buttons are named icons on `card` with
    `foreground` icons.
- **ARIA roles**:
  - The canvas box is a `section` with `aria-label="Graph of {chain}"` and `aria-describedby`
    the sr-only description.
  - Stage groups render an `h3`. React Flow renders nodes as flat siblings in array order, so the
    reading order is the Upstream heading and counts, then its stocks, then Midstream, and so on.
    Each stock link ends with an sr-only `, {stage}` so its name stands alone.
  - "Held" is text.
  - Edges are decorative (`aria-hidden`) because the stage order is in the headings and the DOM
    order. React Flow's node `aria-describedby` hint is not rendered, because nodes are not
    focusable ([ADR-104](design.md#key-decisions)).
  - If axe flags the pane's own role or the `aria-roledescription` React Flow sets, the dev task
    fixes it with the documented props, never by hiding the canvas from assistive tech.
- **Keyboard navigation**:
  - Tab order: view switch → chain list links (one per chain) → Stocks → → Rename → stock links
    in stage order (Upstream, Midstream, Downstream, Integrated, No position, each top to bottom;
    Set position after its stock) → Zoom in → Zoom out → Fit to view → attribution link.
  - When a node link takes focus outside the viewport, the canvas pans so the node is centred at
    the current zoom ([ADR-105](design.md#key-decisions)). There is no animation under
    `prefers-reduced-motion`, and 200 ms otherwise.
  - Enter opens the stock. Arrow keys, Delete and Space do nothing on the canvas.
  - Picking a chain keeps focus on the picked list link. After a rename, focus goes to the graph
    header's Rename button. After a merge it goes to the chain heading. If a filter hides the
    chain after the save, focus goes to the page `h1` (as v1.0).
- **Motion**: `fitView` uses `duration: 0` under `prefers-reduced-motion`, otherwise 200 ms.
  There are no animated edges.

## Design Review

### Heuristics (Nielsen)

| # | Heuristic | Issues Found | Score (1–4) | Resolution |
|---|-----------|--------------|-------------|------------|
| 1 | Visibility of system status | The chosen chain silently changes when a filter hides it | 2 | "Not in view" note naming the chain shown ([OQ-101](requirements.md#oq-101)). |
| 2 | Match with the real world | Arrows between stocks would suggest supplier links that are not stored | 2 | Arrows join stage groups only, and the canvas description says what is shown. |
| 3 | User control and freedom | A zoomed-in canvas can lose the chain | 2 | Fit to view control, and the canvas fits again on each chain pick. |
| 4 | Consistency and standards | Figures could drift between views | 1 | Both views render the same `groupChains` result and the same counts copy ([NFR-104](requirements.md#nfr-104)). |
| 6 | Recognition rather than recall | Which chain is drawn must stay visible | 1 | Current item marked in the list, chain title in the card header. |
| 7 | Flexibility and efficiency | Many chains mean a long list | 2 | List scrolls on its own and keeps the current item in view. Search and filters still narrow it. |
| 8 | Aesthetic and minimalist design | 60 nodes in a stage make a tall column | 2 | Fixed node size, fit view at min zoom 0.2, Integrated and No position flow in three columns. The Lanes view stays the default for reading lists. |
| 9 | Help users recover from errors | A failed chunk load could look like a broken page | 2 | Local alert with Try again and Show lanes. The route error is not used. |
| 10 | Help and documentation | — | 1 | The canvas description points to the Lanes view. |

No issue of score 3 or 4.

### Accessibility Audit

- **WCAG AA**: every text pair reuses a measured token pair (`foreground`/`muted-foreground` on
  `card` and `background`, the `secondary` badge). The new non-text pairs (strong outline, arrow,
  graph focus ring) use `muted-foreground` or `foreground` and are checked by the E2E contrast
  helper in both themes. No tinted destructive text is used.
- **Keyboard flow**: every action is a link or button in reading order. The canvas needs no
  pointer, because the pan-on-focus keeps the focused node visible and the controls zoom. The
  Lanes view stays as the full text equivalent (WCAG 1.1.1 and 1.3.1 for the visual layout).
