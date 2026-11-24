---
version: 1.0
status: approved
date: 2026-11-24
requires: design.md
---

# UX/UI Design: Search, Filter and Export

Like [Stock Lists](../../stock-lists/v1.0/ux-design.md) and
[Holdings and Concentration](../../holdings-concentration/v1.0/ux-design.md), there are no
mockups: every screen builds on the `sidebar-08` shell, the theme tokens in
`apps/web/src/index.css` and the installed `ui/` components. **No new shadcn component is
needed**: this slice uses `input-group`, `button`, `badge`, `sheet`, `collapsible`, `checkbox`,
`input`, `dropdown-menu`, `alert`, `card`, `table` and `sonner`. No new colours or radii.

The [Shared patterns](../../stock-lists/v1.0/ux-design.md#shared-patterns) of Stock Lists (page
header and focus, loading, toasts, errors, contrast rule) and the Flag and Money patterns of
Holdings and Concentration apply unchanged, plus three added here:

- **Filter toolbar** — one component, `FilterToolbar`, used on `/stocks`, `/lists/:id` and
  `/concentration`: search, **Filters** (with the number of active filters), and on the two table
  pages **Export**. Below it the **result line**: the count, the active filters as removable
  badges, **Clear all**, and on the table pages **See concentration**.
- **Filter sheet** — the filters live in a `Sheet`, on every width (right side from `sm`, bottom
  sheet below it). Picks apply at once; the table behind updates while the sheet is open, and the
  footer button says how many stocks it will show. This replaces the Popover first planned in
  `design.md`: 18 filters do not fit a popover, and one pattern for phone and desktop is simpler
  to learn and test.
