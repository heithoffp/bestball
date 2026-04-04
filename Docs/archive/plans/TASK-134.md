<!-- Completed: 2026-04-04 | Commit: c17767c -->
# TASK-134: Roster Viewer — rename Uniqueness to Early Combo Rate with tooltip and 1-decimal display

**Status:** Done
**Priority:** P3

---

## Objective

Polish the uniqueness column in Roster Viewer: rename it to "Early Combo Rate", add a hover tooltip explaining the metric, consolidate "/ 1M" into the column header so cells don't repeat it, and switch from integer rounding to one decimal place (enabling true "0.0" for never-seen combos vs "0.2" for rare ones).

## Verification Criteria

1. Column header reads `Early Combo Rate / 1M`.
2. Hovering the column header shows a tooltip: "Expected occurrences of this roster's first-4-round player combo per 1 million simulated drafts".
3. Cell values display one decimal place with no "per 1M" suffix — e.g. `0.0`, `0.2`, `1.4`, `17.5`.
4. A combo never seen in simulation shows `0.0` (not `< 1 per 1M`).
5. Sort dropdown option label reads `Early Combo Rate`.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/RosterViewer.jsx` | Modified | `formatUniqueness`, column `<th>`, and `SORT_OPTIONS` label |

## Dependencies

TASK-128 — Done.

---
*Approved by: developer*
