-- Adds promotional comp access, independent of beta_expires_at and Stripe subscriptions.
-- A user with comp_expires_at in the future is granted the Pro tier (see SubscriptionContext.jsx).

alter table public.profiles
  add column if not exists comp_expires_at timestamptz;

comment on column public.profiles.comp_expires_at is
  'Promotional comp access (creators, support cases). Independent of beta_expires_at and Stripe subscriptions. NULL = no comp.';