- **Counts** — every option shows how many stocks on the page have it
  ([FR-004](requirements.md#fr-004)); a count of 0 stays pickable, in `text-muted-foreground`.

## Screens in Scope

- **Stocks** — `/stocks` gains the filter toolbar, result line, export menu, address notes and the
  no-matches state ([FR-001](requirements.md#fr-001)–[FR-009](requirements.md#fr-009),
  [FR-011](requirements.md#fr-011)–[FR-013](requirements.md#fr-013)).
- **Filter sheet** — opened from any filter toolbar ([FR-002](requirements.md#fr-002)–[FR-004](requirements.md#fr-004)).
- **List detail** — `/lists/:id`, the same toolbar over the list's members ([FR-007](requirements.md#fr-007)).
- **Concentration** — `/concentration` gains the toolbar (search and filters only) and the
  "N of M stocks in scope" line ([FR-010](requirements.md#fr-010)).
- **Import / export** — the Export card replaces "Coming later" with the backup downloads
  ([FR-015](requirements.md#fr-015)–[FR-017](requirements.md#fr-017)); the import preview gains
  the ignored-columns note ([FR-014](requirements.md#fr-014)).

## Lo-fi Wireframes

### Stocks

Filtered, desktop (`lg`):

```
┌ Sidebar ┬─ ☰ │ Stocks ─────────────────────────────────────────────────────────────┐
│         │ Stocks                                         [⇪ Import] [+ Add stock] │
│         │ 42 stocks                                                              │
│         │                                                                        │
│         │ [🔍 Search ticker, name or theme   ptt  ×] [⚲ Filters  2]   [⤓ Export ▾] │
│         │                                                                        │
│         │ 3 of 42 stocks  [Search: ptt ×] [Market: TH ×]                         │
│         │ [Economic cycle: Cyclical, Not set ×]  Clear all     See concentration →│
│         │                                                                        │
│         │ Ticker ↑   Name                         Market  Sector       Held  Lists│
│         │ PTT        PTT Public Company Limited   TH      Energy       Held …     │
│         │ PTTEP      PTT Exploration and …        TH      Energy       —     …    │
│         │ PTTGC      PTT Global Chemical …        TH      Materials    —     …    │
└─────────┴────────────────────────────────────────────────────────────────────────┘
```

Unfiltered: the result line shows only "42 stocks" and **See concentration →** (no badges, no
Clear all). The header description keeps the total ("42 stocks").

Export menu (open):

```
                                   [⤓ Export ▾]
                                   ┌──────────────────────────────┐
                                   │ ⤓ Download CSV (3 stocks)     │
                                   │ ⧉ Copy as table (3 rows)      │
                                   │ ──────────────────────────── │
                                   │ ⛁ Back up all data…           │  → /import-export
                                   └──────────────────────────────┘
```

Phone (360 px):

```
┌ ☰ │ Stocks ─────────────────────┐
│ Stocks                          │
│ 42 stocks                       │
│ [⇪ Import]                      │
│ [+ Add stock]                   │
│ [🔍 Search ticker, name… ptt ×] │
│ [⚲ Filters 2]      [⤓ Export ▾] │
│ 3 of 42 stocks                  │
│ [Search: ptt ×] [Market: TH ×]  │
│ [Economic cycle: Cyclical, … ×] │
│ Clear all · See concentration → │
│ Ticker   Name            Held   │
│ PTT      PTT Public …    Held   │
└─────────────────────────────────┘
```

Other states:

```
No match                                         Address had a bad part
┌──────────────────────────────────────┐        ┌ ℹ "Bitcoin" isn't a Market value, so that   ┐
│          (search-x icon)             │        │   filter was left out.                      │
│  No stocks match                     │        └─────────────────────────────────────────────┘
│  Try a different search or fewer     │        (one line per dropped part, above the toolbar)
│  filters.                            │
│  [Clear all]                         │        Copy refused (toast, error)
└──────────────────────────────────────┘        ✕ Couldn't copy: your browser blocked the
 (replaces the table; Export items are             clipboard. Use Download CSV instead.
  disabled: "No stocks to export")
                                                 Copy done (toast)  ✓ Copied 3 rows
```

- **Layout notes** — toolbar, then the result line, then the table; nothing above the table moves
  when the result count changes except the badges row wrapping.
- **User flow** — type → the table narrows as you type, the address updates (`replace`). Open a
  stock → Back → the same view. Remove a badge → that filter goes. **Clear all** removes the search
  and every filter, then focus goes to the search box. **See concentration** opens
  `/concentration` with the filters.
- **Annotations** — the search clear button (×) shows only with text; Esc in the search box clears
  it when it has text. The **Filters** button shows the number of active filters (search not
  counted) in a `Badge variant="secondary"`.

### Filter sheet

```
                          ┌ Filters ─────────────────────── [×] ┐
                          │ 3 of 42 stocks match                │
                          │ ─────────────────────────────────── │
                          │ ▾ Market  (1)                       │
                          │   [✓] TH   18                       │
                          │   [ ] US   24                       │
                          │ ▾ Held                              │
                          │   [ ] Held       12                 │
                          │   [ ] Not held   30                 │
                          │ ▸ Exchange                          │
                          │ ▸ Sector (GICS)                     │
                          │ ▸ SET industry group                │
                          │ ▾ Economic cycle  (2)               │
                          │   [✓] Cyclical    9                 │
                          │   [ ] Sensitive  14                 │
                          │   [ ] Defensive   7                 │
                          │   [✓] Not set    12                 │
                          │ ▾ Themes                            │
                          │   [🔍 Find a theme        ]          │
                          │   [ ] AI           6                │
                          │   [ ] Dividend     4                │
                          │   …                                 │
                          │ ▸ … (every filter, in order)        │
                          │ ─────────────────────────────────── │
                          │ [Clear all]          [Show 3 stocks] │
                          └─────────────────────────────────────┘
```

- **Layout notes** — header with the live count, a scrolling body of sections, a sticky footer.
  Order: Market, Held, Exchange, then the lenses in `CONCENTRATION_LENSES` order (Sector (GICS),
  SET industry group, Value chain position, Value chain name, Size, Style, Economic cycle, Lynch
  type, Life cycle, Customers, Revenue types, Moat, Themes, Volatility, Index membership), with
  labels from `LENS_LABELS`.
- **User flow** — tick → applies at once (table, count, address). **Show N stocks** closes the
  sheet. **Clear all** clears filters (not the search) and keeps the sheet open. Closing in any way
  returns focus to the **Filters** button.
- **Annotations** — Market and Held, and every section with a pick, start open; the rest start
  closed. A section title shows its pick count "(2)". "Not set" is always last in a section. A
  section with more than 8 options (Sector, SET industry group, themes, value chain name, index
  membership, revenue types) has a **Find** input on top that narrows the options shown (plain
  substring, not cmdk fuzzy matching, as in `AddStockPicker`); picked options always stay visible.
  A free-text section with no values in the investor's stocks shows only "Not set". With
  "Show 0 stocks" the button still closes the sheet, onto the no-match state.

### List detail

Same as Stocks inside the list page: the toolbar sits under the list header (Add stock, Import,
Rename, ⋯ unchanged), counts and options come from the list's members, the CSV file is named after
the list, and **See concentration** opens the concentration view with the list as its scope. An
empty list keeps its empty card and shows no toolbar.

### Concentration

```
│ Concentration                                         [⚙ Settings]  │
│ How your stocks are spread across each lens.                         │
│                                                                      │
│ Scope [Core holdings (20) ▾]  Group by [Sector (GICS) ▾]            │
│ Measure (•) Count  ( ) Value at cost                                 │
│                                                                      │
│ [🔍 Search ticker, name or theme      ] [⚲ Filters  1]              │
│ 12 of 20 stocks in scope  [Market: TH ×]  Clear all                  │
│                                                                      │
│ ┌ ⚠ 1 group at 40% or more of the stocks ─────────────────────────┐ │
│ …(unchanged summary, table and notes, over the 12 filtered stocks)  │
```

- No Export and no See concentration here. With no filter the line reads "20 stocks in scope".
- Filters that leave nothing in scope show the no-match card in place of the summary and table.
- The filter sheet's counts count over the scope.

### Import / export

```
│ Import / export                                                      │
│ Import stocks from CSV or Excel, or download all your data.          │
│ ┌ Import ──────────────────────────────────────── (unchanged) ┐     │
│ ┌ Export ─────────────────────────────────────────────────────┐     │
│ │ Download everything: each stock with its lenses and holding,│     │
│ │ your lists, and your concentration settings.                │     │
│ │ [⤓ Download JSON]  [⤓ Download CSV]                          │     │
│ │ JSON is the complete backup. CSV has one row per stock with  │     │
│ │ its lists and holding, and can be imported again here.       │     │
│ │ These files include your shares and costs. Keep them private.│     │
│ │ To export only some stocks, filter the Stocks page and use   │     │
│ │ Export there.                                                │     │
│ └──────────────────────────────────────────────────────────────┘     │
```

States: the clicked button shows a spinner and "Preparing…" and is disabled (the other stays
usable); failure shows an `Alert` under the buttons ("Couldn't download the backup. Check your
connection and try again."), cleared on the next click. Success needs no message: the browser
shows the download.

Import preview, after the header warnings:

```
┌ ℹ Lists and holdings columns are not imported: lists, held, shares, average_cost, cost_currency. ┐
│   Add the stocks to lists and mark holdings in the app after the import.                       │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Hi-fi Component Specs

### Filter toolbar and result line

#### Layout

- **Wrapper** — `div className="space-y-3"` between the page header and the table.
- **Toolbar** — `div className="flex flex-wrap items-center gap-2"`: search `w-full sm:w-80`,
  Filters, then Export pushed right with `sm:ml-auto`.
- **Result line** — `div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm"`: count,
  badges, Clear all, See concentration (`ml-auto` from `sm`).
- **Responsive** — below `sm` the search is full width, Filters and Export share the next row
  (`flex-1` each); badges wrap; long badge text truncates at `max-w-64` (full text in `title` and
  the accessible name). The table keeps its existing responsive columns.

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Search | `InputGroup` + `InputGroupAddon` (`SearchIcon`) + `InputGroupInput type="search"` | — | `w-full sm:w-80`; placeholder "Search ticker, name or theme" | default, focus, with text |
| Clear search | `InputGroupButton` | ghost / icon-xs | `XIcon`, shown with text only | default, hover, focus |
| Filters | `Button` + `Badge` | outline / default; badge secondary | `ListFilterIcon`; badge `tabular-nums` hidden at 0 | default, hover, focus, active (count shown) |
| Export | `DropdownMenu` + `Button` | outline / default | `DownloadIcon`, `ChevronDownIcon` | default, open, focus |
| Export items | `DropdownMenuItem` | default | `DownloadIcon`, `CopyIcon`, `DatabaseIcon`; count in `text-muted-foreground` | default, highlighted, disabled ("No stocks to export" as `DropdownMenuLabel`) |
| Result count | `p role="status" aria-live="polite"` | — | `font-medium tabular-nums` | filtered "3 of 42 stocks", unfiltered "42 stocks" |
| Active filter | `Badge` + nested `button` | secondary | `max-w-64 gap-1`; text `truncate`; `XIcon size-3` | default, hover (button `hover:bg-accent`), focus ring on the button |
| Clear all | `Button` | link / sm | `h-auto p-0` | default, hover, focus |
| See concentration | `Button asChild` + `Link` | link / sm | `ChartPieIcon`, `h-auto p-0` | default, hover, focus |
| Address note | `Alert role="status"` | default | `InfoIcon`; one `p` per dropped part | shown when parts were dropped |
| No match | `Card` | — | as the empty states: `items-center gap-3 py-12 text-center`, `SearchXIcon size-8 text-muted-foreground`, `h2` "No stocks match", `Button variant="outline"` Clear all | static |
| Toasts | `sonner` | success / error | — | "Copied 3 rows", copy refused |

#### Accessibility

- **Contrast** — badge text `secondary-foreground` on `secondary` and the counts in
  `muted-foreground` on `background` are the pairs Stock Lists already measured (≥ 4.5:1 both
  themes); never `muted-foreground` on `bg-muted` or `bg-secondary`.
- **ARIA roles** — the search is labelled by an `sr-only` label "Search stocks"; the Filters
  button's name includes the count ("Filters, 2 active") and has `aria-haspopup="dialog"`
  and `aria-expanded`. Each badge's remove button is named "Remove filter Economic cycle: Cyclical,
  Not set". The result count is the only live region and is updated after typing settles (the
  deferred value), so a screen reader hears "3 of 42 stocks", not every keystroke. The no-match
  heading is an `h2`.
- **Keyboard navigation** — Tab: search → clear (when shown) → Filters → Export → each badge's
  remove button → Clear all → See concentration → the table. Removing a badge moves focus to the
  next badge, or to the search box when none is left; Clear all moves focus to the search box.
  Export menu: Enter / Space opens, arrows move, Esc closes back to the button.

### Filter sheet

#### Layout

- **Wrapper** — `Sheet` + `SheetContent side={isMobile ? 'bottom' : 'right'}`, `sm:max-w-sm`,
  bottom sheet `max-h-[85svh]`; `SheetHeader` (title "Filters", `SheetDescription` = live count),
  body `flex-1 overflow-y-auto px-4`, `SheetFooter` sticky with `border-t`.
- **Responsive** — side from `sm`, bottom below; same content.

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Section | `Collapsible` with a `CollapsibleTrigger` `Button` and a `fieldset` | ghost / sm | trigger `w-full justify-between`; `ChevronRightIcon` `data-[state=open]:rotate-90 motion-reduce:transition-none`; title + `(2)` `tabular-nums` | collapsed, open, focus |
| Find in section | `Input` | default | `h-8`; `aria-label="Find a theme"` (per filter) | empty, with text, no result ("No match") |
| Option | `Checkbox` + `Label` | — | row `flex items-center gap-2 py-1.5`; count `ml-auto tabular-nums text-muted-foreground` | unchecked, checked, focus, hover |
| Not set option | as Option | — | label in italics, always last | as Option |
| Clear all | `Button` | ghost / default | — | default, disabled when no filter |
| Show N stocks | `Button` | default / default | `tabular-nums` | default, focus |

#### Accessibility

- **Contrast** — as the toolbar; checkbox border uses `--input`, which the Holdings checkbox
  already passed at 3:1 non-text contrast.
- **ARIA roles** — `Sheet` is a modal dialog titled "Filters"; its description is the live count
  (not a second live region: the toolbar's one is behind the modal, so the description uses
  `aria-live="polite"` while the sheet is open). Each section is a `fieldset` whose `legend` is the
  section name; each checkbox's accessible name is "Cyclical, 9 stocks" (the count is visible
  `aria-hidden` text plus `sr-only` ", 9 stocks").
- **Keyboard navigation** — focus starts on the first section trigger; Tab moves through triggers,
  find inputs and checkboxes; Space toggles; Esc closes; focus returns to **Filters**. Focus is
  trapped while open.

### Export card (Import / export)

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Card | `Card` + `CardHeader` / `CardTitle` "Export" / `CardDescription` | — | `max-w-5xl` (as Import) | static |
| Download JSON | `Button` | default / default | `DownloadIcon`; spinner `Loader2Icon animate-spin motion-reduce:animate-none` | default, hover, focus, loading ("Preparing…", disabled) |
| Download CSV | `Button` | outline / default | as above | as above |
| Notes | `p` | — | `text-sm text-muted-foreground` | static |
| Error | `Alert role="alert"` | default | `TriangleAlertIcon text-destructive`, text `text-foreground` | shown after a failure |

#### Accessibility

- **ARIA roles** — a loading button keeps its name ("Download JSON") with `aria-busy="true"`, and
  the visible "Preparing…" text is `aria-hidden`. The error is `role="alert"` because the investor
  is waiting for that result.
- **Keyboard navigation** — Tab: Import stocks → Download JSON → Download CSV. Focus stays on the
  button after the download or the error.

### Import preview note

`Alert role="status"` with `InfoIcon`, after the header warnings and before the preview table,
text as in the wireframe; column names in `font-mono`. Not shown when `ignoredColumns` is empty.

## Design Review

The filter sheet and the round trip through the address are the critical new flows (they serve
every visit to the stocks table).

### Heuristics (Nielsen)

| # | Heuristic | Issues Found | Score (1–4) | Resolution |
|---|-----------|--------------|-------------|------------|
| 1 | Visibility of system status | A filtered table can be mistaken for the whole list | 3 | "3 of 42 stocks" plus the active badges are always shown above the table while filtered; the Filters button shows the count |
| 2 | Match with the real world | "Not set" vs the lens value "None" (value-chain position) | 2 | "Not set" is italic and always last; "None" sorts with the other values |
| 3 | User control and freedom | Undoing many picks one by one | 2 | Per-badge remove, Clear all in the line and in the sheet; Back still leaves the page |
| 4 | Consistency and standards | Three pages with filters | 1 | One `FilterToolbar` and one sheet; same address keys as the concentration `lens=` |
| 5 | Error prevention | Exporting the wrong rows | 2 | Menu items show the row count; the file has exactly the shown rows and order |
| 6 | Recognition rather than recall | Which values exist for themes | 2 | Options come from the investor's own stocks, with counts and a Find box |
| 7 | Flexibility and efficiency | Rebuilding a common view | 2 | The address keeps it; a bookmark is a saved view |
| 8 | Aesthetic and minimalist design | 18 filters crowd the page | 2 | Only search and one Filters button on the page; sections collapsed except Market, Held and active ones |
| 9 | Help users recover from errors | Empty result, blocked clipboard, failed backup | 2 | No-match card with Clear all; copy error points to Download CSV; backup error says what to do |
| 10 | Help and documentation | What the backup files contain | 1 | Notes in the Export card and the import preview note |

Issue 1 scored 3 (major) before its resolution; the always-visible count and badges resolve it.
No issue remains at 3 or 4.

### Accessibility Audit

- **WCAG AA** — pass on paper for all text pairs (same tokens as Stock Lists and Holdings, no
  tinted destructive text, no `muted-foreground` on `bg-muted`). To measure in E2E
  (`e2e/lib/contrast.ts`): the badge remove button focus ring, the sheet in dark mode, and the
  checkbox border in both themes.
- **Keyboard flow** — confirmed on paper: search, every filter, every badge, export, copy, the
  concentration link and both backup buttons work without a mouse; the sheet traps focus and
  returns it; removing filters never drops focus to the page body.
