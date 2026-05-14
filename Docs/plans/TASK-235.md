# TASK-235: ADR: iOS analysis subsystem residence (wakeability)

**Status:** Draft
**Priority:** P1

---

## Objective
Decide whether the Analysis Engine (P7) and Draft State Engine (P6) for the proposed iOS Draft Assistant remain in the main app, or move (partly) into the broadcast extension. iOS background execution may not consistently grant the main-app process wakeable time during a live draft. The systems-model revision added P13/P14/P15 to S1 (extension) while also adding state-semantics complexity (A1 confidence/status schema, L6 override-learning) that argues against extension residence. Affects S1/S2/S3 boundaries and 50MB allocation strategy. References finding F-027 in docs/systems-model/ios-draft-assistant/interrogation.md.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
