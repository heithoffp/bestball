# TASK-211: DraftExplorer.jsx — clear pre-existing lint debt

**Status:** Draft
**Priority:** P4

---

## Objective
DraftExplorer.jsx has 3 pre-existing lint errors (ensureRound import unused, comboResult var unused, colIdx arg unused) and 2 react-hooks/exhaustive-deps warnings on tier3Version. Surfaced during TASK-210; not in scope to fix there. Either remove the unused identifiers or wire them in (comboResult was likely intended for a tier1 frequency UI line that never shipped — confirm intent before deletion).

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
