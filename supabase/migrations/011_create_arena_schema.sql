-- TASK-280 / ADR-013: Best Ball Arena data model.
--
-- The Arena is a server-backed competitive layer: visitors vote on blind
-- head-to-head roster matchups, and every eligible team carries a hidden,
-- server-computed Elo. A team appears on the public leaderboard only when its
-- owner enrolls it (opt-in default). See docs/migrations/arena-data-model.md.
--
-- Three tables:
--   - arena_teams   : one row per (user_id, entry_id, platform). Holds the
--                     anonymized display snapshot, the enroll flag, and the
--                     hidden Elo standings. Rating columns are service_role-write
--                     only — clients can never move their own (or anyone's) Elo.
--   - arena_matches : one row per counted/recorded vote (the match record).
--                     Written only by the arena-vote Edge Function (service_role).
--                     `pairing_id` is unique — the DB-level replay/dedupe guard.
--   - arena_config  : a singleton row holding `arena_eligibility_mode`
--                     ('opt_in' | 'opt_out'). The pairing function reads it to
--                     choose the eligible pool; flipping modes needs no schema
--                     change (ADR-013).
--
-- Access pattern (per CLAUDE.md post-2026-10-30 grant rule — RLS alone is not
-- sufficient; every public table needs explicit grants matched to callsites):
--   - anon:          SELECT enrolled teams + config (free leaderboard + guest
--                    voting flows; vote/pair go through Edge Functions).
--   - authenticated: SELECT enrolled teams + own teams; INSERT/UPDATE only the
--                    NON-rating columns of their OWN team rows (enroll/snapshot).
--                    SELECT own match history.
--   - service_role:  full DML (Edge Functions: pairing, vote ingestion, Elo).
--
-- The rating columns (elo, matches, wins, losses, provisional) are protected by
-- WITHHOLDING the column-level INSERT/UPDATE grant from anon/authenticated:
-- clients may insert/update only (enrolled, display_snapshot, ...) so elo et al.
-- always take their server-controlled defaults and can only change via
-- service_role inside an Edge Function. This is the tamper-proofing core of
-- ADR-013 ("a leaderboard whose ratings any client can write is worthless").
--
-- All statements idempotent — safe to re-run against an existing project.

-- ---------------------------------------------------------------------------
-- arena_teams
-- ---------------------------------------------------------------------------
create table if not exists public.arena_teams (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  entry_id        text not null,                 -- logical roster id (extension_entries.entry_id)
  platform        text not null check (platform in ('underdog', 'draftkings')),
  display_snapshot jsonb not null,               -- anonymized render payload, frozen at enroll
  enrolled        boolean not null default false,
  -- standings (service_role-write only — see grants below)
  elo             numeric not null default 1500,
  matches         integer not null default 0,
  wins            integer not null default 0,
  losses          integer not null default 0,
  provisional     boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, entry_id, platform)
);

-- Matchmaking range scan: comparable opponent = same platform, nearby elo.
create index if not exists arena_teams_platform_elo_idx
  on public.arena_teams (platform, elo);

-- Leaderboard / eligible-pool scan: only enrolled teams.
create index if not exists arena_teams_enrolled_idx
  on public.arena_teams (platform, elo desc)
  where enrolled;

alter table public.arena_teams enable row level security;

-- Grants. Clients get SELECT plus column-scoped INSERT/UPDATE that EXCLUDES the
-- rating columns; service_role gets full DML.
grant select on public.arena_teams to anon, authenticated;
grant insert (user_id, entry_id, platform, display_snapshot, enrolled)
  on public.arena_teams to authenticated;
grant update (display_snapshot, enrolled, updated_at)
  on public.arena_teams to authenticated;
grant select, insert, update, delete on public.arena_teams to service_role;

-- RLS: anon sees only enrolled teams (leaderboard). authenticated sees enrolled
-- teams plus their own (for the My Teams / enroll panel).
drop policy if exists "Anon reads enrolled arena teams" on public.arena_teams;
create policy "Anon reads enrolled arena teams"
  on public.arena_teams for select
  to anon
  using (enrolled = true);

drop policy if exists "Users read enrolled or own arena teams" on public.arena_teams;
create policy "Users read enrolled or own arena teams"
  on public.arena_teams for select
  to authenticated
  using (enrolled = true or user_id = auth.uid());

-- Owner-only writes. The column grants above already make elo/matches/etc.
-- unreachable; these policies bound writes to the caller's own rows.
drop policy if exists "Users insert own arena teams" on public.arena_teams;
create policy "Users insert own arena teams"
  on public.arena_teams for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users update own arena teams" on public.arena_teams;
create policy "Users update own arena teams"
  on public.arena_teams for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- arena_matches
-- ---------------------------------------------------------------------------
create table if not exists public.arena_matches (
  id              uuid primary key default gen_random_uuid(),
  pairing_id      uuid not null unique,          -- one counted vote per pairing (replay/dedupe guard)
  team_a_id       uuid not null references public.arena_teams(id) on delete cascade,
  team_b_id       uuid not null references public.arena_teams(id) on delete cascade,
  winner_id       uuid references public.arena_teams(id) on delete set null,
  voter_id        uuid references auth.users(id) on delete set null,  -- null for guests
  voter_is_guest  boolean not null default false,
  voter_guest_id  text,                          -- client guest id (localStorage) for the guest cap
  counted         boolean not null default true, -- false => recorded but did not move Elo (guest cap overflow)
  elo_a_before    numeric,
  elo_a_after     numeric,
  elo_b_before    numeric,
  elo_b_after     numeric,
  created_at      timestamptz not null default now()
);

-- Guest-cap lookup: count a guest's prior COUNTED votes quickly.
create index if not exists arena_matches_guest_counted_idx
  on public.arena_matches (voter_guest_id)
  where counted and voter_guest_id is not null;

-- Per-user rate limiting + "my votes" history.
create index if not exists arena_matches_voter_created_idx
  on public.arena_matches (voter_id, created_at desc);

alter table public.arena_matches enable row level security;

-- Votes flow through the arena-vote Edge Function (service_role). Authenticated
-- users may read their OWN vote history; anon has no direct table access.
grant select on public.arena_matches to authenticated;
grant select, insert, update, delete on public.arena_matches to service_role;

drop policy if exists "Users read own arena matches" on public.arena_matches;
create policy "Users read own arena matches"
  on public.arena_matches for select
  to authenticated
  using (voter_id = auth.uid());

-- ---------------------------------------------------------------------------
-- arena_config  (singleton)
-- ---------------------------------------------------------------------------
create table if not exists public.arena_config (
  id                   boolean primary key default true,
  arena_eligibility_mode text not null default 'opt_in'
                         check (arena_eligibility_mode in ('opt_in', 'opt_out')),
  updated_at           timestamptz not null default now(),
  constraint arena_config_singleton check (id)   -- only one row (id = true)
);

alter table public.arena_config enable row level security;

grant select on public.arena_config to anon, authenticated;
grant select, insert, update, delete on public.arena_config to service_role;

drop policy if exists "Anyone reads arena config" on public.arena_config;
create policy "Anyone reads arena config"
  on public.arena_config for select
  to anon, authenticated
  using (true);

-- Seed the singleton with the launch default (opt_in). No-op if already present.
insert into public.arena_config (id, arena_eligibility_mode)
values (true, 'opt_in')
on conflict (id) do nothing;
