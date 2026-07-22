# TASK-359: Narrow Arena pool to owned BBM7 teams (execute ADR-032)

**Status:** Pending Approval
**Priority:** P2 · **Size:** M · **Model:** Opus
**ADR:** [ADR-032](../adr/adr-032-narrow-the-arena-pool-to-a-single-featured-tournam.md) (supersedes ADR-016)

---

## Objective

Execute ADR-032: shrink `arena_teams` to only the teams the app actually surfaces —
`source='owned' AND featured=true` (Best Ball Mania VII) — and stop the two write paths
(`arena-register` Edge Function + `arena-backfill-pool.mjs`) from ever re-adding board rows
or non-featured teams. This reverts the ADR-016 full-database pool that is the dominant
contributor to Arena table size, memory, and Disk IO Budget pressure.

## Verification Criteria

1. **Pool is scoped.** After cleanup, `SELECT count(*) FROM arena_teams WHERE NOT (source='owned' AND featured=true)` returns **0**. All `source='board'` rows and all non-featured owned rows are gone.
2. **Writers can't re-widen it.** A post-deploy `arena-register` call (allowlisted account) that submits a non-featured owned team and a board team leaves the row count unchanged for those — non-featured owned is rejected, board input is ignored. The backfill script, run `--dry-run`, reports **0** board inserts and skips non-featured owned entries.
3. **The Arena still works on the retained pool.** Arena tab loads; leaderboard renders BBM7 teams; a vote pairing can be requested and cast (arena-pair/arena-vote unaffected).

## Verification Approach

**Pre-delete dry-run (mandatory before applying the cleanup):**
- In the Supabase SQL editor (or `psql`), run the count breakdown BEFORE deleting:
  ```sql
  select
    count(*) filter (where source='owned' and featured)                as keep,
    count(*) filter (where not (source='owned' and featured))          as delete_total,
    count(*) filter (where source='board')                             as board_rows,
    count(*) filter (where source='owned' and not featured)            as owned_nonfeatured
  from public.arena_teams;
  ```
  Confirm `keep` matches expectations and `delete_total = board_rows + owned_nonfeatured`. Record the numbers.

**Apply cleanup (migration 019):**
- Apply the migration (developer runs `supabase db push`, or pastes the migration SQL in the SQL editor). The migration wraps the DELETE in a transaction and `RAISE NOTICE`s the pre/post counts.
- Re-run Criterion 1's count query → expect `0`.
- Optional disk reclaim: `VACUUM (ANALYZE) public.arena_teams;` (or `VACUUM FULL` in a maintenance window — takes an exclusive lock, so not in the migration). Note deleting rows alone frees space for reuse but does not shrink the file until vacuumed.

**Deploy + re-ingestion guard:**
- `cd supabase && supabase functions deploy arena-register` (Edge Function changes need manual deploy).
- From an allowlisted account, exercise `registerArenaTeams` with (a) a non-featured owned team and (b) a board team; confirm response shows them rejected/ignored and the count query stays at `0` non-conforming.
- `node scripts/arena-backfill-pool.mjs` (dry-run) → confirm `boardInserts: 0` and non-featured owned entries are skipped.

**Functional smoke:**
- Load the Arena tab (allowlisted account), confirm the leaderboard renders and a vote pairing round can be requested and submitted.
- `cd best-ball-manager && npm run lint` passes.

## Files to Change

