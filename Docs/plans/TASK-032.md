# TASK-032: Build password reset completion flow

**Status:** Approved
**Priority:** P2

---

## Objective

Add app-side handling for the Supabase `RECOVERY` auth event so that users who click a password reset link are automatically shown a "Set new password" form and can complete the reset flow end-to-end.

## Verification Criteria

1. Clicking a valid password reset link redirects to the app and automatically opens the auth modal showing a "Set new password" form (not the normal sign-in/sign-up view)
2. Submitting a new password (with confirmation match) calls `supabase.auth.updateUser` and shows a success message
3. After success, the modal closes, the user is signed in, and recovery mode is cleared
4. Password mismatch shows an inline error and does not submit
5. The normal sign-in/sign-up modal flow is unaffected when `recoveryMode` is false

## Verification Approach

1. Developer: trigger a password reset email, click the link, confirm the auth modal opens automatically in "Set new password" mode
2. Developer: submit a new password — confirm success message appears, modal closes, user is signed in
3. Developer: attempt mismatched passwords — confirm inline error, no submission
4. Claude: `npm run lint` from `best-ball-manager/` — clean build, no new warnings

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/contexts/AuthContext.jsx` | Modify | Add `recoveryMode` state; detect `RECOVERY` event in `onAuthStateChange`; add `updatePassword` function; expose via context |
| `best-ball-manager/src/components/AuthModal.jsx` | Modify | Add "Set new password" view shown when `recoveryMode` is true; calls `updatePassword` on submit |
| `best-ball-manager/src/App.jsx` | Modify | Auto-open `AuthModal` when `recoveryMode` becomes true |

## Implementation Approach

### 1. `AuthContext.jsx`

Add `recoveryMode` state (default `false`). In the `onAuthStateChange` listener, detect the `RECOVERY` event and set `recoveryMode = true`. Add an `updatePassword` function:

```js
async function updatePassword(newPassword) {
  if (!supabase) return { error: { message: 'Auth is not available.' } };
  setAuthError(null);
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (!error) setRecoveryMode(false);
  else setAuthError(error.message);
  return { error };
}
```

Expose `recoveryMode` and `updatePassword` via context value.

In `onAuthStateChange`:
```js
supabase.auth.onAuthStateChange((event, session) => {
  setUser(session?.user ?? null);
  if (event === 'RECOVERY') setRecoveryMode(true);
});
```

### 2. `App.jsx`

Destructure `recoveryMode` from `useAuth()`. Add a `useEffect` that calls `setShowAuthModal(true)` when `recoveryMode` becomes true:

```js
useEffect(() => {
  if (recoveryMode) setShowAuthModal(true);
}, [recoveryMode]);
```

### 3. `AuthModal.jsx`

Destructure `recoveryMode` and `updatePassword` from `useAuth()`. Add a new view that renders when `recoveryMode` is true (takes priority over all other views):

- Two password fields: "New password" and "Confirm new password"
- Mismatch validation (same pattern as sign-up)
- On submit: calls `updatePassword(password)`, on success shows success message "Password updated — you're signed in."
- No close button while in recovery mode (force completion)
- `onClose` is a no-op while `recoveryMode` is true to prevent dismissing mid-flow

## Dependencies

- TASK-019 — SMTP working (Done)

---

*Approved by: developer — 2026-03-30*
