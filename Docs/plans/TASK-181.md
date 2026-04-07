# TASK-181: Switch Stripe to live mode — production keys in Vercel env vars

**Status:** Pending Approval
**Priority:** P1

---

## Objective
Switch the app from Stripe test mode to live mode so real payments can be processed before launch. This involves creating live products/prices in Stripe, setting live keys in Vercel and Supabase, configuring the live webhook endpoint, and verifying end-to-end checkout.

## Verification Criteria
1. Vercel environment variables `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_STRIPE_PRO_MONTHLY_PRICE_ID`, and `VITE_STRIPE_PRO_YEARLY_PRICE_ID` are set to live values in production.
2. Supabase secrets `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set to live values.
3. A real checkout session can be created and redirects to Stripe Checkout (live mode).
4. Stripe webhook delivers events to the Supabase Edge Function and subscription records appear in the `subscriptions` table.
5. Customer Portal session works for managing subscriptions.
6. Promo code validation works against live Stripe promotion codes.
7. The local `.env` file is NOT committed with live keys — live keys exist only in Vercel/Supabase.

## Verification Approach
This is primarily a manual configuration task. Claude will guide each step; the developer performs the actions in Stripe Dashboard, Vercel Dashboard, and Supabase Dashboard.

1. **Developer:** Create live products and prices in Stripe Dashboard. Confirm the price IDs are noted.
2. **Developer:** Set the three `VITE_STRIPE_*` env vars in Vercel Dashboard (Production scope). Confirm they are set.
3. **Developer:** Set `STRIPE_SECRET_KEY` (live `sk_live_*`) and `STRIPE_WEBHOOK_SECRET` in Supabase project secrets. Confirm they are set.
4. **Developer:** Create a webhook endpoint in Stripe Dashboard (live mode) pointing to `https://<project-ref>.supabase.co/functions/v1/stripe-webhook` with events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Copy signing secret to Supabase.
5. **Developer:** Configure Customer Portal in Stripe Dashboard (Settings → Customer portal) — enable cancel subscription, update payment method, view invoices. Set return URL.
6. **Developer:** Create at least one live promotion code for testing.
7. **Developer:** Deploy to Vercel (or wait for next deploy) and test full checkout flow with a real card — verify subscription appears in Supabase `subscriptions` table.
8. **Claude:** Verify `.env` and `.env.local` still contain test keys (not live) and are in `.gitignore`.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| No code changes | — | This is a configuration-only task across Stripe, Vercel, and Supabase dashboards |

## Implementation Approach

This task is a guided walkthrough — no code changes required. The Stripe integration code is already complete and reads keys from environment variables.

### Step 1: Create Live Products in Stripe Dashboard
- Go to Stripe Dashboard → switch to **Live mode** (toggle at top)
- Products → Create product: **"Best Ball Pro"**
  - Price 1: Monthly — $20/month, recurring
  - Price 2: Annual — $67/year, recurring (matches current PlanPicker display)
- Note the two live `price_*` IDs

### Step 2: Set Vercel Environment Variables
- Vercel Dashboard → Project → Settings → Environment Variables
- Set for **Production** (and optionally Preview):
  - `VITE_STRIPE_PUBLISHABLE_KEY` = `pk_live_...` (from Stripe Dashboard → Developers → API keys)
  - `VITE_STRIPE_PRO_MONTHLY_PRICE_ID` = live monthly price ID from Step 1
  - `VITE_STRIPE_PRO_YEARLY_PRICE_ID` = live annual price ID from Step 1

### Step 3: Set Supabase Secrets
- Supabase Dashboard → Project → Settings → Edge Functions → Secrets
- Set:
  - `STRIPE_SECRET_KEY` = `sk_live_...` (from Stripe Dashboard → Developers → API keys)
  - `STRIPE_WEBHOOK_SECRET` = (will be set in Step 4 after creating webhook)

### Step 4: Configure Live Webhook
- Stripe Dashboard (live mode) → Developers → Webhooks → Add endpoint
- Endpoint URL: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
- Events to listen for:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
- Copy the **Signing secret** (`whsec_...`) → update `STRIPE_WEBHOOK_SECRET` in Supabase secrets

### Step 5: Configure Customer Portal
- Stripe Dashboard (live mode) → Settings → Customer portal
- Enable: Cancel subscription, Update payment method, View invoices
- Set return URL: `https://bestballmanager.com` (or the production domain)

### Step 6: Create Live Promo Code
- Stripe Dashboard (live mode) → Products → Coupons → Create coupon
- Create a 25% off coupon, then generate a promotion code from it
- This validates the promo code flow works end-to-end

### Step 7: Deploy and Test
- Push or trigger a Vercel deploy so the new env vars take effect
- Test the full flow: sign up → select plan → enter promo code → complete checkout
- Verify: subscription record appears in Supabase `subscriptions` table with `status: active`
- Test Customer Portal: click "Manage subscription" → verify portal loads

### Step 8: Verify Local Safety
- Confirm `.env` and `.env.local` still have test keys (safe for local dev)
- Confirm `.gitignore` includes both files

## Dependencies
None — Stripe code is already wired up, just needs live keys.

## Open Questions
- **Resolved:** Stripe webhooks need to be configured for live mode (Step 4 covers this).
- **Resolved:** Supabase Edge Functions use `STRIPE_SECRET_KEY` from secrets — setting the live key there makes all four Edge Functions (checkout, webhook, promo validation, portal) use live mode automatically.

---
*Approved by: <!-- developer name/initials and date once approved -->*
