# ADR-028: Sell mobile Pro via Apple In-App Purchase (StoreKit 2), enabling international distribution

**Date:** 2026-07-17
**Status:** Accepted

---

## Context

ADR-027 (2026-07-16) decided the iOS app would sell Pro through an external Stripe Checkout link, legally viable only under the post-*Epic* US-storefront rules. That decision carried an explicit hard constraint: **US App Store storefront only**. Two things have changed the calculus:

- **International distribution is now a requirement.** Canadian users must be able to use the app. ADR-027's US-only scoping forbids this, and its own "Revisit Conditions" list "International distribution is desired" as the first trigger.
- **App Review risk avoidance.** The app already carries elevated review scrutiny from on-device screen-reading (live draft capture, ADR-019/020). Layering an external-payment flow — whose approval "varies reviewer-to-reviewer" per ADR-027's own risk section — compounds that risk. Using Apple's native purchase path removes the payments axis of review risk entirely.

Constraints that shape the new decision:

- All existing billing runs through Stripe via Supabase Edge Functions (ADR-001); both web and mobile derive tier from the `subscriptions` table, which `SubscriptionContext` reads (and the mobile app already subscribes to via realtime).
- One-person operation on minimal budget; Windows-only dev with EAS cloud builds (ADR-022), physical-iPhone testing.
- Pricing is $20/mo and $67/yr with promo-heavy discounting on the web ($15 effective via 25% codes).

## Decision

The iOS app sells Pro via **Apple In-App Purchase using StoreKit 2 directly** — client-side via `react-native-iap` (StoreKit 2 backend), with **no third-party entitlement vendor**. Purchases carry an `appAccountToken` (a UUID mapped to the Supabase user id). Apple's **App Store Server Notifications v2** are delivered to a **new Supabase Edge Function** that verifies the signed JWS transaction (against the App Store Server API / Apple root certificates) and upserts the existing `subscriptions` table, keyed by `appAccountToken` → Supabase user id. So an IAP purchase unlocks Pro on **both** the app and the website, and the current tier-derivation logic in `SubscriptionContext` stays unchanged on both platforms. The web app keeps Stripe unchanged. This **supersedes ADR-027**; the app is no longer scoped to the US storefront.

## Alternatives Considered

### Option A: Apple IAP via raw StoreKit 2, self-hosted transaction validation (chosen)

`react-native-iap` drives the native purchase sheet; App Store Server Notifications v2 → a new Supabase edge function verifies signed transactions and upserts `subscriptions`, linked by `appAccountToken`.

- **Pros:** Ships in every storefront including Canada — unblocks the actual requirement; native purchase sheet, zero external-payment review risk; **no third-party dependency or revenue-share ceiling** — full control of the billing stack; one entitlement table still feeds both web and mobile, so `SubscriptionContext` and web gating are untouched.
- **Cons:** Apple takes 15% (Small Business Program) vs Stripe's ~3%; **we permanently own** receipt/JWS validation, the renewal/notification state machine, and sandbox/production edge cases — real defect surface for a solo dev; slower to ship than a managed SDK.

### Option B: Apple IAP via RevenueCat

Managed SDK (`react-native-purchases`) wraps StoreKit and owns validation + server notifications; its webhook writes `subscriptions`.

- **Pros:** Least plumbing — RevenueCat owns receipt validation and App Store Server Notifications; clean entitlement API + webhooks; free under ~$2.5k/mo revenue.
- **Cons:** Adds a permanent third-party dependency and SaaS account in the critical billing path; revenue-share ceiling above the free tier; another vendor to trust with entitlement data. Rejected in favor of owning the stack.

### Option C: Keep ADR-027 (external Stripe link), add per-region gating

Stay on Stripe checkout, hide the upgrade UI outside the US.

- **Pros:** Zero commission; no new system.
- **Cons:** Canadian users still cannot subscribe — fails the requirement outright; keeps the external-payment review risk on an already-scrutinized app. Non-starter.

### Option D: Apple IAP but iOS-only entitlement (no web sync)

IAP unlocks Pro only in the app; web unaffected.

- **Pros:** No notification/edge-function sync work.
- **Cons:** An iPhone subscriber paying $20/mo gets nothing on the website — a confusing, support-generating split for a product whose core analytics live on the web. Rejected in favor of the small sync effort in Option A.

## Consequences

### Positive

- The app can ship to Canada (and other storefronts) — the blocking requirement is resolved.
- No external-payment flow for a reviewer to challenge; review risk narrows to the screen-capture feature alone.
- The `subscriptions` table stays the single source of truth; `SubscriptionContext` tier derivation and all web gating are unchanged; a purchase on either platform unlocks both.
- **No third-party billing vendor** — no new SaaS account, no revenue-share ceiling, full control of the billing stack.

### Negative

- **15% Apple commission** on iOS-originated subscriptions (~$17 net on $20/mo) vs ~$19.40 via Stripe.
- **Stripe promo codes do not apply to iOS purchases.** iOS v1 shows plain pricing with no promo field; the web keeps full promo support. Apple Offer Codes are a documented future path, not in this pass.
- **We own the receipt/notification plumbing permanently** — JWS signature verification, App Store Server Notifications v2 handling (`SUBSCRIBED` / `DID_RENEW` / `DID_CHANGE_RENEWAL_STATUS` / `EXPIRED` / `REFUND`), and sandbox-vs-production routing all live in our edge function.
- "Manage subscription" must branch by purchase origin (Apple-purchased → Apple's subscription management URL; Stripe-purchased → existing billing portal), and a required **Restore Purchases** action must be added.

### Risks

- **Entitlement-sync lag or failure:** if the notification → edge-function write fails, a paying iOS user could be stuck on Free. Mitigation: the client verifies its own StoreKit 2 transaction and gates the app immediately post-purchase; the edge-function write is the durable cross-platform path, with a client-initiated "sync my purchases" fallback that re-posts the current transaction.
- **Account-linking correctness:** the `appAccountToken` must be set to the authenticated Supabase user id at purchase time; a missing/wrong token orphans the transaction from the account. Mitigation: never purchase without an authenticated session; persist the token→user mapping when the transaction is first seen.
- **Validation correctness:** JWS/notification verification is security-sensitive and easy to get subtly wrong (e.g., trusting an unverified payload). Mitigation: verify against Apple's root certificates and the documented signed-payload format; test with the App Store sandbox and the notification test endpoint before production.
- **Double-billing edge case:** a user could subscribe on both web (Stripe) and iOS (Apple). Mitigation: detect an existing active `subscriptions` row and surface "already subscribed" before purchase; document the manual refund path.

## Revisit Conditions

- The self-hosted validation burden proves too costly to maintain — reconsider RevenueCat (Option B).
- Apple Offer Codes become worth implementing to restore promo parity on iOS.
- iOS subscription volume grows enough that 15% materially outweighs the review/international benefits.

## Related

- Supersedes: ADR-027 (external Stripe Checkout link)
- ADRs: ADR-001 (Stripe via Supabase Edge Functions), ADR-022 (Expo/EAS shell), ADR-019/020 (screen-capture review context)
- Tasks: TASK-343 (ADR-027 implementation, to be reworked); a new implementation task will follow this ADR

---
*Approved by: developer, 2026-07-17*
