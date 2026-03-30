<!-- Completed: 2026-03-30 | Commit: 6beb23e -->
# TASK-038: Remove Grading System and Spike Points from Roster Viewer

**Status:** Draft
**Priority:** P2

---

## Objective
Delete computeLetterGrade(), rosterGrades memo, useSpikeWorker hook, spikeWeekProjection utility, and all associated sort columns and UI from RosterViewer.jsx. The letter grade system (A+–D) is opinionated and the Spike Points metric is not considered a reliable signal. These are tightly coupled through the composite grade formula and should be removed together.

## Dependencies
None

## Open Questions
- Does useSpikeWorker live in its own hook file that can be fully deleted, or is it shared?
- Does spikeWeekProjection.js contain any logic reused outside of RosterViewer?
- After removal, what sort options remain in the Roster Viewer sort UI? Verify the sort dropdown/controls are still coherent.
