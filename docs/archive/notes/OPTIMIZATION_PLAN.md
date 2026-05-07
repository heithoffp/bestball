# BestBall Manager — Performance Optimization Plan

## 1. Disabled Components

Three heavy components have been disabled in `src/App.jsx` to reduce computation load. Their source files are preserved — only imports, tab buttons, and render blocks were removed.

| Component | File | Why Disabled |
|-----------|------|-------------|
| ComboAnalysis | `src/components/ComboAnalysis.jsx` (546 lines) | O(rosters^2) QB pair matrix, 900+ cell color calculations per render |
| RosterConstruction | `src/components/RosterConstruction.jsx` (582 lines) | Full tree traversal on every search keystroke, inline styles recreated per render |
| JaccardAnalysis | `src/components/JaccardAnalysis.jsx` (200 lines) | O(players x rosters^2) triple-nested loop in `computePlayerImpact()` — up to 495K set comparisons for 100 players |

**What was changed in `App.jsx`:**
- Commented out 3 imports (lines 8-10)
- Removed 3 tab buttons (`combos`, `construction`, `jaccard`)
- Removed 3 conditional render blocks

**Files preserved (no changes):**
- `src/components/ComboAnalysis.jsx`
- `src/components/RosterConstruction.jsx`
- `src/components/JaccardAnalysis.jsx`
- `src/utils/jaccardAnalysis.js`
- `src/utils/rosterArchetypes.js` — still used by DraftFlowAnalysis and ExposureTable
- `src/utils/stackAnalysis.js` — still used by DraftFlowAnalysis and RosterViewer

**To re-enable:** Uncomment the imports and restore the tab buttons / render blocks in `App.jsx`.

---

## 2. Performance Audit — Current State

### What's Missing

| Optimization | Status |
|-------------|--------|
| `React.lazy()` / code splitting | Not used — all components in main bundle |
| `React.memo()` | Not used (except `RankingRow` in PlayerRankings) |
| Table virtualization | Not used — full DOM for all rows |
| Input debouncing | Not used — every keystroke triggers recomputation |
| Stable style objects | Not used — inline objects recreated every render |

### Remaining Component Costs

**DraftFlowAnalysis** (`src/components/DraftFlowAnalysis.jsx` — 1478 lines)
- 8 `useMemo` chains with cascading dependencies
- `candidatePlayers` memo (lines ~448-642): iterates all rosters multiple times for correlation scoring via `scoreCandidate()` and `computeCooccurrenceMetrics()`
- 16+ `useState` calls
- Stack analysis per player in filtered rosters
- **Heaviest remaining component**

**RosterViewer** (`src/components/RosterViewer.jsx` — 1341 lines)
- CLV (Career Lifetime Value) calculations per roster
- Uniqueness scoring with pairwise comparison
- Stack analysis (`analyzeStack()`) per roster
- Large render output per roster card

**PlayerRankings** (`src/components/PlayerRankings.jsx` — 636 lines)
- Drag-and-drop ranking interface
- Already uses `React.memo` on `RankingRow` (only component that does)
- Relatively well-optimized

**ExposureTable** (`src/components/ExposureTable.jsx` — 455 lines)
- Renders `AdpSparkline` (a Recharts `LineChart`) per row — up to ~1000 rows
- Full exposure recalculation on every filter/search change
- `classifyRosterPath()` called per roster entry
- Static style objects defined inside component (should be module-level)

**AdpTimeSeries** (`src/components/AdpTimeSeries.jsx` — 464 lines)
- Recharts `LineChart` with multi-player overlay
- Player list built fresh on each render cycle
- Search triggers full list rebuild

### Data Scale
- ~2,020 roster rows (~168 drafts x 12 picks)
- ~1,000 unique players in master list
- 21 ADP snapshots x ~1,372 rows each = ~28,800 ADP records
- 1,384 rankings rows, 454 projection rows

---

## 3. Prioritized Optimizations

| Priority | Optimization | Effort | Impact | Risk | Files |
|----------|-------------|--------|--------|------|-------|
| **P1** | Disable 3 heavy components | Low | High | None | `App.jsx` |
| **P2** | React.lazy + Suspense | Low | High | Low | `App.jsx` |
| **P3** | React.memo on AdpSparkline | Low | Medium | None | `AdpSparkline.jsx` |
| **P4** | Debounce search/filter inputs | Low | Medium | Low | ExposureTable, DraftFlowAnalysis, AdpTimeSeries | **DONE** |
| **P5** | Virtualize ExposureTable rows | Medium | Medium-High | Medium | `ExposureTable.jsx` |
| **P6** | Extract inline styles to module scope | Low | Low | None | All components |
| **P7** | Web Worker for DraftFlow scoring | High | Medium | High | Future |

---

## 4. Implementation Details

### P1: Disable Heavy Components *(DONE)*
Already implemented — see Section 1 above.

### P2: React.lazy + Suspense *(DONE)*

**What:** Convert remaining 5 tab imports from static to dynamic using `React.lazy()`.

**Why:** Only one tab renders at a time. Lazy loading means the browser only downloads/parses the code for the active tab. Recharts (the heaviest dependency) will be split into a separate chunk automatically.

