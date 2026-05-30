-- Retroactive migration for the user_rankings table.
--
-- This table was originally created ad-hoc in the Supabase SQL editor across
-- TASK-099 (initial single-platform schema) and TASK-144 (added `platform`
-- column and re-keyed PK to (user_id, platform)). This file captures the
-- current production schema, RLS policy, and explicit Data API grants so the
-- table is reproducible against a fresh Supabase project and aligned with the
-- post-2026-10-30 grant requirement (see CLAUDE.md > External Dependencies).
--
-- Access pattern (per TASK-246 role/callsite matrix):
--   - authenticated: web app upserts via best-ball-manager/src/utils/rankingsExport.js;
--                    chrome extension selects via chrome-extension/src/utils/bridge.js.
--   - service_role:  not used.
--   - anon:          not used.
--
-- All statements are idempotent so this is safe to re-run against the existing
-- production project as a no-op.

create table if not exists public.user_rankings (
  user_id    uuid not null references auth.users(id) on delete cascade,
  platform   text not null default 'underdog',
  rankings   jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, platform)
);

alter table public.user_rankings enable row level security;

-- Data API grants (required for new tables in public schema after 2026-10-30).
-- Web client and Chrome extension both authenticate as the end user; no
-- service_role or anon access is needed.
grant select, insert, update, delete
  on public.user_rankings
  to authenticated;

-- Own-row policy: users manage their own rankings rows for any platform.
-- Drop-and-recreate so the migration is idempotent against the production
-- table where a policy may already exist under a different name.
drop policy if exists "Users manage own rankings" on public.user_rankings;
create policy "Users manage own rankings"
  on public.user_rankings for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
