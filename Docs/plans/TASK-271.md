# TASK-271: Remove orphaned Eliminator CSS and unused model exports

**Status:** Draft
**Priority:** P4

---

## Objective
After the Eliminator minimization (TASK-269/270), dead CSS classes remain in EliminatorPanel.module.css and DraftFlowAnalysis.module.css (roster-shape, playbook, warn/ok/muted, onesie badge) and the extension's eliminatorModel.js still exports analyzeRosterShape/PLAYBOOK/ROSTER_SHAPE that the content script no longer uses. Harmless but worth trimming.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
