# TASK-006: Add auth guard for cloud-only features

**Status:** Pending Approval
**Priority:** P2
**Feature:** FEAT-001

---

## Objective
Create a `useRequireAuth` hook that components can call to trigger the auth modal when an unauthenticated user attempts a cloud-dependent action (e.g., uploading custom data that should persist cross-device). This complements the existing tier-based `LockedFeature` gating (which handles subscription level) by handling the authentication boundary specifically.

## Verification Criteria
1. A `useRequireAuth` hook exists that returns a `requireAuth(callback)` wrapper function.
2. When an unauthenticated user triggers a guarded action, the auth modal opens instead of executing the action.
3. When an authenticated user triggers a guarded action, the action executes normally.
4. Guest-mode core analytics (Dashboard, Exposures, ADP Tracker, Help) remain fully functional with no auth prompts during normal use.
5. The hook integrates cleanly with the existing `AuthModal` — no duplicate modal instances.
6. `npm run build` succeeds with no errors.
7. `npm run lint` passes with no new warnings.

## Verification Approach
1. Run `npm run build` from `best-ball-manager/` — expect clean build with no errors.
2. Run `npm run lint` from `best-ball-manager/` — expect no new warnings.
3. Code review: verify the hook reads `user` from `AuthContext` and controls `AuthModal` visibility via the existing state in `App.jsx`.
4. Trace the upload handlers in `App.jsx` to confirm `requireAuth` wraps them correctly — unauthenticated users get the modal, authenticated users proceed directly.
5. Confirm guest tabs (dashboard, exposures, timeseries, help) have no auth guard calls.

Steps 1-5 can be run by Claude. Developer should do a manual smoke test: load the app without signing in, attempt a CSV upload, and verify the auth modal appears.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/hooks/useRequireAuth.js` | Create | Hook that returns a `requireAuth(callback)` function; opens auth modal if no user |
| `best-ball-manager/src/App.jsx` | Modify | Wire `useRequireAuth` to the `showAuthModal` state; wrap upload handlers with `requireAuth` |

## Implementation Approach

1. **Create `useRequireAuth` hook** (`src/hooks/useRequireAuth.js`):
   - Accepts a `setShowAuthModal` callback (or accesses it via a small context addition).
   - Returns `requireAuth(fn)` — a function that checks `user` from `useAuth()`:
     - If `user` exists: calls `fn()` immediately.
     - If no `user`: calls `setShowAuthModal(true)` to open the auth modal.
   - Keep it simple — no pending-action queue or post-auth callback for now. The user signs in, modal closes, and they can retry the action. This avoids complexity and matches current UX patterns.

2. **Wire into App.jsx**:
   - Import and call `useRequireAuth`, passing `setShowAuthModal`.
   - Wrap `handleRosterUpload` and `handleRankingsUpload` with `requireAuth` so that unauthenticated users see the auth modal instead of uploading (uploads to cloud storage require auth; bundled asset viewing does not).
   - The existing `LockedFeature` component already calls `onSignUp={() => setShowAuthModal(true)}` for tier gating — this is a separate concern and remains unchanged.

3. **Design decisions**:
   - **No post-auth resume**: The simplest approach — user signs in, then retries their action. Adding a pending-action queue is premature complexity for the current feature set.
   - **No new context**: The hook takes `setShowAuthModal` as a parameter rather than creating a new context, keeping the surface area minimal.
   - **Upload-only guard for now**: Only CSV uploads are guarded, since they're the only user-initiated cloud-write actions. Tab gating is already handled by `LockedFeature`. Future cloud features (e.g., sync settings) can call `requireAuth` when added.

## Dependencies
- TASK-004 — Email/password auth (Done)
- TASK-005 — Auth modal (Done)

---
*Approved by: <!-- developer name/initials and date once approved -->*
