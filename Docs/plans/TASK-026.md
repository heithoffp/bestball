# TASK-026: Configure Stripe promo codes and coupons

**Status:** Draft
**Priority:** P2
**Feature:** FEAT-002

---

## Objective
The app code (TASK-025) supports promo code validation and application at checkout, but no coupons or promotion codes exist in Stripe yet. This task covers the Stripe Dashboard configuration needed to make promo codes work end-to-end: creating coupons (25% off forever for affiliates/beta, 25% off once for launch), creating the BETA25 promotion code, verifying the full flow through the Edge Functions, and documenting the process for creating new creator codes.

## Dependencies
- TASK-025 (In Progress) — Plan picker UI and promo code Edge Functions (validate-promo-code, updated create-checkout-session)

## Open Questions
- Should creator codes also include a "25% off once" variant, or only "forever" (all renewals)?
- What is the exact per-signup affiliate payout mechanism — tracked via Stripe reporting or a separate system?
