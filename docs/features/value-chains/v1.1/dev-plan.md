---
version: 1.1
status: active
date: 2026-11-27
requires: design.md
ux-design: ux-design.md
---

# Development Plan: Value Chains — Graph view

Builds [requirements.md](requirements.md) per [design.md](design.md) and
[ux-design.md](ux-design.md). Every engineering task follows the test gate: green before, green
after, then human review. The gate is the **Investhesis gate** in `CLAUDE.md` (Tests and the
Investhesis gate), run from the repo root: `pnpm db:start && pnpm db:reset`,
`pnpm test:supabase`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`
(with `E2E_WEB_PORT` when 5173 is taken). `.claude/rules/test-gate.md` still lists Pacta's
commands (carried work in `docs/todo.md`).

**Web only.** No task touches `apps/api`, `packages/domain` or `supabase/migrations/`
([design.md](design.md#api-contracts)). The v1.0 tests of `/chains` must stay green as they
are: the Lanes view is unchanged apart from the view switch.

**Test ids.** This slice uses the 1100 range (900 to 946 are Value Chains v1.0, 1000 to 1099 are
reserved by Thai and English UI v2.0): `TC-U-11xx` in the task contracts below, and `TC-A-11xx`,
`TC-C-11xx`, `TC-E-11xx` from [T-006](#t-006--design-test-cases--value-chains-graph-view). Every
test title starts with its id.

**i18n.** Thai and English UI v2.0 is planned but not started. If it lands before a web task
here, that task puts its strings in the catalogues (English and Thai) instead of literals. If
not, the strings are English, as in [ux-design.md §Copy](ux-design.md#copy), and the i18n slice
picks them up.

## Summary

- **Total tasks**: 7 (5 engineering, 1 test design, 1 test automation)
- **Estimated effort**: about 4 days of agent work (S ≈ 0.4 day, M ≈ 0.75 day, L ≈ 1.5 days);
  about 3 days elapsed with the lanes in parallel
- **Critical path**: [T-001](#t-001--foundation-react-flow-dependency-jsdom-shims-and-import-fence) →
  [T-003](#t-003--graph-layout-model) →
  [T-004](#t-004--chaingraph-canvas-lazy-chunk) →
  [T-005](#t-005--graph-view-on-chains) →
  [T-007](#t-007--automate-tests--value-chains-graph-view)
- **Parallel lanes**: [T-002](#t-002--address-view-and-chain-selection) (pure model) and
  [T-006](#t-006--design-test-cases--value-chains-graph-view) (test design) start at once.

## Tasks

### T-001 — Foundation: React Flow dependency, jsdom shims and import fence

```yaml
- title: Add @xyflow/react and toggle-group, the jsdom shims, and fence the React Flow import
- description: >
  Discovery and setup for an existing system. First re-check the React Flow docs (Context7
  /websites/reactflow_dev) for 12.12.1: sub flows (parentId, extent), the read-only props of
  design.md ADR-104, ariaLabelConfig keys, the --xy-* CSS variables of base.css, and the testing
  shims. Record any difference from design.md in this task's review note. Then:
  (1) add @xyflow/react at exactly 12.12.1 to apps/web (no caret; design.md ADR-101).
  (2) pnpm dlx shadcn@latest add toggle-group in apps/web, then the cn import fix from CLAUDE.md;
  re-apply the cn fix to any ui/ file the CLI rewrote.
  (3) Extend apps/web/src/test/setup.ts with React Flow's jsdom shims (a ResizeObserver that calls
  back, DOMMatrixReadOnly, SVGElement getBBox, offsetWidth/offsetHeight from style). The
  ResizeObserver stub already exists for the Radix poppers, so keep them working.
  (4) Add an oxlint no-restricted-imports rule: @xyflow/react may be imported (value imports)
  only under src/features/chains/graph/ in chain-graph.tsx, stage-group-node.tsx and
  stock-node.tsx. chain-graph-model.ts may only `import type`.
  (5) A static test features/chains/graph/graph-static.test.ts that scans src/ for the import and
  checks the graph folder has no fetch/api calls.
  No UI change.
