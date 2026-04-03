# TASK-103: Extension — start/stop overlay on SPA navigation to/from draft pages

**Status:** Draft
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

## Dependencies

TASK-100 (FAB always present on Underdog pages — Done)

## Open Questions

- Underdog uses React Router with `pushState`. The standard approach is to patch
  `history.pushState` / `history.replaceState` and also listen for `popstate`. Verify
  this is sufficient vs. a polling approach.
- Should `loadPortfolioData()` and `loadRankingsData()` re-run on each draft entry, or
  is the cached data from the initial load sufficient? (Likely re-run to pick up any
  sync that happened between drafts in the same session.)
