-- TASK-359 / ADR-032: narrow the Arena pool to the featured tournament (owned BBM7).
--
-- ADR-016 backfilled the ENTIRE database into arena_teams (every draft_boards_admin
-- seat as an ownerless source='board' row, plus every extension_entries roster as an
-- owned row). Demand for that breadth did not materialize, and it is the dominant
-- contributor to arena_teams size / memory / Disk IO Budget pressure. ADR-032 reverts
-- the pool to only what the app actually surfaces and votes on: owned teams belonging
-- to the featured tournament (Best Ball Mania VII), identified by the `featured`
-- STORED GENERATED column (migration 016).
--
-- This deletes:
--   * every source='board' row (the admin-scraper + participant-capture backfill), and
--   * every non-featured owned row.
--
-- arena_matches references arena_teams with ON DELETE CASCADE on team_a_id/team_b_id
-- (migration 011), so match history for deleted teams is removed automatically — no
-- orphaned match rows. winner_id is ON DELETE SET NULL. The discarded Elo/match
-- history is intentional and NOT recoverable after this runs — take a backup first.
--
-- Board-row SCHEMA is intentionally retained (source, board_entry_ref, board_user_hash,
-- draft_id, nullable user_id/entry_id). We stop populating it (see arena-register and
-- scripts/arena-backfill-pool.mjs) rather than dropping columns, so a future
-- multi-tournament pool is a re-decision, not a rebuild.
--
-- Idempotent: a re-run deletes 0 rows once the pool is scoped.

do $$
declare
  before_ct bigint;
  after_ct  bigint;
begin
  select count(*) into before_ct from public.arena_teams;

  delete from public.arena_teams
   where not (source = 'owned' and featured);

  select count(*) into after_ct from public.arena_teams;

  raise notice 'arena_teams scoped to featured owned: % -> % rows (deleted %)',
    before_ct, after_ct, before_ct - after_ct;
end $$;

-- NOTE: DELETE frees space for reuse within the table but does not shrink the on-disk
-- file. To reclaim disk after a large delete, run in a maintenance window (cannot run
-- inside this migration's implicit transaction, and VACUUM FULL takes an exclusive lock):
--   VACUUM (ANALYZE) public.arena_teams;   -- light: updates stats, frees for reuse
--   VACUUM FULL public.arena_teams;        -- heavy: rewrites the table, returns disk to OS
