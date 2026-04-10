-- Auto-grant beta access through NFL Draft for new signups
-- Run this migration against your Supabase project via the SQL editor

-- Function: create a profiles row with beta access on new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, beta_expires_at)
  values (NEW.id, '2026-05-04T23:59:59Z')
  on conflict (id) do nothing;
  return NEW;
end;
$$ language plpgsql security definer;

-- Trigger: fire after every new auth.users insert
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
