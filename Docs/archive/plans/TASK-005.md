<!-- Completed: 2026-03-27 | Commit: b11d0b7 -->
# TASK-005: Build auth modal with signup/login tabs

**Status:** Approved
**Priority:** P1
**Feature:** FEAT-001

---

## Objective

Replace the current `AuthButton` (which opens Google OAuth directly) with a modal dialog that gives users a complete authentication experience: tabbed Sign In / Sign Up views, inline password reset, both Google OAuth and email+password options, and error display. This is the primary user-facing entry point for authentication.

## Verification Criteria

1. Clicking "Sign In" in the toolbar opens the auth modal.
2. Modal has two tabs: "Sign In" and "Sign Up".
3. Sign In tab has email + password fields, a "Forgot password?" link, a Submit button, and a "Continue with Google" button.
4. Sign Up tab has email + password + confirm-password fields, a Submit button, and a "Continue with Google" button.
5. Clicking "Forgot password?" replaces the Sign In form with an email-only input and "Send reset link" button.
6. Supabase errors from `authError` are displayed inline below the form.
7. The modal closes on backdrop click and on the × button.
8. When the user is signed in, the toolbar still shows avatar + "Sign out" (unchanged).
9. `npm run build` passes with no errors.

## Verification Approach

1. Run `cd best-ball-manager && npm run build` — expect clean exit.
2. Inspect `src/components/AuthModal.jsx` to confirm:
   - Tab state management (Sign In / Sign Up)
   - Forgot-password flow (local `forgotPassword` state)
   - `onClose` called on backdrop click and × button
   - `authError` rendered as inline error message
3. Inspect `src/components/AuthButton.jsx` to confirm:
   - `modalOpen` state drives `<AuthModal>` visibility
   - Signed-in view (avatar + sign out) is unchanged
4. Developer: run `npm run dev`, open the app, click "Sign In", and visually confirm the modal appears with the correct structure.

Steps 1–3 can be run by Claude. Step 4 requires the developer.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/AuthModal.jsx` | Create | Full auth modal with Sign In / Sign Up tabs and password reset flow |
| `best-ball-manager/src/components/AuthButton.jsx` | Modify | Wire modal open state; replace direct Google sign-in with "Sign In" button |

## Implementation Approach

### AuthModal.jsx

The modal is a controlled component — open/close state lives in `AuthButton`. It reads from `useAuth()` for methods and error state.

**State:**
- `tab` — `'signin' | 'signup'` (default: `'signin'`)
- `forgotPassword` — boolean (default: `false`), local to the Sign In view
- `email`, `password`, `confirmPassword` — form field values
- `loading` — boolean, true while an async auth call is in-flight

**Structure:**
```
<div class="modal-backdrop" onClick={onClose}>
  <div class="modal" onClick={e => e.stopPropagation()}>
    <button class="modal-close" onClick={onClose}><X /></button>

    {/* Tab bar — hidden during forgotPassword flow */}
    <div class="modal-tabs">
      <button class={tab === 'signin' ? 'active' : ''} onClick={() => setTab('signin')}>Sign In</button>
      <button class={tab === 'signup' ? 'active' : ''} onClick={() => setTab('signup')}>Sign Up</button>
    </div>

    {tab === 'signin' && !forgotPassword && <SignInForm />}
    {tab === 'signin' && forgotPassword && <ForgotPasswordForm />}
    {tab === 'signup' && <SignUpForm />}

    {authError && <p class="modal-error">{authError}</p>}
  </div>
</div>
```

**SignInForm** (inline in the component, not a sub-component):
- Email input (type="email"), Password input (type="password") with show/hide toggle (Eye/EyeOff icons)
- "Forgot password?" link (`<button>` styled as link) that sets `forgotPassword = true`
- Submit button calls `signInWithEmail(email, password)`; on success calls `onClose()`
- Divider "or"
- "Continue with Google" button calls `signInWithGoogle()`

**ForgotPasswordForm:**
- Back arrow button (`←`) resets `forgotPassword = false`
- Email input
- "Send reset link" button calls `resetPassword(email)`; on success shows inline "Check your email" message (replace form content, do not close modal)

**SignUpForm:**
- Email, Password (with show/hide), Confirm Password fields
- Client-side validation: confirm password must match before calling Supabase
- Submit calls `signUpWithEmail(email, password)`; on success shows inline "Check your email to confirm your account" message
- Divider "or"
- "Continue with Google" button calls `signInWithGoogle()`

**Styling:**
- Use existing CSS class conventions (see `.toolbar-btn`, `.auth-button-group` in `App.jsx`/`index.css`)
- No new color variables — use existing `--color-*` custom properties
- Lucide icons: `X`, `Mail`, `Lock`, `Eye`, `EyeOff`
- Dark overlay backdrop (`rgba(0,0,0,0.6)`), centered card matching the app's dark theme

**Error handling:**
- Call `clearError()` on any input change to clear stale errors
- Display `authError` below the form as a styled error message
- Disable submit button while `loading` is true

### AuthButton.jsx changes

1. Add `const [modalOpen, setModalOpen] = useState(false)` to component state.
2. Import and render `<AuthModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />`.
3. Change the unauthenticated render from:
   ```jsx
   <button className="toolbar-btn" onClick={signInWithGoogle}>Sign in with Google</button>
   ```
   to:
   ```jsx
   <button className="toolbar-btn" onClick={() => setModalOpen(true)}>Sign In</button>
   <AuthModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
   ```
4. Authenticated render (avatar + "Sign out") is unchanged.

**Guard:** If `!supabase`, render nothing (unchanged from current behavior).

## Dependencies

- TASK-004 — `signUpWithEmail`, `signInWithEmail`, `resetPassword`, `authError`, `clearError`, and `emailVerified` must be available in `AuthContext` before this modal can use them.

---
*Approved by: developer — 2026-03-27*
