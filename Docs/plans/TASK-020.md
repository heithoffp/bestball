# TASK-020: Design first-week free trial promotion

**Status:** Draft
**Priority:** P2

---

## Objective
Define and document a refund-based "first week free trial" promotion for the Pro plan. Users subscribe at $20/month and can request a 100% refund within the first 7 days — lowering the barrier to trying the product. This task covers the implementation approach (Stripe trial period vs. refund policy vs. manual workflow), the promotion window, user-facing messaging, and any required UI changes to surface the trial offer during signup.

## Dependencies
- TASK-013 (Stripe Checkout integration) — must be complete so there's a payment flow to layer the trial onto.
- TASK-003 (launch channel strategy) — trial promotion is a tactic within the broader launch plan.

## Open Questions
- Should this use Stripe's built-in trial period feature (no charge for 7 days, then auto-bill) or a charge-then-refund model? Trial periods are simpler but behave differently in Stripe billing.
- Is the trial a permanent offering or a time-limited launch promotion?
- What happens if a user cancels during the trial — automatic refund, or do they need to request it?