- agent: react-vite-developer
- depends_on: []
- status: backlog
- size: S
```

#### Acceptance criteria

- [ ] `apps/web/package.json` has `"@xyflow/react": "12.12.1"` (exact) and the lockfile is updated
- [ ] `ui/toggle-group.tsx` and `ui/toggle.tsx` exist and import `cn` from `@/lib/utils`
- [ ] A React Flow canvas with two nodes and one edge renders in a Vitest jsdom test and shows the edge, with no console error
- [ ] Every existing web test (Radix tooltip, dropdown, select included) still passes with the new shims
- [ ] `pnpm lint` fails on a value import of `@xyflow/react` outside the allowed files and passes on `import type` in the model
- [ ] The full Investhesis gate is green

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1100
    scenario: React Flow draws in jsdom with the shims
    given: test/setup.ts with the React Flow shims
    when: render <div style="width:800px;height:600px"><ReactFlow nodes=[a,b] edges=[a→b] /></div>
    then: two .react-flow__node elements and, after waitFor, one .react-flow__edge
    test_data:
      input: { nodes: [a@(0,0), b@(200,0)], edges: [a→b] }
      expected: { nodes: 2, edges: 1 }
  - id: TC-U-1101
    scenario: the Radix poppers still open with the new ResizeObserver
    given: the new shims
    when: open a Tooltip and a DropdownMenu in a test
    then: both contents appear, and no "ResizeObserver" error is logged
    test_data:
      input: hover tooltip trigger; click menu trigger
      expected: tooltip text and menu items visible
  - id: TC-U-1102
    scenario: the React Flow import is fenced to the graph folder
    given: the source tree under apps/web/src
    when: graph-static.test.ts scans every .ts/.tsx file for from '@xyflow/react'
    then: value imports appear only in features/chains/graph/{chain-graph,stage-group-node,stock-node}.tsx; chain-graph-model.ts uses import type only
    test_data:
      input: src/**
      expected: no offending file
  - id: TC-U-1103
    scenario: the graph folder makes no network call
    given: files in features/chains/graph/
    when: scan for fetch(, XMLHttpRequest, api.get(, api.post(
    then: none found
    test_data:
      input: features/chains/graph/**
      expected: []
```

**Notes**: shadcn's CLI may ask to overwrite `button.tsx`. Answer no, or re-run with
`--overwrite` and re-apply the `cn` fix (see `CLAUDE.md`). If 12.12.1's docs contradict
design.md (a prop name, say), follow the docs and note it. Moving to 13.x is out of scope.

### T-002 — Address: view and chain selection

```yaml
- title: Read view and chain from the address, pick the chain to draw, and build graph links
- description: >
  Per design.md §Address and §Components (chains-model.ts row). Extend readChainsView(params,
  lists) to return { scope, view: 'lanes' | 'graph', chain: string | null, notes } (a bad view is
  lanes plus a note; chain is the raw param, never validated here). Add selectChain(chains, key)
  → { chain: Chain | null, notInView: boolean }: an absent key is the first chain; a key not
  among chains is the first chain with notInView true; an empty list is null. Add
  chainGraphSearch(params, change) where change is { view?: 'lanes' | 'graph', chain?: string |
  null }. It keeps every other param, removes view for lanes, removes chain when it is the first
  chain's key or null, and writes chain keys URL-encoded. Pure functions in
  features/chains/chains-model.ts with unit tests. No UI. Covers FR-101, FR-103, OQ-101.
- agent: react-vite-developer
- depends_on: []
- status: backlog
- size: S
```

#### Acceptance criteria

