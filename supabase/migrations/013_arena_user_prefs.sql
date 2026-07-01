-- TASK-304 · ADR-016: Account-level Arena enrollment.
--
-- ADR-016 replaces per-team enrollment with ONE enrolled/unenrolled state per user:
-- a user is either in the Arena (all of their teams) or out (all of them), enrolled
-- by default. This table holds that single switch; the per-row arena_teams.enrolled
-- column remains the materialized state every read path (pairing, leaderboard, RLS)
-- keeps filtering on — the client bulk-applies the switch to its own rows, and the
-- registration/backfill paths consult this table when creating new owned rows.
--
-- A missing row means enrolled (the opt-out default). Rows are owner-managed;
-- service_role reads them during registration (arena-register) and backfill.
--
-- All statements idempotent — safe to re-run.

create table if not exists public.arena_user_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  enrolled   boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.arena_user_prefs enable row level security;

-- Data API grants (required for new public tables post-2026-10-30). No anon access:
-- prefs are meaningless without an account. Column-scoped writes mirror the
-- arena_teams pattern — clients can only ever set their own switch.
grant select on public.arena_user_prefs to authenticated;
grant insert (user_id, enrolled) on public.arena_user_prefs to authenticated;
grant update (enrolled, updated_at) on public.arena_user_prefs to authenticated;
grant select, insert, update, delete on public.arena_user_prefs to service_role;

drop policy if exists "Users read own arena prefs" on public.arena_user_prefs;
create policy "Users read own arena prefs"
  on public.arena_user_prefs for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users insert own arena prefs" on public.arena_user_prefs;
create policy "Users insert own arena prefs"
  on public.arena_user_prefs for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users update own arena prefs" on public.arena_user_prefs;
create policy "Users update own arena prefs"
  on public.arena_user_prefs for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
