-- TASK-361: Supabase Disk IO reduction, round 2 (follow-up to TASK-315/316).
--
-- Four changes, diagnosed together from the 2026-07-22 deep dive:
--
--   1. Drop public.subscriptions from the supabase_realtime publication. The only
--      consumer was SubscriptionContext.jsx's postgres_changes channel, replaced by
--      a post-checkout poll + refocus refetch in the same task. The channel kept
--      Realtime's WAL pollers running for every signed-in session — the single
--      largest sustained load on the instance (9.1M poll queries since March).
--
--   2. Rewrite RLS policies so auth.uid() / arena_beta_mode() / arena_email_allowed()
--      evaluate once per query (initplan) instead of once per row. The per-row form
--      put 3.3M index scans on the 1-row arena_config table and was flagged by the
--      auth_rls_initplan advisor on every table. Behavior is identical (ADR-017
--      gates unchanged); only evaluation cost changes.
--
--   3. Index the arena_matches team FKs (advisor: unindexed_foreign_keys) and drop
--      two never-used subscriptions indexes (write amplification, zero reads;
--      idx_subscriptions_apple_original_transaction_id duplicated the unique
--      constraint subscriptions_apple_original_transaction_id_key).
--
--   4. draft_boards_admin.first_pick_name — a STORED generated column so board
--      "usability" checks (extension readBoardIds) stop detoasting the full ~15 KB
--      picks JSONB per row just to read one name. Same pattern as
--      arena_teams.featured from TASK-315/316. Backfills existing rows via the
--      ALTER's table rewrite.

-- ── 1. Realtime off for subscriptions ────────────────────────────────────────

alter publication supabase_realtime drop table public.subscriptions;

-- ── 2. RLS: constant-cost policy evaluation ──────────────────────────────────

alter policy "Users can read own subscription" on public.subscriptions
  using ((select auth.uid()) = user_id);

alter policy "Users can read own profile" on public.profiles
  using ((select auth.uid()) = id);

alter policy "Users can manage their own entries" on public.extension_entries
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users can read own rankings" on public.user_rankings
  using ((select auth.uid()) = user_id);

alter policy "Users can update own rankings" on public.user_rankings
  using ((select auth.uid()) = user_id);

alter policy "Users can upsert own rankings" on public.user_rankings
  with check ((select auth.uid()) = user_id);

alter policy "Users read own arena matches" on public.arena_matches
  using (voter_id = (select auth.uid()));

-- The anon policy was not advisor-flagged (the linter only detects auth.* /
-- current_setting), but arena_beta_mode() has the same per-row cost — wrap it too.
alter policy "Anon arena read (beta-gated)" on public.arena_teams
  using (
    case
      when (select arena_beta_mode()) then false
      else (enrolled = true)
    end
  );

alter policy "Auth arena read (beta-gated)" on public.arena_teams
  using (
    case
      when (select arena_beta_mode()) then (select arena_email_allowed())
      else ((enrolled = true) or (user_id = (select auth.uid())))
    end
  );

alter policy "Users update own arena teams" on public.arena_teams
  using ((user_id = (select auth.uid())) and (source = 'owned'::text))
  with check ((user_id = (select auth.uid())) and (source = 'owned'::text));

alter policy "Users read own arena prefs" on public.arena_user_prefs
  using (user_id = (select auth.uid()));

alter policy "Users insert own arena prefs" on public.arena_user_prefs
  with check (user_id = (select auth.uid()));

alter policy "Users update own arena prefs" on public.arena_user_prefs
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── 3. Index hygiene ─────────────────────────────────────────────────────────

create index if not exists arena_matches_team_a_id_idx on public.arena_matches (team_a_id);
create index if not exists arena_matches_team_b_id_idx on public.arena_matches (team_b_id);
create index if not exists arena_matches_winner_id_idx on public.arena_matches (winner_id);

drop index if exists public.idx_subscriptions_apple_original_transaction_id;
drop index if exists public.idx_subscriptions_stripe_customer_id;

-- ── 4. TOAST-free board availability ─────────────────────────────────────────

alter table public.draft_boards_admin
  add column if not exists first_pick_name text
    generated always as (picks -> 0 ->> 'name') stored;
