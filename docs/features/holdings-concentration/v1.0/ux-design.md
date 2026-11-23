---
version: 1.0
status: approved
date: 2026-11-23
requires: design.md
---

# UX/UI Design: Holdings and Concentration

Like [Stock Lists](../../stock-lists/v1.0/ux-design.md), there are no mockups: every screen builds
on the `sidebar-08` shell, the theme tokens in `apps/web/src/index.css` (emerald `--primary`,
`--chart-1..5` in the same hue, neutral greys) and the installed `ui/` components. **No new shadcn
component is needed**: this slice uses `select`, `radio-group`, `checkbox`, `input`,
`input-group`, `field`, `dialog`, `table`, `badge`, `alert`, `collapsible`, `card`, `button` and
`sonner`. No new colours or radii.

The [Shared patterns](../../stock-lists/v1.0/ux-design.md#shared-patterns) of Stock Lists apply
unchanged (page header and focus, loading, toasts, field and form errors, not-found, destructive
confirm, the contrast rule), plus one added here:

- **Flag** — a group at or above the threshold shows a `Badge variant="outline"` with
  `TriangleAlertIcon` (`text-destructive`, `aria-hidden`) and the text `Over 40%` in
  `text-foreground` (the threshold is the investor's, so it reads `Over 35%` at 35). This is the
  pattern the import's error badge already uses, because tinted destructive text fails AA in light
  mode (Stock Lists findings F-2 to F-4). Colour is never the only signal: the text is always there.
- **Money** — totals `฿1,234,567.89` / `$12,345.67` (`Intl.NumberFormat`, two decimals, from the
  decimal string, no float); a per-share cost keeps the decimals it was entered with, up to 4
  (`$0.1234`); shares show as entered without trailing zeros (`120.5`). All numbers are
  `tabular-nums` and right-aligned in tables ([FR-003](requirements.md#fr-003)).

## Screens in Scope

- **Holding fields in the stock form** — the Add stock dialog (`/stocks/new`) and Edit stock
  (`/stocks/:id/edit`) gain a Holding card ([FR-001](requirements.md#fr-001), [FR-002](requirements.md#fr-002), [FR-004](requirements.md#fr-004)).
- **Holding card and dialog on the stock page** — `/stocks/:id` shows the holding and edits it in a
  dialog ([FR-004](requirements.md#fr-004)).
- **Held column** — the shared `StockTable` on `/stocks` and `/lists/:id` ([FR-004](requirements.md#fr-004)).
- **Concentration** — `/concentration`, replacing the placeholder
  ([FR-005](requirements.md#fr-005)–[FR-014](requirements.md#fr-014)).
- **Concentration settings dialog** — threshold and USD to THB rate, opened from the page
  ([FR-011](requirements.md#fr-011)).

## Lo-fi Wireframes

### Holding fields in the stock form

```
┌ Holding ─────────────────────────────────────────────────────────────┐
│ [✓] I hold this stock                                                │
│                                                                      │
│ Shares (optional)          Average cost per share (optional)         │
│ [ 120.5            ]       [ $ │ 412.33                  ]           │
│                                                                      │
│ Cost currency   (•) USD  ( ) THB                                     │
│ Leave shares or cost empty if you don't want to track the amount.    │
└──────────────────────────────────────────────────────────────────────┘
```

- **Layout notes** — one more `Card` in `StockForm`, after the lens cards and before Lists (create)
  or last (edit). Unticked, only the checkbox shows. Ticked, the fields appear below it (they are
  rendered only while ticked, so they are out of the tab order otherwise). Two columns from `md`,
  stacked below.
- **User flow** — tick → fields appear, focus stays on the checkbox. Untick in edit mode on a stock
  that was held → fields go, and Save sends `holding: null` (the toast after saving says
  "NVDA updated"; the stock page's Undo path is the safety net). Save with invalid numbers → field
  errors under each input, focus on the first.
- **Annotations** — the currency radio starts at the stock's trading currency and follows a
  market change until the investor picks one themselves; the cost input's prefix follows the
  chosen currency (`$` / `฿`). Inputs are `type="text" inputMode="decimal"` so a phone shows the
  number pad and no float rounding happens in the browser.

### Holding card and dialog on the stock page

```
│ Stocks › NVDA                                                                    │
│ NVDA  NVIDIA Corporation                                  [Edit]  [⋯]           │
│ ┌ Classification ───────────────────────┐ ┌ Holding ──────────────────────────┐ │
│ │ …                                      │ │ Held                      [Edit] │ │
│ │                                        │ │ Shares          120.5            │ │
│ │                                        │ │ Average cost    $412.33          │ │
│ │                                        │ │ Cost            $49,685.77       │ │
│ │                                        │ └──────────────────────────────────┘ │
│ │                                        │ ┌ Lists ───────────────────────────┐ │
│ └────────────────────────────────────────┘ │ …                                │ │
```

Not held, and held without amounts:

```
┌ Holding ────────────────────────┐     ┌ Holding ─────────────────────────┐
│ Not held                        │     │ Held                      [Edit] │
│ [+ Mark as held]                │     │ Amount not entered.              │
└─────────────────────────────────┘     │ Add shares and cost to include   │
                                        │ it in value weights.             │
                                        └──────────────────────────────────┘
```

The dialog (from **Mark as held** or **Edit**):

```
┌ Holding · NVDA ──────────────────────────────── [×] ┐
│ Shares (optional)       [ 120.5          ]          │
│ Average cost (optional) [ $ │ 412.33     ]          │
│ Cost currency           (•) USD  ( ) THB            │
│                                                     │
│ [Stop holding]                   [Cancel]  [Save]   │
└─────────────────────────────────────────────────────┘
```

- **Layout notes** — the Holding card sits in the right column above Lists (`lg`), and between
  Classification and Lists when stacked. The dialog is `sm:max-w-md`. **Stop holding** shows only
  when the stock is held.
- **User flow** — Mark as held → dialog → Save (empty fields are allowed) → toast "NVDA marked as
  held" → card updates. Stop holding → dialog closes → card shows Not held → toast "NVDA no longer
  held" with **Undo**, which puts the previous holding back (`set-holding` with the old values).
  A failed save keeps the dialog and its values and shows the problem in an `Alert` at the top of
  the dialog, or under the field it names.
- **Annotations** — "Cost" is shares × average cost in the cost currency, shown only when both are
  set. The card never converts to THB; that is the concentration page's job.

### Held column

```
│ Ticker  Name                   Market  Sector              Held          …  │
│ NVDA    NVIDIA Corporation     US      Information Tech.   [Held] 120.5     │
│ PTTEP   บมจ. ปตท. สำรวจฯ        TH      Energy              [Held]           │
│ AAPL    Apple Inc              US      Information Tech.   —                │
```

- **Layout notes** — after the Sector column, in both `/stocks` and `/lists/:id`. A held stock
  shows a `Held` badge, then its shares when known. Not held shows `—` with `sr-only` "Not held".
- **Annotations** — the column sorts (held first, then by shares, descending), using the existing
  sort header.

### Concentration

```
┌ Sidebar ┬─ ☰ │ Concentration ───────────────────────────────────────────────────┐
│         │ Concentration                                         [⚙ Settings]  │
│         │ How your stocks are spread across each lens.                         │
│         │                                                                      │
│         │ Scope [All stocks (42)    ▾]  Group by [Sector (GICS) ▾]            │
│         │ Measure ( ) Count  (•) Value at cost                                 │
│         │                                                                      │
│         │ ┌ ⚠ 1 group at 40% or more of value at cost ─────────────────────┐   │
│         │ │ Information Technology — 52.0%                                  │   │
│         │ │ Threshold 40% · 1 USD = 36.25 THB, saved 23 Nov 2026            │   │
│         │ └─────────────────────────────────────────────────────────────────┘   │
│         │                                                                      │
│         │ Group                     Value (THB)       Share            Stocks  │
│         │ ▸ Information Technology  ฿2,451,302.10  ████████░ 52.0% ⚠Over 40%  8 │
│         │ ▸ Energy                  ฿1,020,000.00  ███░░░░░░ 21.6%          5 │
│         │ ▸ Financials              ฿  893,450.25  ███░░░░░░ 19.0%          4 │
│         │ ▸ Not set                 ฿  350,000.00  █░░░░░░░░  7.4%          2 │
│         │   └ AAPL · MSFT …  (expanded: ticker links)                         │
│         │                                                                      │
│         │ Not in the value: 3 held stocks without shares or cost (AAPL, KBANK, │
│         │ SCB) · 2 USD holdings need a rate [Set rate] · 23 stocks not held    │
│         │                                                                      │
│         │ These groupings and costs are your own classifications, not advice.  │
└─────────┴──────────────────────────────────────────────────────────────────────┘
```

Count measure: the columns are **Group · Stocks · Share · Flag**; the left-out note is not shown
(every stock counts). With a multi-value lens a note under the table says: "A stock with several
themes counts in each of them, so the shares add up to more than 100%."

Other states:

```
No stocks at all                         Scope has no held stocks, measure Value
┌──────────────────────────────────┐     Measure ( ) Count  ( ) Value at cost  ← disabled
│        (chart icon)              │     "No held stock in this scope has shares and cost.
│  Nothing to group yet            │      Mark holdings on a stock's page." (link to /stocks)
│  Add stocks to see how they are  │     The page shows the count view.
│  spread across each lens.        │
│  [+ Add stock]  [⇪ Import]       │     Address names a deleted list
└──────────────────────────────────┘     ┌ ℹ That list no longer exists. Showing all stocks. ┐

Scope is an empty list                   No flagged group
"Core holdings has no stocks yet."       ┌ ✓ No group at 40% or more of the stocks ┐
[Open Core holdings]
```

- **Layout notes** — header, controls row, summary `Alert`, group table, notes. The table is the
  only figure: each Share cell has a thin bar (decorative, `aria-hidden`) next to the number, so
  there is no separate chart to keep in step with the table ([NFR-006](requirements.md#nfr-006)).
- **User flow** — change any control → the table regroups at once and the address updates
  (`replace`). Expand a group (`▸`) → its stocks appear as ticker links in a sub-row; a ticker opens
  the stock page. **Set rate** in the left-out note and **Settings** in the header open the
  settings dialog. After saving the settings the summary and flags update.
- **Annotations** — the Scope select lists "All stocks (n)", "Held stocks (n)", then a "Lists"
  group with each list and its count. Group by lists the lenses in the order of
  [FR-006](requirements.md#fr-006), with labels from `CONCENTRATION_LENSES`. Groups sort by the
  chosen measure, largest first, "Not set" last. "Not set" is never flagged.

### Concentration settings dialog

```
┌ Concentration settings ─────────────────────────────── [×] ┐
│ Warning threshold                                            │
│ [ 40 │ % ]   Flag any group at this share or more (1–100).  │
│                                                              │
│ Exchange rate                                                │
│ 1 USD = [ 36.25        │ THB ]                               │
│ Used to add USD costs to THB values. Saved 23 Nov 2026.      │
│ [Clear rate]                                                 │
│                                                              │
│                                       [Cancel]  [Save]       │
└──────────────────────────────────────────────────────────────┘
```

- **Layout notes** — `Dialog`, `sm:max-w-md`. Opened from the header button or from **Set rate**
  (focus then starts in the rate field).
- **User flow** — Save → `PATCH /settings` with the changed fields → dialog closes → toast
  "Settings saved" → page regroups. Clear rate empties the field; Save then sends
  `usdThbRate: null`. Invalid values → field errors, focus on the first; the dialog stays open.
- **Annotations** — with no rate saved the help text reads "No rate saved. USD holdings are left
  out of value weights until you add one."

## Hi-fi Component Specs

### Holding fields in the stock form

#### Layout

- **Wrapper** — `Card` > `CardHeader` (`CardTitle` with `h2` "Holding") > `CardContent` >
  `FieldGroup className="grid gap-4 md:grid-cols-2"`.
- **Responsive** — below `md` the two inputs stack; the currency radios stay on one row.

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Held | `Checkbox` + `FieldLabel` "I hold this stock" | — | `Field orientation="horizontal"`, `md:col-span-2` | unchecked, checked, focus |
| Shares | `Input` (`inputMode="decimal"`, `autoComplete="off"`) in `Field` | default | `tabular-nums` | default, focus, error (`aria-invalid`), disabled while saving |
| Average cost | `InputGroup` + `InputGroupAddon` (`$` / `฿`) + `InputGroupInput` | default | `tabular-nums` | default, focus, error, disabled while saving |
| Cost currency | `RadioGroup` (USD, THB) in `FieldSet` + `FieldLegend variant="label"` | — | `flex gap-4`, `md:col-span-2` | default, checked, focus |
| Hint | `FieldDescription` | — | `md:col-span-2` | static |
| Field error | `FieldMessage` (existing) | — | — | shown on error |

#### Accessibility

- **Contrast** — labels `foreground` on `card` ≈ 19:1; hint `muted-foreground` on `card` ≈ 4.7:1
  light, ≈ 6.9:1 dark (as Stock Lists measured).
- **ARIA roles** — the currency `FieldSet` has its legend; each input's error is linked with
  `aria-describedby` (`errorProps`, as the other fields). The form model gains the field names
  `holdingShares` and `holdingAverageCost` (in `FieldName` and `FIELD_ORDER`, after the lenses);
  the inputs carry them as `data-field`, so the existing first-invalid focus works, and
  `splitServerErrors` maps the API paths `holding.shares` and `holding.averageCost` to them.
- **Keyboard navigation** — Space toggles Held; ticking reveals Shares → Average cost → currency
  radios (arrows) next in tab order.

### Holding card and dialog on the stock page

#### Layout

- **Wrapper** — the right column of `grid gap-6 lg:grid-cols-3` becomes `flex flex-col gap-6`
  holding the Holding card, then the Lists card.
- **Responsive** — below `lg`: Classification, Holding, Lists stacked.

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Card | `Card` + `CardHeader` + `CardAction` | — | `CardTitle` `h2` "Holding" | static |
| Status | `Badge` "Held" / text "Not held" | secondary | — | static |
| Figures | `dl` | — | `grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2 text-sm`; `dd` `tabular-nums` | static |
| Edit / Mark as held | `Button` | outline / sm | `PencilIcon` / `PlusIcon` | default, hover, focus |
| Dialog | `Dialog` + `DialogContent` | — | `sm:max-w-md`; title "Holding · NVDA" | open, saving, error |
| Fields | as in the form above | — | — | as above |
| Stop holding | `Button` | ghost / default | `mr-auto` in `DialogFooter` | default, hover, focus, disabled while saving |
| Save | `Button type="submit"` | default | `Loader2Icon animate-spin motion-reduce:animate-none` while saving | default, loading, disabled |
| Undo | sonner toast action | — | — | 5 s |

#### Accessibility

- **Contrast** — as the Classification card (`dt` `muted-foreground` on `card` ≈ 4.7:1 light).
- **ARIA roles** — the dialog is a Radix `Dialog` (labelled by its title); "Stop holding" is a plain
  button, not destructive-styled, because Undo restores it.
- **Keyboard navigation** — focus starts in Shares; Esc closes; on close, focus returns to the
  button that opened it (`returnFocusTo`, as `ListNameDialog` does); after Stop holding, focus goes
  to **Mark as held**.

### Held column

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Header | `TableHead` + existing sort `Button` | ghost / sm | `bg-background` | default, sorted |
| Held | `Badge` "Held" + shares | secondary | `gap-1.5`; shares `tabular-nums text-muted-foreground` | static |
| Not held | `—` + `sr-only` "Not held" | — | `text-muted-foreground` | static |

#### Accessibility

- **ARIA roles** — the sort header follows the existing `aria-sort` pattern; the caption mentions
  Held when it is the sort key.

### Concentration

#### Layout

- **Wrapper** — `<section className="space-y-6">`; `PageHeader` with the Settings button in
  `actions`.
- **Controls** — `div className="flex flex-wrap items-end gap-4"`; each control a `Field`
  (`w-full sm:w-56` for the selects).
- **Table** — `rounded-lg border`; no horizontal scroll at 360 px (see responsive).
- **Responsive** — below `sm`: controls stack full width; the table shows **Group** (with "8
  stocks" or the value under the name, `text-xs text-muted-foreground`) and **Share** (bar, %, and
  the flag badge below it); the Stocks / Value columns are `hidden sm:table-cell`. From `sm` all
  columns show. The summary and notes wrap.

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Settings | `Button` | outline / default | `SlidersHorizontalIcon`, `w-full sm:w-auto` | default, hover, focus |
| Scope | `Select` + `SelectGroup` / `SelectLabel` ("Lists") | default | `w-full sm:w-56` | default, open, focus |
| Group by | `Select` | default | `w-full sm:w-56` | default, open, focus |
| Measure | `RadioGroup` (Count, Value at cost) in `FieldSet` | — | `flex gap-4` | default, checked, disabled (with `FieldDescription` reason) |
| Flagged summary | `Alert` (`role="status"`) | default | `TriangleAlertIcon` (`text-destructive`); body a `ul` of "Group — 52.0%"; footer line "Threshold 40% · 1 USD = 36.25 THB, saved 23 Nov 2026" `text-sm text-muted-foreground` | flagged, none (`CircleCheckIcon`, "No group at 40% or more of the stocks") |
| Fallback note | `Alert` (`role="status"`) | default | `InfoIcon` | shown when the address was corrected |
| Group table | `Table` + `TableCaption` (`sr-only`) | — | numbers `text-right tabular-nums` | default |
| Expand group | `Button` + `Collapsible` per group | ghost / sm | `ChevronRightIcon` rotates `data-[state=open]:rotate-90`; `motion-reduce:transition-none` | collapsed, expanded, focus |
| Stocks sub-row | `TableRow` with one `TableCell colSpan` of ticker `Link`s | — | `bg-background`; links `flex flex-wrap gap-x-3` | static |
| Share bar | plain `div` | — | track `h-1.5 w-24 rounded-full bg-muted`, fill `bg-primary`, `aria-hidden` | static |
| Flag | `Badge` | outline | `TriangleAlertIcon text-destructive`, text `text-foreground` | static |
| Left-out note | `p` + links | — | `text-sm`; "Set rate" is a `Button variant="link" size="sm"` | shown for the value measure |
| Multi-value note | `p` | — | `text-sm text-muted-foreground` | shown for multi lenses |
| Advice note | `p` | — | `text-xs text-muted-foreground` | static |
| Empty | `Card` | — | as the Stocks empty state, with Add stock and Import links | no stocks |
| Loading | route `HydrateFallback` (`PageSkeleton`) | — | — | first paint |

#### Accessibility

- **Contrast** — table text `foreground` on `background` ≈ 19:1; notes `muted-foreground` on
  `background` ≈ 4.7:1 light, ≈ 7.6:1 dark. The share bar is decorative (the % next to it carries
  the figure), so it is not held to the 3:1 non-text rule. The flag icon is supplementary to the
  text; its contrast is measured in E2E in both themes, and `text-destructive` in dark mode is
  replaced with `text-foreground` if it is under 3:1.
- **ARIA roles** — native table; `TableCaption` "Stocks grouped by Sector (GICS), by value at cost,
  all stocks". Each expand button is named "Show stocks in Information Technology" and has
  `aria-expanded` and `aria-controls` → the sub-row. The summary `Alert` is `role="status"` so a
  regroup that changes the flags is announced politely; it is not `role="alert"`.
- **Keyboard navigation** — Tab: Settings → Scope → Group by → Measure (arrows between options) →
  each expand button → ticker links inside an open group → Set rate → advice note links. Selects
  open with Enter / Space and type-ahead. No focus move on regroup: focus stays on the control.

### Concentration settings dialog

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Dialog | `Dialog` + `DialogContent` + `DialogHeader` / `DialogTitle` | — | `sm:max-w-md` | open, saving, error |
| Threshold | `InputGroup` + `InputGroupInput` (`inputMode="numeric"`) + addon `%` | — | `w-28 tabular-nums` | default, focus, error |
| Rate | label "1 USD =", `InputGroup` + `InputGroupInput` (`inputMode="decimal"`) + addon `THB` | — | `w-40 tabular-nums` | default, focus, error, empty |
| Rate help | `FieldDescription` | — | — | saved date / no rate |
| Clear rate | `Button` | ghost / sm | — | default, disabled when empty |
| Save / Cancel | `Button` in `DialogFooter` | default / outline | spinner as above | default, loading, disabled |

#### Accessibility

- **ARIA roles** — each input labelled by its `FieldLabel`; the rate's label reads "Exchange rate,
  THB per 1 USD".
- **Keyboard navigation** — focus starts in Threshold (or Rate from **Set rate**); Esc closes;
  focus returns to the opener.

## Design Review

The concentration page is the critical new flow (it is the brief's headline problem); the holding
dialog is the most-used one.

### Heuristics (Nielsen)

| # | Heuristic | Issues Found | Score (1–4) | Resolution |
|---|-----------|--------------|-------------|------------|
| 1 | Visibility of system status | Investor may not know which rate and threshold produced the flags | 2 | Summary footer shows the threshold, the rate and its saved date |
| 2 | Match with the real world | "Value" could be read as market value | 2 | Always "Value at cost"; the advice note says costs are the investor's |
| 3 | User control and freedom | Stopping a holding by mistake loses shares and cost | 2 | Undo toast restores the previous holding |
| 4 | Consistency and standards | Holding edited in two places could drift | 1 | One set of holding fields used by the form and the dialog |
| 5 | Error prevention | Typing a number with a comma or too many decimals | 2 | Text inputs with decimal keypad; the domain schema's messages name the limit ("up to 4 decimal places") |
| 6 | Recognition rather than recall | Which stocks make up a 52% group? | 2 | Expandable groups list their tickers as links |
| 7 | Flexibility and efficiency | Re-picking scope and lens on every visit | 1 | The view lives in the address; a bookmark keeps it |
| 8 | Aesthetic and minimalist design | Count and value columns side by side crowd a phone | 2 | One measure at a time; phone layout folds secondary figures under the group name |
| 9 | Help users recover from errors | Value view empty because amounts or the rate are missing | 2 | Left-out note names the stocks and links Set rate; Value disabled with the reason |
| 10 | Help and documentation | Why shares add up to more than 100% | 1 | Multi-value note under the table |

No issue scores 3 or 4.

### Accessibility Audit

- **WCAG AA** — pass for text in both themes per the ratios above, given the Stock Lists contrast
  rule (no `muted-foreground` on `bg-muted`). To measure in E2E (`e2e/lib/contrast.ts`): the flag
  icon in dark mode, and the outline badge border. No tinted destructive text is used.
- **Keyboard flow** — confirmed on paper: every control, expand button, link and dialog is
  reachable and operable without a mouse; dialogs trap focus and return it; regrouping does not
  move focus.
