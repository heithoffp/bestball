# TASK-205: Combos: render toolbar when tournament filter empties roster set

**Status:** Draft
**Priority:** P4

---

## Objective
If a user selects a tournament that excludes all rosters, ComboAnalysis early-returns with the No roster data EmptyState before the toolbar renders, so the user has no way to clear the over-restrictive filter. Render the toolbar (or a tournament-specific empty state) so the filter remains accessible.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