**Changes in `App.jsx`:**
```jsx
// Replace static imports:
// import ExposureTable from './components/ExposureTable';
// import DraftFlowAnalysis from './components/DraftFlowAnalysis';
// etc.

// With lazy imports:
const ExposureTable = React.lazy(() => import('./components/ExposureTable'));
const AdpTimeSeries = React.lazy(() => import('./components/AdpTimeSeries'));
const DraftFlowAnalysis = React.lazy(() => import('./components/DraftFlowAnalysis'));
const RosterViewer = React.lazy(() => import('./components/RosterViewer'));
const PlayerRankings = React.lazy(() => import('./components/PlayerRankings'));

// Wrap tab content area:
<Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading tab...</div>}>
  {activeTab === 'exposures' && <ExposureTable ... />}
  {/* ... other tabs ... */}
</Suspense>
```

**Risk:** First tab switch has a brief loading flash. Mitigated by the fallback UI.

### P3: React.memo on AdpSparkline *(DONE)*

**What:** Wrap `AdpSparkline` component in `React.memo()`.

**Why:** ExposureTable renders one `AdpSparkline` per player row (~1000 rows). Each sparkline instantiates a Recharts `LineChart`. When the user types in the search box or changes a filter, every sparkline re-renders even though the `history` data hasn't changed. `React.memo` prevents this — the `history` prop is a stable array from `masterPlayers`.

**Change in `src/components/AdpSparkline.jsx`:**
```jsx
// Change:
export default AdpSparkline;
// To:
export default React.memo(AdpSparkline);
```

### P4: Debounce Search/Filter Inputs *(DONE)*

**What:** Add 200-300ms debounce to text inputs that drive expensive `useMemo` chains.

**Why:** Currently every keystroke triggers full recomputation. With debouncing, the computation only runs after the user pauses typing.

**Affected components:**
- `ExposureTable.jsx` — `setSearch(e.target.value)` feeds `filteredAndSorted` memo (~1K players)
- `DraftFlowAnalysis.jsx` — `searchQuery` state triggers `searchResults` memo over all rosters
- `AdpTimeSeries.jsx` — `query` state for player search list

**Pattern (no external dependency needed):**
```jsx
const [searchInput, setSearchInput] = useState('');
const [search, setSearch] = useState('');

useEffect(() => {
  const timer = setTimeout(() => setSearch(searchInput), 250);
  return () => clearTimeout(timer);
}, [searchInput]);

// In JSX: onChange={e => setSearchInput(e.target.value)} value={searchInput}
// In useMemo dependencies: use `search` (debounced), not `searchInput`
```

### P5: Virtualize ExposureTable Rows *(DONE)*

**What:** Use `@tanstack/react-virtual` to only render visible table rows instead of all ~1000.

**Why:** Even with React.memo on sparklines and debounced search, the DOM itself is heavy with 1000 `<tr>` elements. Virtualization reduces rendered rows to ~30-40 at any time.

**Approach:**
1. `npm install @tanstack/react-virtual`
2. Replace `<tbody>` with a virtualized container using `useVirtualizer`
3. Each row height is ~40px (predictable with `table-layout: fixed`)
4. The `filteredAndSorted` array becomes the data source

**Considerations:**
- `@tanstack/react-virtual` works with any container element (unlike `react-window` which requires `<div>`)
- Horizontal scrolling (`overflowX: auto`) remains on the outer container
- Sticky header may need adjustment

### P6: Extract Inline Styles

**What:** Move static style objects from inside components to module-level constants.

**Why:** Every render creates new object references (e.g., `cellBaseStyle`, `headerStyle`), which prevents React from short-circuiting DOM style updates. Moving them to module scope makes them referentially stable.

**Affected components:** ExposureTable (partially does this already), DraftFlowAnalysis (most inline styles), RosterViewer.

**For dynamic styles** (e.g., `borderLeft: \`4px solid ${posColor}\``), use a memoized factory or CSS classes instead.

### P7: Web Worker for DraftFlow Scoring (Future)

**What:** Offload `candidatePlayers` computation to a Web Worker.

**Why:** The scoring iterates all rosters with co-occurrence metrics per candidate — blocking the UI thread during interaction.

**Why deprioritized:** The computation is already memoized via `useMemo` and only recalculates when `currentPicks`/`draftSlot`/`masterPlayers` change. The real cost is initial load + first interaction. A Web Worker adds significant complexity (data serialization, async state) for a guarded computation.

**If pursued:** Use `Comlink` or raw `Worker` + `postMessage`. Transfer `allRosters`, `playerIndexMap`, and `strategyPools` to the worker. Return `finalCandidates`.

---

## 5. Verification

### After P1 (Disable Components)
- Run `npm run dev` — app loads with 5 tabs (Exposures, ADP Time Series, Draft Flow, Rosters, Rankings)
- No console errors related to missing components
- Source files for disabled components are untouched

### After P2 (React.lazy)
- Network tab shows separate chunks loaded on tab switch
- First tab loads instantly (no flash)
- Subsequent tab switches show brief "Loading tab..." then content

### After P3 (React.memo)
- Open ExposureTable, type in search box
- React DevTools Profiler: AdpSparkline components should NOT re-render when search text changes (only filtered-out rows unmount)

### After P4 (Debounce)
- Type rapidly in search — no lag/jank during typing
- Results update ~250ms after typing stops
- No visible delay for short queries

### After P5 (Virtualization)
- Scroll ExposureTable — smooth scrolling
- DOM inspector: only ~30-40 `<tr>` elements in DOM at any time
- Search/filter still works correctly with virtualized list

### General
- `npm run build` completes without errors
- `npm run lint` passes
- Browser DevTools Performance tab: measure before/after for initial load and tab switching
- Lighthouse Performance score comparison
