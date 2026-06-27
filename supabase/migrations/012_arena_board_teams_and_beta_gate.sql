-- TASK-287/288/289/293/294 · ADR-014 + ADR-015: Arena board teams + private-beta gate.
--
-- Layers on the (undeployed) ADR-013 v1 schema (migration 011). Two intertwined
-- changes, shipped together because they share the same RLS surface:
--
--   ADR-014 — opt-out + board teams:
--     * arena_teams can now hold OWNERLESS "board" rows (the other 11 pod rosters
--       captured under ADR-009). user_id/entry_id become nullable; a `source`
--       discriminator ('owned' | 'board') and a `draft_id` (pod id, for context +
--       takedown) are added. Board dedup/identity uses the raw UD draftEntryId and
--       a salted hash of the UD userId, stored in SERVICE-ROLE-ONLY columns
--       (board_entry_ref, board_user_hash) — never client-readable (guardrail #1).
--     * arena_eligibility_mode is flipped to 'opt_out' (TASK-293) so the pairing
--       function samples ALL teams, and the leaderboard/anon RLS stops filtering on
--       `enrolled` (TASK-289).
--
--   ADR-015 — private beta:
--     * arena_config gains beta_mode (default true) + beta_allowlist. While
--       beta_mode is true, EVERY arena_teams read is restricted to allowlisted
--       accounts (arena_email_allowed()), and anon gets nothing. This contains the
--       opt-out + board republication to the developer's own accounts so no
--       third-party roster is exposed publicly. Flipping beta_mode=false (public
--       launch) stays gated on TASK-290 (takedown) + TASK-291 (privacy/ToS).
--
-- Board rows are service_role-WRITE only: clients have no column grant for `source`
-- or the board_* columns and the owner-only RLS policies are scoped to source='owned',
-- so a client can never create or move a board row. Board ingestion is the
-- arena-register Edge Function (service_role).
--
-- All statements idempotent — safe to re-run.

-- ---------------------------------------------------------------------------
-- arena_teams: ownerless board rows
-- ---------------------------------------------------------------------------
alter table public.arena_teams alter column user_id drop not null;
alter table public.arena_teams alter column entry_id drop not null;

alter table public.arena_teams add column if not exists source text not null default 'owned';
do $$ begin
  alter table public.arena_teams
    add constraint arena_teams_source_chk check (source in ('owned', 'board'));
exception when duplicate_object then null; end $$;

alter table public.arena_teams add column if not exists draft_id text;
-- Service-role-only identity/dedup for board rows (raw UD ids — never client-readable).
alter table public.arena_teams add column if not exists board_entry_ref text; -- raw UD draftEntryId
alter table public.arena_teams add column if not exists board_user_hash text; -- salted hash of UD userId

-- Rework uniqueness. The old table-level unique(user_id,entry_id,platform) cannot
-- dedupe ownerless rows (NULL user_id is distinct under a unique constraint), so
-- split into two partial unique indexes keyed on what is actually stable per source.
alter table public.arena_teams
  drop constraint if exists arena_teams_user_id_entry_id_platform_key;

create unique index if not exists arena_teams_owned_uniq
  on public.arena_teams (user_id, entry_id, platform)
  where source = 'owned';

create unique index if not exists arena_teams_board_uniq
  on public.arena_teams (board_entry_ref, platform)
  where source = 'board';

-- Grants. Replace the full-table client SELECT with a COLUMN-SCOPED select that
-- EXCLUDES board_entry_ref / board_user_hash (guardrail #1: raw UD board ids are
-- never client-readable). The column-scoped INSERT/UPDATE grants from migration 011
-- are unchanged and (deliberately) do not cover `source` or the board_* columns, so
-- a client insert always lands as source='owned' with no board identity.
revoke select on public.arena_teams from anon, authenticated;
grant select (
  id, user_id, entry_id, platform, display_snapshot, enrolled,
  elo, matches, wins, losses, provisional, source, draft_id, created_at, updated_at
) on public.arena_teams to anon, authenticated;
-- service_role keeps full DML from migration 011 (no change needed).

-- ---------------------------------------------------------------------------
-- arena_config: opt-out flip + private-beta flag/allowlist
-- ---------------------------------------------------------------------------
alter table public.arena_config
  add column if not exists beta_mode boolean not null default true;
alter table public.arena_config
  add column if not exists beta_allowlist text[] not null
  default array['heithoff.patrick@gmail.com']::text[];

-- TASK-293 flip, contained by the beta gate (ADR-015). The PUBLIC flip
-- (beta_mode=false) is intentionally NOT done here — it is gated on TASK-290/291.
update public.arena_config
  set arena_eligibility_mode = 'opt_out', beta_mode = true
  where id;

-- Don't expose the beta allowlist to clients (least privilege — it can grow to real
-- emails). The SECURITY DEFINER helpers below read it as the function owner, so clients
-- never need the column. Narrow the client SELECT (011 granted the full table) to the
-- non-sensitive columns.
revoke select on public.arena_config from anon, authenticated;
grant select (id, arena_eligibility_mode, beta_mode, updated_at)
  on public.arena_config to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helper functions (used by RLS + readable intent). SECURITY DEFINER so RLS can
