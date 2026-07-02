# TASK-309: Clear pre-existing ESLint errors: HelpOverlay setState-in-effect, AuthContext chrome global, capture-screenshots process global

**Status:** Draft
**Priority:** P4

---

## Objective
npm run lint currently exits 1 with 4 pre-existing errors outside DraftExplorer (which TASK-211 covers): HelpOverlay.jsx react-hooks/set-state-in-effect at line 125, AuthContext.jsx no-undef 'chrome' at lines 13/23 (needs a webextensions env or globals comment), scripts/capture-screenshots.js no-undef 'process' (needs node env). Surfaced during TASK-308 verification; a red lint baseline masks new regressions.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
