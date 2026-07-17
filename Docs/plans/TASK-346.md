# TASK-346: Retire dead web MobileCheckoutReturn route (post-ADR-028)

**Status:** Draft
**Priority:** P4

---

## Objective
After ADR-028/TASK-344 moved mobile Pro to Apple IAP, the mobile app no longer deep-links through the web-hosted checkout return page. best-ball-manager/src/components/MobileCheckoutReturn.jsx and its /mobile/checkout-return route in App.jsx are now dead code. Remove both (web-only change; does not touch the Stripe web checkout flow itself).

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
