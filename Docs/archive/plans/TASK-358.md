<!-- Completed: 2026-07-21 | Commit: 5570236 -->
# TASK-358: Add Avg Adv % column to Exposures tab

**Status:** Pending Approval
**Priority:** P3

---

## Objective

Show a per-player **Avg Adv %** on the Exposure table — the mean pod-exact advance
rate across the rosters (entries) that player appears on. Reuse the prewarmed
`podAdvanceStore` cache (keyed by `entry_id`), narrow the player-name column to make
room, add a sort option and a mobile card stat. Average only over rosters where the
advance rate is defined (non-null); show `—` when none. Parallels TASK-268 (Avg CLV
column) in both plumbing and presentation.

## Verification Criteria

1. On the Exposures tab (with captured draft boards present), each drafted player shows
   an **Avg Adv %** value equal to the mean of the per-roster Adv % (as seen in the
   Roster Viewer) across that player's rosters; a player whose rosters have no modeled
   advance rate shows `—`.
2. The value **respects the archetype/tournament filters** (recomputes over the filtered
   roster set, exactly like Exposure % and Avg CLV), and the new **"Avg Adv %" sort
   option** orders players by it (nulls sink to the bottom of the descending view).
3. The player-name column is visibly **narrower** to accommodate the new column, the
   desktop table has no horizontal overflow, and the mobile card shows an **Adv** stat.

## Verification Approach

- **Automated:**
  - `cd best-ball-manager && npm run lint` — no new errors.
  - `npm run build` — production build succeeds.
- **Manual (developer, in the running app — `npm run dev`):**
  1. Open **Rosters** first (or wait for prewarm), then **Exposures**. Confirm a drafted
     player's Avg Adv % equals the average of that player's per-roster Adv % values from
     the Roster Viewer (spot-check one player across 2-3 rosters).
  2. Confirm the value streams in (may briefly show `—` then fill as the worker/cache
     resolves), and that a player on rosters with **no captured board** shows `—`.
  3. Apply an archetype filter (e.g. RB Zero) and a tournament filter — confirm Avg Adv %
     recomputes for the filtered set.
  4. Click the **Avg Adv %** header (and the mobile sort dropdown) — confirm sorting both
     directions, nulls at the bottom on descending.
  5. Resize / check mobile card layout — name column narrower, no overflow, Adv stat shown.

## Files to Change

| File | Change |
|------|--------|
| `best-ball-manager/src/App.jsx` | Pass `adpByPlatform`, `actuals={weeklyActuals}`, `demoMode={isUsingDemoData}` to `<ExposureTable>` (line ~603). |
| `best-ball-manager/src/components/ExposureTable.jsx` | Consume podAdv cache; accumulate per-player avg advance in the exposure `useMemo`; add sort option, desktop column, and mobile card stat. |
| `best-ball-manager/src/components/ExposureTable.module.css` | Narrow `.colName`, add `.colAdvance`, rebalance widths (desktop + the tablet `@media` block). |

## Implementation Approach

**1. App.jsx — feed the data the version key needs.**
`ExposureTable` needs `adpByPlatform`, `actuals`, and `demoMode` to build the same
`podAdvVersionKey` the Roster Viewer and prewarm use. Add those three props to the
`<ExposureTable ... />` render (line ~603). No compute is triggered here — the App-level
`prewarmRosterModels` already fetches boards and computes/persists advance odds; Exposures
is a pure **consumer** of the shared cache.

**2. ExposureTable.jsx — subscribe to the cache (read-only).**
Mirror the Roster Viewer's subscription, minus the compute effect:
- Import `podAdvVersionKey, getMemoPodAdv, hydratePodAdv, subscribePodAdv` from
  `../utils/podAdvanceStore`, and `advanceLabel` from `../utils/advanceModel`.
- Accept `adpByPlatform = {}, actuals = null, demoMode = false` props.
- `const podAdvVersion = useMemo(() => podAdvVersionKey(adpByPlatform, actuals, demoMode ? 'demo' : 'real'), [...])`.
- `advByEntry` state seeded from `getMemoPodAdv(podAdvVersion)`; a `useEffect` re-seeds on
  version change, subscribes via `subscribePodAdv` (merging batches into state), and calls
  `hydratePodAdv` once when the memory cache is empty so a fresh reload fills in. Keys are
  normalized to `String` for lookup safety.

**3. Per-player average in the exposure `useMemo`.**
The existing memo already iterates the **filtered** roster set (`{ id, roster, path }`,
where `id` is the `entry_id`). For each roster, read `adv = advByEntry[String(id)]`; when
`adv != null`, add it to a per-player `advSum`/`advCount` (accumulated on the same
`playerCounts[key]` object as `count`/`clvSum`). Emit
`avgAdvance = advCount > 0 ? advSum / advCount : null` into `exposures[nameKey]`, and add
`advByEntry` to the memo's dependency array so values recompute as odds stream in. Thread
`avgAdvance` through `playersWithFilteredExposure`.

**4. Sort + render.**
- Add `{ value: 'advance', label: 'Avg Adv %' }` to `SORT_OPTIONS`; in `compare()`, sort by
  `avgAdvance` with `null → NEGATIVE_INFINITY` (sinks to the bottom on the default descending
  view), matching the existing CLV branch.
- **Desktop:** add a `<col className={styles.colAdvance} />`, a sortable header
  ("Avg Adv %"), and a right-aligned cell rendering `advanceLabel(p.avgAdvance)` (text +
  color). Update the empty-state `colSpan` counts (8→9 / 9→10). Coloring uses `advanceLabel`'s
  default baseline — an aggregate across mixed pod structures, so a fixed baseline is the
  pragmatic choice (documented in a code comment).
- **Mobile:** add an "Adv" stat to `cardRow2` alongside Exp / Count / ADP / CLV.

**5. CSS widths.**
Narrow `.colName` (20% → ~14%) and add `.colAdvance` (~9%); keep the desktop row summing to
~100%. Add a `.colAdvance` width to the tablet `@media` block (line ~343) and re-balance
there too.

## Notes / Risks

- **Data availability:** Avg Adv % populates only for rosters with a captured draft board;
  users without captures will see `—`. This is inherent to the metric (identical to the
  Roster Viewer's Adv % column) — not a bug.
- **Design principle:** advance rate is a model-computed number; Vision_and_Scope confines
  computed opinions to Draft Assistant + Roster Viewer. This surfaces an *aggregate* of an
  existing metric as portfolio state on a mirror tab. Flagged for the developer's call; no
  ADR proposed unless the developer views it as a scope shift.
