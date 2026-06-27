# TASK-294: Arena private-beta allowlist gate (ADR-015)

**Status:** Pending Approval
**Priority:** P2

---

## Objective
ADR-015: gate every Arena surface — nav tab + `/arena` route, the `arena-pair`/`arena-vote`/
`arena-register` Edge Functions, and `arena_teams` reads — behind an email allowlist while
`arena_config.beta_mode = true`. Enforced server-side (Edge Functions `403` non-allowlisted
callers; RLS restricts reads to allowlisted JWT emails) **and** in the frontend (tab/route
hidden). Guest voting is suspended during beta. This contains the opt-out + board-team build
to the developer's own accounts so no third-party roster is published publicly, and **defers
(does not remove)** ADR-014 guardrails #2 (TASK-290 takedown) and #4 (TASK-291 privacy/ToS) —
which become blockers for flipping `beta_mode = false`.

## Plan
**Implemented as part of the consolidated lead plan — see [TASK-287](TASK-287.md).**
This task's deliverables: `arena_config.beta_mode`/`beta_allowlist` + the `arena_beta_mode()` /
`arena_email_allowed()` SQL helpers + the beta-gated RLS (migration 012); the `betaGate` helper
in `_shared/arena.ts` and its enforcement in all three Edge Functions; and the `arenaBeta.js`
frontend gate wired into `App.jsx`. Verification, files, and approach are in TASK-287.

## Dependencies
TASK-287 (gate spans migration 012 + functions + frontend). Built together.

---
*Approved by: <!-- pending -->*
