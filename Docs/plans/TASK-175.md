# TASK-175: Block doubleclick.net ad interruptions on DraftKings pages

**Status:** Draft
**Priority:** P3

---

## Objective
DraftKings pages trigger intrusive ad popups from doubleclick.net that interrupt critical user flows like login and account settings. When the extension is active on DraftKings, these ad overlays hijack focus and close the login/settings screen, preventing users from completing authentication — which blocks the sync flow entirely.

The extension should suppress these ad-related interruptions on DraftKings pages so users can complete login, account settings, and sync without being kicked out of modal dialogs. This could be achieved via the Chrome extension's `declarativeNetRequest` API to block doubleclick.net requests on DK pages, or via content script DOM manipulation to dismiss/prevent the ad overlays.

## Dependencies
None

## Open Questions
- Is `declarativeNetRequest` the right approach, or would a content script that removes/hides the ad overlay DOM elements be simpler and less likely to break DK functionality?
- Does blocking doubleclick.net have any side effects on DraftKings functionality (e.g., does DK use it for anything beyond ads)?
- Should this only activate on specific DK pages (login, account settings, mycontests) or globally on all DK pages the extension targets?
