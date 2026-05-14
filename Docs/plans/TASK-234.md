# TASK-234: ADR: iOS privacy vs operability resolution

**Status:** Draft
**Priority:** P1

---

## Objective
Resolve the structural tension between iA3 (privacy-first, no frames leave the phone) and iA6 (operational durability via remote-updatable config + diagnostic telemetry) for the proposed iOS Draft Assistant. Pass-2 systems-model interrogation quantified L5 config-update loop reliability at ~7.7% absent consented diagnostic uploads. This ADR decides whether the entire telemetry leg of L5 is viable. References finding F-025 in docs/systems-model/ios-draft-assistant/interrogation.md. Gating prerequisite for TASK-238 (L5 loop design).

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
