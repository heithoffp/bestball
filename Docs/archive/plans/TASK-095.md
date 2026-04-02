<!-- Completed: 2026-04-02 | Commit: 26c7181 -->
# TASK-095: Fix RB_DOUBLE_ANCHOR color clash and missing filter options

**Status:** Done
**Priority:** P3

---

## Objective

Fix two issues introduced by TASK-094: (1) `RB_DOUBLE_ANCHOR` amber `#f59e0b` is too visually similar to `RB_HYPER_FRAGILE` yellow `#eab308`; (2) the hardcoded `RB_OPTIONS` arrays in ExposureTable and RosterViewer omit `RB_DOUBLE_ANCHOR`, so it never appears in archetype pill filters.

## Verification Criteria

- `RB_DOUBLE_ANCHOR` and `RB_HYPER_FRAGILE` are visually distinct colors in the UI.
- The RB archetype filter in ExposureTable includes a `Double Anchor` pill option.
- The RB archetype filter in RosterViewer includes a `Double Anchor` pill option.
- No other archetype filter options are changed.

## Verification Approach

Read the three updated files and confirm:
1. `rosterArchetypes.js` — `RB_DOUBLE_ANCHOR` color in both `PROTOCOL_TREE` and `ARCHETYPE_METADATA` is changed from `#f59e0b` to the new value.
2. `ExposureTable.jsx` line ~57 — `RB_OPTIONS` contains `'RB_DOUBLE_ANCHOR'`.
3. `RosterViewer.jsx` line ~236 — `RB_OPTIONS` contains `'RB_DOUBLE_ANCHOR'`.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/utils/rosterArchetypes.js` | Modify | Change RB_DOUBLE_ANCHOR color from `#f59e0b` to `#f43f5e` (rose) in both PROTOCOL_TREE and ARCHETYPE_METADATA |
| `best-ball-manager/src/components/ExposureTable.jsx` | Modify | Add `'RB_DOUBLE_ANCHOR'` to `RB_OPTIONS` array |
| `best-ball-manager/src/components/RosterViewer.jsx` | Modify | Add `'RB_DOUBLE_ANCHOR'` to `RB_OPTIONS` array |

## Implementation Approach

**Color:** Change `#f59e0b` → `#f43f5e` (rose-500) in both places in `rosterArchetypes.js`. Rose is clearly distinct from Hyper Fragile's yellow and not used by any other archetype.

**ExposureTable:** `RB_OPTIONS` at line 57 — insert `'RB_DOUBLE_ANCHOR'` between `'RB_HERO'` and `'RB_HYPER_FRAGILE'` to keep RB archetypes in a logical order (zero capital → hero → double anchor → hyper fragile → balanced).

**RosterViewer:** Same insertion at line 236.

## Dependencies

TASK-094 (complete)

---
*Approved by: Patrick 2026-04-02*
