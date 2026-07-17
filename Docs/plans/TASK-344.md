# TASK-344: Mobile Pro via Apple In-App Purchase (StoreKit 2) — ADR-028, replaces mobile Stripe checkout

**Status:** Pending Approval
**Priority:** P2

---

## Objective

Implement ADR-028: the iOS app sells Pro through native StoreKit 2 in-app purchase instead of the ADR-027 external Stripe Checkout link, so the app can distribute internationally (Canada) and carries no external-payment App Review risk. Apple entitlements sync into the shared Supabase `subscriptions` table (keyed by `appAccountToken` = Supabase `user_id`) so a purchase on either platform unlocks Pro on both, with the existing tier-derivation logic untouched. The web app keeps Stripe unchanged.

## Verification Criteria

1. On a physical iPhone (dev/sandbox build), a signed-in Free user taps **Upgrade to Pro**, completes the **native Apple purchase sheet** with a sandbox tester, and the app flips to Pro **without ever leaving the app** — no browser sheet or Stripe checkout appears anywhere in the mobile flow.
2. That same sandbox purchase unlocks Pro on **BestBallExposures.com** for the same account — i.e., the Apple entitlement reached the shared `subscriptions` table.
3. **Restore Purchases** returns Pro after a reinstall, and **Manage subscription** routes by origin: an Apple purchaser lands on Apple's subscription-management screen, a web/Stripe purchaser still opens the Stripe billing portal.

## Verification Approach

**Automated / command steps:**

- `cd mobile-app && npm install` succeeds with `react-native-iap` added; `npm run lint` clean.
- EAS dev build (`npm run eas:dev`) completes; confirm the `.ipa` links StoreKit (per the peer-dep/Frameworks check in `project_mobile_peer_dep_autolink`) and installs on device.
- Deploy the two new edge functions (`supabase functions deploy apple-notifications` and `sync-apple-purchase`) and run migration `017` in the SQL editor; confirm `subscriptions` now has `provider` and `apple_original_transaction_id` columns (`\d public.subscriptions`).
- From App Store Connect, **"Request a Test Notification"** → confirm `apple-notifications` returns 200 and (for a real sandbox transaction) writes a row with `provider='apple'`, correct `apple_original_transaction_id`, `status='active'`, and a populated `current_period_end`.

**On-device (sandbox) observations — require the developer + a physical iPhone (no Mac; ADR-022):**

