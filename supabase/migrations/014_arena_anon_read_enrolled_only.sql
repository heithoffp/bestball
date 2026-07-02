-- Arena public-launch RLS fix: anon reads must respect the enrollment switch.
--
-- Migration 012's anon read policy was `case when beta_mode then false else true end`
-- — i.e. once beta_mode flips to false, ANON sees EVERY arena_teams row, including
-- enrolled = false. That voids the two privacy escape hatches for logged-out callers:
-- "Leave the Arena" (ADR-016 account switch) and the TASK-290 takedown path both work
-- by setting enrolled = false, yet a direct PostgREST query would still return the
-- snapshot, Elo, and record. The authenticated policy already filters
-- (enrolled = true or own rows); this brings anon in line.
--
-- Idempotent — safe to re-run.

drop policy if exists "Anon arena read (beta-gated)" on public.arena_teams;
create policy "Anon arena read (beta-gated)"
  on public.arena_teams for select
  to anon
  using (
    case when public.arena_beta_mode()
      then false
      else enrolled = true
    end
  );
