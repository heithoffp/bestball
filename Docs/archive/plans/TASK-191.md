<!-- Completed: 2026-04-09 | Commit: pending (not yet committed) -->
# TASK-191: Remove ?demo=true Pro tier bypass

**Status:** Approved
**Priority:** P1

---

## Objective
Remove the URL parameter `?demo=true` from granting Pro tier access in SubscriptionContext. Currently anyone can append this param to get full Pro access on any data, including their own. The "Try Demo" button on the landing page will continue to work — it loads sample data via `loadDemoData()` independently. Demo users will see free-tier features with sample data; Pro features show the lock overlay as a conversion CTA.

## Verification Criteria
- Visiting `bestballexposures.com?demo=true` does NOT grant Pro tier — Pro-gated tabs (ADP Tracker, Rankings, Draft Assistant, Combos, Construction) show lock overlay
- The "Try Demo" button on the landing page still loads sample roster data into Dashboard, Exposures, and Rosters
- Authenticated users with active subscriptions or beta access are unaffected
- `npm run build` succeeds with no errors

## Verification Approach
1. Run `npm run build` in `best-ball-manager/` — confirm clean build
2. Grep for remaining `demo` references to confirm no other bypass paths exist
3. Manual check: load `localhost:5173?demo=true` unauthenticated — verify Pro tabs are locked
4. Manual check: click "Try Demo" on landing page — verify sample data loads in free-tier tabs

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/contexts/SubscriptionContext.jsx` | Modify | Remove `isDemoMode` URL param check and its use in tier derivation |
| `best-ball-manager/src/App.jsx` | Modify | Remove `?demo=true` auto-load trigger (keep `loadDemoData()` for the Try Demo button) |

## Implementation Approach
1. **SubscriptionContext.jsx:** Delete line 29 (`const isDemoMode = ...`) and simplify the tier ternary on lines 31-37 to remove the `isDemoMode ? 'pro'` branch.
2. **App.jsx:** Remove the `autoDemo` check at line 173-175 that auto-loads assets when `?demo=true` is in the URL. The `loadDemoData()` callback (used by the Try Demo button) remains untouched.
3. Build and verify.

## Dependencies
None
