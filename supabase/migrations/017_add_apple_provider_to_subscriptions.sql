-- Add Apple IAP support to the shared subscriptions table (ADR-028 / TASK-344).
-- The mobile app moves from external Stripe checkout to native StoreKit 2 IAP;
-- Apple entitlements are synced here (via the apple-notifications and
-- sync-apple-purchase edge functions) so a purchase on either platform unlocks
-- Pro on both. `subscriptions` predates 2026-10-30, so no new Data-API grants
-- are required — existing grants (authenticated: select; service_role: all)
-- carry over to the new columns.

-- Which billing system owns the row. Existing Stripe rows default to 'stripe';
-- Apple IAP rows are written with 'apple'.
alter table public.subscriptions
  add column if not exists provider text not null default 'stripe';

-- Apple's originalTransactionId — the stable identifier for an auto-renewable
-- subscription across renewals. Used as the upsert conflict key for Apple rows,
-- mirroring how stripe_subscription_id keys Stripe rows.
alter table public.subscriptions
  add column if not exists apple_original_transaction_id text unique;

create index if not exists idx_subscriptions_apple_original_transaction_id
  on public.subscriptions(apple_original_transaction_id);
