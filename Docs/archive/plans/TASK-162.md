<!-- Completed: 2026-04-07 | Commit: 724d7b0 -->
# TASK-162: Remove Stripe 7-day free trial — convert to direct subscribe flow

**Status:** Done
**Priority:** P2

---

## Objective
Remove all 7-day free trial logic from the checkout flow. The trial creates a refund-window financial risk with no conversion benefit — the beta period already provides free access for new users. All "Start Free Trial" CTAs become "Subscribe", and `trialDays`/`trialUsed` are deleted from both the frontend and the edge function.

## Verification Criteria
- The PlanPicker checkout button always reads "Subscribe" (no "Start Free Trial" text anywhere in the modal).
- The PlanPicker subtitle no longer mentions "7-day free trial" or "no charge until day 8".
- LockedFeature no longer renders the trial hint paragraph or "Start Free Trial" button label.
- `trialUsed` is not exported from `SubscriptionContext` (no references remain in consuming components).
- The `create-checkout-session` edge function no longer accepts or passes `trialDays` to Stripe.
- AccountSettings still correctly shows "Trial — N days remaining" for users whose subscription status is `trialing` (backward compat for anyone mid-trial at the time of deploy).

## Verification Approach
1. `grep -r "trialDays\|trialUsed\|Start Free Trial\|7-day free trial\|no charge until day 8" best-ball-manager/src` — expect zero matches.
2. `grep -r "trialDays\|trial_period_days" supabase/functions/create-checkout-session/` — expect zero matches.
3. `cd best-ball-manager && npm run build` — expect clean build, no TypeScript/lint errors.
4. Dev visual check (developer): open PlanPicker, confirm button reads "Subscribe" and no trial copy is visible.
5. Dev visual check (developer): open a locked feature as a signed-in free-tier user, confirm LockedFeature button reads "Subscribe" and no trial hint paragraph is shown.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/PlanPicker.jsx` | Modify | Remove `trialUsed` prop/destructure, remove `trialDays` from checkout call, replace trial copy with neutral tagline, change button to "Subscribe" |
| `best-ball-manager/src/components/LockedFeature.jsx` | Modify | Remove trial hint `<p>`, change button label from "Start Free Trial" to "Subscribe" |
| `best-ball-manager/src/contexts/SubscriptionContext.jsx` | Modify | Remove `trialUsed` state, remove `anySubResult` query, remove `trialDays` from `redirectToCheckout` |
| `supabase/functions/create-checkout-session/index.ts` | Modify | Remove `trialDays` from request body destructure and from Stripe params |

## Implementation Approach

### 1. `PlanPicker.jsx`
- In `PlanPicker`, remove `trialUsed` from `useSubscription()` destructure and from the `PlanPickerInner` props passed down.
- In `PlanPickerInner`, remove `trialUsed` from props signature and from `handleCheckout` (`trialDays: trialUsed ? undefined : 7` → remove entire `trialDays` option, so `redirectToCheckout(plan.priceId, { promoCode: ... })`).
- Replace the conditional trial-copy `<p>` (currently lines 146–150) with a single static line: `"Subscribe to unlock all Pro analytics features."` styled with `var(--text-muted)`.
- Change button label (currently `trialUsed ? 'Subscribe' : 'Start Free Trial'`) to `'Subscribe'`.

### 2. `LockedFeature.jsx`
- Delete the `<p className={styles.trialHint}>` line.
- Change button label from `'Start Free Trial'` to `'Subscribe'` (keep the conditional `user ? ... : 'Sign Up to Unlock'` — only the logged-in branch label changes).

### 3. `SubscriptionContext.jsx`
- Remove `const [trialUsed, setTrialUsed] = useState(false)`.
- In the user-cleared effect block, remove `setTrialUsed(false)`.
- In `fetchUserData`, remove `anySubResult` from `Promise.all` (the third query), and remove `setTrialUsed(anySubResult.data !== null)`.
- Remove `trialUsed` from context provider value.
- In `redirectToCheckout`, change signature from `async (priceId, { trialDays, promoCode } = {})` to `async (priceId, { promoCode } = {})`, and remove `trialDays` from the JSON body sent to the edge function.

### 4. `supabase/functions/create-checkout-session/index.ts`
- In the request body destructure, remove `trialDays` from `const { priceId, successUrl, cancelUrl, trialDays, promoCode }`.
- Delete lines 94–97: `const trialEligible = !existingSub;` and the `if (trialDays && trialEligible ...)` block.

### Order of changes
Apply frontend changes first (1–3), then edge function (4). All are independent of each other but touching the same data contract — completing frontend first ensures `trialDays` is never sent before the edge function stops accepting it.

## Dependencies
- TASK-161 (beta access for new signups) — already completed ✓

---
*Approved by: Developer — 2026-04-07*
