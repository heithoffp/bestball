# TASK-258: Chrome extension: capture full draft board at UD sync (ADR-009) and switch web read path off draft_boards_admin

**Status:** Draft
**Priority:** P3

---

## Objective
Per ADR-009 and the TASK-240 interim implementation: the customer extension already receives all 12 rosters in draft.picks at sync but discards 11/12. Persist the full pod board at sync time (shared board storage keyed by draft_id), point best-ball-manager/src/utils/draftBoards.js at the new source, then unblock TASK-252 (retire admin-extension + draft_boards_admin). Reuse the appearances/players join already in underdog-bridge.js normalizePick.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
