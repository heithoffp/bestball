<!-- Completed: 2026-03-29 | Commit: pending -->
# TASK-022: Clear IndexedDB on sign-out to prevent data leakage

**Status:** Pending Approval
**Priority:** P2

---

## Objective
When a user signs out, clear their locally cached rosters and rankings from IndexedDB so the next user on the same browser doesn't see the previous user's portfolio data.

## Verification Criteria
1. After sign-out, the IndexedDB `bestball-db` `files` store is empty.
2. A subsequent page load (without signing in) falls through to the bundled sample data, not the previous user's uploads.
3. The sign-out flow completes without errors when Supabase is unconfigured (guest mode).

## Verification Approach
1. Run `npm run build` from `best-ball-manager/` — must succeed with no errors.
2. Developer manually tests: sign in, upload a roster CSV, sign out, refresh — app should show sample data, not the uploaded roster.
3. Review the code change to confirm `clearAllData()` is called before `supabase.auth.signOut()`.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/contexts/AuthContext.jsx` | Modify | Import `clearAllData` from storage utils and call it in `signOut()` |

## Implementation Approach
1. Import `clearAllData` from `../utils/storage.js` in AuthContext.jsx.
2. In the `signOut()` function, call `await clearAllData()` before `supabase.auth.signOut()`.
3. Handle the case where Supabase is unconfigured — still clear IndexedDB even if there's no Supabase session to sign out of.
4. No cloud storage clearing needed — cloud data is keyed by user ID and inaccessible to other users.

## Dependencies
None — AuthContext and storage utilities already exist.

---
*Approved by:*
