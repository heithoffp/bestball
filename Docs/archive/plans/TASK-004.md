<!-- Completed: 2026-03-27 | Commit: b11d0b7 -->
# TASK-004: Add email/password auth alongside Google OAuth

**Status:** Approved
**Priority:** P1
**Feature:** FEAT-001

---

## Objective

Extend `AuthContext.jsx` to support Supabase email/password signup, login, and password reset alongside the existing Google OAuth. Exposes `signUpWithEmail`, `signInWithEmail`, `resetPassword`, `authError`, and `emailVerified` to consumers so the auth modal (TASK-005) has everything it needs.

## Verification Criteria

1. `AuthContext` exports `signUpWithEmail(email, password)` — calls `supabase.auth.signUp()` and resolves.
2. `AuthContext` exports `signInWithEmail(email, password)` — calls `supabase.auth.signInWithPassword()` and resolves.
3. `AuthContext` exports `resetPassword(email)` — calls `supabase.auth.resetPasswordForEmail()` and resolves.
4. `AuthContext` exports `authError` (string or null) that is populated when any auth method throws a Supabase error.
5. `AuthContext` exports `emailVerified` (boolean) — `true` when `user.email_confirmed_at` is non-null.
6. All existing Google OAuth behavior (`signInWithGoogle`, `signOut`) is unchanged.
7. `npm run build` passes with no errors.

## Verification Approach

1. Run `cd best-ball-manager && npm run build` — expect clean exit.
2. Inspect `src/contexts/AuthContext.jsx` to confirm all five new exports appear in the Provider value object.
3. Confirm `signUpWithEmail` and `signInWithEmail` contain try/catch blocks that set `authError`.
4. Confirm `emailVerified` is derived from `user?.email_confirmed_at != null`.

All steps can be run by Claude (steps 2–4 are code inspection). No developer action required.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/contexts/AuthContext.jsx` | Modify | Add email auth methods, authError state, emailVerified derived value |

## Implementation Approach

1. Add `authError` state above existing state: `const [authError, setAuthError] = useState(null)`.

2. Add helper `clearError`: `const clearError = () => setAuthError(null)` — callers invoke this on input change to reset stale error messages.

3. Add `signUpWithEmail(email, password)`:
   ```js
   async function signUpWithEmail(email, password) {
     setAuthError(null);
     const { error } = await supabase.auth.signUp({ email, password });
     if (error) setAuthError(error.message);
     return { error };
   }
   ```

4. Add `signInWithEmail(email, password)`:
   ```js
   async function signInWithEmail(email, password) {
     setAuthError(null);
     const { error } = await supabase.auth.signInWithPassword({ email, password });
     if (error) setAuthError(error.message);
     return { error };
   }
   ```

5. Add `resetPassword(email)`:
   ```js
   async function resetPassword(email) {
     setAuthError(null);
     const { error } = await supabase.auth.resetPasswordForEmail(email, {
       redirectTo: window.location.origin,
     });
     if (error) setAuthError(error.message);
     return { error };
   }
   ```

6. Add `emailVerified` derived value:
   ```js
   const emailVerified = user?.email_confirmed_at != null;
   ```
   Place this after the `user` state declaration (before the return).

7. Update the Provider value object to include all new exports:
   ```js
   value={{ user, loading, signInWithGoogle, signOut, signUpWithEmail, signInWithEmail, resetPassword, authError, clearError, emailVerified }}
   ```

**Guard clause:** All new functions check `if (!supabase) return { error: null }` at the top, consistent with how `signInWithGoogle` guards against missing Supabase config.

## Dependencies

None — builds directly on the existing `AuthContext.jsx` Google OAuth foundation.

---
*Approved by: developer — 2026-03-27*
