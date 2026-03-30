# TASK-020: Design first-week free trial promotion

<!-- Completed: 2026-03-29 -->
**Status:** Done
**Priority:** P2
**Feature:** FEAT-021

---

## Objective
Add a 7-day free trial to the Pro subscription using Stripe's built-in trial period feature. New subscribers get full Pro access immediately with no charge for 7 days; Stripe auto-bills at period end. The existing `trialing` status support in the UI, webhook, and database means most of the work is in the checkout Edge Function and user-facing messaging.

## Verification Criteria
1. `create-checkout-session` Edge Function accepts an optional `trialDays` parameter and passes `subscription_data[trial_period_days]` to Stripe when provided.
2. LockedFeature component messaging mentions the free trial for unauthenticated/free users.
3. BetaBanner's "Subscribe Now" button and expired-beta conversion flow mention the trial offer.
4. AccountSettings shows "Trial — 7 days remaining" (or similar) for users with `trialing` status, using the existing `current_period_end` date.
5. The checkout call sites pass `trialDays: 7` so new subscribers enter a trial.
6. `npm run build` succeeds with no errors.
7. `npm run lint` passes with no new errors.

## Verification Approach
1. Run `npm run build` from `best-ball-manager/` — must succeed.
2. Run `npm run lint` — no new errors introduced.
3. Read `create-checkout-session/index.ts` and confirm `trial_period_days` is passed to Stripe when `trialDays` is provided in the request body.
4. Read `LockedFeature.jsx` and confirm trial messaging is present.
5. Read `BetaBanner.jsx` and confirm trial messaging is present in the conversion flow.
6. Read `AccountSettings.jsx` and confirm trialing status shows days remaining.
7. Read all call sites of `redirectToCheckout` and confirm `trialDays: 7` is passed.
8. Developer: manually test checkout in Stripe test mode to confirm trial period appears on the Stripe Checkout page.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/create-checkout-session/index.ts` | Modify | Accept `trialDays` param, pass `subscription_data[trial_period_days]` to Stripe |
| `best-ball-manager/src/contexts/SubscriptionContext.jsx` | Modify | Update `redirectToCheckout` to accept and forward `trialDays` option |
| `best-ball-manager/src/components/LockedFeature.jsx` | Modify | Add trial messaging ("Try Pro free for 7 days") |
| `best-ball-manager/src/components/BetaBanner.jsx` | Modify | Update subscribe CTA to mention free trial |
| `best-ball-manager/src/components/AccountSettings.jsx` | Modify | Show trial days remaining for `trialing` status |

## Implementation Approach

### Step 1: Update `create-checkout-session` Edge Function
- Accept optional `trialDays` from request body (alongside existing `priceId`, `successUrl`, `cancelUrl`)
- When `trialDays` is a positive integer, add `subscription_data[trial_period_days]` to the Stripe checkout session params
- No change when `trialDays` is absent — existing non-trial checkout still works

### Step 2: Update `redirectToCheckout` in SubscriptionContext
- Change signature to accept an options object or add `trialDays` parameter
- Forward `trialDays` in the JSON body sent to the Edge Function
- All existing call sites that don't pass `trialDays` continue to work (default undefined = no trial)

### Step 3: Update LockedFeature messaging
- Add a subtitle line below "Upgrade to Pro for full access": "Start with a 7-day free trial — no charge until day 8."
- Update the upgrade button call to pass `trialDays: 7`

### Step 4: Update BetaBanner conversion messaging
- In the expired-beta banner, update CTA or add subtitle mentioning the free trial
- Pass `trialDays: 7` when calling `redirectToCheckout` from the banner

### Step 5: Enhance AccountSettings for trial status
- When `status === 'trialing'`, compute days remaining from `current_period_end`
- Show "Trial — X days remaining" in the status row
- The existing status color (blue for trialing) already works

## Dependencies
- TASK-013 (Done) — Stripe Checkout integration
- TASK-014 (Done) — Subscription status sync with webhook handling for `trialing` status

---
*Approved by: <!-- developer name/initials and date once approved -->*
