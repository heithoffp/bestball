# TASK-272: Add ESLint config to the Chrome extension

**Status:** Draft
**Priority:** P3

---

## Objective
chrome-extension/ has no ESLint config or lint script, so extension source is never linted (the hus-goal verification for TASK-270 could only run the build). Add a flat ESLint config with browser+webextension globals and a lint script so future extension edits are caught.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->

## Scope Items

### Add ESLint config to mobile-app (discovered in TASK-337: no lint exists there, verification fell back to esbuild parse-checks)
- **Added:** 2026-07-16
- **Verification:** cd mobile-app && npx eslint src scripts exits 0
