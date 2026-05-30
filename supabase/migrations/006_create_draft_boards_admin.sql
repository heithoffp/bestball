-- TASK-241 / ADR-008: Admin-scraped Underdog draft boards.
--
-- This table is populated by the developer-only admin-extension scraper, NOT
-- by the customer-facing chrome-extension. It exists to backfill draft boards
-- for drafts users did not self-sync, and to enable cross-user opponent
-- context features in the future.
--
-- RLS is default-deny. The admin extension authenticates with the service-role
-- key (bundled into a never-distributed dev build) and bypasses RLS. A read
-- policy for authenticated customers will be added in a follow-up task when
-- RosterViewer is wired to prefer admin-scraped data over per-user data.

create table if not exists public.draft_boards_admin (
  draft_id    text primary key,
  slate_title text,
  entry_count int,
  rounds      int,
  picks       jsonb not null,
  fetched_at  timestamptz not null default now(),
  source      text not null default 'admin_scraper'
);

alter table public.draft_boards_admin enable row level security;

-- Data API grants (required for new tables in public schema after 2026-10-30).
-- The admin scraper authenticates with service_role. A future migration will
-- add `grant select ... to authenticated` alongside a read policy for
-- customers when RosterViewer is wired to read this table (see TASK-247).
grant select, insert, update, delete
  on public.draft_boards_admin
  to service_role;
