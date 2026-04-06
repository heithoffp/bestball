<!-- Completed: 2026-04-06 | Commit: pending -->
# TASK-141: Multi-platform ADP foundation — split pipeline by platform

**Status:** Pending Approval
**Priority:** P1

---

## Objective
Split the ADP loading and processing pipeline so Underdog and DraftKings snapshots are tracked as separate platform-tagged streams, enabling downstream components to consume platform-specific ADP data independently.

## Verification Criteria
1. `loadBundledAdp()` returns files with a `platform` field (`"underdog"` or `"draftkings"`) parsed from the filename prefix.
2. `processLoadedData()` returns `adpSnapshots` where each snapshot has a `platform` field.
3. `processLoadedData()` returns separate per-platform lookups: `adpByPlatform` — an object keyed by platform name, each value containing `{ snapshots, latestAdpMap, latestRows }`.
4. `masterPlayers[].history` entries gain a `platform` field so consumers know which timeline each data point belongs to.
5. Existing behavior is preserved: the app loads, all tabs render, no regressions. The "latest ADP" used for adpMap/CLV/rankings defaults to the most recent snapshot across all platforms (same behavior as before) unless a component opts into platform-specific data.
6. `npm run build` succeeds with no errors.

## Verification Approach
1. Run `npm run build` from `best-ball-manager/` — expect clean build, no errors.
2. Run `npm run dev` and manually verify:
   - Dashboard loads with player data
   - ADP Tracker shows timeseries lines
   - Roster Viewer shows CLV values
   - Player Rankings loads initial list
3. Add a `console.log` temporarily in App.jsx to inspect `adpSnapshots` and confirm platform tags are present on each snapshot. Verify both `"underdog"` and `"draftkings"` appear.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/App.jsx` | Modify | `loadBundledAdp()` extracts platform from filename prefix; pass `adpByPlatform` to state |
| `best-ball-manager/src/utils/dataLoader.js` | Modify | Tag snapshots with platform; build per-platform lookup object `adpByPlatform`; return it alongside existing fields |
| `best-ball-manager/src/utils/helpers.js` | Modify | `processMasterList()` tags history entries with platform |

## Implementation Approach

### Step 1: Extract platform in `loadBundledAdp()` (App.jsx)
In `loadBundledAdp()`, parse the platform from the filename prefix before the date. Convention:
- `underdog_adp_YYYY-MM-DD.csv` → `"underdog"`
- `draftking_adp_YYYY-MM-DD.csv` → `"draftkings"`

Add a `platform` field to each returned file object: `{ text, date, filename, platform }`.

Use regex: `/(underdog|draftking)_adp_/` → map `"draftking"` to `"draftkings"` for display consistency. Default to `"unknown"` if prefix doesn't match.

### Step 2: Tag snapshots in `processLoadedData()` (dataLoader.js)
When parsing snapshots from `adpFiles`, carry the `platform` field through:
```js
return { date, fileName: filename, rows, rawText: text, platform: file.platform };
```

Build a `adpByPlatform` object after sorting snapshots:
```js
const adpByPlatform = {};
for (const snap of snapshots) {
  const p = snap.platform || 'unknown';
  if (!adpByPlatform[p]) adpByPlatform[p] = { snapshots: [], latestAdpMap: {}, latestRows: [] };
  adpByPlatform[p].snapshots.push(snap);
}
// For each platform, set latestAdpMap and latestRows from that platform's most recent snapshot
for (const [p, data] of Object.entries(adpByPlatform)) {
  const latest = data.snapshots[data.snapshots.length - 1];
  // Build latestAdpMap using same field-resolution logic as existing code
  data.latestRows = latest.rows;
  data.latestAdpMap = buildAdpMapFromRows(latest.rows);
}
```

Extract the existing adpMap-building logic from lines 72-94 into a reusable helper `buildAdpMapFromRows(rows)` to avoid duplication.

The existing `localAdpMap` / `teamLookup` / `projPointsMap` continue to use the global latest snapshot (most recent across all platforms) — preserving backward compatibility.

Return `adpByPlatform` alongside existing return fields.

### Step 3: Tag history entries in `processMasterList()` (helpers.js)
Each history entry already has `{ date, adpPick, adpDisplay }`. Add `platform` from the snapshot:
```js
const history = snapshotLookups.map(snapObj => {
  const e = snapObj.lookup.get(normName);
  return {
    date: snapObj.date,
    platform: snapObj.platform || 'unknown',
    adpPick: e?.parsedAdp?.pick ?? null,
    adpDisplay: e?.parsedAdp?.display ?? '-'
  };
});
```

This requires carrying `platform` through the `snapshotLookups` array — add `platform: snap.platform` to the objects built in the `.map()` chain.

### Step 4: Wire state in App.jsx
Add `adpByPlatform` to App state:
```js
const [adpByPlatform, setAdpByPlatform] = useState({});
```

Update `applyResult()` and the authenticated empty-state path to set it from `result.adpByPlatform`.

Pass `adpByPlatform` as a prop to components that will use it in future tasks (TASK-142, 143, 144). For now, just thread it through without any component consuming it yet.

### Edge Cases
- Only one platform has snapshots (e.g., no DK files yet for a user) — `adpByPlatform` will have one key, everything works.
- Filename doesn't match known prefix — defaults to `"unknown"` platform, still processed.
- DraftKings CSV has `Name` (single column) instead of `firstName`/`lastName` — already handled by existing permissive field matching in dataLoader and helpers (`row['Player Name'] || row.player_name || row.Player`). The DK CSV uses `Name` which maps to `row.Name` — need to add `row.Name` to the name resolution fallback chain.

### Step 5: Add `row.Name` to name resolution
DraftKings CSVs use a `Name` column header. Add `row.Name` to the name resolution chain in:
- `dataLoader.js` lines 74, 99, 113, 152 (the `name` variable building)
- `helpers.js` line 75 (snapshot lookup name candidate)

This ensures DK rows are matched correctly.

## Dependencies
None

## Open Questions
- DraftKings ADP has no `projectedPoints` — for now, skip projection backfill for DK-only players. Cross-platform backfill can be a follow-up if needed.
- The `Name` field handling for DK could also include `row.Player` which is already in the chain — verify the DK header is exactly `Name` (confirmed from CSV inspection: `ID,Name,Position,ADP,Team`).

---
*Approved by: <!-- developer name/initials and date once approved -->*
