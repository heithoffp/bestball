<!-- Completed: 2026-03-30 | Commit: pending -->
# TASK-029: Add persistent upgrade CTA in toolbar for free users

**Status:** Done
**Priority:** P2

---

## Objective

A logged-in free user who only browses free-tier tabs (Dashboard, Exposures, ADP Tracker) has no visible prompt to start a trial — the LockedFeature overlay only appears when clicking a Pro tab. Adding a persistent "Start Free Trial" button in the toolbar ensures the CTA is always discoverable.

## Implementation

Added a "Start Free Trial" button to `AuthButton.jsx` that renders for logged-in non-Pro users. Calls `openPlanPicker()` on click. Sign out button demoted to ghost style to maintain visual hierarchy (Upload button and Trial CTA remain gold as primary actions).

## Files Changed

| File | Change |
|------|--------|
| `best-ball-manager/src/components/AuthButton.jsx` | Import `useSubscription`; render "Start Free Trial" button for `!isProUser` |
| `best-ball-manager/src/index.css` | Add `.toolbar-btn--upgrade` and `.toolbar-btn--ghost` modifier classes |

## Verification Criteria

1. Logged-in free user sees "Start Free Trial" button in the toolbar on all tabs.
2. Clicking it opens PlanPicker.
3. Pro user does not see the button.
4. Sign out button renders as ghost style.
