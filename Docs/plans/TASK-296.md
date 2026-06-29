# TASK-296: Arena public-launch data hardening (dedup + server-built snapshots)

**Status:** Draft
**Priority:** P3

---

## Objective
Before flipping beta_mode=false (public launch), resolve the two deferred limitations from ADR-014/015: (1) cross-user duplication - one user's owned team (keyed by pod id) and another user's board capture of that same seat (keyed by draftEntryId) create two arena_teams rows; (2) arena-register currently trusts client-built snapshots - rebuild board snapshots server-side from draft_boards_admin so content can't be forged. Harmless under the single-developer allowlist; required for a public, multi-user pool. Gated alongside TASK-290/291.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
