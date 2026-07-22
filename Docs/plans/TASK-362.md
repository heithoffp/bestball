# TASK-362: Web app automated test suite missing (CLAUDE.md claims Playwright)

**Status:** Draft
**Priority:** P3

---

## Objective
Discovered during TASK-361 verification: best-ball-manager has no playwright.config, no spec files, and no npm test script, yet CLAUDE.md lists 'npx playwright test' as a key command. Either stand up a minimal Playwright smoke suite (landing page, demo load, tab navigation) or correct CLAUDE.md to stop promising a suite that does not exist.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
