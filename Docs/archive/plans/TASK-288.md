<!-- Completed: 2026-06-28 | Commit: 8943358 -->
# TASK-288: Arena auto-registration of synced + board teams (opt-out ingestion)

**Status:** Pending Approval
**Priority:** P2

---

## Objective
ADR-014: On Arena load, auto-register `arena_teams` rows with frozen anonymized snapshots
for both the user's own entries (`extension_entries`) and the ADR-009 participant-captured
board teams (the other 11 pod rosters). Exclude residual `source='admin_scraper'` boards
(guardrail #3). Store UD `draftEntryId`/`userId` used for dedupe in service-role-only columns
(`board_entry_ref`, salted `board_user_hash`), never client-readable.

## Plan
**Implemented as part of the consolidated lead plan — see [TASK-287](TASK-287.md).**
This task's deliverables: the new `arena-register` Edge Function (service-role ingestion,
beta-gated, with the `source='extension'` guardrail check), `arenaSnapshot.buildBoardTeams`,
`arenaClient.registerArenaTeams`, and the once-per-session registration call wired into
`Arena.jsx`. Verification, files, and approach are in TASK-287.

## Dependencies
TASK-287 (migration 012 — provides the schema/columns this ingestion writes to). Built together.

---
*Approved by: <!-- pending -->*
