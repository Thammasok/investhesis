---
version: 1.0
status: approved
date: 2026-11-24
requires: design.md
---

# UX/UI Design: Thesis Log

Like the earlier slices there are no mockups: the screens build on the `sidebar-08` shell, the
theme tokens in `apps/web/src/index.css` and the installed `ui/` components. **No new shadcn
component is needed**: this slice uses `card`, `badge`, `button`, `dialog`, `alert-dialog`,
`radio-group`, `field`, `input`, `input-group`, `textarea`, `alert`, `skeleton` and `sonner`. No
new colours or radii.

The [Shared patterns](../../stock-lists/v1.0/ux-design.md#shared-patterns) of Stock Lists apply
unchanged (page header and focus, loading, toasts, field and form errors, not-found, destructive
confirm, the contrast rule), and the **Money** pattern of
[Holdings and Concentration](../../holdings-concentration/v1.0/ux-design.md) applies to the target
price (a per-share price keeps the decimals it was entered with, up to 4: `$180`, `฿42.25`,
`$0.1234`). Two patterns are added here:

- **Entry type** — a `Badge variant="secondary"` with an icon (`aria-hidden`) and the type's
  name: Buy `TrendingUpIcon`, Sell `TrendingDownIcon`, Update `RefreshCwIcon`, Review
  `ClipboardCheckIcon`. All four use the same neutral badge; the word and icon tell them apart,
  never colour ([NFR-007](requirements.md#nfr-007)). No red for Sell (tinted destructive fails AA
  in light mode, Stock Lists F-2 to F-4).
- **Plain text block** — entry text and invalidation conditions render as React text in a `p`
  with `whitespace-pre-wrap wrap-anywhere`, so line breaks show, long words and URLs wrap at
  360 px, and markup shows as typed ([NFR-005](requirements.md#nfr-005),
  [NFR-008](requirements.md#nfr-008)). Dates show as `24 Nov 2026` (`Intl.DateTimeFormat`,
  `dateStyle: 'medium'`, browser locale), built from the `YYYY-MM-DD` string with no time-zone
  shift.

## Screens in Scope

- **Thesis section on the stock page** — `/stocks/:id`, below the existing cards: list, empty,
  loading and load-error states ([FR-002](requirements.md#fr-002), [FR-003](requirements.md#fr-003),
  [FR-008](requirements.md#fr-008), [FR-011](requirements.md#fr-011)).
- **Thesis entry dialog** — add and edit ([FR-001](requirements.md#fr-001),
  [FR-004](requirements.md#fr-004), [FR-009](requirements.md#fr-009)).
- **Delete entry** — confirm, then a toast with Undo ([FR-005](requirements.md#fr-005)).
- **Delete stock confirmation** (changed) — names the entries deleted with the stock
  ([FR-007](requirements.md#fr-007)).

## Lo-fi Wireframes

### Thesis section on the stock page

```
│ Stocks › NVDA                                                                   │
│ NVDA  NVIDIA Corporation                                    [Edit]  [⋯]         │
│ ┌ Classification ──────────────────────────┐ ┌ Holding ──────────────────────┐ │
│ │ …                                         │ │ …                             │ │
│ │                                           │ └───────────────────────────────┘ │
│ │                                           │ ┌ Lists ────────────────────────┐ │
│ └───────────────────────────────────────────┘ └───────────────────────────────┘ │
│ ┌ Thesis  · 3 entries ─────────────────────────────────────── [+ Add entry] ┐ │
│ │ Your own reasoning, not advice.                                            │ │
│ │                                                                            │ │
│ │ [↗ Buy]  20 Nov 2026                                     [✎] [🗑]          │ │
│ │ Data-centre capex keeps rising, and NVDA keeps 80% of the accelerator      │ │
│ │ market.                                                                    │ │
│ │ Margins hold above 70%.                                                    │ │
│ │ Target price  $180                                                         │ │
│ │ Invalidation  Gross margin below 65% for two quarters.                     │ │
│ │ ──────────────────────────────────────────────────────────────────────────│ │
│ │ [⟳ Update]  3 Oct 2026 · Edited 5 Oct 2026                [✎] [🗑]        │ │
│ │ Export rules tightened; China revenue down to 12%. Still holding.          │ │
│ │ ──────────────────────────────────────────────────────────────────────────│ │
│ │ [↗ Buy]  14 Mar 2025                                     [✎] [🗑]          │ │
│ │ First position after the earnings beat. … [Show more]                      │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
```

Empty, loading and load-error states of the same card:

```
┌ Thesis ─────────────────────────────────────┐  ┌ Thesis ────────────────────────┐
│ Your own reasoning, not advice.             │  │ ▭▭▭▭▭  ▭▭▭▭▭▭                  │
│                                             │  │ ▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭        │
│       No thesis yet                         │  │ ▭▭▭▭▭▭▭▭▭▭▭▭▭▭                 │
│  Write down why you hold or watch NVDA, so  │  └────────────────────────────────┘
│  you can check it later.                    │
│            [+ Add first entry]              │  ┌ Thesis ────────────────────────┐
└─────────────────────────────────────────────┘  │ ⚠ Couldn't load the thesis      │
                                                 │   entries.          [Retry]     │
                                                 └────────────────────────────────┘
```

- **Layout notes** — a full-width `Card` below the existing `lg:grid-cols-3` grid (outside it, so
  it spans all three columns on `lg` and sits last when stacked). Entries are a `ol` (newest
  first), separated by `Separator`; each entry's text is limited to `max-w-prose` for reading.
  **Add entry** sits in the card header (it is the empty state's button instead while the log is
  empty, so the name appears once, as the list page does). The header count is "1 entry" /
  "N entries" and is not shown while empty, loading or failed.
- **Show more** — an entry whose note has more than 8 lines or 600 characters shows the first
  8 lines (`line-clamp-8`) and a `Show more` / `Show less` link button. The rule is on the text,
  not on measured height, so tests are deterministic. Invalidation conditions are never clamped.
- **User flow** — page opens → stock cards show at once, Thesis shows its skeleton → entries
  arrive. A load failure shows the error `Alert` with **Retry** (re-runs the loader); the rest of
  the page stays usable. After any save or delete the list keeps showing the previous entries
  until the re-read arrives (no skeleton flash).
- **Annotations** — "Edited 5 Oct 2026" shows the date of the last change, from `updatedAt` in the
  browser's zone. Target price and invalidation rows show only when set, as a `dl` of label and
  value. The currency symbol is the stock's current currency ([FR-006](requirements.md#fr-006)).

### Thesis entry dialog

```
┌ Add thesis entry · NVDA ─────────────────────────────── [×] ┐
│ Type        (•) Buy  ( ) Sell  ( ) Update  ( ) Review        │
│                                                              │
│ Date        [ 24/11/2026  📅 ]                               │
│                                                              │
│ Thesis                                                       │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │                                                          │ │
│ │                                                          │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                               0 / 10,000     │
│ Target price (optional)   [ $ │            ]                 │
│ Invalidation conditions (optional)                           │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ What would prove this thesis wrong?                      │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                0 / 2,000     │
│                                       [Cancel]  [Add entry]  │
└──────────────────────────────────────────────────────────────┘
```

- **Layout notes** — `sm:max-w-lg`, body scrolls inside the dialog on a short phone screen
  (`max-h-[90svh] overflow-y-auto`). Edit mode titles it "Edit thesis entry · NVDA" with the
  stored values and **Save** instead of **Add entry**.
- **User flow** — Add entry → dialog with Type unset, Date today, empty fields; focus on the first
  Type radio. Submit with problems → errors under each field, focus on the first field in error;
  nothing typed is lost. Save → dialog closes, toast "Entry added" / "Entry updated", focus returns
  to the opener (the Add entry button, or the entry's Edit button). Edit with no change → closes
  with the toast "No changes to save". A server or network failure keeps the dialog open with an
  `Alert` at the top: "Couldn't save the entry. Try again." A 404 on the stock shows "This stock
  no longer exists." with a link to `/stocks`.
- **Annotations** — Date is `<input type="date">` with `max` = today (local), so the native
  picker greys out future days; the domain check backs it up with "The date can't be in the
  future." The counters show code points, as the limit counts them, and turn `text-foreground
  font-medium` (not red) with the error text below when over. Target price is `type="text"
  inputMode="decimal"` with the stock's currency symbol as prefix.

### Delete entry

```
┌ Delete this entry? ─────────────────────────────────┐
│ The Buy entry of 20 Nov 2026 will be deleted.        │
│                                    [Cancel] [Delete] │
└──────────────────────────────────────────────────────┘

                 ┌──────────────────────────────────────┐
                 │ Entry deleted                [Undo]  │   (5 s)
                 └──────────────────────────────────────┘
```

- **User flow** — the entry's Delete button → `AlertDialog` → **Delete** → the entry leaves the
  list, focus moves to the Thesis heading (the button is gone), toast with **Undo** for 5 s →
  Undo puts the entry back in its place with the same dates and edited marker, toast "Entry
  restored". If the restore fails, toast "Couldn't restore the entry." (no retry: the investor can
  add it again).
- **Annotations** — the confirm button uses `SOLID_DESTRUCTIVE_LIGHT`, as every destructive
  confirm does.

### Delete stock confirmation (changed)

```
┌ Delete NVDA? ────────────────────────────────────────────────┐
│ NVDA will be removed from all lists. This also deletes its   │
│ 3 thesis entries. This can't be undone.                      │
│                                         [Cancel]  [Delete]   │
└──────────────────────────────────────────────────────────────┘
```

- **Annotations** — "its 1 thesis entry" / "its N thesis entries" when the entries have loaded
  and there are any; no sentence when there are none; "Any thesis entries for this stock are
  deleted too." while they are loading or failed to load.

## Hi-fi Component Specs

### Thesis section

#### Layout

- **Wrapper** — `Card` (`aria-labelledby` the title), `CardHeader` with `CardTitle` as `h2`
  "Thesis" (`tabIndex={-1}`, the focus target after a delete), the count in
  `CardDescription`-sized `text-sm text-muted-foreground` beside it, and `CardAction` holding
  **Add entry**. The advice note is the first line of `CardContent`.
- **Entry** — `li` with `article` (`aria-labelledby` its header line): header row
  `flex flex-wrap items-center gap-x-3 gap-y-1` (badge, date, edited text, then the actions
  pushed right with `ms-auto`), then the note, then the `dl`.
- **Responsive** — below `sm`: the header row wraps (badge and date on one line, actions on the
  right of it; "Edited …" wraps under), the `dl` stacks label over value, **Add entry** becomes an
  icon-plus-text button that still fits beside "Thesis" at 360 px. From `sm`: `dl` is
  `grid grid-cols-[auto_1fr] gap-x-4`.

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Add entry | `Button` | outline / sm | `PlusIcon` | default, hover, focus |
| Advice note | `p` | — | `text-xs text-muted-foreground` | static |
| Type badge | `Badge` | secondary | icon `size-3.5`, `aria-hidden` | static |
| Date | `time dateTime="2026-11-20"` | — | `text-sm font-medium tabular-nums` | static |
| Edited | `span` | — | `text-sm text-muted-foreground` | shown when `updatedAt > createdAt` |
| Edit / Delete | `Button` | ghost / icon-sm | `PencilIcon` / `Trash2Icon`; names "Edit Buy entry of 20 Nov 2026", "Delete Buy entry of 20 Nov 2026" | default, hover, focus |
| Note | `p` | — | `whitespace-pre-wrap wrap-anywhere max-w-prose text-sm`; `line-clamp-8` when collapsed | collapsed, expanded |
| Show more | `Button` | link / sm | `px-0`; `aria-expanded`, `aria-controls` the note | collapsed, expanded, focus |
| Target / Invalidation | `dl` | — | labels `text-sm text-muted-foreground`, values `text-sm`; target `tabular-nums` | shown when set |
| Separator | `Separator` | — | — | between entries |
| Empty state | `Empty`-style block in `CardContent` | — | `text-center py-8`, heading `h3` "No thesis yet", text `text-sm text-muted-foreground`, button default / sm | no entries |
| Loading | `Skeleton` × 3 lines | — | `h-4`, widths 30% / 90% / 60%; `motion-reduce:animate-none` | loading |
| Load error | `Alert` | default | `TriangleAlertIcon`; `AlertDescription` with **Retry** `Button` outline / sm | failed, retrying (spinner `motion-reduce:animate-none`, `aria-disabled`) |

#### Accessibility

- **Contrast** — note and values `foreground` on `card` ≈ 19:1; muted labels, count, edited and
  advice text `muted-foreground` on `card` ≈ 4.7:1 light, ≈ 7.6:1 dark (the contrast rule: never
  `muted-foreground` on `bg-muted`). The secondary badge text is measured in E2E in both themes.
- **ARIA roles** — the list is an `ol` named by the section heading; each entry an `article`. The
  count is part of the heading's description (`aria-describedby`), so a screen reader hears
  "Thesis, 3 entries". The skeleton container has `aria-busy="true"` and an `sr-only` "Loading
  thesis entries". The load error is `role="alert"`. Toasts are sonner's polite live region.
- **Keyboard navigation** — Tab: Add entry → for each entry: Edit → Delete → Show more (if any).
  Delete moves focus to the "Thesis" heading; a restore leaves focus where it is.

### Thesis entry dialog

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Dialog | `Dialog` + `DialogContent` + `DialogHeader` / `DialogTitle` / `DialogDescription` (`sr-only`: "Fields marked optional can be left empty.") | — | `sm:max-w-lg max-h-[90svh] overflow-y-auto` | open, saving, error |
| Type | `RadioGroup` in `FieldSet` + `FieldLegend` "Type" | — | `flex flex-wrap gap-x-4 gap-y-2` | unset, checked, focus, error |
| Date | `Input type="date"` in `Field` | default | `w-44 tabular-nums`; `max` today | default, focus, error |
| Thesis | `Textarea` in `Field` | — | `min-h-40`; counter `text-xs text-muted-foreground tabular-nums text-right` linked by `aria-describedby` | default, focus, error, over limit |
| Target price | `InputGroup` + addon (`$` / `฿`) + `InputGroupInput` (`inputMode="decimal"`) | — | `w-48 tabular-nums` | default, focus, error |
| Invalidation | `Textarea` in `Field` | — | `min-h-24`, placeholder "What would prove this thesis wrong?"; counter as above | default, focus, error, over limit |
| Form error | `Alert` | default | `TriangleAlertIcon` | shown on server or network failure |
| Cancel / Add entry / Save | `Button` in `DialogFooter` | outline / default | spinner `motion-reduce:animate-none`; saving button `aria-disabled` | default, loading |

#### Accessibility

- **ARIA roles** — every control is labelled by its `FieldLabel` / `FieldLegend`; errors use
  `FieldError` linked with `aria-describedby` and `aria-invalid`. The counter is announced only
  on blur (it is `aria-live="off"`) so typing is not interrupted.
- **Keyboard navigation** — focus starts on the Type group (the checked radio in edit mode); arrows
  move between types; Tab: Date → Thesis → Target price → Invalidation → Cancel → Add entry/Save.
  Enter inside a textarea makes a new line; Ctrl/⌘ + Enter submits. Esc closes; focus returns to
  the opener.

### Delete entry and delete stock dialogs

#### Components

| Element | shadcn/ui Component | Variant / Size | Tailwind Classes | States |
|---------|-------------------|---------------|-----------------|--------|
| Confirm | `AlertDialog` | — | as `DeleteStockDialog` | open, deleting |
| Delete | `AlertDialogAction` | destructive | `SOLID_DESTRUCTIVE_LIGHT` | default, loading |
| Undo toast | `toast()` from sonner with `action` | — | duration 5000 | shown, undone, expired |
| Entry count sentence | `AlertDialogDescription` text | — | — | count, none, unknown |

#### Accessibility

- **Keyboard navigation** — the alert dialog opens with focus on Cancel; Esc cancels and returns
  focus to the entry's Delete button. The toast's Undo is reachable with sonner's hotkey (Alt+T)
  and Tab, as for Stop holding.

## Design Review

The entry dialog is the critical flow (it is where the reason for a decision is captured); delete
and Undo are the riskiest (data loss).

### Heuristics (Nielsen)

| # | Heuristic | Issues Found | Score (1–4) | Resolution |
|---|-----------|--------------|-------------|------------|
| 1 | Visibility of system status | Entries load after the page; the investor may think there are none | 2 | Skeleton with `aria-busy`, and the count hidden until loaded, so "No thesis yet" only shows when it is true |
| 2 | Match with the real world | "Invalidation" is jargon for some investors | 2 | Placeholder "What would prove this thesis wrong?" explains it in plain words |
| 3 | User control and freedom | Deleting an entry by mistake loses the reasoning | 2 | Confirm, then Undo for 5 s restoring the same entry and dates |
| 4 | Consistency and standards | A second delete-with-undo pattern could drift from Stop holding | 1 | Same toast, duration and focus rules as Stop holding |
| 5 | Error prevention | Future dates, over-long text, a target typed with a currency sign | 2 | Date `max`; live counters; currency shown as the prefix so it is not typed; domain messages name the limit |
| 6 | Recognition rather than recall | Which entry an icon-only Edit/Delete belongs to | 2 | Accessible names include type and date; buttons sit on the entry's header line |
| 7 | Flexibility and efficiency | Writing many entries for a backlog of holdings | 1 | Ctrl/⌘ + Enter submits; Date is typed or picked |
| 8 | Aesthetic and minimalist design | Long entries make the history hard to scan | 2 | Clamp at 8 lines with Show more; one neutral badge style |
| 9 | Help users recover from errors | Save fails on a flaky network and the text is lost | 3 | Dialog stays open with everything typed, form `Alert` names the problem; nothing is cleared until the server confirms |
| 10 | Help and documentation | Why a thesis log, and that it is not advice | 1 | Empty-state text and the advice note |

The one major issue (9) is resolved in the design above; no issue is open at 3 or 4.

### Accessibility Audit

- **WCAG AA** — pass for text in both themes per the ratios above. To measure in E2E
  (`e2e/lib/contrast.ts`): the secondary badge text, the counter when over the limit, and the
  solid destructive confirm in light and dark. No tinted destructive text is used.
- **Keyboard flow** — confirmed on paper: add, edit, show more, delete and Undo are reachable and
  operable without a mouse; dialogs trap focus and return it; delete moves focus to the section
  heading.
