<!-- Completed: 2026-07-02 | Commit: f5bb972 (verified shipped in 2026-07-02 launch review) -->
# TASK-298: Arena player headshots (external image source)

**Status:** Draft
**Priority:** P3

---

## Objective
Add real player headshots to Arena roster rows, replacing the monogram fallback when a face resolves. Snapshot carries only name/team/position, so this needs an external name->player-ID source (e.g. Sleeper CDN, no API key) plus a maintained name->ID map. Requires an ADR for introducing the external image dependency before implementation. Depends on TASK-297 (which ships the monogram fallback the headshot enhances).

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
