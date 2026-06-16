# TASK-268: Add Avg CLV column to Exposures tab

**Status:** Approved (developer auto-approved)
**Priority:** P3

---

## Objective

Add an "Avg CLV" column to the Exposures tab. For each player, Average CLV = the mean of
`calcCLV(pick, latestADP, alpha=0.5)` across all roster entries that player appears on,
respecting the active archetype/tournament filters (same filtered roster set used for the
Exposure % calculation). CLV math is reused verbatim from the Rosters tab via
`utils/clvHelpers.js` (`calcCLV` / `clvLabel`). The column is sortable on the desktop table
and shown on the mobile player card, colored via `clvLabel()`.

## Verification Approach

- `npm run lint` passes with no new errors.
- `npm run dev`, open `/exposures` with demo data (Try Demo):
  - New "Avg CLV" column appears between ADP and ADP Trend on desktop, with colored
    percentage values matching the Rosters tab color scale; players with no valid picks
    show "N/A".
  - Clicking the "Avg CLV" header sorts ascending/descending; sort persists with archetype
    and tournament filters applied (avg recomputes for the filtered roster set).
  - Mobile card shows a "CLV" stat alongside Exp/Count/ADP.
  - Spot-check one player: average of that player's per-roster CLV (visible in the Rosters
    tab player detail) equals the value shown in Exposures.

## Files to Change

| File | Change |
|------|--------|
| `best-ball-manager/src/components/ExposureTable.jsx` | Import `calcCLV`/`clvLabel`; accumulate per-player CLV in the `playerExposures` memo; expose `avgCLV` on each player row; add sortable desktop column, mobile card stat, and `clv` sort option/compare. |
| `best-ball-manager/src/components/ExposureTable.module.css` | Add `.colClv` width and rebalance column widths (desktop + tablet). |

## Implementation Approach

1. In the `playerExposures` memo, while iterating each filtered roster's players, compute
   `calcCLV(player.pick, player.latestADP, 0.5)` and accumulate sum + count of non-null
   values per `canonicalName` key. Derive `avgCLV = sum/count` (null when count is 0).
2. Surface `avgCLV` on each entry in `playersWithFilteredExposure`.
3. Add `clv` to `SORT_OPTIONS`; handle it in `onSort` (default desc) and the `compare`
   function (null sorts last).
4. Render a new `Avg CLV` `<th>`/`<td>` (and `<col>`) between ADP and ADP Trend using
   `clvLabel(avgCLV)` for text + color. Update the empty-state `colSpan` counts.
5. Add a CLV stat to the mobile card row.
6. Add `.colClv` to the CSS module and adjust widths so the row still sums sensibly.

## Rollback Approach

Revert the commit; the column is additive and isolated to `ExposureTable.*`.
