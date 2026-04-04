<!-- Completed: 2026-04-04 | Commit: c17767c -->
# TASK-129: Move sign-in, sign-out, and sync into the FAB overlay panel

**Status:** Pending Approval
**Priority:** P2

---

## Objective

Move all user-facing auth and sync interactions (sign in, sign out, sync entries, user email, tier badge) from the Chrome extension popup into the FAB overlay panel, so users never need to interact with the popup. Gut the popup to a static informational message.

## Verification Criteria

1. FAB panel shows a sign-in form (email, password, button, error display) when the user is not authenticated
2. FAB panel shows user email, tier badge, Sync Now button, and Sign Out button when signed in
3. Clicking Sign In authenticates via Supabase and immediately re-renders the panel to the signed-in state; portfolio data reloads
4. Clicking Sign Out clears session and re-renders to the sign-in form; portfolio data is cleared
5. Clicking Sync Now triggers entry scraping and write; shows "Synced N entries" on success or error message on failure; portfolio data reloads after sync
6. Pressing Enter in the password field triggers sign-in
7. The popup shows only a static title + hint message — no auth form, no sync, no overlay toggle
8. All existing panel features (overlay toggle, status dot, sync line, tournament filter) continue to work

## Verification Approach

Manual verification with the extension loaded on Underdog:
1. Open the FAB panel while not signed in — confirm sign-in form appears
2. Enter valid credentials and click Sign In (or press Enter) — confirm panel transitions to signed-in state and exposure data loads
3. Navigate to the Underdog entries page; open panel; click Sync Now — confirm "Synced N entries" result appears and data refreshes
4. Click Sign Out — confirm panel returns to sign-in form and exposure data is cleared from rows
5. Enter wrong credentials — confirm error message appears
6. Click the Chrome extension toolbar icon — confirm popup shows only title + "Open Underdog Fantasy to access the overlay" hint (no form, no buttons)

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/src/content/draft-overlay.js` | Modify | Add auth section to panel; add signIn/signOut/fetchTier imports; add syncCallback param to initDraftOverlay(); add renderAuthSection(), handleSignIn(), handleSignOut(), handleSync(); update FAB open handler to call renderAuthSection(); widen panel min-width; add auth CSS |
| `chrome-extension/src/content/content.js` | Modify | Pass sync callback to initDraftOverlay() |
| `chrome-extension/src/popup/popup.html` | Modify | Remove auth/sync/toggle markup; replace with static hint |
| `chrome-extension/src/popup/popup.js` | Modify | Remove all auth/sync/toggle logic; leave empty or no-op |

## Dependencies

TASK-100 — floating logo button and panel DOM structure (done).
TASK-106 — confidence panel (done).
TASK-107 — tournament filter panel section (in progress — FAB panel HTML structure compatible).

---
*Approved by: Patrick 2026-04-04*
