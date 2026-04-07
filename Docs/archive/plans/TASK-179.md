<!-- Completed: 2026-04-07 | Commit: e669b5f -->
# TASK-179: Fix visual issues noticed during screenshot review

**Status:** Done
**Priority:** P2

---

## Objective

Fix three cosmetic visual issues identified during the TASK-166 screenshot review: blind spot players in the Dashboard showing gray instead of position color, the Position column header being clipped in the Exposures tab, and QB names wrapping to two lines in the Combo Analysis Stack Profiles table.

## Verification Criteria

1. In the Dashboard "Exposure by ADP Round" section, blind spot player names (0% exposure) display in their position color (e.g. QB = purple, WR = blue, RB = green, TE = orange) rather than gray.
2. In the Exposures tab, the "Pos" column header is fully visible and not clipped at any common viewport width.
3. In the Combo Analysis Stack Profiles table, the QB column is wide enough that a typical full "FirstName LastName" fits on a single line.

## Verification Approach

Developer visual check:
1. Load the app with roster data.
2. Navigate to Dashboard → confirm blind spot names show position color (look for rounds with 0% players).
3. Navigate to Exposures tab → confirm "Pos" header text and sort arrow are fully visible.
4. Navigate to Combo Analysis → Stack Profiles → confirm QB column shows full names on one line without wrapping.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/Dashboard.jsx` | Modify | Change blind spot name color from hardcoded `#6b7280` to `POS_COLORS[p.position]` |
| `best-ball-manager/src/components/ExposureTable.module.css` | Modify | Increase `.colPos` from 5% to 7%, decrease `.colTeam` from 15% to 13% |
| `best-ball-manager/src/components/ComboAnalysis.jsx` | Modify | Increase QB SortHeader width from 180 to 220 |

## Implementation Approach

**Fix 1 — Dashboard blind spot colors (`Dashboard.jsx` ~line 350)**

In the `r.blindSpots.map(p => ...)` block, the player name `<span>` currently uses `color: '#6b7280'`. Replace with `color: POS_COLORS[p.position] || 'var(--text-primary)'` — the same pattern used for highest/lowest player names on surrounding lines. Leave the `0%` text gray (`color: '#6b7280'`) as a subtle contrast to indicate zero exposure while the name itself communicates position.

**Fix 2 — Exposures Position column width (`ExposureTable.module.css` line 142–144)**

The table uses `tableLayout: 'fixed'` and `<colgroup>` to control widths. `.colPos` at 5% is too narrow for "Pos ↑". Change to 7% and reduce `.colTeam` from 15% to 13% to keep the total at 100%. Also update the mobile breakpoint at line 340 from `8%` to `9%` and `.colTeam` from `12%` to `11%` to maintain balance.

**Fix 3 — Combos QB column width (`ComboAnalysis.jsx` line 446)**

The `SortHeader` component renders a `<th>` with an inline `width` style. Change `width={180}` to `width={220}` so a typical NFL QB name ("Patrick Mahomes", "Lamar Jackson") fits without wrapping.

## Dependencies

None

---
*Approved by: developer, 2026-04-07*
