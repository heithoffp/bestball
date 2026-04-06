# TASK-162: Remove Stripe 7-day free trial — convert to direct subscribe flow

**Status:** Draft
**Priority:** P2

---

## Objective
Remove the 7-day refundable Stripe trial from the checkout flow. The trial creates a refund window that's a financial risk with no clear conversion benefit — the beta period already provides free access for new users. Currently `PlanPicker.jsx` passes `trialDays: 7` to the checkout session (line 129), and trial-related messaging ("Start Free Trial", "7-day free trial", "no charge until day 8", trial-used state) appears across PlanPicker, BetaBanner, LockedFeature, AuthButton, and AccountSettings. All "Start Free Trial" CTAs should become "Subscribe", `trialDays`/`trialUsed` logic should be removed from the frontend, and the Stripe product/price configuration should have trials disabled as well.

## Dependencies
- TASK-161 (beta access for new signups) should ideally land first so there's still a free access path before the trial is removed.

## Open Questions
- Should existing users who already used the 7-day trial see any different messaging?
- Does the Supabase `create-checkout-session` edge function need changes to stop accepting `trialDays`, or just the frontend?
- Stripe-side: is the trial configured on the Price object or at the Checkout Session level?
