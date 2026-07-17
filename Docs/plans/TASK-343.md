# TASK-343: Mobile in-app Pro checkout: Stripe external checkout link with deep-link return + account polish

**Status:** Pending Approval
**Priority:** P2

---

## Objective

Let users purchase and manage the Pro subscription entirely from the iOS app against the existing Stripe account: an in-app plan picker calls the existing `create-checkout-session` edge function with the mobile session JWT, opens Stripe Checkout in an in-app browser session, and returns via the `bbexposures://` deep link with the tier flipping through the existing realtime `subscriptions` channel. Account creation/sign-in already exists on mobile (same Supabase project as the website, so accounts are inherently linked); this task closes the payment gap plus two account-surface gaps: in-app account deletion (App Review 5.1.1(v)) and Stripe cancellation inside the `delete-account` edge function.

Governed by ADR-027 (external Stripe purchase link on the US storefront under post-Epic-v-Apple Guideline 3.1.1 rules, instead of Apple In-App Purchase).

## Verification Criteria

1. **In-app purchase works end to end:** a signed-in Free user in the iOS app taps Upgrade, picks Monthly or Annual (promo code optional), completes payment on the Stripe Checkout page in the in-app browser sheet, the sheet closes automatically, and the Account tab shows Pro within seconds — without ever signing in on the website.
2. **In-app subscription management works:** a Pro user opens "Manage subscription" from the Account tab, lands in the Stripe billing portal already scoped to their customer, and any change (e.g. cancellation) is reflected in the app after returning.
3. **In-app account deletion works and is billing-safe:** a signed-in user can delete their account from the Account tab after an explicit confirmation; any active Stripe subscription is cancelled (visible in the Stripe dashboard) before the account data is removed, and the app returns to the signed-out state.

## Verification Approach

- **Static/build checks:** `cd mobile-app && npx expo export --platform ios` exits 0 (bundler compiles all touched files). `cd best-ball-manager && npm run lint && npm run build` exit 0 for the new web return route.
- **Checkout flow (Stripe test mode, no real charge):**
  1. Run the edge functions locally with a test-mode key: `supabase functions serve create-checkout-session create-portal-session delete-account stripe-webhook` with `STRIPE_SECRET_KEY=sk_test_…`, and `stripe listen --forward-to` the local `stripe-webhook`.
  2. Point a dev build at the local functions via `EXPO_PUBLIC_SUPABASE_URL` override and use `EXPO_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID`/`…_YEARLY_…` test-mode price IDs.
  3. Complete checkout with card `4242 4242 4242 4242`; confirm the `subscriptions` row is written by the webhook and the app tier flips to Pro without manual refresh; confirm the browser sheet dismisses via the deep-link return.
  4. Cancel path: back out of the Stripe page; confirm the app shows no tier change and no stuck "finalizing" state.