- [ ] `readChainsView`, `selectChain` and `chainGraphSearch` are exported and pure
- [ ] The v1.0 scope behaviour of `readChainsView` is unchanged (its v1.0 tests pass untouched)
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1104
    scenario: view defaults to lanes and reads graph
    given: params "" and "view=graph"
    when: readChainsView(params, lists)
    then: view lanes with no note; view graph with no note
    test_data:
      input: ["", "view=graph"]
      expected: [{ view: lanes, notes: [] }, { view: graph, notes: [] }]
  - id: TC-U-1105
    scenario: a bad view falls back to lanes with one note
    given: params "view=tree&scope=held"
    when: readChainsView
    then: view lanes, scope held, exactly one note naming "tree"
    test_data:
      input: "view=tree&scope=held"
      expected: { view: lanes, scope: held, notes: ['Unknown view "tree", showing lanes.'] }
  - id: TC-U-1106
    scenario: chain param is read raw and decoded
    given: params "chain=ai%20%26%20semis"
    when: readChainsView
    then: chain is "ai & semis"
    test_data:
      input: "chain=ai%20%26%20semis"
      expected: { chain: "ai & semis" }
  - id: TC-U-1107
    scenario: selectChain picks the first chain when no key is given
    given: chains [AI & Semis (8), Oil & Gas (4)]
    when: selectChain(chains, null)
    then: AI & Semis, notInView false
    test_data:
      input: { key: null }
      expected: { chain: "ai & semis", notInView: false }
  - id: TC-U-1108
    scenario: selectChain finds the keyed chain
    given: chains [AI & Semis, Oil & Gas]
    when: selectChain(chains, "oil & gas")
    then: Oil & Gas, notInView false
    test_data:
      input: { key: "oil & gas" }
      expected: { chain: "oil & gas", notInView: false }
  - id: TC-U-1109
    scenario: a key not in view falls back with notInView
    given: chains [AI & Semis, Oil & Gas]
    when: selectChain(chains, "ev")
    then: AI & Semis, notInView true
    test_data:
      input: { key: "ev" }
      expected: { chain: "ai & semis", notInView: true }
  - id: TC-U-1110
    scenario: no chains gives null
    given: chains []
    when: selectChain([], "ev")
    then: { chain: null, notInView: false }
    test_data:
      input: { chains: [], key: "ev" }
      expected: { chain: null, notInView: false }
  - id: TC-U-1111
    scenario: chainGraphSearch keeps other params and leaves defaults out
    given: params "scope=held&market=TH&view=graph&chain=ev", first chain key "ai & semis"
    when: chainGraphSearch(params, { view: 'lanes' }); then chainGraphSearch(params, { chain: 'ai & semis' }); then chainGraphSearch(params, { chain: 'oil & gas' })
    then: view removed (chain kept); chain removed (first chain); chain=oil%20%26%20gas; scope and market kept every time
    test_data:
      input: as given
      expected: ["scope=held&market=TH&chain=ev", "scope=held&market=TH&view=graph", "scope=held&market=TH&view=graph&chain=oil%20%26%20gas"]
```

### T-003 — Graph layout model

```yaml
- title: buildChainGraph turns one Chain into React Flow nodes, groups and edges
- description: >
  Per design.md §Data Model and §Layout. New features/chains/graph/chain-graph-model.ts:
  buildChainGraph({ chain, stocksById }) → { nodes, edges, bounds }, pure and synchronous, with
  the layout constants exported (STAGE_WIDTH 256, STAGE_GAP 96, STAGE_HEADER 88, NODE_HEIGHT 64,
  NODE_GAP 8, PADDING 12, ROW_GAP 48). It uses `import type { Node, Edge }` from @xyflow/react
  only. Stage nodes have id stage:<area>, type stage, data the ChainAreaGroup, and fixed width and
  height. Stock nodes have id stock:<id>, type stock, parentId stage:<area>, extent parent,
  position relative to the parent, and data { stock, held, value, area }. The three stages always
  appear and share the tallest height; Integrated and NoPosition appear only when they hold a
  stock, full width, below, in rows of three columns. Order is parent first, then its stocks in
  ChainAreaGroup order (no re-sort); areas in CHAIN_AREAS order. Two edges
  stage:Upstream→stage:Midstream and stage:Midstream→stage:Downstream (type smoothstep,
  markerEnd ArrowClosed as a string literal type, focusable false). A stock missing from
  stocksById is skipped. Covers FR-104..FR-107, NFR-101 (model part), NFR-104.
