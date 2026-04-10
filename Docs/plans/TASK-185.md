# TASK-185: Auto-connect Chrome extension auth from website login

**Status:** Approved
**Priority:** P2

---

## Objective
Automatically pass the Supabase auth session from the website to the Chrome extension so users who sign in on the website don't need to sign in again in the extension. Uses `externally_connectable` manifest key to allow the website to message the extension's background service worker directly. Bundled with TASK-192 (restore Google OAuth buttons) since both require a Chrome Web Store extension update.

## Verification Criteria
1. When a user signs in on the website (email/password or Google OAuth), the extension receives the session tokens and `chrome.storage.local` contains a valid Supabase session.
2. When a user signs out on the website, the extension's Supabase session is cleared.
3. When the extension is not installed, the website auth flow works normally with no errors in the console.
4. The `externally_connectable` manifest key lists both production (`bestballexposures.com`) and development (`localhost`) domains.
5. Google OAuth "Continue with Google" buttons appear in both sign-in and sign-up forms on the website (TASK-192).

## Verification Approach
1. Load the unpacked extension locally. Sign in on the website (localhost dev server). Open the extension's service worker DevTools and confirm `chrome.storage.local` contains `sb-*` session keys. Open the overlay on Underdog — it should show the user as signed in without separate login.
2. Sign out on the website. Check `chrome.storage.local` again — session keys should be cleared. Overlay should show signed-out state.
3. Uninstall the extension. Sign in/out on the website — console should show no errors (the `sendMessage` calls are wrapped in try/catch).
4. Verify Google OAuth buttons render in AuthModal and `signInWithGoogle()` triggers the OAuth flow.

Steps 1-4 require the developer (manual browser interaction with extension loaded).

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/manifest.json` | Modify | Add `externally_connectable` with website domains |
| `chrome-extension/src/background.js` | Modify | Add `onMessageExternal` listener for `SET_SESSION` and `SIGN_OUT` |
| `best-ball-manager/src/contexts/AuthContext.jsx` | Modify | Push session to extension on auth state change; push sign-out on sign-out |
| `best-ball-manager/src/components/AuthModal.jsx` | Modify | Restore Google OAuth "Continue with Google" buttons (TASK-192) |

## Implementation Approach

### Step 1: manifest.json — Add externally_connectable
Add the `externally_connectable` key to allow the website to send messages to the extension:
```json
"externally_connectable": {
  "matches": [
    "https://bestballexposures.com/*",
    "https://www.bestballexposures.com/*",
    "http://localhost:*/*"
  ]
}
```
This enables `chrome.runtime.sendMessage(extensionId, ...)` from these origins.

### Step 2: background.js — Add onMessageExternal listener
Import the Supabase client from `src/utils/supabase.js`. Add a `chrome.runtime.onMessageExternal.addListener` handler:
- **`SET_SESSION`**: Receives `{ type: 'SET_SESSION', access_token, refresh_token }`. Calls `supabase.auth.setSession({ access_token, refresh_token })` to bootstrap the extension's auth state in `chrome.storage.local`. Responds with `{ ok: true }` or `{ error }`.
- **`SIGN_OUT`**: Calls `supabase.auth.signOut()` to clear the extension session. Responds with `{ ok: true }`.

### Step 3: AuthContext.jsx — Push session to extension
- Add a helper function `pushSessionToExtension(session)` that wraps `chrome.runtime.sendMessage(EXTENSION_ID, { type: 'SET_SESSION', access_token, refresh_token })` in a try/catch. The extension ID is `cnljeadelfnabalcdongglhfhiceakaj` (from Chrome Web Store listing). The `chrome.runtime` API is only available when the extension is installed — the try/catch ensures this is a no-op otherwise.
- In the `onAuthStateChange` callback, when a session is present and the event is `SIGNED_IN` or `TOKEN_REFRESHED`, call `pushSessionToExtension(session)`.
- In `signOut()`, before calling `supabase.auth.signOut()`, try sending `{ type: 'SIGN_OUT' }` to the extension (also wrapped in try/catch).

### Step 4: AuthModal.jsx — Restore Google OAuth buttons (TASK-192)
Re-add the "Continue with Google" UI in both sign-in and sign-up form sections:
- An `<hr>` divider with "or" text (using the existing `modal-divider` CSS class)
- A `<button className="modal-google-btn">` that calls `signInWithGoogle()`
- The `signInWithGoogle` function is already imported from AuthContext but unused — wire it to the buttons

### Edge Cases
- **Extension not installed**: `chrome.runtime.sendMessage` throws — caught silently by try/catch.
- **Extension already signed in as same user**: `setSession` is idempotent — refreshes the session, no harm.
- **Extension signed in as different user**: Website is source of truth — overwrites the extension session.
- **Race condition on initial page load**: `getSession()` runs on mount and triggers `onAuthStateChange` with the existing session — this will push to the extension on every page load if signed in, which is fine (idempotent).

## Dependencies
- TASK-192 is included in this plan (restore Google OAuth buttons)

---
*Approved by: <!-- developer name/initials and date once approved -->*
