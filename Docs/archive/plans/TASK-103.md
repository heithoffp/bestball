<!-- Completed: 2026-04-03 | Commit: c17767c -->
# TASK-103: Extension — start/stop overlay on SPA navigation to/from draft pages

**Status:** Done
**Priority:** P2

---

## Objective

Underdog is a React SPA — navigating from the lobby into a draft (or back out) is a
client-side URL change, not a full page load. The content script runs once at page load
and never re-runs. As a result, `startOverlay()` is never called when a user enters a
draft from the lobby, and `stopOverlay()` is never called when they leave. The overlay
(Exp/Corr columns, tier badges) only activates if the user hard-refreshes while already
on a `/draft/<id>` URL — breaking the primary use case.

The fix is to watch for URL changes inside the content script and call `startOverlay()` /
`stopOverlay()` as the user transitions in and out of draft pages.

## Verification Criteria

1. Navigating from the Underdog lobby into a `/draft/<id>` page activates the overlay
   (Exp/Corr columns appear, portfolio data loads) without requiring a hard refresh.
2. Navigating back out of a draft page to the lobby tears down the overlay (columns removed,
   observers disconnected).
3. Navigating from one draft directly into another draft (draft→draft) resets state — prior
   picks are cleared, fresh portfolio data is loaded, and Exp/Corr columns appear correctly.
4. The FAB remains present throughout all navigation transitions.
5. No duplicate observers are created — repeated navigation between lobby and draft does not
   stack multiple `gridObserver` instances.

## Verification Approach

Manual verification steps for the developer:
1. Load the extension on Underdog. Navigate from lobby → draft. Confirm Exp/Corr columns
   appear in the player list without hard-refreshing. Check DevTools console for
   `[BBM] Portfolio loaded` and `[BBM] Rankings loaded` log lines.
2. Navigate from the draft back to the lobby. Confirm Exp/Corr columns are gone from the
   DOM (inspect player rows — no `.bbm-inline-overlay` elements).
3. Join a second draft directly from the draft results screen (draft→draft). Confirm the
   overlay reloads cleanly with zeroed picks state.
4. Verify the FAB (`#bbm-fab`) is present in all three states: lobby, in-draft, post-draft.
5. Navigate lobby→draft→lobby→draft repeatedly. Confirm no JS errors in console and that
   Exp/Corr only appears while on a draft page.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/src/content/draft-overlay.js` | Modified | Added `watchNavigation()`, `handleUrlChange()`, and `lastUrl` state; called `watchNavigation()` from `initDraftOverlay()` |

## Implementation Notes

The approved plan specified History API patching (`history.pushState`/`replaceState`), but
this does not work in Chrome extension content scripts. Content scripts run in an isolated
world — patching `history.pushState` only affects the content script's wrapper, not the
page's copy. React Router (running in the main world) calls the unpatched original.

The fix used `setInterval` polling of `window.location.href` at 300ms, which IS shared
across worlds and updates correctly after SPA navigation. `popstate` listener retained as
a backup for browser back/forward navigation.

## Dependencies

TASK-100 (FAB always present on Underdog pages — Done)

---
*Approved by: Patrick 2026-04-03*
