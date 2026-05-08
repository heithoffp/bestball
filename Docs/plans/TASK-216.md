# TASK-216: Decide and execute Firefox distribution strategy (AMO listed vs. unlisted self-distribution signing)

**Status:** Draft
**Priority:** P2

---

## Objective
Firefox accepts .xpi installs from arbitrary URLs only if signed by Mozilla. Two paths: (1) AMO listed — public AMO listing with Mozilla review, risks the same gambling classification that killed the Chrome submission. (2) Unlisted self-distribution signing — Mozilla signs the package for self-hosted distribution without a public listing, lower review bar. Decision should be made before TASK-213 implementation so signing can happen in parallel with the install page build. Document the choice and rationale, then execute (submit for AMO review or initiate unlisted signing flow). Related: ADR-005, TASK-213.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
