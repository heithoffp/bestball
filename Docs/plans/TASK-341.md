# TASK-341: Fix failing slow-draft replay glance-format checks (target format + exposure cell)

**Status:** Draft
**Priority:** P3

---

## Objective
npm run test:draft fails 2 checks in test-slow-draft-replay.mjs on a clean tree (verified against main with no working-tree changes, 2026-07-16): 'every target is POS-LastName-EXP-FLAGS' and 'exposure renders in the cell'. Pre-existing — unrelated to TASK-339, likely fallout from the TASK-336/337 glance table redesign. Fix the engine glance format or update the replay assertions to the intended format.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
