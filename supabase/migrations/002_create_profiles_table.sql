-- Profiles table for beta access and future user-level flags
-- Run this migration against your Supabase project via the SQL editor

create table public.profiles (
  id uuid primary key references auth.users(id),
  beta_expires_at timestamptz,
  created_at timestamptz default now()
);

-- RLS: users can only read their own profile
alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Admin: grant beta access to a user
-- insert into profiles (id, beta_expires_at)
-- values ('<user-uuid>', '2026-05-04T23:59:59Z')
-- on conflict (id) do update set beta_expires_at = excluded.beta_expires_at;
