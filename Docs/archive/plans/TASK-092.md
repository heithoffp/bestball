<!-- Completed: 2026-04-02 | Commit: 26c7181 -->
# TASK-092: Fix PlayerRankings tab performance — drag render, adpLookup dep, measureElement, handleDragEnd

**Status:** Done
**Priority:** P2

---

## Objective

Fix four identified performance regressions in `PlayerRankings.jsx` that cause lag on scroll, jank on drag start, and stale-state resets when navigating back to the tab.

## Verification Criteria

1. Dragging a row does not cause a visible frame-rate drop or stutter (no full DOM mount of 400+ nodes on drag start).
2. Navigating away and back to the Rankings tab does not reset the ranking order if `masterPlayers` refreshed in the background.
3. Smooth scroll performance throughout the list with no layout-thrash artifacts.
4. `handleDragEnd` does not create a new function reference on every `rankedPlayers` change.

## Verification Approach

1. Run `npm run build` — confirm zero lint/build errors.
2. Open dev server, load a rankings CSV with 200+ players.
3. Grab a row and drag it — confirm no visible stutter on drag start.
4. Switch to another tab, then back to Rankings — confirm order is preserved.
5. Scroll the full list top-to-bottom — confirm no layout jumps.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/PlayerRankings.jsx` | Modify | Four targeted fixes (see Implementation Approach) |

## Implementation Approach

### Fix 1 — Remove full DOM render during drag (Critical)

**Location:** `renderDesktopTable` (line ~672) and `renderMobileCards` (line ~773).

Current code renders ALL `flatItems` when `isDragActive` is true, bypassing the virtualizer. Replace with a dynamic `overscan` approach:

1. Pass `isDragActive` into `useVirtualizer` config and use `overscan: isDragActive ? 80 : 10`.
2. Remove the `isDragActive ? flatItems.map(...) : virtualItems` branches in both render functions — always use `virtualItems` (now `rowVirtualizer.getVirtualItems()`).
3. Remove the top/bottom spacer `<tbody>`/`<div>` guards that are conditioned on `!isDragActive` — keep them unconditionally since the virtualizer always runs.

**Why 80 overscan works:** dnd-kit only needs sortable items that are near the drag point to be mounted for collision detection. Rendering 80 items above and below the viewport covers any realistic drag distance without mounting the full list.

### Fix 2 — Isolate `adpLookup` from the rankings seed effect

**Location:** `useEffect` at line ~347, deps `[initialPlayers, adpLookup]`.

`adpLookup` is recomputed whenever `masterPlayers` changes (e.g., background data refresh). Because it's in the effect deps, this wipes and re-sorts `rankedPlayers` every time.

Fix: Add `prevInitialPlayersRef` — gate the seed on `initialPlayers` identity change only. Remove `adpLookup` from the effect deps entirely.

### Fix 3 — Remove dynamic `measureElement` refs; use fixed row heights

**Location:** `SortableRow` (line ~156), `SortableCard`, and tier-divider wrappers in both render functions.

Removed all `ref={isDragActive ? null : rowVirtualizer.measureElement}` and `ref={measureRef}` props. Using fixed `estimateSize`: tier-dividers 36px desktop / 28px mobile; player rows 44px desktop / 60px mobile.

### Fix 4 — Remove `rankedPlayers` from `handleDragEnd` deps

Rewrote using functional updater pattern — all reads via `prev` snapshot inside `setRankedPlayers`. Deps array is now `[]`.

## Dependencies

None.

---
*Approved by: Patrick 2026-04-02*