- agent: react-vite-developer
- depends_on: [T-001]
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] `buildChainGraph` is pure (same input, deep-equal output) and imports nothing at runtime from `@xyflow/react`
- [ ] Counts and values on nodes come from the `ChainAreaGroup` given, never recomputed
- [ ] 200 stocks in one chain lay out in under 50 ms (logged, asserted with headroom)
- [ ] All TC-U cases below pass

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1112
    scenario: three stages always, side by side, same height
    given: chain with Upstream [ASML, AMAT], Midstream [TSM], Downstream []
    when: buildChainGraph
    then: stage nodes Upstream at x 0, Midstream at x 352, Downstream at x 704, all y 0; every stage height = 12+88+2×64+1×8+12 = 248; Downstream data.count 0
    test_data:
      input: as given
      expected: { x: [0, 352, 704], height: 248 }
  - id: TC-U-1113
    scenario: an empty stage keeps room for one row
    given: chain with Upstream [], Midstream [], Downstream [MSFT]
    when: buildChainGraph
    then: every stage height = 12+88+64+12 = 176
    test_data:
      input: as given
      expected: { height: 176 }
  - id: TC-U-1114
    scenario: stock nodes are children placed in order inside their stage
    given: Midstream stocks [TSM held 1000.00, NVDA held null, AMD not held] in that order
    when: buildChainGraph
    then: nodes stock:TSM, stock:NVDA, stock:AMD with parentId stage:Midstream, extent parent, x 12, y 100, 172, 244, width 232, height 64
    test_data:
      input: as given
      expected: { ids: [stock:TSM, stock:NVDA, stock:AMD], y: [100, 172, 244] }
  - id: TC-U-1115
    scenario: parents come before children and areas follow CHAIN_AREAS
    given: chain with stocks in all five areas
    when: buildChainGraph
    then: node ids in order stage:Upstream, its stocks, stage:Midstream, its stocks, stage:Downstream, its stocks, stage:Integrated, its stocks, stage:NoPosition, its stocks
    test_data:
      input: one stock per area
      expected: 10 nodes in that order
  - id: TC-U-1116
    scenario: Integrated and No position appear only when used, full width, below
    given: chain A without Integrated or None stocks; chain B with Integrated [INTC] and NoPosition [BCP]
    when: buildChainGraph(A), buildChainGraph(B)
    then: A has no stage:Integrated or stage:NoPosition; B has stage:Integrated at y = stageHeight+48, width 960, and stage:NoPosition below it at y = Integrated.y + Integrated.height + 48, width 960
    test_data:
      input: as given
      expected: { width: 960 }
  - id: TC-U-1117
    scenario: wide groups flow in three columns
    given: Integrated with 7 stocks
    when: buildChainGraph
    then: stocks at columns 0,1,2,0,1,2,0 and rows 0,0,0,1,1,1,2; Integrated height = 12+88+3×64+2×8+12 = 320
    test_data:
      input: 7 Integrated stocks
      expected: { rows: 3, height: 320 }
  - id: TC-U-1118
    scenario: two stage edges, always
    given: any chain, including one with every stage empty but Downstream
    when: buildChainGraph
    then: edges exactly [stage:Upstream→stage:Midstream, stage:Midstream→stage:Downstream], not focusable, markerEnd arrowclosed
    test_data:
      input: as given
      expected: 2 edges
  - id: TC-U-1119
    scenario: node data carries the stock, held flag, value and area
    given: TSM held with value "1000.00" in Midstream
    when: buildChainGraph
    then: stock:TSM data = { stock: <TSM row>, held: true, value: "1000.00", area: "Midstream" }
    test_data:
      input: as given
      expected: as then
  - id: TC-U-1120
    scenario: a stock missing from stocksById is skipped
    given: Upstream ids [ASML, GONE], stocksById without GONE
    when: buildChainGraph
    then: only stock:ASML; Upstream height as for one stock
    test_data:
      input: as given
      expected: { stockNodes: 1 }
  - id: TC-U-1121
    scenario: bounds and speed for 200 stocks
    given: one chain of 200 stocks spread over the five areas (60/60/60/10/10)
    when: buildChainGraph, timed with performance.now
    then: bounds.width 960, bounds.height = bottom of the last group; under 50 ms; ids unique
    test_data:
      input: 200 stocks
      expected: { width: 960, ms: "< 50" }
