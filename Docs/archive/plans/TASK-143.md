<!-- Completed: 2026-04-06 | Commit: pending -->
# TASK-143: Platform-aware CLV calculation

**Status:** Done
**Priority:** P1

---

## Objective

Expose which ADP platform (UD or DK) is being used for each roster entry's CLV calculation, and show a small platform label next to the CLV value in RosterViewer. The CLV math itself is already platform-aware (TASK-146 made `latestADP` use platform-specific ADP maps); this task surfaces that fact to the user.

## Verification Criteria

1. Each enriched player in `rosterData` has an `adpPlatform` field: `'underdog'`, `'draftkings'`, or `'global'` (fallback for CSV imports without a detectable slateTitle).
2. Each roster entry object in RosterViewer's `rosters` useMemo has an `adpPlatform` field derived from its players.
3. Desktop table: a small muted label "UD" or "DK" appears after the CLV value in the Avg CLV column for entries where `adpPlatform` is known. No label for `'global'`.
4. Mobile card: same label appears next to the CLV stat value.
5. Entries imported via CSV without a slateTitle continue to show CLV with no platform label — fallback behavior preserved.
6. `npm run build` from `best-ball-manager/` succeeds with no errors.

## Verification Approach

Steps Claude can run:
1. `cd best-ball-manager && npm run build 2>&1 | tail -20` — expect zero errors.

Steps requiring the developer:
2. Load the app with both UD and DK entries synced. Open Rosters tab. Confirm:
   - UD entries show "UD" label next to CLV value.
   - DK entries show "DK" label next to CLV value.
3. Load CSV-only rosters (no platform slateTitle). Confirm CLV shows with no platform label.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/utils/dataLoader.js` | Modify | Add `adpPlatform` field to each enriched player in `enrichedRosters` |
| `best-ball-manager/src/components/RosterViewer.jsx` | Modify | Derive `adpPlatform` per entry; render platform label next to CLV in desktop table and mobile card |

## Implementation Approach

### Step 1: `dataLoader.js` — expose `adpPlatform` on each player

Added `adpPlatform: detectedPlatform || 'global'` to the enriched player return object. `detectedPlatform` was already computed via `detectPlatformFromSlate(player.slateTitle)` but not stored.

### Step 2: `RosterViewer.jsx` — derive entry platform in `rosters` useMemo

```js
const adpPlatform = players.find(p => p.adpPlatform !== 'global')?.adpPlatform || 'global';
return { entry_id, players: annotatedPlayers, avgCLV, posSnap, count, path, draftDate, tournamentTitle, slateTitle, projectedPoints, adpPlatform };
```

### Step 3: `RosterViewer.jsx` — render platform label

Added `clvPlatformLabel()` helper returning `'UD'`, `'DK'`, or `null`. Rendered as a small muted `<span>` after the CLV value in both desktop table and mobile card.

### Edge Cases
- Entries without a recognizable slateTitle (CSV import) → `adpPlatform: 'global'` → no label shown.
- Mixed-platform portfolios → each row independently shows its own label.

## Dependencies

- TASK-141 (multi-platform ADP foundation) — Done
- TASK-146 (platform-aware latestADP enrichment) — Done

---
*Approved by: developer, 2026-04-06*
