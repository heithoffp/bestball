-- TASK-315 / TASK-316: Disk IO Budget remediation (2026-07-09 depletion email).
--
-- Two changes, shipped together because they were diagnosed together:
--
--   1. arena_teams.featured — a STORED GENERATED column materializing the
--      "featured tournament" (Best Ball Mania) match that arena-pair and every
--      leaderboard surface previously recomputed per request with
--      `ilike '%best ball mania%'` over display_snapshot extractions. Those
--      filters forced a detoast scan of the whole enrolled pool (~5,400 rows ×
--      ~2 KB JSONB, 250–550 ms measured) on every pairing request and
--      leaderboard view. Snapshots are frozen at registration, so the match is
--      a write-time fact; a generated column keeps every write path (the
--      arena-register Edge Function, direct client inserts, backfill scripts)
--      correct with no code changes. Partial indexes below serve the two hot
--      query shapes directly.
--
--      KEEP IN SYNC: the pattern mirrors FEATURED_TOURNAMENT_LABEL in
--      supabase/functions/_shared/arena.ts and
--      best-ball-manager/src/utils/arenaFeatured.js. Featuring a different
--      tournament later means dropping and re-adding this generated column
--      (generation expressions cannot be altered in place).
--
--   2. Storage policy for the private `app-data` bucket, which holds the
--      precomputed combo-boards artifact (scripts/build-combo-boards.mjs).
--      The artifact replaces the client's full-table download of
--      draft_boards_admin (~62 MB of picks JSONB per app load — the dominant
--      IO consumer). Authenticated-only read matches the access boundary of
--      the table it replaces; guests keep resolving to empty combo tables.
--
-- All statements idempotent — safe to re-run.

-- ---------------------------------------------------------------------------
-- arena_teams.featured (stored generated) + partial indexes
-- ---------------------------------------------------------------------------
-- NOTE: adding a stored generated column rewrites the table (one-time, ~16k
-- rows) and backfills every existing row — no separate UPDATE needed.
alter table public.arena_teams
  add column if not exists featured boolean
  generated always as (
    position('best ball mania' in lower(coalesce(display_snapshot->>'tournamentTitle', ''))) > 0
    or position('best ball mania' in lower(coalesce(display_snapshot->>'slateTitle', ''))) > 0
  ) stored;

-- arena-pair pool: order by matches asc limit N over the votable featured pool.
create index if not exists arena_teams_pair_pool_idx
  on public.arena_teams (matches)
  where enrolled and source = 'owned' and featured;

-- Leaderboard page + rank counts: elo desc over the same pool.
create index if not exists arena_teams_featured_lb_idx
  on public.arena_teams (elo desc)
  where enrolled and source = 'owned' and featured;

-- Migration 012 made the client SELECT column-scoped, so the new column needs
-- an explicit grant to be readable through PostgREST.
grant select (featured) on public.arena_teams to anon, authenticated;

-- ---------------------------------------------------------------------------
-- app-data bucket: authenticated reads
-- ---------------------------------------------------------------------------
-- The bucket itself is created (private) by scripts/build-combo-boards.mjs;
-- service_role bypasses RLS for the upload. This policy is what lets signed-in
-- app users download the artifact.
drop policy if exists "Authenticated read app-data" on storage.objects;
create policy "Authenticated read app-data"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'app-data');
