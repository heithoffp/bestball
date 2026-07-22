# ADR-032: Narrow the Arena pool to a single featured tournament (BBM7)

**Date:** 2026-07-22
**Status:** Accepted

---

## Context

ADR-016 (2026-07-01) decided that the Best Ball Arena pool would be *the entire database*: a re-runnable service-role backfill enrolls every roster in `draft_boards_admin` (both admin-scraped and extension-captured) and every roster in `extension_entries` into `arena_teams`, permanently, defaulting to enrolled. The goal was pool depth — matchmaking variety and a meaningful leaderboard that didn't depend on which pods the viewer personally drafted.

Three months of beta operation have changed the calculus:

- **The demand isn't there.** The broader multi-tournament / ownerless-board pool has not produced the engagement that justified its cost. The surfaces that users actually see — the leaderboard and the vote-pairing queue — are already scoped to `source='owned' AND featured=true` (Best Ball Mania VII) via the `featured` generated column (migration 016). The rest of the table is enrolled but effectively invisible.

- **It's the dominant cost driver.** The full-database backfill is the single largest contributor to `arena_teams` row count, table/index memory, and Disk IO Budget pressure (the 2026-07-09 depletion that prompted migration 016 and ADR-018). Ownerless board rows carry a fat `display_snapshot` JSONB each and buy no current user-facing value.

- **It carries a permanent consent liability.** ADR-016's heaviest cost was republishing admin-scraped third-party rosters (the retired ADR-008 corpus) without participant authorization — making the takedown path (TASK-290) and privacy/ToS work (TASK-291) hard launch-blockers. Narrowing to owned BBM7 teams removes the scraped-board rows entirely and largely dissolves that exposure.

The `featured` column matches any `display_snapshot` title containing "best ball mania"; this season that set is exactly BBM7 (Best Ball Mania VII), the current featured slate.

## Decision

Narrow the Arena pool from the full database back to a single-tournament scope: **only `source='owned' AND featured=true` teams** are retained and ingested.

1. **One-time cleanup** — delete every `arena_teams` row that is not (`source='owned' AND featured=true`). This removes all ownerless `source='board'` rows from the ADR-016 backfill and all non-featured owned rows.

2. **Block re-ingestion** — `arena-register` and the backfill/admin script reject non-featured teams and stop writing board rows, so the table stays scoped after future syncs and backfill runs.

Board-row schema (`source`, `board_entry_ref`, `board_user_hash`, `draft_id`, nullable `user_id`/`entry_id`) is **left in place**; we stop populating it rather than dropping columns, keeping the revert cheap.

This **supersedes ADR-016** and **narrows ADR-014** — opt-out, account-level enrollment still stands, but the pool a user's teams enter is single-tournament rather than all-tournaments.

## Alternatives Considered

### Option A: Narrow to owned BBM7 only, one-time delete + block re-ingestion (Chosen)

- **Pros:** Maximum reduction in row count / memory / Disk IO — cuts exactly the rows nothing surfaces today. Removes the scraped-third-party-roster liability, unblocking launch without building TASK-290/291 first. Keeps the schema so a future multi-tournament pool is a re-decision, not a rebuild.
- **Cons:** Reverses a decision made only three weeks ago. Discards accumulated Elo/match history for non-featured and board teams (they aren't shown, but the history is gone). If a future tournament is featured, its pool starts empty and must accumulate votes from scratch.

### Option B: One-time cleanup only, leave ingestion as-is

- **Pros:** Smallest change; no Edge Function or script edits.
- **Cons:** Non-BBM7 and board rows re-accumulate on the next sync or backfill run, so the memory/IO win is temporary. Doesn't actually revert ADR-016's intent — just its current data.

### Option C: Keep all `featured=true` rows including board rows

- **Pros:** Retains BBM7 board rows in case pairing/leaderboard later use them.
- **Cons:** Board rows are the bulk of the weight and nothing surfaces them today; keeping them forfeits most of the memory win for a hypothetical future use. Retains the scraped-roster consent liability for the featured slate.

### Option D: Soft-scope (set `enrolled=false` instead of deleting)

- **Pros:** Reversible; preserves history.
- **Cons:** Rows still occupy the table and its `display_snapshot` JSONB, so table size and detoast/IO pressure barely improve — which is the whole point. Fails the stated goal.

## Consequences

### Positive

- Immediate, durable drop in `arena_teams` size, index footprint, and Disk IO Budget pressure — the table becomes just the owned BBM7 teams the app actually shows and votes on.
- ADR-016's launch-blocking consent work (TASK-290 takedown, TASK-291 privacy disclosure of admin-collected data) is largely dissolved: no admin-scraped third-party rosters remain in the pool.
- Simpler mental model: "the Arena is the current featured tournament," matching what users already see.

### Negative

- Elo/match history for deleted teams is permanently lost (not shown today, but unrecoverable after the delete).
- Reverses a recent Accepted decision; ADR-016's backfill script and claim-on-sync logic become dormant/partly dead code that a follow-up task must prune or gate.
- Claim-on-sync (ADR-016 refinement #2) loses most of its purpose once board rows are gone — a late-arriving owner has no ownerless board row to inherit.

### Risks

- **Featuring a different tournament later** means an empty starting pool for it and a `featured`-column redefinition (generation expressions can't be altered in place — drop/re-add per migration 016's note). Revisit this ADR if the product moves to a rotating/multi-tournament Arena.
- **Deletion scope error** — the cleanup must be exercised against the exact predicate (`NOT (source='owned' AND featured=true)`) and previewed with a `SELECT count(*)` before the `DELETE`. A wrong predicate could delete owned BBM7 teams. Mitigation: the task plan runs a counting dry-run first.
- **Re-ingestion gap** — if `arena-register` and the backfill script aren't both updated, board/non-featured rows creep back. Both writers must be changed together.

## Revisit Conditions

- The product moves to a rotating or multi-tournament Arena — reconsider a broader pool (and the `featured`-column redefinition it requires).
- Underdog or an affected user objects, or engagement data later justifies pool depth again.
- Board rows or claim-on-sync are wanted for a new feature — the schema is retained, so this is a re-enable rather than a rebuild.

## Related

- ADRs: **Supersedes ADR-016.** Narrows ADR-014 (opt-out/account-level enrollment stands; pool becomes single-tournament). Relates to ADR-008/009 (scraped-corpus republication consciously wound back), ADR-013/015 (Arena pillar + beta gate unchanged), ADR-018 (prior Disk IO remediation).
- Tasks: follow-up via hus-backlog — cleanup migration (dry-run then delete), `arena-register` + backfill guard, prune/gate dormant claim-on-sync code. TASK-290/291 downgraded from launch-blockers.

---
*Approved by: Patrick H. — 2026-07-22*