```

### T-004 — ChainGraph canvas (lazy chunk)

```yaml
- title: The ChainGraph component with stage and stock nodes, theme, controls and focus following
- description: >
  Per design.md §Components (chain-graph.tsx, stage-group-node.tsx, stock-node.tsx,
  chain-graph.css), ADR-104..ADR-107, and ux-design.md §Graph view (Canvas, Stage group node,
  Stage arrow, Stock node, Set position, Controls, Attribution, Copy, Accessibility). Default
  export ChainGraph({ chain, stocksById, title }) in features/chains/graph/chain-graph.tsx, with
  ReactFlowProvider + ReactFlow over buildChainGraph and:
  - read-only props per ADR-104;
  - nodeTypes { stage, stock } defined outside the component;
  - fitView on mount and when chain.key changes (padding 0.15, duration 0 under
    prefers-reduced-motion, else 200);
  - Controls showInteractive false bottom-left; Background dots;
  - ariaLabelConfig with the ux-design copy; Attribution kept;
  - the canvas section labelled "Graph of {title}" and described by the sr-only text.
  StageGroupNode renders an h3, the counts line (countsText from chains-model) or "No stocks",
  and hidden left/right handles. StockNode renders a Link to /stocks/:id with nodrag nopan, the
  ticker, Held badge, market, truncated name with title, THB value (thb), and the sr-only stage
  suffix. In NoPosition it is a div with the stock link and a Set position link. A link focus
  outside the viewport calls setCenter on the node (ADR-105).
  chain-graph.css imports @xyflow/react/dist/base.css and maps --xy-* to theme tokens under
  .react-flow.chain-graph. Not wired into the page yet (T-005); tested on its own.
  Covers FR-104..FR-109, NFR-103, NFR-105.
- agent: react-vite-developer
- depends_on: [T-001, T-003]
- status: backlog
- size: L
```

#### Acceptance criteria

- [ ] The component renders the nodes and edges of `buildChainGraph` with the classes and copy of ux-design.md
- [ ] No node is draggable, selectable or focusable as a React Flow node. Only the links (and Controls, Attribution) take focus.
- [ ] Only `base.css` is imported (not `style.css`). Colours come from theme tokens and switch with `.dark`.
- [ ] Focus following and `fitView` respect `prefers-reduced-motion`
- [ ] The component is a default export suitable for `React.lazy`
- [ ] All TC-U cases below pass (jsdom with the T-001 shims, `MemoryRouter`)

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1122
    scenario: stage groups and stock links render with their text
    given: chain AI & Semis with Upstream [ASML held ฿441,234.00], Midstream [TSM], Downstream []
    when: render <ChainGraph>
    then: headings Upstream, Midstream, Downstream (h3); Downstream shows "No stocks"; a link named "ASML Held ASML Holding US ฿441,234.00, Upstream" with href /stocks/<ASML id>
    test_data:
      input: as given
      expected: 3 h3, 2 stock links
  - id: TC-U-1123
    scenario: the canvas is labelled and described
    given: title "AI & Semis"
    when: render
    then: a region named "Graph of AI & Semis" whose description mentions the Lanes view
    test_data:
      input: title "AI & Semis"
      expected: getByRole('region', { name: 'Graph of AI & Semis' })
  - id: TC-U-1124
    scenario: the canvas is read-only
    given: rendered graph
    when: inspect node wrappers and fire keyDown Delete and a drag on a node
    then: no node wrapper has tabindex or the "selectable"/"draggable" classes; the node count is unchanged; no aria-describedby hint about deleting
    test_data:
      input: Delete key, pointer drag
      expected: nodes unchanged
  - id: TC-U-1125
    scenario: activating a stock link navigates
    given: MemoryRouter with routes / and /stocks/:id
    when: click the TSM link; then focus the ASML link and press Enter
    then: location is /stocks/<TSM id>, then /stocks/<ASML id>
    test_data:
      input: click, Enter
      expected: two navigations
  - id: TC-U-1126
    scenario: No position node has a Set position link
    given: NoPosition [BCP]
    when: render
    then: a link "Set position of BCP" to /stocks/<BCP id>/edit after the BCP link, and the two links are separate (not nested)
    test_data:
      input: as given
      expected: two links in DOM order
  - id: TC-U-1127
    scenario: controls are named and the interactivity toggle is absent
    given: rendered graph
    when: query buttons
    then: buttons "Zoom in", "Zoom out", "Fit to view" inside a group "Graph controls"; no "Toggle Interactivity"
    test_data:
      input: —
      expected: 3 control buttons
  - id: TC-U-1128
    scenario: a new chain refits the view
    given: rendered with chain A, fitView spied through the React Flow instance (onInit)
    when: rerender with chain B; then rerender with chain B and a different stocksById only
    then: fitView called once for B; not called again for the same chain key
    test_data:
      input: A → B → B'
      expected: { fitViewCallsAfterA: 1 }
  - id: TC-U-1129
    scenario: reduced motion turns animation off
    given: matchMedia('(prefers-reduced-motion: reduce)') matches
    when: render, then focus an off-screen stock link
    then: fitView and setCenter are called with duration 0
    test_data:
      input: reduced motion on
      expected: { duration: 0 }
  - id: TC-U-1130
    scenario: Held is text and value is exact
    given: TSM held, value "1020000.00"; AMD not held
    when: render
    then: TSM node contains the text "Held" and "฿1,020,000.00"; AMD has neither
    test_data:
      input: as given
      expected: as then
```

