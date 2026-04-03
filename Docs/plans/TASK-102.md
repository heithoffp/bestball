# TASK-102: Extension sync — improve error message when already on Underdog completed entries page

**Status:** Draft
**Priority:** P3

---

## Objective

`getEntries()` in `chrome-extension/src/adapters/underdog.js` checks whether the current URL includes `app.underdogfantasy.com/completed` and throws "Navigate to your Underdog completed entries page first" when it fails. Users report seeing this message while already at that URL — the issue is likely the page hasn't fully loaded yet, not that they're on the wrong page. The message should distinguish between "wrong site entirely" and "right page, try refreshing" to reduce confusion.

## Dependencies

None

## Open Questions

- Should the check also handle URL variants (e.g., `/completed-slates` or query strings that still indicate the right page)?
