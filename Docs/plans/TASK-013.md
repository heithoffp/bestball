# TASK-013: Integrate Stripe Checkout for subscription payments

**Status:** Approved
**Priority:** P1
**Feature:** FEAT-002

---

## Objective
Integrate Stripe as the payment provider for subscription billing. Install the Stripe JS SDK, create a checkout flow that redirects users to Stripe-hosted Checkout, and set up Supabase Edge Functions to handle checkout session creation and webhook events for the subscription lifecycle. This is the core payment infrastructure that enables the subscription business model.

## Dependencies
- TASK-002 — Pricing tiers defined (Done ✅): Pro tier at $15/month or $50/season
- TASK-004 — User authentication (Done ✅): Users must be authenticated to subscribe
- ADR-001 — Supabase Edge Functions for Stripe webhook handling (Accepted ✅)

## Verification Criteria
1. Authenticated user can click "Upgrade to Pro" and be redirected to Stripe Checkout with correct pricing.
2. Both pricing options ($15/month and $50/season) are available in the checkout session.
3. After successful payment, Stripe webhook fires and a row is created/updated in the Supabase `subscriptions` table.
4. Webhook correctly handles: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
5. Webhook verifies Stripe signature before processing events.
6. Client app can read subscription status from Supabase `subscriptions` table via `useSubscription()` hook.
7. Stripe test mode works end-to-end in development.
8. `npm run build` passes with no errors.

## Verification Approach
1. Run `npm run build` from `best-ball-manager/` — must complete with no errors.
2. Run `npm run lint` from `best-ball-manager/` — no new lint errors introduced.
3. Developer creates Stripe test products/prices in the Stripe Dashboard and confirms price IDs match env vars.
4. Developer runs the Supabase migration SQL against their project and confirms the `subscriptions` table exists.
5. Developer deploys Edge Functions via `supabase functions deploy` and confirms they are accessible.
6. Developer tests end-to-end: sign in → click upgrade → complete Stripe test checkout → verify subscription row appears in Supabase.
7. Developer simulates cancellation via Stripe Dashboard → confirms webhook updates status to 'canceled'.

Steps 1-2 can be run by Claude. Steps 3-7 require the developer (Stripe Dashboard access, Supabase project access, and live testing).

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/package.json` | Modify | Add `@stripe/stripe-js` dependency |
| `best-ball-manager/src/utils/stripeClient.js` | Create | Stripe.js client initialization via `loadStripe()` |
| `best-ball-manager/src/contexts/SubscriptionContext.jsx` | Create | React context exposing `useSubscription()` hook — tier, status, `redirectToCheckout()` |
| `best-ball-manager/vercel.json` | Modify | Add Stripe domains to CSP `connect-src` and `script-src` |
| `supabase/functions/stripe-webhook/index.ts` | Create | Edge Function: verify Stripe signature, handle subscription lifecycle events, upsert to `subscriptions` table |
| `supabase/functions/create-checkout-session/index.ts` | Create | Edge Function: accept priceId + user JWT, create Stripe Checkout Session, return session URL |
| `supabase/migrations/001_create_subscriptions_table.sql` | Create | SQL migration for `subscriptions` table with RLS policies |

## Implementation Approach

### Step 1: Supabase Database Migration
Create `supabase/migrations/001_create_subscriptions_table.sql`:
```sql
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status text not null default 'inactive',
  price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.subscriptions enable row level security;

create policy "Users can read own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

