# TASK-176: DraftKings draft group to slate name mapping

**Status:** Draft
**Priority:** P3

---

## Objective
Currently all DK entries get a hardcoded slate title of "DK Pre-Draft". As more DK contest types emerge (e.g., in-season best ball, playoffs), the extension should derive slate names from contest metadata — either from the ContestName field in the /contest/mycontests endpoint, or via a configurable draft-group-to-slate mapping. This ensures entries are grouped correctly per slate in the portfolio analytics.

## Dependencies
None — TASK-160 (DK roster ingestion fix) is complete and provides the mycontests parsing infrastructure.

## Open Questions
- Should slate names be derived automatically from ContestName patterns (e.g., regex matching "Pre-Draft", "Playoff", etc.), or should there be a manual mapping table?
- What DK contest types exist beyond pre-draft best ball that would need distinct slate names?
