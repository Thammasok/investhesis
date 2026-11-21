---
version: 1.0
status: approved
date: 2026-11-21
requires: design.md
---

# UX/UI Design: Stock Lists

There are no mockups for Investhesis ([OQ-2](requirements.md#oq-2)), so every screen here builds
on what `apps/web` already has: the `sidebar-08` shell (`AppLayout`), the header breadcrumb, the
neutral shadcn theme in `src/index.css` (radix-nova style, Geist font, `--radius` scale) and the
existing `ui/` components (`button`, `card`, `field`, `input`, `label`, `dropdown-menu`,
`separator`, `skeleton`, `tooltip`, `sheet`). No new colours or radii are introduced.

New shadcn components to add with `pnpm dlx shadcn@latest add`: `table`, `dialog`,
`alert-dialog`, `alert`, `select`, `checkbox`, `radio-group`, `badge`, `popover`, `command`,
`sonner`. After adding, re-check that imports use `@/lib/utils` (see `CLAUDE.md`).

## Screens in Scope

- **Stocks** — `/stocks`: every saved stock in a sortable table; entry to add and import ([FR-008](requirements.md#fr-008)).
- **Add stock** — `/stocks/new`: identity, 10 lenses, lists ([FR-001](requirements.md#fr-001)–[FR-005](requirements.md#fr-005), [FR-014](requirements.md#fr-014)).
- **Stock detail** — `/stocks/:id`: read-only summary, list membership, edit and delete ([FR-007](requirements.md#fr-007), [FR-012](requirements.md#fr-012)).
- **Edit stock** — `/stocks/:id/edit`: same form as add, market and ticker locked ([FR-006](requirements.md#fr-006)).
- **Lists** — `/lists`: lists with counts; create, rename, delete ([FR-009](requirements.md#fr-009)–[FR-011](requirements.md#fr-011), [FR-013](requirements.md#fr-013)).
- **List detail** — `/lists/:id`: the list's stocks; add and remove ([FR-012](requirements.md#fr-012), [FR-013](requirements.md#fr-013)).
- **Import** — `/import-export`: template, upload, preview, options, summary ([FR-015](requirements.md#fr-015)–[FR-024](requirements.md#fr-024)).

## Shared patterns

These apply to every screen below and are not repeated per screen.

- **Page header** — `h1` (`font-heading text-2xl font-semibold`, `tabIndex={-1}`, focused on
  route change and setting `document.title = "<Title> · Investhesis"`, as `PagePlaceholder` does
  today), optional one-line `text-sm text-muted-foreground` description, actions on the right.
  Below `sm` the actions wrap under the title.
- **Loading** — route navigation already dims `<main>` (`opacity-60`). Submit buttons show a
  `Loader2Icon` (`animate-spin`) and are disabled while their action is in flight.
- **Success** — a `sonner` toast (`Stock added`, `List renamed`, …), bottom-right on desktop,
  bottom-center on phones.
- **Field errors** — `Field` with `data-invalid`, the control gets `aria-invalid` and
  `aria-describedby` → `FieldError`. A server problem's `errors[].path` maps to the field with that
  name. The first invalid field receives focus after a failed submit.
- **Form-level errors** (409, network, 500) — `Alert variant="destructive"` at the top of the
  form, with `role="alert"`.
- **Not found** (404 from a loader) — the existing `RouteError` boundary, with a link back to the
  parent page.
- **Confirm destructive actions** — `AlertDialog`; the confirm button is `Button
  variant="destructive"`, and focus starts on **Cancel**.
- **Contrast rule** — `text-muted-foreground` is never placed on `bg-muted` (≈ 4.4:1, fails AA);
  table headers use `bg-background`.

## Lo-fi Wireframes

### Stocks

```
┌ Sidebar ┬─ ☰ │ Stocks ──────────────────────────────────────────────────────────┐
│         │ Stocks                                      [⇪ Import]  [+ Add stock] │
│         │ 35 stocks                                                             │
│         │ ┌───────────────────────────────────────────────────────────────────┐ │
│         │ │ Ticker ↑ │ Name         │ Market │ Exch.  │ Sector   │ Size │Style│ │
│         │ │──────────┼──────────────┼────────┼────────┼──────────┼──────┼─────│ │
│         │ │ AAPL     │ Apple        │ US     │ NASDAQ │ Info Tech│ Mega │Qual.│ │
│         │ │ PTTEP    │ PTT Explor.. │ TH     │ SET    │ Energy   │ Large│ Div.│ │
│         │ │ …        │              │        │        │          │      │     │ │
│         │ └─────────────────────────────── Lists column → (scrolls) ──────────┘ │
└─────────┴───────────────────────────────────────────────────────────────────────┘

Empty state (no stocks):
│ Stocks                                                                          │
│ ┌──────────────────────────────────────────────────────────────┐                │
│ │              (LineChart icon)                                  │                │
│ │        No stocks yet                                           │                │
│ │  Add your first stock, or import a CSV or Excel file.          │                │
│ │        [+ Add stock]   [⇪ Import from file]                    │                │
│ └──────────────────────────────────────────────────────────────┘                │
```

- **Layout notes** — one full-width table in a bordered container. Columns: Ticker, Name, Market,
  Exchange, Sector, Size, Style, Lists. Sector shows the GICS sector; for `TH` the SET group
  follows in `text-muted-foreground` on a second line.
- **User flow** — row → `/stocks/:id`. **Add stock** → `/stocks/new`. **Import** → `/import-export`.
- **Annotations** — sortable headers: Ticker (default ↑), Name, Market, Sector; clicking toggles
  ↑/↓. Lists column shows up to two list-name badges and `+N`. Sorting is client-side.

### Add stock

```
│ Stocks › New                                                                    │
│ Add stock                                                                       │
│ ┌ Identity ─────────────────────────────────────────────────────────────────┐  │
│ │ Market*  (•) US  ( ) TH          Ticker*  [NVDA        ]                   │  │
│ │ Exchange* [NASDAQ      ▾]        Currency  USD  (set from market)          │  │
│ │ Company name* [NVIDIA Corporation                         ]                │  │
│ │ Index membership  [x] S&P 500  [x] Nasdaq-100                              │  │
│ └───────────────────────────────────────────────────────────────────────────┘  │
│ ┌ Classification ───────────────────────────────────────────────────────────┐  │
│ │ Sector (GICS)       [Information Technology ▾]                             │  │
│ │ SET industry group  [— ▾]          (TH only)                               │  │
│ │ Economic cycle      [Sensitive ▾]  (Default from sector)                   │  │
│ │ Size [Mega ▾]   Style [Growth ▾]   Volatility [High ▾]                     │  │
│ │ Peter Lynch type [Fast Grower ▾]   Life cycle [Growth ▾]                   │  │
│ │ Moat [Intangibles ▾]                                                        │  │
│ │ Value chain  [AI & Semis      ]  Position [Midstream ▾]                    │  │
│ │ Customers      [x] B2B  [ ] B2C  [ ] Government                            │  │
│ │ Revenue types  [ ] Subscription [ ] Transaction fee [x] Product sale …     │  │
│ │ Themes  [AI ×] [Data center ×] [type and press Enter        ]              │  │
│ └───────────────────────────────────────────────────────────────────────────┘  │
│ ┌ Lists ────────────────────────────────────────────────────────────────────┐  │
│ │ [x] Core holdings   [ ] Watching   [ ] Swing study                         │  │
│ └───────────────────────────────────────────────────────────────────────────┘  │
│                                              [Cancel]  [Save stock]            │

Duplicate (409 stock_exists):
│ ┌ ⚠ NVDA (US) is already saved.  [Open NVDA] ──────────────────────────────┐   │
```

- **Layout notes** — three `Card` sections. Single column on phones; from `md`, fields pair into
  two columns inside each card. Action bar at the bottom, right-aligned (full-width stacked
  buttons on phones, **Save** first in DOM order is not required; Save is last and primary).
- **User flow** — Save → `201` → toast `NVDA added` → navigate to `/stocks/:id`. `400` → field
  errors. `409` → form alert with a link to the existing stock. Cancel → back to `/stocks`.
- **Annotations**
  - Changing **Market** resets Exchange and Index membership to the new market's options,
    shows/hides **SET industry group**, and updates the Currency text.
  - Ticker upper-cases as the user types (display only; the domain rule normalises on submit).
  - **Economic cycle**: when it is empty and a sector is chosen, the select shows the default
    value with a `Default` badge beside it; picking any value removes the badge (becomes manual).
    Choosing **Not set** with a sector set brings the default back ([FR-005](requirements.md#fr-005)).
  - **Position** is disabled until a chain name is typed, except **None**.
  - Themes: Enter or `,` adds a tag; Backspace in an empty input removes the last tag; duplicates
    (case-insensitive) are ignored; max 20, each ≤ 40 characters.
  - Lists section shows "No lists yet — you can create one on the Lists page" when empty.

### Stock detail

```
│ Stocks › NVDA                                                                   │
│ NVDA  NVIDIA Corporation                               [Edit]  [⋯ ▾ Delete]    │
│ US · NASDAQ · USD · S&P 500, Nasdaq-100                                         │
│ ┌ Classification ──────────────────────┐ ┌ Lists ─────────────────────────────┐ │
│ │ Sector          Information Tech.     │ │ Core holdings                  [×] │ │
│ │ Economic cycle  Sensitive  [Default]  │ │ Watching                       [×] │ │
│ │ Size            Mega                  │ │ [+ Add to list ▾]                  │ │
│ │ Style           Growth                │ └────────────────────────────────────┘ │
│ │ …               — (not set)           │                                        │
│ └───────────────────────────────────────┘                                        │
```

- **Layout notes** — classification as a description list (`dl`, two columns: term/value). From
  `lg`, Classification and Lists sit side by side (2/3 + 1/3); below `lg` they stack.
- **User flow** — Edit → `/stocks/:id/edit`. Delete → AlertDialog "Delete NVDA? It will be
  removed from 2 lists. This can't be undone." → `204` → toast → `/stocks`. Add to list → popover
  `Command` of lists the stock isn't in → `201` → list appears. `[×]` removes from that list
  immediately with an Undo toast action (re-adds).
- **Annotations** — unset lenses show `—` with `sr-only` "not set". The `Default` badge marks
  `lensSources[field] === "default"`.

### Edit stock

Same as **Add stock**, with these differences:

- Title `Edit NVDA`; breadcrumb `Stocks › NVDA › Edit`.
- Market and Ticker are shown as read-only text (not disabled inputs) with the hint "To change
  market or ticker, delete this stock and add it again."
- No **Lists** card (list membership is edited on the detail page).
- Save → `200` → toast `NVDA updated` → `/stocks/:id`.

### Lists

```
│ Lists                                                         [+ New list]      │
│ ┌───────────────────────────────────────────────────────────────────────────┐   │
│ │ Name ↑               │ Stocks │                                        │   │
│ │──────────────────────┼────────┼────────────────────────────────────────│   │
│ │ Core holdings        │   22   │                                   [⋯]  │   │
│ │ Watching             │   11   │                                   [⋯]  │   │
│ └───────────────────────────────────────────────────────────────────────────┘   │

[⋯] menu: Rename… / Delete…

New / Rename dialog:                  Empty state:
┌ New list ─────────────────────┐     │ No lists yet                               │
│ Name* [Swing study          ] │     │ Lists group stocks, e.g. "Core holdings".  │
│ ⚠ A list with this name       │     │ [+ New list]                               │
│   already exists.             │
│             [Cancel] [Create] │
└───────────────────────────────┘
```

- **Layout notes** — table: Name (link to `/lists/:id`), Stocks (right-aligned, `tabular-nums`),
  actions menu.
- **User flow** — New list → Dialog → `201` → toast, dialog closes, row appears. `409` → field
  error on Name. Rename → same dialog pre-filled. Delete → AlertDialog "Delete Core holdings? Its
  22 stocks stay saved." → `204`.

### List detail

```
│ Lists › Core holdings                                                           │
│ Core holdings                         [+ Add stock ▾]  [Rename]  [⋯ Delete]     │
│ 22 stocks                                                                       │
│ ┌───────────────────────────────────────────────────────────────────────────┐   │
│ │ Ticker │ Name │ Market │ Exch. │ Sector │ Size │ Style │              [×] │   │
│ └───────────────────────────────────────────────────────────────────────────┘   │

Add stock popover:                     Empty list:
┌───────────────────────────┐          │ This list is empty.                       │
│ 🔍 Search ticker or name   │          │ [+ Add stock]  or  [⇪ Import into it]     │
│ AAPL  Apple          US   │
│ PTTEP PTT Exploration TH  │
│ (only stocks not in list) │
└───────────────────────────┘
```

- **Layout notes** — same stock table as **Stocks**, minus the Lists column, plus a trailing
  remove button per row.
- **User flow** — Add stock → `Command` combobox of saved stocks not in the list → `201`.
  Remove `[×]` → removed with Undo toast. **Import into it** → `/import-export?listId=<id>`,
  which pre-selects the target list.

### Import

```
Step 1 — Choose file
│ Import / export                                                                 │
│ ┌ Import stocks ────────────────────────────────────────────────────────────┐   │
│ │ ① File  ─  ② Review  ─  ③ Done                                            │   │
│ │ Start from the template: [⇩ CSV template]  [⇩ Excel template]             │   │
│ │ ┌ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ┐   │   │
│ │ │   Drop a .csv or .xlsx file here, or [Choose file]                  │   │   │
│ │ │   Up to 1 MB and 1,000 rows. Only the first sheet is read.          │   │   │
│ │ └ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ┘   │   │
│ │ ⚠ (file-level error alert appears here)                                   │   │
│ └───────────────────────────────────────────────────────────────────────────┘   │
│ ┌ Export ─ Coming later ────────────────────────────────────────────────────┐   │

Step 2 — Review
│ │ holdings.xlsx  ·  35 rows                               [Choose another]  │   │
│ │ [31 new] [3 duplicate] [1 error]      ⚠ Unknown column "notes" ignored   │   │
│ │ Show: (•) All ( ) New ( ) Duplicates ( ) Errors                          │   │
│ │ ┌ Row │ Ticker │ Market │ Name       │ Status        │ Details ───────┐   │   │
│ │ │  2  │ NVDA   │ US     │ NVIDIA     │ + New         │                │   │   │
│ │ │  3  │ AAPL   │ US     │ Apple      │ ⧉ Duplicate   │ Already saved  │   │   │
│ │ │  4  │ XYZ    │ JP     │            │ ⊘ Error       │ market: must…  │   │   │
│ │ └─────────────────────────────────────────────────────────────────────┘   │   │
│ │ Add to list*  [Core holdings ▾]   (or "+ New list…" → name input)        │   │
│ │ Duplicates*   (•) Skip — keep saved stocks as they are                    │   │
│ │               ( ) Update — overwrite with this file's non-empty values    │   │
│ │ Error rows are not imported.                                              │   │
│ │                                    [Cancel]  [Import 34 stocks]           │   │

Step 3 — Done
│ │ ✓ Import finished into "Core holdings"                                   │   │
│ │ 31 created · 3 skipped · 0 updated · 1 failed                            │   │
│ │ [Open Core holdings]  [⇩ Download error rows (CSV)]  [Import another]    │   │
```

- **Layout notes** — one `Card` for import with a three-step indicator; an Export card below
  says "Coming later" (the existing placeholder content). The preview table scrolls inside a
  `max-h-[28rem]` container with a sticky header.
- **User flow**
  - Choose/drop file → `POST /imports/preview` (button shows spinner, "Checking file…") → step 2.
    File-level errors (`413`, `415`, `422 …`) keep step 1 and show an `Alert` that names the
    problem: "File is larger than 1 MB", "Use a .csv or .xlsx file", "The file has 1,248 rows;
    the limit is 1,000", "Missing columns: ticker, name".
  - Step 2: the confirm button counts new + duplicate rows. It is disabled when no list is chosen,
    or when every row is an error ("Nothing to import — fix the file and choose it again").
    The **Duplicates** group only appears when the count is above 0; otherwise `skip` is sent.
  - Confirm → `POST /imports` → step 3. A `409 list_name_taken` puts a field error on the new
    list name and stays on step 2. Other errors show an `Alert` on step 2; nothing was saved, and
    the button can be pressed again.
  - **Cancel** / **Choose another** / **Import another** return to step 1 and drop the file.
  - `?listId=` in the URL pre-selects that list.
- **Annotations** — status is shown by icon **and** text, never colour alone. Error details list
  every failed field as `field: message`; long details wrap. Download builds the CSV in the
  browser from `errorRows` ([FR-023](requirements.md#fr-023)).

## Hi-fi Component Specs

### Stocks

#### Layout

- **Wrapper** — `<section className="space-y-6">`; header `flex flex-wrap items-end justify-between gap-3`.
- **Table container** — `rounded-lg border overflow-x-auto`; `Table` inside.
- **Responsive** — < `sm`: header actions full width below the title (`w-full sm:w-auto`),
  table scrolls horizontally with the Ticker column `sticky left-0 bg-background`. `md`+: no
  change besides width; the table fits from `lg`.

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Add stock | `Button` (`asChild` → `Link`) | default / default | `w-full sm:w-auto`, `PlusIcon` | default, hover, focus-visible ring, disabled |
| Import | `Button` (`asChild` → `Link`) | outline / default | `w-full sm:w-auto`, `UploadIcon` | default, hover, focus |
| Table | `Table`, `TableHeader`, `TableRow`, `TableHead`, `TableCell` | — | `text-sm`; ticker `font-medium tabular-nums` | row hover `hover:bg-muted/50` |
| Sort header | `Button` inside `TableHead` | ghost / sm | `-ml-2 h-8`, `ArrowUpIcon`/`ArrowDownIcon`/`ArrowUpDownIcon` (`size-3.5`) | default, hover, focus, active (icon shows direction) |
| Row link | `Link` on the ticker cell; whole row clickable via `onClick` | — | `cursor-pointer`; link `underline-offset-4 hover:underline focus-visible:underline` | default, hover, focus |
| Market | `Badge` | outline | `font-mono` | static |
| List badges | `Badge` | secondary | `max-w-32 truncate` | static |
| Empty state | `Card` | — | `items-center text-center py-12 gap-3`; icon `size-8 text-muted-foreground` | static |
| Loading (first paint) | `Skeleton` rows ×5 | — | `h-9 w-full` | loading |

#### Accessibility

- **Contrast** — table text `foreground` on `background`: ≈ 19:1 light, ≈ 18:1 dark. Secondary
  text `muted-foreground` on `background`: ≈ 4.7:1 light, ≈ 7.6:1 dark.
- **ARIA roles** — native `table` semantics; sortable `th` has `aria-sort="ascending|descending|none"`;
  the sort button's name is "Sort by Name". The table has `<caption className="sr-only">` "Saved
  stocks, sorted by …".
- **Keyboard navigation** — Tab: Import → Add stock → sort buttons → each row's ticker link. The
  row `onClick` is a mouse convenience only; the ticker link is the keyboard path.

### Add stock / Edit stock

#### Layout

- **Wrapper** — `<form className="space-y-6 max-w-4xl">`, three `Card`s each with `CardHeader`
  (`CardTitle`) and `CardContent` holding a `FieldGroup`.
- **Responsive** — < `md`: one column. `md`+: `grid md:grid-cols-2 gap-4` inside each card;
  Company name, Value chain row, Customers, Revenue types and Themes span both columns
  (`md:col-span-2`). Action bar: `flex flex-col-reverse gap-2 sm:flex-row sm:justify-end`.

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Market | `RadioGroup` + `RadioGroupItem` ×2 in `FieldSet`/`FieldLegend` | — | `flex gap-4` | default, focus, checked, disabled (edit: replaced by text) |
| Ticker | `Input` | — | `uppercase font-mono max-w-40`, `autoComplete="off"`, `maxLength={12}` | default, focus, error (`aria-invalid`), read-only text on edit |
| Exchange, single-value lenses | `Select` + `SelectTrigger` + `SelectContent` + `SelectItem` | default size | `w-full` | default, open, focus, disabled, error |
| "Not set" option | `SelectItem value="__none__"` | — | `text-muted-foreground` | — (mapped to `null`; Radix forbids an empty value) |
| Currency | plain text in `FieldDescription` | — | `text-sm` | static |
| Company name | `Input` | — | `maxLength={200}` | default, focus, error |
| Index membership, Customers, Revenue types, Lists | `Checkbox` + `FieldLabel` in `FieldSet` | — | `flex flex-wrap gap-x-6 gap-y-2` | unchecked, checked, focus, disabled |
| Default marker | `Badge` | outline | `text-xs` beside the Economic cycle label | shown only while the value is a default |
| Value chain | `Input` | — | `maxLength={60}` | default, focus, error |
| Position | `Select` | — | — | disabled until chain name present (except None) |
| Themes | `TagInput` (new, `features/stocks/components/tag-input.tsx`): `Badge variant="secondary"` + remove `Button variant="ghost" size="icon-xs"` + `Input` | — | container `flex flex-wrap gap-1.5 rounded-md border px-2 py-1.5 focus-within:ring-[3px] focus-within:ring-ring/50` | default, focus-within, error, max reached (input disabled, hint "20 themes max") |
| Form alert | `Alert` | destructive | `role="alert"`; link inside `underline` | shown on 409 / 5xx / network |
| Cancel | `Button` (`asChild` → `Link`) | outline | `w-full sm:w-auto` | default, hover, focus |
| Save | `Button type="submit"` | default | `w-full sm:w-auto` | default, hover, focus, loading (spinner + "Saving…", disabled) |

#### Accessibility

- **Contrast** — labels `foreground`; hints `muted-foreground` on `card` (light ≈ 4.7:1, dark
  ≈ 6.9:1); error text `destructive` on `card`: light ≈ 4.8:1, dark ≈ 6.4:1.
- **ARIA roles** — each `Select` trigger is labelled by its `FieldLabel` (`htmlFor` → trigger id);
  checkbox and radio groups are `fieldset`/`legend`; required fields have `aria-required` and a
  visible `*` with `sr-only` "required"; `TagInput` input is labelled "Add theme", each tag's
  remove button "Remove theme AI", and the tag list is a `ul` with `aria-label="Themes"`.
- **Keyboard navigation** — DOM order = visual order (Identity → Classification → Lists →
  Cancel → Save). Arrow keys move within radio groups; Space toggles checkboxes; Enter in a text
  input submits except in `TagInput`, where it adds a tag. After a failed submit, focus moves to
  the first invalid field, or to the form alert for 409/5xx.

### Stock detail

#### Layout

- **Wrapper** — `space-y-6`; content `grid gap-6 lg:grid-cols-3`, Classification `lg:col-span-2`.
- **Responsive** — < `lg` stacked; header actions wrap below title under `sm`.

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Identity line | text | — | `text-sm text-muted-foreground` | static |
| Edit | `Button` (`asChild` → `Link`) | outline | `PencilIcon` | default, hover, focus |
| More menu | `DropdownMenu` + trigger `Button variant="ghost" size="icon"` | — | `aria-label="More actions"` | default, open, focus |
| Delete item | `DropdownMenuItem` | destructive (`variant="destructive"`) | — | default, highlighted |
| Delete confirm | `AlertDialog` | action `Button variant="destructive"` | — | default, loading |
| Classification | `Card` with `dl` | — | `grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-2 text-sm`; `dt` `text-muted-foreground` | static |
| Lists card rows | `ul` + remove `Button variant="ghost" size="icon-sm"` | — | `divide-y` | default, hover, focus, loading |
| Add to list | `Popover` + `Command` (`CommandInput`, `CommandList`, `CommandItem`, `CommandEmpty`) | trigger `Button variant="outline" size="sm"` | `w-64 p-0` | closed, open, empty ("In every list"), loading |

#### Accessibility

- **Contrast** — `dt` `muted-foreground` on `card`: ≈ 4.7:1 light, ≈ 6.9:1 dark.
- **ARIA roles** — `dl` semantics; remove buttons named "Remove from Core holdings"; Undo toast
  action is a button reachable with the toast's keyboard shortcut (sonner `F6`/Alt+T).
- **Keyboard navigation** — Edit → More → Classification (no stops) → list remove buttons →
  Add to list. AlertDialog traps focus, starts on Cancel, Esc closes, focus returns to the More
  button.

### Lists and List detail

#### Layout

- **Wrapper** — same page header pattern; table container as on **Stocks**.
- **Responsive** — List detail header actions: < `sm` Add stock full width, Rename and Delete
  move into the `⋯` menu.

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| New list | `Button` | default | `PlusIcon` | default, hover, focus |
| Count | `TableCell` | — | `text-right tabular-nums` | static |
| Row menu | `DropdownMenu`, trigger `Button variant="ghost" size="icon-sm"` | — | `aria-label="Actions for Core holdings"` | default, open, focus |
| Create / Rename | `Dialog` + `DialogHeader` + `Field` + `Input` + `DialogFooter` | submit `Button` default | `sm:max-w-sm` | default, error (409 / length), loading |
| Delete | `AlertDialog` | action destructive | — | default, loading |
| Add stock | `Popover` + `Command` | trigger `Button` default | `w-72 p-0` | closed, open, empty ("All saved stocks are in this list"), loading |
| Remove row | `Button` | ghost / icon-sm | `XIcon` | default, hover, focus, loading |
| Import into it | `Button` (`asChild` → `Link`) | outline | — | default, hover, focus |

#### Accessibility

- **Contrast** — as **Stocks**.
- **ARIA roles** — Dialog has `aria-labelledby` = title; the name input has `autoFocus`; errors
  via `FieldError` linked by `aria-describedby`.
- **Keyboard navigation** — Enter in the name input submits; Esc closes the dialog and returns
  focus to its trigger. In `Command`, ↑/↓ move, Enter adds, Esc closes.

### Import

#### Layout

- **Wrapper** — `space-y-6`; Import `Card` (`max-w-5xl`), Export `Card` below.
- **Step indicator** — `ol` `flex gap-2 text-sm`; current step `font-medium text-foreground`
  with `aria-current="step"`, others `text-muted-foreground`.
- **Responsive** — < `md`: preview table shows Row, Ticker, Status; Market, Name and Details move
  into a second line under the ticker (`md:hidden` / `hidden md:table-cell`). Options stack;
  action bar full width.

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Template links | `Button` (`asChild` → `a href="/api/imports/template.csv" download`) | outline / sm | `DownloadIcon` | default, hover, focus |
| Drop zone | `label` wrapping a visually hidden `input type="file" accept=".csv,.xlsx"` | — | `flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center hover:bg-muted/50 focus-within:ring-[3px] focus-within:ring-ring/50`; drag-over `border-primary bg-muted/50` | default, hover, focus-within, drag-over, loading ("Checking file…", spinner), disabled while loading |
| File-level error | `Alert` | destructive | `AlertCircleIcon` | shown after rejected file |
| Counts | `Badge` ×3 | secondary (new), outline (duplicate), destructive (error) | `tabular-nums` | static |
| Header warning | `Alert` | default | `TriangleAlertIcon` | shown when warnings exist |
| Status filter | `RadioGroup` (horizontal) | — | `flex flex-wrap gap-4` | default, checked, focus |
| Preview table | `Table` in `div` | — | `max-h-[28rem] overflow-auto rounded-lg border`; `TableHeader` `sticky top-0 bg-background` | default; error rows `bg-destructive/5` |
| Status cell | `Badge` | secondary + `PlusIcon` "New" / outline + `CopyIcon` "Duplicate" / destructive + `CircleAlertIcon` "Error" | `gap-1` | static |
| Target list | `Select` with lists + separator + "New list…" item; new → `Input` below | — | `w-full sm:w-72` | default, open, error (required / 409) |
| Duplicates | `RadioGroup` with descriptions | — | `FieldDescription` under each item | default, checked, focus |
| Confirm | `Button type="submit"` | default | label "Import N stocks" | default, hover, focus, disabled (no list / nothing to import), loading ("Importing…") |
| Summary | `Alert` | default + `CircleCheckIcon` | `role="status"` | static |
| Summary actions | `Button`s | default (Open list), outline (Download errors, shown only if failed > 0), ghost (Import another) | — | default, hover, focus |

#### Accessibility

- **Contrast** — destructive badge text on its tint (`text-destructive` on `bg-destructive/10`
  over `card`): verify ≥ 4.5:1 in both themes during automation; if it falls short, use
  `text-foreground` with the icon carrying the colour. Error row tint `bg-destructive/5` keeps
  `foreground` text ≥ 15:1.
- **ARIA roles** — the step change moves focus to the step's heading (`h2`, `tabIndex={-1}`);
  "Checking file…" and "Importing…" are announced through an `aria-live="polite"` region; the
  file-level error `Alert` has `role="alert"`; the summary has `role="status"`. The preview
  table has `<caption className="sr-only">` "Rows in holdings.xlsx, showing all".
- **Keyboard navigation** — the drop zone is reached as the file input (Space/Enter opens the
  file picker). Step 2 order: Choose another → status filter → table (no stops) → Target list →
  Duplicates → Cancel → Import. Drag-and-drop is optional; the button path does everything.

## Design Review

The import flow is the critical flow; the add-stock form is the most-used one. Both were reviewed.

### Heuristics (Nielsen)

| # | Heuristic | Issues Found | Score (1–4) | Resolution |
|---|-----------|--------------|-------------|------------|
| 1 | Visibility of system status | Upload and confirm could look frozen on a 1,000-row file | 2 | Spinner + live-region text on both calls; step indicator |
| 2 | Match with the real world | Lens names must match the investor's prototype vocabulary | 1 | Labels use the brief's exact lens names and values |
| 3 | User control and freedom | Removing a stock from a list by mistake | 2 | Undo toast action on remove; deletes use AlertDialog |
| 4 | Consistency and standards | Add and edit forms could drift | 1 | One `StockForm` component with an `edit` mode |
| 5 | Error prevention | Exchange/market mismatch; picking a position without a chain; importing into no list | 2 | Exchange options follow market; position disabled without chain; confirm disabled without list |
| 6 | Recognition rather than recall | Users must remember template headers | 2 | Template download on the same card; missing headers named in the error |
| 7 | Flexibility and efficiency | 30–50 stocks in one evening is slow by hand | 1 | Import with template; lists chosen on the add form |
| 8 | Aesthetic and minimalist design | 14 lens fields make a long form | 2 | Grouped cards, two columns from `md`, all lenses optional |
| 9 | Help users recover from errors | A failed import row must be fixable | 2 | Per-field reasons in preview; downloadable error rows CSV with original cells |
| 10 | Help and documentation | What "Default" means on economic cycle | 1 | Tooltip on the badge: "Set from the sector. Pick a value to override." |

No issue scores 3 or 4.

### Accessibility Audit

- **WCAG AA** — pass for body text, labels, hints and errors in both themes (ratios above).
  Fails if `muted-foreground` text is put on `bg-muted` (≈ 4.4:1); forbidden by the contrast rule
  in [Shared patterns](#shared-patterns). The radix-nova `destructive` button and badge are
  tinted (`text-destructive` on `bg-destructive/10`, `/20` in dark), so the delete confirm button
  and the error badge are to be measured in automation (see Import accessibility) and darkened to
  pass if needed.
- **Keyboard flow** — confirmed on paper for every screen: all actions reachable without a mouse;
  dialogs trap and return focus; drag-and-drop and row clicks have keyboard equivalents.
