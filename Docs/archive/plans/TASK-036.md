<!-- Completed: 2026-03-30 | Commit: 6beb23e -->
# TASK-036: Remove archetype target weightings from rosterArchetypes.js

**Status:** Draft
**Priority:** P2

---

## Objective
Remove the `target` property from all archetype definitions in rosterArchetypes.js and eliminate any portfolio-target logic that consumes it. The target weightings encode an opinion about which archetypes are desirable, which violates the Mirror, Not Advisor design principle and is not being used in the product.

## Dependencies
None

## Open Questions
- Are there any components or utilities that read the `target` field from archetype definitions? Need to confirm all consumers before deletion.
