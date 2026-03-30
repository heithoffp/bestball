# TASK-015: Implement feature gating by subscription tier

**Status:** Pending Approval
**Priority:** P1
**Feature:** FEAT-002

---

## Objective
Gate premium features based on the user's subscription tier (`guest`, `free`, `pro`) from the existing `useSubscription` hook. Free-tier users see core analytics; Pro unlocks the full suite. Locked features are visible but gated with an upgrade prompt — not hidden — to drive conversion.

## Verification Criteria
1. **Free-tier gating:** Authenticated free users can access Dashboard, Exposure Table, ADP Tracker, and Help Guide. Navigating to Draft Assistant, Roster Viewer, Player Rankings, Combo Analysis, or Roster Construction shows a locked overlay with upgrade CTA instead of the component.
2. **Pro-tier access:** Pro users (`isProUser === true`) can access all tabs without restriction.
3. **Guest mode:** Unauthenticated users (guest tier) can access all tabs with sample/bundled data (no gating — guests explore freely to build trust).
4. **Locked tab appearance:** Gated tabs are visible in the tab bar (not hidden) but styled with a lock indicator. Clicking a locked tab shows the lock overlay, not the component.
5. **Upgrade CTA:** The lock overlay includes a clear call-to-action that triggers `redirectToCheckout` for authenticated users or prompts sign-up for guests viewing the upgrade path.
6. **Loading state:** While subscription status is loading, tabs render normally (no flash of locked state).
7. **No build errors:** `npm run build` succeeds with zero errors.
8. **No lint errors:** `npm run lint` produces no new warnings/errors from gating code.

## Verification Approach
1. Read all modified files to confirm gating logic matches the feature gating table from TASK-002.
2. Verify the `FEATURE_ACCESS` config maps every tab to the correct tier.
3. Run `npm run build` from `best-ball-manager/` — expect clean build.
4. Run `npm run lint` from `best-ball-manager/` — expect no new issues.
5. Developer manually tests in browser:
   - Without auth (guest): all tabs accessible.
   - Logged in, no subscription (free): pro tabs show lock overlay.
   - Logged in, active subscription (pro): all tabs accessible.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/utils/featureAccess.js` | Create | Feature access config and `canAccessFeature(tier, featureKey)` helper |
| `best-ball-manager/src/components/LockedFeature.jsx` | Create | Lock overlay component with upgrade CTA |
| `best-ball-manager/src/components/LockedFeature.module.css` | Create | Styles for lock overlay |
| `best-ball-manager/src/App.jsx` | Modify | Import useSubscription, wrap gated tabs with access check, add lock icon to tab bar |

## Implementation Approach

### Step 1: Feature access config (`featureAccess.js`)

Create a utility that encodes the TASK-002 gating table:

```js
// Minimum tier required: 'guest' (anyone), 'free' (account), 'pro' (paid)
const FEATURE_ACCESS = {
  dashboard:    'guest',
  exposures:    'guest',
  timeseries:   'guest',
  help:         'guest',
  draftflow:    'pro',
  rosters:      'pro',
  rankings:     'pro',
  // Future: combo, construction when re-enabled
};

const TIER_LEVEL = { guest: 0, free: 1, pro: 2 };

export function canAccessFeature(tier, featureKey) {
  const required = FEATURE_ACCESS[featureKey] ?? 'pro';
  return TIER_LEVEL[tier] >= TIER_LEVEL[required];
}
```

Note: Per TASK-002, Guest mode gets all tabs with sample data (trust-building), Free gets core analytics with own data, Pro gets everything. The gating table shows Free users are blocked from Draft Assistant, Roster Viewer, Player Rankings, Combo Analysis, and Roster Construction. Guest users see everything with sample data. So the gate only activates for `free` tier — guests and pro pass through.

### Step 2: Lock overlay component (`LockedFeature.jsx`)

Simple overlay component:
- Lock icon (from Lucide) + message explaining the feature is Pro-only
- Upgrade button that calls `redirectToCheckout` with the Pro price ID
- If user is not authenticated, button text changes to "Sign Up to Unlock" and triggers auth modal instead
- Clean, non-hostile design — brief value statement, not a hard sell

### Step 3: Modify `App.jsx`

- Import `useSubscription` hook and `canAccessFeature`
- In the tab bar rendering, add a small lock icon next to labels for tabs the user can't access
- In the content rendering section, wrap gated tabs:
  ```jsx
  {activeTab === 'draftflow' && (
    canAccessFeature(tier, 'draftflow')
      ? <DraftFlowAnalysis {...props} />
      : <LockedFeature featureName="Draft Assistant" />
  )}
  ```
- While `loading` is true from useSubscription, skip gating (render normally to avoid flash)

### Edge Cases
- **Tier changes mid-session:** Handled automatically — `useSubscription` uses Realtime subscription, so `tier` updates reactively. Gating will lift/apply immediately.
- **Supabase unconfigured:** `tier` defaults to `guest` (from SubscriptionContext), which has full access to sample data — no gating applied, no crashes.
- **Disabled tabs (Combo Analysis, Roster Construction):** Not in the current tabs array, so no gating needed now. The `FEATURE_ACCESS` config includes them for when they're re-enabled.

## Dependencies
- TASK-014 — `useSubscription` hook (Complete ✓)
- TASK-002 — Tier definitions and feature gating table (Complete ✓)

---
*Approved by: Patrick H. — 2026-03-29*
