# TASK-238: L5 config-update loop design (gated on TASK-234)

**Status:** Draft
**Priority:** P1

---

## Objective
Detailed design for the iOS Draft Assistant config-update loop: consent flow (when/where/how diagnostic-upload consent is solicited and recorded), R2 review SLA (how fast must the developer triage A7 diagnostic events), regression-replay before publishing A2 config updates, rollback method when a bad config ships, and UI-churn detection (release-monitoring of host platforms). GATED: cannot start until TASK-234 (privacy ADR) completes - the consent decision determines the entire loop topology. Holds open Tier-1 theme T1 / findings F-003, F-015, F-031, F-037, F-039, F-040, F-041, F-051, F-055, F-056, F-062, F-063, F-064 in docs/systems-model/ios-draft-assistant/interrogation.md.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
