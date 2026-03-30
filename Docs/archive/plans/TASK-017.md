<!-- Completed: 2026-03-29 | Commit: pending -->
# TASK-017: Fix false success message when Supabase is unconfigured

**Status:** Pending Approval
**Priority:** P2
**Feature:** FEAT-001

---

## Objective

When Supabase is unconfigured (`supabase` is null), AuthContext auth methods return `{ error: null }`, causing AuthModal to interpret the result as success and display misleading messages like "Check your email to confirm your account." Fix these early returns to return an error instead.

## Verification Criteria

- `signUpWithEmail`, `signInWithEmail`, and `resetPassword` return `{ error: { message: '...' } }` when `!supabase`, not `{ error: null }`.
- AuthModal displays an error message (not a success message) if any auth method is called when Supabase is unconfigured.
- AuthButton still returns `null` when `!supabase` (existing guard unchanged).
- App builds without errors (`npm run build`).

## Verification Approach

1. Read `AuthContext.jsx` and confirm all three methods have the updated early return.
2. Run `npm run build` from `best-ball-manager/` — expect clean build with no errors.
3. Visually confirm AuthButton still has `if (!supabase) return null;` guard (no change needed).

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/contexts/AuthContext.jsx` | Modify | Change 3 `!supabase` early returns from `{ error: null }` to `{ error: { message: 'Auth is not available.' } }` |

## Implementation Approach

1. In `signUpWithEmail` (line 44), change `return { error: null }` to `return { error: { message: 'Auth is not available.' } }`.
2. In `signInWithEmail` (line 52), same change.
3. In `resetPassword` (line 60), same change.

No other changes needed — AuthModal already handles `error` correctly by showing `authError` and not showing success messages when `error` is truthy.

## Dependencies

- TASK-004 (Done) — AuthContext null-guard pattern
- TASK-005 (Done) — AuthModal success-message logic

---
*Approved by: <!-- developer name/initials and date once approved -->*