- Sandbox purchase → tier flips to Pro in-app immediately (local verified StoreKit transaction), and a `provider='apple'` row appears within seconds (via `sync-apple-purchase`). Sign into the web app as the same user → Pro unlocked (criterion 2).
- Delete + reinstall the app, sign in, tap **Restore Purchases** → Pro returns (criterion 3a).
- Confirm **Manage subscription** opens Apple's management screen for the Apple purchaser; verify a Stripe-origin account still opens the billing portal (criterion 3b).
- Sandbox accelerated renewal → `DID_RENEW` advances `current_period_end`; let it lapse → `EXPIRED` flips `status` and the app drops to Free.
- Run **Delete account** on an Apple-subscribed account → it completes (no 502), removes the local row, and surfaces the "cancel your subscription in iOS Settings" note; verify no Stripe cancel was attempted.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/017_add_apple_provider_to_subscriptions.sql` | Create | `ALTER TABLE public.subscriptions ADD COLUMN provider text default 'stripe'` and `apple_original_transaction_id text unique`; index on the new column. Pre-2026-10-30 table → no new Data-API grants. |
| `supabase/functions/_shared/appleJws.ts` | Create | Shared helper: verify Apple's JWS/`x5c` signed payloads against Apple root certs; decode `signedPayload` → `notificationType`/`subtype`, `signedTransactionInfo`, `signedRenewalInfo`. Used by both new functions. |
| `supabase/functions/apple-notifications/index.ts` | Create | App Store Server Notifications v2 endpoint (Deno.serve, service-role admin client pattern like `stripe-webhook`). Verify JWS, read `appAccountToken` as `user_id`, upsert `subscriptions` (`onConflict: apple_original_transaction_id`) mapping `SUBSCRIBED`/`DID_RENEW`/`DID_CHANGE_RENEWAL_STATUS`/`EXPIRED`/`REFUND` → status + `current_period_end`. Idempotent; handles Sandbox + Production `environment`. |
| `supabase/functions/sync-apple-purchase/index.ts` | Create | JWT-authed (anon-client `getUser()`); client posts its verified StoreKit 2 transaction JWS; validate via `_shared/appleJws.ts`, confirm `appAccountToken === user.id`, upsert the same row. Backs immediate cross-platform unlock and Restore. |
| `supabase/functions/delete-account/index.ts` | Modify | Skip Stripe cancellation for `provider='apple'` rows (Apple subs can't be canceled server-side); still delete the local `subscriptions` row; don't 502 on Apple rows. |
| `mobile-app/package.json` | Modify | Add `react-native-iap` (confirm SDK 57 compatibility at install; see Open Questions). |
| `mobile-app/app.json` | Modify | Add the `react-native-iap` Expo config plugin to `plugins`; enable StoreKit capability for the iOS target. |
| `mobile-app/eas.json` | Modify | Remove `EXPO_PUBLIC_STRIPE_PRO_MONTHLY/YEARLY_PRICE_ID` from mobile profiles; add Apple product-ID env if not hardcoded in config. |
| `mobile-app/shared/config.js` | Modify | Add `APPLE_PRO_MONTHLY_PRODUCT_ID` / `APPLE_PRO_YEARLY_PRODUCT_ID` and `APPLE_MANAGE_SUBSCRIPTIONS_URL`; remove `STRIPE_PRO_*_PRICE_ID`, `CHECKOUT_RETURN_URL`, `CHECKOUT_DEEP_LINK`. |
| `mobile-app/src/iap.js` | Create | Thin `react-native-iap` wrapper: init/end connection, load subscription products, `requestSubscription` with `appAccountToken = user.id`, `finishTransaction`, `getAvailablePurchases` (restore), read current verified entitlement. |
| `mobile-app/src/contexts/SubscriptionContext.jsx` | Modify | Replace `startCheckout` with `purchasePro(productId)` (gate on local verified transaction, then POST `sync-apple-purchase` for the durable write); add `restorePurchases`; branch `openBillingPortal` by `provider`. Tier derivation unchanged. Drop deep-link imports. |
| `mobile-app/src/components/PlanPicker.jsx` | Modify | Remove promo-code UI and Stripe checkout; show the two StoreKit products (monthly $20 / annual $67, "Save 72%") and purchase via `purchasePro`. |
| `mobile-app/app/(tabs)/account.jsx` | Modify | Add the required **Restore Purchases** action; make **Manage subscription** branch by provider. |
| `mobile-app/app/checkout-return.jsx` | Delete | Deep-link return route is obsolete for in-process StoreKit. |
| `mobile-app/README.md` | Modify | Document the IAP purchase flow; replace the ADR-027 checkout description. |

## Implementation Approach

**Server first (so the client has endpoints to hit):**

1. **Migration 017** — add `provider` (default `'stripe'` so existing rows are correct) and `apple_original_transaction_id text unique`; add `create index ... on subscriptions(apple_original_transaction_id)`. No grants (existing table).
2. **`_shared/appleJws.ts`** — implement x5c chain verification to Apple's root CA and JWS payload decode. This is the security-sensitive core: never trust an unverified payload. Expose `verifyAndDecodeNotification(signedPayload)` and `verifyAndDecodeTransaction(jws)`.
3. **`apple-notifications`** — mirror `stripe-webhook`'s structure. Decode the notification; extract `appAccountToken` (→ `user_id`) and `originalTransactionId` from the transaction info; map `notificationType`/`subtype` to a status (`SUBSCRIBED`/`DID_RENEW` → `active`; `EXPIRED`/`REFUND`/`DID_CHANGE_RENEWAL_STATUS`+auto-renew-off-then-lapse → `canceled`/`expired`); set `current_period_end` from `expiresDate`. Upsert `onConflict: apple_original_transaction_id`. Return 200 to Apple even on unmapped types (ack). Skip + log rows with no `appAccountToken` (can't map to a user).
4. **`sync-apple-purchase`** — JWT-auth like the other functions; verify the posted transaction JWS; assert `appAccountToken === user.id` before writing; upsert the identical row shape. This gives immediate cross-platform unlock (the ASSN webhook can lag) and powers Restore.
5. **`delete-account`** — before the Stripe loop, filter to `provider='stripe'` rows for cancellation; delete all `subscriptions` rows for the user regardless of provider; ensure an Apple-only account never enters the Stripe branch (so it can't 502).

**Client:**

6. **`iap.js`** — wrap `react-native-iap`: `initConnection`/`endConnection`, `getSubscriptions([monthlyId, yearlyId])`, `requestSubscription({ sku, appAccountToken })`, `finishTransaction`, `getAvailablePurchases()` for restore, and a helper returning the current verified entitlement (product + expiry).
7. **`SubscriptionContext`** — new `purchasePro(productId)`: run the StoreKit purchase, on a verified transaction set an optimistic Pro gate immediately, `finishTransaction`, then POST the JWS to `sync-apple-purchase` and `refetchSubscription()`. `restorePurchases()`: `getAvailablePurchases()` → POST each to `sync-apple-purchase` → refetch. `openBillingPortal()`: if the active row's `provider==='apple'` open `APPLE_MANAGE_SUBSCRIPTIONS_URL`, else the existing Stripe portal. Keep `subscription`/`profile` reads and `tier` derivation exactly as-is.
8. **`PlanPicker`** — drop promo state and the `create-checkout-session` fetch; render the two products from StoreKit (fall back to static $20/$67 labels if products haven't loaded), Subscribe → `purchasePro`. Disable Subscribe when products/IDs are unavailable (mirrors today's empty-priceId guard).
9. **`account.jsx`** — add a "Restore Purchases" row (required by Apple); the existing `isProUser` gate already hides Upgrade and shows Manage, which covers the double-purchase case; make Manage call the branched `openBillingPortal`.
10. **`config.js` / `eas.json`** — swap Stripe price IDs/return URLs for Apple product IDs + manage URL. Delete `checkout-return.jsx`.
11. **Build + deploy + verify** per the Verification Approach.

**Edge cases:** duplicate ASSN deliveries (idempotent upsert); Sandbox vs Production environment in the notification (verify signature identically, label by `environment`); interrupted/legacy transactions with no `appAccountToken` (log + skip); StoreKit products failing to load (disabled Subscribe with a message); a user holding both a Stripe and an Apple active row (both rows coexist, `.limit(1)` still yields Pro — no logic change needed).

**Rollback:** the mobile changes ship only in a new EAS build — reverting the commit and rebuilding restores the Stripe-checkout flow. The migration is additive (new nullable/defaulted columns); the new edge functions are independent (removing their App Store Connect notification URL disables the sync without affecting Stripe). Web is untouched throughout.

## Dependencies

- **ADR-028** (Accepted).
- **Developer prerequisites in App Store Connect** (outside code; must be done before on-device verification):
  1. Create an auto-renewable **subscription group** with **monthly ($20)** and **annual ($67)** products; record their product IDs for `config.js`.
  2. Enroll in the **Small Business Program** (15% rate).
  3. Configure **App Store Server Notifications v2** production **and** sandbox URLs → the deployed `apple-notifications` function.
  4. Generate an **App Store Server API key** / obtain Apple root certs for JWS validation.
  5. Set App Store Connect **availability to include Canada / international** (remove the ADR-027 US-only restriction).
  6. Create a **sandbox tester** account for device testing.

## Open Questions

- **Library:** ADR-028 names `react-native-iap`. Confirm a version compatible with Expo SDK 57 / RN 0.86 at install; its Expo-native sibling `expo-iap` is the fallback if the config plugin has SDK-57 issues. (Implementation detail — does not change the ADR decision.)
- **Web cleanup (out of scope, defer):** `best-ball-manager/src/components/MobileCheckoutReturn.jsx` and its `/mobile/checkout-return` route become unused once mobile stops deep-linking. Leaving them is harmless; propose a separate web task to retire them rather than touching web code here.

## Handoff Notes

- **Tried:** Implemented all code — migration 017, `_shared/appleJws.ts` + `_shared/appleSubscription.ts`, `apple-notifications` and `sync-apple-purchase` functions, `delete-account` Apple-awareness, and the full mobile client (iap.js wrapper, SubscriptionContext, PlanPicker, account.jsx, config, README). Deleted `checkout-return.jsx`.
- **Result:** All changed mobile files parse clean (esbuild); edge functions parse clean (no local Deno for full type-check — they type-check on `supabase functions deploy`). No stale references to the retired Stripe/deep-link identifiers remain in `mobile-app/`.
- **Plan deviations (minor, Standard-tier acceptable):**
  1. `app.json` was NOT modified. `react-native-iap` v15 ships no Expo config plugin (verified in node_modules) — it autolinks via `react-native.config.js`/podspec during prebuild. Correct setup is the direct dep plus `react-native-nitro-modules` pinned as a direct dep (done) to avoid the peer-dep launch crash. The In-App Purchase capability is configured in the Apple Developer portal, not `app.json`.
  2. New deployment secret introduced: **`APPLE_ROOT_CA_G3`** (PEM or base64 DER of Apple Root CA - G3, from https://www.apple.com/certificateauthority/) must be set on the edge functions for JWS verification. This is the concrete form of plan prerequisite #4.
- **Next step:** Developer completes App Store Connect prerequisites (products with IDs matching `com.bestballexposures.app.pro.monthly` / `.yearly` in eas.json — adjust either side to match; Small Business Program; ASSN v2 URL → apple-notifications; sandbox tester; international availability), set the `APPLE_ROOT_CA_G3` secret, `supabase functions deploy apple-notifications sync-apple-purchase delete-account`, run migration 017, then EAS dev build → on-device sandbox verification per the Verification Approach.

---
*Approved by: developer, 2026-07-17*