**Notes**: React Flow renders nodes as flat siblings, so the stage name must be in each link's
accessible name (sr-only suffix). `setCenter` keeps the current zoom
(`getViewport().zoom`). In jsdom the viewport has no real size, so TC-U-1129 checks the call
arguments, not the visual pan. Real panning is checked in E2E (T-007).

### T-005 — Graph view on /chains

```yaml
- title: View switch, chain list, graph header, lazy canvas, fallbacks and rename focus on /chains
- description: >
  Per ux-design.md §View switch, §Graph view, the state wireframes, and design.md §Components
  (views/chains.tsx, chain-list.tsx, chain-graph-view.tsx, view-switch.tsx), ADR-102, ADR-108,
  ADR-109. In views/chains.tsx: add view and chain to KEEP; render ViewSwitch (ToggleGroup,
  writes chainGraphSearch with replace); when view is graph and !useIsMobile(), render
  ChainGraphView, else the v1.0 Lanes (with the phone note when graph was asked for).
  ChainGraphView has:
  - ChainList (nav "Chains", Link replace per chain, aria-current, counts, scroll current into
    view);
  - the selected chain's card header (reuse the v1.0 header pieces; Rename with data-chain-rename);
  - Suspense with a Skeleton around React.lazy(() => import('./chain-graph'));
  - a local error boundary (Try again re-imports, Show lanes);
  - the left-out line.
  The not-in-view and bad-view notes join AddressNotes. After a rename or merge, write
  chain = chainKey(result.name) and move focus per ux-design.md (Rename button, chain heading
  after a merge, h1 when hidden). Empty states as v1.0, with the switch kept. A query-only change
  sends no request. Covers FR-101..FR-103, FR-110..FR-113, NFR-101, NFR-102, NFR-103.
- agent: react-vite-developer
- depends_on: [T-002, T-004]
- status: backlog
- size: L
```

#### Acceptance criteria

- [ ] `/chains` without `view` renders exactly the v1.0 page plus the switch; every v1.0 `/chains` test passes unchanged
- [ ] Switching view, picking a chain, and changing scope, search or filters send no request and write the address with `replace`
- [ ] `pnpm build` puts `@xyflow/react` only in the lazy graph chunk (check the build manifest: the `views/chains` chunk and the entry do not contain it), and the entry chunk size does not grow
- [ ] Below `md` the graph chunk is not imported
- [ ] Focus after rename and merge follows ux-design.md
- [ ] All TC-U cases below pass (`renderApp` with `StubApi`, `makeStock`, the v1.0 `cases-helpers.tsx` fixtures)

#### Test cases (TDD contract)

