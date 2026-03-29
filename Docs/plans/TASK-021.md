# TASK-021: Set up creator promo code program

**Status:** Draft
**Priority:** P2

---

## Objective
Implement a creator-specific promo code program that offers 25% off the Pro plan ($20 → $15/month) when users subscribe using a creator's code. The goal is to leverage content creators who stream best-ball drafts but don't have existing Best Ball Overlay partnerships — giving them a monetizable reason to promote the tool. This task covers Stripe coupon/promo code configuration, creator onboarding criteria, attribution tracking (which creator drove which subscriptions), and integration with the subscription checkout flow.

## Dependencies
- TASK-013 (Stripe Checkout integration) — promo codes need to be applied during checkout.
- TASK-003 (launch channel strategy) — creator outreach is a key channel tactic.

## Open Questions
- Should each creator get a unique promo code (for attribution) or share a generic one?
- Is the 25% discount permanent for the subscriber's lifetime, or limited to the first N months?
- What's the creator compensation model — just the promo code, or is there a rev-share/affiliate component?
- How will promo code usage be tracked and reported back to creators?
