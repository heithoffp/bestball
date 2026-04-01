-- Migration: 001_extension_entries
-- Apply manually in the Supabase SQL editor (Settings → SQL Editor).
-- Stores raw portfolio entries scraped by the Chrome extension.

create table extension_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  entry_id     text not null,
  tournament   text,
  draft_date   text,
  players      jsonb not null default '[]',
  synced_at    timestamptz not null default now(),
  unique(user_id, entry_id)
);

-- RLS: users can only access their own rows
alter table extension_entries enable row level security;

create policy "Users can manage their own entries"
  on extension_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_extension_entries_user_id on extension_entries(user_id);
