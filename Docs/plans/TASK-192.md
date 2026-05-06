# TASK-192: Restore Google OAuth buttons on website AuthModal

**Status:** Draft

## Objective

Re-add "Continue with Google" buttons to the sign-in and sign-up forms in `AuthModal.jsx`.
These were temporarily removed to prevent users from creating Google-only accounts that
cannot authenticate in the Chrome extension (which only supported email/password sign-in).

## Status Update — 2026-05-05

The Chrome extension (1.0.2) is now live with `identity` permission and Google sign-in
support, so the original blocker is cleared. Buttons were restored briefly and then
re-disabled because a new blocker surfaced during testing:

**New blocker — dual-account problem:** When an existing email/password user signs in
with Google for the first time, Supabase creates a *separate* `auth.users` row (different
`user_id`) instead of linking the Google identity to the existing account. The user ends
up with two distinct Supabase users — one for the email/password identity, one for
Google — and `extension_entries` synced under one is invisible when signed in as the
other. Observed behavior: developer signed in to extension via Google, synced entries,
then could not see the entries on the website because the website session was the
email/password account.

## Required before re-enabling

1. **Decide identity-linking strategy.** Either:
   - Enable Supabase identity linking so Google sign-in for an existing email matches the
     existing user (requires Supabase auth config + may need email-verification UX), or
   - Add explicit "Link Google account" UI for already-signed-in users instead of using
     Google as a primary sign-in method, or
   - Accept the dual-user model and provide a migration/merge UI for affected users.
2. **Test the chosen strategy** with a fresh email/password account → Google sign-in →
   confirm same `user_id` and entries visible.
3. **Then** re-enable the buttons (revert the `{/* */}` blocks in AuthModal.jsx around
   lines 191 and 275).

## Notes

- The `signInWithGoogle` function in `AuthContext.jsx` is intact and works correctly —
  the issue is downstream in Supabase's auth.users handling.
- The removed UI is two identical blocks: `<div className="modal-divider">` +
  `<button className="modal-google-btn">` — one in the sign-in form, one in the sign-up form.
- Users currently affected: anyone who signed in via Google during the brief window when
  buttons were enabled today and got a duplicate account.