```yaml
unit:
  - id: TC-U-1131
    scenario: the switch moves between Lanes and Graph without a request
    given: StubApi counting requests; stocks in AI & Semis and Oil & Gas; /chains?scope=held
    when: press Graph, then Lanes
    then: address /chains?scope=held&view=graph, then /chains?scope=held; Graph pressed then Lanes pressed (aria-pressed); requests after load 0
    test_data:
      input: as given
      expected: { requestsAfterLoad: 0 }
  - id: TC-U-1132
    scenario: pressing the selected item keeps the view
    given: /chains?view=graph
    when: press Graph again
    then: address unchanged, Graph still pressed
    test_data:
      input: click Graph
      expected: view=graph
  - id: TC-U-1133
    scenario: the chain list marks and switches the current chain
    given: /chains?view=graph with AI & Semis (8) and Oil & Gas (4)
    when: render, then click Oil & Gas in nav "Chains"
    then: AI & Semis link has aria-current="true" first; after the click the address has chain=oil%20%26%20gas, Oil & Gas is current, the card heading is "Oil & Gas", the canvas region is "Graph of Oil & Gas"; requests after load 0
    test_data:
      input: click "Oil & Gas"
      expected: chain=oil%20%26%20gas
  - id: TC-U-1134
    scenario: a chain not in view falls back with a note
    given: /chains?view=graph&chain=ev, no EV chain
    when: render
    then: AI & Semis drawn; status note "The chosen chain is not in this view. Showing AI & Semis."; address still has chain=ev
    test_data:
      input: chain=ev
      expected: note shown, address unchanged
  - id: TC-U-1135
    scenario: a bad view shows lanes with a note
    given: /chains?view=tree
    when: render
    then: the v1.0 lanes; note 'Unknown view "tree", showing lanes.'; address unchanged
    test_data:
      input: view=tree
      expected: lanes + note
  - id: TC-U-1136
    scenario: a filter keeps the selected chain when it stays in view
    given: /chains?view=graph&chain=oil%20%26%20gas
    when: tick Market TH in the Filters sheet (Oil & Gas has TH stocks)
    then: address keeps view and chain; Oil & Gas still current
    test_data:
      input: market=TH
      expected: chain kept
  - id: TC-U-1137
    scenario: phone width shows lanes with a note and does not load the graph
    given: matchMedia max-width 767px matches; /chains?view=graph; the chain-graph module mocked to record imports
    when: render
    then: v1.0 lanes; note "The graph needs a wider screen. Showing lanes."; Graph pressed; chain-graph not imported
    test_data:
      input: mobile
      expected: { graphImported: false }
  - id: TC-U-1138
    scenario: the canvas waits with a skeleton and recovers from a load failure
    given: the lazy import rejects once, then resolves
    when: render /chains?view=graph; press Try again
    then: first the alert "The graph could not load…" with Try again and Show lanes (no RouteError); after Try again the canvas region appears
    test_data:
      input: import fails once
      expected: alert, then canvas
  - id: TC-U-1139
    scenario: Show lanes from the failure alert
    given: the lazy import rejects
    when: press Show lanes
    then: address without view; lanes shown
    test_data:
      input: click Show lanes
      expected: view removed
  - id: TC-U-1140
    scenario: rename from the graph header keeps the chain selected
    given: /chains?view=graph&chain=ai%20semis; StubApi answers POST /chains/rename { name: "AI & Semis", changed: 3, merged: false }
    when: press Rename in the graph header, type "AI & Semis", submit
    then: address chain=ai%20%26%20semis; heading "AI & Semis"; focus on the Rename button (data-chain-rename="ai & semis")
    test_data:
      input: rename to "AI & Semis"
      expected: chain updated, focus on Rename
  - id: TC-U-1141
    scenario: merge from the graph selects the merged chain and focuses its heading
    given: chains "Semis" (2) and "AI & Semis" (3); /chains?view=graph&chain=semis; StubApi answers 409 then { name: "AI & Semis", changed: 2, merged: true }
    when: rename Semis to "AI & Semis", confirm the merge
    then: address chain=ai%20%26%20semis; focus on the "AI & Semis" h2
    test_data:
      input: merge
      expected: chain=ai%20%26%20semis, focus heading
  - id: TC-U-1142
    scenario: empty states keep the switch
    given: emptyApi(); then stocks with no chain names
    when: render /chains?view=graph
    then: the v1.0 empty cards; the View switch is present; no chain list or canvas
    test_data:
      input: two datasets
      expected: switch present, no nav "Chains"
```

**Notes**: mock `./graph/chain-graph` in most page tests (a stub that lists the stock links) so
page tests stay fast. One test (TC-U-1133 or its own) renders the real component to prove the
wiring. The no-request assertions use the `StubApi` call log, as in v1.0 (TC-U-930).

### T-006 — Design test cases — value chains graph view

