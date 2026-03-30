<!-- Completed: 2026-03-30 | Commit: 6beb23e -->
# TASK-033: Neutralize correlation color scale in Draft Assistant

**Status:** Draft
**Priority:** P2

---

## Objective
Replace the red/amber/green traffic-light color scheme on correlation percentage displays in DraftFlowAnalysis.jsx with a neutral single-hue intensity-based scheme. The current scheme implies high correlation is "bad" and low correlation is "good," which violates the Mirror, Not Advisor design principle.

## Dependencies
None

## Open Questions
- What neutral color family to use (blue/gray/slate)?
- Should zero/no-picks state retain its current neutral gray, or be unified with the new scheme?
