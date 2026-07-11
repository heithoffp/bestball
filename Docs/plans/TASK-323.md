# TASK-323: In-app Draft Assistant screen and manual fallback mode

**Status:** Draft
**Priority:** P2

---

## Objective
The full-screen draft companion inside the RN app: consumes DraftState from the parse engine, renders portfolio-aware assistance by porting the web Draft Assistant analytics (archetype viability, stacks, exposure/ADP context), and provides Spike-Week-style manual pick entry as the graceful degradation path when OCR confidence drops or capture is unavailable (ADR-019 Option C fallback). Mirror-not-advisor boundaries per ADR-002 apply outside this opinionated surface.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
