-- email_preferences — per-user opt-out + unsubscribe token for the weekly
-- portfolio digest (TASK-188). CAN-SPAM: every digest carries an unsubscribe
-- link keyed by unsubscribe_token; flipping weekly_digest=false excludes the
-- user from future sends.
--
-- Access pattern:
--   - authenticated: web /unsubscribe page reads/updates own row by token.
--   - service_role:  the operator digest script reads weekly_digest for all users.
--   - anon:          not used.
--
-- Migration runs before the 2026-10-30 grant cutoff (auto-expose applies), but
-- grants are included for forward-safety per CLAUDE.md. All statements idempotent.

create table if not exists public.email_preferences (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  weekly_digest     boolean not null default true,
  unsubscribe_token uuid not null default gen_random_uuid(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists email_preferences_unsub_token_idx
  on public.email_preferences (unsubscribe_token);

alter table public.email_preferences enable row level security;

grant select, insert, update on public.email_preferences to authenticated;
grant select, insert, update, delete on public.email_preferences to service_role;

-- Users manage their own preferences row.
drop policy if exists "Users manage own email preferences" on public.email_preferences;
create policy "Users manage own email preferences"
  on public.email_preferences for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No-login unsubscribe: the digest email links to /unsubscribe?token=<uuid>.
-- A SECURITY DEFINER function lets an anonymous visitor flip their own flag by
-- token without authenticating (the token is the capability). Returns true if a
-- matching row was updated, false otherwise.
create or replace function public.unsubscribe_digest(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.email_preferences
     set weekly_digest = false, updated_at = now()
   where unsubscribe_token = p_token;
  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

grant execute on function public.unsubscribe_digest(uuid) to anon, authenticated;
