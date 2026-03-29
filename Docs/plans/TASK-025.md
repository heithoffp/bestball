# TASK-025: Add plan selection UI with monthly/yearly toggle and promo code support

**Status:** Draft
**Priority:** P2
**Feature:** FEAT-002

---

## Objective
The checkout flow currently sends a single hardcoded price ID to Stripe. This task adds a plan picker UI (monthly vs yearly options) before redirecting to Stripe Checkout, and enables promo/coupon code support so codes like BETA25 can be applied at checkout. This improves the subscription conversion flow by giving users pricing choice and honoring promotional offers.

## Dependencies
- TASK-013 (Done) — Stripe Checkout integration and Edge Function pattern
- TASK-014 (Done) — Subscription status sync
- TASK-024 (Done) — Beta program references BETA25 promo code in conversion banner

## Open Questions
- Should the plan picker be a standalone modal or inline within the existing LockedFeature/BetaBanner flows?
- Should promo codes be passed to Stripe Checkout via `allow_promotion_codes: true` (user enters code on Stripe page) or pre-applied via `discounts` parameter?
- What are the monthly and yearly price points? (Need both Stripe Price IDs)
