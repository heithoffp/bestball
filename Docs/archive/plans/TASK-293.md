<!-- Completed: 2026-06-28 | Commit: 8943358 -->
# TASK-293: Arena opt-out launch switch (flip arena_eligibility_mode)

**Status:** Pending Approval
**Priority:** P2

---

## Objective
ADR-014 launch gate: flip `arena_config.arena_eligibility_mode` to `opt_out`. Per ADR-015 this
flip is **safe to ship now because it ships behind the private-beta gate** (`beta_mode = true`):
the pool/leaderboard fill with all teams, but only allowlisted accounts can reach them.

## Plan
**Implemented as part of the consolidated lead plan — see [TASK-287](TASK-287.md).**
The flip is folded into migration 012:
`update arena_config set arena_eligibility_mode='opt_out', beta_mode=true where id=true;`.

**Scope boundary — the *public* flip is NOT this task.** Flipping `beta_mode = false` (true
public launch) remains gated on TASK-290 (takedown path) and TASK-291 (privacy/ToS) per
ADR-014 guardrails #2/#4 and ADR-015. That public flip is tracked separately and must not
happen here.

## Dependencies
TASK-287 (the flip is a statement in migration 012). Built together.
Public launch additionally blocked by TASK-290, TASK-291.

---
*Approved by: <!-- pending -->*