-- consult arena_config regardless of the caller's own row-level access.
-- ---------------------------------------------------------------------------

-- Normalize an email for allowlist comparison: lowercase + strip a "+tag" from the
-- local part (mirrors src/utils/authorPreview.js normalizeEmail). Returns '' for
-- null/malformed input.
create or replace function public.arena_normalize_email(email text)
returns text language sql immutable as $$
  select case
    when email is null or strpos(email, '@') = 0 then ''
    else lower(split_part(split_part(email, '@', 1), '+', 1)) || '@' || lower(split_part(email, '@', 2))
  end;
$$;

create or replace function public.arena_beta_mode()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select beta_mode from public.arena_config where id), true);
$$;

-- True when the current JWT's (normalized) email is in arena_config.beta_allowlist.
-- False when there is no JWT/email (guests).
create or replace function public.arena_email_allowed()
returns boolean language sql stable security definer set search_path = public as $$
  select public.arena_normalize_email(auth.jwt() ->> 'email') = any (
    coalesce((select beta_allowlist from public.arena_config where id), array[]::text[])
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS rewrite on arena_teams (TASK-289 visibility + ADR-015 beta gate).
-- Reads: during beta, allowlisted accounts only (anon gets nothing). Post-beta
-- (public opt_out), anon + authenticated see the whole board. Writes stay
-- owner-only AND source='owned' so board rows are unreachable by clients.
-- ---------------------------------------------------------------------------
drop policy if exists "Anon reads enrolled arena teams" on public.arena_teams;
drop policy if exists "Users read enrolled or own arena teams" on public.arena_teams;
drop policy if exists "Anon arena read (beta-gated)" on public.arena_teams;
drop policy if exists "Auth arena read (beta-gated)" on public.arena_teams;

create policy "Anon arena read (beta-gated)"
  on public.arena_teams for select
  to anon
  using (case when public.arena_beta_mode() then false else true end);

create policy "Auth arena read (beta-gated)"
  on public.arena_teams for select
  to authenticated
  using (
    case when public.arena_beta_mode()
      then public.arena_email_allowed()
      else (enrolled = true or user_id = auth.uid())
    end
  );

-- Owner-only writes, scoped to source='owned'. Combined with the column grants
-- (no client grant for `source`/board_* cols), a client can only ever write its
-- own owned rows; board rows are service_role-only.
drop policy if exists "Users insert own arena teams" on public.arena_teams;
create policy "Users insert own arena teams"
  on public.arena_teams for insert
  to authenticated
  with check (user_id = auth.uid() and source = 'owned');

drop policy if exists "Users update own arena teams" on public.arena_teams;
create policy "Users update own arena teams"
  on public.arena_teams for update
  to authenticated
  using (user_id = auth.uid() and source = 'owned')
  with check (user_id = auth.uid() and source = 'owned');
