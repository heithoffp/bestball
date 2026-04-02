<!-- Completed: 2026-04-01 | Commit: pending -->
# TASK-054: Dashboard — enhance Exposure by ADP Round to surface blind spots

**Status:** Approved
**Priority:** P3

---

## Objective

Enhance the Lowest cell in the Exposure by ADP Round widget to surface multiple players at 0% exposure per round, ordered by ADP. If no players have 0% exposure in a round, fall back to the single lowest-exposure player (current behavior).

## Dependencies

None

## Verification Criteria

1. Rounds with 0%-exposure players show up to 3 of them in the Lowest cell, ordered by ADP.
2. Rounds with no 0%-exposure players fall back to showing the single lowest non-zero player (current behavior).
3. 0%-exposure entries render "0%" visually distinct (muted color) from non-zero entries.
4. The Highest column and overall grid layout are unchanged.

## Verification Approach

- Run `npm run build` from `best-ball-manager/` — no errors.
- Visually confirm: rounds with unowned top-ADP players show multiple stacked entries; rounds without show single lowest as before.

## Files to Change

- `best-ball-manager/src/components/Dashboard.jsx` — update `exposureByRound` useMemo to compute `blindSpots` (up to 3 players at count=0, sorted by adpPick); update JSX Lowest cell to render them stacked
- `best-ball-manager/src/components/Dashboard.module.css` — ensure Lowest cell stacks multiple entries vertically

## Implementation Approach

1. In `exposureByRound` useMemo, for each round compute `blindSpots`: filter `inRound` where `count === 0`, sort by `adpPick` asc, take up to 3.
2. If `blindSpots.length > 0`, set `lowest` to null. Otherwise keep existing `lowest` and set `blindSpots: []`.
3. In JSX Lowest cell: if `blindSpots` non-empty, map them as stacked player entries with "0%" in muted gray. Otherwise render existing single `lowest` entry.
