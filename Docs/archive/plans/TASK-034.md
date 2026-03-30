<!-- Completed: 2026-03-30 | Commit: 6beb23e -->
# TASK-034: Remove RB Protocol Blurbs from Draft Assistant

**Status:** Draft
**Priority:** P2

---

## Objective
Delete the RB_BLURBS dictionary and all rendering logic that shows prescriptive coaching text in DraftFlowAnalysis.jsx. The blurbs (Zero RB Protocol, Hyper Fragile Protocol, Hero RB Protocol) tell users what to do and how to draft, which violates the Mirror, Not Advisor design principle.

## Dependencies
None

## Open Questions
- Are any downstream components or utilities referencing RB_BLURBS keys? Verify no other file imports or uses this data.
