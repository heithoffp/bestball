<!-- Completed: 2026-03-30 | Commit: 6beb23e -->
# TASK-040: Rename LIFT parameter in Draft Assistant to descriptive label

**Status:** Draft
**Priority:** P2

---

## Objective
Replace the "LIFT" column label in DraftFlowAnalysis.jsx with a plain-English label that communicates the concept to lay users without jargon. LIFT currently represents how much value a player provides relative to their ADP — a concept meaningful to experienced drafters but opaque to general users.

## Dependencies
None

## Open Questions
- What is the exact definition of LIFT as currently computed? Confirm whether it is value-over-ADP, CLV delta, or another formula before choosing the label.
- Candidate labels: "Value Over ADP", "Draft Value", "ADP Edge", "Value Gained" — which best fits the actual metric?
- Does the label appear in tooltips, help text, or feature specs that also need updating?
