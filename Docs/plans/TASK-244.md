# TASK-244: Admin scraper — scheduled background runs via chrome.alarms

**Status:** Draft
**Priority:** P3

---

## Objective
Add the alarm-driven scheduler deferred from TASK-241. Runs every 6 hours biased to off-peak (09:00 / 15:00 / 21:00 / 03:00 UTC), within ADR-008's binding rate budget. Adds the 'alarms' permission to admin-extension/manifest.json and an alarm handler in src/background.js that invokes the existing runScraper(). Persists run history.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
