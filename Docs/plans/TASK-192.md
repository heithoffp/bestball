# TASK-192: Restore Google OAuth buttons on website AuthModal

**Status:** Draft

## Objective

Re-add "Continue with Google" buttons to the sign-in and sign-up forms in `AuthModal.jsx`.
These were temporarily removed to prevent users from creating Google-only accounts that
cannot authenticate in the Chrome extension (which only supported email/password sign-in).

**Blocked by:** Chrome extension update (with `identity` permission + Google sign-in via
`chrome.identity.launchWebAuthFlow`) being live in the Chrome Web Store. Once users can
sign in with Google in the extension, the website buttons should be restored.

## Context

- Google OAuth buttons were removed from AuthModal.jsx on 2026-04-10
- The extension update adding Google OAuth was built the same day but requires Chrome Web
  Store review before it's live
- The removed code is two identical blocks: a `<div className="modal-divider">` + a
  `<button className="modal-google-btn">` — one in the sign-in form, one in the sign-up form
- The `signInWithGoogle` function in AuthContext.jsx is still intact; only the UI buttons
  were removed
