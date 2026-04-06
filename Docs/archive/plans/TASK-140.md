<!-- Completed: 2026-04-06 | Commit: pending -->
# TASK-140: Enable tier breaks on DraftKings draft board

**Status:** Pending Approval

## Objective

The DraftKings adapter's `isMyRankSort()` hardcodes `return false`, which prevents tier break
badges from ever rendering on DK draft boards. DK does have a "Rank" sort — when active, the
column header gains the CSS class `BaseTable__header-cell--sorting` and its text content is
"Rank". Update `isMyRankSort()` to detect this state so the existing tier break logic in
`draft-overlay.js` renders correctly on DK.

## Verification Criteria

1. When DK draft board is sorted by "Rank", `isMyRankSort()` returns `true`
2. When DK draft board is sorted by any other column, `isMyRankSort()` returns `false`
3. Tier break badges appear on player rows when sorted by Rank and rankings data is loaded

## Verification Approach

1. `npm run build` succeeds without errors
2. Manual test on DK draft board: sort by Rank → tier badges appear; sort by another column → badges disappear

## Files to Change

- `chrome-extension/src/adapters/draftkings.js` — update `isMyRankSort()` (1 method, ~3 lines)

## Implementation Approach

Replace the hardcoded `return false` in `isMyRankSort()` with a DOM check:
find a `.BaseTable__header-cell--sorting` element whose `textContent.trim()` equals "Rank".
