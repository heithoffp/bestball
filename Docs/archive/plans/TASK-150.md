<!-- Completed: 2026-04-06 | Commit: f914fa9 -->
# TASK-150: Gate ADP Tracker behind Pro tier

**Status:** Done
**Priority:** P2

---

## Objective

Move the ADP Tracker tab (`timeseries`) from `guest`-accessible to `pro`-only in `featureAccess.js`, so free and unauthenticated users see the locked state instead of the chart.

## Verification Criteria

- `featureAccess.js` has `timeseries: 'pro'` (was `'guest'`).
- A guest or free-tier user navigating to ADP Tracker sees the `LockedFeature` component, not the chart.
- A pro user still sees the full ADP Tracker chart as before.

## Verification Approach

1. Read `featureAccess.js` and confirm `timeseries` value is `'pro'`.
2. Read `App.jsx` (or wherever `canAccessFeature` is called for `timeseries`) to confirm the gate renders `<LockedFeature>` for non-pro tiers.
3. No runtime testing needed — the gating logic is already proven by the other `pro` features using the same path.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/utils/featureAccess.js` | Modify | Change `timeseries: 'guest'` → `timeseries: 'pro'` |

## Implementation Approach

1. In `featureAccess.js` line 6, change `timeseries: 'guest'` to `timeseries: 'pro'`.
2. No other files need changes — the gating logic in `App.jsx` already handles rendering `<LockedFeature>` for any feature where `canAccessFeature` returns false.

## Dependencies

None.

---
*Approved by: Developer, 2026-04-06*
