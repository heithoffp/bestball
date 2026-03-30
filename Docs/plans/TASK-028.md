# TASK-028: Enforce one free trial per account

**Status:** Approved
**Priority:** P2

---

## Objective

Prevent trial abuse by tracking whether a user has already consumed their free trial. Users who have previously started a trial should not receive another one on subsequent checkouts — the checkout session should be created without `trial_period_days`. Also surface this state in the PlanPicker UI so users aren't surprised.

## Dependencies

- TASK-026 (Done) — Stripe promo codes and checkout flow

## Open Questions

~~Should users see any messaging in PlanPicker indicating they've already used their trial?~~
**Resolved:** Yes — show "Trial already used" messaging and change button text to "Subscribe".

---

## Approach

Enforcement happens server-side (edge function) with a matching UI layer in PlanPicker. No new DB schema needed — the `subscriptions` table already retains all rows including canceled ones.

### How trial history is determined

The `subscriptions` table keeps a row for every subscription regardless of status (including `canceled`). If ANY row exists for a `user_id`, the trial has been used. The edge function enforces this; the client reads it for display.

### Files to Change

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/create-checkout-session/index.ts` | Modify | After fetching existing subscription, omit `trial_period_days` if any subscription row exists for the user |
| `best-ball-manager/src/contexts/SubscriptionContext.jsx` | Modify | Add second query without status filter; derive and expose `trialUsed` boolean |
| `best-ball-manager/src/components/PlanPicker.jsx` | Modify | Consume `trialUsed`; hide trial copy and change button text when trial is already used |

---

## Implementation Steps

### 1. Edge function — enforce no trial if any prior subscription exists

In `create-checkout-session/index.ts`, the existing query already fetches any subscription row (no status filter):

```ts
const { data: existingSub } = await supabaseAdmin
  .from("subscriptions")
  .select("stripe_customer_id")
  .eq("user_id", user.id)
  .single();
```

Also use this query result to suppress the trial. If `existingSub` is non-null, do not add `trial_period_days` regardless of what the client sent.

```ts
// Only allow trial if no prior subscription exists for this user
const trialEligible = !existingSub;

if (trialDays && trialEligible && Number.isInteger(trialDays) && trialDays > 0) {
  params["subscription_data[trial_period_days]"] = String(trialDays);
}
```

### 2. SubscriptionContext — derive `trialUsed`

Currently fetches subscriptions filtered to `['active', 'trialing', 'past_due']`. Add a second query that checks for any subscription row without status filter:

```js
supabase
  .from('subscriptions')
  .select('id')
  .eq('user_id', user.id)
  .limit(1)
  .maybeSingle()
```

Derive `const trialUsed = anySubResult.data !== null;` and expose it from the context value.

### 3. PlanPicker — update UI when trial is used

Consume `trialUsed` from `useSubscription()`.

- `trialUsed === false`: current UI ("Start with a 7-day free trial — no charge until day 8.", button "Start Free Trial", pass `trialDays: 7`)
- `trialUsed === true`:
  - Replace trial copy with: `"Trial already used — subscribe to get full access."`
  - Change button text to "Subscribe"
  - Pass `trialDays: undefined` (omit trial from checkout)

---

## Verification Criteria

1. A new user (no prior subscription) gets a 7-day trial on checkout — confirmed in Stripe dashboard.
2. A user who previously subscribed and canceled cannot get a trial on re-checkout — `trial_period_days` is absent from the Stripe checkout session.
3. PlanPicker correctly shows "Trial already used" copy for a user with a prior canceled subscription.
4. PlanPicker correctly shows "Start with a 7-day free trial" copy for a brand-new user.
5. The edge function suppresses the trial even if the client somehow sends `trialDays: 7` for an ineligible user.

## Verification Approach

1. Developer creates a test account, starts trial, cancels subscription in Stripe.
2. Developer re-opens PlanPicker — verifies "Trial already used" messaging appears.
3. Developer attempts checkout — verifies Stripe checkout page shows no trial period.
4. Claude verifies edge function logic and UI conditional rendering via code review.
