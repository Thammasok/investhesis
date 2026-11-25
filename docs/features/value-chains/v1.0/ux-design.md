---
version: 1.0
status: approved
date: 2026-11-25
requires: design.md
---

# UX/UI Design: Value Chains

Like the earlier slices there are no mockups: the page builds on the `sidebar-08` shell, the theme
tokens in `apps/web/src/index.css` and the installed `ui/` components. **No new shadcn component
is needed**: this slice uses `card`, `badge`, `button`, `alert`, `dialog`, `field`, `input`,
`select`, `sheet` (through `FilterToolbar`), `separator`, `skeleton` and `sonner`. No new colours
or radii.

The [Shared patterns](../../stock-lists/v1.0/ux-design.md#shared-patterns) of Stock Lists apply
(page header and focus, loading, toasts, field and form errors, the contrast rule), and the
**Money** pattern of [Holdings and Concentration](../../holdings-concentration/v1.0/ux-design.md)
(`฿1,234,567.89`, from the decimal string, `tabular-nums`). Added here:

- **Held marker** — `Badge variant="secondary"` with the text `Held`, the same badge as the Held
  column. Text, never colour alone ([FR-004](requirements.md#fr-004)).
- **Lane counts** — one line under each lane heading: `3 stocks · 2 held · ฿1,020,000.00 · 41.3%`
  (`text-sm text-muted-foreground tabular-nums`); parts with nothing to say are dropped
  (`2 stocks · none held`).

## Screens in Scope

- **Value chains** — `/chains`, replacing the placeholder ([FR-001](requirements.md#fr-001) to
  [FR-008](requirements.md#fr-008), [FR-012](requirements.md#fr-012), [FR-013](requirements.md#fr-013)).
- **Rename chain dialog** — rename, merge confirmation and errors, opened from a chain section
  ([FR-009](requirements.md#fr-009) to [FR-011](requirements.md#fr-011)).

The Filters sheet, search box and result line are `FilterToolbar` from Search, Filter and Export,
unchanged; the Scope select is the one on `/concentration`, moved to a shared component.

## Lo-fi Wireframes

### Value chains

Desktop (`md` and wider):

<pre>
┌ Sidebar ┬─ ☰ │ Value chains ────────────────────────────────────────────────────────┐
│         │ Value chains                                    [See concentration →]   │
│         │ Your stocks along each chain, from upstream to downstream.              │
│         │                                                                          │
│         │ Scope [Held stocks (18) ▾]   [🔍 Search ticker, name, theme ] [Filters 1]│
│         │ 14 of 18 stocks · Market: TH ×  · Clear all                              │
│         │                                                                          │
│         │ ┌ ℹ 4 stocks in view have no value chain. [Show them] ──────────────────┐│
│         │ └───────────────────────────────────────────────────────────────────────┘│
│         │                                                                          │
│         │ ┌ AI & Semis ───────────────────────────────── [Stocks →] [✎ Rename] ┐  │
│         │ │ 8 stocks · 5 held · ฿2,451,302.10                                    │  │
│         │ │ Also spelled: ai & semis                                             │  │
│         │ │ ┌ Upstream ──────────┐ ┌ Midstream ─────────┐ ┌ Downstream ────────┐ │  │
│         │ │ │ 2 · 1 held · 18.0% │ │ 3 · 3 held · 71.5% │ │ 2 · 1 held · 10.5% │ │  │
│         │ │ │ ASML  [Held]       │ │ TSM   [Held]       │ │ MSFT  [Held]       │ │  │
│         │ │ │ ASML Holding · US  │ │ Taiwan Semi · US   │ │ Microsoft · US     │ │  │
│         │ │ │ ฿441,234.00        │ │ ฿1,020,000.00      │ │ ฿257,402.10        │ │  │
│         │ │ │ AMAT               │ │ NVDA  [Held]       │ │ ORCL               │ │  │
│         │ │ │ Applied Mat. · US  │ │ …                  │ │ Oracle · US        │ │  │
│         │ │ └────────────────────┘ └────────────────────┘ └────────────────────┘ │  │
│         │ │ ┌ Integrated (spans every stage) ──────────────────────────────────┐ │  │
│         │ │ │ 1 · none held          INTC  Intel · US                          │ │  │
│         │ │ └──────────────────────────────────────────────────────────────────┘ │  │
│         │ │ 1 held stock has no shares or cost and is left out of the value.     │  │
│         │ └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                          │
│         │ ┌ Oil & Gas ──────────────────────────────────  [Stocks →] [✎ Rename] ┐  │
│         │ │ 4 stocks · 2 held · ฿1,020,000.00                                    │  │
│         │ │ ┌ Upstream ──────────┐ ┌ Midstream ─────────┐ ┌ Downstream ────────┐ │  │
│         │ │ │ PTTEP [Held] …     │ │ No stocks          │ │ …                  │ │  │
│         │ │ └────────────────────┘ └────────────────────┘ └────────────────────┘ │  │
│         │ │ ┌ No position ─────────────────────────────────────────────────────┐ │  │
│         │ │ │ 1 · none held          BCP  Bangchak · TH     [Set position]     │ │  │
│         │ │ └──────────────────────────────────────────────────────────────────┘ │  │
│         │ └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                          │
│         │ These chains and costs are your own classifications, not advice.         │
└─────────┴──────────────────────────────────────────────────────────────────────────┘
</pre>

Phone (360 px): the lanes stack, the header actions wrap below the title.

<pre>
┌ ☰ │ Value chains ────────────┐
│ Value chains                 │
│ [See concentration →]        │
│ Scope [Held stocks (18)  ▾]  │
│ [🔍 Search…      ] [Filters] │
│ 14 of 18 stocks · Clear all  │
│ ┌ AI & Semis ───────────────┐│
│ │ 8 stocks · 5 held         ││
│ │ ฿2,451,302.10             ││
│ │ [Stocks →]  [✎ Rename]    ││
│ │ Upstream                  ││
│ │ 2 · 1 held · 18.0%        ││
│ │ ASML [Held] ฿441,234.00   ││
│ │ ASML Holding · US         ││
│ │ ───────────────────────── ││
│ │ Midstream                 ││
│ │ …                         ││
│ └───────────────────────────┘│
└──────────────────────────────┘
</pre>

Other states ([FR-012](requirements.md#fr-012)):

<pre>
No saved stocks                           Stocks, but none in view has a chain
┌──────────────────────────────────┐      ┌────────────────────────────────────────┐
│        (network icon)            │      │        (network icon)                  │
│  No value chains yet             │      │  No value chains in this view          │
│  Add stocks, then give each a    │      │  Give a stock a value chain name and   │
│  value chain and a position.     │      │  a position (Upstream, Midstream,      │
│  [+ Add stock]  [⇪ Import]       │      │  Downstream) on its edit page.         │
└──────────────────────────────────┘      │  [Show the 14 stocks with no chain]    │
                                          └────────────────────────────────────────┘
Filters match no stock                    No rate saved, a USD holding in view
"0 of 18 stocks" · [Clear all]            ┌ ℹ USD holdings are left out of values until ┐
(no chain sections, no empty card)        │   you save a rate. [Set rate on Concentration]┘

Address names a deleted list              Loading
┌ ℹ That list no longer exists. Showing all stocks. ┐   PageSkeleton (app HydrateFallback)
</pre>

- **Layout notes** — header, scope and `FilterToolbar` row, notes (fallback, no-chain count, rate),
  one `Card` per chain, the advice note. Lanes are a `grid` of three equal columns from `md`, and
  the Integrated and No position areas sit below them at full width. Nothing scrolls sideways
  ([NFR-007](requirements.md#nfr-007)).
- **User flow** — change scope, search or a filter → chains regroup at once, the address updates
  (`replace`), no request. A ticker opens the stock page. **Stocks →** opens `/stocks` filtered to
  that chain. **Set position** (No position area, per stock) opens `/stocks/:id/edit`. **Show
  them** opens the stocks with no chain ([FR-006](requirements.md#fr-006)). **See concentration**
  opens `/concentration?lens=valueChain` with the same scope and filters. **Rename** opens the
  dialog.
- **Annotations** — "Also spelled" shows only when the chain has more than one spelling
  ([OQ-4](requirements.md#oq-4)), listing the others comma-separated. The value line and lane
  shares show only when the chain has a valued held stock; the left-out line only when a held
  stock is left out. An empty lane shows "No stocks" in `text-muted-foreground`.

### Rename chain dialog

<pre>
Rename                                         Merge (target name exists)
┌ Rename chain ─────────────────── [×] ┐       ┌ Merge into "AI & Semis"? ─────────────── [×] ┐
│ Chain name                           │       │ "AI semis" (3 stocks) and "AI & Semis"       │
│ [ AI semis                        ]  │       │ (8 stocks) will become one chain named       │
│ Changes the name on 3 stocks,        │       │ "AI & Semis". This can't be split again      │
│ including any outside this view.     │       │ automatically.                               │
│                                      │       │                                              │
│                  [Cancel]  [Rename]  │       │                 [Back]  [Merge 11 stocks]    │
└──────────────────────────────────────┘       └──────────────────────────────────────────────┘

Error in the field                             Chain gone (404)
│ [                                 ]  │       ┌ ⚠ This chain no longer exists. ─────────────┐
│ ⚠ Enter a name of 1 to 60 characters.│       │ It may have been renamed elsewhere.          │
                                               │                               [Close]        │
Network / server error                         └──────────────────────────────────────────────┘
┌ ⚠ Couldn't rename the chain. Try again. ┐  (Alert at the top; the typed name is kept)
</pre>

- **Layout notes** — one `Dialog`, `sm:max-w-md`, two steps in the same content: the name step
  and the merge step. The count is of **all** the investor's stocks in that chain, not only the
  ones in view ([FR-009](requirements.md#fr-009)).
- **User flow** — Rename → type → Rename. If the name (ignoring case) is another chain's, the
  dialog moves to the merge step before sending; **Back** returns to the name with the text kept;
  **Merge N stocks** sends with `merge: true`. If the server answers `409` (another chain appeared
  since the page loaded), the dialog moves to the merge step with the server's name and count.
  Success → dialog closes → toast "Renamed to AI & Semis · 3 stocks changed" or "Merged into
  AI & Semis · 11 stocks" → page re-reads. A case-only change ("ai & semis" → "AI & Semis") is a
  plain rename. The Rename button stays enabled while the name equals the current title; saving
  that sends nothing and toasts "No changes to save", as the stock form does.
- **Annotations** — the input starts with the chain's title selected. Its `maxLength` is 60, and
  the counter-free hint names the limit only on error.

## Hi-fi Component Specs

### Value chains

#### Layout

- **Wrapper** — `<section className="space-y-6">`; `PageHeader` (title "Value chains",
  description, `actions` = the See concentration link).
- **Controls** — `div className="flex flex-wrap items-end gap-4"`: `ScopeSelect`
  (`w-full sm:w-56`) then `FilterToolbar` (`flex-1 min-w-0`), as on `/concentration`.
- **Chain list** — `div className="space-y-6"`, one `Card` per chain.
- **Lanes** — `div className="grid gap-4 md:grid-cols-3"`; Integrated and No position
  `div className="mt-4"` full width.
- **Responsive** — below `md` the lanes stack in order with a `Separator` between them and the
  lane cards lose their border (`md:rounded-lg md:border md:p-3`) so the chain card is not boxes in
  boxes; the chain header's buttons wrap below the title (`flex flex-wrap gap-2`). From `md` the
  three lanes sit side by side.

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| See concentration | `Button asChild` + `Link` | outline / default | `ChartPieIcon`, `w-full sm:w-auto` | default, hover, focus |
| Scope | `ScopeSelect` (`Select` + `SelectGroup` "Lists") | default | `w-full sm:w-56` | default, open, focus |
| Toolbar | `FilterToolbar` (`keep: ['scope']`, `sort: false`) | — | existing | as Search, Filter and Export |
| Fallback / no-chain / rate notes | `Alert` (`role="status"`) | default | `InfoIcon`; action a `Button variant="link" size="sm" asChild` | shown when relevant |
| Chain card | `Card` + `CardHeader` + `CardAction` + `CardContent` | — | `CardTitle` is an `h2` (`text-base font-semibold break-words`), `id` per chain for `aria-labelledby` | static |
| Chain summary | `CardDescription` | — | `tabular-nums` | static |
| Also spelled | `p` | — | `text-xs text-muted-foreground` | only with several spellings |
| Stocks → | `Button asChild` + `Link` | ghost / sm | `ArrowRightIcon` after text | default, hover, focus |
| Rename | `Button` | outline / sm | `PencilIcon`, `data-chain-rename={key}` | default, hover, focus |
| Lane | `section` + `h3` + `ul` | — | `md:rounded-lg md:border md:p-3`; `h3` `text-sm font-medium` | static, empty ("No stocks") |
| Lane counts | `p` | — | `text-sm text-muted-foreground tabular-nums` | static |
| Stock entry | `li` > `Link` | — | block link `rounded-md px-2 py-1.5 hover:bg-accent focus-visible:ring-2 ring-ring`; ticker `font-medium`, name and market `text-sm text-muted-foreground break-words`, value `text-sm tabular-nums` | default, hover, focus |
| Held | `Badge` "Held" | secondary | `ml-2` | static |
| Set position | `Button asChild` + `Link` to `/stocks/:id/edit` | link / sm | in the No position area only, after the entry | default, hover, focus |
| Left-out line | `p` | — | `text-sm text-muted-foreground` | shown when a held stock is left out |
| Empty states | `Empty` pattern of `/stocks` (`Card` with icon, title, text, actions) | — | `NetworkIcon` | no stocks, no chains in view |
| Advice note | `p` | — | `text-sm text-muted-foreground` | static |

#### Accessibility

- **Contrast** — titles `foreground` on `card` ≈ 19:1; counts, names and hints `muted-foreground`
  on `card` ≈ 4.7:1 light, ≈ 6.9:1 dark; the `secondary` Held badge is the one already measured on
  the Held column. Hover `bg-accent` keeps the text at `foreground`.
- **ARIA roles** — each chain card is a `section` with `aria-labelledby` its `h2`; each lane a
  `section` labelled by its `h3`, its stocks a `ul`. The lane counts line is in the lane, after the
  heading, so a screen reader hears "Upstream, 2 stocks, 1 held". Value shares are text, never a
  bar alone ([NFR-006](requirements.md#nfr-006)). Notes are `role="status"`.
- **Keyboard navigation** — tab order: header link, scope, search, Filters, active filter chips,
  then per chain: Stocks →, Rename, each stock link lane by lane (Upstream, Midstream, Downstream,
  Integrated, No position), Set position links. No custom key handling.

### Rename chain dialog

#### Layout

- **Wrapper** — `Dialog` + `DialogContent className="sm:max-w-md"`; the form mounts with the
  dialog (a fresh state each opening) and takes `returnFocusTo`, like `ListNameDialog`.
- **Responsive** — full-width footer buttons below `sm` (`DialogFooter` default stacking).

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Title | `DialogTitle` | — | "Rename chain" / `Merge into "<name>"?` | per step |
| Name | `Field` + `FieldLabel` "Chain name" + `Input` (`maxLength={60}`, `autoComplete="off"`) | default | — | default, focus, error (`aria-invalid`), disabled while saving |
| Hint | `FieldDescription` | — | "Changes the name on N stocks, including any outside this view." | static |
| Field error | `FieldMessage` | — | — | on error |
| Form error | `Alert` | destructive icon, `text-foreground` body | `TriangleAlertIcon text-destructive` | network, 5xx, 404 |
| Merge text | `DialogDescription` | — | names both chains and counts | merge step |
| Cancel / Back | `Button` | outline / default | — | default, hover, focus, disabled while saving |
| Rename / Merge N stocks | `Button type="submit"` | default | `Loader2Icon animate-spin motion-reduce:animate-none` while saving | default, loading |

#### Accessibility

- **Contrast** — as the other dialogs; the merge button is the primary button, not destructive
  styled (nothing is deleted).
- **ARIA roles** — Radix `Dialog` labelled by its title, described by the hint or merge text; the
  step change moves focus to the new title (`tabIndex={-1}`) so the change is announced.
- **Keyboard navigation** — focus starts in the name input (text selected); Enter submits; Esc
  closes. On close without saving, focus returns to the Rename button. After a plain rename focus
  goes to that chain's Rename button (found by `data-chain-rename`, since the section re-renders
  under its new key); after a merge, to the merged chain's heading (`h2` with `tabIndex={-1}`)
  ([NFR-006](requirements.md#nfr-006)).

## Design Review

### Heuristics (Nielsen)

| # | Heuristic | Issues Found | Score (1–4) | Resolution |
|---|-----------|--------------|-------------|------------|
| 1 | Visibility of system status | Rename changes stocks outside the view, invisibly | 2 | The hint states the count of all stocks; the toast states how many changed. |
| 3 | User control and freedom | A merge has no Undo | 3 | A separate merge step names both chains and the total, and says it can't be split again; Back keeps the text ([OQ-5](requirements.md#oq-5)). |
| 4 | Consistency and standards | Scope and filters must behave as on `/concentration` | 1 | Same `ScopeSelect`, `FilterToolbar` and address rules. |
| 5 | Error prevention | Stale page could merge silently | 3 | The server refuses with `409` without `merge: true`, and the dialog switches to the merge step ([ADR-004](design.md#key-decisions)). |
| 6 | Recognition rather than recall | Spelling variants hide in one chain | 2 | "Also spelled" line under the title. |
| 8 | Aesthetic and minimalist design | Five areas per chain on a phone get long | 2 | Integrated and No position appear only when non-empty; empty lanes are one line. |

No issue of score 3 or 4 remains unresolved.

### Accessibility Audit

- **WCAG AA** — every text and badge pair reuses a token pair already measured by the contrast
  suites (`muted-foreground` on `card`, `secondary` badge, primary button); no tinted destructive
  text is used.
- **Keyboard flow** — confirmed above: all actions are links or buttons in reading order; the
  dialog traps focus and returns it as specified.
