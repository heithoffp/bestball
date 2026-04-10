# TASK-185: Auto-connect Chrome extension auth from website login

**Status:** Draft
**Priority:** P2

---

## Objective
When a user is signed in on the website and has the Chrome extension installed, automatically pass the Supabase auth session to the extension so the user doesn't need to sign in separately. Currently the extension and website maintain completely independent auth sessions — the extension uses `chrome.storage.local` and the website uses browser `localStorage`, requiring users to log in twice. This is a significant onboarding friction point, especially for new users who just signed up on the website and then install the extension.

The approach uses `externally_connectable` in the extension's `manifest.json` to allow the website domain to send messages to the extension via `chrome.runtime.sendMessage()`, passing the authenticated session token so the extension can bootstrap its own auth state.

## Dependencies
- Requires a Chrome extension update (manifest change + new message handler), so this should be bundled with the next extension release to avoid another review cycle.

## Open Questions
- Should the extension also be able to push its auth state back to the website (bidirectional), or is website → extension one-way sufficient?
- Should there be a visual indicator on the website when the extension is detected and auto-connected?
- Security considerations: should the session transfer require any additional confirmation, or is being logged in on the website sufficient trust?
- Should we handle the case where the extension is already logged in as a different user?
