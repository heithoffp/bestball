# TASK-290: Arena board-team takedown/removal path

**Status:** Draft
**Priority:** P2

---

## Objective
ADR-014 guardrail: Provide a removal/takedown path for board (third-party) teams, since their subjects are non-users who cannot log in to unenroll. Handle a public removal request service-side (set enrolled=false or delete the row). Operationalizes the ADR-009 revisit condition (a user or UD objects).

## Dependencies
None

## Implementation (code complete — branch `arena-public-launch`)
New service-role admin script `scripts/arena-takedown.mjs`. Default action is
**unenroll** (`enrolled=false` — hidden from anon + authenticated reads, pairing,
and leaderboard via migration 014; Elo history kept, reversible); `--delete` hard-
erases the row (cascades `arena_matches`) for a legal/erasure request. Selectable by
`--team-id` / `--draft-id` / `--entry-ref` / `--user-hash` / `--user-id` (the last
hashes a raw UD userId with `ARENA_TOKEN_SECRET` to match `board_user_hash`). Board
rows only unless `--include-owned`. Dry-run by default; `--apply` to write. Usage
documented in `docs/Arena_Public_Launch_Runbook.md`. **Not verified** against prod.

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