```yaml
- title: Design test cases — value chains graph view
- description: >
  Using the software-tester-design skill, produce structured TC-xxx test cases covering all test
  levels: unit boundaries, frontend component, and E2E flows (there is no API change, so API
  cases are limited to proving the reads and the rename are unchanged and that a query-only
  change sends no request). Run Steps 0–4 (SUT definition → business flow → field specs →
  scenarios → test data). Output must be in TC-xxx format for software-tester-automation.
  Inputs: requirements.md, design.md, ux-design.md of this slice, and v1.0's test-cases.md for
  the datasets (VC-A, VC-C). Use ids in the 1100 range (TC-C-11xx component, TC-E-11xx E2E,
  TC-A-11xx if any), after the TC-U-1100..1142 of the tasks. Must cover every FR-101..FR-113 and
  NFR-101..NFR-105, and specifically:
  - the address rules (bad view, unknown chain, chain kept across filters, Back/Forward);
  - figures equal between Lanes and Graph for every chain of VC-A;
  - the keyboard-only path (Tab through nodes with the canvas panning to each, Enter opens);
  - axe in light and dark on the Graph view;
  - the contrast points ux-design.md leaves to E2E: strong outline, arrows, graph focus ring,
    controls, attribution, current list item;
  - the lazy-chunk rule (Lanes and other routes never fetch the React Flow chunk; network log);
  - the 360 px fallback and widening back to the graph;
  - the NFR-101 timing on VC-C;
  - no third-party request from the canvas.
  Save as docs/features/value-chains/v1.1/test-cases.md.
- agent: software-tester-design
- depends_on: []
- status: backlog
- size: M
```

#### Acceptance criteria

- [ ] SUT definition documented
- [ ] TC-xxx cases cover happy path, boundaries, error paths, and business rules
- [ ] Each TC includes Level, Input, Expected Output, Preconditions, and Mock needed
- [ ] A traceability table maps every FR-101–FR-113 and NFR-101–NFR-105 to at least one TC

**Notes**: runs in parallel with the engineering tasks. It depends only on requirements and
design, not on code.

### T-007 — Automate tests — value chains graph view

```yaml
- title: Automate tests — value chains graph view
- description: >
  Using the software-tester-automation skill, convert the TC-xxx cases from T-006 into runnable
  scripts at the appropriate levels (Unit, Frontend Component, E2E). Run the full suite against
  the implementation. Component cases go in features/chains/chains-graph-cases-*.test.tsx,
  reusing cases-helpers.tsx (vcA, apiOf, serverApi). E2E specs are e2e/vcg-*.spec.ts on the
  existing Playwright setup (admin-created users, real API, local Supabase, seedChainsDataset and
  seedBigChains from e2e/lib/vc.ts):
  - draw the graph and match its figures to Lanes;
  - pick chains and use Back/Forward;
  - keyboard-only Tab and Enter, with the focused node inside the canvas box (boundingBox
    check);
  - axe in light and dark (VCG states added to e2e/lib/states.ts);
  - contrast via e2e/lib/contrast.ts;
  - a network log proving no React Flow chunk on Lanes, /stocks and /concentration, and no
    third-party host;
  - 360 px fallback and resize back;
  - NFR-101 timing on VC-C (logged, as vc-perf.spec.ts).
  Add the slice's TC ids to the report script (pnpm test:report:vc covers v1.1 too, or a new
  test:report:vcg), write docs/features/value-chains/v1.1/test-report.md, and update CLAUDE.md
  (Value chains bullet: view and chain params, features/chains/graph/, the React Flow import
  fence, the jsdom shims, the new test files).
- agent: software-tester-automation
- depends_on: [T-001, T-002, T-003, T-004, T-005, T-006]
- status: backlog
- size: L
```

#### Acceptance criteria

- [ ] All TC-* from T-006 automated and passing (findings pinned with `test.fail` and a finding id only with the owner's agreement)
- [ ] Coverage >= 70% lines for `apps/web/src/features` (gate), and >= 90% for `features/chains/graph/` (model and components)
- [ ] Test report produced with pass/fail per TC-id
- [ ] The full Investhesis gate is green

**Notes**: report "T-007 done" with the full test report when all TCs pass. Any contrast or axe
failure found here goes back to [T-004](#t-004--chaingraph-canvas-lazy-chunk) or
[T-005](#t-005--graph-view-on-chains) as a fix.

## Status Legend

| Status | Changed By | Meaning |
|--------|-----------|---------|
| `backlog` | Orchestrator | Ready, waiting to be picked up |
| `doing` | Orchestrator / Agent | Agent actively working |
| `blocked` | Agent | Stuck, needs human intervention |
| `test` | Agent | Dev done, needs testing |
| `review` | Agent / Tester | Human must review before advancing |
| `done` | Human | Approved and complete |
