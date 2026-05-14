# TASK-236: Prototype: iOS Draft Assistant latency + memory feasibility

**Status:** Draft
**Priority:** P1

---

## Objective
Bare ReplayKit + Vision + ActivityKit harness to measure end-to-end latency (frame capture -> OCR -> IPC -> state -> analysis -> Live Activity update) and S1 (broadcast extension) memory consumption across a real Underdog draft. Outcome is a single go/no-go signal: can the proposed iOS architecture hit iA2 (3-5s end-to-end on a 30s pick clock) within iA7 (~50MB extension ceiling)? No production code intended; the architecture doc itself flags this as 'profile before building anything else.' Gates T2 (Latency, 4.80) and T4 (S1 Memory, 4.55) - the two highest-scored themes in docs/systems-model/ios-draft-assistant/prioritization.md.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