- **Portal flow:** with the test subscription active, open Manage subscription; cancel at period end in the portal; return; confirm status updates after refetch.
- **Deletion flow:** delete the test account; confirm in the Stripe test dashboard that the subscription is cancelled, the `subscriptions`/`profiles` rows are gone, the auth user is deleted, and the app lands signed-out.
- **Deep-link fallback:** open the hosted return page in plain Safari (not the auth sheet) and confirm the "Return to the app" button opens the app to the Account tab (`mobile-app/app/checkout-return.jsx` route).
- **Steps that require the developer (manual):**
  1. Supply the live Stripe price IDs for `shared/config.js` defaults (same values as Vercel's `VITE_STRIPE_PRO_MONTHLY_PRICE_ID` / `VITE_STRIPE_PRO_YEARLY_PRICE_ID`).
  2. `supabase functions deploy delete-account` after merge (edge functions deploy manually per project convention).
  3. Deploy the web return page (normal Vercel deploy of `best-ball-manager`).
  4. One real-device TestFlight pass of the purchase flow (live mode — use a promo code, then refund/cancel from the Stripe dashboard).
  5. In App Store Connect: confirm app availability is United States only (the ADR-027 compliance boundary) and add the external-purchase note to the App Review notes for FEAT-031.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `mobile-app/shared/config.js` | Modify | Add `STRIPE_PRO_MONTHLY_PRICE_ID` / `STRIPE_PRO_YEARLY_PRICE_ID` (with `EXPO_PUBLIC_*` overrides) and `CHECKOUT_RETURN_URL`; update the "desktop companion" comment |
| `mobile-app/src/contexts/SubscriptionContext.jsx` | Modify | Add `startCheckout(priceId, {promoCode})`, `openBillingPortal()`, `refetchSubscription()`, and a `checkoutFinalizing` state; retire `openUpgradeOnWeb` / `openBillingOnWeb` |
| `mobile-app/src/components/PlanPicker.jsx` | Create | Native plan sheet (Monthly $20 / Annual $67, promo code field, Pro feature bullets) that launches `startCheckout` — port of the web `PlanPicker.jsx` |
| `mobile-app/src/components/LockedFeature.jsx` | Modify | Signed-in CTA becomes "Upgrade to Pro" opening the in-app PlanPicker instead of the website |
| `mobile-app/app/(tabs)/account.jsx` | Modify | Upgrade CTA opens PlanPicker; "Manage subscription" opens the billing portal; add Delete account row with typed confirmation; update copy/help text (checkout is no longer a desktop step) |
| `mobile-app/app/checkout-return.jsx` | Create | Deep-link landing route for `bbexposures://checkout-return` — immediately redirects to the Account tab (covers the plain-Safari breakout case) |
| `best-ball-manager/src/components/MobileCheckoutReturn.jsx` | Create | Hosted `https` return page for Stripe success/cancel/portal-return URLs — JS-redirects to `bbexposures://checkout-return?status=…` with a manual "Return to the app" fallback button |
| `best-ball-manager/src/App.jsx` | Modify | Register the `/mobile/checkout-return` route (public, no auth) |
| `supabase/functions/delete-account/index.ts` | Modify | Cancel any active Stripe subscription (Stripe `DELETE /v1/subscriptions/{id}`) before deleting `subscriptions`/`profiles` rows and the auth user |
| `mobile-app/README.md` | Modify | Remove checkout from the desktop hand-off list |
| `CLAUDE.md` | Modify | Update the mobile-app section line "desktop hand-offs for roster sync, checkout, and CSV upload" → drop checkout |

## Implementation Approach

1. **ADR-027 first.** No code until the ADR (external Stripe checkout link, US storefront) is approved — it sets the compliance boundary this plan builds on.
2. **Config (`shared/config.js`):** price IDs are publishable identifiers (like the anon key), so hardcoded defaults with `EXPO_PUBLIC_*` overrides match the existing pattern. `CHECKOUT_RETURN_URL` = `` `${WEB_APP_URL}/mobile/checkout-return` ``.
3. **Checkout (`SubscriptionContext.jsx`):**
   - `startCheckout(priceId, {promoCode})`: get `session.access_token`, POST `${SUPABASE_FUNCTIONS_URL}/create-checkout-session` with `Authorization: Bearer` + `apikey` headers (mirrors the web call) and `successUrl`/`cancelUrl` pointing at `CHECKOUT_RETURN_URL?status=success|canceled`. **No edge-function changes needed** — it already accepts `successUrl`, `cancelUrl`, `promoCode` and resolves existing Stripe customers.
   - Open the returned Checkout URL with `WebBrowser.openAuthSessionAsync(url, 'bbexposures://checkout-return')` so the sheet auto-dismisses when the hosted return page redirects to the app scheme. Stripe requires `https` success URLs, which is why the hosted return page exists rather than a direct deep link.
   - On success return, set `checkoutFinalizing` and poll the `subscriptions` table (every 2s, ~20s cap) as a belt alongside the existing realtime channel (webhook write can lag the redirect by a few seconds). Clear the state on tier flip, timeout, or cancel.
   - `trackEvent('subscription_checkout_started')` parity with web; add `subscription_checkout_completed` on tier flip.
4. **Billing portal:** `openBillingPortal()` POSTs `create-portal-session` with `returnUrl = CHECKOUT_RETURN_URL?status=portal`, opens via the same auth-session pattern, and calls `refetchSubscription()` on return.
5. **PlanPicker (native):** modal/bottom sheet mirroring the web component's plans object (`monthly: $20/mo`, `seasonal: $67/yr`), a promo code input passed through to `startCheckout` (the edge function resolves it or falls back to `allow_promotion_codes`), and a short Pro feature list. Opened from Account tab and `LockedFeature`.
6. **Hosted return page (web):** public route `/mobile/checkout-return`; on mount attempts `window.location = 'bbexposures://checkout-return?status=…'` and renders status-appropriate copy with a manual "Return to the Best Ball Exposures app" link. No auth, no data access; excluded from tab navigation.
7. **Mobile deep-link route:** `app/checkout-return.jsx` uses `router.replace('/(tabs)/account')` — only reached if the user broke out of the auth sheet into Safari; the normal path is intercepted by `openAuthSessionAsync`.
8. **Account deletion:** Account tab gains a "Delete account" row (danger styling) → native `Alert` requiring explicit confirmation → POST `delete-account` with the JWT → on success `clearAllData()` + local sign-out. Edge function change: before deleting rows, read the user's `subscriptions` row and cancel the active Stripe subscription immediately via the Stripe API; tolerate absent/already-cancelled subscriptions. This closes a pre-existing gap that would otherwise let a deleted account keep billing with no portal access.
9. **Copy pass:** Account help text, README, and CLAUDE.md all currently state checkout is a desktop step — update all three so the docs match behavior.
10. **Out of scope (deliberate):** Sign in with Apple (not required while only email/password login is offered; adding any third-party login would trigger the requirement), Apple IAP fallback for non-US storefronts (app remains US-only per ADR-027), email-confirmation deep-linking polish, and Android.

## Dependencies

- ADR-027 approved (proposed alongside this plan).
- Developer-supplied live Stripe price IDs (already exist as Vercel env vars for the web build).

## Open Questions

None blocking. Bounded choices resolved in this plan: `openAuthSessionAsync` over `openBrowserAsync`+Linking listener (automatic sheet dismissal, no global listener lifecycle); hosted `https` return page over direct custom-scheme success URL (Stripe requires `https`); US-only distribution over regional in-app gating (simpler, matches the product's US-only fantasy market).

## Handoff Notes

- Tried: full implementation completed 2026-07-16 (all 11 files in Files to Change).
- Result: automated checks pass — `npx expo export --platform ios` exit 0; web `npm run lint` clean on the two touched web files (4 pre-existing errors elsewhere in `src/contexts/AuthContext.jsx`, untouched); `npm run build` + blog/arena prerender succeed.
- Blocker: manual verification steps outstanding (Stripe test-mode end-to-end on a dev build, live price IDs into EAS env, `supabase functions deploy delete-account`, Vercel deploy, App Store Connect US-only availability).
- Next step: developer runs the manual steps in Verification Approach; then reflection + close.

---
*Approved by:*
