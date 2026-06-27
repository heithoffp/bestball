# TASK-289: Arena default leaderboard visibility (drop enrolled filter)

**Status:** Pending Approval
**Priority:** P2

---

## Objective
ADR-014: Make auto-enrolled teams visible on the leaderboard by default — stop filtering
`enrolled = true` in `arenaClient.getLeaderboard` and in the `arena_teams` SELECT RLS from
migration 011. Reconcile with the unenroll path so withdrawn teams disappear. During the
private beta the same RLS additionally restricts reads to allowlisted accounts (ADR-015).

## Plan
**Implemented as part of the consolidated lead plan — see [TASK-287](TASK-287.md).**
This task's deliverables: drop the `.eq('enrolled', true)` filter in `getLeaderboard`, and the
RLS rewrite in migration 012 (the `case when arena_beta_mode() …` SELECT policies that replace
the 011 `enrolled`-only policies). Verification, files, and approach are in TASK-287.

## Dependencies
TASK-287 (RLS lives in migration 012). Built together.

---
*Approved by: <!-- pending -->*
