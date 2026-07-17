# ADR-027: Sell mobile Pro via external Stripe Checkout link (US storefront), not Apple In-App Purchase

**Date:** 2026-07-16
**Status:** Accepted

---

## Context

The iOS app (EPIC-08 shell, ADR-022) currently treats subscription checkout as a desktop hand-off: the upgrade button opens BestBallExposures.com in a browser where the user is not signed in. To sell Pro from the phone we must pick a purchase mechanism, and this is Apple-governed territory:

- Apple Guideline 3.1.1 historically required In-App Purchase (15–30% commission) for digital subscriptions.
- The April 2025 *Epic v. Apple* contempt ruling (upheld on appeal) forced Apple to amend the **US storefront** rules: apps may freely show buttons/links to external purchase mechanisms, with no commission, no entitlement, and no placement restrictions. Purchases complete outside the app (e.g., web checkout). Outside the US, the old IAP regime (or the restrictive external-link entitlements) still applies.
- All billing infrastructure is Stripe via Supabase Edge Functions (ADR-001): `create-checkout-session` already accepts `priceId`/`successUrl`/`cancelUrl`/`promoCode` with JWT auth; the `stripe-webhook` writes the `subscriptions` table; both web and mobile apps derive tier from that table, and the mobile app already listens for realtime updates.
- The product is US-only in practice (Underdog and DraftKings are US real-money fantasy platforms), pricing is $20/mo with 25% promo codes on minimal budget, and it's a one-person operation.

## Decision

The iOS app sells Pro through an in-app plan picker that opens the existing Stripe Checkout in a browser session (external purchase link) and deep-links back to the app. The app is distributed on the **US App Store storefront only**, which is what makes the external link compliant under post-Epic 3.1.1. No Apple IAP is implemented.

## Alternatives Considered

### Option A: External Stripe Checkout link, US storefront only (chosen)

In-app plan picker → `create-checkout-session` with the mobile JWT → Stripe Checkout in an `ASWebAuthenticationSession` sheet → hosted return page deep-links back → existing webhook/realtime flips the tier.

- **Pros:** Zero Apple commission at $20/mo margins; one billing system and one source of truth (`subscriptions` table) across web and mobile; reuses the deployed edge functions and promo-code machinery unchanged; web-purchased and app-purchased subscriptions are indistinguishable; ~a day of app work.
- **Cons:** Legally scoped to the US storefront — the app cannot expand internationally without revisiting this; checkout UX leaves the app for a browser sheet; App Review outcomes for external-purchase apps still vary reviewer-to-reviewer.

### Option B: Apple In-App Purchase (StoreKit 2)

Native IAP subscription products mirroring the Stripe tiers.

- **Pros:** Frictionless native purchase sheet; zero review risk; works in every storefront.
- **Cons:** 15–30% commission on a $20/mo product with promo-heavy pricing; a **second** subscription system (App Store Connect products, server receipt/notification validation, a parallel entitlement path in `SubscriptionContext` and the webhook-fed `subscriptions` table) permanently maintained by one person; Stripe promo codes don't apply; cross-platform management splits ("purchased on iPhone, cancel in iPhone settings"). Directly conflicts with the requirement that everything bill through the existing Stripe account.

### Option C: Status quo — desktop hand-off

Keep "Upgrade on the website."

- **Pros:** Zero work, zero review risk (cross-platform services may always honor externally purchased subscriptions).
- **Cons:** Worst conversion path imaginable for a mobile-first draft audience: leave the app, sign in again on a phone browser, checkout there. Doesn't satisfy the goal of purchasing via the app.

## Consequences

### Positive

- Mobile users can go free → paid in one sitting inside the app; the tier flips in seconds via infrastructure that already exists.
- Stripe remains the single billing system; support, refunds, promos, and analytics stay unified.
- The `delete-account` and billing-portal flows work identically for app-purchased and web-purchased subscribers.

### Negative

- **US-only distribution becomes a hard product constraint** enforced in App Store Connect availability settings. International expansion requires either IAP (Option B's costs) or per-region gating of the upgrade UI.
- Checkout happens in a browser sheet, not a native purchase sheet — slightly more friction than IAP.

### Risks

- **App Review variance:** a reviewer may still challenge the flow; mitigation is clear review notes citing the current US 3.1.1 text, and the fallback is hiding the button behind a remote flag while appealing (the rest of the app is unaffected).
- **Regulatory drift:** Apple has contested aspects of the ruling; if the US external-link allowance is narrowed, revisit this ADR (fallbacks: link-out entitlement regime or Option B).

## Revisit Conditions

- International distribution is desired.
- Apple's US external-purchase rules change materially.
- Subscription volume grows enough that IAP's commission is worth paying for native-sheet conversion gains.

## Related

- Tasks: TASK-343
- ADRs: ADR-001 (Stripe via Supabase Edge Functions), ADR-022 (Expo/EAS app shell); complements FEAT-031 (store readiness)

---
*Approved by: developer, 2026-07-16*
