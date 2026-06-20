# TASK-276: DraftBoardModal: use platform-correct ADP/proj maps for DK boards

**Status:** Draft
**Priority:** P4

---

## Objective
DraftBoardModal hard-codes adpByPlatform.underdog (DraftBoardModal.jsx:64-65) for per-cell ADP and projected-points enrichment and the per-column avg-CLV summary. Once DK boards are captured (TASK-274), DK boards render correctly but their cells show Underdog ADP/CLV instead of DraftKings values. Thread the roster's platform into DraftBoardModal and select adpByPlatform.draftking for DK rosters (fallback to underdog). Cosmetic accuracy fix discovered during TASK-274; the DK board grid itself renders fine without it.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