| File | Change |
|------|--------|
| `supabase/migrations/019_arena_scope_to_featured.sql` | **New.** Transactional DELETE of `arena_teams WHERE NOT (source='owned' AND featured=true)`, with `RAISE NOTICE` pre/post counts. Idempotent (re-run deletes 0). Comment references ADR-032 and the cascade behavior. |
| `supabase/functions/_shared/arena.ts` | Add `isFeaturedSnapshot(snapshot)` helper mirroring `arenaFeatured.js` + the migration-016 generated-column expression (regex `/best ball mania/i` over `tournamentTitle`/`slateTitle`). Keep-in-sync comment updated. |
| `supabase/functions/arena-register/index.ts` | Filter `ownedIn` to featured-only (count rejects in the response); **remove the board-team block entirely** (stop writing `source='board'`); **remove the now-dead claim-on-sync candidate query + claim branch** (no board rows remain to claim — also drops a per-register DB query). Response keeps `boardWritten:0`, `ownedClaimed:0` for shape stability. |
| `scripts/arena-backfill-pool.mjs` | Remove Phase 1 (board inserts) and the claim/merge logic; keep Phase 2 as a **featured-only owned** backfill (`isFeaturedSnapshot` gate on each entry's snapshot). Header comment updated to note ADR-016 superseded by ADR-032. |
| `best-ball-manager/src/components/Arena.jsx` + `src/utils/arenaClient.js` | (Client tidy) Stop sending board teams; filter owned to `isFeaturedSnapshot` before calling `registerArenaTeams`, so the client doesn't ship payloads the server will now discard. Server remains authoritative. |

## Implementation Approach

1. **Cleanup migration (019).** Single transaction:
   ```sql
   -- ADR-032: narrow arena_teams to the featured tournament (owned BBM7) only.
   -- arena_matches FKs are ON DELETE CASCADE (migration 011) → match history for
   -- deleted teams is removed automatically; winner_id is ON DELETE SET NULL.
   do $$
   declare before_ct bigint; after_ct bigint;
   begin
     select count(*) into before_ct from public.arena_teams;
     delete from public.arena_teams
      where not (source = 'owned' and featured);
     select count(*) into after_ct from public.arena_teams;
     raise notice 'arena_teams: % -> % rows (deleted %)', before_ct, after_ct, before_ct - after_ct;
   end $$;
   ```
   No schema change, no new grants (existing table). Idempotent by construction.

2. **`_shared/arena.ts` helper.** Add `isFeaturedSnapshot` next to `FEATURED_TOURNAMENT_LABEL`, reusing the same "best ball mania" match so all four sync points (this helper, `arenaFeatured.js`, migration 016's generated column, the label constant) agree.

3. **arena-register.** In the owned block, drop non-featured teams into a `ownedRejected` counter instead of `toInsert`. Delete the entire board block (`boardIn` still parsed for a graceful `boardRejected: boardIn.length` in the response, but nothing is written). Delete the claim-candidate `select` + claim `update` branch; every kept owned team is a plain insert. This also removes two service-role queries per call — a small IO win on the hot path.

4. **Backfill script.** Delete the Phase-1 board loop and the `claim`/`merge`/`releaseBoardRow` machinery; Phase 2 keeps only insert-new-owned, guarded by `isFeaturedSnapshot(team.snapshot)`. Keep the dry-run/`--apply` contract. `buildBoardTeams` import removed; `buildEnrollableTeams`/`playerNameKey` retained. (Shared helpers in `arenaSnapshot.js` are left in place — schema/board support stays dormant per ADR-032.)

5. **Client tidy.** In the register call site, filter owned to featured and pass an empty board list. This is defense-in-depth/bandwidth only; the server enforcement in step 3 is the real guard.

6. **Backlog follow-through (post-approval, via hus-backlog):** downgrade TASK-290 (takedown path) and TASK-291 (privacy work) from launch-blockers per ADR-032, since no admin-scraped third-party rosters remain in the pool.

## Rollback Approach

- **Code:** revert the commit (Edge Function + script + client).
- **Edge Function:** redeploy the prior `arena-register` build.
- **Data:** the DELETE is **not reversible** — deleted rows and their `arena_matches` history are gone. Mitigation: take a Supabase backup / `pg_dump public.arena_teams` (and `arena_matches`) **before** applying migration 019. This snapshot is the only restore path and should be captured as the first verification step.

## Manual Steps (require developer)

1. Take the pre-delete backup / `pg_dump` of `arena_teams` + `arena_matches`.
2. Run the pre-delete count query and confirm the numbers.
3. Apply migration 019.
4. (Optional) `VACUUM` to reclaim disk.
5. `supabase functions deploy arena-register`.
6. Run the post-deploy register + backfill dry-run checks.
