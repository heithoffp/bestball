-- TASK-296 / TASK-285 · ADR-013 amendment: Arena public-launch data hardening.
--
-- The 2026-07-02 launch review found three data-layer exposures that are harmless
-- under the single-developer beta allowlist but unsafe once beta_mode=false opens
-- arena_teams to a real multi-user public pool. This migration closes them at the
-- grant layer (the durable boundary — RLS + Edge Function checks are defense in
-- depth on top). Apply BEFORE flipping beta_mode=false (see the TASK-310 runbook).
--
--   1. Direct PostgREST snapshot injection (TASK-296 #2). Migration 011 granted
--      authenticated INSERT (incl. display_snapshot, enrolled) and UPDATE (incl.
--      display_snapshot). A client could insert enrolled=true rows with a forged
--      snapshot (arbitrary "player" strings, tournamentTitle "Best Ball Mania …")
--      that enter the featured pairing pool and are shown blind to every voter, or
--      rewrite an already-rated team's public snapshot at will. Registration is
--      entirely server-side now (arena-register / service_role) and no client code
--      inserts arena_teams, so we REVOKE client INSERT outright and narrow UPDATE to
--      only the enrollment switch. display_snapshot becomes service-role-write only.
--
--   2. Anon user_id grouping (TASK-296 #3). Migration 012's client SELECT grant
--      included user_id for anon. Post-beta a logged-out API caller could group
--      arena_teams by user_id and reconstruct an account's entire portfolio (one
--      self-identified roster de-anonymizes all of that user's teams). Drop user_id
--      from the ANON grant; authenticated keeps it (self-match check, My Teams,
--      "your rank"). The browser leaderboard read only selects user_id when signed
--      in (see arenaClient.getLeaderboard).
--
--   3. Guest-vote integrity IP backstop (TASK-285 hybrid). Both durable guest
--      guards (the counted-vote cap and the per-minute rate limit) keyed only on the
--      client-invented voter_guest_id, so a rotating guestId reset both. Add a
--      service-role-only voter_ip_hash column (salted HMAC of the client IP, written
--      by arena-vote) so the cap + rate limit can key on min(guestId, ipHash).
--
-- All statements idempotent — safe to re-run.

-- ---------------------------------------------------------------------------
-- 1 + 2. arena_teams grants
-- ---------------------------------------------------------------------------

-- Writes: registration is service-role-only (arena-register). Clients may flip
-- ONLY the enrollment switch on their own rows (RLS still scopes to source='owned').
-- display_snapshot is no longer client-writable → no forged public snapshots.
revoke insert on public.arena_teams from authenticated;
revoke update on public.arena_teams from authenticated;
grant update (enrolled, updated_at) on public.arena_teams to authenticated;

-- Anon reads: same columns as before MINUS user_id (no cross-account grouping).
-- authenticated's grant from migration 012 is unchanged (it still includes user_id).
revoke select on public.arena_teams from anon;
grant select (
  id, entry_id, platform, display_snapshot, enrolled,
  elo, matches, wins, losses, provisional, source, draft_id, created_at, updated_at
) on public.arena_teams to anon;

-- The now-unreachable client INSERT policy is left in place (harmless — the grant
-- is the boundary), but drop it to keep intent honest: clients cannot insert.
drop policy if exists "Users insert own arena teams" on public.arena_teams;

-- ---------------------------------------------------------------------------
-- 3. arena_matches.voter_ip_hash (service-role-write; salted HMAC of client IP)
-- ---------------------------------------------------------------------------
alter table public.arena_matches add column if not exists voter_ip_hash text;

-- Durable guest cap by IP: count a hash's prior COUNTED votes quickly.
create index if not exists arena_matches_ip_counted_idx
  on public.arena_matches (voter_ip_hash)
  where counted and voter_ip_hash is not null;

-- Durable per-IP rate limit: recent matches from a hash.
create index if not exists arena_matches_ip_created_idx
  on public.arena_matches (voter_ip_hash, created_at desc)
  where voter_ip_hash is not null;

-- No new client grant: voter_ip_hash is written only by arena-vote (service_role).
-- authenticated retains migration 011's whole-table SELECT on arena_matches (own
-- rows via RLS); reading one's own salted IP hash is harmless.
