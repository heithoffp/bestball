# TASK-360: Mirror ADR-032 Arena scoping into mobile shared client

**Status:** Draft
**Priority:** P3

---

## Objective
TASK-359 narrowed the Arena pool to owned BBM7 teams on web (ADR-032): arena-register rejects non-featured owned teams and ignores board teams. mobile-app/shared/utils/arenaClient.js still sends board teams and does not filter owned to featured, so it ships payloads the server discards. Not broken (server authoritative) but out of lockstep. Update registerArenaTeams/registerAllArenaTeams to owned-only and filter the mobile Arena registration call site to isFeaturedSnapshot, matching best-ball-manager.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