create index idx_subscriptions_user_id on public.subscriptions(user_id);
create index idx_subscriptions_stripe_customer_id on public.subscriptions(stripe_customer_id);
```
Developer runs this migration manually against their Supabase project.

### Step 2: Supabase Edge Function — stripe-webhook
Create `supabase/functions/stripe-webhook/index.ts`:
- Verify Stripe webhook signature using `crypto.subtle` (Deno native HMAC-SHA256)
- Handle events:
  - `checkout.session.completed` → upsert subscription row, link `stripe_customer_id` to `user_id` (passed via checkout session `metadata`)
  - `customer.subscription.updated` → update status, period dates, `cancel_at_period_end`
  - `customer.subscription.deleted` → set status to `'canceled'`
  - `invoice.payment_failed` → set status to `'past_due'`
- Use Supabase service role key (set as Edge Function secret `SUPABASE_SERVICE_ROLE_KEY`) to write to `subscriptions` table
- Return 200 for handled events, 400 for signature verification failure

### Step 3: Supabase Edge Function — create-checkout-session
Create `supabase/functions/create-checkout-session/index.ts`:
- Accept POST body: `{ priceId }`
- Extract and verify user JWT from `Authorization` header using Supabase client
- Look up or create a Stripe customer for this user (check `subscriptions` table for existing `stripe_customer_id`, otherwise create via Stripe API)
- Create Stripe Checkout Session:
  - `mode: 'subscription'`
  - `customer` (existing) or `customer_email` (new)
  - `line_items: [{ price: priceId, quantity: 1 }]`
  - `metadata: { user_id }` on the subscription for webhook linking
  - `success_url` and `cancel_url` pointing back to the app
- Return `{ url: session.url }` for client redirect
- Uses `STRIPE_SECRET_KEY` env var (Edge Function secret)

### Step 4: Client-Side Stripe Integration
Install `@stripe/stripe-js` via npm.

Create `best-ball-manager/src/utils/stripeClient.js`:
- `loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)`
- Export the promise for lazy loading

Create `best-ball-manager/src/contexts/SubscriptionContext.jsx`:
- Wrap app with `<SubscriptionProvider>`
- On mount (when user is authenticated via `useAuth()`), query Supabase `subscriptions` table for current user
- Derive tier: no user → `'guest'`, user + no active subscription → `'free'`, user + active subscription → `'pro'`
- Expose via `useSubscription()` hook:
  - `tier` — `'guest' | 'free' | 'pro'`
  - `status` — raw Stripe subscription status or `null`
  - `isProUser` — boolean shorthand
  - `subscription` — full row data for UI display
  - `redirectToCheckout(priceId)` — calls `create-checkout-session` Edge Function, then redirects to returned URL
  - `loading` — boolean for initial fetch
- Subscribe to Supabase realtime changes on `subscriptions` table filtered by `user_id` for instant updates after checkout redirect back

### Step 5: CSP and Environment Updates
Update `best-ball-manager/vercel.json`:
- Add `https://js.stripe.com` to `script-src`
- Add `https://api.stripe.com https://checkout.stripe.com` to `connect-src`
- Add `https://js.stripe.com` to `frame-src` (Stripe Checkout uses iframes for 3DS)

Environment variables (not committed — developer sets these):
- `VITE_STRIPE_PUBLISHABLE_KEY` — in `.env` for Vite (client-safe publishable key)
- `STRIPE_SECRET_KEY` — Supabase Edge Function secret
- `STRIPE_WEBHOOK_SECRET` — Supabase Edge Function secret
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase Edge Function secret (for writing to DB)

### Stripe Products Setup (Manual — developer does this)
Create in Stripe Dashboard (test mode):
- Product: "Best Ball Pro"
- Price 1: $15/month recurring
- Price 2: $50/season — use a recurring subscription with a fixed billing cycle anchor, or a one-time payment with metadata tracking expiry. Recommend starting with monthly recurring only and adding seasonal as a follow-up if Stripe's billing anchor behavior needs experimentation.

## Risks
- Stripe price IDs are environment-specific (test vs live) — must use env vars, never hardcode
- Seasonal pricing ($50/season Feb-Aug) may need experimentation with Stripe's billing anchor or fixed-period subscriptions — monthly pricing works out of the box
- Edge Function cold starts add ~150ms to webhook processing — acceptable since Stripe retries on failure and webhooks are async
- If Supabase realtime subscription fails, the UI falls back to reading on next page load — no data loss, just delayed UI update

---
*Approved by: Patrick H. — 2026-03-28*
